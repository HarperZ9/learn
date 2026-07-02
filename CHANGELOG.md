# Changelog

All notable changes to `learn`. Versions follow semantic versioning; each minor release was built
behind the `feat/learning-loop` branch and reviewed before merge.

## Unreleased

- `tutor/reverify.mjs`: tutor-receipt re-verification with typed failure codes. `reverifyReceipt`
  recomputes a receipt's own evidence instead of trusting its stored booleans (`verified` /
  `ledgerVerified` are author-controlled and deliberately ignored): the hash chain over the
  witnessed practice entries must recompute (a break is typed `CHAIN_BROKEN` with the offending
  entry's seq and hash; a hash-consistent truncation is caught by attempt accounting) and the
  stored mastery verdict must re-derive from the recorded attempts under the recorded policy (a
  divergence is typed `VERDICT_MISMATCH` with both projections). A chainless receipt re-verifies
  as `UNVERIFIED`, never as verified. A clean re-check carries a witnessed summary digest.
- CLI: `learn tutor reverify <id> [--file <receipt.json>]` exits 0 only when every checked receipt
  re-verifies as VERIFIED; any typed failure or UNVERIFIED receipt exits 1.
- MCP: `learn_tutor_reverify` (advisory, read-only).
- `doctor` gains `tutor.reverify_rejects_known_bad`: the re-verifier must pass a clean receipt and
  reject each known-bad fixture (tampered chain entry, hand-edited verdict, chainless receipt).
  A verifier that cannot fail on a known-bad input is not a verifier.

## 1.5.0

The learning loop reaches its first complete shape: every planned teach-you capability is shipped
behind the mastery-gate, and the pieces compose into one orchestrator instead of standing alone.

- `tutor/study.mjs`: the study orchestrator. Composes `due` (spaced repetition), `misconceptions`
  (ranked aggregation), an interleaved practice order, prerequisite readiness (from the concept
  map), and the mastery-gate verdict into one `studyPlan`; `studyReceipt` wraps the same plan in a
  witnessed, hash-chained receipt.
- CLI: `learn tutor study <id> --now <iso>` and `learn tutor study-receipt <id> --now <iso>`.
- MCP: `learn_tutor_studyplan` and `learn_tutor_misconceptions` (advisory, read-only).
- `doctor` gains a check that a study-receipt composition never lets a render, a visualization, or
  a pending prediction move the mastery needle.

## 1.4.0

- `tutor/predict.mjs`: predict-then-observe. `recordPrediction` records the operator's own
  prediction as a pending attempt (`correct: null`) before any observation; `scorePrediction`
  grades it afterward against what the operator actually saw. A pending prediction is never
  silently read as correct by `mastery()`.
- `tutor/map.mjs`: concept map. Normalizes objectives given as plain strings or as
  `{id, text, requires}`, computes a topological `learningPath`, and gates each objective's
  readiness on its prerequisites' mastery.
- CLI: `learn tutor predict`, `learn tutor score`, `learn tutor path`.
- `interop/telos.mjs`: the visualization bridge (`toTelosSceneSpec`, `telosRender`,
  `toAidLedgerEntry`). Concepts render as witnessed AID visualizations through the telos engine
  over `LEARN_TELOS_CMD`, fail-closed when the engine is not configured, and are recorded in the
  study log as mastery-independent (`recordVisualization`).
- CLI: `learn visualize <concept.json>`. MCP: `learn_visualize_dry_run` (advisory; renders
  nothing, returns only the scene-spec request).
- Receipt: adds an `aidVisualizations` section, structurally separate from
  `humanAssessments` / `manualSubmissions` / `witnessedAutoSubmissions`.
- `doctor` gains `telos.render_fail_closed`, `receipt.aid_never_graded`, and
  `tutor.mastery_render_visualization_independent` checks.
- fix: corrected the README test count (37 -> 67 at the time) and hardened the
  `aid_never_graded` doctor check against a receipt that silently promoted an aid render.
- chore: scoped the npm package name to `@harperz9/learn` (the bare name was taken); gitignored
  the SDD scratch directory before publishing.

## 1.3.0

The tutor layer: the teach-you engine and its mastery-gate, plus the first two learning-loop
capabilities.

- `tutor/tutor.mjs`: `newSession`, `recordAttempt`, `mastery`, `masteryReceipt`. A session tracks
  objectives and practice attempts; `mastery()` reports per-objective and overall readiness from
  accuracy and attempt-count thresholds, computed only from recorded attempts.
- `tutor/schedule.mjs`: spaced repetition (SM-2-lite / Leitner ladder) over the practice log;
  `due()` reports objectives due for review, most-overdue first.
- `tutor/misconception.mjs`: aggregates wrong attempts and the operator's own feedback per
  objective, ranked by count.
- `tutor/retrieval.mjs`: `clozePrompts` turns the operator's own assist-extracted claims into
  blanked recall prompts carrying a source; `interleave` gives a deterministic (seeded, no
  `Math.random`) mixed study order.
- `tutor/explain.mjs`: self-explanation grading. Wraps the operator's own explanation into a
  crucible thesis and buckets its claims' verdicts into grounded / shaky / unverifiable.
- CLI: `learn tutor <plan|record|mastery|receipt|due|misconceptions|retrieval|explain>`.
- MCP: `learn_tutor_plan`, `learn_tutor_record`, `learn_tutor_mastery`, `learn_tutor_due` added to
  the advisory tool set.
- `doctor` gains `gate.assess_never_allow` extended coverage and the mastery-gate falsifiable
  tests: a session with a mastered practice log stays ready regardless of what else is attached to
  it, and a session below threshold is never reported ready.

## 1.0.0

Flagship parity: the credential-logistics engine reaches its first complete, tested shape.

- `accountability/`: `witness` (content-addressed hashing), `ledger` (hash-chained, tamper-evident
  append log), `gate` (default-deny step admission; `assess` always resolves to `needs-human`).
- `workflow/`: declarative step schema, load + seal.
- `runtime/runner.mjs`: gate -> actuate -> witness -> verify -> ledger, with halt/resume.
- `actuation/`: `FakeDriver` (offline/deterministic) and `NativeDriver` (real browser via
  native-control), selected by `--native` on the CLI.
- `adapters/`: `fake`, `generic` (config-driven), and an LMS pack: Coursera, Udemy, LinkedIn
  Learning, edX, Credly, then Microsoft Learn, NonprofitReady, and a generic self-paced adapter.
- `receipt/`: dual-plus format (JSON + Markdown + HTML) separating automated logistics from human
  assessment.
- `assist/`: turns the operator's own draft into a crucible thesis (claims -> verdicts) and a
  gather manifest (sources -> receipts); authors nothing.
- Submission modes: `manual` (engine halts at each submit) and `witnessed-auto` (engine performs
  the submit via actuation with operator authorization, recording a witnessed before/after
  digest); submission mode never touches `assess` steps.
- `doctor.mjs` / `status.mjs`: the operator-spine self-check (MATCH/DEGRADED, one falsifiable
  check per integrity invariant) and capability envelope.
- `mcp.mjs`: zero-dependency JSON-RPC/stdio MCP server exposing the advisory tool set
  (`learn_doctor`, `learn_status`, `learn_verify`, `learn_receipt`, `learn_dry_run`); actuation
  stays on the operator-driven CLI.
- CLI: `learn <run|resume|verify|receipt|doctor|status|assist>`.
