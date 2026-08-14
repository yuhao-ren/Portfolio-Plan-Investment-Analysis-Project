// Mastery model + spaced-repetition intervals.
// Pure functions here (unit-tested); DB application lives in the tool routes.

export interface SubScores {
  recognition: number | null;
  setup: number | null;
  calculation: number | null;
  explanation: number | null;
}

export interface MasteryState {
  recognition: number;
  setup: number;
  calculation: number;
  explanation: number;
  masteryPct: number;
  confidence: "low" | "medium" | "high";
  streak: number;
  nextReviewAt: Date;
}

export interface AttemptSignal {
  scores: SubScores;
  hintLevelReached: number; // 0-6
  solvedIndependently: boolean;
}

/** Exponential moving average weight for new evidence. */
const EMA_ALPHA = 0.4;

function ema(prev: number, observed: number | null): number {
  if (observed === null) return prev;
  return prev * (1 - EMA_ALPHA) + observed * EMA_ALPHA;
}

export function compositePct(s: {
  recognition: number;
  setup: number;
  calculation: number;
  explanation: number;
}): number {
  // Recognition is the interview-critical skill — weight it highest.
  const composite =
    0.4 * s.recognition + 0.25 * s.setup + 0.2 * s.calculation + 0.15 * s.explanation;
  return Math.round((composite / 5) * 100);
}

/**
 * Spaced-repetition interval, in days, from the attempt outcome.
 * Deliberately coarse (design §4.4): independent solves double the streak
 * interval; heavy hints or failure snap the review back to tomorrow.
 */
export function reviewIntervalDays(signal: AttemptSignal, streak: number): number {
  if (!signal.solvedIndependently && signal.hintLevelReached >= 5) return 1; // needed walkthrough
  if (signal.hintLevelReached >= 3) return 2; // needed the method named
  if (signal.solvedIndependently && signal.hintLevelReached <= 1) {
    return Math.min(30, Math.pow(2, Math.min(streak + 1, 5))); // 2,4,8,16,32→30 cap
  }
  return 4; // solved with light help
}

export function applyAttempt(
  prev: {
    recognition: number;
    setup: number;
    calculation: number;
    explanation: number;
    streak: number;
  },
  signal: AttemptSignal,
  now: Date = new Date()
): MasteryState {
  const next = {
    recognition: ema(prev.recognition, signal.scores.recognition),
    setup: ema(prev.setup, signal.scores.setup),
    calculation: ema(prev.calculation, signal.scores.calculation),
    explanation: ema(prev.explanation, signal.scores.explanation),
  };

  const cleanSolve = signal.solvedIndependently && signal.hintLevelReached <= 1;
  const streak = cleanSolve ? prev.streak + 1 : 0;

  const masteryPct = compositePct(next);
  const confidence: MasteryState["confidence"] =
    masteryPct >= 75 && streak >= 2 ? "high" : masteryPct >= 55 ? "medium" : "low";

  const days = reviewIntervalDays(signal, prev.streak);
  const nextReviewAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  return { ...next, masteryPct, confidence, streak, nextReviewAt };
}
