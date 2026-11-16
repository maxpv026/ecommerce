/**
 * Glue a number to its unit with a no-break space, so "22.7 kg" or
 * "13,61 кг" can never wrap into a line that starts with the unit. Applied
 * to text we don't write ourselves (catalog product names) and to the
 * localized pack label, whose message has an ordinary space ("{kg} кг").
 * Only the space directly between a digit and a known unit changes, so the
 * rest of the string still wraps normally ("· балон" may go to line two).
 */
const UNIT_AFTER_NUMBER = /(\d) (?=(?:kg|кг|g|г|lb|L|l|bar|°C|%|千克)(?![\p{L}\p{N}]))/gu;

export function keepUnits(text: string): string {
  return text.replace(UNIT_AFTER_NUMBER, "$1 ");
}
