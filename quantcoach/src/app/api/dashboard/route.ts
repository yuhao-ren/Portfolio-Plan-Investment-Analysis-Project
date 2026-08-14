import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const [mastery, recentSessions, recentAttempts, questionCount] = await Promise.all([
    prisma.skillMastery.findMany({
      include: { pattern: true },
      orderBy: { masteryPct: "asc" },
    }),
    prisma.session.findMany({
      orderBy: { startedAt: "desc" },
      take: 10,
    }),
    prisma.attempt.findMany({
      orderBy: { startedAt: "desc" },
      take: 25,
      include: { question: { select: { id: true, topic: true, primaryPatternId: true } } },
    }),
    prisma.question.count({ where: { active: true } }),
  ]);

  // Deferred desk queue: union across sessions, most recent first.
  const deferredIds: string[] = [];
  for (const s of recentSessions) {
    for (const id of JSON.parse(s.deferredQuestionIds || "[]")) {
      if (!deferredIds.includes(id)) deferredIds.push(id);
    }
  }
  const deferred = deferredIds.length
    ? await prisma.question.findMany({
        where: { id: { in: deferredIds } },
        select: { id: true, statement: true, topic: true, difficulty: true },
      })
    : [];

  return NextResponse.json({
    questionCount,
    mastery: mastery.map((m) => ({
      patternId: m.patternId,
      name: m.pattern.name,
      domain: m.pattern.domain,
      masteryPct: m.masteryPct,
      recognition: Math.round(m.recognition * 10) / 10,
      setup: Math.round(m.setup * 10) / 10,
      calculation: Math.round(m.calculation * 10) / 10,
      explanation: Math.round(m.explanation * 10) / 10,
      confidence: m.confidence,
      streak: m.streak,
      nextReviewAt: m.nextReviewAt,
    })),
    recentSessions: recentSessions.map((s) => ({
      id: s.id,
      mode: s.mode,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      summaryText: s.summaryText,
    })),
    recentAttempts: recentAttempts.map((a) => ({
      questionId: a.questionId,
      pattern: a.question.primaryPatternId,
      hintLevelReached: a.hintLevelReached,
      solvedIndependently: a.solvedIndependently,
      mistakeNote: a.mistakeNote,
      startedAt: a.startedAt,
    })),
    deferredQueue: deferred,
  });
}
