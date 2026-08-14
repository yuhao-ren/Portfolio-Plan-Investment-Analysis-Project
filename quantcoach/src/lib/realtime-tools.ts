// Tool (function) definitions exposed to the OpenAI Realtime session.
// The client receives function_call events over the data channel and relays
// them to POST /api/tools; results go back as function_call_output items.

export interface RealtimeToolDef {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

const none = { type: "object", properties: {}, additionalProperties: false };

export const TUTOR_TOOLS: RealtimeToolDef[] = [
  {
    type: "function",
    name: "get_next_question",
    description:
      "Get the next question from the mastery-model scheduler. Call at session start and after finishing/skipping a question. Returns the question context (audio statement, rubric, answer key) and whether recognition is being tested (if so, do not name the technique).",
    parameters: {
      type: "object",
      properties: {
        requested_pattern: {
          type: "string",
          description:
            "Optional: a pattern id the student explicitly asked to practice (e.g. 'bayes-reverse-conditioning'). Usually omit and let the scheduler decide.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_hint",
    description:
      "Get the next hint-ladder rung for the current question. The server enforces one rung at a time. Pass jump_to_level 5 only when the student explicitly asks to be walked through it.",
    parameters: {
      type: "object",
      properties: {
        question_id: { type: "string" },
        jump_to_level: {
          type: "integer",
          description: "Optional: jump directly to this level (only 5, on explicit student request).",
        },
      },
      required: ["question_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "submit_reasoning",
    description:
      "Send the student's latest substantive reasoning to the silent Evaluator and receive a structured verdict. Call this whenever the student completes a meaningful reasoning turn or states a final answer — BEFORE claiming anything is correct or advancing the hint ladder.",
    parameters: {
      type: "object",
      properties: {
        question_id: { type: "string" },
        reasoning_transcript: {
          type: "string",
          description: "The student's reasoning so far, in their words (paraphrase is fine, keep the math).",
        },
      },
      required: ["question_id", "reasoning_transcript"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "record_attempt",
    description:
      "Record the outcome of the current question once it is finished (solved, walked through, or skipped). Updates the mastery model and spaced-repetition schedule.",
    parameters: {
      type: "object",
      properties: {
        question_id: { type: "string" },
        outcome: { type: "string", enum: ["solved", "walked_through", "skipped"] },
        transcript_summary: {
          type: "string",
          description: "One or two lines summarizing how it went.",
        },
      },
      required: ["question_id", "outcome", "transcript_summary"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "find_similar_question",
    description:
      "Get a library question that uses the same thinking pattern as the given question but a different surface — for transfer practice.",
    parameters: {
      type: "object",
      properties: { question_id: { type: "string" } },
      required: ["question_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_variation",
    description:
      "Get a pre-generated variation of the given question (same mental move, different disguise). Use right after a solve to test transfer.",
    parameters: {
      type: "object",
      properties: {
        question_id: { type: "string" },
        index: { type: "integer", description: "Which variation (0-based). Omit for the first unused one." },
      },
      required: ["question_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "defer_to_desk",
    description: "Push a desk-only question to the Study Mode queue and move on.",
    parameters: {
      type: "object",
      properties: { question_id: { type: "string" } },
      required: ["question_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "end_session",
    description:
      "End the session: persists the session summary / mistake log. Call when planned time is up or the student says to wrap up, then give your spoken recap.",
    parameters: none,
  },
];

/** Interview mode: no hints, no variations mid-stream, no pattern requests. */
export const INTERVIEWER_TOOLS: RealtimeToolDef[] = TUTOR_TOOLS.filter((t) =>
  ["get_next_question", "submit_reasoning", "record_attempt", "end_session"].includes(t.name)
);
