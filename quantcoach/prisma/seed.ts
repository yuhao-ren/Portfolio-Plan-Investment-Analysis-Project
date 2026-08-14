import { PrismaClient } from "@prisma/client";
import { QuestionRecordSchema, recordToRow } from "../src/lib/records";
import patterns from "../data/patterns.json";
import questions from "../data/seed-questions.json";

const prisma = new PrismaClient();

async function main() {
  for (const p of patterns) {
    await prisma.pattern.upsert({
      where: { id: p.id },
      create: p,
      update: p,
    });
  }
  console.log(`Seeded ${patterns.length} patterns.`);

  let count = 0;
  for (const raw of questions) {
    const record = QuestionRecordSchema.parse(raw);
    const row = recordToRow(record);
    await prisma.question.upsert({
      where: { id: row.id },
      create: row,
      update: row,
    });
    count++;
  }
  console.log(`Seeded ${count} questions.`);

  // Initialize mastery rows for every pattern that has at least one question.
  const used = new Set<string>();
  for (const raw of questions) {
    used.add(raw.primaryPatternId);
    if (raw.secondaryPatternId) used.add(raw.secondaryPatternId);
  }
  for (const patternId of used) {
    await prisma.skillMastery.upsert({
      where: { patternId },
      create: { patternId },
      update: {},
    });
  }
  console.log(`Initialized mastery for ${used.size} patterns.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
