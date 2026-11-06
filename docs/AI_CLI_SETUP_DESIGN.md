# Guided AI tool setup

Students can set up Claude Code, Codex, and Antigravity through guided steps. Managed installation requires independent publisher proof. When that proof is unavailable, the same sheet explains why and shows the official command for the user's own terminal.

## Study evidence

Study date is 2026-11-06. T3 Code source is cloned outside this repository. The completed reference checkout at `/private/tmp/vstudy-t3code-research` is revision `cefb544af3c98224874419198c0359b652ca3c94`. A fresh clone at `/private/tmp/vstudy-cli-t3code-c-study` is revision `c52df24d285a072ad9c3f7ab5b3656c0be1cb0f5`. Its `CodexInstallation.ts` still uses the staged, checksummed, atomic active-record design.

T3 Code separates executable resolution, provider health, authentication, installation progress, and update notices. Its `apps/server/src/provider/ProviderRegistry.ts` preserves unknown authentication until an actual auth or inventory probe establishes it. `CodexInstallation.ts` verifies the downloaded size and digest, stages each version in a separate directory, writes an installation completion record, and atomically renames an `active.json` pointer. It retries directory promotion on Windows because Defender and exited processes can retain handles. The selected executable is an absolute version path. Updating that pointer cannot replace an executable already held by a running process.

`apps/web/src/components/sidebar/SidebarProviderUpdatePill.tsx` presents a quiet, dismissible status pill with loading, success, warning, and error states. Clicking opens provider settings. This is the useful interaction to reproduce. It does not require a modal during a conversation. T3 uses `node-pty` for interactive terminals. We do not copy its general project shell capability into student setup.

Sources are [T3 Code](https://github.com/pingdotgg/t3code), [Claude advanced setup](https://code.claude.com/docs/en/setup), [Codex source](https://github.com/openai/codex), [Codex commands](https://developers.openai.com/codex/cli/reference), and [Antigravity setup](https://antigravity.google/docs/getting-started?tab=cli). Vendor installer scripts were downloaded for inspection only. No installer was executed.

## Commands verified on this Mac

| Tool | Installed | Sign in | Status | Official installer |
| --- | --- | --- | --- | --- |
| Claude | 2.1.318 | `claude auth login` | `claude auth status --json` returns `loggedIn` | `curl -fsSL https://claude.ai/install.sh \| bash` |
| Codex | 0.167.0 | `codex login --device-auth` | `codex login status` uses exit status and prints account type | `curl -fsSL https://chatgpt.com/codex/install.sh \| sh -s -- --release 0.166.0` |
| Antigravity | 1.4.12 | `agy --sandbox --include-default-customizations=false` opens first-run sign-in | No `auth` or `login` subcommand. Use existing ACP `initialize` and `session/new` without `authenticate`. | `curl -fsSL https://antigravity.google/cli/install.sh \| bash` |

Versions, help, and auth status were run locally. Claude returned authenticated JSON and Codex returned authenticated status. Personal account details are excluded from evidence. `agy help auth` and `agy help login` both returned unknown-subcommand errors. A local read-only ACP probe returned an authenticated session and six available models on 1.4.12. Existing `runAgy` implements the noninteractive ACP status probe and explicitly avoids browser-opening `authenticate`. Actual new-account browser sign-in remains a manual acceptance check. The tiny test uses the existing tool-free provider adapter, never a generic interactive agent prompt.

Claude's inspected installer uses `https://downloads.claude.ai/claude-code-releases`, a platform manifest, and SHA-256. Its docs publish a detached GPG signature and fingerprint `31DDDE24DDFAB679F42D7BD2BAA929FF1A7ECACE`. Antigravity's inspected scripts use `https://antigravity-cli-auto-updater-974169037036.us-central1.run.app/manifests/<os>_<arch>.json`, including SHA-512 and a Google Storage payload URL. The recorded macOS manifest advertises 1.5.1. Its archive contains a single executable named `antigravity`.

## Architecture decisions

Two candidates were considered. A pipe runner has no native packaging cost but cannot render Antigravity's interactive sign-in or terminal prompts correctly. An action-scoped PTY supports that flow and ConPTY on Windows. Choose `node-pty` with xterm.js, externalize the native dependency, unpack native libraries and spawn helpers, and verify a real packaged launch. Keep installation downloads in main with bounded streaming output, rather than running a remote script. General shells remain unavailable by default. An advanced shell must require its own explicit warning and cannot accept renderer command strings.

The domain is `CliToolState`, `CliActionPlan`, and `CliActionSession`, validated by strict Zod contracts in `shared/ai-cli.ts`. A provider has exactly one named setup status. The renderer supplies an action ID and a main-issued preview token. It never supplies executable paths, arguments, environment variables, URLs for installation, or a working directory. Terminal input belongs only to the active action session and is bounded. Closing the pane cancels its action. Terminal output remains in a capped memory buffer and is never persisted to logs. OSC links and browser launches must use the existing external-link confirmation.

Detection reads safe installed paths without executing them. Status, login, and tests require the existing per-provider opt-in. Executable resolution reuses `ExecutablePins`. A changed file still requires the existing native confirmation. A user-requested verified managed install can pin its resulting executable. Disable vendor self-updates for managed sessions. Preserve Codex's macOS-only audited 0.166.0 transport. Show newer releases as incompatible until audited. Installing a newer release must never bypass that policy.

Install under `userData/ai-tools/<provider>/<version>/`. Download to a private staging directory, enforce HTTPS vendor hosts, cap sizes, and verify independent authenticity before any `--version` execution. Only then validate the version and rename to its directory. Atomically replace only an application-owned JSON pointer. Keep the prior version for rollback. Never delete versions used by this process. Prefer conservative retention across restarts over deleting a possibly running executable. New chats resolve a new absolute path while already spawned chats retain their original binary. Never mutate a user's globally installed CLI, npm prefix, shell profile, or PATH.

Update checking is a separate default-off preference. Check on launch and every four hours after opt-in, cache results to disk, throttle Check now, preserve cached state offline, and inventory every request in Settings > Privacy. Install and update remain explicit clicks unless the user enables automatic updates while idle. Idle includes real provider turns and setup actions.

## User experience

Use the existing Quiet folio surfaces and semantic theme tokens. A calm setup sheet has a provider chooser and three annotated steps, Install, Sign in, and Test. Highlight the current step with “You are here”, explain the next result, show the exact planned action before its primary button, and place terminal output below. Keep one prominent action at a time. Include account and cost explanations, specific recovery hints, an IT or teacher request to copy, and the option to continue reading.

Entry points are onboarding, the Reader no-AI card, Settings > Providers, and the sidebar AI tools entry. The sidebar keeps a status dot and version chips. Update progress does not interrupt active chats. A successful switch says that the update applies to new chats. All new copy belongs to `shared/locales/{en,zh-Hant,ja}/ai-cli.json`.

Manual installation shows one short explanation and a confirmed official-source link in the left column. The right column leads with three numbered steps, Copy command, Open Terminal and paste, and return to Check again. Check again is the only primary button and repeats file-only discovery. The permission label says that VStudy can use the tool once it is installed. These steps and labels are shared by every provider and translated into English, Traditional Chinese, and Japanese.

The `terminal-<provider>` action is an external-terminal capability. Main maps its ID to the same fixed official command displayed by the renderer. After native confirmation, the existing external-terminal action copies that command and opens a blank terminal with fixed argv. It never pastes or executes the installer. Its token cannot start an embedded action. Opening the terminal does not enable the provider or the advanced shell. Provider consent and executable approval still gate sign-in, status, and test execution. Codex remains macOS-only.

## Integration and verification

Stream M can call `desktop.invoke('ai-cli:list', {})` for file-only state and `openAiCliSetup(provider)` from `renderer/ai-cli/entry.ts` to open this same setup flow. It must not configure or install a second executable. Stream P's `main/platform/process.ts` and `shared/platform.ts` were initially copied from `t3/cross-platform`. This stream adds the Windows Antigravity install location to the process helper. The unused paths helper was removed. Merge these additive seams with P. No MCP files were edited.

Verify state transitions, disabled-provider discovery, argv and environment boundaries, output and input caps, cancellation, checksum failures, signature failures, safe archive handling, side-by-side switching with a live old process, rollback, update fixtures, component states, and real Electron install/sign-in/test/update with local fake executables. Save the language and theme matrix under `docs/evidence/ai-cli/`. Native Windows and notarized release acceptance require the appropriate host and signing credentials. Do not claim those from a macOS development run.

Throughput checkpoint. First commit the design and IPC contract. Build backend and renderer as separate verified units. Integrate and review both diffs. Run targeted checks once per unit, then full checks and packaged Electron evidence. Merge main before a separate final README and website documentation commit. As an implementation delegate, leave the coordinator's independent review and PR gate to the coordinator.

## Decisions confirmed during implementation

Managed installation downloads native vendor payloads directly. The copy-only fallback shows the official installer for the user's own terminal. It explains that vendor installers use vendor folders and that Settings > Providers > Change selects an existing executable. An explicit custom selection wins until the user requests another managed install or update. Pending executable approval cannot overwrite a newer selection.

Antigravity disables its own updater only when `AGY_CLI_DISABLE_AUTO_UPDATE=true`. The value `1` does not satisfy the vendor's documented switch. Claude receives `DISABLE_AUTOUPDATER=1` and `DISABLE_UPDATES=1`. This keeps managed version paths stable. See [Antigravity troubleshooting](https://antigravity.google/docs/cli-troubleshooting?hl=en).

The embedded sign-in PTY is currently enabled on macOS only. Its sandbox prevents the CLI from launching a browser outside the app's link confirmation. Windows and Linux show the exact direct sign-in command and offer the user's terminal. Codex chat remains macOS-only. This is a deliberate limitation until equivalent browser-launch containment is available on those platforms.

The Advanced preference requires main's native confirmation before enabling the general shell. Reloading the main document revokes its preview tokens and stops setup processes. Previews awaiting network metadata also become invalid. Existing chat sessions are not owned by this setup cleanup. The terminal scrolls into view once when an action starts, keeping sign-in codes visible.

Package acceptance uses the actual ASAR app with release fuses enabled and the native node-pty library unpacked. The build restores the executable bit on node-pty's spawn helper because the published prebuild lacks it on this host. Developer ID signing and notarization still require release credentials. Retention intentionally keeps all verified versions rather than risking deletion of a binary used by another process after an app restart.

## Independent artifact trust after security review

A feed-controlled checksum detects transfer damage, but a compromised feed can replace both bytes and checksum. `SetupStore` therefore enforces authenticity itself before every probe, reuse, or rollback. Calling the store directly cannot bypass this rule. The execution policy is centralized in `setup/authenticity.ts`.

| Provider and platform | Execution authority shipped in the app | Install and update behavior |
| --- | --- | --- |
| Claude on supported native platforms | OpenPGP fingerprint `31DDDE24DDFAB679F42D7BD2BAA929FF1A7ECACE`. Verify the detached manifest signature, version, platform, native executable name, and executable SHA-256. | Managed installation and dynamic updates can proceed only after signature verification. A feed or receipt cannot choose the trusted fingerprint. |
| Codex 0.166.0 on macOS arm64 and x64 | Exact archive and extracted executable SHA-256 values in `setup/codex-pins.ts`. | Both app-embedded hashes must match before the probe. Future versions without pins show a manual update notice. The existing macOS-only transport audit still applies. |
| Antigravity on every platform | No supported independent proof is configured. Its feed-supplied SHA-512 is insufficient. | No managed installation or activation. Show **Install another way**, the exact official command, and the reason. Update chips link to the vendor through external-link confirmation. |

The [Codex audit](evidence/ai-cli/security/codex-pins.json) records the official 0.166.0 assets, sizes, archive hashes, executable hashes, and strict Apple-anchored signature verification. The x64 pin was newly established in this audit. Neither downloaded binary nor installer ran. Runtime authorization uses the reviewed in-app hashes, rather than future release metadata.

Read-only inspection of installed vendor binaries found Anthropic Team ID `Q6L2SF6YDW`, OpenAI `2DC432GLL2`, and Google `EQHXZ8M8AV`. `codesign -dv --verbose=4` identifies the publisher and `codesign --verify --strict` passes for each. `spctl --assess --type execute --verbose=4` returns exit 3 for each standalone CLI, with "code valid but does not seem to be an app". [The exact commands and outputs](evidence/ai-cli/security/local-publishers.json) preserve this limitation. No runtime Team ID exception or unverified Windows Authenticode identity was added. A future dynamic native-signature path must meet the full pinned-publisher verification policy before execution.

Installation receipts and active pointers are untrusted local metadata. Every managed launch rehashes the executable and re-verifies its app pin or signed Claude manifest. This is the record-authentication option used here; no new Keychain secret is required. `ExecutablePins` keeps the prior approved identity as the expected identity. Only the main-owned successful installer or rollback result can replace that pin without another dialog. A pointer changed outside that operation requires changed-executable confirmation and still must pass authenticity verification.

An automatic action captures provider consent and the update-preference revision. It rechecks provider opt-in, both update preferences, chat activity, executable leases, and other setup actions after asynchronous work, before probes, before promotion retries, and immediately before pointer replacement. Revocation aborts its owner and removes staging or an unactivated promoted version. Turning preferences back on does not resume an action authorized by an older revision. Manual updates retain their existing side-by-side behavior during active chats.

The terminal filter is a bounded streaming parser. It handles repeated ESC, C1 controls, split terminators, and cancellation. It removes every OSC, DCS, APC, PM, and SOS string while preserving ordinary ANSI CSI. Tests run the pinned xterm 6.0.0 parser, reproduce title and hidden-link registration without filtering, and verify zero title or link registrations after filtering under varied chunking. This Node proof does not establish DOM link activation behavior.

The helper exec-bit repair from main is part of this branch. Its confined runtime guard handles `0644` helpers and ASAR-unpacked paths, with localized failure when repair is impossible. See [the engineering guide](ENGINEERING.md#native-pty-helper-permissions).
