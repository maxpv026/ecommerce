import { z } from "zod";
import { LIQUID_LINE_SIZES } from "@/lib/chargeCalc";

/**
 * What gpt-4o extracts from an engineer's description for the System Charge
 * Calculator (lib/actions/chargeCalculator). Its own module because a
 * "use server" file may only export async functions.
 *
 * Every field is copied as written, with its unit, or null. The model does
 * no unit conversion and no arithmetic — the server converts to metric — so
 * "12 m", "40 ft", "1.6 kg" and "3 lb 8 oz" are all read faithfully and the
 * card still shows metres and kilograms. It never supplies a number that
 * wasn't in the text. Nullable rather than optional: structured outputs
 * require every key to be present.
 */

const LengthSchema = z.object({ value: z.number(), unit: z.enum(["m", "ft"]) });

export const ChargeExtractionSchema = z.object({
  isChargeQuestion: z
    .boolean()
    .describe("Text describes a system/line set whose charge can be calculated."),
  brand: z.string().nullable().describe("Manufacturer as written."),
  model: z.string().nullable().describe("Model number as written."),
  refrigerant: z
    .string()
    .nullable()
    .describe("e.g. R-32, R-410A; as written or inferred from the model."),
  refrigerantSource: z
    .enum(["stated", "inferred"])
    .nullable()
    .describe("stated | inferred; null if refrigerant is null."),
  capacityAsWritten: z.string().nullable().describe("Capacity as written, e.g. 3.5 kW, 12 000 BTU."),
  lineSetLength: LengthSchema.nullable().describe("Total line-set length as written."),
  liquidLineSize: z
    .enum(LIQUID_LINE_SIZES)
    .nullable()
    .describe("Liquid line OD if stated; mm → inches (6.35→1/4, 7.94→5/16, 9.52→3/8, 12.7→1/2, 15.88→5/8)."),
  factoryCharge: z
    .object({ value: z.number(), unit: z.enum(["kg", "g", "lb", "oz"]) })
    .array()
    .nullable()
    .describe("Factory/nameplate charge only if stated, as written; '3 lb 8 oz' → two parts."),
  ratedLength: LengthSchema.nullable().describe("Length the factory charge covers, only if stated (pre-charged for 7.5 m)."),
  chargePerLength: z
    .object({ value: z.number(), unit: z.enum(["g/m", "oz/ft"]) })
    .nullable()
    .describe("Extra charge per length only if stated (20 g/m, 0.6 oz/ft)."),
});

export type ChargeExtraction = z.infer<typeof ChargeExtractionSchema>;

// ── Wire format: what the model actually fills (compact keys, no per-field prose) ──
//
// The JSON schema is sent with every call; the long field names and
// descriptions above made it ~650 tokens. The model fills these short keys
// instead (rules live in the system prompt, lib/actions/chargeCalculator),
// and `fromWire` turns them into ChargeExtraction for the rest of the code.

const W_LEN = z.object({ v: z.number(), u: z.enum(["m", "ft"]) });

export const ChargeWireSchema = z.object({
  q: z.boolean(),
  b: z.string().nullable(),
  m: z.string().nullable(),
  // The one field that keeps its description: without it, measured on
  // 2026-11-12, the model stopped inferring the refrigerant from a model
  // number it knows (Daikin FTXM35R → R-32) — the calculator's one inference.
  r: z.string().nullable().describe("Refrigerant, e.g. R-32, R-410A: as written, or inferred from a model number you recognise. Null if neither."),
  rs: z.enum(["s", "i"]).nullable().describe("s = text names it, i = inferred from the model"),
  cap: z.string().nullable(),
  len: W_LEN.nullable(),
  ll: z.enum(LIQUID_LINE_SIZES).nullable(),
  fc: z.array(z.object({ v: z.number(), u: z.enum(["kg", "g", "lb", "oz"]) })).nullable(),
  rl: W_LEN.nullable(),
  cpl: z.object({ v: z.number(), u: z.enum(["g/m", "oz/ft"]) }).nullable(),
});

export type ChargeWire = z.infer<typeof ChargeWireSchema>;

export function chargeFromWire(w: ChargeWire): ChargeExtraction {
  return {
    isChargeQuestion: w.q,
    brand: w.b,
    model: w.m,
    refrigerant: w.r,
    refrigerantSource: w.rs === "s" ? "stated" : w.rs === "i" ? "inferred" : null,
    capacityAsWritten: w.cap,
    lineSetLength: w.len ? { value: w.len.v, unit: w.len.u } : null,
    liquidLineSize: w.ll,
    factoryCharge: w.fc ? w.fc.map((p) => ({ value: p.v, unit: p.u })) : null,
    ratedLength: w.rl ? { value: w.rl.v, unit: w.rl.u } : null,
    chargePerLength: w.cpl ? { value: w.cpl.v, unit: w.cpl.u } : null,
  };
}
