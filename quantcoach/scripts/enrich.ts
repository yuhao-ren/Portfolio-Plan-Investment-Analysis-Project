// Offline enrichment pipeline (design §3.5): source material in, structured
// question records out — for human review before import.
//
// Usage:
//   ANTHROPIC_API_KEY=... pnpm enrich <path-to-source.pdf|txt|md> [--source-ref "green book ch.4"]
//
// Output: data/enriched/<basename>.review.json — review/edit it, then:
//   pnpm enrich:import data/enriched/<basename>.review.json

import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import patterns from "../data/patterns.json";

const ENRICH_MODEL = process.env.ENRICH_MODEL ?? "claude-opus-5";

const client = new Anthropic();

const RECORD_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          slug: { type: "string", description: "short-kebab-case-id for this question" },
          topic: { type: "string" },
          subtopic: { type: "string" },
          statement: { type: "string" },
          statementAudio: { type: "string" },
          difficulty: { type: "integer" },
          primaryPatternId: { type: "string" },
          secondaryPatternId: { type: ["string", "null"] },
          proposedNewPattern: {
            type: ["string", "null"],
            description: "If no existing pattern fits, propose a new kebab-case pattern id here and still pick the closest existing one above.",
          },
          recognitionClues: { type: "array", items: { type: "string" } },
          prerequisites: { type: "array", items: { type: "string" } },
          commonMistake: { type: "string" },
          voiceSuitability: { type: "string", enum: ["high", "medium", "desk_only"] },
          hintLadder: {
            type: "object",
            properties: {
              L1: { type: "string" }, L2: { type: "string" }, L3: { type: "string" },
              L4: { type: "string" }, L5: { type: "string" }, L6: { type: "string" },
            },
            required: ["L1", "L2", "L3", "L4", "L5", "L6"],
            additionalProperties: false,
          },
          rubric: {
            type: "object",
            properties: {
              required: { type: "array", items: { type: "string" } },
              bonus: { type: "array", items: { type: "string" } },
            },
            required: ["required", "bonus"],
            additionalProperties: false,
          },
          canonicalSolution: { type: "string" },
          variations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                statementAudio: { type: "string" },
                note: { type: "string" },
              },
              required: ["statementAudio", "note"],
              additionalProperties: false,
            },
          },
        },
        required: [
          "slug", "topic", "subtopic", "statement", "statementAudio", "difficulty",
          "primaryPatternId", "secondaryPatternId", "proposedNewPattern",
          "recognitionClues", "prerequisites", "commonMistake", "voiceSuitability",
          "hintLadder", "rubric", "canonicalSolution", "variations",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
} as const;

function enrichmentPrompt(): string {
  const catalog = patterns.map((p) => `- ${p.id}: ${p.name} — ${p.description}`).join("\n");
  return `
You are building a quant-interview study database. Extract EVERY distinct interview
question from the attached source material and enrich each into a structured record.

Rules:
- statementAudio: rewrite the statement to be spoken aloud to someone who cannot see
  a screen — numbers in natural speech, no visual-only notation, long setups split
  into two chunks with a brief "Got the setup?" check.
- difficulty: 1 (warm-up) to 5 (hard).
- primaryPatternId / secondaryPatternId MUST come from this catalog:
${catalog}
  If nothing fits well, pick the closest and put a proposed new kebab-case id in
  proposedNewPattern.
- recognitionClues: 2-4 clues describing what should tip the solver off to the pattern.
- commonMistake: the single most common wrong path.
- voiceSuitability: "high" if solvable entirely in one's head while driving; "medium"
  if it needs sustained working memory; "desk_only" if it needs paper, pictures, or code.
- hintLadder: L1 diagnostic question → L2 point toward the thinking strategy →
  L3 name the method → L4 help construct the setup → L5 walk through together →
  L6 full solution plus the recognition lesson ("what should have tipped you off").
  Write each rung as the words a voice tutor would actually say.
- rubric.required: what a correct VERBAL answer must contain (3-5 checkable elements).
- canonicalSolution: complete and correct; double-check the math.
- variations: 2 fresh problems using the same mental move with a different surface,
  each with the answer in the note field.

Skip exercises that are pure bookwork (definitions, derivations with no interview value).
`.trim();
}

async function main() {
  const args = process.argv.slice(2);
  const srcPath = args.find((a) => !a.startsWith("--"));
  if (!srcPath) {
    console.error("Usage: pnpm enrich <source.pdf|txt|md> [--source-ref \"label\"]");
    process.exit(1);
  }
  const refIdx = args.indexOf("--source-ref");
  const sourceRef = refIdx >= 0 ? args[refIdx + 1] : path.basename(srcPath);

  const ext = path.extname(srcPath).toLowerCase();
  const isPdf = ext === ".pdf";

  const content: Anthropic.ContentBlockParam[] = [];
  if (isPdf) {
    const data = fs.readFileSync(srcPath).toString("base64");
    content.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data },
    });
  } else {
    content.push({ type: "text", text: fs.readFileSync(srcPath, "utf8") });
  }
  content.push({ type: "text", text: enrichmentPrompt() });

  console.log(`Enriching ${srcPath} with ${ENRICH_MODEL}…`);

  const stream = client.messages.stream({
    model: ENRICH_MODEL,
    max_tokens: 64000,
    messages: [{ role: "user", content }],
    output_config: { format: { type: "json_schema", schema: RECORD_SCHEMA } },
  });
  const response = await stream.finalMessage();

  if (response.stop_reason === "refusal") {
    console.error("Model declined the request.");
    process.exit(1);
  }
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    console.error("No text in response");
    process.exit(1);
  }

  const parsed = JSON.parse(text.text) as { questions: Record<string, unknown>[] };
  const records: Record<string, unknown>[] = parsed.questions.map((q) => ({
    id: `q-${q.slug}`,
    sourceRef,
    similarQuestionIds: [],
    ...q,
  }));

  const outDir = path.join(process.cwd(), "data", "enriched");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(
    outDir,
    `${path.basename(srcPath, path.extname(srcPath))}.review.json`
  );
  fs.writeFileSync(outPath, JSON.stringify(records, null, 2));

  const proposed = records
    .map((r) => r.proposedNewPattern)
    .filter((p): p is string => typeof p === "string" && p.length > 0);
  console.log(`Wrote ${records.length} records to ${outPath}`);
  if (proposed.length) {
    console.log(`Proposed new patterns to consider adding to data/patterns.json: ${[...new Set(proposed)].join(", ")}`);
  }
  console.log("Review/edit the file, then run: pnpm enrich:import " + path.relative(process.cwd(), outPath));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
