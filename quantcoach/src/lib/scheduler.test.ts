import { describe, it, expect } from "vitest";
import { pickNextQuestion, type SchedulerInput } from "./scheduler";

const now = new Date("2026-08-14T12:00:00Z");
const past = new Date("2026-08-10T12:00:00Z");
const future = new Date("2026-08-20T12:00:00Z");

function input(overrides: Partial<SchedulerInput>): SchedulerInput {
  return {
    questions: [],
    mastery: [],
    attemptedQuestionIds: new Set(),
    sessionQuestionIds: new Set(),
    mode: "drive",
    now,
    ...overrides,
  };
}

const q = (
  id: string,
  pattern: string,
  voice: "high" | "medium" | "desk_only" = "high",
  difficulty = 2
) => ({
  id,
  primaryPatternId: pattern,
  secondaryPatternId: null,
  voiceSuitability: voice,
  difficulty,
});

describe("pickNextQuestion", () => {
  it("filters desk-only questions in drive mode", () => {
    const pick = pickNextQuestion(
      input({ questions: [q("a", "p1", "desk_only")] })
    );
    expect(pick).toBeNull();
  });

  it("allows desk-only questions in study mode", () => {
    const pick = pickNextQuestion(
      input({ questions: [q("a", "p1", "desk_only")], mode: "study" })
    );
    expect(pick?.questionId).toBe("a");
  });

  it("serves due reviews before new questions, weakest pattern first", () => {
    const pick = pickNextQuestion(
      input({
        questions: [q("a", "weak"), q("b", "weaker"), q("c", "fresh")],
        mastery: [
          { patternId: "weak", masteryPct: 50, nextReviewAt: past },
          { patternId: "weaker", masteryPct: 30, nextReviewAt: past },
        ],
      })
    );
    expect(pick?.reason).toBe("due_review");
    expect(pick?.patternId).toBe("weaker");
    expect(pick?.questionId).toBe("b");
  });

  it("ignores reviews that are not yet due", () => {
    const pick = pickNextQuestion(
      input({
        questions: [q("a", "p1"), q("b", "p2")],
        mastery: [{ patternId: "p1", masteryPct: 10, nextReviewAt: future }],
      })
    );
    expect(pick?.reason).not.toBe("due_review");
  });

  it("prefers an unseen question for a due pattern and flags recognition testing", () => {
    const pick = pickNextQuestion(
      input({
        questions: [q("seen", "p1"), q("unseen", "p1")],
        mastery: [{ patternId: "p1", masteryPct: 40, nextReviewAt: past }],
        attemptedQuestionIds: new Set(["seen"]),
      })
    );
    expect(pick?.questionId).toBe("unseen");
    expect(pick?.testRecognition).toBe(true);
  });

  it("targets weak patterns with unseen questions when nothing is due", () => {
    const pick = pickNextQuestion(
      input({
        questions: [q("a", "weak"), q("b", "strong")],
        mastery: [
          { patternId: "weak", masteryPct: 40, nextReviewAt: null },
          { patternId: "strong", masteryPct: 90, nextReviewAt: null },
        ],
      })
    );
    expect(pick?.reason).toBe("weak_pattern");
    expect(pick?.questionId).toBe("a");
  });

  it("never repeats a question within a session", () => {
    const pick = pickNextQuestion(
      input({
        questions: [q("a", "p1")],
        sessionQuestionIds: new Set(["a"]),
      })
    );
    expect(pick).toBeNull();
  });

  it("falls back to easiest unseen question", () => {
    const pick = pickNextQuestion(
      input({
        questions: [q("hard", "p1", "high", 5), q("easy", "p2", "high", 1)],
      })
    );
    expect(pick?.reason).toBe("new");
    expect(pick?.questionId).toBe("easy");
  });
});
