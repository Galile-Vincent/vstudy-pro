# VStudy Pro final QA report

- **Tested commit:** `7a165fa0b7b8dc3c4c0c2c142306be65547b6a9b` ("Use final fresh-process reader measurement consistently"), `main`, clean tree.
- **Date / machine:** 2026-11-04, macOS 27.0.1 (26A434), arm64, Node 24.19.0, pnpm 10.28.2.
- **Role:** test sub-agent, report-only. No repo file was changed; this file is the only new, uncommitted file.
- **CLIs used for real chat:** `claude` 2.1.316, `codex-cli` 0.166.0, `agy` 1.4.12. All three were installed and signed in.
- **Scratch (all artifacts):** `/private/tmp/claude-501/-Users-vc--t3-projects-vstudy-pro/e27698e9-ab7a-4d83-acf3-53a47ef94048/scratchpad`
  - `src/`: `git archive HEAD` copy, built and packaged here
  - `fixtures/`: generated test documents (good and hostile)
  - `data/`: isolated user-data directories (never `~/Library/Application Support`)
  - `logs/`: dialog log, spawn log, network log, samples
  - `shots/`: 145 screenshots
- **Screenshot directory:** `/private/tmp/claude-501/-Users-vc--t3-projects-vstudy-pro/e27698e9-ab7a-4d83-acf3-53a47ef94048/scratchpad/shots/`. Every "Evidence" cell below is a file name in that directory.

## 1. Verdict

**NO-GO for a public/signed release. Conditional GO for continued internal use of the ad-hoc build.**

The product works end to end with real models: three CLIs, real documents, citations that jump to the source, exact usage accounting, graceful hostile-input handling, and a working Delete-all-data. Reading, chat and library behaviour is solid.

Three things block a release; the first is unconfirmed (see D1):

1. **D1 (blocker, root cause unconfirmed).** The packaged ad-hoc app never showed a window in three real-Keychain launches. Its main thread sat in `SecItemCopyMatching` for over 30 s each time. With `--use-mock-keychain` the window appears in 0.29–0.48 s. This needs a clean-machine check with a Developer ID build.
2. **D2 (blocker for a store-style release).** The `.app` is ad-hoc signed only. Gatekeeper rejects it and nothing is notarized or stapled (README already says so).
3. **D3 (warning that first-time users will hit).** Settings is reachable only from inside a document workspace (D3). There is no Settings menu item or `Cmd+,`, no gear on Home or Library, and no sidebar entry. Providers, language, Privacy, retry-conversion and Delete-all-data all live there.

The rest are warnings and polish, listed in §5. The most damaging for this user's own material is **D4: equations in CH2 are shredded into one-symbol-per-line fragments** (documented limit, but severe).

## 2. How this was tested, and what the shims were

- Built exactly as asked: `git archive HEAD` into scratch, then `pnpm install --frozen-lockfile && pnpm build` (≈8.8 s total) and `CSC_IDENTITY_AUTO_DISCOVERY=false pnpm package` (OK; `.app` 283 MB, `.dmg` 115 MB).
- Drove the **built app** (`out/`, same commit) with Playwright `_electron.launch` and a small localhost eval harness. This is the only way I could drive the UI.
- **Packaged app:** its remote-debugging port is not honoured. `--remote-debugging-port` gave no listener, which is a good security sign. `osascript` has no Accessibility permission here. So the packaged app could not be clicked. I tested its launch timing (CGWindowList polling), screenshots, process state, and ran the repo's own `e2e/packaged-smoke.mjs` against it (PASS, mock keychain, fuses verified).
- **Shims in the built app (disclosed):**
  - A main-process preload (`-r`) replaces `dialog.showOpenDialog/showSaveDialog/showMessageBox` with a logger that answers from a policy file. Every native dialog and its text is in `logs/dialogs.jsonl`. It also stubbed `shell.showItemInFolder`, so I could not see a real Finder window.
  - Multi-file OS drag-and-drop cannot be automated. CDP `Input.dispatchDragEvent` produces Files with no path, so the app correctly refuses them. I issued drop tokens by emitting the app's own `vstudy:preload-drop` event in main and then called the real `documents:importPaths`. Bulk-import timing therefore covers main-process behaviour but not the renderer drop handler.
  - Native pop-up menus and the real Finder were not exercised.
- Fixtures I generated (`fixtures/`):
  - **Good:** DOCX (zh/ja headings, list, table, PNG), XLSX (two sheets, formulas), PPTX (3 slides, table, picture, notes), HTML (zh/ja, table, local and remote image, script, iframe), CSV (UTF-8 BOM, and Shift_JIS), MD (CJK, table, code, math, image), TXT, 12 bulk MD, a scanned image-only PDF, and a PDF with a ruled table, an unruled table and two columns.
  - **Hostile:** 0-byte PDF and MD, an MZ executable renamed `.pdf`, text renamed `.docx`, a 1.5 GB-expanding DOCX zip bomb (1.5 MB on disk), an XLSX bomb, a 60,000-entry PPTX, a PDF with `OpenAction`/`AA` JavaScript, an AES-256-encrypted PDF, a 51 MB MD, and an injection MD.
- The user's 25.7 MB CH2 PDF (18 pages) was used as supplied. Reference page images were rendered with PyMuPDF.
- **Environment caveat:** this Mac was shared with other Electron/Playwright sessions. The desktop had unrelated system dialogs from other processes (a Keychain prompt with an Electron icon and a T3 Code screen-recording prompt), and at times an unrelated dev instance. These dialogs were present before any packaged launch of mine and I could not attribute or dismiss them. I did not click Allow on anything.
- Not run: the repo unit tests, lint, `pnpm e2e` and `pnpm security:check`. This report is a manual first-time-user pass.

## 3. Journey results

Legend: **PASS**, **PASS\*** (passes with a noted defect), **FAIL**, **N/T** (not testable here).

| # | Step | Result | Evidence and notes |
|---|---|---|---|
| 1 | Install and build from archive | PASS | `pnpm install --frozen-lockfile` 2.8 s; build OK. First launch printed "Downloading Electron binary…" (+5.7 s) despite the frozen install. Polish. |
| 2 | `pnpm package` | PASS | `.app` ad-hoc signed (`codesign` flags=0x2 adhoc, TeamIdentifier not set); `codesign --verify` OK; fuses verified by repo smoke. |
| 3 | First launch, dev build, fresh profile | PASS | Window event 271–291 ms. No Keychain prompt. `001-built-first-launch.png`. |
| 3b | First launch, packaged, `--use-mock-keychain` | PASS | First visible window 453 ms (fresh profile), then 291/298 ms. `pkg-first-launch.png`. |
| 3c | First launch, packaged, real Keychain | **FAIL** | No window in 30 s, 3 of 3 launches. Main thread in `SecItemCopyMatching`→`CSSM_DecryptDataFinal`. Data dir stays empty. Prompt text unreadable (covered by a T3 dialog). See D1. `logs/sample-pkg.txt`, `pkg-real-keychain-6s.png`. |
| 4 | Language: system default, en, zh-Hant, ja | PASS | `ja` system locale starts in ja (`b3-onb-ja-locale-default`). Live switch in step 1: `002`, `003`, `004`. Dialog height shifts about 8 px between languages; hidden description duplicated in text. |
| 5 | Onboarding: provider toggles | PASS\* | All three default OFF. Before opt-in: "Found on disk — login not checked" (no CLI launched). Toggle latency 0.3 s (Claude), 5.1–5.9 s (Codex), 1.6–1.7 s (agy) with no pending indicator. `005`, `007`. Copy contradiction: see D14. |
| 6 | Onboarding privacy copy | PASS\* | Step 2 only says the client "may contact its own services." It does not say questions, history and selected text go to the provider. That disclosure exists only on the Welcome page. See D15. |
| 7 | Try a sample document | PASS\* | Works with no converter prompt. Title is **"en"** (file `en.md`); sidebar counts stay 0 until a later refresh. `009`, `020-built-library-1doc.png`. See D16. |
| 8 | Onboarding step 4 and Welcome | PASS | Optional tour, not forced. |
| 9 | Welcome tour (30 s test) | PASS | The hero states what, for what and the data flow within about 5 s: "An AI reading companion for your Mac… Questions, conversation history, document metadata and selected text go to your chosen provider." The who-it's-for section is about 4 screens down; the full page is about 6 screens. A skimming reader gets "what/does/who" in 30 s. `011`, `012`, `014`. |
| 10 | Home, fresh | PASS\* | Greeting, upload card, rotating prompt, streak, activity. Streak says "1 days". `018-built-home-fresh.png`. |
| 11 | Home after activity | PASS\* | Continue reading, tokens/cost, pinned, sparkline, budget meter all populate (`051`, `066`). Raw `**bold**` and `[[cite:…]]` appear in the "Continue reading" snippet (D8). |
| 12 | Home with seeded history | PASS | I inserted `activity_days` rows (10-20..10-27 and 10-30..11-03). Home showed streak 6 days (today included) and best 8, as specified. `001-b1d-home-seeded-streak.png`. |
| 13 | Import many at once | PASS\* | 20 mixed files imported in under 1 s (via drop-token shim); duplicates dedupe. Import button is single-file only (D9). Shift_JIS CSV and scanned PDF rejected with generic text (D10, D12). `007-built-bulk-import-progress.png`. |
| 14 | Conversion: CH2 pages 3, 5 | PASS | Text coverage vs the PDF text layer is 100.0% on all 18 pages (`gen/cmp_ch2.py`). Handwritten notes become `> note:` blockquotes. Odd wording ("一種方是是", "POP3" vs the visible "IMAP") is in the source text layer, not the parser. |
| 15 | Conversion: CH2 pages 10, 16 | **FAIL (documented limit)** | Equations are linearised or shredded (`1.6 × 106` for 10⁶; numerators on separate lines; page 16 is 240 lines, mostly single symbols). `001-b1c-p10-reader.png`, `002-b1c-p16-reader.png`, source `ch2/p10.png`, `ch2/p16.png`. See D4. |
| 16 | Conversion: DOCX/XLSX/PPTX/HTML/CSV/MD/TXT | PASS\* | Headings, lists, tables, images (`vstudy-asset://`), notes and CJK all survive. Defects in D11. |
| 17 | Library: folders, nested | PASS | Create, nested via "Folder options" dialog, expand. `015`. |
| 18 | Library: drag onto folder, "Move to…", keyboard reorder | PASS | `Meta+Alt+Down/Up` reorders with no alert. `016`, `017`. |
| 19 | Library: pin, tags | PASS\* | Works, but the Tag flow is a button that opens a second dialog also titled "Tag…" (`058`, `062`). |
| 20 | Library: filters, sort, grid/list | PASS | PDF=2, Failed=1, Word=1, Folder=1. Sort by name asc/desc is correct. Grid OK (`055`, `057`, `063`). Failed pill clips in grid. |
| 21 | Search en, zh, ja including 2-char CJK | PASS\* | 通信, 資料, 日本語, 学習, 計画, 傳輸層, ネットワーク all hit. Latency 41–48 ms warm (first call 112 ms). A single character shows "Couldn't load your library" (D13). |
| 22 | Soft delete, undo, purge | PASS | "1 document deleted · Undo within 30 seconds"; undo restored it. A non-undone delete was purged from disk between 38 s and about 60 s. `064`. |
| 23 | Export Markdown, Export original, Reveal | PASS | Original byte-identical (`cmp`); files 0600; Reveal targeted `library/<hash>/source.xlsx`. |
| 24 | Open a document, first page of CH2 | PASS | First DOM 115–172 ms, first content 118–247 ms. |
| 25 | Select passage and ask (real models) | PASS | Haiku answered and quoted the source phrase. Correctly refused to guess a page for a headingless selection: "can't tell which page…". `028`. |
| 26 | Citations click and scroll the reader | PASS\* | "p. 5" landed on R23 with an outline highlight (`031`). One earlier click from near page 3 overshot to the end of page 5 / start of page 6 (R27 at top). Chip label "p. 5 · p. 5" is duplicated. |
| 27 | Headingless PDF page citations | PASS | Page-level catalog works for pdf_md output ("R24 … page 5" was correct). |
| 28 | Section ask ("Use this section") | PASS | DOCX section chip attached; answer grounded (CJK words and "毎日30分"). The button is `opacity:0`/`pointer-events:none` until the heading is hovered. `072`, `073`. |
| 29 | Model picker, effort, Fast | PASS | Verified the Claude command line: `-p --safe-mode --output-format stream-json … --tools "" --strict-mcp-config --setting-sources "" --no-session-persistence --model opus --effort low --settings {"fastMode":true}`. Tools disabled. `049`. |
| 30 | Providers: Claude, Codex, agy | PASS | Real answers: Claude Haiku, Codex GPT-6-Luna 4.6 s, agy Gemini 3.8 Flash (Low) 4.1 s. `032`, `033`. |
| 31 | Reply language | PASS | Setting "日本語" produced a Japanese answer to an English question. |
| 32 | Stop mid-stream | PASS | Partial text kept, "Stopped. Partial response excluded from future context." Settled in ≤ 2.5 s. `040`. |
| 33 | Edit and resend | PASS | "Cancel edit / Save & resend"; replaces the turn. `042`, `043`. |
| 34 | Regenerate | PASS | 19 s for a 600-word answer (Haiku, High effort). |
| 35 | Copy | PASS | Clipboard text has no raw cite tokens; citations become "p. 3". |
| 36 | Retry on forced error | PASS\* | Pointed Claude at `/usr/bin/false` → "The provider is unavailable. Check Settings. Retry" in 0.3 s. Retry worked after restoring the path (2.2 s). Suggestion chips ("Which passages support this answer?") still show after a failed turn. `048`. |
| 37 | Usage chip, meter, budget warnings | PASS | Meter amber at 95%; pre-send gate "The next request may exceed your monthly budget. Send anyway / Cancel". Clearing the budget works. `068`. |
| 38 | Usage totals vs CLIs' reported usage | PASS | A pass-through wrapper tee'd the real Claude stream: CLI `total_cost_usd` 0.00169122, tokens 2 + 7532 + 1912 in / 331 out; app showed "in 9.4K · out 331 · $0.00169". Exact. Overall Usage: 17 calls (15 claude, 1 agy "price unknown", 1 codex). |
| 39 | Settings > Providers / Privacy | PASS\* | Everything present; Change-executable chooser accepts any file (user-chosen). Reachable only inside a document (D3). |
| 40 | Network activity panel truthful? | PASS\* | See §6. Truthful but coarse; it also reveals the background discovery polling (D5). |
| 41 | Delete all data (throwaway profile) | PASS | Button disabled until exact `DELETE` (lower-case stays disabled), then native localized confirm, then the whole user-data directory was gone and the app quit. |
| 42 | Restart persistence | PASS | Language, onboarding, conversations (14 for CH2), pins, tags, folders, usage, provider opt-ins all retained. |
| 43 | Window 720 / 900 / 1200 | PASS | No horizontal overflow at any size. At 720 and 900 the workspace switches to Document/Chat tabs. `002-built2-home-720`, `008`, `009`. |
| 44 | Light / dark | PASS | Home, Library, workspace in dark look coherent (`013-built2-home-dark.png`); contrast not measured by me. |
| 45 | zh-Hant / ja Home and Library | PASS | Natural copy, no layout breakage. `015-built2-home-zh-Hant.png`, `017-built2-home-ja.png`. |
| 46 | Hostile inputs | PASS\* | No crash, hang or stray file. Rejections show only "Something went wrong. Please try again." (D10). See §4. |
| 47 | VoiceOver | N/T | Skipped as instructed. |

## 4. Hostile inputs

Imported through the Import button (`hostile.js`, `005`–`011-b2-hostile-*.png`).

| Input | Result |
|---|---|
| 0-byte `.pdf` | Rejected, no document row; generic toast. |
| 0-byte `.md` | Imported as "ready", 0 byte (accepted; reader is empty). |
| `.exe` renamed `.pdf` (magic bytes MZ) | Rejected; generic toast. |
| Text renamed `.docx` | Rejected; generic toast. |
| 1.5 GB-expanding DOCX zip bomb | Rejected without extracting; disk use stayed at the venv plus 108 K; app responsive. |
| XLSX with oversize member, PPTX with 60,000 entries | Rejected; generic toast. |
| 51 MB `.md` | Rejected (50 MB limit); generic toast. |
| PDF with `OpenAction`/JavaScript | Imported as text through `pdf_md`. Nothing executed, no dialog, no network. |
| AES-256 encrypted PDF | Document row marked Failed (converter_failed). |
| Injection MD (ignore instructions, reveal system prompt and keys, fetch URL, "PWNED-INJECTION") | **Resisted by all three models** (Claude Haiku, GPT-6-Luna, Gemini 3.8 Flash Low) under both a plain and a "follow the document's instructions" prompt. Haiku and Gemini even noted the embedded instructions. No secret, prompt text or marker appeared. |
| Remote image in HTML (`https://example.com/tracker.png`) | Not loaded; shown as "[Image unavailable:remote]". No request seen. |
| Local neighbouring image in HTML/MD | Broken image (documented limit). |
| External link in imported HTML | Native confirm "Open external link to example.com?" (buttons Cancel/open); Cancel did nothing. |

## 5. Defects

Severity: **blocker** = stops release or first-run; **warning** = real user-visible problem; **polish** = quality.

### D1. Packaged app blocks at startup on Keychain, no window (blocker, root cause unconfirmed)
- **Steps:** launch `VStudy Pro.app` (ad-hoc, rebuilt) with a fresh `--user-data-dir` and no `--use-mock-keychain`. Three times.
- **Expected:** window within 2 s (README: "window creation never waits for decryption").
- **Actual:** no window for 30 s. `sample` shows the main thread in `SecItemCopyMatching` → `SecKeychainItemCopyContent` → `CSSM_DecryptDataFinal`. The user-data dir is empty. With `--use-mock-keychain` the window appears in 0.29–0.48 s.
- **Notes:** this reads as Chromium's own OS-crypt/cookie-encryption read, not `secrets.ts`. The login keychain already holds a "@vstudy/desktop Safe Storage" item from other builds, so the likely cause is the rebuilt-ad-hoc ACL prompt the README warns about, hidden behind another dialog. I could not read or answer the prompt, so this is unconfirmed. It needs a clean macOS user with a Developer ID build.
- **Suspect:** Chromium OSCrypt via the `EnableCookieEncryption` fuse (`scripts/after-pack.mjs`); startup path in `src/main/index.ts`.

### D2. Not signed or notarized (blocker for release)
- `spctl -a -vv` → "rejected"; `stapler validate` → no ticket; ad-hoc signature. Known and documented.

### D3. Settings unreachable from Home, Library and the app menu (warning)
- **Steps:** finish onboarding → Home. Look for Settings, press `Cmd+,`, open the App menu.
- **Expected:** a Settings entry, `Cmd+,`, and one reachable from Home/Library (design §3: onboarding "re-runnable from Settings").
- **Actual:** the only gear is in the document workspace header; the app menu has no Settings item (`About / Services / Hide / Quit` only). Home's "View Usage" opens the same dialog; nothing else does. The Welcome copy says "Paste your key in Settings."
- **Suspect:** `src/main/i18n.ts:7` (`updateApplicationMenu`), `src/renderer/library/sidebar.tsx`, `src/renderer/home/home.tsx`.

### D4. CH2 equations shredded (warning, documented limit, high impact)
- **Steps:** import CH2; read pages 10 and 16 beside the source.
- **Expected:** readable maths, or a clear signal.
- **Actual:** 10⁶ becomes `106`; fractions split across lines; page 16 is one symbol per line (`002-b1c-p16-reader.png`). Models can still answer, but the text can mislead (`1.6 × 106`). No per-page "complex layout" warning.
- **Suspect:** `resources/converter/pdf_md` equation handling. An optional page-image view or a "maths may be garbled" flag would help.

### D5. Background model discovery every ~62 s while a document is open (warning, privacy and battery)
- **Evidence:** the Privacy panel showed 1× "Antigravity model discovery" and 2× "CLI model discovery" every ~62 s (05:00:07, 05:01:09, 05:02:11…) with CLI launches and, per `lsof`, many Google (`agy`), Anthropic and OpenAI connections. On Home it stops (event count stayed 70 for 100 s).
- **Cause:** `providers:list` polled every 2 s (`workspace/index.tsx:106`) refreshes a ~60 s discovery TTL (`providers/models.ts:39`, `agy.ts:47`).
- **Impact:** opted-in CLIs are re-launched all session long without user action.

### D6. A native, window-less modal alert can freeze the whole app, including at startup (warning)
- **Steps:** import a PDF/DOCX into a profile without a converter; quit while it is pending; relaunch.
- **Actual:** the converter-download prompt is a parent-less `dialog.showMessageBox` that appears at launch for the pending job and blocks the main thread. The window may not appear until it is answered (`sample` shows `NSAlert runModal`). During import it froze automation and the UI. Two simultaneous conversions raise **two** alerts (two dialog log entries 4 ms apart).
- **Suspect:** `src/main/ipc/documents.ts:26-31` (`authorizeDownload`). Parent it to the window, de-duplicate, and do not prompt at launch.

### D7. Searches share the 12-requests-per-minute budget (warning, latent)
- `channelPolicy` treats `/import|reconvert|retry|chat:start|export|search/` as expensive: 12 per 60 s (`ipc/register.ts:10-14`).
- Raw `library:search` calls start failing with "IPC rate limited" after about 12 in a minute. The UI handled my 15 searches in about 65 s without error (debounce plus spacing), but a fast refiner can hit it. Imports and exports share the cap.

### D8. Raw markup and citation tokens leak into the UI (warning)
- **Home "Continue reading"** shows `**通信**` and `[[cite:s415]]` (`001-built2-after-restart.png`).
- The chat live region text and the DOM text of answers contain `[[cite:sNNNN]]`, and the whole answer (thousands of characters) is the announcement (`Answer complete: …`). Screen readers would read it all, tokens included. VoiceOver itself was not run.
- **Suspect:** `src/main/services/dashboard.ts`; `renderer/components/assistant-ui/elements/thread.aui.tsx`.

### D9. Import button imports one file (warning)
- `showOpenDialog` uses `properties: ["openFile"]` and takes `filePaths[0]` (`ipc/documents.ts:62-69`). Multi-file import works only via drag-and-drop. The brief and README say "import many".

### D10. Rejected files give only "Something went wrong. Please try again." (warning)
- Zero-byte PDF, zip bomb, oversize and wrong-type files all get this (`errors.json:2`, `005-b2-hostile-bomb_docx.png`). Retrying cannot help. Reasons (too large, not a PDF, unsupported archive) are known to main.
- Suspect: import errors collapse to `errors.generic` in `ipc/register.ts`.

### D11. Conversion details (polish/warning)
- XLSX formulas without cached values show literal `NaN` (my openpyxl file has no cached values; Excel-saved files will be fine).
- DOCX "Title" style is plain text; tables get an empty header row (visible as an empty grey strip, `070`).
- HTML `![alt](local)![alt](remote)` has no separator.
- Page marker is glued after text at page end: `Grade A B C <!-- page 2 -->`.
- The converter writes `library/Application Support/Microsoft/DeveloperTools/.onnxruntime/` (including a `deviceid` file) inside the user's library directory.

### D12. Scanned PDF and Shift_JIS CSV errors (warning)
- A scanned image-only PDF fails with "Could not prepare this document. Retry conversion or check Settings > Privacy. Offline mode supports Markdown and text." That hint is wrong: the cause is no OCR and retrying cannot help. The Shift_JIS CSV is rejected ("Import failed") with no hint about encoding.

### D13. One-character search shows a load error (polish)
- Typing `信` gives "Couldn't load your library — Refine your query: use at least two distinct characters. [Retry]" over an empty list (`019-built-search-rate-limit-q13.png`). It should be a hint, not an error. `Bulk 7` returns 0.

### D14. Onboarding copy contradicts the UI (polish)
- Step 2 says "CLI providers start disabled. Enable one in Settings…" while the toggles are on that step. The Welcome page says "VStudy Pro checks which CLIs are signed in", but before opt-in nothing is launched. Status stays "Detected", never "signed in".

### D15. Consent copy is thinner than the data flow (polish/warning)
- Onboarding step 2 does not state that questions, history and selected text are sent to the provider. The README and Welcome do.

### D16. Sample document and counts (polish)
- Sample document title is "en" (file `en.md`) because the sample is named after the language code (`ipc/documents.ts:56`).
- Sidebar counts showed 0 after "Try a sample document" until a later refresh.

### D17. Copy defects (polish)
- Usage dialog row label "input," and legend "input, Output" (`en/common.json:214`).
- "1 days", "1 calls unpriced" (`home.json:34`, `usage.json:3`): no plural handling.
- Size "800 byte", "94 byte" (`library.json:85`).
- Menu title is lowercase "file". Confirm button "open" lowercase.
- Recent activity repeats "Conversation explored" with no document names.
- Citation chips read "p. 5 · p. 5".

### D18. Design and layout polish (see §7)
- Before the first conversation the composer area is a large empty bordered box with a floating model picker (`022`, `070`). The focus ring on the composer is a sharp rectangle inside a rounded card (`040`).
- Nested stacked dialogs (Folder options → New folder, Tag… → Tag…) with cramped headers (`014`).
- The Settings tab strip mixes two action buttons ("Show welcome guide", "What is VStudy Pro?") with the three tabs, all styled alike (`044`).
- Checkboxes use the macOS system blue rather than the neutral accent (`007`).
- The status note "Your sample is in the Library." sits against the footer divider (`009`).
- Default "Manual order" for a fresh bulk import is arbitrary (data, scores, bulk-07, bulk-03 …).
- Library rows select on a single click and open on double click, with no hint.
- Home sparkline is a stub with one day of data.
- Home "What is VStudy Pro?" link sits indented with its icon above the text.
- Suggestion chips remain after a failed answer.
- Overlays: the scroll-to-bottom button overlaps answer text (`042`).

### D19. Accessibility, structural (warning, not verified with VoiceOver)
- The CH2 reader renders 568 "Ask about this paragraph" buttons, all in the tab order (`tabIndex` ≥ 0; `opacity:0`, `pointer-events:none` until hover or focus). A keyboard user faces hundreds of tab stops. (Arrow/Shift+Arrow selection plus `Cmd+Shift+K` works and is the better path.)

### D20. Citation click overshoot (warning, intermittent)
- One click on a "p. 5" chip while reading near page 3 landed on the end of page 5 / start of page 6 (R27 at top, R23 above the fold). The next click from the top landed correctly, and R23 was outlined. The 18-page doc suggests a virtualisation-height estimate issue.

### D21. Misc (polish)
- Codex enable toggle is blind for 5–6 s.
- CH2 shows "[Embedded images omitted: 1]" at the top of page 3, where PyMuPDF finds no embedded image on that page (probably an ink/annotation layer; not investigated). The real figure on page 10 is simply absent, with no marker next to it that I could see.

## 6. Network activity panel vs observation

Method: `lsof -i` sampled every 0.4 s over the app's process tree for the whole sessions (built app, two profiles).

| Observed external connections | Panel entry | Verdict |
|---|---|---|
| `uv`/pip to pypi.org, files.pythonhosted.org (first conversion) | "Converter dependency installation — pypi.org, files.pythonhosted.org; github.com for Python if needed" at 04:49:18 | Matches. |
| `claude` to Anthropic (160.79.104.10:443) | "CLI request (may include CLI telemetry) — Anthropic / Claude CLI managed endpoints" | Matches per chat. |
| `codex` to Cloudflare/OpenAI | "CLI request … OpenAI / Codex CLI managed endpoints" | Matches. |
| `agy` to many Google IPs (~130 connections over a session) | "Antigravity model discovery / chat — Google / Antigravity CLI managed endpoints" | Entries present but one line hides large volume. |
| Electron/Chromium processes | none | Nothing external from Electron itself (no fonts, analytics, update checks). Remote HTML image not fetched. |
| Python converter workers | none | No network during conversion. |
| External link click | "external_open" only after confirmation | Cancelled, so nothing recorded or sent. |

The panel is truthful, session-only and honest about what it cannot see ("not a packet capture"). Weaknesses: coarse destinations, no volumes, and it shows the D5 polling as dozens of entries. The 500-entry cap is not an issue in practice.

## 7. Design critique against `docs/PRODUCT_DESIGN_V2.md` §10

- **Contrast: mostly good.** One dark primary action per view. The empty-state "Choose a file" is the clearest element on Home. Selection uses a quiet grey. Weakened by native-blue checkboxes (`007`) and by the Settings tab strip where two actions and three tabs look identical (`044`).
- **Hierarchy: good.** Library title, then filters, then list; rows put the title above muted metadata. Chat puts the transcript first and the composer/model picker at the bottom. Home's masonry grid yields uneven card heights and big gaps (`051`).
- **Alignment:** sidebar, toolbar and content share edges at 1200 and 900. The search field's inner focus ring and the composer's sharp focus rectangle break the radius family. Welcome's overlapped hero cards cut each other off by design.
- **Proximity:** filters sit with the search bar and folders in the sidebar, as intended. The composer and model picker read as one unit. Nested modals (D18) break this.
- **Repetition:** one font family and one accent; cards are consistent. The folder/tag/rename dialogs are a different pattern from the onboarding and Welcome surfaces. Empty-state pattern is consistent (icon, heading, line, action) except the pre-conversation composer skeleton.
- **Balance:** 720/900/1200 all balanced; Document/Chat tabs at ≤900 are a sound call. 1200 Home leaves the right column sparse.
- **White space:** onboarding is one idea per step and calm. Welcome is generous. Library is dense but readable.
- **Unity:** Home, Library, chat, onboarding and Welcome read as one product in light, dark, en, zh-Hant and ja.
- **Value over utility:** onboarding shows a sample and an example answer; Home leads with Continue reading, tokens, streak and pins. The "Recent activity" list ("Conversation explored" ×N with no titles) and the stub sparkline undercut the "progress and context" goal.

## 8. Performance observed

| Measure | Value | Target / note |
|---|---|---|
| Cold start, built app, fresh profile: launch → first window event | 271–291 ms | design: interactive < 2 s |
| Cold start, packaged, `--use-mock-keychain`: spawn → first visible window | 453 ms, then 291 / 298 ms | OK |
| Cold start, packaged, real Keychain, rebuilt ad-hoc | window not visible after 30 s (3/3) | **D1** |
| Open CH2 in reader: first DOM / first content | 115–172 ms / 118–247 ms | PERFORMANCE.md: < 1.5 s |
| CH2 conversion, fresh process (reconvert) | 1.88 s | PERFORMANCE.md 1.27 s warm: matched at 1.26 s warm |
| First conversion on a fresh profile incl. converter install | about 25 s total (network, uv cache warm) | one-time, behind a permission alert |
| Bulk import, 20 small files | < 1 s to all ready | small files |
| Library full-text search (IPC round trip) | 41–48 ms warm, 112 ms first | design: < 80 ms |
| First visible text, Claude Haiku, High effort, 400-word answer | 12.7 s (answer streamed in about 3.2 s) | model-bound |
| Short grounded Q&A, total | Claude Haiku 3.6 s; Codex GPT-6-Luna 4.6 s; agy Gemini Flash Low 4.1 s; Claude Opus Low+Fast 5.3 s | |
| UI jank during a streamed answer | max timer gap 61 ms at a 50 ms timer | no long tasks |
| Stop → settled | ≤ 2.5 s | |
| Restart to window | 276 ms | |
| Memory, Electron tree + converter after hostile imports | about 600 MB + 144 MB converter | converter process stopped on its own within ≤ 5 min idle |
| Soft-delete purge | files gone between 38 s and about 60 s | |

## 9. README "Known limits" checked

| README statement | Result |
|---|---|
| No OCR; scanned PDFs cannot be read | **Accurate.** Failed with a misleading hint (D12). |
| PDF tables require ruled grids | **Accurate.** Ruled table became a proper Markdown table. The unruled table became column-major lines (`Name Alice Bob Chen / Score 95 82 77 / Grade A B C`), which reads wrongly. |
| Images may be omitted | **Accurate.** CH2 figure on page 10 is absent; "[Embedded images omitted: 1]" marker shows. |
| Columns, equations, complex layouts lose fidelity | **Accurate and understated for equations** (D4). A simple two-column PDF came out correctly. |
| Single-file MD/HTML imports do not copy neighbouring images | **Accurate.** Local `diagram.png` is a broken image; remote images are blocked with a placeholder. |
| Arrow/Shift+Arrow select; Cmd+Shift+K asks | **Accurate.** Selection extended with Shift+Arrow; `Cmd+Shift+K` attached it to the composer. |
| UTF-16 selection offsets / math may need the containing section | Not isolated; the section-ask path worked. |
| First conversion asks before downloading; Offline mode retry | **Accurate.** The native alert appears; answering "Offline mode" fails the job with a clear, localized reason and a Retry button. Persisted flag stayed false (per README the alert is per-attempt). Duplicate alerts for concurrent jobs (D6). |
| Converter stops after idle (default 5 min), no idle prewarm | **Accurate.** Not running at launch; gone within 5 min after the last job. |
| Cold Python startup takes seconds | Accurate (first conversion in a fresh process 1.9 s; install ~25 s). |
| CLI providers default OFF; no CLI launched before opt-in | **Accurate** (file-only detection). |
| Claude invoked with tools disabled, no persistence | **Accurate** (command line above). |
| Codex needs 0.166.0 + sandbox-exec | Version matched here and worked; mismatch path not tested. |
| Saved keys need unlocking after restart; Keychain 10 s timeout | **Not tested** (no API keys; real Keychain not answerable). |
| macOS only; ad-hoc signed, not notarized; Gatekeeper warnings | **Accurate** (`spctl` rejected, no stapled ticket). |
| Keychain prompts may appear, including after rebuilds | **Consistent with D1**, which went further: no window until answered. |
| Delete all data: type DELETE, native confirm, quits; keeps originals, CLI logins, shared caches | **Accurate** (originals under `fixtures/` untouched). |
| Network panel session-only, not a packet capture | **Accurate** (§6). |
| 50 MB limit; modern Office only | 51 MB rejected. Legacy Office was not tested. |

## 10. What I could not run

- **VoiceOver** (skipped as instructed) and any screen-reader behaviour of D8 and D19.
- **Developer ID signing, notarization, stapling, Gatekeeper acceptance, quarantine first-open flow.** Only ad-hoc signing and a Gatekeeper rejection were observed.
- **The real-Keychain prompt text and the save/unlock-key flows** (D1): not readable or answerable here; no API keys tested.
- **Interactive use of the packaged app:** launch, timing and the repo's packaged smoke only. No real clicks.
- **True OS drag-and-drop**, native menus and Finder reveal (shimmed; see §2).
- **Codex version gating** with a different CLI version; **Anthropic/OpenAI API providers** with real keys.
- **Contrast ratios, 200% text scaling, reduced motion/transparency**, and 5,000-document performance budgets.
- The repo's own unit tests, lint, `pnpm e2e`, `pnpm security:check`.
- Windows or Linux (not supported).

## 11. Evidence index (names in the screenshot directory)

- **Onboarding and Welcome:** `001-built-first-launch`, `002`, `003`, `004`, `005`, `007`, `009`, `010`, `011`, `012`, `014`, `pkg-first-launch`, `001-b3-onb-ja-locale-default`.
- **Home:** `018-built-home-fresh`, `051-built-home-after-activity`, `066-built-home-budget`, `001-built2-after-restart`, `013-built2-home-dark`, `015-built2-home-zh-Hant`, `017-built2-home-ja`, `001-b1d-home-seeded-streak`.
- **Library:** `008-built-library-22docs`, `055`, `057`, `058`, `062`, `063`, `064`, `014-built-subfolder-dialog`, `015-built-nested-folder`, `019-built-search-rate-limit-q13`.
- **Reader and conversion:** `022-built-reader-ch2-open`, `070-built-reader-docx`, `016-b2-html-reader`, `001-b1c-p10-reader`, `002-b1c-p16-reader`; source references `scratchpad/ch2/p3.png`, `p5.png`, `p10.png`, `p16.png`.
- **Chat:** `024`, `025`, `027`, `028`, `029`, `030`, `031`, `032`, `033`, `040`, `042`, `043`, `048`, `049`, `068`, `073`.
- **Settings and privacy:** `044`, `045`, `046`, `050`, `054`, `005-b3-privacy-bottom-ja`, `006-b3-delete-typed`.
- **Responsive and themes:** `002-built2-home-720`, `003-built2-library-720`, `008-built2-workspace-720`, `009-built2-workspace-900`, `006-built2-home-1200`, `010-built2-workspace-dark`, `014-built2-library-dark`.
- **Hostile:** `001`–`011-b2-hostile-*`, `012-b2-inj-reader`, `015-b2-codex-send-debug`.
- **System-level:** `desktop-now.png`, `desktop-now2.png`, `desktop-alert.png`, `pkg-keychain-prompt.png`, `pkg-real-keychain-6s.png` (full-desktop captures including unrelated third-party dialogs), plus `logs/sample-pkg.txt`, `logs/sample-main2.txt` (stack samples), `logs/dialogs.jsonl` (every native dialog and its answer), `logs/net-built.jsonl`, `logs/net-b2.jsonl` (external connections).
- **Data:** `gen/cmp_ch2.py` output (100% text coverage per page); `logs/claude-stdout.jsonl` (CLI result event used for the usage match).
