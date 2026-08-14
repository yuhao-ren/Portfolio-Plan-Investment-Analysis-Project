// The silent Evaluator (design §4.2): grades spoken reasoning against the
// canonical rubric using Claude, returning a structured verdict the tutor
// treats as ground truth.

import Anthropic from "@anthropic-ai/sdk";
import { evaluatorSystemPrompt } from "./prompts";
import { EvaluatorVerdictSchema, type EvaluatorVerdict, type QuestionRecord } from "./records";

// Sonnet-tier default per the approved design's budget constraint (§7);
// override with EVALUATOR_MODEL (e.g. claude-opus-5 for maximum rigor).
const EVALUATOR_MODEL = process.env.EVALUATOR_MODEL ?? "claude-sonnet-5";

const client = new Anthropic();

const VERDICT_JSON_SCHEMA = {
  type: "object",
  properties: {
    correctly_identified: { type: "array", items: { type: "string" } },
    errors: { type: "array", items: { type: "string" } },
    rubric_progress: { type: "string" },
    scores: {
      type: "object",
      properties: {
        recognition: { type: ["integer", "null"] },
        setup: { type: ["integer", "null"] },
        calculation: { type: ["integer", "null"] },
        explanation: { type: ["integer", "null"] },
      },
      required: ["recognition", "setup", "calculation", "explanation"],
      additionalProperties: false,
    },
    recommended_action: { type: "string" },
    novel_approach: { type: "boolean" },
    novel_approach_description: { type: "string" },
    final_answer_correct: { type: ["boolean", "null"] },
    mistake_note: { type: "string" },
  },
  required: [
    "correctly_identified",
    "errors",
    "rubric_progress",
    "scores",
    "recommended_action",
    "novel_approach",
    "novel_approach_description",
    "final_answer_correct",
    "mistake_note",
  ],
  additionalProperties: false,
} as const;

export async function evaluateReasoning(params: {
  record: QuestionRecord;
  transcript: string; // the student's reasoning so far (delta or full)
  hintLevel: number;
  mode: "drive" | "study" | "interview";
}): Promise<EvaluatorVerdict> {
  const { record, transcript, hintLevel, mode } = params;

  const userPayload = JSON.stringify({
    question: {
      statement: record.statement,
      canonical_solution: record.canonicalSolution,
      rubric: record.rubric,
      common_mistake: record.commonMistake,
      recognition_clues: record.recognitionClues,
    },
    current_hint_level: hintLevel,
    mode,
    student_reasoning_transcript: transcript,
  });

  const response = await client.messages.create({
    model: EVALUATOR_MODEL,
    max_tokens: 2000,
    system: [
      {
        type: "text",
        text: evaluatorSystemPrompt(),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userPayload }],
    output_config: {
      format: { type: "json_schema", schema: VERDICT_JSON_SCHEMA },
    },
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Evaluator refused the request");
  }
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("Evaluator returned no text block");
  }
  return EvaluatorVerdictSchema.parse(JSON.parse(text.text));
}
