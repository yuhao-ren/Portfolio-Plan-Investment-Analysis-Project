// Server-side implementation of the realtime tool surface (design §6.3).
// Every call is scoped to a session; working state (served questions, hint
// levels, last verdicts) is persisted on the Session row so interrupted
// drives resume cleanly.

import { prisma } from "./db";
import { pickNextQuestion } from "./scheduler";
import { applyAttempt } from "./mastery";
import { evaluateReasoning } from "./evaluator";
import { questionContext } from "./prompts";
import { rowToRecord, type EvaluatorVerdict } from "./records";

interface SessionState {
  served: string[];
  hints: Record<string, number>;
  verdicts: Record<string, EvaluatorVerdict>;
  testRecognition: Record<string, boolean>;
}

function parseState(raw: string): SessionState {
  const s = JSON.parse(raw || "{}");
  return {
    served: s.served ?? [],
    hints: s.hints ?? {},
    verdicts: s.verdicts ?? {},
    testRecognition: s.testRecognition ?? {},
  };
}

async function saveState(sessionId: string, state: SessionState) {
  await prisma.session.update({
    where: { id: sessionId },
    data: { state: JSON.stringify(state) },
  });
}

export async function dispatchTool(
  sessionId: string,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
  const state = parseState(session.state);
  const mode = session.mode as "drive" | "study" | "interview";

  switch (name) {
    case "get_next_question": {
      const [questions, mastery, attempts] = await Promise.all([
        prisma.question.findMany({ where: { active: true } }),
        prisma.skillMastery.findMany(),
        prisma.attempt.findMany({ select: { questionId: true } }),
      ]);

      const requested = typeof args.requested_pattern === "string" ? args.requested_pattern : null;
      const eligible = requested
        ? questions.filter((q) => q.primaryPatternId === requested || q.secondaryPatternId === requested)
        : questions;

      const pick = pickNextQuestion({
        questions: eligible.map((q) => ({
          id: q.id,
          primaryPatternId: q.primaryPatternId,
          secondaryPatternId: q.secondaryPatternId,
          voiceSuitability: q.voiceSuitability as "high" | "medium" | "desk_only",
          difficulty: q.difficulty,
        })),
        mastery: mastery.map((m) => ({
          patternId: m.patternId,
          masteryPct: m.masteryPct,
          nextReviewAt: m.nextReviewAt,
        })),
        attemptedQuestionIds: new Set(attempts.map((a) => a.questionId)),
        sessionQuestionIds: new Set(state.served),
        mode,
        now: new Date(),
      });

      if (!pick) return { done: true, message: "No more eligible questions this session." };

      const question = questions.find((q) => q.id === pick.questionId)!;
      const record = rowToRecord(question);

      state.served.push(pick.questionId);
      state.hints[pick.questionId] = 0;
      state.testRecognition[pick.questionId] = pick.testRecognition;
      await saveState(sessionId, state);

      return {
        question_context: JSON.parse(questionContext(record, pick.testRecognition)),
        scheduler_reason: pick.reason,
      };
    }

    case "get_hint": {
      const questionId = String(args.question_id);
      const question = await prisma.question.findUniqueOrThrow({ where: { id: questionId } });
      const record = rowToRecord(question);
      const current = state.hints[questionId] ?? 0;

      let level: number;
      if (args.jump_to_level === 5) level = 5;
      else level = Math.min(current + 1, 6); // one rung at a time, server-enforced

      state.hints[questionId] = level;
      await saveState(sessionId, state);

      const key = `L${level}` as keyof typeof record.hintLadder;
      return { level, hint: record.hintLadder[key] };
    }

    case "submit_reasoning": {
      const questionId = String(args.question_id);
      const transcript = String(args.reasoning_transcript ?? "");
      const question = await prisma.question.findUniqueOrThrow({ where: { id: questionId } });
      const record = rowToRecord(question);

      const verdict = await evaluateReasoning({
        record,
        transcript,
        hintLevel: state.hints[questionId] ?? 0,
        mode,
      });

      state.verdicts[questionId] = verdict;
      await saveState(sessionId, state);
      return { evaluator_verdict: verdict };
    }

    case "record_attempt": {
      const questionId = String(args.question_id);
      const outcome = String(args.outcome); // solved | walked_through | skipped
      const summary = String(args.transcript_summary ?? "");
      const hintLevel = state.hints[questionId] ?? 0;
      const verdict = state.verdicts[questionId] ?? null;

      const solvedIndependently = outcome === "solved" && hintLevel <= 1;

      const question = await prisma.question.findUniqueOrThrow({ where: { id: questionId } });

      await prisma.attempt.create({
        data: {
          questionId,
          sessionId,
          mode,
          transcriptSummary: summary,
          hintLevelReached: hintLevel,
          solvedIndependently,
          recognitionScore: verdict?.scores.recognition ?? null,
          setupScore: verdict?.scores.setup ?? null,
          calculationScore: verdict?.scores.calculation ?? null,
          explanationScore: verdict?.scores.explanation ?? null,
          mistakeNote: verdict?.mistake_note ?? (outcome === "skipped" ? "skipped" : ""),
          evaluatorVerdict: JSON.stringify(verdict ?? {}),
        },
      });

      // Update mastery for the primary pattern (skipped questions leave mastery untouched).
      if (outcome !== "skipped") {
        const prev = await prisma.skillMastery.upsert({
          where: { patternId: question.primaryPatternId },
          create: { patternId: question.primaryPatternId },
          update: {},
        });
        const next = applyAttempt(
          {
            recognition: prev.recognition,
            setup: prev.setup,
            calculation: prev.calculation,
            explanation: prev.explanation,
            streak: prev.streak,
          },
          {
            scores: verdict?.scores ?? {
              recognition: null,
              setup: null,
              calculation: null,
              explanation: null,
            },
            hintLevelReached: hintLevel,
            solvedIndependently,
          }
        );
        await prisma.skillMastery.update({
          where: { patternId: question.primaryPatternId },
          data: {
            recognition: next.recognition,
            setup: next.setup,
            calculation: next.calculation,
            explanation: next.explanation,
            masteryPct: next.masteryPct,
            confidence: next.confidence,
            streak: next.streak,
            lastAttemptAt: new Date(),
            nextReviewAt: next.nextReviewAt,
          },
        });
      }

      return { recorded: true, hint_level_reached: hintLevel, solved_independently: solvedIndependently };
    }

    case "find_similar_question": {
      const questionId = String(args.question_id);
      const base = await prisma.question.findUniqueOrThrow({ where: { id: questionId } });
      const attempted = new Set(
        (await prisma.attempt.findMany({ select: { questionId: true } })).map((a) => a.questionId)
      );
      const candidates = await prisma.question.findMany({
        where: {
          active: true,
          primaryPatternId: base.primaryPatternId,
          id: { notIn: [...state.served, questionId] },
          ...(mode === "drive" ? { voiceSuitability: { not: "desk_only" } } : {}),
        },
      });
      const fresh = candidates.filter((q) => !attempted.has(q.id));
      const chosen = (fresh.length > 0 ? fresh : candidates)[0];
      if (!chosen) return { found: false, message: "No other question with this pattern yet." };

      const record = rowToRecord(chosen);
      state.served.push(chosen.id);
      state.hints[chosen.id] = 0;
      state.testRecognition[chosen.id] = true;
      await saveState(sessionId, state);
      return {
        question_context: JSON.parse(questionContext(record, true)),
        scheduler_reason: "transfer",
      };
    }

    case "get_variation": {
      const questionId = String(args.question_id);
      const question = await prisma.question.findUniqueOrThrow({ where: { id: questionId } });
      const record = rowToRecord(question);
      const idx =
        typeof args.index === "number"
          ? args.index
          : 0;
      const variation = record.variations[idx];
      if (!variation) return { found: false, message: "No more pre-generated variations for this question." };
      return {
        variation_statement_audio: variation.statementAudio,
        grader_note: variation.note,
        parent_question_id: questionId,
      };
    }

    case "defer_to_desk": {
      const questionId = String(args.question_id);
      const deferred: string[] = JSON.parse(session.deferredQuestionIds || "[]");
      if (!deferred.includes(questionId)) deferred.push(questionId);
      await prisma.session.update({
        where: { id: sessionId },
        data: { deferredQuestionIds: JSON.stringify(deferred) },
      });
      return { deferred: true };
    }

    case "end_session": {
      const attempts = await prisma.attempt.findMany({
        where: { sessionId },
        include: { question: { include: { primaryPattern: true } } },
      });
      const lines = attempts.map((a) => {
        const status = a.solvedIndependently
          ? "solved independently"
          : a.hintLevelReached >= 5
            ? `walked through (L${a.hintLevelReached})`
            : `solved with hints (L${a.hintLevelReached})`;
        const mistake = a.mistakeNote ? ` — mistake: ${a.mistakeNote}` : "";
        return `• ${a.question.primaryPattern.name} [${a.questionId}]: ${status}${mistake}`;
      });
      const weak = await prisma.skillMastery.findMany({
        orderBy: { masteryPct: "asc" },
        take: 3,
        include: { pattern: true },
      });
      const summary = [
        `Session (${session.mode}) — ${attempts.length} question(s):`,
        ...lines,
        ``,
        `Patterns to revisit: ${weak.map((w) => `${w.pattern.name} (${w.masteryPct}%)`).join(", ")}`,
      ].join("\n");

      await prisma.session.update({
        where: { id: sessionId },
        data: { endedAt: new Date(), summaryText: summary },
      });
      return { ended: true, summary };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
