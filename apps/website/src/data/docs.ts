/** Documentation records drive static routes, navigation, headings, and the search index. */
import type { Language } from './ui';
import { workspaceGuides } from './workspace-guides';
import { mcpGuide } from './mcp-docs';

export interface Section {
  id: string;
  title: string;
  paragraphs: string[];
  steps?: string[];
  links?: { label: string; url: string }[];
  code?: string;
  image?: { name: string; width: number; height: number; alt: string };
  diagram?: boolean;
}
export interface Guide {
  slug: string;
  title: string;
  description: string;
  group: 'Start here' | 'Study with VStudy' | 'Your workspace' | 'Reference';
  source: string;
  sections: Section[];
}

export const guides: Guide[] = [
  {
    slug: 'getting-started', title: 'Getting started', group: 'Start here', source: 'README.md',
    description: 'Install VStudy Pro and try your first reading without connecting an account.',
    sections: [
      {
        id: 'install',
        title: 'Install on macOS or Windows',
        paragraphs: [
          'Apple silicon Mac and Windows x64 are the first release targets. Intel Mac and Windows ARM64 are planned until full conversion and native packaging checks pass. Full document conversion needs macOS 14+ on Apple silicon or macOS 13+ on Intel. Use Windows 10+ for x64 or Windows 11+ for ARM64; the ARM64 app runs x64 Python through Windows emulation. The app can launch on macOS 12 for Markdown and text. On Mac, choose Apple silicon unless About This Mac lists Intel. On Windows, check Settings > System > About > System type. ARM-based Windows and Intel Mac users should wait for their planned installer. There is no Linux installer.',
          'The links below point to the latest published release. The repository is public. If an asset is absent, check Release notes and availability for published targets and verification results. A dry run is not a published release. AI, school sign-in, and fresh course content need internet access.',
        ],
        steps: [
          'Download your installer and SHA256SUMS.txt from the same release on the Download page.',
          'Verify your file against its entry in the checksum list. On Mac, use shasum -a 256 followed by the filename. On Windows PowerShell, use Get-FileHash -Algorithm SHA256 followed by the filename. Compare the entire hash. Checksums detect changed bytes, not publisher identity.',
          'Mac: open the DMG and drag VStudy Pro into Applications. Eject the image and open the installed app.',
          'Windows: run the EXE to install for the current user. Stop if this per-user installer unexpectedly asks for administrator access.',
        ],
      },
      {
        id: 'first-launch',
        title: 'Open a trusted build',
        paragraphs: [
          'The published Mac app is signed with an Apple Developer ID and notarized by Apple. The Windows installer is unsigned and SmartScreen may warn. Verify the download and trust its source before continuing.',
          'Mac releases normally use the usual first-open confirmation. Click Open. Unsigned Mac builds v0.3.0 and earlier needed Open Anyway in System Settings > Privacy & Security.',
        ],
        steps: [
          'Mac: if blocked, try opening once, then open System Settings > Privacy & Security. Choose Open Anyway only if offered and you trust the verified app. Authenticate if requested.',
          'Windows: if SmartScreen warns, choose More info > Run anyway only after verification and only if offered. Managed devices may prohibit this. Contact your administrator rather than disabling protection.',
        ],
      },
      {
        id: 'credentials',
        title: 'Unlock saved credentials when needed',
        paragraphs: [
          'Saved API keys use Electron safeStorage. Mac uses the login Keychain and can ask for access, especially after an ad-hoc rebuild. Windows uses DPAPI tied to the current Windows user; there is no Mac-style Keychain prompt.',
          'Both systems wait for your explicit unlock after restart before decrypting saved keys. Opening the main window does not unlock them. Retry or use a key for the session without saving. Portable backups exclude credentials.',
        ],
      },
      {
        id: 'updates',
        title: 'Update or uninstall',
        paragraphs: [
          'Signed macOS arm64 installations offer in-app updates. Windows updates remain disabled until signing. Export a backup in Settings > Storage, quit the app, and verify the new installer. Mac users replace the app in Applications. Windows users run the new installer for the same user. Preserve the data folder to retain coursework. Database downgrades are unsupported. Mac installation verifies the Developer ID signature; release write access can still replay older signed builds.',
          'To erase data, use Settings > Privacy > Delete all data and confirm DELETE before uninstalling. Then move the Mac app to Trash, or uninstall in Windows Settings > Apps > Installed apps. Removing only the application leaves local data.',
        ],
      },
      { id:'onboarding', title:'Try the sample document', paragraphs:['First-run onboarding lets you choose English, Traditional Chinese, or Japanese. Choose a light or dark theme, then start with the included sample. You can connect a school or set up an AI provider later.','Open the sample in the reader. Select a sentence to see the reading workflow. AI replies require your own enabled provider. The sample document itself can be read without AI.'],image:{name:'onboarding',width:1440,height:900,alt:'Welcome onboarding with a preview of the reading workspace'} },
      { id:'optional-setup', title:'Add only what you need', paragraphs:['Connect your school from Courses to bring in Moodle coursework. Use Library to import your own documents. When you want AI, choose Connect AI in the sidebar or Connect an AI during onboarding, in the Reader, or in Settings > AI services.','Choose a tool under More options. Selecting its first Install or Sign in action also grants permission to use that tool. Follow Install, Sign in, and Test. When VStudy cannot independently verify a download, Install another way shows the official command for your own terminal. Review each action before running it. On macOS, a built-in terminal shows sign-in links and codes. You can also use your own terminal. VStudy includes no AI subscription, and the test may count toward your provider usage.','Conversion of formats such as PDF needs a Python conversion environment. The first conversion requests permission before downloading packages. Markdown and text work without that setup. Settings > Privacy has an Offline mode for the converter.', "Codex is disabled on Windows because a verified equivalent of its macOS kernel sandbox is unavailable. API providers remain available. Mac additionally blocks converter networking with an OS sandbox. Windows has no equivalent kernel network deny; offline mode and Python socket interception are not an OS security boundary."] },
    ],
  },
  {
    slug:'connect-your-school',title:'Connect your school',group:'Start here',source:'docs/moodle-design.md',
    description:'Find your Moodle site, sign in with your school, and understand connection limits.',
    sections:[
      {id:'find-school',title:'Find your Moodle site',paragraphs:['Open Courses, then Connect school. Search the bundled directory by name, abbreviation, country, or hostname. Searching the directory is local. Selecting a school starts a network check against that school.','If your school is absent, enter its public HTTPS Moodle URL. Pasted course links and Moodle installations in subdirectories are normalized. HTTP sites, local network addresses, non-default ports, and untrusted certificates are unsupported.'],image:{name:'school',width:1440,height:900,alt:'Search schools or enter a Moodle site URL'},steps:['Open Courses > Connect school.','Choose the school or enter its Moodle URL.','Review the detected site and availability before signing in.']},
      {id:'sign-in',title:'Sign in through your school',paragraphs:['VStudy checks the site’s public mobile configuration before authentication. Password sites use the school’s Moodle token endpoint. SSO sites open an isolated school sign-in window. Follow your school’s normal login and multi-factor steps there.','The main process verifies the callback and account identity. Tokens stay outside the app renderer. Never paste an SSO token into chat. QR credential exchange is not implemented. Use the school URL and ordinary sign-in instead.']},
      {id:'availability',title:'School availability',paragraphs:["VStudy Pro connects to Moodle schools through their mobile services. Your school must enable these services and allow a supported sign-in method. Public HTTPS with trusted certificates and Moodle 3.5 or later are required. Maintenance, school permissions, and activity plugins can limit what is available.","Use Moodle's registered-sites lookup to check whether your school uses Moodle. It lists public registrations by country. Private and unregistered sites are absent, so a missing school may still use Moodle. A listing does not verify mobile-service settings or VStudy Pro compatibility. Ask your school's Moodle administrator if you are unsure.",'The built-in directory helps you find school sites. It does not certify compatibility, partnerships, or endorsements. You can also enter your school’s Moodle URL in Connect school.','First tested with CYCU in Taiwan means early testing, not confirmed full compatibility. Repository captures verify school discovery and a local Moodle-pane demo. They do not prove live school authentication or complete course-content support. The CYCU confirmation notes record failed content and activity calls and a pending confirmation run. Synthetic parser tests verify parser behavior, not the live site.','Do not bypass a school restriction or ignore a certificate error. Your school website remains the source of truth for submissions and grades.'],links:[{label:'Check whether your school uses Moodle',url:'https://stats.moodle.org/sites/'}]},
      {id:'accounts',title:'Use more than one account',paragraphs:['Each site root and remote user identity has separate tokens, courses, and sync state. You can connect multiple schools. Recent sites contain public site information, without credentials.','Reconnect an expired account with the same school identity. To use another identity while the expired account remains, disconnect that expired account first. A restored backup also requires school sign-in again.']},
    ],
  },
  {
    slug:'courses-and-deadlines',title:'Courses and deadlines',group:'Study with VStudy',source:'docs/moodle-design.md',
    description:'Browse coursework, check what is due, and open the materials you need.',
    sections:[
      {id:'courses',title:'Find a course',paragraphs:['Courses groups your Moodle courses into Current, Upcoming, Past, and All. A course can show its teacher, term, due-work count, and progress when the school supplies that data. Missing dates are not treated as confirmed term dates.','Open a course to browse Content, Deadlines, Announcements, Grades, Files, and Notifications. Available functions depend on the school’s mobile-service capabilities.'],image:{name:'courses',width:1440,height:900,alt:'Courses and due-soon work in VStudy'}},
      {id:'course-page',title:'Inside a course',paragraphs:['Open a course to see its current week, materials, progress, and upcoming work in the app.'],image:{name:'course',width:1440,height:900,alt:'Real Algorithms & Data Structures course page with week 8 materials and deadlines'}},
      {id:'due-work',title:'Check upcoming work',paragraphs:['Due soon highlights the next seven days. Within a course, use Deadlines to inspect overdue, upcoming, and completed work. Check important dates and submission state against Moodle before acting.','You can propose reminders and export calendar events. Calendar export creates an .ics file. It is not two-way calendar synchronization.']},
      {id:'saved-content',title:'Understand saved content',paragraphs:['The app shows saved course content before it refreshes the network. Cache state and the last real sync time distinguish saved information from a fresh response. An offline view can be useful without proving the current deadline.','Use Refresh to request new data. An expired sign-in requires Reconnect. Authentication and permission errors are not hidden as successful refreshes. Open supported files in the document reader, or open the Moodle page for unsupported content.']},
    ],
  },
  {
    slug:'study-planner',title:'Study planner and the agent',group:'Study with VStudy',source:'docs/ARCHITECTURE.md',
    description:'Turn coursework into a plan while keeping control of every proposed change.',
    sections:[
      {id:'planner',title:'Build your own plan',paragraphs:['Open Courses > Today / Planner to create tasks and exams, set due dates, and estimate study time. Goals, plans, reminders, and study blocks belong to you. Removing a Moodle reference detaches student-owned planner work rather than deleting it.'],image:{name:'planner',width:1440,height:900,alt:'Study planner with tasks, time estimates, and a statistics exam'}},
      {id:'agent-context',title:'Ask the course assistant',paragraphs:['Open the assistant from a course. Ask for a weekly plan, help catching up, or exam preparation. Its context combines current coursework, planner state, and selected ready documents within a fixed budget. It cannot assume that every school record or document is current.','Course text and document content are untrusted input. A model can misunderstand dates or invent a requirement. Read the source and check proposed details.']},
      {id:'approval',title:'Review before you approve',paragraphs:['The agent returns proposals, not automatic planner writes. Review each approval card, including the target course, task, date, and duration. Approve only the action you want. Rejecting a proposal does not apply it.','Main validates the approved action against current targets before writing. Repeated approval does not duplicate the same action. This approval model does not make AI answers authoritative or guarantee a correct plan.']},
    ],
  },
  mcpGuide,
  {slug:'usage',group:'Your workspace',source:'apps/desktop/src/renderer/usage/settings.tsx',...workspaceGuides.en.usage!},
  {slug:'reading-documents',group:'Study with VStudy',source:'apps/desktop/src/renderer/workspace/index.tsx',...workspaceGuides.en['reading-documents']!},
  {
    slug:'ai-providers',title:'AI providers and keys',group:'Study with VStudy',source:'README.md',
    description:'Install an AI tool, connect your account, test an answer, and manage updates.',
    sections:[
      {id:'choose',title:'Choose a provider',paragraphs:['Settings > AI services supports Anthropic, OpenAI, OpenAI-compatible endpoints, and the local Claude Code, Codex, and Antigravity tools. VStudy includes no AI subscription. Open Which tool should I choose? in setup to compare account needs.','Claude Code needs an Anthropic account with Claude Code access. Codex uses a ChatGPT account; free and paid plans have different limits, and API billing is separate. Antigravity uses an eligible Google account with its available free allowance or paid plan limits. Offers and eligibility can change. Check the provider before paying.','Local tools start off. Before you allow a tool, VStudy checks installed files without launching it. An executable that changes needs renewed confirmation. You can keep an existing installation or choose an app-managed copy.']},
      {id:'setup',title:'Install, sign in, and test',image:{name:'connect-ai',width:1440,height:900,alt:'Connect an AI with a single next action'},paragraphs:['Connect an AI shows one next action: Install, Sign in, then Test. More options contains provider choices and advanced controls. API keys and custom connections are in Settings > AI services.','Open Connect AI in the sidebar, or Connect an AI from onboarding, the Reader, or Settings > AI services. The highlighted step shows where you are and what happens next. The first action also grants permission to use the selected tool. Change tools under More options.','Managed installation requires independent publisher proof before execution. Claude uses its signed manifest; macOS Codex 0.166.0 uses audited hashes shipped in the app. Antigravity shows Install another way with an explanation and the official command to run in your own terminal. Then select the program in Settings > AI services > Change.','The built-in terminal runs the action you reviewed. On macOS, follow the sign-in link or device code it displays, then return to VStudy. External links ask for confirmation. Where embedded sign-in is unavailable, choose Open in my own Terminal or Copy command. The external-terminal option copies the command for you to paste; it does not paste or run it automatically.'],steps:['Install. Choose Install to allow the selected tool and start its verified installation. Other actions shows the plan and alternatives. VStudy verifies the download without an administrator password or PATH changes.','Sign in. Choose Sign in and follow the displayed link or device code. Details holds the terminal output. If you already signed in, use Review account status check.','Test. Choose Test. VStudy sends a short question through the real provider and displays its answer. No document text is included; the test may count toward your usage.']},
      {id:'updates',title:'Update without stopping a chat',paragraphs:['Connect AI in the sidebar shows each version and update state. Check for updates now makes a one-time network check. Background checks and Update automatically when idle start off in Settings > Privacy. Background checks are cached and normally run at most every four hours.','New versions without independent publisher proof show New version available: install it yourself and a confirmed vendor link. Revoking provider consent or either update preference cancels a pending automatic update.','Choose the available update and review its plan. VStudy downloads and verifies a separate version. A running chat keeps its current program; new chats use the update. Update ready, applies to new chats explains that handoff. You can review a rollback to the retained previous version.','VStudy only updates its managed copy. If you prefer an existing installation, choose it in Settings > AI services > Change. Install another way shows a copy-only official command; vendor installers use their own folders. Metadata checks and downloads appear in the Privacy network inventory.']},
      {id:'recovery',title:'When a step needs help',paragraphs:['Read the recovery hint in the current step. If you are offline, reconnect and retry. If a school policy, antivirus, or permissions block installation, copy the request under Ask your teacher or IT team. The managed installer does not need administrator access.','If a browser does not open, use the displayed sign-in link and code. An expired login needs a fresh sign-in action. Review account status check checks an existing account without sending a chat. Unsupported Codex versions require the audited managed version.','Closing setup or reloading the window stops its setup action. Your reading remains available. The Advanced general shell is optional, starts off, and requires an extra confirmation because it can run programs with your account permissions. Guided setup does not need it.']},
      {id:'keys',title:'Save a key or use it for this session',paragraphs:['API keys are encrypted through macOS Keychain access when you explicitly save or unlock them. A Keychain prompt can appear then, including after an ad-hoc rebuild. Window creation does not wait for key decryption.','After restart, unlock saved keys before model discovery can use them. If you deny access, retry or choose Use without saving keys. That option retains the key only for the current process. Never put a key in a chat, screenshot, or issue report.']},
      {id:'data',title:'Understand what a provider receives',paragraphs:['Enabled providers receive your question, conversation history, document metadata, and selected text. Without a selection, the prompt includes an outline and opening excerpt. Previous selections can remain in the conversation context.','CLI providers use their own login and can contact their own discovery, verification, quota, chat, or telemetry services. VStudy requests telemetry and nonessential-traffic opt-outs from Claude. That is not a promise that a CLI makes no other requests.']},
      {id:'codex',title:'Codex compatibility',paragraphs:['This checkout pins authenticated Codex CLI 0.166.0 on macOS with /usr/bin/sandbox-exec. A cached canary verifies its tool-free chat transport. Unsupported versions and failed verification stop the transport.','The transport disables native tools and denies child-process creation. It is not a complete filesystem or endpoint-only network sandbox for a compromised CLI. Check the repository’s Codex transport document before changing the pinned version.']},
    ],
  },
  {slug:'themes',group:'Your workspace',source:'apps/desktop/src/renderer/settings/appearance.tsx',...workspaceGuides.en['themes']!},
  {
    slug:'chat-history',title:'Chat history search',group:'Your workspace',source:'docs/ARCHITECTURE.md',
    description:'Find past answers across document, course, and general conversations.',
    sections:[
      {id:'find',title:'Find a conversation',paragraphs:['Open History, or press Cmd/Ctrl+K for the quick finder. Search titles and message text across your conversations. Narrow results by course, document, scope, role, or date.','Open a result to return to the conversation. Pin important chats, give them useful titles, or archive finished threads. Deleting a conversation also removes its messages.'],image:{name:'history',width:1440,height:900,alt:'Search and filter conversations in the History view'}},
      {id:'local-search',title:'Search stays local',paragraphs:['History uses a local SQLite full-text index. It does not send search queries to an AI provider. Superseded messages do not enter active search or prompt history.','History is not automatic device sync. Export a portable backup before moving to a different installation. Backups contain private conversation content, so store them securely.']},
    ],
  },
  {
    slug:'moodle-pages',title:'Moodle pages and security',group:'Your workspace',source:'apps/desktop/src/main/moodle/webview.README.md',
    description:'Read supported school pages without giving them access to your desktop app.',
    sections:[
      {id:'open',title:'Open school content in place',image:{name:'moodle',width:1440,height:900,alt:'Styled demo teacher page for Algorithms & Data Structures inside the isolated Moodle pane'},paragraphs:['Open supported announcements, modules, and other Moodle content through the course interface. In-app content views share the account’s authenticated session. For content the app cannot render directly, use Open in Moodle.','The page pane has its own navigation and recovery controls. Cmd/Ctrl+R reloads the focused Moodle pane. Escape closes it. If sign-in expires, reconnect the school account.']},
      {id:'isolation',title:'Keep account boundaries',paragraphs:['Moodle pages run in sandboxed, context-isolated views without Node integration. Account-scoped in-memory partitions separate sessions. Tokens stay in main and do not appear in renderer URLs.','Allowed navigation, popups, downloads, and external protocols follow explicit policies. External browser and mail links need confirmation. Do not treat the embedded school page as a trusted command to the study agent.']},
      {id:'recovery',title:'Recover a page',paragraphs:['If a page fails, retry through its recovery controls. Check your connection and the school website if it still fails. A school can require a full browser for some activities.','Do not submit sensitive or time-critical work solely on an AI summary. Confirm submission and grades on the school’s authoritative page. Use the school website when an activity needs a full browser.']},
    ],
  },
  {
    slug:'data-and-storage',title:'Data and storage',group:'Your workspace',source:'docs/STORAGE.md',
    description:'Understand local files, clean caches, and make a portable backup.',
    sections:[
      {id:'local',title:'What stays on disk',paragraphs:['The main process owns one application data namespace under Electron’s userData directory. It contains vstudy.sqlite, the document library, settings, and bounded Moodle response caches. SQLite uses WAL mode and foreign keys. There is no device sync.','Originals use content-addressed directories. Metadata lists do not read every original file. Local full-text indexes support document and chat search. Credentials use separate main-owned secret storage.']},
      {id:'cleanup',title:'Manage storage',paragraphs:['Settings > Storage shows local usage, cache cleanup, converted-file cleanup, portable backup, restore, and integrity checks. Read the confirmation before cleaning data. Cleanup excludes active conversions and chats.','Clearing cached responses differs from deleting student records. Removing converted files preserves original documents. The integrity check snapshots SQLite and scans database integrity and foreign keys. It does not hash every original.']},
      {id:'backup',title:'Export a portable backup',paragraphs:['Use Settings > Storage to choose a backup destination. VStudy writes an uncompressed ZIP32 archive with a manifest and checksums. The backup includes coursework, library content, and chat data in plaintext. Protect the archive as private data.','Credentials, CLI logins, and Chromium state are excluded. Restore accepts the app’s backup format below 4 GiB and 50,000 files. It does not support arbitrary ZIP archives or ZIP64.']},
      {id:'restore',title:'Restore and restart',paragraphs:['Choose a backup through Settings > Storage. The app validates archive paths, sizes, hashes, database structure, and source files before staging it. Invalid backups leave the live library untouched.','After a validated restore, new writes pause until restart. Startup publishes the staged database and library with recoverable rename steps. Moodle accounts require reconnection. Provider configuration and existing secrets are not replaced. Previous data stays in a recovery directory until you remove it.']},
    ],
  },
  {
    slug:'privacy-and-network',title:'Privacy and network',group:'Reference',source:'README.md',
    description:'Local-first storage is a data policy, not a promise of zero network traffic.',
    sections:[
      {id:'analytics',title:'Optional analytics',paragraphs:['Product analytics are optional and off by default. VStudy asks once at first launch, and you can change the choice in Settings > Privacy at any time. No feature depends on it. When on, VStudy sends usage events keyed to a random installation ID to PostHog in the United States. The events cover launches, active time, features used, AI provider, model and token counts, broad question categories, document and study actions, sanitized errors, how you heard about VStudy, your school when Moodle identifies it, and basic device and app details.','The events never contain your questions, answers, documents, notes, search queries, file names, keystrokes, screenshots, or Moodle identity details. An optional product-update email address is kept in a separate service and never reaches analytics. The Privacy Policy lists every category, the retention periods, and how to request deletion.'],links:[{label:'Read the Privacy Policy',url:'@privacy'},{label:'Read the Terms of Service',url:'@terms'}]},
      {id:'network',title:'When VStudy connects',paragraphs:['VStudy sends no analytics unless you opt in. Choosing a Moodle school contacts the school. Enabled AI providers receive prompts and reading context. Optional conversion setup downloads packages from PyPI, and uv may download Python from GitHub.','Downloaded converter workers deny network access on macOS. External links open only after confirmation. Local document and history search do not require an external search service.']},
      {id:'inventory',title:'Inspect session activity',paragraphs:['Settings > Privacy has a bounded, session-only inventory of app-initiated requests and CLI launches. Moodle destinations show hostnames without paths, query strings, passwords, or tokens.','The inventory is not a packet capture. It cannot enumerate every encrypted request inside a CLI or Chromium. Byte counts are currently unknown. Provider privacy policies still apply to information sent to those providers.']},
      {id:'delete',title:'Delete application data',paragraphs:['Delete all data requires typing DELETE and accepting a native confirmation. It removes the application data namespace and quits. Make a backup first if you want to retain your coursework.','Deletion keeps original files outside the library, CLI logins, and shared Python download caches. It is not secure erasure of backups or SSD blocks. Remove exported backups separately when they are no longer needed.']},
    ],
  },
  {
    slug:'keyboard-shortcuts',title:'Keyboard shortcuts',group:'Reference',source:'apps/desktop/src/renderer/history/index.tsx',
    description:'Use the reader, history finder, and Moodle pane from the keyboard.',
    sections:[
      {id:'app',title:'App shortcuts',paragraphs:['Use Cmd on Mac and Ctrl on Windows.','Cmd/Ctrl+K opens the conversation quick finder. Cmd/Ctrl+Shift+K asks about the current reader selection. Arrow keys move the reader selection and Shift+Arrow extends it when the reader is focused.','The library supports Cmd/Ctrl+A to select visible items, Space to select an item, and Enter to open it. Context-menu handling supports Shift+F10. Focus and the current view determine which shortcut handles the key.']},
      {id:'panes',title:'Panels and school search',paragraphs:['Escape closes the course assistant or Moodle pane. Cmd/Ctrl+R reloads the focused Moodle pane. In school search, use Arrow keys, Home, End, and Enter to choose a result.','Use Tab and Shift+Tab to move between controls. Focus indicators remain visible. Dialogs restore focus to their trigger when they close.']},
      {id:'website',title:'This website',paragraphs:['Use the skip link at the start of each page to reach the content. Docs search opens with Cmd+K on Mac or Ctrl+K on Windows. Type a query, then Tab to a result and press Enter. Escape closes the dialog.','Copy buttons announce success or failure. Heading links can be copied from the address bar. Reduced-motion preferences disable the home page’s entrance animation and smooth scrolling.']},
    ],
  },
  {
    slug:'troubleshooting',title:'Troubleshooting',group:'Reference',source:'README.md',
    description:'Recover school connections, conversions, provider access, and local storage.',
    sections:[
      {id:'launch',title:'macOS blocks the app',paragraphs:['The published Mac app is signed and notarized. Normally, click Open in the standard first-launch confirmation. Unsigned Mac builds v0.3.0 and earlier needed Open Anyway in System Settings > Privacy & Security. If the current build is blocked, download it again and verify its signature.']},
      {id:'school',title:'School connection or refresh fails',paragraphs:['Confirm the public HTTPS Moodle URL. Check whether the school allows mobile web services and third-party access. Maintenance and disabled services need school-side resolution. An absent directory entry can still be entered as a URL.','Reconnect expired accounts with the same identity. A cached course view can be older than the school’s current data. Open the school website to verify urgent work.']},
      {id:'conversion',title:'Document conversion fails',paragraphs:['Check the 50 MB import limit and the document format. A scanned PDF has no selectable text and needs OCR elsewhere. A complex PDF layout may convert with missing or reordered content.','The first conversion needs consent for package downloads and an available uv or Python environment. Settings > Privacy offers Retry and converter Offline mode. Cold startup can take several seconds. Test Markdown or plain text to separate conversion setup from library access.']},
      {id:'provider',title:'AI or Keychain access fails',paragraphs:['Enable the intended provider and select an available model. Unlock saved keys after restart. If Keychain access is denied or times out, retry after granting access or choose Use without saving keys for the session.','For a CLI provider, sign in outside VStudy and confirm its resolved executable. Codex must match the pinned verified version. Never include an API key, token, private document, or full diagnostic URL in a bug report.']},
      {id:'storage',title:'Storage is full or restore fails',paragraphs:['Free disk space before retrying. Use Settings > Storage for usage and bounded cleanup. Preserve originals and backups until you know the replacement is readable.','Restore only accepts the app’s supported portable-backup format. Invalid archives leave live data untouched. If startup recovery fails, keep the recovery directory and report the error without sharing the private backup.']},
    ],
  },
  {
    slug:'architecture',title:'Architecture',group:'Reference',source:'docs/ARCHITECTURE.md',
    description:'How Electron process boundaries protect a local study workspace.',
    sections:[
      {id:'processes',title:'Processes and trust',paragraphs:['The sandboxed React renderer presents the workspace. A typed preload bridge exposes invoke calls and validated event subscriptions. Main owns files, credentials, provider processes, native dialogs, and persistent services.','IPC registration validates the current window’s main-frame sender, request schema, and response schema. Shared Zod contracts describe data that crosses the boundary. Moodle views stay sandboxed and never gain the preload bridge’s app capabilities.'],diagram:true},
      {id:'storage',title:'SQLite, files, and cache',paragraphs:['Main owns one synchronous node:sqlite connection. Forward-only numbered migrations carry checksums and create backups before disk upgrades. Repositories use bound values, foreign keys, and savepoints.','Originals and converted Markdown are files in the contained library. Document and chat FTS5 trigram indexes support local search. A killable search worker bounds document queries. Account-scoped Moodle TTL caches distinguish fresh, stale, and offline results.']},
      {id:'services',title:'Study and reading services',paragraphs:['Moodle services validate site discovery, account identities, capabilities, and responses. Planner services own tasks, goals, exams, plans, and reminders. Main applies explicitly approved agent proposals against current state.','Documents validate source signatures and coordinate on-demand conversion. Provider adapters normalize streaming events. Chat services own request identity, cancellation, history branches, and transactional message persistence.']},
      {id:'shutdown',title:'Startup and shutdown',paragraphs:['Main acquires a single-instance lock before opening user data. Saved-key decryption, converters, and CLI execution wait until needed or explicitly approved.','Shutdown rejects new work, aborts and persists chats, stops providers and workers, flushes persistence, and then closes SQLite. Services join this bounded coordinator instead of leaving detached work.']},
    ],
  },
  {
    slug:'development',title:'Contributing and development',group:'Reference',source:'docs/ENGINEERING.md',
    description:'Run the app and static website, then verify changes before contributing.',
    sections:[
      {id:'setup',title:'Set up the repository',paragraphs:['Use Node 24.19.0 from .node-version and pnpm 10.28.2. Source builds require Node 24.15.0 or later. Clone the repository with your GitHub access, then install from the root. Keep API keys and signing credentials outside source control.'],code:'pnpm install\npnpm dev'},
      {id:'checks',title:'Verify a change',paragraphs:['Run type checking, lint, security checks, and tests before sharing app changes. Limit Vitest to two fork workers on memory-constrained machines. Live provider checks require explicit opt-in and authentication. A skipped live check does not prove provider operation.'],code:'pnpm typecheck\npnpm lint\npnpm test --pool=forks --maxWorkers=2\npnpm security:static\npnpm knip'},
      {id:'website',title:'Build the website',paragraphs:['The @vstudy/website package uses Astro static output. It makes no analytics or third-party font requests. Download assets and detection come from src/data/downloads.ts. Source version metadata comes from src/config.ts and is not a verified installer version. Docs routes and search share the same typed content registry.','BASE_PATH defaults to / for root hosting. Set BASE_PATH=/vstudy-pro for GitHub Pages project hosting. SITE_URL controls the canonical origin. The Pages workflow builds and uploads only static output. It does not publish desktop releases.'],code:'pnpm --filter @vstudy/website build\npnpm --filter @vstudy/website preview'},
      {id:'contribute',title:'Make a focused contribution',paragraphs:['Keep main, renderer, and shared ownership separate. Put app strings in the matching English, Traditional Chinese, and Japanese namespaces. Update the website’s locale dictionaries for website copy.','Use small Conventional Commits with a description of why the change is needed. Include current evidence for behavior or UI changes. Never commit credentials, real student data, or generated release artifacts.']},
    ],
  },
];

export const groups = ['Start here','Study with VStudy','Your workspace','Reference'] as const;
export function getGuide(slug: string, language: Language): Guide {
  const guide = guides.find(item => item.slug === slug);
  if (!guide) throw new Error(`Unknown guide: ${slug}`);
  return translations[language]?.[slug] ? { ...guide, ...translations[language][slug] } : guide;
}
import { translations } from './translations';
