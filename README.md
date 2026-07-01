# learn — accountable credential & coursework engine

`learn` runs the **logistics** of courses and certifications (enroll, navigate, advance
ungraded modules, submit your own work with permission, capture completion), and emits a
**tamper-evident receipt of how the credential was earned**. It is a learning aid, not a
learning bypass:

- It **never produces graded work.** At every `assess` step it HALTS and you complete the
  assessment yourself; the engine records that you did it.
- Every action is **witnessed** and written to a **hash-chained ledger** (tamper-evident).
- The receipt **separates automated logistics from your own graded work** — credential provenance.

Zero external dependencies. Node ≥ 20, ES modules. Run the test suite:

```
node --test
```

Design: `project-docs/specs/2026-06-30-accountable-credential-engine-design.md`.
Plan: `project-docs/plans/2026-06-30-praxis-credential-engine.md`.
