import { describe, it, expect } from "vitest";
import { applyAttempt, compositePct, reviewIntervalDays } from "./mastery";

const base = { recognition: 2.5, setup: 2.5, calculation: 2.5, explanation: 2.5, streak: 0 };
const now = new Date("2026-08-14T12:00:00Z");

describe("compositePct", () => {
  it("weights recognition highest", () => {
    const highRec = compositePct({ recognition: 5, setup: 0, calculation: 0, explanation: 0 });
    const highCalc = compositePct({ recognition: 0, setup: 0, calculation: 5, explanation: 0 });
    expect(highRec).toBeGreaterThan(highCalc);
  });

  it("maps a perfect 5s to 100 and zeros to 0", () => {
    expect(compositePct({ recognition: 5, setup: 5, calculation: 5, explanation: 5 })).toBe(100);
    expect(compositePct({ recognition: 0, setup: 0, calculation: 0, explanation: 0 })).toBe(0);
  });
});

describe("reviewIntervalDays", () => {
  const scores = { recognition: 4, setup: 4, calculation: 4, explanation: 4 };

  it("walkthrough snaps review to tomorrow", () => {
    expect(
      reviewIntervalDays({ scores, hintLevelReached: 6, solvedIndependently: false }, 3)
    ).toBe(1);
  });

  it("method-level hints mean short interval", () => {
    expect(
      reviewIntervalDays({ scores, hintLevelReached: 3, solvedIndependently: false }, 3)
    ).toBe(2);
  });

  it("clean solves double with streak, capped at 30", () => {
    const d0 = reviewIntervalDays({ scores, hintLevelReached: 0, solvedIndependently: true }, 0);
    const d2 = reviewIntervalDays({ scores, hintLevelReached: 0, solvedIndependently: true }, 2);
    const d9 = reviewIntervalDays({ scores, hintLevelReached: 1, solvedIndependently: true }, 9);
    expect(d0).toBe(2);
    expect(d2).toBe(8);
    expect(d9).toBe(30);
  });
});

describe("applyAttempt", () => {
  it("moves scores toward the observed evidence", () => {
    const next = applyAttempt(
      base,
      {
        scores: { recognition: 5, setup: 5, calculation: 5, explanation: 5 },
        hintLevelReached: 0,
        solvedIndependently: true,
      },
      now
    );
    expect(next.recognition).toBeGreaterThan(base.recognition);
    expect(next.streak).toBe(1);
    expect(next.nextReviewAt.getTime()).toBeGreaterThan(now.getTime());
  });

  it("null scores leave dimensions unchanged", () => {
    const next = applyAttempt(
      base,
      {
        scores: { recognition: 5, setup: null, calculation: null, explanation: null },
        hintLevelReached: 2,
        solvedIndependently: false,
      },
      now
    );
    expect(next.setup).toBe(base.setup);
    expect(next.recognition).toBeGreaterThan(base.recognition);
  });

  it("needing heavy hints resets the streak", () => {
    const next = applyAttempt(
      { ...base, streak: 4 },
      {
        scores: { recognition: 1, setup: 2, calculation: 3, explanation: 2 },
        hintLevelReached: 5,
        solvedIndependently: false,
      },
      now
    );
    expect(next.streak).toBe(0);
    // review snapped to ~1 day out
    const days = (next.nextReviewAt.getTime() - now.getTime()) / 86400000;
    expect(days).toBeCloseTo(1, 5);
  });
});
