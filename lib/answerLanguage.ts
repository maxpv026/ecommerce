// Which language an AI answer must be written in.
//
// A pure module on purpose. It lived in lib/actions/compatibility.ts, which
// carries "use server" — and Next requires every export from such a file to
// be an async Server Action, so exporting a synchronous helper there fails
// the build (a rule neither tsc nor eslint checks; only `next build` does).
// Being pure also means it can be unit-tested without pulling in Prisma or
// the OpenAI client, and the app's other AI surfaces can share it.

/**
 * Which language the answer must be written in.
 *
 * Deliberately decided here rather than by the model. Asked to "identify the
 * language of the question and match it", gpt-4o answered an English
 * question in Spanish and a Russian one in Ukrainian — it is not reliable at
 * a task that is, for our purposes, deterministic. The UI locale is a known
 * exact value, and the one case it gets wrong (someone typing Ukrainian on
 * the English site — the reported bug) is exactly what script detection
 * catches.
 */
const ANSWER_LANGUAGE: Record<string, string> = {
  bg: "Bulgarian", cs: "Czech", da: "Danish", de: "German", el: "Greek", en: "English",
  es: "Spanish", et: "Estonian", fi: "Finnish", fr: "French", ga: "Irish", hr: "Croatian",
  hu: "Hungarian", it: "Italian", ko: "Korean", lt: "Lithuanian", lv: "Latvian", mt: "Maltese",
  nl: "Dutch", pl: "Polish", pt: "Portuguese", ro: "Romanian", ru: "Russian", sk: "Slovak",
  sl: "Slovenian", sv: "Swedish", tr: "Turkish", uk: "Ukrainian", zh: "Chinese",
};

/** Locales whose script is not Latin, so the question's own script can confirm them. */
const CYRILLIC_LOCALES = new Set(["uk", "ru", "bg"]);

export function answerLanguage(question: string, locale?: string): string {
  const fromLocale = locale ? ANSWER_LANGUAGE[locale.toLowerCase().split("-")[0]] : undefined;

  // A question in a script the interface language doesn't use is the strong
  // signal: someone typing Ukrainian into the English site means it.
  if (/[\u0400-\u04FF]/.test(question)) {
    if (locale && CYRILLIC_LOCALES.has(locale.toLowerCase().split("-")[0])) return fromLocale!;
    // і, ї, є, ґ exist in Ukrainian and not Russian.
    return /[іїєґІЇЄҐ]/.test(question) ? "Ukrainian" : "Russian";
  }
  if (/[\u0370-\u03FF]/.test(question)) return "Greek";
  if (/[\uAC00-\uD7AF]/.test(question)) return "Korean";
  if (/[\u4E00-\u9FFF]/.test(question)) return "Chinese";

  return fromLocale ?? "English";
}
