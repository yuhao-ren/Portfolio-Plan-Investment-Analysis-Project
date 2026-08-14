// Import reviewed enrichment output into the question library.
// Usage: pnpm enrich:import data/enriched/<file>.review.json

import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { QuestionRecordSchema, recordToRow } from "../src/lib/records";

const prisma = new PrismaClient();

async function main() {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) {
    console.error("Usage: pnpm enrich:import <path-to-review.json>");
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(raw)) {
    console.error("Expected a JSON array of question records.");
    process.exit(1);
  }

  const knownPatterns = new Set(
    (await prisma.pattern.findMany({ select: { id: true } })).map((p) => p.id)
  );

  let imported = 0;
  const skipped: string[] = [];
  for (const item of raw) {
    // Strip pipeline-only fields before validation.
    const { proposedNewPattern: _p, slug: _s, ...candidate } = item;
    const parsed = QuestionRecordSchema.safeParse(candidate);
    if (!parsed.success) {
      skipped.push(`${item.id ?? "?"}: ${parsed.error.issues[0]?.message}`);
      continue;
    }
    const r = parsed.data;
    if (!knownPatterns.has(r.primaryPatternId)) {
      skipped.push(`${r.id}: unknown primaryPatternId '${r.primaryPatternId}' — add it to data/patterns.json and re-seed first`);
      continue;
    }
    if (r.secondaryPatternId && !knownPatterns.has(r.secondaryPatternId)) {
      r.secondaryPatternId = null;
    }
    const row = recordToRow(r);
    await prisma.question.upsert({ where: { id: row.id }, create: row, update: row });
    await prisma.skillMastery.upsert({
      where: { patternId: r.primaryPatternId },
      create: { patternId: r.primaryPatternId },
      update: {},
    });
    imported++;
  }

  console.log(`Imported ${imported} questions.`);
  if (skipped.length) {
    console.log("Skipped:");
    for (const s of skipped) console.log("  - " + s);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
