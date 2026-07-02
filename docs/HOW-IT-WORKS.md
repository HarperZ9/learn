# How it works

`learn` runs a real study loop against the operator's own practice, not a generic quiz generator
and not an answer key. This page walks that loop one step at a time: **plan**, **due**,
**retrieval**, **predict-then-observe**, **self-explanation**, **misconceptions**,
**mastery-gate**, **witnessed receipt**. Each step is a thin, honest read over what the operator
actually did. None of them ever produces an answer to a certified assessment.

## The loop, step by step

```
   ┌───────────────────────────────────────────────────────────────────┐
   │  1. plan       : declare a topic and its objectives                │
   │  2. due        : which objectives are overdue for review           │
   │  3. retrieval  : recall prompts from the operator's OWN material   │
   │  4. predict -> observe  : commit a prediction BEFORE seeing a render│
   │  5. self-explain : the operator's OWN explanation, graded honestly │
   │  6. misconceptions : what the operator keeps getting wrong          │
   │  7. mastery-gate : ready only if the operator's own attempts prove it│
   │  8. witnessed receipt : a hash-chained record of exactly this       │
   └───────────────────────────────────────────────────────────────────┘
```

### 1. Plan

```bash
node src/cli.mjs tutor plan mysession --topic "derivatives" --objectives "power-rule,chain-rule"
```

A session is just a topic and a list of objectives. No content is generated on the operator's
behalf here; the operator names what they are studying. `tutor/tutor.mjs`'s `newSession` creates
an empty practice log (`attempts: []`) tied to those objectives.

### 2. Due

```bash
node src/cli.mjs tutor due mysession --now 2026-06-30T00:00:00Z
```

`tutor/schedule.mjs` runs an SM-2-lite / Leitner ladder over the session's own recorded attempts.
An objective the operator has never practiced is due immediately; one they have gotten right
several times in a row is due further out. `due()` is a pure function of the practice log and an
explicit `now`, so it is deterministic and never depends on a hidden wall clock.

### 3. Retrieval

`tutor/retrieval.mjs`'s `clozePrompts` takes claims the operator's own draft already asserted
(via `assist()`, which cites but never invents) and blanks out a salient term, so the operator has
to recall it rather than reread it. Every prompt carries its `source` so the operator can check
themselves after attempting recall, never before. `interleave()` mixes objectives into a
deterministic (seeded, no `Math.random`) study order, the interleaving-practice technique.

### 4. Predict, then observe

```bash
node src/cli.mjs tutor predict mysession --objective power-rule --prompt "what will this look like?" --prediction "a straight line"
```

`tutor/predict.mjs`'s `recordPrediction` stores the operator's own prediction as a **pending**
attempt (`correct: null`), before they see any rendered aid. Only after the operator compares
their prediction to what they actually observed does `scorePrediction` record a verdict. A
pending prediction is never silently read as correct; `recordAttempt`'s boolean coercion treats
`null` as "not yet correct," never as a pass.

### 5. Self-explanation

`tutor/explain.mjs` wraps the operator's own explanation of a concept into a crucible thesis
(reusing the same `assist()` pillar as retrieval) and buckets the returned MATCH/DRIFT/UNVERIFIABLE
verdicts into grounded/shaky/unverifiable. This checks the operator's explanation against sources
they themselves cited; it supplies no rewritten "correct" explanation.

### 6. Misconceptions

```bash
node src/cli.mjs tutor misconceptions mysession
```

`tutor/misconception.mjs` aggregates the operator's own wrong attempts, ranked by count, so the
next study session spends time on the objective the operator actually struggles with, not a
generic weak spot the tool invented.

### 7. Mastery-gate

```bash
node src/cli.mjs tutor mastery mysession
```

`tutor/tutor.mjs`'s `mastery()` reports `ready` per objective and overall, computed from
`session.attempts` only: at least `minAttempts` recorded attempts and at least `threshold`
accuracy. Attaching a render (`recordVisualization`) or leaving a prediction pending never moves
this needle; `doctor.mjs` re-checks that invariant at runtime on every run.

### 8. Witnessed receipt

```bash
node src/cli.mjs tutor study mysession --now 2026-06-30T00:00:00Z
node src/cli.mjs tutor study-receipt mysession --now 2026-06-30T00:00:00Z
```

`tutor/study.mjs` composes steps 2 to 7 into one `studyPlan`, and `studyReceipt` hash-chains the
underlying practice log (via the same `Ledger` the credential engine uses) into a tamper-evident
record. The receipt is a quiet floor: it proves the study happened as recorded. It does not itself
grade or unlock anything beyond what `studyPlan` already computed, and it never contains an answer
to a certified assessment, only the operator's own recorded practice.

### 9. Receipt re-verification

```bash
node src/cli.mjs tutor receipt mysession
node src/cli.mjs tutor reverify mysession
```

`tutor/reverify.mjs` recomputes an emitted receipt's own evidence instead of trusting its stored
booleans. The hash chain over the witnessed practice entries must recompute (a break is typed
`CHAIN_BROKEN` with the offending entry's seq and hash) and the stored mastery verdict must
re-derive from the recorded attempts under the recorded policy (a divergence is typed
`VERDICT_MISMATCH`). A receipt without chain evidence is `UNVERIFIED`, never verified. A clean
re-check exits 0 with a witnessed summary digest; any failure exits 1.

---

## Fail-closed, the same way the rest of Project Telos is

When a render cannot be produced (`LEARN_TELOS_CMD` unset, the engine unreachable, a bad output),
`interop/telos.mjs` returns `UNVERIFIABLE` immediately, tagged `provenance: "aid"`. It never
fabricates a plausible-looking scene, and an aid render, verified or not, is structurally barred
from ever entering the graded receipt channels (`humanAssessments`, `manualSubmissions`,
`witnessedAutoSubmissions`).

The credential engine's `assess` step is the same discipline applied to the logistics side: an
undeclared step kind is denied outright, an `assess` step always halts for the operator, and
nothing after either point is actuated. `learn doctor` re-derives all of this at runtime rather
than asking you to trust a comment.

See also: [Architecture](ARCHITECTURE.md) for the organs and modules, and
[Enterprise Readiness](ENTERPRISE-READINESS.md) for the operational contract.
