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
    .describe("True if the text describes an HVAC/refrigeration system or line set whose refrigerant charge could be calculated."),
  brand: z.string().nullable().describe("Manufacturer as written, e.g. 'Daikin'. Null if not mentioned."),
  model: z.string().nullable().describe("Model number as written, e.g. 'FTXM35R'. Null if not mentioned."),
  refrigerant: z
    .string()
    .nullable()
    .describe("Refrigerant designation, e.g. 'R-32', 'R-410A'. As written, or inferred from a model you recognise. Null if neither."),
  refrigerantSource: z
    .enum(["stated", "inferred"])
    .nullable()
    .describe("'stated' if the text names the refrigerant, 'inferred' if you deduced it from the model, null if refrigerant is null."),
  capacityAsWritten: z.string().nullable().describe("The capacity exactly as written, e.g. '3.5 kW', '12 000 BTU', '4-ton'. Null if not mentioned."),
  lineSetLength: LengthSchema.nullable().describe("Total line-set (pipe run) length as written, with its unit. Do not convert."),
  liquidLineSize: z
    .enum(LIQUID_LINE_SIZES)
    .nullable()
    .describe("Liquid line outside diameter in inches if stated (e.g. '1/4\"', '3/8\"', '6.35 mm' → '1/4', '9.52 mm' → '3/8'). Null if not stated — never assume."),
  factoryCharge: z
    .object({ value: z.number(), unit: z.enum(["kg", "g", "lb", "oz"]) })
    .array()
    .nullable()
    .describe(
      "The unit's factory/nameplate charge ONLY if the text states it, as written: '1.6 kg' → [{value:1.6,unit:'kg'}]; '3 lb 8 oz' → [{value:3,unit:'lb'},{value:8,unit:'oz'}]. Null if not stated. Never estimate it."
    ),
  ratedLength: LengthSchema.nullable().describe("Line length the factory charge covers, only if stated (e.g. 'pre-charged for 7.5 m'). Null otherwise."),
  chargePerLength: z
    .object({ value: z.number(), unit: z.enum(["g/m", "oz/ft"]) })
    .nullable()
    .describe("Additional charge per length only if the text states it (e.g. '20 g/m', '0.6 oz/ft'). Null otherwise."),
});

export type ChargeExtraction = z.infer<typeof ChargeExtractionSchema>;
