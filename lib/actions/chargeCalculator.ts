"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { generateText, Output } from "ai";
import { openai } from "@ai-sdk/openai";
import prisma from "@/lib/prisma";
import { LISTED } from "@/lib/productFamily";
import { GAS_MARKS, normalizeMark, productHasGasMark, type GasMark } from "@/lib/gasMarks";
import { isPurchasable } from "@/lib/waitlist";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import { ChargeWireSchema, chargeFromWire, type ChargeExtraction } from "@/lib/chargeSchema";
import { parseChargeLocally } from "@/lib/chargeFastPath";
import { withAiCache, normaliseInput } from "@/lib/ai/cache";
import { MAX_OUTPUT, logAiUsage, usageOf } from "@/lib/ai/budget";
import {
  DEFAULT_LIQUID_LINE,
  DEFAULT_RATED_LENGTH_M,
  G_PER_OZ,
  KG_PER_LB,
  M_PER_FT,
  autoChargePerMeterG,
  computeCharge,
  type ChargeResult,
  type CylinderOption,
  type LiquidLineSize,
} from "@/lib/chargeCalc";

/**
 * System Charge Calculator — the reading half.
 *
 * The engineer's sentence ("Daikin FTXM35R, 15 m line set") becomes fields —
 * locally when it can be read without doubt, by gpt-4o otherwise — copying values and units exactly as written. It does no
 * arithmetic and no unit conversion — this file converts anything imperial
 * to metric, so the card is m / kg / g/m whatever was typed — and it never
 * supplies a number that
 * wasn't in the sentence: the factory charge in particular is a nameplate
 * value, and a guessed one would put a wrong charge into a real system. The
 * one thing it may infer is the refrigerant from a model it recognises, and
 * that is marked as inferred on the card for the engineer to confirm.
 *
 * Every figure is computed by lib/chargeCalc on the way out.
 */


/** Where each input on the card came from — the card shows it beside the value. */
export type Provenance = "stated" | "inferred" | "default" | "missing";

export interface ChargeCalculation {
  query: string;
  brand: string | null;
  model: string | null;
  refrigerant: { mark: GasMark | null; label: string | null; source: Provenance };
  capacity: { asWritten: string | null };
  lineSetLengthM: number;
  ratedLength: { m: number; source: Provenance };
  liquidLine: { size: LiquidLineSize; source: Provenance };
  chargePerMeterG: { value: number | null; source: Provenance };
  factoryChargeKg: { value: number | null; source: Provenance };
  result: ChargeResult;
  /** Purchasable cylinders of this refrigerant, for the cart suggestion. */
  cylinders: CylinderOption[];
  /** GWP of the refrigerant from the catalog, for the CO₂e line; null when unknown. */
  gwp: number | null;
}

export type CalculateChargeResult =
  | { ok: true; calc: ChargeCalculation }
  | { ok: false; code: "INVALID_INPUT" | "NOT_A_CHARGE_QUESTION" | "MISSING_LENGTH" | "OUT_OF_RANGE" | "RATE_LIMITED" | "UNAVAILABLE"; field?: ChargeField };

/** Which input failed the plausibility check — a code; the client words it in the user's language. */
export type ChargeField = "lineSet" | "rated" | "rate" | "factory";

const Query = z.string().trim().min(3).max(300);
// Imperial input is read as written and converted here, exactly.
const toM = (l: { value: number; unit: "m" | "ft" }) => (l.unit === "ft" ? l.value * M_PER_FT : l.value);
const toKg = (parts: { value: number; unit: "kg" | "g" | "lb" | "oz" }[]) =>
  parts.reduce((kg, p) => kg + (p.unit === "kg" ? p.value : p.unit === "g" ? p.value / 1000 : p.unit === "lb" ? p.value * KG_PER_LB : (p.value * G_PER_OZ) / 1000), 0);
const toGPerM = (r: { value: number; unit: "g/m" | "oz/ft" }) => (r.unit === "g/m" ? r.value : (r.value * G_PER_OZ) / M_PER_FT);

// The model fills compact keys (ChargeWireSchema); the rules live here, once.
const SYSTEM = `Extract fields from an HVAC engineer's split-system description for a refrigerant charge calculation. Copy numbers and units as written: no conversion, no arithmetic. Never supply a value not in the text (null).
Keys: q=describes a system whose charge can be calculated; b=brand; m=model no.; r=refrigerant (R-32, R-410A…): as written (rs "s"); if not written, the only inference allowed is the refrigerant of a model number you recognise with confidence (rs "i"); if unsure, null; cap=capacity as written (3.5 kW, 12 000 BTU); len=total line-set length ("15 m line set", "pipe run 12 m", "40 ft lineset"); ll=liquid line OD only if stated (mm: 6.35→1/4, 7.94→5/16, 9.52→3/8, 12.7→1/2, 15.88→5/8); fc=factory/nameplate charge only if stated ("3 lb 8 oz" → two parts); rl=length the factory charge covers, only if stated; cpl=extra charge per length only if stated (20 g/m, 0.6 oz/ft).`;

/** Bump when SYSTEM or ChargeWireSchema changes: cached answers of the old prompt are never served. */
const CACHE_VERSION = 4;

/**
 * Sentence → fields, cheapest first:
 *   1. lib/chargeFastPath — local, 0 tokens (every preset chip, every
 *      sentence whose numbers it fully accounts for);
 *   2. the content-hash cache — 0 tokens for a sentence already answered;
 *   3. the model (gpt-4o — see below — ≤300 output tokens, compact schema).
 */
async function extract(query: string): Promise<ChargeExtraction> {
  const local = parseChargeLocally(query);
  if (local) {
    logAiUsage({ feature: "charge-calc", source: "fast-path" });
    return local;
  }
  // gpt-4o, not mini, for this one: the fallback's job is the sentence the
  // local reader couldn't do — typically a model number whose refrigerant
  // must be inferred. Measured: mini returned no refrigerant for a Daikin
  // FTXM35R (gpt-4o: R-32), and with looser wording named R-32 for an
  // R-410A unit — a wrong gas in a real system. Standard sentences never
  // get here (lib/chargeFastPath), repeats come from the cache.
  const llm = process.env.CHARGE_CALC_MODEL?.trim() || "gpt-4o";
  const { value } = await withAiCache<ChargeExtraction>(
    { feature: "charge-calc", version: CACHE_VERSION, parts: [llm, normaliseInput(query)], ttlSeconds: 30 * 86_400 },
    async () => {
      const result = await generateText({
        model: openai(llm),
        system: SYSTEM,
        prompt: query,
        output: Output.object({ schema: ChargeWireSchema }),
        temperature: 0,
        maxOutputTokens: MAX_OUTPUT.chargeExtraction,
        // A stuck model call must not leave the engineer on "Calculating…".
        abortSignal: AbortSignal.timeout(25_000),
        maxRetries: 1,
      });
      logAiUsage({ feature: "charge-calc", model: llm, source: "model", ...usageOf(result) });
      return { value: chargeFromWire(result.output), cacheable: true };
    }
  );
  return value;
}

export async function calculateCharge(rawQuery: string): Promise<CalculateChargeResult> {
  const parsed = Query.safeParse(rawQuery);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };

  // Public form: 10 a minute per address is generous for a person. Counted
  // before the fast path too — it still reads the catalog.
  const ip = clientIp(await headers());
  if (!checkRateLimit(`charge-calc:${ip}`, { limit: 10, windowMs: 60_000 }).success) return { ok: false, code: "RATE_LIMITED" };

  let x: ChargeExtraction;
  try {
    x = await extract(parsed.data);
  } catch (error) {
    console.error("[charge-calc] extraction failed:", error);
    return { ok: false, code: "UNAVAILABLE" };
  }

  if (!x.isChargeQuestion) return { ok: false, code: "NOT_A_CHARGE_QUESTION" };
  if (!x.lineSetLength) return { ok: false, code: "MISSING_LENGTH" };

  // ── Normalise to metric, with every default named ──
  const lineSetLengthM = toM(x.lineSetLength);
  const ratedLength = x.ratedLength
    ? { m: toM(x.ratedLength), source: "stated" as const }
    : { m: DEFAULT_RATED_LENGTH_M, source: "default" as const };
  const liquidLine = x.liquidLineSize
    ? { size: x.liquidLineSize, source: "stated" as const }
    : { size: DEFAULT_LIQUID_LINE, source: "default" as const };
  // The same "Auto" rate the card shows (lib/chargeCalc): liquid density ×
  // bore for the refrigerants it knows, the manual's typical figure otherwise.
  const autoRate = autoChargePerMeterG(x.refrigerant, liquidLine.size);
  const chargePerMeterG =
    x.chargePerLength !== null
      ? { value: toGPerM(x.chargePerLength), source: "stated" as const }
      : autoRate
        ? { value: autoRate.value, source: "default" as const }
        : { value: null, source: "missing" as const };
  const factoryChargeKg =
    x.factoryCharge && x.factoryCharge.length > 0
      ? { value: toKg(x.factoryCharge), source: "stated" as const }
      : { value: null, source: "missing" as const };

  // Plausibility, so a misread ("400 m", "2 g/m") is refused, not computed.
  const bad: ChargeField | null =
    !(lineSetLengthM > 0 && lineSetLengthM <= 150) ? "lineSet" :
    !(ratedLength.m >= 0 && ratedLength.m <= 30) ? "rated" :
    chargePerMeterG.value !== null && !(chargePerMeterG.value >= 5 && chargePerMeterG.value <= 300) ? "rate" :
    factoryChargeKg.value !== null && !(factoryChargeKg.value > 0 && factoryChargeKg.value <= 100) ? "factory" :
    null;
  if (bad) return { ok: false, code: "OUT_OF_RANGE", field: bad };

  // The refrigerant must be one we can name in the catalog to link to it.
  const mark = x.refrigerant ? (GAS_MARKS.find((m) => normalizeMark(m) === normalizeMark(x.refrigerant!)) ?? null) : null;

  const ofGas = mark
    ? (await prisma.product.findMany({ where: { ...LISTED, category: { in: ["cylinders", "blends"] } } })).filter((p) => productHasGasMark(p, mark))
    : [];
  const cylinders: CylinderOption[] = ofGas
    .filter((p) => isPurchasable(p) && p.pricePerKg > 0)
    .map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      weightLabel: p.weight,
      weightKg: p.weightKg,
      pricePerKg: p.pricePerKg,
      cylinderDeposit: Number(p.cylinderDeposit),
      // Live on-hand count: a 20-system job must not be offered more
      // cylinders of a size than the shelf holds (lib/chargeCalc pickCylinders).
      stock: p.stockQuantity,
    }));
  // The catalog's own GWP column for this gas — the card's CO₂e figure.
  // Null (and no CO₂e shown) when the gas isn't one we stock, e.g. R-290.
  const gwp = ofGas.find((p) => p.gwp !== null)?.gwp ?? null;

  return {
    ok: true,
    calc: {
      query: parsed.data,
      brand: x.brand,
      model: x.model,
      refrigerant: { mark, label: x.refrigerant, source: x.refrigerant ? (x.refrigerantSource ?? "inferred") : "missing" },
      capacity: { asWritten: x.capacityAsWritten },
      lineSetLengthM,
      ratedLength,
      liquidLine,
      chargePerMeterG,
      factoryChargeKg,
      result: computeCharge({
        lineSetLengthM,
        ratedLengthM: ratedLength.m,
        chargePerMeterG: chargePerMeterG.value,
        factoryChargeKg: factoryChargeKg.value,
      }),
      cylinders,
      gwp,
    },
  };
}
