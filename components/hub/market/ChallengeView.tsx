"use client";

import { useState, useSyncExternalStore } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowRight, Award, CircleCheck, CircleX, Flame, Gauge, RotateCcw, Trophy, Zap } from "lucide-react";
import { EYEBROW, MicroBadge, SUMMARY_CARD, SURFACE } from "@/components/home/ui";
import { SurfaceHead } from "@/components/profile/hub/parts";
import { ACHIEVEMENTS, DIAGNOSTIC_CASES, EMPTY_STATS, GAUGE_MAX_BAR, QUIZ, isKeyOption, nextRank, rankFor, type GameStats } from "@/lib/hubGame";
import { chip } from "./shared";

/**
 * Tab 3: the manifold-gauge simulator and the F-Gas / thermodynamics blitz.
 * Everything runs in the browser from lib/hubGame (0 model calls). Progress
 * — score, streak, rank, achievements — is kept on this device
 * (localStorage), and the card says so.
 */

const KEY = "hub-game-v1";
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedStats: GameStats = EMPTY_STATS;

function readStats(): GameStats {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  if (raw === cachedRaw) return cachedStats;
  cachedRaw = raw;
  try {
    cachedStats = raw ? { ...EMPTY_STATS, ...(JSON.parse(raw) as Partial<GameStats>) } : EMPTY_STATS;
  } catch {
    cachedStats = EMPTY_STATS;
  }
  return cachedStats;
}
function writeStats(next: GameStats) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode: progress lives for this page view only */
    cachedRaw = JSON.stringify(next);
    cachedStats = next;
  }
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function useStats() {
  const stats = useSyncExternalStore(subscribe, readStats, () => EMPTY_STATS);
  const record = (correct: boolean, kind: "case" | "quiz", id: string) => {
    const cur = readStats();
    const streak = correct ? cur.streak + 1 : 0;
    writeStats({
      answered: cur.answered + 1,
      correct: cur.correct + (correct ? 1 : 0),
      streak,
      bestStreak: Math.max(cur.bestStreak, streak),
      casesSolved: correct && kind === "case" && !cur.casesSolved.includes(id) ? [...cur.casesSolved, id] : cur.casesSolved,
      quizSolved: correct && kind === "quiz" && !cur.quizSolved.includes(id) ? [...cur.quizSolved, id] : cur.quizSolved,
    });
  };
  return { stats, record, reset: () => writeStats(EMPTY_STATS) };
}

export default function ChallengeView() {
  const t = useTranslations("MarketHub");
  const [mode, setMode] = useState<"sim" | "quiz">("sim");
  const { stats, record, reset } = useStats();

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
      <div className="flex min-w-0 flex-col gap-4 lg:col-span-8">
        <div className="flex gap-1.5" role="tablist" aria-label={t("challengeModes")}>
          <button type="button" role="tab" aria-selected={mode === "sim"} onClick={() => setMode("sim")} className={chip(mode === "sim")} data-hub-mode="sim">
            <Gauge size={13} strokeWidth={2.2} />
            {t("modeSim", { n: DIAGNOSTIC_CASES.length })}
          </button>
          <button type="button" role="tab" aria-selected={mode === "quiz"} onClick={() => setMode("quiz")} className={chip(mode === "quiz")} data-hub-mode="quiz">
            <Zap size={13} strokeWidth={2.2} />
            {t("modeQuiz", { n: QUIZ.length })}
          </button>
        </div>
        {mode === "sim" ? <Simulator onAnswer={(ok, id) => record(ok, "case", id)} streak={stats.streak} /> : <Quiz onAnswer={(ok, id) => record(ok, "quiz", id)} streak={stats.streak} />}
      </div>
      <aside className="min-w-0 lg:sticky lg:top-[88px] lg:col-span-4">
        <ScoreCard stats={stats} onReset={reset} />
      </aside>
    </div>
  );
}

function Simulator({ onAnswer, streak }: { onAnswer: (correct: boolean, id: string) => void; streak: number }) {
  const t = useTranslations("MarketHub");
  const format = useFormatter();
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const c = DIAGNOSTIC_CASES[i % DIAGNOSTIC_CASES.length]!;
  const n1 = (n: number) => format.number(n, { maximumFractionDigits: 1 });

  const choose = (d: string) => {
    if (picked) return;
    setPicked(d);
    onAnswer(d === c.answer, c.id);
  };

  return (
    <div className={SURFACE} data-hub-sim={c.id}>
      <SurfaceHead title={t("simTitle")} meta={[t("caseOf", { n: (i % DIAGNOSTIC_CASES.length) + 1, total: DIAGNOSTIC_CASES.length }), c.gas, t("ambient", { t: c.ambientC })]} id="sim">
        {streak > 0 && (
          <MicroBadge tone="warn" data-hub-streak={String(streak)}>
            🔥 {t("streak", { n: streak })}
          </MicroBadge>
        )}
      </SurfaceHead>
      <div className="px-5 py-4">
        <p className="m-0 text-[13.5px] leading-[1.55]" data-hub-case-text>
          {t(c.system)}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <GaugeBar label={t("lowSide")} barG={c.low.barG} satC={c.low.satC} tone="blue" n1={n1} />
          <GaugeBar label={t("highSide")} barG={c.high.barG} satC={c.high.satC} tone="red" n1={n1} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            { k: "sh", label: t("superheat"), value: `${c.superheatK} K` },
            { k: "sc", label: t("subcooling"), value: `${c.subcoolingK} K` },
            { k: "amb", label: t("ambientShort"), value: `${c.ambientC} °C` },
          ].map((m) => (
            <div key={m.k} className="rounded-[14px] border border-slate-900/[.07] bg-white/60 px-3 py-2 dark:border-white/[.08] dark:bg-white/[.03]" data-hub-reading={m.k}>
              <div className="text-[11px] text-slate-500 dark:text-ink-muted">{m.label}</div>
              <div className="text-[16px] font-semibold tabular-nums">{m.value}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-slate-900/[.06] px-5 py-4 dark:border-white/[.06]">
        <div className="mb-2 text-[12px] font-semibold text-slate-600 dark:text-slate-300">{t("whatsWrong")}</div>
        <div className="grid gap-2 sm:grid-cols-2" data-hub-options>
          {c.options.map((d) => {
            const right = picked && d === c.answer;
            const wrong = picked === d && d !== c.answer;
            return (
              <button
                key={d}
                type="button"
                onClick={() => choose(d)}
                disabled={Boolean(picked)}
                data-hub-option={d}
                className={`flex min-h-[44px] items-center gap-2 rounded-[14px] border px-3.5 py-2 text-left text-[13px] font-semibold transition-colors ${
                  right
                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                    : wrong
                      ? "border-red-500/50 bg-red-500/10 text-red-800 dark:text-red-300"
                      : "border-slate-900/[.12] hover:bg-slate-900/[.04] disabled:opacity-70 dark:border-white/[.14] dark:hover:bg-white/[.06]"
                }`}
              >
                {right ? <CircleCheck size={16} strokeWidth={2.2} /> : wrong ? <CircleX size={16} strokeWidth={2.2} /> : null}
                {t(`dx_${d}`)}
              </button>
            );
          })}
        </div>
        {picked && (
          <div className="mt-3 rounded-[14px] border border-slate-900/[.07] bg-slate-900/[.02] px-3.5 py-3 text-[12.5px] leading-[1.55] dark:border-white/[.08] dark:bg-white/[.03]" data-hub-explain={picked === c.answer ? "right" : "wrong"}>
            <div className="mb-1 font-semibold">{picked === c.answer ? t("right") : t("wrongIs", { answer: t(`dx_${c.answer}`) })}</div>
            {t(`dxWhy_${c.answer}`)}
          </div>
        )}
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => {
              setI((x) => x + 1);
              setPicked(null);
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-blue-700 px-4 text-[12.5px] font-semibold text-white hover:bg-blue-800"
            data-hub-next
          >
            {t("nextCase")}
            <ArrowRight size={14} strokeWidth={2.4} />
          </button>
        </div>
      </div>
    </div>
  );
}

function GaugeBar({ label, barG, satC, tone, n1 }: { label: string; barG: number; satC: number; tone: "blue" | "red"; n1: (n: number) => string }) {
  const t = useTranslations("MarketHub");
  const pct = Math.max(2, Math.min(100, (barG / GAUGE_MAX_BAR) * 100));
  return (
    <div className="rounded-[16px] border border-slate-900/[.08] bg-white/60 px-3.5 py-3 dark:border-white/[.08] dark:bg-white/[.03]" data-hub-gauge={tone === "blue" ? "low" : "high"}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-semibold text-slate-600 dark:text-slate-300">{label}</span>
        <span className="text-[11.5px] text-slate-500 tabular-nums dark:text-ink-muted">{t("satAt", { t: n1(satC) })}</span>
      </div>
      <div className="mt-1 text-[22px] font-semibold tracking-[-.02em] tabular-nums">{t("barG", { value: n1(barG) })}</div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-900/[.07] dark:bg-white/[.08]" role="meter" aria-valuemin={0} aria-valuemax={GAUGE_MAX_BAR} aria-valuenow={barG} aria-label={label}>
        <div className={`h-full rounded-full ${tone === "blue" ? "bg-blue-600 dark:bg-blue-400" : "bg-red-600 dark:bg-red-400"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Quiz({ onAnswer, streak }: { onAnswer: (correct: boolean, id: string) => void; streak: number }) {
  const t = useTranslations("MarketHub");
  const format = useFormatter();
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const q = QUIZ[i % QUIZ.length]!;
  const values = Object.fromEntries(Object.entries(q.values ?? {}).map(([k, v]) => [k, typeof v === "number" ? format.number(v, { maximumFractionDigits: 1 }) : v]));

  return (
    <div className={SURFACE} data-hub-quiz={q.id}>
      <SurfaceHead title={t("quizTitle")} meta={[t("questionOf", { n: (i % QUIZ.length) + 1, total: QUIZ.length })]} id="quiz">
        {streak > 0 && <MicroBadge tone="warn">🔥 {t("streak", { n: streak })}</MicroBadge>}
      </SurfaceHead>
      <div className="px-5 py-4">
        <p className="m-0 text-[14px] font-semibold leading-[1.5] tracking-[-.01em]">{t(q.key, values)}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {q.options.map((o, idx) => {
            const right = picked !== null && idx === q.answer;
            const wrong = picked === idx && idx !== q.answer;
            return (
              <button
                key={o}
                type="button"
                disabled={picked !== null}
                onClick={() => {
                  setPicked(idx);
                  onAnswer(idx === q.answer, q.id);
                }}
                data-hub-quiz-option={idx}
                className={`flex min-h-[44px] items-center gap-2 rounded-[14px] border px-3.5 py-2 text-left text-[13px] font-semibold transition-colors ${
                  right
                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                    : wrong
                      ? "border-red-500/50 bg-red-500/10 text-red-800 dark:text-red-300"
                      : "border-slate-900/[.12] hover:bg-slate-900/[.04] disabled:opacity-70 dark:border-white/[.14] dark:hover:bg-white/[.06]"
                }`}
              >
                {right ? <CircleCheck size={16} strokeWidth={2.2} /> : wrong ? <CircleX size={16} strokeWidth={2.2} /> : null}
                {isKeyOption(o) ? t(o) : o}
              </button>
            );
          })}
        </div>
        {picked !== null && (
          <div className="mt-3 rounded-[14px] border border-slate-900/[.07] bg-slate-900/[.02] px-3.5 py-3 text-[12.5px] leading-[1.55] dark:border-white/[.08] dark:bg-white/[.03]" data-hub-quiz-explain>
            <div className="mb-1 font-semibold">{picked === q.answer ? t("right") : t("wrong")}</div>
            {t(`${q.key}_why`, values)}
          </div>
        )}
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => {
              setI((x) => x + 1);
              setPicked(null);
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-blue-700 px-4 text-[12.5px] font-semibold text-white hover:bg-blue-800"
            data-hub-quiz-next
          >
            {t("nextQuestion")}
            <ArrowRight size={14} strokeWidth={2.4} />
          </button>
        </div>
      </div>
    </div>
  );
}

function ScoreCard({ stats, onReset }: { stats: GameStats; onReset: () => void }) {
  const t = useTranslations("MarketHub");
  const rank = rankFor(stats.correct);
  const next = nextRank(stats.correct);
  const accuracy = stats.answered > 0 ? Math.round((stats.correct / stats.answered) * 100) : null;

  return (
    <div className={SUMMARY_CARD} data-hub-score>
      <h2 className={EYEBROW}>{t("scoreEyebrow")}</h2>
      <div className="mt-3 flex items-center gap-3">
        <span className="flex h-12 w-12 flex-none items-center justify-center rounded-[14px] bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <Trophy size={22} strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold tracking-[-.02em]" data-hub-rank={rank.key}>
            {t(rank.key)}
          </div>
          <div className="text-[12px] text-slate-500 dark:text-ink-muted">{next ? t("toNextRank", { n: next.min - stats.correct, rank: t(next.key) }) : t("topRank")}</div>
        </div>
      </div>
      <dl className="m-0 mt-4 grid grid-cols-3 gap-2">
        {[
          { k: "streak", label: t("kpiStreak"), value: `🔥 ${stats.streak}`, icon: Flame },
          { k: "accuracy", label: t("kpiAccuracy"), value: accuracy === null ? "—" : `${accuracy}%`, icon: Award },
          { k: "correct", label: t("kpiCorrect"), value: `${stats.correct}/${stats.answered}`, icon: CircleCheck },
        ].map((m) => (
          <div key={m.k} className="rounded-[14px] border border-slate-900/[.07] bg-white/60 px-2.5 py-2 dark:border-white/[.08] dark:bg-white/[.03]" data-hub-score-kpi={m.k}>
            <dt className="truncate text-[10.5px] text-slate-500 dark:text-ink-muted">{m.label}</dt>
            <dd className="m-0 mt-0.5 text-[15px] font-semibold tabular-nums">{m.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 text-[11.5px] font-semibold uppercase tracking-[.07em] text-slate-500 dark:text-ink-muted">{t("achievements")}</div>
      <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
        {ACHIEVEMENTS.map((a) => {
          const got = a.test(stats);
          return (
            <li key={a.key} className={`flex items-center gap-2 text-[12.5px] ${got ? "" : "opacity-55"}`} data-hub-achievement={a.key} data-got={got ? "1" : "0"}>
              <span className={`flex h-6 w-6 flex-none items-center justify-center rounded-full ${got ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-slate-900/[.06] text-slate-400 dark:bg-white/[.08]"}`}>
                {got ? <CircleCheck size={14} strokeWidth={2.4} /> : <Award size={13} strokeWidth={2} />}
              </span>
              {t(a.key)}
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-900/[.06] pt-3 text-[11.5px] text-slate-500 dark:border-white/[.06] dark:text-ink-muted">
        <span>{t("progressLocal")}</span>
        <button type="button" onClick={onReset} className="inline-flex items-center gap-1 font-semibold hover:text-slate-800 dark:hover:text-slate-200" data-hub-reset>
          <RotateCcw size={12} strokeWidth={2.2} />
          {t("reset")}
        </button>
      </div>
    </div>
  );
}
