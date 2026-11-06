# Guided AI CLI setup implementation report

Students can install an AI tool, sign in, test a real answer, and manage updates from one Quiet folio sheet. On macOS, sign-in runs in the app's terminal. The sidebar keeps versions and update state visible. Existing chats keep their original executable through an update. Native Windows acceptance, new-account OAuth, and Developer ID notarization remain unverified.

Work is on `t3/ai-cli-setup`. Current main at `0d990b2` was merged as `10b6fc7` before the isolated README and website documentation change. The merge preserves butterfly branding, platform icons, onboarding, the AI tools sidebar, and native terminal unpacking. No MCP stream files were changed. No PR was opened.

## Study and decisions

T3 Code was cloned outside this repository at `/private/tmp/vstudy-cli-t3code-c-study`, revision `c52df24d285a072ad9c3f7ab5b3656c0be1cb0f5`. A second reference checkout at `/private/tmp/vstudy-t3code-research` was studied at `cefb544af3c98224874419198c0359b652ca3c94`.

T3 separates installed executable identity, provider health, and authentication. Authentication remains unknown until a real probe. Its `CodexInstallation.ts` stages checksummed version directories, records completion, and atomically replaces `active.json`. Running processes retain an absolute version path. Windows directory promotion retries account for retained handles. `SidebarProviderUpdatePill.tsx` exposes quiet update progress and opens provider settings, without interrupting a chat. Its terminal uses node-pty. These findings informed this implementation; the installed T3 application did not need inspection. See [T3 Code source](https://github.com/pingdotgg/t3code/tree/c52df24d285a072ad9c3f7ab5b3656c0be1cb0f5).

| Decision | Reason and evidence |
| --- | --- |
| Use an action-scoped node-pty with xterm.js. | Pipes do not supply terminal semantics for interactive sign-in. The actual ASAR package loaded node-pty, answered a command, and closed it. ConPTY plumbing is present; native Windows remains unverified. |
| Download native releases in main. | Vendor metadata, size caps, hashes, and Claude's signature are checked before execution. The normal installer changes no global prefix, shell profile, or PATH. Official shell installers are copy-only fallbacks. |
| Keep immutable version directories and an active JSON record. | A real old-version chat kept producing a heartbeat, then completed after version 1.1.0 became active. Rollback returned to 1.0.0. |
| Preserve an explicit custom executable choice. | A managed copy cannot silently displace the user's selected executable. Tests cover selection persistence, changed files, and a pending approval racing a newer selection. |
| Contain embedded login on macOS; use an external terminal elsewhere. | sandbox-exec prevents the CLI from bypassing the app's browser-link confirmation. Windows and Linux retain a reviewed direct command, copy, and external-terminal fallback. |
| Retain old versions conservatively. | Current-process leases cannot prove that an executable is unused after an app restart or in a user terminal. Automatic garbage collection is deferred. |

The folio layout was chosen over a vertical rail and a stacked form. Three static sketches were compared in `/private/tmp/vstudy-ai-cli-renderer-sketches`. Real screenshots found the primary button below the fold, then found sign-in codes outside the visible area. The fixes compact the first viewport and reveal a new action's terminal. See [the layout decision](art/ai-cli-decision.md), [the initial design](AI_CLI_SETUP_DESIGN.md), and [the recorded decisions](evidence/ai-cli/decisions.tsv).

## Real commands and verification

Official installer scripts were downloaded and inspected, not executed. The app's managed installer downloads the release payload itself. Read-only version, help, and status commands ran against installed tools on this Mac. [Sanitized local probe evidence](evidence/ai-cli/local-cli-probes.json) excludes account names and raw credential responses.

| Tool | Native install and copy-only fallback | Sign in | Status verified locally |
| --- | --- | --- | --- |
| Claude Code 2.1.318 | Native binary from the signed Claude release manifest. Copy fallback on macOS is `curl -fsSL https://claude.ai/install.sh \| bash`; PowerShell is `irm https://claude.ai/install.ps1 \| iex`. | `claude auth login`. Help was run; a new login was not performed. | `claude auth status --json`, with `loggedIn`. Existing authentication was confirmed. |
| Codex 0.167.0 installed locally | Managed installation is pinned to audited macOS **0.166.0** from GitHub releases. Copy fallback is `curl -fsSL https://chatgpt.com/codex/install.sh \| sh -s -- --release 0.166.0`. The inspected installer uses `--release`, not `--version`. | `codex login --device-auth`. Login help was run; a new login was not performed. | `codex login status` confirmed an existing account. Local 0.167.0 is deliberately rejected by VStudy's 0.166.0 transport policy. |
| Antigravity 1.4.12 | Native payload from the vendor's platform manifest. Copy fallback is `curl -fsSL https://antigravity.google/cli/install.sh \| bash`; PowerShell is `irm https://antigravity.google/cli/install.ps1 \| iex`. | `agy --sandbox --include-default-customizations=false` starts first-run sign-in. `agy help auth` and `agy help login` both confirmed there are no such subcommands. | `agy acp --stdio --sandbox --include-default-customizations=false`, then ACP `initialize` and `session/new` without `authenticate`. A local read-only probe established an authenticated session and six models. |

Claude publishes SHA-256 and a detached manifest signature. The pinned key fingerprint is `31DDDE24DDFAB679F42D7BD2BAA929FF1A7ECACE`. Codex release assets publish SHA-256. Antigravity publishes SHA-512; its recorded manifest advertises 1.5.1 and its Unix archive contains `antigravity`. Recorded metadata and signature fixtures are in `main/providers/setup/fixtures/` and are tested without network access.

Managed sessions disable vendor self-updates. Antigravity requires the literal `AGY_CLI_DISABLE_AUTO_UPDATE=true`; `1` is insufficient. Claude receives `DISABLE_AUTOUPDATER=1` and `DISABLE_UPDATES=1`. Sources are [Claude setup](https://code.claude.com/docs/en/setup), [Codex CLI reference](https://developers.openai.com/codex/cli/reference), [Codex source](https://github.com/openai/codex), [Antigravity CLI setup](https://antigravity.google/docs/getting-started?tab=cli), and [Antigravity troubleshooting](https://antigravity.google/docs/cli-troubleshooting?hl=en).

## Behavior and security

The shared data shapes are `CliToolState`, `CliActionPlan`, and `CliActionSession`. Each provider has one setup status from `not-installed`, `installing`, `installed-not-signed-in`, `signing-in`, `ready`, `update-available`, `updating`, or `error(code, hint)`. Strict Zod contracts live in `shared/ai-cli.ts` and are spread into the existing IPC contract.

The renderer requests only a named action and a main-issued token. Main owns executable resolution, argv, sanitized environment, working directory, download metadata, and the fixed tiny prompt. Tokens expire after two minutes, are single-use, and belong to the originating window and document. A document reload invalidates pending previews and terminates its setup actions. It does not stop chats. Revoking provider consent, closing setup, or destroying its window also stops the affected setup process tree.

Normal discovery reads files without launching a disabled provider. Existing opt-ins and changed-executable confirmation remain in force. Interactive input is available only to a running login or explicitly enabled advanced shell. The general shell starts off and needs main's native warning confirmation; a renderer cannot silently enable it. External-terminal commands are display text for the user to paste, not renderer commands executed by main.

PTY output has a 2 MB total limit. A session retains at most 262,144 characters. Input is limited to 4,096 bytes per request, 16,384 bytes per second, and 1 MB per action. Main strips OSC and DCS control strings across chunk boundaries. Output is inert text and stays in memory. Authentication JSON stays in main. Native error details are replaced before logging. HTTPS sign-in links and release notes use the existing external-link confirmation. See [the terminal threat model](SECURITY.md#guided-ai-setup-and-terminal-threat-model).

Installations stage below `userData/ai-tools/<provider>/<version>`. Vendor HTTPS hosts, redirects, sizes, archive entries, checksums, and available signatures are validated. A verified complete installation can atomically replace the active record. No running executable is overwritten. Previous versions remain available for reviewed rollback. Managed updates do not mutate a separately installed CLI.

Background update checking and automatic idle updating are separate default-off preferences. Checks run at launch and on a four-hour timer after opt-in. Check now is explicit, throttled, cached, and offline-safe. Privacy inventories metadata and payload requests without query-string auth codes. Automatic activation rechecks chat activity, including a chat that started and finished during the download. Manual updates can proceed while existing chats retain the old binary.

The UI is translated into English, Traditional Chinese, and Japanese. Entry points are onboarding, the Reader no-AI card, Settings > Providers, and the sidebar. Three annotated steps identify the current step and next result. The sheet offers plan review, live output, recovery hints, cost/account explanations, an IT/teacher request, and optional external-terminal/copy fallbacks. The final test uses the existing tool-free provider transport and displays its actual answer without document context.

## Verification and evidence

The suite ran on macOS arm64 with Node 26.9.0 and Electron 42.11.16. Only one Electron application ran at a time. Vitest used `--pool=forks --maxWorkers=2`.

| Command or check | Result |
| --- | --- |
| `pnpm security:check` | Passed after merging main. 1,128 tests passed, 14 skipped. Lint and semantic-token contrast checks passed. Three existing external-link lint warnings remain. The dependency audit reports no unreviewed advisories; it still includes accepted existing advisories. |
| `pnpm typecheck` | Desktop and website passed. |
| `pnpm knip` | Passed. A configuration hint about excluded CSS remains. |
| `pnpm --filter @vstudy/desktop build` | Passed. |
| `pnpm --filter @vstudy/website build` and `verify:static` | Passed. Localized getting-started and AI-provider guides are generated. |
| `node scripts/check-readme-links.mjs` | Passed for all three READMEs. |
| `node e2e/ai-cli.mjs` from `apps/desktop` | All three providers completed managed install, interactive login, and a tiny real-adapter answer in nine language/theme variants. |
| The same suite with `VSTUDY_AI_CLI_OPPOSITE_SCHEMES=1` | The opposite nine variants passed. Together this covers three languages, three themes, and light/dark schemes. |
| Both process matrices | A real fake sign-in process was killed on reload. A real old-version chat survived activation, continued its heartbeat, and finished. Rollback passed. Keyboard focus/dismissal and layouts at 900/1440 pixels and 125% scale passed. |
| `pnpm exec electron-builder --mac dir --publish never -c.mac.notarize=false -c.mac.identity=null` | Built the native ASAR app with node-pty unpacked and its spawn helper executable. |
| `node e2e/ai-cli-packaged.mjs` | The actual packaged app answered a native PTY command, closed the action, and reset preferences. `codesign --verify --deep --strict` passed for the ad-hoc signature. RunAsNode and inspector arguments remained disabled; ASAR-only loading and integrity validation remained enabled. |

State table tests cover legal and illegal transitions. Other tests cover literal argv with spaces, quotes and shell metacharacters, sanitized environments, owner capabilities, output/input caps, process-tree cancellation, checksum/signature failures, unsafe archives, pinned Codex compatibility, recorded update fixtures, side-by-side activation, rollback, idle-update races, explicit executable choices, and renderer recovery. Development fixture mapping requires an explicit flag and absolute fixture file. Packaged apps ignore it.

The [evidence index](evidence/ai-cli/index.md) links screenshots and DOM snapshots for each step. Full matrices are [the main schemes](evidence/ai-cli/matrix/results.json) and [the opposite schemes](evidence/ai-cli/matrix-opposite/results.json). [Packaged evidence](evidence/ai-cli/packaged/result.json) records native library/helper inclusion and fuses. Screenshots contain fake accounts and codes. They do not claim live OAuth completion. The initial layout rounds use visual fixtures only; the final matrices use real main/preload IPC, real PTYs, signed local release fixtures, and real provider adapters.

## Integration seams and remaining work

Stream M can import `openAiCliSetup(provider?: 'claude' | 'codex' | 'agy')` from `renderer/ai-cli/entry.ts` and call `desktop.invoke('ai-cli:list', {})` for file-only state. It should link a missing client to this sheet. No MCP files were edited. The coordinator received this seam during implementation.

Stream P must reconcile `main/platform/process.ts` and `shared/platform.ts`. They were initially copied from its platform helper layer. This stream adds Windows Antigravity's install directory. Codex transport remains macOS-only. Shared merge points are `shared/ai-cli.ts`, additive `shared/ipc.ts`, main IPC registration/disposal, package dependencies/unpacking, the pnpm lockfile, onboarding, the Reader, Settings, and the sidebar. The existing preload provider-change notification is reused without editing preload.

Packaging touches `apps/desktop/package.json`, `electron.vite.config.ts`, and `pnpm-workspace.yaml`. The latter permits node-pty's native install script. Existing provider changes are in `agy.ts`, `codex.ts`, `cli-transport.ts`, `trusted-executable.ts`, and `executable-pins.ts`. These carry process leases, self-update opt-outs, version-path resolution, and explicit executable selection. Final review also tightened the macOS external-terminal opener to use the reviewed sanitized environment and working directory; its regression test rejects inherited provider keys and shell startup hooks.

Native Windows installation, ConPTY behavior, external terminal launching, and packaging need a Windows host. Embedded Windows/Linux sign-in remains unavailable until browser-launch containment is equivalent. macOS x64 native acceptance was not run. New-account browser OAuth and a live paid tiny prompt were not run. Developer ID signing and Apple notarization need release credentials. Automatic version garbage collection is deferred in favor of conservative retention. No demo video was added; annotated static steps and screenshot evidence are present.

Independent cross-family review and any PR gate remain coordinator-owned. Passing tests and implementation self-review are not an independent verdict. This report does not mark the branch as independently reviewed or ready to ship.

## Delivery and dispatch record

Blocking work established the official commands, executable trust rules, managed directory policy, and strict IPC shapes before delegation. Backend and renderer then worked in separate worktrees from the committed contract. Shared IPC edits and integration serialized in this checkout. Verification used bounded workers and one Electron app. The folio and capability design survived runtime verification, so no replacement implementation was needed.

The renderer's two commits, the backend's five commits, and the integration/recovery fixes remain separate reviewable units. The interrupted backend task was stopped and replaced with a fresh verification task on its branch. Its manual-login recovery was reviewed and integrated with the ownership fixes. Final documentation follows the main merge in its own commit.

Model the Domain shaped the explicit states and actions. Boundary Discipline shaped the main-owned capability interface. Test Behavior shaped the process assertions. Prove It Works required the native package test. Sequence Work into Verifiable Units shaped the commit boundaries. These are the applied [poteto-mode principles](/Users/vc/.claude/plugins/cache/t3-pstack/t3-pstack/2.2.1/skills/poteto-mode/SKILL.md).

Dispatch ledger follows.

- Research and design. In-thread implementation delegate, using local source, official docs, and read-only probes.
- Renderer implementation. `codex/gpt-6.1-sol`, reasoning effort xhigh, service tier priority, separate worktree.
- Backend implementation. `codex/gpt-6.1-sol`, reasoning effort max, service tier priority, separate worktree. Interrupted externally, then stopped before replacement.
- Fresh backend completion and verification. `codex/gpt-6.1-sol`, reasoning effort max, service tier priority, fresh isolated delegate.
- Integration, runtime verification, screenshots, and documentation. In-thread implementation owner, with every integrated diff reviewed.
- Independent review. Coordinator-owned and pending.
