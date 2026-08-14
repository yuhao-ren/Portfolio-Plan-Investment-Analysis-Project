// Session assembly: which question next?
// Policy (design §4.4): due reviews first (weakest pattern first, prefer a
// question the user hasn't seen for that pattern), then new questions
// weighted toward weak patterns — always filtered by mode/voice-suitability.

export interface SchedulerQuestion {
  id: string;
  primaryPatternId: string;
  secondaryPatternId: string | null;
  voiceSuitability: "high" | "medium" | "desk_only";
  difficulty: number;
}

export interface SchedulerMastery {
  patternId: string;
  masteryPct: number;
  nextReviewAt: Date | null;
}

export interface SchedulerInput {
  questions: SchedulerQuestion[]; // active questions
  mastery: SchedulerMastery[];
  attemptedQuestionIds: Set<string>; // ever attempted
  sessionQuestionIds: Set<string>; // already served this session
  mode: "drive" | "study" | "interview";
  now: Date;
}

export interface SchedulerPick {
  questionId: string;
  reason: "due_review" | "weak_pattern" | "new" | "fallback";
  patternId: string;
  /** true when the pick targets recognition — the tutor must not name the pattern */
  testRecognition: boolean;
}

function voiceOk(q: SchedulerQuestion, mode: SchedulerInput["mode"]): boolean {
  if (mode === "drive") return q.voiceSuitability !== "desk_only";
  return true;
}

export function pickNextQuestion(input: SchedulerInput): SchedulerPick | null {
  const { questions, mastery, attemptedQuestionIds, sessionQuestionIds, mode, now } = input;

  const eligible = questions.filter(
    (q) => voiceOk(q, mode) && !sessionQuestionIds.has(q.id)
  );
  if (eligible.length === 0) return null;

  const byPattern = new Map<string, SchedulerQuestion[]>();
  for (const q of eligible) {
    const list = byPattern.get(q.primaryPatternId) ?? [];
    list.push(q);
    byPattern.set(q.primaryPatternId, list);
  }

  // 1. Due reviews: patterns whose nextReviewAt has passed, weakest first.
  const due = mastery
    .filter((m) => m.nextReviewAt !== null && m.nextReviewAt <= now && byPattern.has(m.patternId))
    .sort((a, b) => a.masteryPct - b.masteryPct);

  for (const m of due) {
    const candidates = byPattern.get(m.patternId)!;
    // Prefer an UNSEEN question for the due pattern — recognizing the move in a
    // new disguise is the skill being tested (design §4.3).
    const fresh = candidates.filter((q) => !attemptedQuestionIds.has(q.id));
    const pool = fresh.length > 0 ? fresh : candidates;
    const q = pool.sort((a, b) => a.difficulty - b.difficulty)[0];
    return {
      questionId: q.id,
      reason: "due_review",
      patternId: m.patternId,
      testRecognition: fresh.length > 0, // unseen question → recognition test, don't name the pattern
    };
  }

  // 2. Weak patterns (mastery < 60), weakest first, unseen questions preferred.
  const weak = mastery
    .filter((m) => m.masteryPct < 60 && byPattern.has(m.patternId))
    .sort((a, b) => a.masteryPct - b.masteryPct);

  for (const m of weak) {
    const candidates = byPattern.get(m.patternId)!;
    const fresh = candidates.filter((q) => !attemptedQuestionIds.has(q.id));
    if (fresh.length === 0) continue;
    const q = fresh.sort((a, b) => a.difficulty - b.difficulty)[0];
    return {
      questionId: q.id,
      reason: "weak_pattern",
      patternId: m.patternId,
      testRecognition: true,
    };
  }

  // 3. Anything unseen (broadest coverage), easiest first.
  const unseen = eligible.filter((q) => !attemptedQuestionIds.has(q.id));
  if (unseen.length > 0) {
    const q = unseen.sort((a, b) => a.difficulty - b.difficulty)[0];
    return {
      questionId: q.id,
      reason: "new",
      patternId: q.primaryPatternId,
      testRecognition: false,
    };
  }

  // 4. Fallback: least-recently relevant repeat.
  const q = eligible[Math.floor(Math.random() * eligible.length)];
  return {
    questionId: q.id,
    reason: "fallback",
    patternId: q.primaryPatternId,
    testRecognition: false,
  };
}
