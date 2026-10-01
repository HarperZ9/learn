## Marketplace source distribution

This folder packages the source plugin from release 2.1.0. It requires Node.js 20 or later, available as `node`. It includes the tool source and no model or bundled runtime. The connected client supplies any model used in the conversation.

The separate [Windows x64 native download](https://github.com/HarperZ9/learn/releases/download/v2.1.0/learn-study-2.1.0-win-x64.mcpb) includes its runtime. That download is a manual MCPB package and is not part of this source plugin. Directory approval and availability remain unverified.

This branch contains the installable plugin. Build commands in the release README below apply to the [product source tag](https://github.com/HarperZ9/learn/tree/v2.1.0). DISTRIBUTION.json records the published asset digest and every packaging change; any SOURCE.json describes the original release payload.

# Learn local client package

The source ZIP includes the tool source and one scoped skill. It requires an
installed Node.js 20+; this advanced source package is not self-contained.
Extract it to a persistent folder. Claude Code can load that plugin folder;
Codex-compatible loaders use plugin.json and mcp.json. For a generic local MCP
client, replace the plugin-root token with the absolute extraction path and
select the absolute runtime executable in that client's settings. Keep arguments
as a JSON array. This package never changes client settings automatically.

Tutor plan and record tools write only inside the Learn state folder. A session stores your own practice attempts. No tool answers certified or graded assessments, and live course actuation stays on the operator-driven CLI.

The connected client supplies the model and pays any model-provider charges.
There is no publisher-hosted inference, relay or account requirement. Installing
a plugin does not authorize network calls, execution, publishing or production
deployment. Local MCP support differs between clients; ChatGPT cloud and Claude
web connections and marketplace acceptance are not established by this archive.

Build locally with Python 3.11+:

```sh
python scripts/build_client_plugin.py --mode dev --out ../client-artifacts
```

Development filenames include -dev. Their source receipt records the base commit
and every payload hash. They are not previously published bytes even when their
embedded version matches a release. Release mode requires a clean checkout,
an exact source tag and a version ending in .0; the ordinary tool release gates
still apply. Builders refuse to overwrite existing archives.

A Windows x64 package can also include the reviewed Node v24.21.0 runtime:

```sh
python scripts/build_client_plugin.py --mode dev --out ../native-client-artifacts --node-runtime /path/to/reviewed/node
```

The runtime folder must contain node.exe and LICENSE matching the pinned hashes.
The builder downloads nothing. This emits a ZIP and a Claude Desktop MCPB with
the same source and runtime bytes. No separate Node installation is needed for
those Windows x64 artifacts. RUNTIME.json identifies the upstream archive and
license hashes. Other platforms, installation in actual clients and marketplace
approval need separate validation. The runtime is not a model.

## Local practice storage

The plugin stores practice sessions and recorded attempts in your per-user Learn data folder: `%LOCALAPPDATA%/learn` on Windows, `~/Library/Application Support/learn` on macOS, or `$XDG_DATA_HOME/learn` (otherwise `~/.local/share/learn`) on Linux. You can set `LEARN_HOME` before starting the client to choose another local folder. The plugin retains those files until you remove them. The client may retain tool results under its own settings.
