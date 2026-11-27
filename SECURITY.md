# Security Policy

## Supported versions

`@harperz9/learn` is distributed on npm and provides a zero-dependency local study planner CLI and
stdio MCP server. Security fixes ship in the current release line as a new release. Older lines do
not receive backports.

| Version | Supported |
|-|-|
| 2.3.x | Yes |
| < 2.3 | No |

## Reporting a vulnerability

Report suspected vulnerabilities privately through GitHub: open this repository's **Security** tab
and select **Report a vulnerability**, or open
<https://github.com/HarperZ9/learn/security/advisories/new>.
Keep security reports out of public issues, pull requests, and discussions.

Include:

- the affected version and operating system,
- a concise description of the issue and its impact,
- the minimal input or steps needed to reproduce it.

The maintainer, Zain Dana Harper, acknowledges reports and works on a fix before public disclosure.
Allow a reasonable period to remediate before disclosing.

## Scope and trust model

Learn schedules spaced-repetition reviews, tracks repeat mistakes, and checks mastery from locally
recorded study attempts.

- **Zero runtime dependencies, zero network.** Core scheduling, mastery checks, and state
  persistence run locally on Node.js with no third-party runtime packages, no telemetry, and no
  outbound network calls.
- **Local state files.** Study logs and review schedules are stored in local files that you control.
- **MCP surface.** The MCP server communicates over stdio JSON-RPC, opens no network port, and
  operates only on the configured study state path. Tool outputs flow to the connected MCP client.
- **What counts as a vulnerability.** Arbitrary code or command execution triggered by untrusted
  deck, attempt, or state files; path traversal reading or writing outside the configured state
  directory; or tampered review receipts verifying as valid.
- **What does not count.** Malformed JSON or study-deck inputs that fail with a handled error.

## Good practice

- Keep study state files on access-controlled local storage if they include private notes.
- Validate untrusted shared decks as plain data before importing them into an active state file.
