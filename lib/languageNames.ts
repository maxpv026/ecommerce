/** Native display name of a locale, as spoken in that locale itself (e.g. "de" -> "Deutsch"). */
export function nativeLanguageName(locale: string): string {
  const raw = new Intl.DisplayNames([locale], { type: "language" }).of(locale) ?? locale;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}
