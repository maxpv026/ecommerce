import { countryFromGeoHeader, countryFromLocale, isCountryCode } from "@/lib/country";

/**
 * Emergency contacts by country for the /compliance/sds card.
 *
 * Two kinds of number, kept apart on purpose:
 *
 *  1. PUBLIC services — 112 and the national fire/ambulance and poison
 *     centre lines below. These are public facts, not ours; only numbers
 *     with a single national service are listed. Where a country has no
 *     single poison line (regional centres: PL, UA, RO…) the entry is null
 *     and the card says to call 112 — a guessed number on a safety page is
 *     worse than none. Have the HSE officer re-check this table yearly.
 *
 *  2. OUR line (SDS §1.4, ADR dispatcher) — configuration, never code:
 *     SDS_EMERGENCY_PHONE is the number printed on every sheet, and
 *     SDS_EMERGENCY_PHONES ({"UA": "+380 …", "DE": "+49 …"}) adds local
 *     numbers where the emergency-response contract provides them. A
 *     country without its own line shows the main one, labelled with the
 *     country it rings in, rather than a made-up local number.
 */

export interface EmergencyInfo {
  code: string;
  /** The number to dial first for anything life-threatening. */
  general: string;
  /** National fire / ambulance short codes where they differ from 112. */
  extra: ReadonlyArray<{ kind: "fire" | "ambulance"; number: string }>;
  /** A single national poison-information line, or null (→ 112). */
  poison: { name: string; phone: string; professionals?: true } | null;
}

const E = (code: string, poison: EmergencyInfo["poison"] = null, extra: EmergencyInfo["extra"] = [], general = "112"): EmergencyInfo => ({ code, general, extra, poison });

export const EMERGENCY: readonly EmergencyInfo[] = [
  E("AT", { name: "Vergiftungsinformationszentrale", phone: "+43 1 406 43 43" }, [{ kind: "fire", number: "122" }, { kind: "ambulance", number: "144" }]),
  E("BE", { name: "Antigifcentrum / Centre Antipoisons", phone: "070 245 245" }),
  E("BG"),
  E("HR"),
  E("CY"),
  E("CZ", { name: "Toxikologické informační středisko", phone: "+420 224 919 293" }, [{ kind: "fire", number: "150" }, { kind: "ambulance", number: "155" }]),
  E("DK", { name: "Giftlinjen", phone: "+45 82 12 12 12" }),
  E("EE", { name: "Mürgistusteabekeskus", phone: "16662" }),
  E("FI", { name: "Myrkytystietokeskus", phone: "0800 147 111" }),
  E("FR", { name: "Centre antipoison de Paris", phone: "+33 1 40 05 48 48" }, [{ kind: "fire", number: "18" }, { kind: "ambulance", number: "15" }]),
  E("DE", { name: "Giftnotruf Berlin", phone: "+49 30 19240" }),
  E("GR", { name: "Κέντρο Δηλητηριάσεων", phone: "+30 210 779 3777" }, [{ kind: "fire", number: "199" }, { kind: "ambulance", number: "166" }]),
  E("HU"),
  E("IE", { name: "National Poisons Information Centre", phone: "+353 1 809 2166" }),
  E("IT", { name: "Centro Antiveleni Niguarda", phone: "+39 02 6610 1029" }, [{ kind: "fire", number: "115" }, { kind: "ambulance", number: "118" }]),
  E("LV"),
  E("LT"),
  E("LU", { name: "Centre Antipoisons", phone: "8002 5500" }),
  E("MT"),
  E("NL", { name: "NVIC", phone: "+31 30 274 88 88", professionals: true }),
  E("PL", null, [{ kind: "fire", number: "998" }, { kind: "ambulance", number: "999" }]),
  E("PT", { name: "CIAV", phone: "800 250 250" }),
  E("RO"),
  E("SK"),
  E("SI"),
  E("ES", { name: "Servicio de Información Toxicológica", phone: "+34 91 562 04 20" }),
  E("SE", { name: "Giftinformationscentralen", phone: "010 456 67 00" }),
  E("GB", { name: "NHS 111", phone: "111" }, [], "999 / 112"),
  E("IS"),
  E("NO", { name: "Giftinformasjonen", phone: "+47 22 59 13 00" }, [{ kind: "fire", number: "110" }, { kind: "ambulance", number: "113" }]),
  E("CH", { name: "Tox Info Suisse", phone: "145" }, [{ kind: "fire", number: "118" }, { kind: "ambulance", number: "144" }]),
  E("UA", null, [{ kind: "fire", number: "101" }, { kind: "ambulance", number: "103" }]),
  E("MD"),
  E("TR", { name: "UZEM", phone: "114" }),
];

const BY_CODE = new Map(EMERGENCY.map((e) => [e.code, e]));
export const emergencyFor = (code: string | null | undefined): EmergencyInfo | null => (code ? (BY_CODE.get(code) ?? null) : null);

// ── Which country to show first ──

export type EmergencySource = "profile" | "ip" | "browser" | "locale";

/** "de-AT,de;q=0.9" → AT: the first tag that names a region we cover. */
export function countryFromAcceptLanguage(header: string | null | undefined): string | null {
  for (const part of (header ?? "").split(",")) {
    const region = part.split(";")[0]?.trim().split("-").find((sub, i) => i > 0 && /^[A-Za-z]{2}$/.test(sub));
    const code = region?.toUpperCase();
    if (code && BY_CODE.has(code)) return code;
  }
  return null;
}

/**
 * The cascade, best signal first: the signed-in buyer's resolved country
 * (lib/userCountry), Vercel's geo header, the browser's language region,
 * then the interface language (uk → UA). Only countries in the table count —
 * a buyer resolved to the US falls through to the next signal, not to a
 * card printing European numbers as if they were local.
 */
export function detectEmergencyCountry(s: { stored?: string | null; geo?: string | null; acceptLanguage?: string | null; locale?: string | null }): { code: string; source: EmergencySource } | null {
  const tries: Array<[string | null, EmergencySource]> = [
    [s.stored && isCountryCode(s.stored) ? s.stored : null, "profile"],
    [countryFromGeoHeader(s.geo), "ip"],
    [countryFromAcceptLanguage(s.acceptLanguage), "browser"],
    [countryFromLocale(s.locale), "locale"],
  ];
  for (const [code, source] of tries) if (code && BY_CODE.has(code)) return { code, source };
  return null;
}

// ── Our own line (configuration) ──

export interface EmergencyLines {
  /** SDS_EMERGENCY_PHONE and the country it rings in. */
  main: { phone: string; country: string | null } | null;
  /** Local numbers from SDS_EMERGENCY_PHONES, by country. */
  local: Record<string, string>;
}

const PHONE = /^\+?[\d\s().-]{5,24}$/;

/** Parses SDS_EMERGENCY_PHONES; a malformed value is ignored (and logged), never shown. */
export function parseLocalLines(raw: string | null | undefined): Record<string, string> {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const code = k.trim().toUpperCase();
      if (BY_CODE.has(code) && typeof v === "string" && PHONE.test(v.trim())) out[code] = v.trim();
    }
    return out;
  } catch (error) {
    console.error("[sds] SDS_EMERGENCY_PHONES is not a JSON object of country → phone; ignored:", error);
    return {};
  }
}

/** tel: href for a display number ("+49 30 19240" → "tel:+493019240"). */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;
