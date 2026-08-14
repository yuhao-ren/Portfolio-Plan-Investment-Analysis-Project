# QuantCoach — Voice-Interactive Quant Interview Coach

**Design Document · v1 · August 2026**

---

## 1. Vision & Feasibility Verdict

**The product in one paragraph.** A personal quant interview coach with a curriculum/mastery engine underneath it. You upload question sets you legitimately own (the green book, OpenQuant, questions saved from quantquestion.io, MSCF prep material, your own notes). An offline pipeline turns every question into a structured record — thinking-pattern tags, recognition clues, a graded hint ladder, a verbal-answer rubric, and pre-generated variations. Then, on your morning or evening drive, you put in your earbuds, tap once, and say *"give me a 25-minute quant session."* A voice tutor reads you a problem chosen by your mastery model, listens to your reasoning aloud, corrects and guides you Socratically, walks you through the solution when you're truly stuck, and then serves a variation that tests the same mental move in a different disguise. Everything you do updates a per-skill mastery model, so tomorrow's session targets what you actually need.

**Feasibility: yes, with today's (2026) infrastructure.** No speculative technology is required:

- **Live voice** runs on the OpenAI Realtime API — low-latency speech-to-speech over WebRTC directly from a browser, with function/tool calling so the spoken tutor can drive a backend study system. (The Claude API has no speech-to-speech endpoint — Claude's voice mode exists only in its consumer apps — so Claude is used where its reasoning quality matters most: offline enrichment and silent evaluation.)
- **Content intelligence** runs on Claude via the Batch API (50% off), which makes one-time enrichment of a few hundred questions cost single-digit dollars.
- **Cost fits under $50/month** at ~1 hour/day of use, by design (see §7): the mini realtime tier, aggressive prompt caching, context discipline, and moving all expensive generation offline.

**The core design distinction.** The system must learn things like:

> *"Yuhao can solve standard Bayes questions, but he often fails to recognize when conditioning is the right first move."*

rather than:

> *"Yuhao got Question 37 wrong."*

That distinction — modeling **which mental moves you can recognize and execute**, not which question IDs you've seen — is what makes this genuinely useful for interview preparation, and it drives every design decision below.

### Architecture at a glance

```
             iPhone / Computer  (PWA)
                     │
               Voice / Screen
                     │
                  WebRTC
                     │
                     ▼
           OpenAI Realtime Model          ← the VOICE: conversation, coaching
                     │  (tool calls)
           ┌─────────┴─────────┐
           │                   │
           ▼                   ▼
     Tutor Controller      Study DB (Postgres/Supabase)
           │                   │
           │             ┌─────┴──────┐
           ▼             ▼            ▼
   Silent Evaluator   Mastery      History
   (Claude, text)     Model        + Attempts
           │
           ▼
   Question Library  ←── Offline enrichment pipeline (Claude Batch)
           │
           ▼
   Uploaded Sources / Vector Store
```

Division of intelligence, stated once and relied on everywhere:

| Component | Model | Job |
|---|---|---|
| **Tutor** (live) | OpenAI Realtime (mini tier) | Natural conversation, reading problems aloud, delivering hints from the ladder, pacing, encouragement |
| **Evaluator** (live, silent) | Claude (text, on the transcript) | Grade the user's spoken reasoning against the canonical rubric; tell the tutor its next move |
| **Enrichment** (offline) | Claude Opus via Batch API | Extract, tag, and enrich every question: patterns, clues, hint ladders, rubrics, variations |

The live voice model **never has to derive the math**. It coaches against a pre-computed answer key, with a stronger silent model checking the user's reasoning. This is what makes the cheap, fast realtime tier viable for a domain where raw realtime-model math would not be trustworthy.

---

## 2. Real-Life Usage Analysis

Design rigor here means walking through the actual moments of use and deriving hard requirements from each. The driving scenario is the forcing function: it is the most constrained environment, and a system that works there works everywhere.

### 2.1 The morning drive (25 minutes, hands-free, eyes-free)

You cannot look at a screen, write anything down, or hold complex algebra on paper. Consequences:

- **Requirement — voice-suitability tagging.** Every question in the library carries a `voice_suitability` score assigned during enrichment. Voice-suitable: problems whose state fits in working memory — conditional probability setups, expectation by symmetry, complement counting, first-step recursion with small state spaces, market-making intuition, Fermi estimates, brainteasers. Desk-only: heavy integrals, matrix manipulation, long algebraic grinds, anything requiring code.
- **Requirement — graceful deferral.** When the scheduler's top-priority item is desk-only, the tutor says: *"This one is better with a screen. I've saved it for your desk session,"* and picks the next voice-suitable item. Deferred items appear at the top of the evening Study Mode queue.
- **Requirement — audio-friendly statements.** The enrichment pipeline writes an `statement_audio` rewrite of every problem: numbers spoken naturally, no notation that only works visually ("P of A given B" not "P(A|B)" read literally), long setups broken into two spoken chunks with a comprehension check ("Got the setup?").

### 2.2 Thinking silence — the make-or-break interaction detail

Quant problems involve 15–90 seconds of genuine silent thought. Default voice-activity detection (VAD) treats ~1 second of silence as end-of-turn and will barge in constantly, which would make the product unusable.

- **Requirement — long-silence turn policy.** Configure Realtime turn detection for long silence tolerance during "thinking" states. The tutor controller tracks a per-question state machine (`reading → thinking → discussing → hinting → walkthrough → variation`), and in `thinking` state the tutor is instructed to stay silent indefinitely until the user speaks, with one gentle check-in at ~90 seconds ("Still with me? Take your time.").
- **Requirement — spoken protocol.** The tutor teaches and honors verbal cues: *"give me a minute"* (extend silence), *"okay, here's my thinking…"* (begin evaluation), *"repeat the question"*, *"give me a hint"*, *"just walk me through it"*, *"skip this one."* These map to explicit tool calls / state transitions, not vibes.
- **Requirement — push-to-talk fallback.** Outside the car (Study Mode, walking), a hold-to-talk button eliminates VAD ambiguity entirely.

### 2.3 Interruptions and resumption

Navigation prompts cut in; phone calls arrive; you park mid-problem.

- **Requirement — persist after every exchange.** Session state (current question, hint level reached, transcript summary, pending assessment) is written to the backend after every turn. Nothing lives only in the WebRTC session.
- **Requirement — one-utterance resume.** Next open: *"Want to pick up where we left off? You were on the drunken-passenger problem, hint level 2."*
- **Requirement — barge-in.** The user can always interrupt the tutor mid-sentence (Realtime supports this natively); the tutor never reads more than ~2 sentences without yielding anyway (see 2.5).

### 2.4 Start friction — the habit depends on it

A study habit practiced while driving survives only if starting takes near-zero effort.

- **Requirement — one tap.** PWA installed to the home screen; opening it lands directly on a single large "Start session" control that connects audio immediately. The only utterance required: *"Give me a 25-minute quant session."* Session length defaults to your typical commute; the scheduler handles everything else.
- **Requirement — car audio.** Standard Bluetooth audio routing (the PWA plays/records through the connected car or earbuds); media-session metadata so the car display shows "QuantCoach" instead of a blank tab; screen wake-lock during sessions.
- **Fallback noted for the roadmap (not v1):** a Twilio phone number you literally dial. A phone call is the zero-friction gold standard in a car (works on any phone, over any Bluetooth, with zero app state). If in-car PWA friction proves annoying in practice, Phase 3 adds dial-in bridging the same backend.

### 2.5 Road noise, cognitive load, and safety

- **Requirement — short tutor turns.** The tutor speaks at most ~2 sentences before yielding. No monologues while the user is operating a vehicle. Hints are delivered one rung at a time, never stacked.
- **Requirement — robust listening.** Realtime's native audio understanding handles conversational noise reasonably; the protocol adds a cheap safety net — when the transcript confidence is low the tutor asks, *"I didn't catch that — say again?"* rather than guessing.
- **Requirement — never require the screen.** No mid-drive interaction may depend on looking at or touching the phone beyond the initial tap. Anything visual (dashboard, solution text, diagrams) belongs to Study Mode.

### 2.6 The evening desk session

Same library, same mastery model, richer surface (Study Mode, §5.2): review the morning's mistake log, do the deferred desk-only problems with a scratchpad and rendered math, compare your approach to the canonical solution, drill code questions in an editor.

- **Requirement — one system, two surfaces.** Drive Mode and Study Mode read and write the same attempts/mastery tables. The morning session's mistake log is the evening session's starting agenda.

### 2.7 The north-star scenario (2–3 months in)

*"I'm walking to class. Give me 15 minutes."*

And the system already knows: you have a Citadel-style probability interview coming up; you're strong on standard distributions; you keep missing first-step recursion; you solved a related question yesterday at hint level 3; today's spaced-repetition schedule says test it again; you're in voice mode, so no algebra-heavy problems. It responds:

> *"Let's revisit first-step reasoning — but I won't tell you that's the method in advance. Here's the problem…"*

Every capability in §§3–6 exists to make this exchange possible. Note the detail *"I won't tell you that's the method in advance"*: testing **recognition** requires that the scheduler can serve a pattern-targeted question *without naming the pattern* — a requirement on both the tool API (§6.3) and the tutor prompt (§9.2).

---

## 3. The Knowledge Layer: Question Library + Thinking-Pattern Map

### 3.1 Ingestion

You upload material you legitimately have access to: green book chapters, OpenQuant collections, questions manually saved from quantquestion.io, MSCF homework and prep sets, interview questions you encounter, your own notes and solutions. Formats: PDF, text/markdown exports, screenshots (vision-capable extraction).

**Copyright stance (a design constraint, not an afterthought):** the application is personal and private. It imports material you own or may lawfully use, for your own study. No scraping of quantquestion.io or any paywalled bank, no redistribution, no multi-user sharing of copyrighted content. If the project ever became multi-user, the copyrighted sources would have to be dropped or licensed — the architecture keeps sources per-user for exactly this reason.

Raw sources are additionally indexed into a vector store (OpenAI file search or pgvector) so the tutor/evaluator can retrieve the original wording or solution text on demand (`get_question_source()`).

### 3.2 The structured question record

Every question is extracted into a structured record by the offline enrichment pipeline (Claude Opus, Batch API — one-time per source). This is the core of the system:

```
Question 184
  Topic:                  Probability
  Subtopic:               Conditional probability
  Primary thinking pattern:   Condition on the first event
  Secondary pattern:          Law of total probability
  Recognition clues:
    - process happens sequentially
    - outcome depends on an earlier event
    - direct counting becomes messy
  Difficulty:             3/5
  Prerequisites:          Conditional probability, Bayes' rule
  Common mistake:         Treating dependent events as independent
  Similar questions:      Q27, Q91, Q204
  Voice suitability:      high
  + statement_audio, hint ladder L1–L6, verbal rubric,
    canonical solution, 2–3 variations   (full schema in §3.4 / Appendix A)
```

The **recognition clues** field deserves emphasis: it is what lets the system (a) teach *problem recognition* explicitly ("what should have tipped you off?"), and (b) grade the Recognition sub-skill separately from execution (§4.4).

### 3.3 The thinking-pattern map — the centerpiece

Topic taxonomy (Probability → Conditional probability → …) is kept, but the **primary** organization is by *how you should think*. Two complementary views:

**View 1 — the decision tree (what to try when you don't know where to start):**

```
I don't know where to start
        ↓
Can I simplify or reframe the problem?
        ↓
Are the outcomes equally likely?  → count
        ↓
Is the complement easier to count?
        ↓
Can I condition on something (first event / last event / a pivotal card)?
        ↓
Is there symmetry or exchangeability to exploit?
        ↓
Do I only need E[X], not the distribution?
        ↓
Can I use indicator variables + linearity?
        ↓
Does the process repeat / renew?
        ↓
Can I define a recursive state and do first-step analysis?
```

This tree is not decoration — it is the tutor's hinting vocabulary. Hint level 2 ("point toward a thinking strategy") is literally a pointer into this tree: *"You're counting directly and it's getting messy. Walk the checklist — is there something to condition on?"* Over weeks, the user internalizes the tree itself, which is the real interview skill.

**View 2 — the cluster catalog** (for probability; each cluster is a skill in the mastery model):

- equally likely outcomes → count
- complement is easier than direct counting
- condition on the first/last event
- Bayes / reverse conditioning
- symmetry and exchangeability
- indicator variables + linearity of expectation
- exploit independence
- recognize hidden dependence
- recursive expectation
- first-step analysis / define a useful state
- memoryless property
- order statistics
- transform a random variable
- work backward
- invariant / conservation argument
- pigeonhole / extremal reasoning

The same catalog structure extends to statistics, stochastic processes (martingales & optional stopping, reflection, Markov chains), calculus, linear algebra, brainteasers, market-making/betting intuition, options intuition, mental math, and coding. Clusters are rows in a `patterns` table, not hard-coded — the enrichment pipeline may propose new clusters, which you approve before they enter the taxonomy (keeping the skill list meaningful is a human decision).

### 3.4 Storage & schema

Postgres (Supabase — free tier is ample for single-user scale; row-level security if it ever grows). Vector store for raw sources. Core tables:

```sql
patterns (
  id, name, domain,               -- 'condition-on-first-event', 'probability'
  decision_tree_node,             -- position in the View-1 tree, nullable
  description
)

questions (
  id, source_id, source_ref,      -- provenance (book/page, site, upload)
  statement, statement_audio,     -- original + audio-friendly rewrite
  topic, subtopic, difficulty,    -- 1–5
  primary_pattern_id, secondary_pattern_id,
  recognition_clues jsonb,        -- list of strings
  prerequisites jsonb,
  common_mistake text,
  similar_question_ids jsonb,
  voice_suitability text,         -- 'high' | 'medium' | 'desk_only'
  hint_ladder jsonb,              -- {L1..L6: text} (see §4.1)
  rubric jsonb,                   -- what a correct verbal answer must contain
  canonical_solution text,
  variations jsonb                -- 2–3 pre-generated (statement, notes)
)

attempts (
  id, question_id, session_id, mode,        -- drive | study | interview
  started_at, transcript_summary,
  hint_level_reached int,                   -- 0–6
  solved_independently bool,
  recognition_score, setup_score,
  calculation_score, explanation_score,     -- each 0–5, from the Evaluator
  mistake_note text,
  evaluator_verdict jsonb                   -- full structured verdict
)

skill_mastery (
  pattern_id,
  recognition, setup, calculation, explanation,  -- rolling 0–5 each
  mastery_pct,                                   -- derived composite
  confidence text,                                -- low | medium | high
  last_attempt_at, next_review_at,               -- spaced repetition
  streak int
)

sessions (
  id, mode, started_at, ended_at,
  planned_minutes, summary_text,     -- the post-session mistake log
  deferred_question_ids jsonb        -- desk-only items pushed to Study Mode
)
```

### 3.5 Enrichment pipeline mechanics & cost

One batch job per source: extract candidate questions (vision model for screenshots/PDF pages) → deduplicate against existing library → enrich each into the full record → human spot-check pass in a simple review UI (approve / fix tags) → insert. Claude Opus at Batch rates prices a 300-question source at roughly **$5–15, one time**. Variations and hint ladders are generated here — offline, reviewable, and never paid for at live-conversation prices.

---

## 4. The Pedagogy Engine

### 4.1 The hint ladder (explicitly programmed, seven levels)

Per question, per attempt, help escalates one rung at a time — and only on request or on the Evaluator's recommendation:

| Level | Behavior | Example (conditional-probability card problem) |
|---|---|---|
| **L0** | No help | Silence while you think |
| **L1** | Diagnostic question | *"What's your sample space here?"* |
| **L2** | Point toward a thinking strategy | *"Before continuing — are the outcomes you're treating as equally likely actually equally likely?"* |
| **L3** | Identify the theorem/method | *"This is a conditioning problem. Condition on which card appears first."* |
| **L4** | Help construct the setup | *"Let's define A = first card is a king. Now write P(B) using total probability."* |
| **L5** | Walk through the solution together | Tutor leads, user computes each step aloud |
| **L6** | Full solution + explanation | Complete walkthrough, then the recognition lesson: *"what should have tipped you off"* |

L1–L6 text is pre-written per question by the enrichment pipeline (the ladder content is in the question record), so the live tutor delivers rather than invents. **Hint level reached is a primary logged signal** — it feeds `attempts.hint_level_reached` and, through it, the mastery model: solving with L1 versus needing L5 are very different mastery states even though both end in "solved."

### 4.2 Tutor/Evaluator separation — the critical design decision

**The realtime voice model never independently decides whether your reasoning is correct.** Two roles, deliberately separated:

- **Tutor** (Realtime, voice): talks naturally, reads problems, delivers ladder rungs, manages pacing and morale. It is an excellent conversationalist and a mediocre mathematician — so it is never asked to be a mathematician.
- **Evaluator** (Claude, text, silent): receives the running transcript of the user's reasoning plus the question's canonical solution and rubric, and returns a structured verdict.

While you're speaking, the surface interaction is:

```
YOU  →  Voice Tutor:  "…so I'll treat the two draws as independent and multiply…"
Tutor:                "Tell me why you think independence applies here."
```

and behind the scenes:

```
Evaluator verdict:
  correctly_identified: [sample space, conditioning event]
  errors:               [assumes X and Y independent — they are not]
  recommended_action:   "Ask them to test whether P(X,Y) = P(X)P(Y).
                         Do NOT reveal the answer. Do not advance the hint ladder."
  rubric_progress:      2/4 required elements present
  scores_so_far:        {recognition: 4, setup: 3, calculation: —, explanation: 3}
```

The tutor's system prompt instructs it to treat Evaluator verdicts as ground truth and to phrase the `recommended_action` in its own conversational voice.

**Async loop and latency budget.** The Evaluator is invoked by the tutor controller whenever the user completes a substantive reasoning turn (not on "hmm, give me a second"). It runs on Claude Sonnet-tier with the answer key in context — a small, fast call (~1–2s) that completes while the tutor produces its natural acknowledgment ("Okay, walk me through that step again…"). The tutor never blocks on the Evaluator for conversational filler; it *does* wait for the verdict before making a correctness claim or advancing the ladder. Two rules keep this honest:

1. The tutor may not say "correct" / "that's right" about a final answer without a fresh Evaluator verdict.
2. The tutor may not skip ladder rungs unless the Evaluator recommends it.

This dramatically improves teaching consistency and is also the mechanism that de-risks the cheap realtime tier's weaker math (§7).

### 4.3 The variation/transfer system

Solving one question proves little; **transfer** is the goal. When you solve a complement-counting problem (say, birthday collisions), the tutor does not just say "correct":

> *"Good. You recognized that the complement is much easier to calculate. Let's see whether you learned the idea rather than this question."*

Then it serves something that looks completely different but uses the same move:

1. Birthday collision → *"Ten balls are placed randomly into boxes — probability at least two share a box?"* (same: "at least one" → complement "none")
2. Later → *"A deck is shuffled — probability at least one king is adjacent to another king?"* (same move, different surface)

Mechanics: 2–3 variations per question are pre-generated offline (cheap, reviewable); `find_similar_question()` serves library questions sharing the pattern but not the surface; `generate_variation()` asks Claude live for a fresh one when the pre-generated set is exhausted or when you explicitly request *"give me something that uses the same idea but doesn't look similar"* — the one generation task worth paying live prices for, because it's exactly what an LLM is unusually good at.

Variations are scheduled, not only immediate: the spaced-repetition scheduler (§4.4) prefers serving a *variation* of a shaky pattern over re-serving the original question, because recognizing the pattern in a new disguise is the skill being tested.

### 4.4 The mastery model

After every attempt, the Evaluator's final verdict is recorded:

```
Skill: Conditioning on first event
  Recognition:          2/5     ← did you see that conditioning applied?
  Setup:                4/5     ← could you formalize it once seen?
  Calculation:          5/5
  Explanation:          4/5     ← could you say it like an interview answer?
  Hint level needed:    3
  Solved independently: No
  Confidence:           Medium
  Mistake:              Tried unconditional counting first.
  Next review:          2 days
```

The four sub-scores matter because they have different remedies: low **Recognition** → serve disguised variations without naming the pattern; low **Setup** → serve L4-style guided constructions; low **Calculation** → mental-math drills; low **Explanation** → Interview Mode reps. A single "correct/incorrect" bit cannot drive any of this.

Per-pattern rolling scores produce the dashboard:

| Thinking pattern | Mastery |
|---|---|
| Bayes | 88% |
| Linearity of expectation | 82% |
| Symmetry | 76% |
| Order statistics | 69% |
| Conditioning | 54% |
| Recursion / first-step analysis | **41%** |

**Scheduling policy** (deliberately simple in v1): each pattern has `next_review_at` set by a coarse spaced-repetition rule (solved independently at L0–L1 → interval doubles; needed L3+ → review in 1–2 days; failed → tomorrow). Session assembly = due reviews first (weakest patterns first, served as *variations*), then new questions weighted toward weak patterns, filtered by mode (voice-suitable only in Drive Mode) and difficulty band. So tomorrow morning it doesn't give you another Bayes problem simply because there are lots of them — it gives you recursion and conditioning. A fancier algorithm (FSRS etc.) can replace this later; the schema already captures everything it would need.

---

## 5. The Three Modes

### 5.1 🚗 Drive Mode — voice-first

*"Give me a 25-minute quant session."* Voice-suitable questions only; hint ladder and Evaluator loop as above; desk-only items deferred with a spoken note; tutor turns ≤2 sentences; long-silence tolerance; barge-in always available. Ends (on time or on *"wrap it up"*) with a 30-second spoken recap, and writes the **mistake log** — a text summary of what you attempted, where you stalled, which patterns to revisit — which becomes the evening agenda and (optionally) an email.

### 5.2 🧠 Study Mode — the serious desk session

Phone/iPad/laptop, same PWA. On screen: the question, live voice conversation (or text chat), a scratchpad, rendered formulas (KaTeX), diagrams where the record includes them, a Python editor for coding questions, an explicit hint button (same ladder), the running transcript, and side-by-side comparison of your approach vs. the canonical solution after each attempt. The morning's deferred items and mistake log sit at the top of the queue. This is where MSCF problem sets and algebra-heavy prep live.

### 5.3 ⚡ Interview Mode — a completely different personality

No tutoring. *"You have five minutes. Start."* The interviewer persona asks follow-ups, challenges assumptions ("why is that independent?"), never confirms correctness mid-problem, applies time pressure, and evaluates like a Citadel/QR screen: problem recognition → reasoning → math → communication → speed. Debrief at the end:

```
Overall: 7.4 / 10
  Recognition      6
  Approach         8
  Execution        9
  Communication    7
Main issue:   Took 90 seconds before recognizing symmetry.
Better opening: "Because the players are exchangeable…"
```

Interview Mode attempts feed the same mastery tables (they are the highest-quality signal about Explanation and Recognition under pressure). The Evaluator produces the scored debrief; the persona swap is a different system prompt plus a stricter tool policy (no `get_hint_level`, no solution retrieval until the debrief).

---

## 6. Live Session Architecture

### 6.1 PWA client

Next.js/React. WebRTC connection to OpenAI Realtime using **ephemeral tokens** minted by the backend (the OpenAI API key never ships to the client). Add-to-home-screen manifest; screen wake-lock during sessions; media-session metadata for car displays; hold-to-talk control for non-driving contexts; offline-tolerant session journal (queued writes flush when connectivity returns — relevant in parking garages).

### 6.2 Thin backend

A small server (Next.js API routes or FastAPI — whichever you'd rather maintain) with five jobs: mint ephemeral Realtime tokens; serve the tutor-controller tool endpoints; run Evaluator calls; read/write Postgres; generate post-session summaries (batch-priced). Supabase hosts Postgres + auth (single user, but auth keeps the deployment private).

### 6.3 The Realtime tool surface

The spoken tutor drives the study system through tools — nothing is stuffed into one prompt:

| Tool | Purpose |
|---|---|
| `get_next_question(constraints?)` | Scheduler pick; honors mode, voice-suitability, session plan. Returns the full record **minus** pattern names when testing recognition |
| `get_question_source(question_id)` | Retrieve original wording/solution text from the vector store |
| `get_hint_level(question_id, level)` | Fetch the next ladder rung (server enforces one-rung-at-a-time) |
| `retrieve_solution(question_id)` | L5/L6 walkthrough content; Interview Mode: blocked until debrief |
| `record_attempt(...)` | Persist the attempt with Evaluator scores |
| `update_skill_mastery(...)` | Apply the verdict to rolling skill scores |
| `find_similar_question(pattern_id, exclude)` | Transfer question sharing the pattern, not the surface |
| `generate_variation(question_id, style)` | Live Claude call for a fresh disguise |
| `schedule_review(pattern_id, interval)` | Set/override next review |
| `defer_to_desk(question_id)` | Push a desk-only item to Study Mode queue |
| `end_session()` | Trigger recap + mistake-log generation |

The Evaluator loop is *not* a tool the tutor chooses to call — the tutor controller invokes it automatically on substantive user turns and injects the verdict into the tutor's context. The tutor can't forget to check its work.

**Per-question context injection:** when a question starts, the controller injects the record (audio statement, rubric, ladder, solution) into the Realtime session as cacheable context. The tutor coaches against this answer key; it never derives.

### 6.4 Escalation valve

If the user's reasoning goes somewhere the answer key doesn't cover (a genuinely novel alternative approach), the Evaluator says so in its verdict, and the controller runs a deeper Claude call to adjudicate the alternative path (adds ~2–4s, used rarely). The tutor buys time naturally: *"Interesting route — let me think about whether that works."*

---

## 7. Cost Engineering (fitting under $50/month)

Target: ~1 hr/day ≈ 30 conversation-hours/month, under $50.

**The levers:**

1. **Mini realtime tier** (~$0.016/min base) for the tutor. The quality risk this implies is neutralized by design: the answer key + hint ladder means the voice model performs conversation, not mathematics; the Evaluator owns correctness.
2. **Prompt caching.** Cached audio/text input is ~1/80th price ($0.40/M vs $32/M for audio input). The stable system prompt + tool schemas + current-question record form a cacheable prefix; per-turn cost is dominated by new audio only.
3. **Context discipline.** Session context is capped. When a question completes, its full back-and-forth is replaced by a one-line summary ("Q184: solved at L2, missed independence check once"). Without this, per-minute cost grows with session length (every turn re-reads the whole history); with it, cost stays flat.
4. **Everything expensive is offline.** Enrichment, hint ladders, variations, summaries: Batch API, 50% off, one-time or nightly.
5. **Evaluator on Sonnet-tier** with a tight prompt (rubric + transcript delta, not the whole session): ~$0.002–0.005 per verdict, a few dozen verdicts per session.

**Worked monthly estimate:**

| Usage | Realtime (mini, cached) | Evaluator | Offline (amortized) | Total |
|---|---|---|---|---|
| Light — 30 min/day, 20 days | ≈ $12–16 | ≈ $2 | ≈ $2 | **≈ $16–20** |
| Typical — 1 hr/day, 26 days | ≈ $28–34 | ≈ $4 | ≈ $3 | **≈ $35–41** |
| Heavy — 1.5 hr/day, 30 days | ≈ $48–58 | ≈ $6 | ≈ $4 | **≈ $58–68** |

Typical usage lands under $50 with headroom; heavy usage brushes past it — acceptable for a personal tool, and the usage meter (below) makes the tradeoff visible rather than surprising.

**Upgrade path:** if mini-tier conversation quality disappoints, full gpt-realtime-2 (~$0.05/min effective) puts typical usage at roughly $90/month — over budget. So the design bet, made explicitly: **mini tier + pre-computed answer keys + silent Evaluator ≥ full tier without them**, at a third of the price. Phase 1 validates exactly this bet.

**Instrumentation from day one:** every session logs token usage and computed cost; the dashboard shows month-to-date spend. Cost creep gets caught in days, not on the invoice.

---

## 8. Build Roadmap

Each phase is independently useful — the project pays for itself before it's finished, and can stop early without being wasted.

### Phase 0 — validate the pedagogy for ~$0 (one weekend)

Run the enrichment pipeline on one source (a green-book chapter). Take 10 processed records — audio statements, ladders, rubrics — paste them into a ChatGPT or Claude project with a two-paragraph tutor instruction, and use the app's built-in voice mode on a real drive. This answers the two riskiest questions — *is voice-tutored quant practice actually pleasant and useful? does the hint-ladder pedagogy work conversationally?* — before any app code exists. If Phase 0 feels bad, redesign the pedagogy, not the plumbing.

### Phase 1 — MVP: Drive Mode end-to-end (~1–2 weekends)

Enrichment pipeline hardened + Postgres schema; minimal PWA (one screen: start button, session timer, end-of-session summary); Realtime session with the tool surface; hint ladder on voice-suitable questions; attempt logging (without full mastery modeling yet); persistence + resume. **Exit criterion:** you complete real commute sessions a full week and prefer them to podcasts.

### Phase 2 — the learning engine

Evaluator loop (tutor/evaluator split live); mastery model + sub-scores; spaced-repetition scheduler; variation serving; Study Mode UI (scratchpad, transcript, solution comparison, deferred queue, dashboard). **Exit criterion:** the morning session is visibly targeted ("it keeps hitting my weak patterns") and the mistake log is worth reading.

### Phase 3 — polish & pressure

Interview Mode persona + scored debriefs; personalization layer (interview-date awareness, "15 minutes walking to class"); optional Twilio dial-in fallback; richer analytics. Native iOS app **only** if a concrete PWA limitation (audio routing, background behavior) actually bites — not before.

### Risks & mitigations

| Risk | Mitigation |
|---|---|
| Realtime model makes math slips while coaching | Answer-key design + Evaluator owns correctness; tutor forbidden from unverified "correct" claims |
| VAD barges in during thinking silence | Long-silence turn policy + spoken protocol + 90s check-in; push-to-talk off-road; tune in Phase 1 week 1 |
| iOS PWA audio quirks (backgrounding, Bluetooth routing) | Test on the real phone + real car in Phase 1 week 1; Twilio dial-in is the escape hatch |
| Mini-tier conversation quality too weak | Explicit Phase 1 bet; upgrade path priced (§7); Evaluator already carries the intelligence |
| Cost creep from long sessions / context growth | Context discipline (§7.3) + live usage meter + monthly budget alert |
| Question extraction quality (bad tags poison the mastery model) | Human spot-check pass in the review UI before records go live; tags editable after the fact |
| Over-engineering a personal tool | Phase gates with exit criteria; each phase independently useful; Phase 0 costs a weekend and ~nothing |

---

## 9. Appendix

### A. One fully worked question record

```json
{
  "id": "q-184",
  "source_ref": "green-book ch.4 / classic",
  "topic": "Probability",
  "subtopic": "Conditional probability",
  "statement": "Two cards are drawn without replacement from a standard 52-card deck. Given that the second card is a king, what is the probability that the first card was also a king?",
  "statement_audio": "Two cards are drawn, one after another, from a normal 52-card deck — no replacement. I tell you the second card turned out to be a king. What's the probability the first card was also a king? ... Got the setup?",
  "primary_pattern": "bayes-reverse-conditioning",
  "secondary_pattern": "symmetry-exchangeability",
  "recognition_clues": [
    "you are told a LATER outcome and asked about an EARLIER one — that direction is Bayes",
    "draws without replacement — events are dependent",
    "exchangeability shortcut: positions of cards are symmetric"
  ],
  "difficulty": 2,
  "prerequisites": ["conditional probability", "Bayes' rule"],
  "common_mistake": "Treating the two draws as independent, answering 4/52.",
  "similar_question_ids": ["q-27", "q-91", "q-204"],
  "voice_suitability": "high",
  "hint_ladder": {
    "L1": "What exactly are you conditioning on, and what are you asked for?",
    "L2": "You're told something about the SECOND card and asked about the FIRST. What technique reverses the direction of conditioning?",
    "L3": "This is Bayes' rule — or, faster, think about exchangeability of the two positions.",
    "L4": "Write P(first is K | second is K) = P(both K) / P(second is K). Now, what is P(second card is a king), before knowing anything about the first?",
    "L5": "Together: P(both K) = (4/52)(3/51). By symmetry P(second is K) = 4/52. Divide.",
    "L6": "Full walkthrough, then the lesson: whenever you're told a later event and asked about an earlier one, that direction-reversal is the tell for Bayes — and with cards, exchangeability often gives P(second is K) instantly."
  },
  "rubric": {
    "required": [
      "identifies that the direction (later → earlier) calls for Bayes or an exchangeability argument",
      "does NOT assume independence of the draws",
      "states P(second is K) = 4/52 (symmetry) or computes it via total probability",
      "arrives at 3/51 = 1/17"
    ],
    "bonus": ["notes the exchangeability shortcut explicitly"]
  },
  "canonical_solution": "P(K1|K2) = P(K1∩K2)/P(K2) = (4/52·3/51)/(4/52) = 3/51 = 1/17. Fast route: by exchangeability, conditioning on the second card being a king, the first card is a uniform draw from the remaining 51 cards, 3 of which are kings.",
  "variations": [
    {"statement_audio": "An urn has 5 red and 7 blue balls. Two are drawn without replacement. Given the second is red, probability the first was red?", "note": "same move, urn surface"},
    {"statement_audio": "Three people are dealt one card each. Given the third person got an ace, probability the first did too?", "note": "same move, adds a third position"}
  ]
}
```

### B. Tutor system-prompt draft (Realtime session)

> You are a quant interview coach speaking with a student who is often driving. Keep every turn to at most two sentences, then yield. Read problems from `statement_audio` exactly; never invent problems or solutions — everything you need is in the provided question record and tool results.
>
> Pedagogy: after reading a problem, go silent and let the student think as long as they need; if 90 seconds pass, ask one gentle check-in. When they reason aloud, listen fully before responding. You will receive Evaluator verdicts about their reasoning — treat these as ground truth. Never state that an answer or step is correct without a fresh verdict. Guide with the hint ladder one level at a time via `get_hint_level`; never skip levels unless the verdict recommends it; never reveal more than the current level implies.
>
> Honor spoken commands: "give me a minute" (stay silent), "repeat the question", "give me a hint", "just walk me through it", "skip this one", "wrap it up".
>
> When the mastery plan is testing recognition, do not name the technique or topic before the student commits to an approach. After a solve, name the mental move they used in one sentence, then offer a variation. If a question is flagged desk-only, defer it warmly and move on. Be encouraging but not saccharine; talk like a sharp, friendly senior colleague, not a cheerleader.

### C. Evaluator prompt draft (Claude, per-turn)

> You are silently grading a student's spoken reasoning for a quant interview question. You receive: the question record (canonical solution + rubric), the reasoning transcript so far, and the current hint level. Return JSON: `correctly_identified` (rubric elements present), `errors` (each with a one-line diagnosis), `rubric_progress`, `scores` (recognition, setup, calculation, explanation: 0–5 or null if not yet assessable), `recommended_action` (one concrete instruction for the tutor — a question to ask, a rung to advance to, or "confirm correct"), and `novel_approach` (true if the student is on a valid path not covered by the canonical solution — describe it). Never recommend revealing more than one hint level. Judge the *reasoning*, not the polish; spoken math is allowed to be informal.

### D. Interview Mode persona draft

> You are a quantitative-research interviewer at a top fund. Present the problem once, cleanly. Do not teach, do not confirm or deny correctness mid-problem, do not offer hints. Ask the follow-ups a real interviewer would ("why is that independent?", "can you do it faster?", "what if n is large?"). Apply time awareness: note when the candidate is slow to commit to an approach. After the session ends you will receive the Evaluator's assessment; deliver a debrief scoring Recognition, Approach, Execution, and Communication out of 10, name the single biggest issue, and give one "better opening" sentence the candidate could have used.

### E. Sources consulted

- [OpenAI Realtime API Pricing in 2026: Real-World Data From 4,000 Measured Sessions — HackerNoon](https://hackernoon.com/openai-realtime-api-pricing-in-2026-real-world-data-from-4000-measured-sessions)
- [OpenAI Realtime API Pricing 2026: Cost Per Minute Math — Layer3Labs](https://www.layer3labs.io/guides/openai-realtime-api-pricing)
- [OpenAI Realtime Voice 2026: Cost and Latency — TokenMix](https://tokenmix.ai/blog/openai-realtime-voice-api-2026-cost-latency)
- [gpt-realtime Review 2026 — ThePlanetTools](https://theplanettools.ai/tools/gpt-realtime)
- [The voice AI stack for building agents in 2026 — AssemblyAI](https://www.assemblyai.com/blog/the-voice-ai-stack-for-building-agents)
- [How Real-Time Voice AI Actually Works (STT → LLM → TTS) — Retell AI](https://www.retellai.com/blog/how-real-time-voice-ai-works-stt-llm-tts)
- [Voice AI Agents Compared on Latency (2026 Benchmarks) — Telnyx](https://telnyx.com/resources/voice-ai-agents-compared-latency)
- [AI Voice API Pricing: xAI, OpenAI, ElevenLabs & More — AIPricing.guru](https://www.aipricing.guru/ai-voice-tts-api-pricing/)
- Anthropic Claude API documentation (Batch API pricing, model capabilities), August 2026.
