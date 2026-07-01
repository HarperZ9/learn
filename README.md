# learn

**An accountable credential & coursework engine.** It automates the *logistics* of courses and
certifications, **halts at every graded step** for you to do yourself, witnesses every action in a
tamper-evident ledger, and emits a **receipt that proves how the credential was earned**. It is a
learning aid, not a learning bypass — a Project Telos flagship.

The distinction is the whole product: **it never produces graded work.** At every `assess` step it
stops; you complete the assessment; the engine records that *you* did it. The receipt then separates
what the engine automated (logistics) from what you performed (the graded work). That is *credential
provenance*.

Zero external dependencies. Node ≥ 20, ES modules.

## Install / run

```
node --test          # 37 tests
node src/cli.mjs status
node src/cli.mjs doctor
```

## CLI

| Command | What it does |
|---|---|
| `learn run <workflow.json> [--id X] [--native --match <tab>]` | Execute a workflow. Halts at `assess`/consent/CAPTCHA. `--native` drives your real browser via native-control. |
| `learn resume <id> [--attest "..."] [--native --match <tab>]` | Resume after you completed a graded step; records your attestation. |
| `learn verify <id>` | Verify the run's hash-chained ledger is intact. |
| `learn receipt <id>` | Emit the provenance receipt as JSON + Markdown + HTML (print HTML for PDF). |
| `learn doctor` | Runtime self-check of the integrity invariants → MATCH/DEGRADED. |
| `learn status` | Version, capabilities, and the invariants the engine guarantees. |

## Integrity invariants (each has a falsifiable test; `doctor` re-checks them at runtime)

1. `assess` steps never auto-complete — the engine halts for the operator.
2. Default-deny — only known step kinds run; an undeclared step is refused, nothing actuated.
3. Every step is witnessed; the ledger is hash-chained and tamper-evident.
4. The receipt separates automated logistics from human assessment.
5. Credentials, payment, CAPTCHA, and account creation halt for the operator.

## Architecture (all zero-dep)

- `accountability/` — `witness` (content-addressed), `ledger` (hash-chained, tamper-evident), `gate` (default-deny; assess always halts).
- `workflow/` — declarative step schema + seal.
- `runtime/` — the runner: gate → actuate → witness → verify → ledger; halt/resume.
- `actuation/` — `FakeDriver` (offline/deterministic) and `NativeDriver` (real browser over native-control).
- `adapters/` — `generic` config-driven adapter + an LMS pack (Coursera, Udemy, LinkedIn Learning, edX, Credly). No graded logic anywhere.
- `receipt/` — dual-plus format: JSON + Markdown + HTML.
- `assist/` — study aid: flags claims to verify (crucible) and sources to cite (gather) in *your own* draft; authors nothing.
- `resume/` — ingests an earned credential into a resume/portfolio, carrying the provenance flag.
- `mcp.mjs` — zero-dep JSON-RPC/stdio MCP server exposing advisory tools (`learn_doctor/status/verify/receipt/dry_run`). Actuation stays operator-driven on the CLI.
- `doctor.mjs` / `status.mjs` — the operator-spine self-check + capability envelope.

## Interop
`gather` (source receipts) and `crucible` (measured claim evaluation) power the assist pillar;
`native-control` provides real-browser actuation. See `docs/smoke.md` for an operator-run live-LMS smoke.

## License
Fair-source (see `LICENSE`), including a binding integrity clause: derivatives may not remove the
guarantee that graded assessments always halt for the human.

Design: `project-docs/specs/2026-06-30-accountable-credential-engine-design.md` ·
Plan: `project-docs/plans/2026-06-30-praxis-credential-engine.md`.
