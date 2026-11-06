> Current implementation note (2026-11-04): historical counts and results below describe their recorded snapshots. Provider/Privacy UI, asynchronous lazy Keychain access, session-only keys, converter idle controls and removed rendering sinks are covered by [the final implementation response](final-implementation-response.md). Release signing and real Keychain acceptance remain unverified.

# Security model and verification

Earlier adversarial findings and main-process remediation evidence: [security audit 1 response](security-audit-1-response.md). Current UI and acceptance results are in the final response linked above. The historical verification below predates both responses.

Assets are imported originals, extracted text, selections, prompts, conversations, provider credentials, usage history and application integrity. Adversaries include malicious documents and model responses, network attackers, compromised dependencies and malicious local processes. The supported deployment is a single-user macOS account with FileVault. An attacker executing as the same user can inspect memory, alter the library and invoke authenticated CLIs: OS file modes and safeStorage are not an isolation boundary against that attacker.

```text
Untrusted document -> main import/signature/ZIP guard -> private hashed library
                           | -> sandbox-exec (deny network) -> Python converter
Untrusted renderer -> isolated preload -> sender + budget + Zod registrar -> services -> SQLite
Untrusted model -> main citation catalog / presentation allowlist -> sanitized Markdown
Main -> HTTPS API / restricted authenticated CLI (stdin prompt; scrubbed env)
Main -> safeStorage -> Keychain-encrypted credentials file
User-confirmed external link -> schema allowlist -> native confirmation -> OS browser
First-run installer -> package index (hash-checked lock) -> private converter venv
```

## Guided AI setup and terminal threat model

The setup renderer is untrusted. It requests a named action and a main-issued preview token, never a command, executable, environment, download URL, or working directory. Strict Zod requests and the existing main-frame sender check apply to every `ai-cli:*` operation. Plans are single-use, expire, and belong to their originating window. A session ID grants input, resize, output, and cancellation only to that window's current action. Closing setup, reloading its document, or destroying its owner terminates the owned setup action and its process group. Reload also revokes pending previews, including previews still awaiting metadata. It does not terminate chat sessions. Shutdown awaits cleanup.

The normal terminal runs only allowlisted setup actions. Main scrubs inherited secrets, resolves approved absolute executables, uses argv arrays, and creates a private working folder. File-only discovery does not launch disabled providers. Opt-in and the existing changed-executable confirmation still apply. Claude and Codex status responses are parsed in main. Antigravity status uses ACP without the browser-opening authenticate request. The final test uses the existing tool-free adapter with a tiny fixed prompt and no document context. Codex retains its audited macOS-only transport policy.

Terminal output is untrusted text, never HTML. Main's bounded streaming parser strips all OSC, DCS, APC, PM, and SOS strings across chunk boundaries. It handles repeated ESC bytes, C1 controls, BEL and ST terminators, and cancellation. This removes title changes, clipboard writes, and hidden hyperlinks. Ordinary ANSI CSI remains available for terminal layout. Tests reproduce the unfiltered exploit in the real pinned xterm 6.0.0 parser, then assert zero title or link registrations under fuzzed chunking. This parser proof runs in Node and does not test DOM link activation. Clicked visible HTTPS links use the existing schema and native external-link confirmation. Guided login uses a constrained browser-launch policy and displays manual sign-in links and codes. Embedded login is currently macOS-only because that browser-launch restriction uses sandbox-exec. Windows and Linux have a reviewed command and external-terminal fallback. Input is accepted only during a running login or advanced shell. Output is capped at 262,144 characters per session, with a 2 MB PTY output limit and 4,096-byte input limit per request. Output remains in session memory and is not written to application logs. The app shows the tiny test answer, but not raw authentication JSON. Users can copy output themselves, so shared screenshots still need review.

The advanced general shell starts off. Enabling it requires both the explicit preference and main's native warning confirmation. A renderer cannot silently authorize its own general shell through the preferences IPC. Approval grants arbitrary program execution as the signed-in OS user through interactive input. The setup allowlist does not constrain that shell's commands. Students do not need it for setup. An external-terminal action opens the user's terminal and copies a display command for the user to paste. Main does not execute a renderer-provided shell string.

Manual installation uses `terminal-claude`, `terminal-codex`, or `terminal-agy` with the existing preview-token and external-terminal IPC. These capabilities work before provider consent because they only copy a fixed official installer command and open a blank external terminal. Main's native confirmation displays that command before copying or opening anything. Main then consumes the window-bound token and rechecks document validity. The embedded runner rejects these IDs. No installer command appears in the terminal process's argv, and nothing is pasted or executed automatically. Cancellation changes neither the clipboard nor provider consent. Check again repeats file-only discovery and never probes the newly discovered program.

Managed downloads use explicit vendor HTTPS destinations and bounded redirects, responses, and payloads. A digest delivered by the same feed as the bytes does not authenticate a publisher. `SetupStore` independently verifies authenticity before any downloaded executable runs, including its `--version` probe. Claude's detached manifest signature must match the app-pinned OpenPGP fingerprint `31DDDE24DDFAB679F42D7BD2BAA929FF1A7ECACE`. The signed version, platform, executable name, and SHA-256 must match the actual binary. Codex 0.166.0 on macOS arm64 and x64 must match both the archive and executable SHA-256 pins shipped in `setup/codex-pins.ts`. Unknown Codex versions cannot use a feed digest as authorization. Antigravity's feed-supplied SHA-512 is insufficient, so managed installation and updates are unavailable on every platform. The sheet explains this and offers the exact vendor command for the user's own terminal. Unpinned updates display a manual-install notice and confirmed vendor link. Archive extraction accepts only the expected regular executable and rejects unsafe paths and links. Downloads stage in a private user-space directory. Only complete authenticated versions can become active. No global installation, shell profile, or user PATH is changed.

Installation JSON is not a trust anchor. Managed resolution and rollback recompute the executable identity and repeat its pinned-digest or signed-manifest verification. A forged receipt cannot authorize its own checksum, key fingerprint, version, or active path. The previously approved executable pin remains the expected identity. A managed pointer change outside the app's verified install or rollback requires the existing native changed-executable confirmation, and approval still cannot bypass artifact authentication. This uses re-verification instead of an HMAC and adds no new Keychain secret. Same-user attackers who can alter the application, approved-pin store, or live process remain outside this containment guarantee.

The [Codex pin audit](evidence/ai-cli/security/codex-pins.json) records both exact artifacts and their verification before any execution. [Read-only publisher inspection on this Mac](evidence/ai-cli/security/local-publishers.json) found Anthropic `Q6L2SF6YDW`, OpenAI `2DC432GLL2`, and Google `EQHXZ8M8AV`. Strict code-signature verification passed, but `spctl` returned exit 3 for all three standalone CLIs, with "code valid but does not seem to be an app". These observations do not enable a runtime native-signature installation path. No Windows Authenticode publisher chain has been verified. Dynamic versions without app pins remain manual unless a supported independent signature, such as Claude's pinned-key detached signature, passes before execution.

Activation replaces an application-owned JSON pointer, never a running executable. New provider launches resolve an immutable version path. Running processes keep their previous path. Rollback authenticates the retained version before switching. Retention is conservative, so setup does not garbage-collect a version that another process might still use. Background checks and automatic idle updates have separate default-off preferences. Automatic actions recheck provider consent, both update preferences, preference revision, chat activity, executable leases, and other actions after asynchronous work and immediately before execution or pointer replacement. Revocation aborts the automatic owner and removes unactivated files. Re-enabling preferences does not revive an action from the old revision. Manual updates can still finish while old chats run. Explicit Check now is a one-time network action. Checks are cached and rate-limited. Settings > Privacy inventories app-initiated metadata and download requests without authentication codes, prompts, or account details. Vendor-internal network traffic remains outside that inventory.

Before every Unix PTY spawn, a confined guard verifies the resolved node-pty spawn-helper has execute permissions. It repairs missing execute bits only within the real dependency package, including ASAR-unpacked paths. Symlink escapes are rejected. Unrepairable helpers produce the localized `terminal-unavailable` recovery hint. Root `prepare` provides the same offline repair for source installs; runtime checking also covers installs that disable lifecycle scripts. [Engineering details and regression coverage](ENGINEERING.md#native-pty-helper-permissions) describe the guard.

The Electron acceptance suite uses local fake CLIs and signed fixture releases. Its local mapping requires an explicit development test flag and fixture path. Packaged apps ignore that mapping. The packaged PTY smoke uses the existing isolated smoke profile and the public action contract. Development fixtures and an ad-hoc package do not establish live OAuth completion, Windows acceptance, or Developer ID notarization.

## Controls and evidence mapping

| Threat / item | Control | Evidence |
| --- | --- | --- |
| 1: packaged Node/inspector abuse | afterPack flips seven fuses; ASAR; production maps excluded; file allowlist | scripts/after-pack.mjs; package verification below |
| 1: macOS release integrity | hardened runtime; empty entitlement dictionary; electron-builder uses CSC_NAME/CSC_LINK and APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/APPLE_TEAM_ID or API-key notarization environment | unsigned packaging only; signing unverified |
| 2: renderer escape | app.enableSandbox, context isolation, disabled Node/webview, global web-contents-created navigation/popup/webview denial | src/main/index.ts; smoke; security.test.ts |
| 2: permission/device abuse | deny handlers; only main-frame app clipboard-sanitized-write; deny device access | index.ts; packaged GUI verification required |
| 2: network exfiltration | production connect-src 'none' (stricter than self); remote requests blocked; document images restricted to raster data/local asset paths; assistant images never load | markdown.test.ts; productionCsp |
| 2: asset traversal | realpath containment, symlink/hardlink refusal, GET, raster extension allowlist, 12 MiB cap, MIME/nosniff/CSP | assets.test.ts; hardening.test.ts |
| 3: untrusted IPC | exact main frame/window URL; central request/response Zod validation; byte budgets and fixed-window per-sender/channel limits | register.test.ts covers every contract channel, oversized payload, budget and malformed response |
| 4: hostile files | 50 MiB source, magic bytes, UTF-8, ZIP entry/expansion/ratio/encryption/link/path checks; every dialog/drop/importSample goes through importPath; every queued conversion (including restart/retry/reconvert) revalidates source | documents.test.ts; documents.integration.test.ts; hardening.test.ts |
| 4: converter subprocess | shell:false argv, allowlisted env, private mkdtemp cleanup, process-group termination, watchdog, native macOS network sandbox inherited by children | converter-worker.test.ts; documents.integration.test.ts |
| 4: converter installation | requirements.lock.txt records all transitive hashes; both uv and pip --require-hashes; lock digest invalidates prior environments | real integration bootstrap test |
| 5: secrets/logs | lazy asynchronous safeStorage with deadlines, explicit unlock and session-only keys; no Keychain call on launch; no key IPC getter; central log redaction; static UI failures; CLI prompt stdin and env allowlist | secrets.test.ts; hardening.test.ts fake child argv/env probe; providers.test.ts |
| 5: delete data | Privacy typed DELETE; main literal validation; native destructive confirmation; stop workers, close store, remove userData and verify absence | hardening.test.ts removes DB/library/secrets/cache/venv fixture tree |
| 6: injection/model output | documents/selections delimited as untrusted; citations filtered against current main-owned catalog; CLI generative UI disabled; raw HTML and dangerous URL schemes removed; native external-link confirmation | prompt/index.test.ts; citations.test.ts; chat.test.ts; markdown.test.ts injection corpus |
| 7: supply chain | exact direct pins; integrity lock; only electron/esbuild/node-pty allowed install scripts; pinned CycloneDX and Electron lint; dangerous API lint | security-audit.json; sbom.cdx.json; licenses.json; security:check |
| 8: data at rest | library 0700, DB/backups/secrets 0600 restored on startup; export chmod 0600; private temp directories | db/index.test.ts; library.test.ts; secrets.test.ts; hardening.test.ts |

Production style-src 'unsafe-inline' is needed for React inline styles used by resizable pane geometry, virtualized/animated Welcome positioning, Radix/Base UI placement, and KaTeX layout. It does not permit scripts or eval. Removing it requires moving those runtime-computed styles to a nonce-based stylesheet implementation.

The database, originals, Markdown and chat records are **not encrypted**. FileVault protects a powered-off Mac; account permissions protect against other ordinary accounts. safeStorage encrypts only provider API-key values using macOS Keychain-backed encryption. JavaScript strings cannot be reliably zeroized. Unlocked and session-only keys remain in main memory until deletion or process exit; saved ciphertext remains on disk. Authenticated CLIs retain their own login material under their own policies.

The first-run installer needs network access to download Python (if uv must provision it) and hash-locked wheels/packages. Conversion runs under macOS sandbox-exec with `(deny network*)`, plus Python socket-connect denial as defense in depth. sandbox-exec is a deprecated macOS facility and this runtime restriction is macOS-specific. Python sets RLIMIT_NOFILE=128, RLIMIT_FSIZE=64 MiB, RLIMIT_CORE=0; memory is monitored at 1500 MiB and jobs have a 120-second deadline. These do not establish a hard kernel address-space limit. The converter can still read files allowed to the account; a complete least-privilege filesystem sandbox is future work.

## IPC registry inventory

Every row uses `ipcContract[channel].request` and `.response` as the authoritative validator (shared/ipc.ts spreads shared/library.ts). Sender **M** means the current BrowserWindow, its identical mainFrame and exact entry URL. All request caps apply before parsing/side effects. Rate limits are fixed windows per sender/channel, not concurrent-job limits. Responses are schema validated; unbounded legacy list responses are an accepted availability risk.

| Channel | Validator (request / response) | Sender | Requests / minute | Request cap | Side effects |
| --- | --- | --- | --- | --- | --- |
| `activity:heartbeat` | `activity:heartbeat` request / response | M | 120 | 512 KiB | Validated DB/settings mutation |
| `chat:abort` | `chat:abort` request / response | M | 600 | 512 KiB | Provider network/CLI; DB messages or abort |
| `chat:start` | `chat:start` request / response | M | 12 | 8 MiB | Provider network/CLI; DB messages or abort |
| `conversations:create` | `conversations:create` request / response | M | 600 | 512 KiB | Validated DB/settings mutation |
| `conversations:delete` | `conversations:delete` request / response | M | 600 | 512 KiB | Validated DB/settings mutation |
| `conversations:list` | `conversations:list` request / response | M | 600 | 512 KiB | Read metadata/content; read may record activity |
| `conversations:model` | `conversations:model` request / response | M | 600 | 512 KiB | Validated DB/settings mutation |
| `conversations:options` | `conversations:options` request / response | M | 600 | 512 KiB | Validated DB/settings mutation |
| `dashboard:get` | `dashboard:get` request / response | M | 600 | 512 KiB | Read metadata/content; read may record activity |
| `documents:delete` | `documents:delete` request / response | M | 600 | 512 KiB | Validated DB/settings mutation |
| `documents:get` | `documents:get` request / response | M | 600 | 512 KiB | Read metadata/content; read may record activity |
| `documents:import` | `documents:import` request / response | M | 12 | 512 KiB | Read validated source; library/DB write; queued converter |
| `documents:importPaths` | `documents:importPaths` request / response | M | 12 | 512 KiB | Read validated source; library/DB write; queued converter |
| `documents:importSample` | `documents:importSample` request / response | M | 12 | 512 KiB | Read validated source; library/DB write; queued converter |
| `documents:list` | `documents:list` request / response | M | 600 | 512 KiB | Read metadata/content; read may record activity |
| `documents:read` | `documents:read` request / response | M | 600 | 512 KiB | Read metadata/content; read may record activity |
| `documents:reconvert` | `documents:reconvert` request / response | M | 12 | 512 KiB | Read validated source; library/DB write; queued converter |
| `documents:retry` | `documents:retry` request / response | M | 12 | 512 KiB | Read validated source; library/DB write; queued converter |
| `library:counts` | `library:counts` request / response | M | 600 | 512 KiB | Read metadata/content; read may record activity |
| `library:documents:list` | `library:documents:list` request / response | M | 600 | 512 KiB | Read metadata/content; read may record activity |
| `library:documents:move` | `library:documents:move` request / response | M | 600 | 512 KiB | Validated DB/settings mutation |
| `library:documents:pin` | `library:documents:pin` request / response | M | 600 | 512 KiB | Validated DB/settings mutation |
| `library:documents:purge` | `library:documents:purge` request / response | M | 600 | 512 KiB | Validated DB/settings mutation |
| `library:documents:rename` | `library:documents:rename` request / response | M | 600 | 512 KiB | Validated DB/settings mutation |
| `library:documents:restore` | `library:documents:restore` request / response | M | 600 | 512 KiB | Validated DB/settings mutation |
| `library:documents:softDelete` | `library:documents:softDelete` request / response | M | 600 | 512 KiB | Validated DB/settings mutation |
| `library:documents:tag` | `library:documents:tag` request / response | M | 600 | 512 KiB | Validated DB/settings mutation |
| `library:exportMarkdown` | `library:exportMarkdown` request / response | M | 12 | 512 KiB | Native save dialog; write selected export |
| `library:exportOriginal` | `library:exportOriginal` request / response | M | 12 | 512 KiB | Native save dialog; write selected export |
| `library:folders:create` | `library:folders:create` request / response | M | 600 | 512 KiB | Validated DB/settings mutation |
| `library:folders:delete` | `library:folders:delete` request / response | M | 600 | 512 KiB | Validated DB/settings mutation |
| `library:folders:list` | `library:folders:list` request / response | M | 600 | 512 KiB | Read metadata/content; read may record activity |
| `library:folders:move` | `library:folders:move` request / response | M | 600 | 512 KiB | Validated DB/settings mutation |
| `library:folders:update` | `library:folders:update` request / response | M | 600 | 512 KiB | Validated DB/settings mutation |
| `library:openOriginal` | `library:openOriginal` request / response | M | 600 | 512 KiB | Validated contained original; OS opener |
| `library:pins:reorder` | `library:pins:reorder` request / response | M | 600 | 512 KiB | Validated DB/settings mutation |
| `library:reveal` | `library:reveal` request / response | M | 600 | 512 KiB | Validated contained path; Finder |
| `library:savedFilters:delete` | `library:savedFilters:delete` request / response | M | 600 | 512 KiB | Validated DB/settings mutation |
| `library:savedFilters:list` | `library:savedFilters:list` request / response | M | 600 | 512 KiB | Read metadata/content; read may record activity |
| `library:savedFilters:save` | `library:savedFilters:save` request / response | M | 600 | 512 KiB | Validated DB/settings mutation |
| `library:search` | `library:search` request / response | M | 12 | 512 KiB | Read metadata/content; read may record activity |
| `library:tags:delete` | `library:tags:delete` request / response | M | 600 | 512 KiB | Validated DB/settings mutation |
| `library:tags:list` | `library:tags:list` request / response | M | 600 | 512 KiB | Read metadata/content; read may record activity |
| `library:tags:save` | `library:tags:save` request / response | M | 600 | 512 KiB | Validated DB/settings mutation |
| `library:tree` | `library:tree` request / response | M | 600 | 512 KiB | Read metadata/content; read may record activity |
| `messages:list` | `messages:list` request / response | M | 600 | 512 KiB | Read metadata/content; read may record activity |
| `messages:page` | `messages:page` request / response | M | 600 | 512 KiB | Read metadata/content; read may record activity |
| `providers:configure` | `providers:configure` request / response | M | 600 | 512 KiB | Provider JSON; compatible-origin changes clear its key |
| `providers:list` | `providers:list` request / response | M | 600 | 512 KiB | Disabled CLI file metadata only; enabled providers may verify/discover models |
| `secrets:delete` | `secrets:delete` request / response | M | 600 | 512 KiB | Remove saved and main-memory key |
| `secrets:has` | `secrets:has` request / response | M | 600 | 512 KiB | Saved-key presence only; no Keychain/decryption |
| `secrets:set` | `secrets:set` request / response | M | 600 | 512 KiB | Explicit async encryption, credential file write, enable provider |
| `settings:appearance` | `settings:appearance` request / response | M | 600 | 512 KiB | Read metadata/content; read may record activity |
| `settings:deleteAllData` | `settings:deleteAllData` request / response | M | 600 | 512 KiB | Native confirmation; stop services; remove userData; quit |
| `settings:get` | `settings:get` request / response | M | 600 | 512 KiB | Read metadata/content; read may record activity |
| `settings:set` | `settings:set` request / response | M | 600 | 512 KiB | Validated DB/settings mutation |
| `settings:systemLocale` | `settings:systemLocale` request / response | M | 600 | 512 KiB | Read metadata/content; read may record activity |
| `shell:openExternal` | `shell:openExternal` request / response | M | 600 | 512 KiB | Native confirmation; OS browser |
| `usage:dashboard` | `usage:dashboard` request / response | M | 600 | 512 KiB | Read metadata/content; read may record activity |
| `usage:estimate` | `usage:estimate` request / response | M | 600 | 8 MiB | Read metadata/content; read may record activity |
| `usage:export` | `usage:export` request / response | M | 12 | 512 KiB | Native save dialog; write selected export |
| `usage:forConversation` | `usage:forConversation` request / response | M | 600 | 512 KiB | Read metadata/content; read may record activity |
| `usage:forDocument` | `usage:forDocument` request / response | M | 600 | 512 KiB | Read metadata/content; read may record activity |
| `usage:page` | `usage:page` request / response | M | 600 | 512 KiB | Read metadata/content; read may record activity |
| `usage:rateLimits` | `usage:rateLimits` request / response | M | 600 | 512 KiB | Read metadata/content; read may record activity |
| `usage:summary` | `usage:summary` request / response | M | 600 | 512 KiB | Read metadata/content; read may record activity |
| `converter:mode` | offline boolean / ack | M | 600 | 512 KiB | Persist offline choice; explicit Retry can initialize converter and ask installation consent |
| `providers:chooseExecutable` | binary enum / nullable path | M | 600 | 512 KiB | Native chooser; validate and pin executable path/hash |
| `secrets:unlock` | provider ID / ack | M | 600 | 512 KiB | Explicit async decrypt into main memory; enable provider |
| `secrets:session` | provider ID + bounded key / ack | M | 600 | 512 KiB | Main-memory key only; enable provider |
| `settings:networkActivity` | empty / bounded event list | M | 600 | 512 KiB | Read latest 500 app-initiated session events; no packet/byte accounting |
| `welcome:sampleDocument` | `welcome:sampleDocument` request / response | M | 600 | 512 KiB | Read metadata/content; read may record activity |

`documents:importPaths` accepts only main-issued `drop:` capabilities. Isolated preload captures trusted native drops and keeps webUtils paths private; the page-facing getter returns a token, never the raw path. Tokens are single-use, expire after sixty seconds and bind to the exact frame. Synthetic drops and raw-path submissions cannot mint them. Main still revalidates sources before import/conversion. Native dialog results remain main-owned. This is not isolation from a main-world script’s other existing bridge authority. Heartbeats additionally require an existing document, seconds 1–60 and elapsed-time clamping. Welcome sample language is a closed enum and response is capped at 100,000 characters. Export filenames strip controls, bidi controls and separators and cap at 180 UTF-16 units. Exports request document IDs only.

## Supply-chain findings

`pnpm security:check` runs the audit and rejects advisory IDs absent from the reviewed snapshot; this is not a clean-audit claim. The raw report accompanies this table. Direct Zod remains on v3 because migrating the entire shared contract is a separate compatibility change; the central byte budget reduces constrained-collection exhaustion exposure but is not a proof against every adversarial nested object.

| Advisory | Package / severity | Disposition |
| --- | --- | --- |
| [1112659](https://github.com/advisories/GHSA-34x7-hfp2-rc4v) | tar / high | node-tar Vulnerable to Arbitrary File Creation/Overwrite via Hardlink Path Traversal. Build/development dependency only; not used to extract untrusted user documents at runtime. Release tooling remains a supply-chain risk; update transitive dependency graph before signed release. |
| [1113300](https://github.com/advisories/GHSA-8qq5-rm4j-mr97) | tar / high | node-tar is Vulnerable to Arbitrary File Overwrite and Symlink Poisoning via Insufficient Path Sanitization. Build/development dependency only; not used to extract untrusted user documents at runtime. Release tooling remains a supply-chain risk; update transitive dependency graph before signed release. |
| [1113375](https://github.com/advisories/GHSA-83g3-92jg-28cx) | tar / high | Arbitrary File Read/Write via Hardlink Target Escape Through Symlink Chain in node-tar Extraction. Build/development dependency only; not used to extract untrusted user documents at runtime. Release tooling remains a supply-chain risk; update transitive dependency graph before signed release. |
| [1114200](https://github.com/advisories/GHSA-qffp-2rhf-9h96) | tar / high | tar has Hardlink Path Traversal via Drive-Relative Linkpath. Build/development dependency only; not used to extract untrusted user documents at runtime. Release tooling remains a supply-chain risk; update transitive dependency graph before signed release. |
| [1114302](https://github.com/advisories/GHSA-9ppj-qmqm-q256) | tar / high | node-tar Symlink Path Traversal via Drive-Relative Linkpath. Build/development dependency only; not used to extract untrusted user documents at runtime. Release tooling remains a supply-chain risk; update transitive dependency graph before signed release. |
| [1114680](https://github.com/advisories/GHSA-r6q2-hw4h-h46w) | tar / high | Race Condition in node-tar Path Reservations via Unicode Ligature Collisions on macOS APFS. Build/development dependency only; not used to extract untrusted user documents at runtime. Release tooling remains a supply-chain risk; update transitive dependency graph before signed release. |
| [1120782](https://github.com/advisories/GHSA-vmf3-w455-68vh) | tar / moderate | node-tar applies PAX size override to intermediary GNU long-name/long-link headers, causing tar parser interpretation differential (file smuggling). Build/development dependency only; not used to extract untrusted user documents at runtime. Release tooling remains a supply-chain risk; update transitive dependency graph before signed release. |
| [1123939](https://github.com/advisories/GHSA-w8wr-v893-vjvp) | tar / moderate | node-tar: Process crash via PAX numeric path type confusion. Build/development dependency only; not used to extract untrusted user documents at runtime. Release tooling remains a supply-chain risk; update transitive dependency graph before signed release. |
| [1123940](https://github.com/advisories/GHSA-23hp-3jrh-7fpw) | tar / critical | node-tar: Decompression/parse DoS via unlimited input. Build/development dependency only; not used to extract untrusted user documents at runtime. Release tooling remains a supply-chain risk; update transitive dependency graph before signed release. |
| [1123941](https://github.com/advisories/GHSA-8x88-c5mf-7j5w) | tar / high | node-tar: Negative tar entry size causes infinite loop in archive replace. Build/development dependency only; not used to extract untrusted user documents at runtime. Release tooling remains a supply-chain risk; update transitive dependency graph before signed release. |
| [1123942](https://github.com/advisories/GHSA-gvwx-54wh-qm9j) | tar / moderate | node-tar: Uncaught Exception DoS via NUL byte in PAX path/linkpath records. Build/development dependency only; not used to extract untrusted user documents at runtime. Release tooling remains a supply-chain risk; update transitive dependency graph before signed release. |
| [1124278](https://github.com/advisories/GHSA-p2f4-r6v6-j797) | builder-util-runtime / high | electron-updater: Cross-origin redirect leaks `PRIVATE-TOKEN` and mixed-case `Authorization` credentials in `builder-util-runtime`. Build/development dependency only; not used to extract untrusted user documents at runtime. Release tooling remains a supply-chain risk; update transitive dependency graph before signed release. |
| [1124279](https://github.com/advisories/GHSA-7g7r-gx96-252g) | app-builder-lib / high | electron-updater: Uncontrolled search path elements within `AppImage` built by `app-builder-lib`. Build/development dependency only; not used to extract untrusted user documents at runtime. Release tooling remains a supply-chain risk; update transitive dependency graph before signed release. |
| [1145647](https://github.com/advisories/GHSA-r292-9mhp-454m) | tar / high | node-tar: Uncontrolled recursion in mapHas/filesFilter allows uncatchable stack-overflow DoS via crafted long-path tar with member selection. Build/development dependency only; not used to extract untrusted user documents at runtime. Release tooling remains a supply-chain risk; update transitive dependency graph before signed release. |
| [1241206](https://github.com/advisories/GHSA-238p-pmpm-9mq7) | katex / low | KaTeX: Existing prototype pollution can bypass trust restrictions. Accepted low severity prerequisite: existing prototype pollution. trust is disabled; sanitized Markdown; update all rehype consumers together. |
| [1243066](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) | zod / high | Zod can exhaust memory while validating oversized constrained collections. Accepted pending Zod v4 contract migration; bounded IPC transport and schemas reduce exposure. |
| [1244012](https://github.com/advisories/GHSA-g3hv-75wg-m249) | minimatch / moderate | minimatch has potential denial of service via globparts amplification. Build/development dependency only; not used to extract untrusted user documents at runtime. Release tooling remains a supply-chain risk; update transitive dependency graph before signed release. |
| [1244013](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) | glob / moderate | Glob: AbortSignal cancellation bypass allows post-timeout filesystem traversal. Build/development dependency only; not used to extract untrusted user documents at runtime. Release tooling remains a supply-chain risk; update transitive dependency graph before signed release. |

Only `electron` and `esbuild` install scripts are authorized in pnpm-workspace.yaml. No new build scripts were approved. CycloneDX uses npm's installed dependency view with --ignore-npm-errors because pnpm symlinks produce npm peer/dev-missing diagnostics; the SBOM is an inventory, not proof of complete dependency resolution. The license report covers the pnpm-installed graph; Python package licenses need separate review before distribution.

Electron-specific lint: eslint-plugin-electron-security@0.3.0 ran all rules. One warning: dynamic `shell.openExternal` in ipc/index.ts. Accepted because externalUrlSchema restricts protocols, rejects controls/backslashes, and a native confirmation precedes opening. Electronegativity@1.10.3 was attempted but failed on Node 24 (`TypeError: _commander2.default.version is not a function`); it was removed in favor of the pinned ESLint plugin. Generic dangerous-API lint excludes test fixtures. The unused Mermaid and map components and generative Markdown registry were removed; no JSX HTML sink exception remains. Source icons render local SVG icons rather than fetching favicons.

Codex CLI 0.166.0 is restored on macOS using an app-owned tool-free model catalog, explicit feature/tool disables, isolated temporary auth/state, ignored user config/rules, and native process-fork denial. A real adversarial canary self-test gates detection, model listing and streaming, with success cached against the executable hash, app version and safety settings. Missing sandbox-exec, an unaudited CLI version or failed proof leaves it unavailable with a reason. See [the investigation, exact guarantee, evidence and residual risks](codex-tool-free.md). The wrapper does not restrict the CLI itself to endpoint-only networking or a filesystem allowlist. Claude retains its explicit empty tool list and Antigravity retains ACP disabled-tool/permission rejection.

## Accepted risks and limits

Prompt delimiters cannot guarantee that a model obeys reply language or refuses document instructions. The enforceable boundary is that document/model output cannot access keys or execute tools, citations cannot invent main-owned targets, and rendered output cannot run scripts or load remote images. Tests prove these deterministic boundaries, not model behavior.

A same-user malicious process can race filesystem validation and replace files after realpath checks; this is not solved by mode bits. Existing persisted document objects include absolute source/Markdown paths in trusted renderer responses. OS export paths are chosen with native dialogs; O_NOFOLLOW, inode/link-count checks and fchmod protect the opened destination. Asset MIME is extension-allowlisted and nosniff, not a full image decoder validator. Existing library files can be tampered with by the account. Delete-all verifies namespace removal, not secure erasure of SSD blocks, snapshots, backups or Keychain system history. Native signed hardened-runtime launches with the empty entitlement plist have not been verified; no JIT/unsigned-memory entitlement is preemptively granted.

Packaged renderer files are served from the secure `vstudy://app` protocol because disabling extra file-protocol privileges prevents the prior file-based renderer load. The app protocol accepts GET only, a fixed host and a narrow index/assets path grammar, with MIME/nosniff/CSP headers and a 16 MiB cap.

## Historical verification run

See the table below for executed commands and limitations. Signing, notarization submission, stapling and Gatekeeper acceptance require release credentials and were not verified.


Verified on 2026-11-04, macOS arm64, Electron 42.11.16. Evidence is checked in under [security-evidence](security-evidence/).

| Verification | Result | Evidence |
| --- | --- | --- |
| Typecheck | PASS | [log](security-evidence/typecheck.txt) |
| Normal tests / security:check | PASS: 49 files, 248 tests passed, 4 skipped | [log](security-evidence/security-check.txt) |
| Lint and Electron rules | PASS; one explicitly reviewed opener warning | [log](security-evidence/lint.txt), [gate](security-evidence/security-check.txt) |
| Audit | 21 findings: 1 critical, 11 high, 8 moderate, 1 low; all individually documented above; no new advisory IDs | [gate](security-evidence/audit-gate.txt), [raw report](security-audit.json) |
| Frozen install / exact pins | PASS: --frozen-lockfile --ignore-scripts; lock checksum recorded | [log](security-evidence/frozen-lockfile.txt), [policy](security-evidence/dependency-policy.json) |
| Build and unsigned package | PASS: CSC_IDENTITY_AUTO_DISCOVERY=false pnpm package; arm64 app and DMG | [log](security-evidence/package.txt) |
| Seven requested fuses | PASS: npx --no-install @electron/fuses read on actual app | [read-back](security-evidence/packaged-verification.txt) |
| Run-as-node / inspector attempts | PASS: both binaries stay alive; Node marker absent; port never opens; no renderer-load error | [probes](security-evidence/packaged-verification.txt); reproduce with pnpm --filter @vstudy/desktop package:verify |
| Bundle allowlist | PASS: 12,743 ASAR entries; zero maps/tests/docs/e2e/fixtures | [inventory](security-evidence/bundle-inventory.json) |
| Development smoke | PASS: visible window, sandbox/isolation, no renderer Node, bridge shape, settings roundtrip/reload | [log](security-evidence/smoke.txt) |
| Packaged Playwright smoke | Incompatible: disabling Node inspect breaks Playwright's Electron attach; native binary probes used for packaged launch verification | No security fuse was weakened for automation |
| Delete all data e2e | PASS: cancellation retains DB; confirmation removes real userData root after shutdown | [log](security-evidence/delete-data.txt) |
| All e2e scripts | 19 PASS, 2 FAIL, including retries and new deletion check | [per-script results](security-evidence/e2e-results.json) |
| Signing/notarization/Gatekeeper | NOT VERIFIED; unsigned package repairs ad-hoc signatures after fuse editing | No Developer ID credentials used |
| OS Keychain / FileVault / hard kernel memory limits | NOT VERIFIED; encryption unit tests inject a cipher; FileVault is a deployment assumption; RSS monitor is not RLIMIT_AS | See threat-model limits |

E2E details:

| Script | Result |
| --- | --- |
| `assistant-elements.mjs` | [PASS](security-evidence/retry-e2e-assistant-elements.txt) |
| `chat-controls.mjs` | [PASS](security-evidence/e2e-chat-controls.txt) |
| `composer-visual-qa.mjs` | [PASS](security-evidence/e2e-composer-visual-qa.txt) |
| `conversion.mjs` | [PASS](security-evidence/e2e-conversion.txt) |
| `design1.mjs` | [FAIL](security-evidence/e2e-design1.txt) |
| `home-onboarding.mjs` | [PASS](security-evidence/e2e-home-onboarding.txt) |
| `i18n.mjs` | [PASS](security-evidence/e2e-i18n.txt) |
| `library-perf.mjs` | [PASS](security-evidence/e2e-library-perf.txt) |
| `library.mjs` | [PASS](security-evidence/e2e-library.txt) |
| `pdf-reader.mjs` | [PASS](security-evidence/e2e-pdf-reader.txt) |
| `selection-chat.mjs` | [PASS](security-evidence/retry-e2e-selection-chat.txt) |
| `visual-regressions.mjs` | [PASS](security-evidence/e2e-visual-regressions.txt) |
| `welcome-axe.mjs` | [PASS](security-evidence/e2e-welcome-axe.txt) |
| `welcome-details.mjs` | [PASS](security-evidence/e2e-welcome-details.txt) |
| `welcome-layout.mjs` | [PASS](security-evidence/e2e-welcome-layout.txt) |
| `welcome-performance.mjs` | [FAIL](security-evidence/e2e-welcome-performance.txt) |
| `welcome-pseudo.mjs` | [PASS](security-evidence/e2e-welcome-pseudo.txt) |
| `welcome-supplement.mjs` | [PASS](security-evidence/e2e-welcome-supplement.txt) |
| `welcome-trace.mjs` | [PASS](security-evidence/e2e-welcome-trace.txt) |
| `welcome.mjs` | [PASS](security-evidence/e2e-welcome.txt) |
| `security-delete-data.mjs` | [PASS](security-evidence/delete-data.txt) |

`assistant-elements.mjs` initially timed out while the updated Electron executable was being installed; the retry passed. `selection-chat.mjs` initially waited on the newly required external-link confirmation; its test now checks that confirmation and restores the native dialog function, and the final complete run passed. `design1.mjs` failed with “Execution context was destroyed, most likely because of a navigation”. `welcome-performance.mjs` failed its timing/long-frame assertions (as recorded in that snapshot). Neither failure was represented as a pass in that snapshot. Current repaired-suite results, including retained Welcome first-attempt frame failures and permitted retries, are in the final implementation response.

Not proven: resistance to arbitrary same-user malware, model obedience to language instructions, exhaustive malformed-archive fuzzing, least-privilege converter filesystem access, signed hardened-runtime execution with the empty entitlements file, notarization/stapling, Gatekeeper, and complete Python-license/SBOM coverage. A signed release must close or explicitly accept these release risks. Source references: [Electron fuses](https://www.electronjs.org/docs/latest/tutorial/fuses), [ASAR integrity](https://www.electronjs.org/docs/latest/tutorial/asar-integrity).

## AI document improvement

Explicitly started AI improvement sends selected PDF page PNGs and parser Markdown (or text-only Markdown for other formats) to the chosen provider. These are untrusted data, with separate system instructions and no tools. Main rejects raw HTML, images, unsafe links, oversized output and pages outside conservative token-coverage thresholds. Originals remain immutable; rejected pages retain original text. Rendering runs in a bounded, cancellable converter subprocess with network denied on macOS. API calls and CLI launches enter the existing session egress inventory. CLI provider-managed traffic retains the transport limits above.

The token gate does not verify equation operators, semantics or annotations absent from the PDF text layer. Cost estimates and admission/abort caps cannot guarantee an external provider's final bill. The reader panel remains unmounted pending integration. See [the design and precise limitations](AI_PARSE.md) and [private-document evaluation results](ai-parse-evaluation.md).

| New IPC channel | Request / response validator | Sender | Requests/minute | Request cap | Side effect |
|---|---|---|---:|---|---|
| `aiParse:estimate` | shared/ai-parse contract | M | 12 | 512 KiB | Local estimate; model discovery |
| `aiParse:start` | shared/ai-parse contract | M; one live owner per document | 12 | 512 KiB | Render, provider egress, usage and second-version writes |
| `aiParse:status` | shared/ai-parse contract | M | 600 | 512 KiB | Read job metadata |
| `aiParse:cancel` | shared/ai-parse contract | M plus job owner | 600 | 512 KiB | Abort child processes and preserve partial state |
| `aiParse:use` | shared/ai-parse contract | M | 12 | 512 KiB | Switch active version; reindex FTS |
| `aiParse:discard` | shared/ai-parse contract | M | 12 | 512 KiB | Revert and remove the AI output/job |

## Authenticated Moodle content

Moodle pages and teacher-authored content are untrusted remote code. The app renderer first renders module descriptions and announcements through `SafeCourseHtml`, which reconstructs approved elements without remote attributes, scripts, embedded frames, styles, or media. "View original page" opens a separate main-owned `WebContentsView`. The page has no preload, no desktop bridge, no Node integration, and no IPC authority. Chromium sandboxing, context isolation, web security, and certificate verification remain enabled.

Each account owns a separate ephemeral `session.fromPartition` partition with its cache disabled. Cookie state is not shared with the app renderer, other accounts, or the system browser. Main obtains `tool_mobile_get_autologin_key` using tokens from SecretStore in a POST body, then submits the one-use key through a main-process `net.request` POST to `admin/tool/mobile/autologin.php`. It stops at the validated redirect. No credential-bearing document URL or token-in-URL fallback exists. Key requests coalesce and consume an account budget of one request per six minutes, including failed requests. The in-memory budget survives pane closure and disconnect/reconnect within the process. Moodle enforces its own budget across application restarts. API-token expiry and web-cookie expiry are separate states.

`webview-policy.ts` pins school navigation to the exact origin and Moodle installation path. Resources require an exact configured origin. Optional SSO and CDN origins come only from main configuration, with no renderer-controlled overrides. Production enables only the school origin by default. Navigation blocks credentials in URLs, mobile auth endpoints, web-service endpoints, token query fields, encoded path separators, and non-HTTP schemes. HTTPS is required in production. HTTP loopback is an explicit injected dependency used only by the local e2e fixture. Permissions for camera, microphone, location, notifications, clipboard, display capture, and devices are denied. Popups never create an uncontrolled window. School popups use the existing controlled view; external navigation requires a native confirmation. Confirmations, clipboard links, and renderer state redact session query parameters. Requests omit the Referer header.

Every `moodle:webview-*` request and response uses a strict Zod contract. The existing registrar accepts only the trusted app main frame, and the controller additionally checks pane ownership against the sender. A pane ID grants no authority to a remote page or another window. Renderer geometry is bounded and clipped to the owning app window. Theme injection accepts only hex color values and fixed CSS selectors, with no renderer-supplied code. Polling returns navigation metadata and an optional imported document ID, never cookies, keys, tokens, request bodies, or raw network exceptions.

Pluginfile navigation and downloads use `webview-files.ts` and the existing `DocumentService.importPath` pipeline. The network stream and declared size are capped at 50 MiB. The temporary directory is private, the file mode is 0600, and cleanup runs on success, rejection, and cancellation. DocumentService validates file contents before storing them in the library. Unsupported downloads are canceled instead of saved to Downloads. File redirects fail closed and report an expired session. Certificate failures have no bypass action. A 30-second page deadline stops stalled loads. A four-minute keepalive probes only an open, visible, ready pane. A login-page redirect attempts one re-authentication, subject to the same key budget.

Closing a pane destroys its WebContents, aborts its import, and removes its timers and owner listeners. Account disconnect clears cookies, storage, cache, connections, and session listeners. Application shutdown disposes all panes and account sessions. Reloading or navigating the owning app frame also destroys the native child view.

The school still controls the authenticated page. A compromised Moodle server can read its own content and perform actions within the student's school session. These controls protect app privileges and account separation, not the integrity of a school server. Chromium network traffic does not enter the app's API-request inventory. Origin pinning does not pin Chromium DNS answers. Additional institutional SSO/CDN hosts need a reviewed main configuration. Mobile autologin availability, private-token issuance, and school-specific SSO remain live-school acceptance checks. The local e2e simulates certificate failure through Chromium's failure event; it does not prove trust for a particular school's certificate chain.

See [the implementation and reference findings](../apps/desktop/src/main/moodle/webview.README.md) and [local Electron verification](evidence/moodle-webview/verification.txt).

Restores pin SQLite tables, indexes, triggers, and views by name and SQL to an empty database built with the app's immutable migrations at the archive's version, before migrating or rewriting any data. FTS shadow tables must match the generated schema too. Extra or modified objects are rejected. SQLite statistics may be absent, but their schemas must match when present. Chat and course materials validate file containment against the main-owned library root, never a root derived from a stored document path.

## Global agents and the local MCP bridge

Global agents connect through the credential-free `apps/mcp` stdio adapter. The adapter never receives a Moodle token, private token, cookie, signed file URL, autologin key, or school password. It holds a separate random local bearer. Electron main persists only the bearer's SHA-256 hash, account allowlist, scopes, expiry, and redacted activity. A client name is a claim, not an authenticated application identity.

`main/mcp` listens only on `<userData>/mcp/bridge.sock`. The directory is 0700 and the socket is 0600. A bundled native helper checks kernel peer credentials through the inherited accepted socket on FD 3. Different UIDs, missing helpers, unsafe helper permissions, malformed frames, and oversized traffic fail closed. The four-byte length-prefixed protocol accepts a fixed schema and has no approval RPC. Pairing is bound to its originating connection and delivers one bearer once after trusted-renderer consent.

The master switch defaults off. Default scopes omit grades and writes. Every write needs an exact main-owned one-shot proposal with a 60-second deadline. Scope and account authorization run before preparation, after consent, before execution, and before returning data. Revocation, grant edits, switching off, timeout, and disconnect cancel pending work. A Moodle mutation already dispatched cannot be recalled. Writes are never automatically replayed.

Backend checks enforce account, course, module, file, planner target, discussion, and assignment ownership. Capability detection uses the site's advertised web-service functions. The registered tools cannot forward arbitrary functions, URLs, filesystem paths, or Moodle draft IDs. Quiz tools omit questions and answers. Quiz execution, exam-rule automation, synthetic video progress, and completion of graded or unknown activities are excluded. Forum publication and assignment draft saving require high-risk per-call approval. `save_assignment_draft` shows exact text and current remote draft state with attachment names, sizes, and text hash. Status checks before and immediately after saving reject files, other plugin content, or changed text. Final submission is always a manual action in Moodle. The tool returns an `open_in_app` target for review and never calls final submission.

Complete text is redacted before pagination, truncation, and search excerpts. Output and errors also pass through the final redactor. Results contain a fixed summary and an explicit untrusted-content envelope with provenance. Remote links, active HTML, credential-like keys, known secrets, and long opaque secret values are removed. Cursors are private grant-and-query-bound handles. Content, strings, frames, pending operations, retained activity, and network starts have bounds. MCP state is excluded from portable backups.

Preparation loads stored school secrets into the main-only redaction set before a cached read can produce output, including expired sessions. It does not contact the school. `backend-redaction.test.ts` exercises the first cached read with short token, private-token, and user-private-access-key canaries, another account's secret, and a failed secret-store read. The request fails closed if the snapshot cannot be obtained.

`backend-security.test.ts` retains the independent audit's four failure scenarios as rejection tests. It covers split credentials, first and pending approvals, grant expiry during assignment saving, and school disconnect during a scheduler wait. A live authorization callback runs at actual dispatch, and disconnected account generations fence previously captured clients. Already-dispatched requests remain uncertain.

The tests in `src/main/mcp` exercise real Unix sockets, the compiled UID helper, permissions, restart recovery, grant isolation, one-shot consent, expiry, revoke races, rate limits, injection envelopes, and redaction. Renderer tests exercise inert payload display and explicit approval controls. Windows uses a same-handle owner/DACL-verified client at Identification impersonation and fails closed when native enforcement is unavailable. Native Windows kernel tests are supplied but skip on this Mac. SDK and Electron evidence is recorded in `docs/evidence/mcp`. Fixtures do not establish live-school or external-client acceptance.

A process already executing as the student remains outside this isolation boundary. It can inspect memory, edit files, or use an authorized local bearer. An authorized agent can copy data it reads, and a model can ignore the untrusted-content notice. The app's independent authorization and consent checks limit mutations even when an agent follows a malicious course instruction. See [the MCP user guide](MCP.md) and [design decisions](MCP_DESIGN.md).

The result redactor checks adjacent string leaves in document order, both joined and separated, against known secrets and their URL, base64, base64url, and hex forms. It also checks whitespace-folded text before pagination. A match replaces affected leaves entirely with `[redacted]` and sets `redacted: true` in the untrusted envelope. Scanning allows 512 leaves, 128,000 characters, 1,200 nodes, depth 8, and a 16-leaf adjacency window. Exceeding these bounds drops the entire field set. Known-secret input is capped at 100 values of 4,096 characters each. Individual source strings over 1,000,000 characters are dropped before scanning.
