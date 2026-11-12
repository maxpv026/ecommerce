"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff, Lightbulb, Loader2 } from "lucide-react";
import type { RecoveryChallenge } from "@/lib/recoveryPhraseFormat";

/**
 * The answer to a recovery-phrase challenge — shared by the sign-in 2FA step
 * (desktop card, modal, mobile) and the step-up dialog.
 *
 *   SEED_12        numbered word boxes for the positions the server picked
 *   CUSTOM_PHRASE  one masked passphrase field, with the buyer's hint
 *   NONE           this account has no recovery phrase
 */
export default function RecoveryPhraseInput({
  challenge,
  words,
  onWords,
  phrase,
  onPhrase,
}: {
  challenge: RecoveryChallenge | null;
  words: string[];
  onWords: (next: string[]) => void;
  phrase: string;
  onPhrase: (next: string) => void;
}) {
  const t = useTranslations("RecoveryPhrase");
  const [show, setShow] = useState(false);
  const box =
    "h-11 w-full rounded-[12px] border-[1.5px] border-slate-900/[.14] bg-white px-3 font-mono text-[14px] text-slate-900 outline-none placeholder:font-sans placeholder:text-slate-400 focus:border-blue-700 focus:ring-[3px] focus:ring-blue-700/[.12] dark:border-white/[.14] dark:bg-slate-900 dark:text-slate-50";

  if (!challenge) {
    return (
      <div className="flex h-14 items-center justify-center text-slate-400" data-phrase-loading>
        <Loader2 size={16} className="animate-spin" />
      </div>
    );
  }
  if (challenge.type === "NONE") {
    return (
      <p className="m-0 rounded-[12px] border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[12.5px] text-amber-800 dark:text-amber-300" data-phrase-none>
        {t("none")}
      </p>
    );
  }
  if (challenge.type === "SEED_12") {
    return (
      <div data-seed-challenge={challenge.indices.join(",")}>
        <p className="m-0 mb-2 text-[12px] text-slate-500 dark:text-slate-400">{t("seedPrompt", { count: challenge.indices.length })}</p>
        <div className="grid grid-cols-2 gap-2">
          {challenge.indices.map((n, i) => (
            <label key={n} className="block text-left">
              <span className="mb-1 block font-mono text-[11px] font-semibold text-slate-500 dark:text-slate-400">{t("wordNumber", { n })}</span>
              <input
                value={words[i] ?? ""}
                onChange={(e) => {
                  const next = [...words];
                  next[i] = e.target.value.replace(/\s/g, "").slice(0, 20);
                  onWords(next);
                }}
                autoFocus={i === 0}
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                aria-label={t("wordNumber", { n })}
                placeholder={`#${n}`}
                data-seed-word={n}
                className={box}
              />
            </label>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div data-custom-challenge>
      {challenge.hint && (
        <p className="m-0 mb-2 flex items-start gap-2 rounded-[12px] border border-blue-600/20 bg-blue-600/[.06] px-3 py-2 text-left text-[12.5px] text-blue-800 dark:border-blue-400/25 dark:bg-blue-400/[.08] dark:text-blue-200" data-phrase-hint-banner>
          <Lightbulb size={14} className="mt-[2px] flex-none" />
          <span className="min-w-0 break-words">{t("hint", { hint: challenge.hint })}</span>
        </p>
      )}
      <span className="relative block">
        <input
          type={show ? "text" : "password"}
          value={phrase}
          onChange={(e) => onPhrase(e.target.value.slice(0, 200))}
          autoFocus
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          aria-label={t("customLabel")}
          placeholder={t("customLabel")}
          data-phrase-secret-input
          className={`${box} pr-10`}
        />
        <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? t("hide") : t("show")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600">
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </span>
    </div>
  );
}
