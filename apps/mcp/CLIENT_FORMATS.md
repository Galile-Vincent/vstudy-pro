# Client format evidence

Checked on 2026-11-06. This is a record of observed formats, not a claim that an agent session successfully used VStudy against a live school. All writes and client probes used temporary homes under `/private/tmp`. Actual private config contents were never printed.

## Global adapters

| Client | Global file on this macOS machine | Entry | Evidence |
| --- | --- | --- | --- |
| Claude Code | `~/.claude.json` | `mcpServers.vstudy`, `type`, `command`, `args`, `timeout` in milliseconds | Installed `claude 2.1.318`; `mcp add --scope user` produced this shape in a temporary HOME. [Official scopes and timeout reference](https://code.claude.com/docs/en/mcp). |
| Codex | `~/.codex/config.toml` | `[mcp_servers.vstudy]`, `command`, `args`, `tool_timeout_sec` | `codex-cli 0.166.0` produced a stdio table through `mcp add` in a temporary HOME. The final parent check also passed with `0.167.0` through `mcp get`. CLI help confirms the default config file. [Official MCP reference](https://developers.openai.com/codex/mcp/). |
| Antigravity | `~/.gemini/config/mcp_config.json` | `mcpServers.vstudy`, `command`, `args`, `timeoutSeconds` | Installed `agy 1.4.12`; `mcp add` produced this global file in a temporary HOME. [Official paths, schema, and timeout reference](https://antigravity.google/docs/mcp). |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` | `mcpServers.vstudy`, `command`, `args` | No app bundle or config detected at the checked standard locations. [Official local-server guide](https://modelcontextprotocol.io/docs/develop/connect-local-servers). |
| Cursor | `~/.cursor/mcp.json` | `mcpServers.vstudy`, `command`, `args` | No binary, app bundle, or config detected at the checked standard locations. [Official MCP reference](https://cursor.com/docs/context/mcp). |

The current Antigravity path replaces the older `.gemini/antigravity` location. The installed CLI independently confirmed the current path. The installer does not guess a legacy path. Existing empty or invalid configs fail without modification.

Claude Code honors `CLAUDE_CONFIG_DIR` and Codex honors `CODEX_HOME`. The installer supports both. Normal installation uses literal absolute paths and argv arrays, never shell quoting or a bearer token. Supported timeout fields use 300 seconds on Unix and 600 seconds on Windows. Windows allows 95 seconds for cold startup, two minutes for pairing, and a subsequent approved call. Claude Desktop and Cursor receive no undocumented timeout field.

## Observed local configuration

Only existence, syntax status, and entry counts were inspected. Claude Code's config was valid JSON with no global `mcpServers` map. Codex's config was present, parsed as TOML with two server entries. Antigravity's current global config was an empty file and therefore invalid JSON. The legacy Antigravity file, Claude Desktop config, and Cursor config were absent. No actual client config was changed.

## Optional plugin assets

Claude Code's package has `.claude-plugin/plugin.json`, `.mcp.json`, skills, and commands. Its launch path uses `${CLAUDE_PLUGIN_ROOT}/dist/vstudy-mcp.cjs`. The installed `claude plugin validate --strict` passed. It separately reported that a marketplace submission lacks license metadata and an icon. Marketplace publication is not part of this implementation. See the [official plugin reference](https://code.claude.com/docs/en/plugins-reference).

Antigravity's package has `plugin.json`, `mcp_config.json`, and skills exposed as slash commands. `${PLUGIN_ROOT}` selects the included CLI. Installed `agy plugin validate --strict` passed with a generic-icon note. See the [official plugin authoring reference](https://antigravity.google/docs/build-plugins).

Cursor's package has `.cursor-plugin/plugin.json`, `mcp.json`, skills, and commands. It uses `${CURSOR_PLUGIN_ROOT}`, as required by [Cursor's plugin reference](https://cursor.com/docs/plugins). No Cursor loader or validator was available. Codex ships a TOML template, a skill, and an AGENTS snippet. Claude Desktop ships a JSON template and reference workflows. The installer edits only the MCP entry and does not copy optional guidance into user directories.

The build copies the bundled CLI into each native plugin's `dist` directory. These generated files must accompany a copied plugin. No plugin reaches outside its own directory for executable code.

## Acceptance boundaries

Automated tests parse and edit all five formats in temporary homes. They execute the bundled CLI and the official SDK Client against a controlled bridge, including app and server restarts. The installed Claude Code and Codex config readers, and agy's manager, are checked separately by `scripts/check-client-formats.mjs`. Native plugin validation does not prove runtime launch acceptance.

No live conversation was started in Claude Code, Codex, agy, Claude Desktop, or Cursor. No real university was contacted. The parent stream owns Electron-backed SDK acceptance and Moodle behavior. Windows locations now have fixture coverage only. Native Windows client parsing, launch, ACL enforcement, and named-pipe execution remain unverified on this Mac. Linux client locations remain unverified.

After the `b333505` handoff, `scripts/check-core-bridge.mjs` also passed with the actual core engine and native Unix peer helper. That check exercised pending `DENIED` consent, one-shot finish, public `mcp:<UUID>` cursors, queued reads, a trusted-fixture-approved write, app restart, and disabled JSON-RPC errors. The backend was controlled and no Electron process or school connection ran.

## Windows mappings and execution boundary

The adapters use `USERPROFILE` for home-scoped files and `APPDATA` for roaming application data. Claude Code's [directory reference](https://code.claude.com/docs/en/claude-directory) explicitly maps Windows home to USERPROFILE. [Node's home-directory contract](https://nodejs.org/api/os.html#oshomedir) uses USERPROFILE on Windows. The home-relative Codex, Antigravity, and Cursor paths above map to that documented home. This is a documented mapping, not installed-Windows-client acceptance.

| Client | Windows global configuration |
| --- | --- |
| Claude Code | `%USERPROFILE%\.claude.json`, or `CLAUDE_CONFIG_DIR\.claude.json` |
| Codex | `%USERPROFILE%\.codex\config.toml`, or `CODEX_HOME\config.toml` |
| Antigravity | `%USERPROFILE%\.gemini\config\mcp_config.json` |
| Claude Desktop | `%APPDATA%\Claude\claude_desktop_config.json` |
| Cursor | `%USERPROFILE%\.cursor\mcp.json` |

The [official local MCP guide](https://modelcontextprotocol.io/docs/develop/connect-local-servers) gives Claude Desktop's APPDATA path directly. Fixture tests preserve Windows separators and argv through all five JSON or TOML adapters. Displayed Windows install commands target PowerShell and quote apostrophes by doubling them. Main executes APIs or argv arrays instead of that display text.

Windows discovery first checks HKCU uninstall metadata for an exact VStudy Pro display name and a valid InstallLocation or DisplayIcon executable. It then checks the standard per-user Programs path. Legacy HKLM native and WOW6432Node uninstall metadata are last. Custom paths are therefore supported through HKCU rather than inferred from a shell command. It never executes UninstallString. [Microsoft's uninstall-key reference](https://learn.microsoft.com/en-us/windows/win32/msi/uninstall-registry-key) documents installation metadata. The fallback is `%LOCALAPPDATA%\Programs\VStudy Pro\VStudy Pro.exe`, confirmed by the coordinator's assisted per-user NSIS profile and matching the Programs convention in [NSIS](https://github.com/nsis-dev/nsis/blob/master/Examples/install-per-user.nsi). This fallback is fixture-tested and has not been observed on an installed Windows build.

The app-data and SID endpoint helpers are consumed from the parent-owned `3141fa4` interface. `whoami.exe /user /fo csv /nh` supplies the real SID through fixed absolute argv. The shared helper hashes that SID to a 32-hex local pipe name. Windows connections never perform Unix socket lstat checks and reject remote pipe hosts. This CLI does not bundle a listener.

The isolated `windows-acl` export uses a constant encoded PowerShell script and environment inputs, never interpolated commands. It creates a new current-SID-only protected DACL for newly app-owned paths and verifies owner plus the complete raw DACL before private reads. [SetAccessRuleProtection](https://learn.microsoft.com/en-us/dotnet/api/system.security.accesscontrol.objectsecurity.setaccessruleprotection) controls inheritance, and [Set-Acl](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.security/set-acl) supports literal paths. New files remain empty until ACL enforcement succeeds. Existing user config-directory ACLs are unchanged. Unavailable enforcement rejects pairing and saving. Mac fixtures validate argv, input separation, failure handling, and file-write ordering. They do not verify Windows security.

Main's Windows pipe host, its resource wiring, peer impersonation, and app persistence are owned by Stream P. Windows MCP remains unavailable until that factory and persistence are wired. The desktop build skips the Unix C helper on Windows. The Windows resource-layout check deliberately does not require a Unix helper and does not certify P's host.

The packaging profile is assisted NSIS with `oneClick=false`, `allowElevation=false`, and `perMachine=false`. These settings and the discovery order have fixture coverage. Actual Windows installation, custom-path registration, and native launch remain unverified on this Mac.

The Windows client defaults to the production PowerShell/.NET Framework connector in `src/windows-pipe.ts`. It checks the owner and exact protected DACL on the actual forwarding handle at Identification impersonation, then retains that handle without reopening it. Its attested SID is checked before any frame or bearer read. Missing APIs, unsafe ACLs, and mismatched SIDs fail closed. Portable tests passed. The native kernel tests require Windows CI and skip on this Mac. Stream P retains server and private app-state wiring. See the [connector contract](README.md#windows-authenticated-connector).
