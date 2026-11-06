English · [繁體中文](README.zh-Hant.md) · [日本語](README.ja.md)

# VStudy Pro

Read course documents, keep Moodle deadlines together, and turn coursework into a study plan on macOS and Windows.

![Version 0.2.1](https://img.shields.io/badge/version-0.2.1-blue) ![macOS and Windows](https://img.shields.io/badge/platform-macOS_%7C_Windows-black)

![Graph traversal notes with a selected passage, demo answer, and source citation](docs/assets/readme/reader.webp)

## Download and install

### Get the app

| Platform | Direct installer |
| --- | --- |
| Mac with Apple silicon | [Download DMG](https://github.com/ava-apple/vstudy-pro/releases/latest/download/VStudy-Pro-mac-arm64.dmg) |
| Mac with Intel | [Download DMG](https://github.com/ava-apple/vstudy-pro/releases/latest/download/VStudy-Pro-mac-x64.dmg) |
| Windows x64 | [Download EXE](https://github.com/ava-apple/vstudy-pro/releases/latest/download/VStudy-Pro-win-x64.exe) |
| Windows ARM64 | [Download EXE](https://github.com/ava-apple/vstudy-pro/releases/latest/download/VStudy-Pro-win-arm64.exe) |

Download [SHA256SUMS.txt](https://github.com/ava-apple/vstudy-pro/releases/latest/download/SHA256SUMS.txt) from the same release. These stable links select the latest published assets. The repository is public. If an asset returns 404, check [the release notes](https://github.com/ava-apple/vstudy-pro/releases/latest) for published targets and verification results. A CI artifact or dry run is not a public release. No version, size, or successful platform test is implied by a link.

Requirements are macOS 12 or later, or 64-bit Windows 10 or later. On Mac, choose Apple silicon unless About This Mac shows an Intel processor. On Windows, check Settings > System > About > System type. Choose ARM64 only for an ARM-based processor; otherwise choose x64. There is no Linux installer. AI and school sync need internet access. Reading local Markdown and text does not require an AI account.

### Verify and open

1. Verify the downloaded installer against its entry in `SHA256SUMS.txt`. On Mac, run `shasum -a 256 VStudy-Pro-mac-arm64.dmg` in the download folder, substituting your filename. On Windows, run `Get-FileHash -Algorithm SHA256 .\VStudy-Pro-win-x64.exe` in PowerShell. Compare the complete hash. The checksum file includes other artifacts, so verify your downloaded file's entry. A matching checksum detects changed bytes; it does not identify the publisher.
2. On Mac, open the DMG, drag **VStudy Pro.app** into **Applications**, eject the image, and open the installed copy. If an unsigned or ad-hoc build is blocked, attempt to open it once. Then use **System Settings > Privacy & Security > Open Anyway** if offered, after verifying that you trust the source. Do not disable Gatekeeper globally. See [Apple's first-open guidance](https://support.apple.com/en-us/102445).
3. On Windows, run the EXE. The installer uses the current user's account. If SmartScreen warns about an unsigned installer, choose **More info > Run anyway** only after verification and only if offered. An organization policy may forbid this. Do not disable SmartScreen. Stop if a per-user installer unexpectedly requests administrator access.
4. For a signed and notarized Mac release, use the ordinary first-open confirmation. For signed Windows releases, check the publisher in the file's signature details. Signing does not guarantee SmartScreen reputation. The release notes must state the actual signing status. See [signature verification](docs/SIGNING.md#verify-the-delivered-artifacts).
5. Follow onboarding or open the sample document. Connect a school under **Courses** and configure optional AI under **Settings > Providers** when ready.

VStudy encrypts saved credentials through Electron `safeStorage`. macOS uses a login-Keychain key and may ask for Keychain access, especially after an ad-hoc rebuild. Windows uses DPAPI tied to the Windows user, without a Mac-style Keychain dialog. Both systems defer decryption until you explicitly unlock saved keys after restart. Opening the main window does not unlock them. You can retry or use keys for the session without saving.

### Update or uninstall

Updates are manual. Export a backup in **Settings > Storage**, quit VStudy Pro, and verify the new installer. On Mac, replace the app in Applications. On Windows, run the new installer for the same user. Keep the data folder to retain your library and plans. Database upgrades create migration backups. Downgrades are unsupported. Automatic updates remain a later change after signing and notarization are verified.

To remove your data, use **Settings > Privacy > Delete all data**, type `DELETE`, and confirm the native dialog. The app removes its data namespace and quits. Then remove the Mac app from Applications, or uninstall VStudy Pro in Windows **Settings > Apps > Installed apps**. Removing only the app leaves local data.

Main uses Electron `app.getPath('userData')`. The current package namespace is `@vstudy/desktop`. The default paths are `~/Library/Application Support/@vstudy/desktop` on Mac and `%APPDATA%\@vstudy\desktop` on Windows. They contain `vstudy.sqlite`, `library/`, `secrets.json`, and converter files. Test harnesses can override the location. See [storage ownership](docs/STORAGE.md).

Delete-all does not remove originals outside the library, exported backups, CLI logins, shared Python download caches, or separate OS credential-store items. It is not secure erasure of backups or SSD blocks.

### Build from source

Use macOS or Windows, Node **24.19.0** from `.node-version`, and **pnpm 10.28.2** from `package.json`. The package engine permits Node >=24.11.1. Run from the public repository's root.

```sh
git clone https://github.com/ava-apple/vstudy-pro.git
cd vstudy-pro
pnpm install --frozen-lockfile
pnpm build
```

`pnpm build` compiles the app. Use [the nonpublishing release procedure](docs/ENGINEERING.md#prepare-a-release) to produce and verify installers for each architecture. See [signing setup](docs/SIGNING.md) for credentials. A local Mac build does not verify Windows.

Install **uv** or **Python 3.10+** separately when document conversion requires it. First conversion asks permission before downloading hash-locked packages from PyPI. uv may also download Python from GitHub. **Settings > Privacy** offers retry and a persistent offline mode. Markdown and text need no Python setup. macOS additionally denies converter network access with an OS sandbox. Windows currently has no equivalent kernel-enforced network denial; offline mode and Python socket interception are not an OS security boundary.

## What it does

- **Courses and deadlines.** Course content, announcements, grades, files, notifications, upcoming work, and deadline reminders in one place. Available data depends on the school.
- **Multi-school Moodle.** Search the bundled school directory or enter a public HTTPS Moodle URL. Keep multiple school accounts and identities separate. Password and supported SSO flows use the official Moodle mobile service.
- **Study planner and agent.** Add tasks, goals, exams, and study blocks. Draft a daily or weekly schedule within your available time and export calendar blocks. The course assistant proposes changes through approval cards; review them before saving. Removing a course reference preserves student-owned plans.
- **Reading with AI.** Import PDF, DOCX, XLSX, PPTX, HTML, CSV, Markdown, or text up to 50 MiB per file. Organize with folders, tags, pins, and saved filters. Select a passage, ask a connected model, follow citations, and view reported or estimated usage and cost.
- **Themes.** Light, dark, or system mode; nine built-in theme packs; contrast and glass opacity controls; validated custom theme import and export.
- **Chat history search.** Search document, course, and general chats. Filter by course, document, scope, role, and date. Rename, pin, archive, or delete conversations.
- **Moodle pages in-app.** Open supported teacher pages and announcements in isolated account views with the school session, navigation, zoom, and reload controls.
- **Storage and backup.** Inspect usage, clear caches or converted files, check database integrity, and export or restore a portable backup. Backups exclude credentials; restored school accounts need sign-in again.
- **Privacy.** Local library and SQLite, optional providers, encrypted saved credentials, and a session network-activity inventory. No app analytics or device sync.
- **Onboarding and languages.** A sample document, replayable setup, walkthroughs, and contextual tips. The interface supports English (`en`), Traditional Chinese (`zh-Hant`), and Japanese (`ja`).

## The pages

Screenshots show the current built app with curated demo coursework, local documents, and simulated saved AI conversations. They do not establish live-school or live-provider acceptance. [Capture pipeline and image sources](docs/assets/readme/README.md).

### Home

Start with the setup checklist, import a document, or try the sample. Return to recent reading and your study activity.

![Home with recent readings and a completed setup checklist](docs/assets/readme/home.webp)

### Library

Browse and search documents. Use folders, tags, pins, recent items, saved filters, and conversion-status views to find what you need.

![A library of English and Traditional Chinese study notes in two folders](docs/assets/readme/library.webp)

### Reader and chat

Read converted Markdown beside document chat. Select text to ask a focused question, follow citations back to the source, and reopen a document's conversations. Reading works without AI.

![Graph traversal notes with a selected passage, demo answer, and source citation](docs/assets/readme/reader.webp)

### Courses home

Connect or reconnect schools, sync accounts, see the next seven days of unsubmitted work, and browse current, future, past, or all courses.

![Art-led course cards with teachers, deadlines, and progress](docs/assets/readme/courses.webp)

### Course page

The tabs are **Content**, **Deadlines**, **Announcements**, **Grades**, **Files**, and **Notifications**. Open materials, set deadline reminders, or ask the course assistant. Unsupported school functions remain unavailable.

![Algorithms & Data Structures with current-week materials and deadlines](docs/assets/readme/course.webp)

![A styled demo Moodle teacher page inside the isolated app pane](docs/assets/readme/webview.webp)

### Planner / Today

Open the planner from Courses. Switch between today and the week, add tasks and exams, set time capacity, review schedule proposals, and export study blocks to a calendar file.

![Today planner with study tasks and a statistics exam](docs/assets/readme/planner.webp)

### History

Search across conversations and reopen matching messages. Filters distinguish course, document, and general chats; pinned conversations stay accessible.

![Command-K conversation search with matching saved study chats](docs/assets/readme/history.webp)

### Settings

**General** changes language and reopens setup or Welcome. **Appearance** changes themes and contrast. **Providers** connects AI. **Usage** shows token and cost records. **Storage** manages backups and cleanup. **Privacy** controls conversion installation, offline mode, network inventory, and data deletion.

![Appearance settings with whole-app light and dark theme packs](docs/assets/readme/themes.webp)

![Storage settings with local usage categories](docs/assets/readme/storage.webp)

### Help and Welcome

Help reopens setup, illustrated or recorded walkthroughs, and keyboard shortcuts. Welcome explains the app and offers a sample so you can begin without school or AI credentials.

![Welcome onboarding with a preview of the reading workspace](docs/assets/readme/onboarding.webp)

### Keyboard shortcuts

Use Cmd on Mac and Ctrl on Windows.

| Shortcut | Action |
| --- | --- |
| `Cmd/Ctrl+K` | Open the global conversation finder. |
| `Cmd/Ctrl+B` | Toggle the sidebar. |
| `Cmd/Ctrl+Shift+K` | Ask about the current reader selection. |
| Arrow keys / `Shift+Arrow` | Move or extend text selection when the reader itself has focus. |
| `Enter` / `Shift+Enter` | Send chat / insert a newline, outside IME composition. |
| `Esc` | Dismiss a dialog or the Moodle page pane. |
| `Cmd/Ctrl+R` | Reload the focused Moodle page pane. |
| `Tab` / `Shift+Tab` | Move between controls. |

## How it works

Choose a school and confirm its Moodle site. Main discovers the official mobile service, signs in with the school's supported password or SSO flow, and stores account-scoped course snapshots in local SQLite. It checks server capabilities instead of assuming every school exposes the same functions.

Imports copy your original into a content-addressed library. Markdown and text open directly; other formats use an on-demand Python converter to produce Markdown. The converter denies network access on macOS and stops after idle time. Conversion can lose formatting; it is not an exact PDF viewer.

AI is optional. **Settings > Providers** can use an existing Claude Code (`claude`), Codex (`codex`), or Antigravity (`agy`) CLI login after individual opt-in. Sign in with those tools outside VStudy first. Alternatively, save an Anthropic, OpenAI, or OpenAI-compatible API key, or keep it only for the session. CLI subscription access and API billing follow their providers' terms. Codex currently requires authenticated CLI **0.166.0**, macOS, and `/usr/bin/sandbox-exec`; unsupported transport verification fails closed. Codex is disabled on Windows because no equivalent verified kernel sandbox is implemented. Use an API provider on Windows. See [Codex transport limits](docs/codex-tool-free.md).

An AI question combines your message with bounded context. Document chat includes metadata, conversation history, and selected text; without a selection it includes an outline and opening excerpt. Course chat adds available coursework, planner state, and selected ready documents. Answers stream back and are saved locally. Agent proposals require explicit approval before main changes planner data. Confirm dates and answers against the source.

Cached course snapshots and converted documents remain readable offline. Cached deadlines can be stale. Fresh sync, school pages, and remote AI require a connection. Offline conversion mode does not make an external AI provider local.

### Privacy and network

VStudy sends no app analytics. School sign-in, sync, and content views contact the chosen school. Enabled API providers receive the question and context above; earlier selections can remain in chat history. CLI tools may contact their own chat, model discovery, verification, quota, or telemetry services. Claude receives nonessential-traffic and telemetry opt-outs. Python setup can contact PyPI and GitHub after consent.

Documents, Markdown, and chats are **not encrypted at rest** by the app. Saved secrets use Mac Keychain-backed encryption or Windows DPAPI. Session-only secrets remain in main-process memory. Protect local files with OS account access and disk encryption such as FileVault or BitLocker. Portable backups exclude credentials but contain private study content.

**Settings > Privacy** lists bounded, session-only app-initiated requests and CLI launches. It is not a packet capture and cannot enumerate every request inside a CLI or Chromium; byte counts are unknown. External browser and mail links require confirmation. Read the [security model](docs/SECURITY.md) before using sensitive material.

## Project structure

```text
apps/desktop/
  src/
    main/       Electron lifecycle, IPC, SQLite, Moodle, planner, providers, storage
    preload/    Typed bridge between the isolated renderer and main
    renderer/   React pages, reader, chat, settings, and themes
    shared/     Zod contracts, domain types, locales, and theme schemas
  resources/    Python converter and bundled sample documents
  e2e/          Real Electron integration tests and fixtures
  scripts/      Build, packaging, security, and test helpers
docs/           Architecture, data, security, design, and evidence
scripts/        Repository tools, hooks, and README link validation
.github/        CI and unsigned tag-release workflows
```

### Process model

```mermaid
flowchart LR
  R[React renderer] <--> P[Isolated preload]
  P <-->|Validated IPC| M[Electron main]
  M <--> DB[(SQLite)]
  M <--> L[Library files]
  M <--> C[Python converter]
  M <--> K[Account cache]
  M --> W[Isolated Moodle webview]
  W <--> S[School Moodle]
  M <--> A[API or opted-in CLI]
```

### Moodle sync

```mermaid
sequenceDiagram
  actor Student
  Student->>Renderer: Choose school and sign in
  Renderer->>Main: Validated IPC
  Main->>Moodle: Discover mobile service and authenticate
  Moodle-->>Main: Token and supported functions
  Main->>Moodle: Fetch courses and deadlines
  Moodle-->>Main: Validated responses
  Main->>SQLite: Save account-scoped snapshot and cache
  Main-->>Renderer: Courses, deadlines, and sync status
```

### An AI question

```mermaid
sequenceDiagram
  actor Student
  Student->>Renderer: Ask with optional selection
  Renderer->>Main: Validated chat request
  Main->>SQLite: Read history and course or planner context
  Main->>Library: Read bounded document context
  Main->>Provider: Send prompt to enabled API or CLI
  Provider-->>Main: Stream answer and proposals
  Main-->>Renderer: Answer, citations, and approval cards
  Main->>SQLite: Save messages and usage
  Student->>Main: Explicitly approve a planner proposal
  Main->>SQLite: Validate and apply approved action
```

Read [Architecture](docs/ARCHITECTURE.md), [Data model](docs/DATA_MODEL.md), [Storage](docs/STORAGE.md), [Security](docs/SECURITY.md), and [Engineering](docs/ENGINEERING.md). The [documentation index](docs/README.md) separates current references from historical audits.

## Development

Run from the repository root after installing dependencies. Run checks sequentially on machines with limited RAM.

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start Electron and Vite. Stop with Ctrl+C. |
| `pnpm typecheck` | Check TypeScript and generate locale types. |
| `pnpm lint` | Run desktop ESLint. |
| `pnpm test --pool=forks --maxWorkers=2` | Run contrast checks and unit tests with two workers. |
| `pnpm build` | Build main, preload, and renderer. |
| `pnpm security:static` | Run dependency policy and security lint. |
| `pnpm security:check` | Run static checks, lint, and unit tests. |
| `pnpm e2e` | Build and run serial real-Electron E2E tests. |
| `pnpm smoke` | Build and launch a real-Electron smoke test. |
| `pnpm package` | Build and package with configured signing defaults. |
| `node apps/desktop/scripts/marketing-shots.mjs` | Generate the curated marketing screenshot matrix after `pnpm build`. |
| `node scripts/check-readme-links.mjs` | Check local links in all three READMEs and the docs index. |

E2E requires **uv**, or an existing hash-locked converter environment via `VSTUDY_CONVERTER_VENV`. It prepares an unsigned package and may download Python dependencies. Evidence defaults to `/tmp/vstudy-final/e2e`; override with `VSTUDY_E2E_EVIDENCE`. Live-provider checks require explicit opt-in and authentication. A skip does not prove live operation.

Follow [CONTRIBUTING](CONTRIBUTING.md) for changes, translation synchronization, version tags, and the release checklist. Signing secrets stay outside Git. The repository currently has no project license file; dependency license inventory is not a project license.

### Known limits

- macOS and Windows targets require separate packaged verification. Check release notes for tested architectures and signing status. Unsigned builds can trigger Gatekeeper or SmartScreen.
- No OCR. Scanned or image-only PDFs are unsupported. Complex tables, columns, equations, and images can lose fidelity. Single-file HTML and Markdown imports do not copy adjacent images.
- Live-school features depend on the school's Moodle mobile service and permissions. Public HTTPS is required; LAN-only sites, self-signed TLS, and QR credential exchange are unsupported.
- Local storage has no device sync. API and CLI models need their own access and may incur charges.
- The AI document-improvement backend and panel exist, but the panel is not mounted in the current reader. Do not rely on that workflow. See [AI parsing status](docs/AI_PARSE.md).
