# QuantCoach

A voice-interactive quant interview coach with a curriculum/mastery engine underneath —
the working implementation of [`docs/voice-interview-prep-design.md`](../docs/voice-interview-prep-design.md).

Talk through quant problems hands-free (in the car, on a walk); a voice tutor listens to
your reasoning, corrects and guides you through a graded hint ladder, and a silent
Claude evaluator grades every attempt against a rubric. The mastery model learns *which
mental moves you can recognize and execute* — not which question IDs you've seen — and
schedules tomorrow's practice accordingly.

## What's here

| Piece | Where | Status |
|---|---|---|
| Question library (16 seed questions, 17 thinking patterns) | `data/`, `prisma/seed.ts` | ✅ seeded |
| Scheduler (spaced repetition, weak-pattern targeting, voice-suitability) | `src/lib/scheduler.ts` | ✅ unit-tested |
| Mastery model (Recognition/Setup/Calculation/Explanation sub-scores) | `src/lib/mastery.ts` | ✅ unit-tested |
| 7-level hint ladder (server enforces one rung at a time) | `src/lib/tools-service.ts` | ✅ smoke-tested |
| Silent Evaluator (Claude grades reasoning against the rubric) | `src/lib/evaluator.ts` | ✅ (needs `ANTHROPIC_API_KEY`) |
| Voice tutor (OpenAI Realtime over WebRTC, tool-calling) | `src/lib/realtime-client.ts`, `/api/realtime/token` | ✅ (needs `OPENAI_API_KEY`) |
| Drive / Study / Interview modes | `src/lib/prompts.ts`, `src/app/page.tsx` | ✅ |
| Mastery dashboard + desk queue + mistake logs | `/dashboard` | ✅ |
| Enrichment pipeline (your PDFs → structured records) | `scripts/enrich.ts` | ✅ |
| PWA (add to home screen, wake lock) | `public/manifest.json` | ✅ |

## Setup

```bash
cd quantcoach
pnpm install
cp .env.example .env          # fill in OPENAI_API_KEY and ANTHROPIC_API_KEY
pnpm db:push                  # create the SQLite database
pnpm db:seed                  # load patterns + 16 starter questions
pnpm dev                      # http://localhost:3000
```

Open it on your phone (same network or deployed), **Add to Home Screen**, tap
**Start session**, and talk. Spoken commands the tutor honors:
*"give me a minute" · "repeat the question" · "give me a hint" ·
"just walk me through it" · "skip this one" · "wrap it up"*.

> **Mic access requires HTTPS** (or localhost). For phone testing, either deploy
> (Vercel free tier works — swap SQLite for Postgres/Supabase, see below) or tunnel
> (`ngrok http 3000`).

## Adding your own questions (green book, OpenQuant, quantquestion.io saves…)

```bash
pnpm enrich path/to/chapter.pdf --source-ref "green book ch.4"
# → writes data/enriched/chapter.review.json (Claude Opus extracts + enriches)
# Review/edit the file — fix tags, check solutions — then:
pnpm enrich:import data/enriched/chapter.review.json
```

Only import material you legitimately have access to; this tool is for personal,
private study (design doc §3.1). Records with unknown pattern tags are skipped until
you add the pattern to `data/patterns.json` and re-run `pnpm db:seed`.

## How a session works

1. Client mints an ephemeral Realtime token from `/api/realtime/token` (your OpenAI key
   never reaches the browser) and connects via WebRTC.
2. The tutor calls `get_next_question` → the scheduler picks by due reviews → weak
   patterns → new material, filtered to voice-suitable questions in Drive Mode. When a
   pick targets recognition, pattern names are withheld from the tutor's context.
3. You reason aloud. The tutor relays your reasoning through `submit_reasoning` to the
   silent Evaluator (Claude), which returns a structured verdict — the tutor may not
   claim "correct" or advance the hint ladder without one.
4. `record_attempt` writes the attempt, updates the pattern's mastery sub-scores, and
   sets the next spaced-repetition review date. Desk-only questions get deferred to the
   Study queue; `end_session` writes the mistake log you'll see on the dashboard.

## Costs (design §7)

Defaults are chosen for the under-$50/month budget: `gpt-realtime-mini` for voice,
`claude-sonnet-5` for the evaluator, offline enrichment on `claude-opus-5` (one-time
per source). Typical use (~1 hr/day) lands around $35–41/month. Set
`REALTIME_MODEL=gpt-realtime` for higher conversational quality at roughly 3× the price.

## Moving to Postgres/Supabase (for deployment)

1. In `prisma/schema.prisma`, change the datasource provider to `postgresql`.
2. Point `DATABASE_URL` at your Supabase connection string.
3. `pnpm db:push && pnpm db:seed`.

## Tests

```bash
pnpm test        # scheduler + mastery model unit tests
pnpm typecheck
pnpm build
```
