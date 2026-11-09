/** English legal text. This pack is the source of truth; translations must keep its structure. */
import type { LegalPack } from './legal';

export const legalEn: LegalPack = {
  chrome: {
    updated: 'Last updated:',
    toc: 'On this page',
    related: { terms: 'Read the Terms of Service', privacy: 'Read the Privacy Policy' },
    emailTodo: 'contact email to be added by the project owner',
    lawTodo: 'governing law and venue to be confirmed by the project owner',
  },
  docs: {
    privacy: {
      title: 'Privacy Policy',
      description: 'What VStudy Pro keeps on your device, what the optional analytics send, and where your data goes when you use AI or connect a school.',
      lead: 'VStudy Pro is built so that your coursework stays on your computer. This page explains the few situations in which information leaves it, who receives it, and how you stay in control.',
      sections: [
        {
          id: 'who', title: 'Who we are',
          blocks: [
            { type: 'p', text: 'VStudy Pro is a desktop study app for macOS and Windows. It is developed and published by [[the project owner: legal name or entity to be confirmed]], an independent project based in Taiwan. The source code is public at [the VStudy Pro repository](@repo). In this page, “we” means that owner.' },
            { type: 'p', text: 'For the optional analytics and the optional newsletter described below, we decide what is collected and why, so we are responsible for that data. For everything else, such as your AI provider or your school, the provider or school is responsible for how it handles your data. [AI providers, your school, and other services](#third-parties) shows where that happens.' },
          ],
        },
        {
          id: 'summary', title: 'The short version',
          blocks: [
            { type: 'summary', items: [
              'Your documents, chats, notes, and study plans live on your computer. There is no VStudy account and no VStudy server that stores them.',
              '**Analytics are optional and off by default.** You choose at first launch and can change your mind at any time in Settings > Privacy. Every feature works the same either way.',
              'If you opt in, we receive usage information: which features you use, which AI provider and model you pick, token counts, errors, and so on. We never receive your questions, answers, documents, notes, or keystrokes.',
              'A random installation ID links those events together. It is not your name, your school login, or a hardware identifier. It is pseudonymous, which is not the same as anonymous.',
              'If you use AI, your prompt and reading context go to the provider you enabled. If you connect Moodle, the app talks to your school. Neither passes through us.',
              'The newsletter is separate. Its checkbox is unchecked by default, it needs a confirmation email, and the address is never mixed into analytics.',
            ] },
          ],
        },
        {
          id: 'on-device', title: 'What stays on your device',
          blocks: [
            { type: 'p', text: 'VStudy Pro is local-first. These stay in the app’s data folder on your computer and are not sent to us, whether analytics is on or off:' },
            { type: 'list', items: [
              'documents you import, and the converted copies the app makes from them;',
              'conversations and AI answers;',
              'study plans, reminders, notes, and settings;',
              'course content mirrored from your school, such as deadlines, announcements, grades, and files;',
              'the usage and cost history the app shows you.',
            ] },
            { type: 'p', text: 'Saved credentials are encrypted with your operating system’s secure storage (Keychain-backed on macOS, DPAPI on Windows). Credentials you choose to use for one session only stay in memory.' },
            { type: 'p', text: '**Not everything is encrypted.** The app does not encrypt documents, Markdown files, or chats at rest. Protect your computer with an account password and disk encryption such as FileVault or BitLocker. A portable backup you export contains your study content in readable form and leaves out credentials, so treat it as private.' },
            { type: 'p', text: 'Settings > Privacy lists the network requests the app has made in the current session. **Delete all data** removes the app’s data folder. It does not remove original files you imported from elsewhere, backups you exported, sign-ins stored by AI command-line tools, or items in your operating system’s credential store. Read [the data and network guide](@docs-privacy) for details.' },
          ],
        },
        {
          id: 'analytics', title: 'Optional analytics',
          blocks: [
            { type: 'p', text: 'VStudy Pro can send product analytics so that we can see how many installations are active, which features matter, and where the app fails. We ask once, at first launch. Declining never blocks, limits, or degrades any feature.' },
            { type: 'h3', text: 'How it works' },
            { type: 'list', items: [
              '**Off until you opt in.** Nothing is sent before you choose, and you can finish onboarding without opting in.',
              '**Who receives it.** PostHog (PostHog Inc.) processes the events for us in its US cloud region, at `us.i.posthog.com`.',
              '**Installation ID.** At first launch the app generates a random ID on your computer. It is not built from your hardware, name, school account, or email, and we do not try to recreate it if you delete it. It lets us recognize events from the same installation over time. Reinstalling or clearing the app’s data may create a new ID, one shared computer can look like one person, and one person on two computers looks like two.',
              '**Pseudonymous, not anonymous.** Because the ID is stable and can be combined with a school and detailed activity, we treat analytics data as personal data, even though it contains no name or email.',
              '**Turning it off.** Switch it off in Settings > Privacy. New events stop immediately, and events from the time it was off are not saved up and sent later.',
              '**No automatic capture.** Automatic click and keystroke capture and session replay are turned off in our PostHog setup.',
            ] },
            { type: 'h3', text: 'What is collected' },
            { type: 'p', text: 'Every event carries a random event ID, a timestamp, your installation ID, the app version, your operating system family, and a session ID when the event belongs to a session. On top of that, the app sends only the kinds of information in this table.' },
            { type: 'table', caption: 'Information sent when analytics is on', head: ['Area', 'What is sent'], rows: [
              ['Installation and device', 'Operating system family (macOS or Windows) and a coarse version, app version, interface language, CPU architecture, coarse CPU-core, memory and screen-size buckets, the Electron version, and when the app version changes. First-seen and last-active times are derived from event timestamps.'],
              ['Launches and sessions', 'When the app opens, closes, or updates. When a session starts and ends, how long it lasted, and how much of that time was active (app in front and recent interaction), idle, or in the background. Active time is summarized every few minutes. When the window comes to the front, loses focus, or is minimized. A session that ends in a crash or forced quit may be estimated.'],
              ['Onboarding', 'How you heard about VStudy Pro, as a choice from a fixed list (with an optional more specific choice) or “Prefer not to say”. How long onboarding took. Two yes or no flags: whether you entered an email address and whether you opted in to updates. The address itself is never sent to analytics.'],
              ['School', 'If you connect Moodle, the app matches your school’s Moodle site against a verified list we maintain. When it matches, we record the school’s short institution key and display name, that Moodle is connected, and how the school was determined (Moodle, chosen by you, or unknown). Later events may carry the institution key so we can report by school. If we cannot match the site, the school stays unknown. Disconnecting Moodle is recorded as an event.'],
              ['Features and settings', 'Which screens and features you open, from a fixed list. When you choose an AI provider or model, change the reasoning effort, the language, or the theme.'],
              ['AI requests', 'Provider (for example Anthropic or OpenAI), model, reasoning-effort setting, how the provider is connected (API key, command-line tool, or other), the feature used (chat, explain a selection, summarize, quiz, and so on), where the context came from (direct chat, document, selected text), a random request ID and conversation ID, status (success, failed, cancelled), error category, response time, token counts when the provider reports them, and sometimes an estimated cost. When a count is unknown it stays unknown rather than becoming zero. Never the prompt or the answer.'],
              ['Questions', 'For each question you ask: a broad category (for example concept explanation or calculation), a broad subject area (for example mathematics or humanities), where it came from (typed, selected text, document chat), its length in characters, its turn number, whether it is a follow-up, and whether a document was attached. “Unknown” is used when the app cannot tell. Also whether you regenerate an answer, clear a conversation, or rate an answer positive or negative. Never the question text.'],
              ['Documents', 'That you imported, opened, closed, searched, highlighted, annotated, or exported a document, with the file type (for example PDF), how it was imported, how long you actively read, how many highlights and notes you made, the length of a text selection, and the export format. Never the title, file name, location, content, notes, or search words.'],
              ['Study tools', 'Use of quizzes, flashcards, summaries, mistake review, study sessions, and notes, as they exist in your version: counts, types, durations, whether a quiz answer was correct, and aggregate scores. Never the quiz question or your answer.'],
              ['Errors and performance', 'App errors, crashes, failed document opens, failed AI provider connections, timeouts, and failed updates, reduced to sanitized categories together with the feature and app version. Startup time and a coarse memory figure. Raw error traces, file paths, prompts, and keys are removed before anything is sent.'],
            ] },
            { type: 'h3', text: 'How we use it' },
            { type: 'p', text: 'We use analytics to count active and returning installations, see which versions and platforms are in use, learn how people find VStudy Pro, understand which AI providers, models, and features matter, find and fix errors and slow operations, and report usage by institution. We do not sell it, use it for advertising, or use it to target you.' },
            { type: 'p', text: 'Because a school combined with a stable ID and detailed activity could single someone out in a small group, we report by institution in aggregate, leave out very small groups, and limit who can see the history of a single installation.' },
          ],
        },
        {
          id: 'never', title: 'What we never collect',
          blocks: [
            { type: 'p', text: 'Whether analytics is on or off, the app does not send us:' },
            { type: 'list', items: [
              'your questions, prompts, AI answers, or conversation transcripts;',
              'documents, page text, selected or highlighted passages, notes, quiz answers, titles, file names, folder paths, or search words;',
              'keystrokes, mouse movements, screenshots, screen recordings, or session replay;',
              'API keys, passwords, access tokens, or Moodle sign-in details;',
              'your name, student number, Moodle user ID, or Moodle website address;',
              'your email address, in analytics (the newsletter is separate, see [Optional product-update emails](#newsletter));',
              'hardware identifiers, device fingerprints, host names, or operating system user names;',
              'your location. IP-based location lookup (GeoIP) is turned off, and the app does not use GPS.',
            ] },
            { type: 'p', text: 'One honest note: any internet connection reveals an IP address to the server it reaches, including PostHog’s. We do not record it as an event property and we do not use it to look up where you are.' },
            { type: 'p', text: 'If we ever offered a way to share a real question with us to help fix a problem, it would be a separate, explicit action with its own notice and controls. It would never be switched on by the analytics setting.' },
          ],
        },
        {
          id: 'third-parties', title: 'AI providers, your school, and other services',
          blocks: [
            { type: 'p', text: 'Some features work by contacting another party. When that happens your data goes to that party, not to us, and its own terms and privacy policy apply. We cannot see, correct, or delete what you send them.' },
            { type: 'table', caption: 'Who is contacted and what they receive', head: ['Service', 'When', 'What it receives'], rows: [
              ['AI provider through an API key (Anthropic, OpenAI, or an OpenAI-compatible endpoint you set up)', 'When you ask a question with that provider enabled', 'Your message, the conversation history, document details, and the selected text, or an outline and opening excerpt of the document when nothing is selected. Earlier selections may stay in the history that is sent. Your key authenticates the request.'],
              ['AI command-line tool you enable (Claude Code, Codex, Antigravity)', 'When you use that tool through VStudy Pro', 'The same prompt, passed to the tool, which signs in with your own account. Such tools may contact their own chat, model-discovery, verification, quota, or telemetry services. VStudy Pro asks Claude Code to turn off telemetry and nonessential traffic, which is not a promise that no other request is made.'],
              ['Your school’s Moodle', 'When you connect, sync, or open a school page', 'Your school sign-in and requests for your courses, deadlines, announcements, grades, and files. The school sees this as activity on your account.'],
              ['PyPI and GitHub', 'Only if you agree to set up the optional document converter', 'Python packages come from PyPI, and the `uv` tool may download Python from GitHub. These services see ordinary connection details such as your IP address.'],
              ['AI tool vendors', 'When you check for or install an AI tool update. Background checks are a separate setting that is off by default.', 'Ordinary request details for the vendor’s update or download address.'],
              ['PostHog', 'Only if you opt in to analytics', 'The events listed under [Optional analytics](#analytics).'],
              ['Resend', 'Only if you opt in to product updates', 'Your email address, as described under [Optional product-update emails](#newsletter).'],
              ['Websites you open from the app', 'Only after you confirm in a dialog', 'Whatever the site you open receives from your browser.'],
            ] },
            { type: 'h3', text: 'AI providers' },
            { type: 'p', text: 'VStudy Pro includes no AI model and no AI subscription. The prompt it builds can contain passages from your readings and, for course chat, parts of your coursework. Send only material you are comfortable giving that provider, and check whether your school’s rules allow it. Providers may keep prompts according to their own policies.' },
            { type: 'h3', text: 'Your school' },
            { type: 'p', text: 'Connecting Moodle sends your sign-in and requests to your school, which handles them under its own policies. Course content that VStudy Pro mirrors to your computer stays there. We do not receive it, and your school does not receive analytics from us.' },
          ],
        },
        {
          id: 'newsletter', title: 'Optional product-update emails',
          blocks: [
            { type: 'p', text: 'During onboarding you can enter an email address and tick a separate box to receive product updates.' },
            { type: 'list', items: [
              '**Opt-in only.** The box is unchecked by default. Typing an address does not subscribe you. If you do not tick the box, we do not register your address for updates.',
              '**Confirmation.** We send a confirmation email first, and you are subscribed only after you confirm.',
              '**Where it goes.** The address and a record of when and how you agreed go to a small VStudy service and to Resend, the email delivery provider. It is kept apart from analytics and is never sent to PostHog. Analytics only learns two yes or no facts: that you entered an address and that you opted in.',
              '**Your control.** Every email has a one-click unsubscribe link. Unsubscribing, or turning analytics on or off, does not affect the other.',
              '**Purpose.** We use the address only to send updates about VStudy Pro. We do not sell it or pass it on for other companies’ marketing.',
            ] },
          ],
        },
        {
          id: 'website', title: 'This website',
          blocks: [
            { type: 'p', text: 'This website has no analytics, no advertising or tracking scripts, no cookies, no third-party fonts, and no embedded third-party content. The documentation search runs in your browser, and your search words are not sent anywhere.' },
            { type: 'p', text: 'It keeps two small items in your browser, on your device only: your light or dark choice if you pick one, in local storage under `vstudy-scheme`, and a note in session storage that the opening animation has played. They are not cookies, are never sent to us, and only keep the page looking the way you chose.' },
            { type: 'p', text: 'The site is hosted on GitHub Pages, and installers are served from GitHub Releases. GitHub receives technical details such as your IP address when you load a page or download a file, under GitHub’s own privacy statement. We see only the aggregate figures GitHub shows maintainers, such as how often a release file was downloaded. Links to other sites, for example the Moodle directory we link to so you can check your school, leave this website.' },
          ],
        },
        {
          id: 'legal-basis', title: 'Legal basis and consent',
          blocks: [
            { type: 'p', text: 'Our basis for the optional analytics and for the product-update emails is your consent. We ask for each separately, before any event or address is sent. Consent is voluntary: refusing it changes nothing in the app. You can withdraw it at any time. Withdrawing stops new collection immediately and does not make earlier processing unlawful.' },
            { type: 'p', text: 'Everything else the app does with your documents, chats, and plans happens on your own computer. We do not receive that data, so we do not process it.' },
            { type: 'p', text: 'We are based in Taiwan, and we treat Taiwan’s Personal Data Protection Act as the baseline for this page. We have tried to tell you what the Act asks a collector to tell you: [who we are](#who), why we collect data and what kinds ([analytics](#analytics) and [what we never collect](#never)), [how long we keep it](#retention), [who receives it](#third-parties), [what rights you have and how to use them](#rights), and that declining affects nothing in the app. If you live in the EU, the UK, Japan, or elsewhere, your local law may add rights. We apply the rights in this page to everyone, wherever they live. This page does not claim any certification or formal compliance status.' },
          ],
        },
        {
          id: 'retention', title: 'How long we keep data',
          blocks: [
            { type: 'p', text: '[[These periods are proposals. The project owner must confirm them before this page is relied on.]]' },
            { type: 'table', caption: 'Retention periods', head: ['Data', 'How long'], rows: [
              ['Analytics events and the installation profile in PostHog', '[[12 months from the event date, then deleted]]'],
              ['Aggregate reports that no longer identify an installation, such as totals by month or by school', 'May be kept longer'],
              ['A confirmed newsletter subscription (address and consent record)', '[[Until you unsubscribe. Then the address is removed within 30 days, keeping only what is needed to honor your opt-out.]]'],
              ['A newsletter sign-up you never confirmed', '[[7 days]]'],
              ['Data on your device', 'Until you delete it, with Delete all data or by removing the files'],
              ['Data held by AI providers, your school, GitHub, and the other services in [AI providers, your school, and other services](#third-parties)', 'Set by those parties'],
            ] },
          ],
        },
        {
          id: 'rights', title: 'Your rights and choices',
          blocks: [
            { type: 'h3', text: 'In the app' },
            { type: 'p', text: 'Turn analytics off in Settings > Privacy, unsubscribe from any update email, inspect the session’s network requests, export a portable backup, and delete all local data. None of these needs us.' },
            { type: 'h3', text: 'Data we hold' },
            { type: 'p', text: 'For analytics and newsletter data, you can ask us to:' },
            { type: 'list', items: [
              'tell you whether we hold data about your installation or address, and give you a copy;',
              'correct data that is wrong;',
              'delete it;',
              'stop collecting, processing, or using it, and honor your withdrawal of consent;',
              'where the law gives you the right, restrict it, object to it, or provide it in a portable format.',
            ] },
            { type: 'p', text: 'To find your events we need your installation ID, because analytics holds no name or email. [[The app should display this ID in Settings > Privacy. The project owner must confirm that it does.]] We may ask for a step inside the app that shows the ID belongs to you before we share or delete anything. We aim to answer within [[30 days]].' },
            { type: 'p', text: '**Resetting does not delete.** Resetting or losing the installation ID on your computer does not delete events already sent under it. They remain under the old ID until deleted. To have them deleted, send us the old ID before you reset it.' },
            { type: 'p', text: 'You may also complain to the data protection authority where you live. See [Contact](#contact) for how to reach us.' },
          ],
        },
        {
          id: 'children', title: 'Students, children, and schools',
          blocks: [
            { type: 'p', text: 'VStudy Pro is for students, and some students are minors. The analytics and newsletter choices rely on consent. If you are younger than the age at which you can give that consent yourself where you live, ask a parent or guardian to decide for you. The app works fully without either. We do not knowingly keep analytics or newsletter data from a child without the consent that the law requires, and we will delete it if we learn of it.' },
            { type: 'p', text: 'VStudy Pro is not provided by, or affiliated with, any school, including the schools in its directory. We do not share analytics from individual installations with schools, and school-level reports leave out very small groups.' },
          ],
        },
        {
          id: 'transfers', title: 'International transfers',
          blocks: [
            { type: 'p', text: 'If you opt in to analytics, your events are sent to PostHog’s US cloud region, so they are processed and stored in the United States, where data protection rules may differ from those where you live. Resend, AI providers, and schools may also process data in other countries. If you would rather keep your data where you are, leave analytics and the newsletter off. The app’s local features need neither.' },
          ],
        },
        {
          id: 'security', title: 'Security',
          blocks: [
            { type: 'p', text: 'The app is designed to send only events and fields from a fixed allow-list, so anything unexpected, such as text content, is rejected before sending. Analytics and newsletter data are protected by the account security of the few people who maintain VStudy Pro, and only they can reach it. Saved credentials are encrypted on your device. See [the security model](@security) in the repository for how the app protects itself.' },
            { type: 'p', text: 'No system is perfectly secure. If a breach of analytics or newsletter data puts you at risk, we will tell the people affected as the law requires.' },
          ],
        },
        {
          id: 'changes', title: 'Changes to this policy',
          blocks: [
            { type: 'p', text: 'When we change this policy we update this page and its date. Earlier versions remain in the repository’s history. If a change would collect a new kind of data, we will ask for your consent again instead of relying on your earlier choice. [[The app needs a consent version to do this. The project owner must confirm that it will.]]' },
          ],
        },
        {
          id: 'contact', title: 'Contact',
          blocks: [
            { type: 'p', text: 'For a privacy question or request, write to {{email}}.' },
            { type: 'p', text: 'You can also open an issue in [the repository’s issue tracker](@issues) and ask for a private way to continue. Issues are public, so do not post your installation ID, email address, or any documents there.' },
          ],
        },
      ],
    },
    terms: {
      title: 'Terms of Service',
      description: 'The rules for using VStudy Pro: what you may do with the app, what AI can and cannot be trusted for, and where responsibility sits.',
      lead: 'These terms are meant to be read. They cover the app and this website. For how data is handled, read the [Privacy Policy](@privacy).',
      sections: [
        {
          id: 'acceptance', title: 'Accepting these terms',
          blocks: [
            { type: 'p', text: 'By downloading, installing, or using VStudy Pro, or by using this website, you agree to these terms. If you do not agree, do not use them. You must be old enough to enter an agreement where you live, or have the permission of a parent or guardian. If you use VStudy Pro for an organization, you confirm that you may agree for it.' },
          ],
        },
        {
          id: 'what-it-is', title: 'What VStudy Pro is',
          blocks: [
            { type: 'p', text: 'VStudy Pro is a desktop workspace for reading documents, keeping Moodle coursework together, and planning study. It runs on your computer, with no VStudy account. AI features and school connections work through services you choose and are separate from us. VStudy Pro is a study aid. It is not a replacement for your teachers, your textbooks, or your own judgment.' },
          ],
        },
        {
          id: 'license', title: 'License and source code',
          blocks: [
            { type: 'p', text: 'The VStudy Pro source code is public on GitHub. At the time of writing, the repository has no license file, so it is not published under an open-source license. A public repository does not by itself let you copy, modify, or redistribute the code, beyond what GitHub’s own terms allow for viewing and forking public repositories and what the law permits.' },
            { type: 'p', text: 'We give you a personal, non-exclusive, non-transferable, revocable permission to download, install, and use official VStudy Pro builds on your own devices for your own study, free of charge. [[The project owner must confirm this permission while the repository has no license file.]]' },
            { type: 'p', text: 'VStudy Pro contains open-source and other third-party components. Their own licenses continue to apply to them, and these terms do not change that. These terms give you no right to use the VStudy Pro name or logo, except to refer to the app accurately.' },
          ],
        },
        {
          id: 'your-content', title: 'Your content',
          blocks: [
            { type: 'p', text: 'Your documents, notes, questions, plans, and conversations belong to you. We claim no ownership of them and no license to them. They stay on your device and we do not receive them.' },
            { type: 'p', text: 'You are responsible for having the right to import what you import, including copyright, your school’s rules for course materials, and other people’s personal data. When you send content to an AI provider or your school, your agreement with them decides what they may do with it.' },
          ],
        },
        {
          id: 'acceptable-use', title: 'Acceptable use',
          blocks: [
            { type: 'p', text: 'Use VStudy Pro lawfully and in line with your school’s rules. In particular, do not:' },
            { type: 'list', items: [
              'use it to cheat, or to break your school’s academic integrity rules;',
              'connect an account that is not yours, or use sign-in details you are not entitled to use;',
              'bypass your school’s access controls, security measures, or usage limits, or overload any school or provider system;',
              'use the AI or agent features to produce unlawful or harmful content, or to harass anyone;',
              'send false data to, tamper with, or try to reach other people’s data through the analytics or newsletter services;',
              'distribute modified builds as if we made them.',
            ] },
          ],
        },
        {
          id: 'ai', title: 'AI features and their limits',
          blocks: [
            { type: 'p', text: 'AI is optional. VStudy Pro includes no AI model and no AI subscription. You connect a provider of your choice.' },
            { type: 'list', items: [
              '**AI can be wrong.** Answers may be incorrect, incomplete, out of date, or invented, including citations and quotations. A citation shown next to an answer does not prove that the source says what the answer claims. Check the source.',
              '**Verify what matters.** Confirm deadlines, grades, dates, formulas, and calculations against your school’s own pages and your course materials.',
              '**A study aid, not advice.** Nothing the app or an AI produces is legal, medical, financial, psychological, or professional advice.',
              '**You decide.** The app proposes study plans, tasks, and reminders, and you approve them. You are responsible for what you approve, save, and submit.',
              '**Academic integrity is yours.** You are responsible for knowing whether and how AI may be used in each course, and for disclosing its use where required. We make no promise that using VStudy Pro is allowed by your school, and we are not responsible for academic consequences.',
            ] },
          ],
        },
        {
          id: 'providers-schools', title: 'AI providers and schools',
          blocks: [
            { type: 'p', text: 'VStudy Pro works with services run by other parties. Your relationship with each of them is separate from these terms.' },
            { type: 'list', items: [
              '**AI providers.** Your accounts, keys, plans, fees, limits, and the provider’s terms are between you and the provider. We are not a party to them, we do not resell AI, and we are not responsible for charges. Token counts and cost figures in the app are estimates and may differ from the provider’s bill.',
              '**Command-line AI tools.** Claude Code, Codex, and Antigravity are separate software with their own terms. You decide whether to install and allow them.',
              '**Your school.** Use only your own school account, and follow your school’s rules for its services. Schools can restrict or block third-party apps, change their services, or suspend access. A school’s presence in the app’s directory does not mean it supports or endorses VStudy Pro.',
              '**Course material.** Your school may have rules about saving course materials or sending them to AI providers. Check them before you use those features. You are responsible for how you use material from your courses.',
              '**Change and failure.** Third-party services can change or stop working, and VStudy Pro may stop working with them.',
            ] },
          ],
        },
        {
          id: 'installing', title: 'Installing, updating, and your data',
          blocks: [
            { type: 'p', text: 'The Mac app is signed with an Apple Developer ID and notarized by Apple. The Windows installer is unsigned, so SmartScreen may warn on first run. Check the download against the published checksums and follow the installation guide before you accept any exception. Updates are manual for now.' },
            { type: 'p', text: 'We do not promise any release schedule, support, or availability, and features may change or be removed. The data on your device is your responsibility, so make backups and use disk encryption.' },
          ],
        },
        {
          id: 'warranty', title: 'No warranty',
          blocks: [
            { type: 'p', text: 'To the extent the law allows, VStudy Pro and this website are provided “as is” and “as available”, without warranties of any kind, express or implied. That includes any warranty of merchantability, fitness for a particular purpose, accuracy, and non-infringement, and any promise that the app will be error-free, secure, uninterrupted, or compatible with your school’s systems. Data can be lost, and AI output can be wrong.' },
          ],
        },
        {
          id: 'liability', title: 'Limitation of liability',
          blocks: [
            { type: 'p', text: 'To the extent the law allows, we are not liable for indirect, incidental, special, or consequential damages, or for loss of data, grades, academic results, or opportunities, arising from your use of VStudy Pro. We are not liable for what AI providers, schools, GitHub, or other third parties do. Our total liability for any claim relating to VStudy Pro is limited to what you paid us for it, which at the time of writing is nothing.' },
            { type: 'p', text: 'Nothing in these terms limits liability that the law does not allow to be limited, such as liability for intentional misconduct or gross negligence, or any consumer rights you have under the law where you live.' },
          ],
        },
        {
          id: 'termination', title: 'Ending your use',
          blocks: [
            { type: 'p', text: 'You can stop at any time. Uninstall the app, delete its data with Delete all data in Settings > Privacy, and unsubscribe from any update email.' },
            { type: 'p', text: 'We may stop distributing VStudy Pro or any related service, and we may end your permission to use it if you seriously or repeatedly break these terms or the law requires it. An installed copy keeps running on your device, but if your permission ends you must stop using it. The sections on your content, warranty, liability, and governing law continue to apply afterward.' },
          ],
        },
        {
          id: 'changes', title: 'Changes to these terms',
          blocks: [
            { type: 'p', text: 'We may update these terms. We will change this page and its date, and earlier versions stay in the repository’s history. If you keep using VStudy Pro after a change, you accept the new terms. If you do not agree, stop using it.' },
          ],
        },
        {
          id: 'governing-law', title: 'Governing law and general terms',
          blocks: [
            { type: 'p', text: 'These terms are governed by {{law}}. This does not take away rights you have under mandatory consumer-protection law where you live.' },
            { type: 'p', text: 'These terms and the [Privacy Policy](@privacy) are our whole agreement with you about VStudy Pro. If part of them cannot be enforced, the rest still applies. If we do not enforce a term at once, we have not given it up.' },
          ],
        },
        {
          id: 'contact', title: 'Contact',
          blocks: [
            { type: 'p', text: 'For questions about these terms, write to {{email}}, or open an issue in [the repository’s issue tracker](@issues). Issues are public, so do not post personal data there.' },
          ],
        },
      ],
    },
  },
};
