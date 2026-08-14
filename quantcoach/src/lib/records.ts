// Typed views over the JSON-string columns in the SQLite schema.
// All (de)serialization for question/attempt records lives here.

import { z } from "zod";
import type { Question } from "@prisma/client";

export const HintLadderSchema = z.object({
  L1: z.string(),
  L2: z.string(),
  L3: z.string(),
  L4: z.string(),
  L5: z.string(),
  L6: z.string(),
});
export type HintLadder = z.infer<typeof HintLadderSchema>;

export const RubricSchema = z.object({
  required: z.array(z.string()),
  bonus: z.array(z.string()).default([]),
});
export type Rubric = z.infer<typeof RubricSchema>;

export const VariationSchema = z.object({
  statementAudio: z.string(),
  note: z.string().default(""),
});
export type Variation = z.infer<typeof VariationSchema>;

export const QuestionRecordSchema = z.object({
  id: z.string(),
  sourceRef: z.string(),
  topic: z.string(),
  subtopic: z.string(),
  statement: z.string(),
  statementAudio: z.string(),
  difficulty: z.number().int().min(1).max(5),
  primaryPatternId: z.string(),
  secondaryPatternId: z.string().nullable(),
  recognitionClues: z.array(z.string()),
  prerequisites: z.array(z.string()),
  commonMistake: z.string(),
  similarQuestionIds: z.array(z.string()),
  voiceSuitability: z.enum(["high", "medium", "desk_only"]),
  hintLadder: HintLadderSchema,
  rubric: RubricSchema,
  canonicalSolution: z.string(),
  variations: z.array(VariationSchema),
});
export type QuestionRecord = z.infer<typeof QuestionRecordSchema>;

/** Convert a validated record into Prisma column values. */
export function recordToRow(r: QuestionRecord) {
  return {
    id: r.id,
    sourceRef: r.sourceRef,
    topic: r.topic,
    subtopic: r.subtopic,
    statement: r.statement,
    statementAudio: r.statementAudio,
    difficulty: r.difficulty,
    primaryPatternId: r.primaryPatternId,
    secondaryPatternId: r.secondaryPatternId,
    recognitionClues: JSON.stringify(r.recognitionClues),
    prerequisites: JSON.stringify(r.prerequisites),
    commonMistake: r.commonMistake,
    similarQuestionIds: JSON.stringify(r.similarQuestionIds),
    voiceSuitability: r.voiceSuitability,
    hintLadder: JSON.stringify(r.hintLadder),
    rubric: JSON.stringify(r.rubric),
    canonicalSolution: r.canonicalSolution,
    variations: JSON.stringify(r.variations),
  };
}

/** Convert a Prisma row back into the typed record. */
export function rowToRecord(q: Question): QuestionRecord {
  return QuestionRecordSchema.parse({
    id: q.id,
    sourceRef: q.sourceRef,
    topic: q.topic,
    subtopic: q.subtopic,
    statement: q.statement,
    statementAudio: q.statementAudio,
    difficulty: q.difficulty,
    primaryPatternId: q.primaryPatternId,
    secondaryPatternId: q.secondaryPatternId,
    recognitionClues: JSON.parse(q.recognitionClues),
    prerequisites: JSON.parse(q.prerequisites),
    commonMistake: q.commonMistake,
    similarQuestionIds: JSON.parse(q.similarQuestionIds),
    voiceSuitability: q.voiceSuitability,
    hintLadder: JSON.parse(q.hintLadder),
    rubric: JSON.parse(q.rubric),
    canonicalSolution: q.canonicalSolution,
    variations: JSON.parse(q.variations),
  });
}

export const EvaluatorVerdictSchema = z.object({
  correctly_identified: z.array(z.string()),
  errors: z.array(z.string()),
  rubric_progress: z.string(), // e.g. "2/4"
  scores: z.object({
    recognition: z.number().int().min(0).max(5).nullable(),
    setup: z.number().int().min(0).max(5).nullable(),
    calculation: z.number().int().min(0).max(5).nullable(),
    explanation: z.number().int().min(0).max(5).nullable(),
  }),
  recommended_action: z.string(),
  novel_approach: z.boolean(),
  novel_approach_description: z.string().default(""),
  final_answer_correct: z.boolean().nullable(),
  mistake_note: z.string().default(""),
});
export type EvaluatorVerdict = z.infer<typeof EvaluatorVerdictSchema>;
