# learn Usage

`learn` is an accountable credential and coursework engine: it automates course logistics and runs
a real study loop against your own practice, and it halts hard at every step that is supposed to
prove *you* know it.

## Install

From a source checkout (no registry package required; zero external dependencies):

```bash
git clone https://github.com/HarperZ9/learn.git
cd learn
node --test          # confirm the suite passes on your machine
```

Or add it into another project as a workspace dependency and call it via its exports
(`@harperz9/learn`, `@harperz9/learn/doctor`, `@harperz9/learn/status`).

## Run

```bash
node src/cli.mjs status
node src/cli.mjs doctor
node src/cli.mjs --help
```

## Basic usage: the tutor / study loop

```bash
node src/cli.mjs tutor plan mysession --topic "derivatives" --objectives "power-rule,chain-rule"
node src/cli.mjs tutor record mysession --objective power-rule --prompt "d/dx x^3" --answer "3x^2" --correct true
node src/cli.mjs tutor due mysession --now 2026-06-30T00:00:00Z
node src/cli.mjs tutor misconceptions mysession
node src/cli.mjs tutor mastery mysession
node src/cli.mjs tutor study mysession --now 2026-06-30T00:00:00Z
node src/cli.mjs tutor study-receipt mysession --now 2026-06-30T00:00:00Z
```

`learn tutor study` is the one command to run first on an existing session: it composes what is
due, what you keep getting wrong, a mixed practice order, and the mastery-gate verdict, all from
your own recorded attempts.

## Basic usage: the credential/coursework engine

```bash
node src/cli.mjs run course.json --id run1
node src/cli.mjs resume run1 --attest "completed Quiz 1 myself"
node src/cli.mjs verify run1
node src/cli.mjs receipt run1
```

Every `assess` step in `course.json` halts for you; nothing graded is ever auto-completed. See
[docs/smoke.md](docs/smoke.md) for a full operator-run live-LMS walkthrough.

## MCP

```bash
node src/mcp.mjs
```

Exposes the advisory/read tools (`learn_doctor`, `learn_status`, `learn_verify`, `learn_receipt`,
`learn_dry_run`, `learn_tutor_plan`, `learn_tutor_record`, `learn_tutor_mastery`,
`learn_tutor_due`, `learn_tutor_studyplan`, `learn_tutor_misconceptions`,
`learn_visualize_dry_run`) over stdio JSON-RPC. Actuation (real workflow runs) stays
operator-driven on the CLI; the MCP surface never performs a real course action or answers a
graded step.

## Verify

```bash
node --test
node src/cli.mjs doctor
```

`doctor` must report `MATCH` before you rely on a build. A `FAIL` on any integrity-invariant check
means something in the accountability spine (gate, ledger, mastery independence) regressed.

## Boundary

`learn` never produces, hints, or auto-fills an answer to a certified or graded assessment.
Renders and cited sources are learning aids. The tutor's `mastery()` verdict is a function of your
own scored practice attempts only. If you can get any command to cross that line, that is the most
useful bug report this tool can receive.
