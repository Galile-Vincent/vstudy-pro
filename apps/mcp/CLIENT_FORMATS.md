# Client format evidence

Checked on 2026-11-06. This is a record of observed formats, not a claim that an agent session successfully used VStudy against a live school. All writes and client probes used temporary homes under `/private/tmp`. Actual private config contents were never printed.

## Global adapters

| Client | Global file on this macOS machine | Entry | Evidence |
| --- | --- | --- | --- |
| Claude Code | `~/.claude.json` | `mcpServers.vstudy`, `type`, `command`, `args`, `timeout` in milliseconds | Installed `claude 2.1.318`; `mcp add --scope user` produced this shape in a temporary HOME. [Official scopes and timeout reference](https://code.claude.com/docs/en/mcp). |
| Codex | `~/.codex/config.toml` | `[mcp_servers.vstudy]`, `command`, `args`, `tool_timeout_sec` | Installed `codex-cli 0.166.0`; `mcp add` produced a stdio table in a temporary HOME. CLI help confirms the default config file. [Official MCP reference](https://developers.openai.com/codex/mcp/). |
| Antigravity | `~/.gemini/config/mcp_config.json` | `mcpServers.vstudy`, `command`, `args`, `timeoutSeconds` | Installed `agy 1.4.12`; `mcp add` produced this global file in a temporary HOME. [Official paths, schema, and timeout reference](https://antigravity.google/docs/mcp). |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` | `mcpServers.vstudy`, `command`, `args` | No app bundle or config detected at the checked standard locations. [Official local-server guide](https://modelcontextprotocol.io/docs/develop/connect-local-servers). |
| Cursor | `~/.cursor/mcp.json` | `mcpServers.vstudy`, `command`, `args` | No binary, app bundle, or config detected at the checked standard locations. [Official MCP reference](https://cursor.com/docs/context/mcp). |

The current Antigravity path replaces the older `.gemini/antigravity` location. The installed CLI independently confirmed the current path. The installer does not guess a legacy path. Existing empty or invalid configs fail without modification.

Claude Code honors `CLAUDE_CONFIG_DIR` and Codex honors `CODEX_HOME`. The installer supports both. Normal installation uses literal absolute paths and argv arrays, never shell quoting or a bearer token. The timeout budget is 300 seconds for clients whose documented entry schema supports it.

## Observed local configuration

Only existence, syntax status, and entry counts were inspected. Claude Code's config was valid JSON with no global `mcpServers` map. Codex's config was present, parsed as TOML with two server entries. Antigravity's current global config was an empty file and therefore invalid JSON. The legacy Antigravity file, Claude Desktop config, and Cursor config were absent. No actual client config was changed.

## Optional plugin assets

Claude Code's package has `.claude-plugin/plugin.json`, `.mcp.json`, skills, and commands. Its launch path uses `${CLAUDE_PLUGIN_ROOT}/dist/vstudy-mcp.cjs`. The installed `claude plugin validate --strict` passed. It separately reported that a marketplace submission lacks license metadata and an icon. Marketplace publication is not part of this implementation. See the [official plugin reference](https://code.claude.com/docs/en/plugins-reference).

Antigravity's package has `plugin.json`, `mcp_config.json`, and skills exposed as slash commands. `${PLUGIN_ROOT}` selects the included CLI. Installed `agy plugin validate --strict` passed with a generic-icon note. See the [official plugin authoring reference](https://antigravity.google/docs/build-plugins).

Cursor's package has `.cursor-plugin/plugin.json`, `mcp.json`, skills, and commands. It uses `${CURSOR_PLUGIN_ROOT}`, as required by [Cursor's plugin reference](https://cursor.com/docs/plugins). No Cursor loader or validator was available. Codex ships a TOML template, a skill, and an AGENTS snippet. Claude Desktop ships a JSON template and reference workflows. The installer edits only the MCP entry and does not copy optional guidance into user directories.

The build copies the bundled CLI into each native plugin's `dist` directory. These generated files must accompany a copied plugin. No plugin reaches outside its own directory for executable code.

## Acceptance boundaries

Automated tests parse and edit all five formats in temporary homes. They execute the bundled CLI and the official SDK Client against a controlled bridge, including app and server restarts. The installed Claude Code and Codex config readers, and agy's manager, are checked separately by `scripts/check-client-formats.mjs`. Native plugin validation does not prove runtime launch acceptance.

No live conversation was started in Claude Code, Codex, agy, Claude Desktop, or Cursor. No real university was contacted. The parent stream owns Electron-backed SDK acceptance and Moodle behavior. Windows and Linux client locations are not supported by these macOS adapters.

After the `b333505` handoff, `scripts/check-core-bridge.mjs` also passed with the actual core engine and native Unix peer helper. That check exercised pending `DENIED` consent, one-shot finish, public `mcp:<UUID>` cursors, queued reads, a trusted-fixture-approved write, app restart, and disabled JSON-RPC errors. The backend was controlled and no Electron process or school connection ran.
