# Welcome experience: "What is VStudy Pro?"

Status: design spec for a builder. Author: design sub-agent. Scope: one new in-app view plus the small hooks that open it. Nothing here is implemented yet.

A new user reads this page right after first-run onboarding. They can reopen it from Home and from Settings as **What is VStudy Pro?**. In under 30 seconds it should answer three questions: **what the app is for**, **what it does**, and **who it is for**. It uses the visual language that already exists (calm, monochrome ink on neutral surfaces, concentric radii 6/10/14/20, translucent card material with hairlines). It adds a small set of motion moments that a reader can ignore or turn off.

Sources read: `docs/PRODUCT_DESIGN_V2.md` (sections 3, 5, 8, 10), `README.md`, `docs/i18n-glossary.md`, `src/renderer/onboarding/**`, `src/renderer/home/**`, `src/renderer/motion/**`, `src/renderer/tokens.css`, `src/renderer/shell/index.tsx`, `src/main/services/documents.ts`, `src/main/prompt/**`, `resources/samples/*.md`, the shipped locale catalogs, and the screenshots in `/tmp/vstudy-home/` and `/tmp/vstudy-library/`. All paths below are relative to `apps/desktop/` unless they start with `docs/`.

## 0. What is fact and what is inferred

**Verified in the code (safe to claim):**
- Import formats come from `documentFormats` in `src/main/services/documents.ts`: `md, txt, pdf, docx, pptx, xlsx, html/htm, csv`. That is **8 distinct file types** (html and htm share one MIME type). The cap is 50 MB per file (`MAX_SOURCE_BYTES`). Legacy `.doc/.xls/.ppt` are not accepted.
- PDFs go through our own `pdf_md` parser (pdfplumber based) first, with MarkItDown as an automatic fallback. Other formats use MarkItDown. Tables in PDFs need a ruled grid. There is no OCR: a file with no text layer reports "OCR not supported yet". The original bytes are kept next to `content.md`.
- Chat sits beside the reader. `settings.chatSide` is `left | right`, and there is a "Swap chat side" toolbar button.
- Grounding (`src/main/prompt/index.ts`): with a selection, the prompt carries the selected text (up to 16k characters) plus earlier selections. Without a selection, it carries the document outline and the first 12k characters. "Use this section" exists. Citations come from a catalog of real section and page offsets (`citations.ts`). The model can only cite IDs from that catalog, and `highlightCitation` scrolls the reader to the cited spot and flashes it.
- There are **6 provider kinds** (`src/shared/domain.ts`, `providerName`): Claude CLI, Codex CLI, Antigravity CLI, Anthropic, OpenAI, OpenAI compatible. CLIs are signed in outside the app, and the app detects them. Keys are stored with Electron `safeStorage`, which on macOS encrypts with a key held in the Keychain. Section 6 of the design says CLIs are never given tools.
- The Library has folders, pins, smart views, filters, saved filters, and FTS search with CJK handling (`src/main/services/search.ts` references trigram and bigram indexing). Home shows continue reading, this month's tokens with an *estimated* cost, a 14-day sparkline, a budget meter, and a study streak.
- There are **3 interface languages**: English, 繁體中文, 日本語. Reply language is a separate setting ("Reply language" / 回覆語言 / 回答の言語).
- No telemetry code exists (grep finds none). PRODUCT_DESIGN_V2 §6 requires none.
- The first conversion installs the pinned MarkItDown environment and needs internet once.

**Inferred or designed by me (call out in review):**
- I could not fetch the visuals or motion of t3.codes or the Antigravity site. Only their section structure was available (from the brief). Every animation below is my own design, built from that structure and from our tokens. Nothing here claims to replicate their motion.
- I chose the sample document (`resources/samples/<locale>.md`) as the demo's content, so that the demo matches what "Try a sample document" really gives the user. The answer text in the demo is scripted, and the page says so.
- Section 1 adds a few new motion, easing and type tokens. They are proposals that need the lead's approval (PRODUCT_DESIGN_V2 says "deviations need evidence").
- Login commands for third-party CLIs (`codex login`, running `claude` or `agy` once) match those tools' current behavior as I know it. The README confirms only `agy`. See Open questions.

## 1. Reference study → our structure

| Reference pattern (from the digests) | What it does for the reader | Our version |
|---|---|---|
| t3.codes hero: one-line category claim + subhead + two CTAs | Names the job in one sentence | Hero: an audience eyebrow, a one-sentence promise, a subhead that names formats, grounding and local storage, a primary action and "See how it works" |
| t3.codes provider logo strip / "Bring your own sub" cards with the login command per provider | Shows that you can use what you already pay for, and how | "Bring your own model": a quiet name marquee (text only, no logos) plus 6 cards showing the real command or key step |
| t3.codes product mock built from page code (PR card) | Shows the product without screenshots that go stale | Live demo stage built from our tokens and our Markdown renderer, scripted |
| t3.codes "One button to…" feature block | One verb, one result | Value statements, each with one verb |
| Antigravity's three value statements (Agent-first / natural abstraction / 90%→100%) | Explains the stance, not the feature list | Three values: *readable*, *grounded*, *cited* |
| Antigravity role cards ("Built for developers…", "Watch case") | Lets readers find themselves | Four persona cards with a concrete situation, the job the app does, and the first feature to use |
| Two-audience CTA band, closing download block | A last clear action | Closing: "Start with one document" with Bring / Sample |
| Social-proof tweets, announcement bar, GitHub-star badge | Social proof | **Dropped.** We have no real testimonials or counts to show. The honesty rule wins. |

## 2. Narrative arc (the 30-second test)

The section headings alone must tell the story. A user who reads only the hero and the section headings gets: *what* (hero), *what it does* (values + demo), *who* (personas), *how to connect* (models), *why it is safe* (your data), *what to do now* (closing).

| # | id | Section | Reader's question it answers | Time to skim |
|---|---|---|---|---|
| 1 | `hero` | Hero | What is this? | 5 s |
| 2 | `values` | What it does: three value statements + three real facts | What does it actually do? | 7 s |
| 3 | `demo` | Live product demo | What does using it look like? | 8 s (one loop is about 11 s) |
| 4 | `who` | Who it's for: four persona cards | Is it for me? | 5 s |
| 5 | `models` | Bring your own model | Do I need a new subscription? | 3 s |
| 6 | `data` | Your library and your data, plus a "Good to know" line | Where do my files go? What doesn't it do? | 3 s |
| 7 | `start` | Closing CTA | What do I do now? | 1 s |

## 3. Placement, entry points and page chrome

- **Route.** Add `'welcome'` to `View` in `src/renderer/shell/index.tsx`. `app.tsx` renders `<WelcomeView/>`, loaded with `React.lazy` so it adds nothing to cold start. The library sidebar stays visible. Welcome fills the main pane like Home.
- **After onboarding.** When `Onboarding.finish()` succeeds and the new setting `welcomeSeen` (boolean, default `false`, added to `settingsSchema`) is false, navigate to `welcome` and set `welcomeSeen: true`. Do not show Welcome if the user closed onboarding with Escape (its `onCancel` path); they asked to get out.
- **From Home.** Add a ghost button under the greeting prompt in `.home-greeting`: icon `Info` 14 px, label `welcome:entry`. Keep it visible in every state: tertiary weight, `--muted` ink.
- **From Settings.** In `src/renderer/providers.tsx`, next to the existing `onboarding:replay` button, add a button with `welcome:entry` that closes Settings and navigates to `welcome`.
- **Sticky page header (inside Welcome),** height `--topbar-height`. On the left, the title `welcome:page_title`. On the right, the toggle "Pause animations" / "Play animations" (`welcome:motion_pause` / `welcome:motion_play`; it pauses demo, marquee and hero float; state kept in `localStorage['vstudy-welcome-motion']` inside try/catch), then "Close" (`welcome:close`), which goes back to the previous route or to Home if there is none. The header's background is `--material-sheet` with `backdrop-filter: blur(20px) saturate(1.15)` and a bottom hairline that appears only after scrolling 8 px. The hairline is driven by a scroll-driven `opacity` animation, with a `data-scrolled` attribute as fallback.
- **Scroller.** `.welcome` is its own scroll container (`height:100%; overflow-y:auto; scroll-timeline: --welcome block; container-type: inline-size; scroll-behavior: smooth`, and `auto` under reduced motion). Every layout rule below uses **container** queries on `.welcome`, not viewport media queries, because the sidebar takes part of the window.
- **Breakpoints (container inline size):** `S < 560`, `M 560–859`, `L ≥ 860`. Content column `max-inline-size: 1040px; margin-inline: auto; padding-inline: var(--space-6)` (S: `var(--space-4)`).
- **Section rhythm:** `padding-block: calc(var(--space-8) * 3)` at L, `calc(var(--space-8) * 2)` at M and S. Sections are separated by whitespace only. There are no divider lines between them.
- **Progress dots:** see §5.8.

### New tokens (proposal, add to `tokens.css`)

```css
:root {
  --motion-story: 600ms;   /* section reveals, demo moves */
  --motion-hero: 800ms;    /* hero card entrance, upper bound of hero choreography */
  --ease-out-soft: cubic-bezier(0.22, 1, 0.36, 1);   /* entrances */
  --ease-in-out-soft: cubic-bezier(0.65, 0, 0.35, 1); /* position moves, scrolls, morphs */
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);       /* hover/state changes */
  --ease-exit: cubic-bezier(0.4, 0, 1, 1);           /* fades out */
  --type-hero: clamp(28px, 2.2rem + 1.2cqi, 40px);   /* hero h1 only; --type-display stays 28 */
  --spotlight-size: 260px;
  --spotlight-tint: color-mix(in oklab, var(--ink) 5%, transparent);
  --edge-lit: color-mix(in oklab, var(--ink) 32%, transparent);
}
```

No new colors. The page stays monochrome like the rest of the app (see the screenshots): ink on surface, and `--active` for highlights. The folder accent colors are not used here.

### Shared surface recipes

- **Glass card** (`.w-glass`): `background: var(--material-card); border: 1px solid var(--hairline); border-radius: var(--r-md); box-shadow: var(--elevation-raised);`. `backdrop-filter: blur(20px) saturate(1.15)` is applied **only** where something sits behind the card (the hero stack layers and the sticky header). Over the flat page background, blur shows nothing and costs GPU time, so every other card uses the same translucent fill without blur.
- **Large stage** (demo frame, hero stack container): `border-radius: var(--r-lg)` (20) with `padding: var(--inset)` (6). Its inner panels use `--r-inner` (14). Chips inside panels use `--r-xs` (6), and buttons use `--r-sm` (10). This follows the concentric rule.
- **Reduced transparency** (`@media (prefers-reduced-transparency: reduce)` and `html[data-reduced-transparency=true]`, both already set up in `tokens.css`): material becomes `--surface`, there is no blur, the spotlight is off, and the lit edge becomes a static `1px solid var(--line)`.

## 4. Copy (final; catalog `welcome` namespace)

Writing rules (from `docs/i18n-glossary.md`): zh-Hant uses Taiwan vocabulary and full-width punctuation. ja uses です・ます in sentences and short conventional labels on buttons. Keep VStudy Pro, provider names, Markdown, CSV, API and file extensions as they are. Each locale was written on its own, not translated line by line. Native-speaker review is still required before release.

Glossary terms used: 文件 / ドキュメント (document), 文件庫 / ライブラリ (Library), 資料夾 / フォルダ, 釘選 / ピン留め, 對話 / 会話, 模型 / モデル, 用量 / 使用量, 服務供應商 / プロバイダー, API 金鑰 / API キー, 匯入 / インポート, 選取內容 / 選択した箇所.

Where an existing key already says the same thing, **reuse it** and do not add a duplicate: `home:upload`, `home:continue`, `onboarding:sample`, `common:use_this_section`, `common:swap_chat_side`, `common:reply_language`, `common:openai_compatible`.

### 4.0 Page chrome

| key | en | zh-Hant | ja |
|---|---|---|---|
| `entry` | What is VStudy Pro? | VStudy Pro 是什麼？ | VStudy Pro とは？ |
| `page_title` | What is VStudy Pro? | VStudy Pro 是什麼？ | VStudy Pro とは？ |
| `region_label` (aria-label of `<main>`) | Introduction to VStudy Pro | VStudy Pro 介紹 | VStudy Pro の紹介 |
| `close` | Close | 關閉 | 閉じる |
| `motion_pause` | Pause animations | 暫停動畫 | アニメーションを停止 |
| `motion_play` | Play animations | 播放動畫 | アニメーションを再生 |
| `sections_label` (nav aria-label) | Sections | 段落導覽 | セクション |
| `go_to_section` (dot aria-label) | Go to {{section}} | 前往「{{section}}」 | 「{{section}}」へ移動 |
| `nav_hero` | Overview | 概覽 | 概要 |
| `nav_values` | What it does | 功能 | できること |
| `nav_demo` | Demo | 示範 | デモ |
| `nav_who` | Who it's for | 適合誰 | 対象 |
| `nav_models` | Models | 模型 | モデル |
| `nav_data` | Your data | 你的資料 | データ |
| `nav_start` | Start | 開始 | はじめる |
| `example_badge` | Example | 範例 | 例 |

### 4.1 Hero

| key | en | zh-Hant | ja |
|---|---|---|---|
| `hero_eyebrow` | For people who read to understand | 給想真正讀懂的人 | 理解するために読む人へ |
| `hero_title` | Understand what you read, one passage at a time. | 一段一段，讀懂你手上的資料。 | 一節ずつ、確かに理解する。 |
| `hero_body` | Bring your PDFs, slides, spreadsheets and Word files. VStudy Pro turns them into clean, readable text, and answers questions about the exact passage you select, with a citation back to the source. Your documents stay on your Mac. | 把 PDF、簡報、試算表和 Word 檔帶進來，VStudy Pro 會把它們轉成乾淨好讀的文字。選取任何一段就能提問，回答會附上出處，帶你回到原文。文件始終留在你的 Mac 上。 | PDF やスライド、表計算、Word のファイルを取り込むと、VStudy Pro が読みやすいテキストに変換します。選択した箇所について質問すると、出典付きで回答し、原文の該当箇所へすぐに戻れます。ドキュメントはお使いの Mac の中に保存されます。 |
| primary CTA (empty library) | reuse `home:upload` → "Bring a document" | 帶一份文件來 | ドキュメントを追加 |
| primary CTA (library has documents) | reuse `home:continue` → "Continue reading" | 繼續閱讀 | 続きを読む |
| `hero_secondary` | See how it works | 看看怎麼運作 | 使い方を見る |
| `hero_visual_alt` (role=img label of the card stack) | Illustration: a document in the Library, a highlighted passage in the reader, and an answer with a citation chip. | 示意圖：文件庫中的一份文件、閱讀區裡被標示的一段文字，以及附有引用標籤的回答。 | イラスト：ライブラリのドキュメント、本文でハイライトされた箇所、出典チップ付きの回答。 |

Primary CTA behavior: with an empty library, call the same import routine `UploadCard`'s "Choose a file" button uses. On success, navigate to `workspace` with the new document. With documents in the library, navigate to `workspace` with `recentDocuments[0]` from `dashboard:get`. The secondary CTA scrolls to `#demo` and focuses its heading.

### 4.2 What it does

| key | en | zh-Hant | ja |
|---|---|---|---|
| `values_title` | Read, ask, and check the source | 讀、問，再回到出處確認 | 読んで、質問して、出典で確かめる |
| `values_body` | Three things VStudy Pro does, and does carefully. | VStudy Pro 專心做好的三件事。 | VStudy Pro が丁寧に取り組んでいる 3 つのことです。 |
| `value_1_title` | Any document, made readable | 什麼文件都能好好讀 | どんな資料も、読みやすく |
| `value_1_body` | PDF, Word, Excel, PowerPoint, HTML, CSV, Markdown and plain text become clean Markdown. PDFs go through our own parser first, with MarkItDown as a fallback. Your original file is kept alongside. | PDF、Word、Excel、PowerPoint、HTML、CSV、Markdown 和純文字，都會轉成乾淨的 Markdown。PDF 先交給我們自己的解析器處理，再由 MarkItDown 補位。原始檔案也會一起保留。 | PDF、Word、Excel、PowerPoint、HTML、CSV、Markdown、テキストを、整った Markdown に変換します。PDF はまず独自のパーサーで処理し、必要に応じて MarkItDown を使います。元のファイルもそのまま保存されます。 |
| `value_2_title` | Ask about exactly what you selected | 問的就是你選的那一段 | 選んだ箇所について、そのまま質問 |
| `value_2_body` | Select a passage, or use a whole section, and ask in your own words. The answer is grounded in that text, and it says so when the document doesn't support an answer. | 選取一段文字，或直接使用整個章節，用自己的話提問。回答以那段內容為依據；文件裡找不到根據時，也會直接說明。 | 文章の一部を選択するか、セクション全体を使って、自分の言葉で質問できます。回答はその内容に基づき、ドキュメントに根拠がない場合はそう伝えます。 |
| `value_3_title` | Every answer shows its source | 每個回答都有出處 | 回答には、いつも出典を |
| `value_3_body` | Citations name the section or page they come from. Click one and the reader jumps there, so you can check it yourself. | 引用會標出所在的章節或頁碼。點一下，閱讀區就跳到原文，讓你自己確認。 | 出典には章やページが示されます。クリックすると本文の該当箇所に移動するので、ご自身で確かめられます。 |
| `fact_formats` (ICU plural, `{{count}}`) | {{count}} file types | {{count}} 種檔案類型 | {{count}} 種類のファイル形式 |
| `fact_providers` | {{count}} ways to connect a model | {{count}} 種模型連接方式 | モデルの接続方法 {{count}} 種類 |
| `fact_languages` | {{count}} interface languages | {{count}} 種介面語言 | 表示言語 {{count}} 種類 |
| `facts_label` (aria-label of the facts list) | At a glance | 一眼看懂 | ひと目でわかる |

The numbers are not hard-coded. See §7.4 (`facts.ts` plus a test against the main-process sources).

### 4.3 Live demo

| key | en | zh-Hant | ja |
|---|---|---|---|
| `demo_title` | Select, ask, follow the citation | 選取、提問、跟著出處回到原文 | 選んで、質問して、出典をたどる |
| `demo_body` | A scripted example using the sample document. No model is called. | 以範例文件示範的腳本動畫，不會呼叫任何模型。 | サンプルドキュメントを使ったデモです。モデルは呼び出しません。 |
| `demo_step_1` | Select a passage | 選取一段內容 | 箇所を選択 |
| `demo_step_2` | Ask in your own words | 用自己的話提問 | 自分の言葉で質問 |
| `demo_step_3` | Get an answer grounded in that text | 得到以那段內容為依據的回答 | その内容に基づいた回答 |
| `demo_step_4` | Follow the citation back to the source | 點引用，回到原文 | 出典から原文へ戻る |
| `demo_steps_label` | How it works, in four steps | 四個步驟看懂怎麼用 | 4 つのステップ |
| `demo_question` | Give me an everyday example. | 舉個生活中的例子。 | 身近な例を教えてください。 |
| `demo_answer` | Tonight, write down one question from today's lecture. Answer it from memory tomorrow, then again next week. The document also suggests asking which assumptions deserve a closer look. | 今晚把課堂上的一個問題寫下來，明天不看筆記試著回答，下週再答一次。文件也建議接著想想：哪些假設值得多看一眼。 | 今日の講義から問いを一つ書き留め、明日はノートを見ずに答えてみましょう。来週も、もう一度答えます。どの前提を詳しく見るべきか考えることも、ドキュメントで勧められています。 |
| `demo_citation` (chip; must equal the sample's `## ` heading) | Try it | 試試看 | 試してみましょう |
| `demo_model_chip` | Your model | 你的模型 | お使いのモデル |
| `demo_composer_placeholder` | reuse `common:ask_document_placeholder` | | |
| `demo_swap_hint` | Prefer the chat on the other side? Swap it from the toolbar. | 想把對話放在另一側？在工具列切換即可。 | 会話を反対側に置きたい場合は、ツールバーから切り替えられます。 |
| `demo_replay` | Replay | 重新播放 | もう一度再生 |

The demo reader shows the real sample Markdown for the active locale. Load `resources/samples/<locale>.md` through the existing sample path, or bundle a copy at build time; see Open questions. The selected passage is the sample's second paragraph (the "spaced practice" or 間隔練習 / 間隔を空けた練習 paragraph). The citation target is the `## Try it` / `## 試試看` / `## 試してみましょう` heading. A test asserts that `demo_citation` equals that heading in all three sample files.

### 4.4 Who it's for

| key | en | zh-Hant | ja |
|---|---|---|---|
| `who_title` | Made for people who read to learn | 為了讀懂而讀的人 | 学ぶために読む人のために |
| `who_body` | Four people, four kinds of documents, one way of working. | 四種人、四種文件，同一種讀法。 | 4 人の、4 種類の資料。読み方はひとつです。 |
| `who_first_label` | Starts with | 先從這裡開始 | 最初に使う機能 |

| key | en | zh-Hant | ja |
|---|---|---|---|
| `p1_role` | University student | 大學生 | 大学生 |
| `p1_situation` | Midterms next week: lecture PDFs, a long PowerPoint deck, and notes in Chinese, Japanese and English. | 下週期中考：一疊講義 PDF、一份很長的 PowerPoint，筆記裡中、英、日文都有。 | 来週は中間試験。講義の PDF と長いスライド、ノートは日本語・英語・中国語が混ざっています。 |
| `p1_job` | Turns slides and handouts into one readable page, and explains the slide you're stuck on in the language you think in. | 把投影片和講義轉成一頁好讀的文字，卡住的那張投影片，用你習慣思考的語言講給你聽。 | スライドや配布資料を読みやすい 1 ページにまとめ、つまずいたスライドを、考えやすい言語で説明します。 |
| `p1_first` | Select a slide's text and ask "Explain this simply." Set Reply language in Settings. | 選取投影片的文字，問「用簡單的話解釋」。在設定中指定回覆語言。 | スライドの文章を選択して「わかりやすく説明して」と質問。設定で回答の言語を選びます。 |
| `p2_role` | Researcher | 研究人員 | 研究者 |
| `p2_situation` | Working through a stack of papers for a literature review, and needing to check what a results table actually reports. | 正在為文獻回顧讀一疊論文，想確認某張結果表格到底寫了什麼。 | 文献レビューのために論文を読み進めながら、結果の表に何が書かれているかを確かめたい。 |
| `p2_job` | Reads each paper as clean text with its ruled tables kept as tables, and answers with section and page references you can click to verify. | 把每篇論文轉成乾淨的文字，有框線的表格保留為表格；回答附上章節與頁碼，點一下就能回到原文查證。 | 論文を読みやすいテキストに変換し、罫線のある表は表のまま残します。回答には章とページの出典が付き、クリックして原文で確認できます。 |
| `p2_first` | Citations that jump to the page, and one folder per project. | 能跳回原頁的引用，以及每個專案一個資料夾。 | ページへ移動できる出典と、プロジェクトごとのフォルダ。 |
| `p3_role` | Professional | 專業工作者 | ビジネスパーソン |
| `p3_situation` | Before Thursday's meeting: a supplier contract in Word, a quarterly report as a PDF, and the spreadsheet behind it. | 週四開會前要看完：Word 格式的供應商合約、PDF 季報，還有背後那份 Excel。 | 木曜の会議までに、Word の取引先契約書、PDF の四半期報告書、その元になった Excel に目を通す必要があります。 |
| `p3_job` | Ask what a clause or a figure means. The answer points to the section it came from, so you can check it yourself before you rely on it. | 問某個條款或數字是什麼意思，回答會指出它來自哪個章節，讓你在採用之前自己再確認一次。 | 条項や数値の意味を質問すると、根拠となる章を示して答えます。判断に使う前に、ご自身で確認できます。 |
| `p3_first` | "Use this section" to ask about a whole clause. Excel sheets read as tables. | 用「使用此章節」詢問整段條款；Excel 工作表會以表格呈現。 | 「このセクションを使う」で条項全体について質問。Excel のシートは表として読めます。 |
| `p4_role` | Language learner | 語言學習者 | 語学学習者 |
| `p4_situation` | Reading a bilingual article, one language per line, and wondering why a phrase is used the way it is. | 正在讀一篇中日對照的文章，想知道某個說法為什麼這樣用。 | 日本語と英語の対訳記事を読みながら、ある言い回しがなぜ使われているのかを知りたい。 |
| `p4_job` | Leaves the original text untouched and explains grammar, nuance and word choice in the language you pick for replies. | 原文一字不改，用你選擇的回覆語言解釋文法、語感和用字。 | 原文には手を加えず、文法やニュアンス、言葉の選び方を、選んだ言語で説明します。 |
| `p4_first` | Pick a Reply language, then select a single sentence and ask about it. | 先選好回覆語言，再選取一句話直接問。 | 回答の言語を選んでから、一文だけを選択して質問します。 |

Note: the zh-Hant `p4_situation` says 中日對照 and the ja one says 日英対訳 on purpose. Each persona is written for the reader's likely second language, not as a literal translation. The en one stays generic.

### 4.5 Bring your own model

| key | en | zh-Hant | ja |
|---|---|---|---|
| `models_title` | Bring your own model | 用你自己的模型 | お手持ちのモデルで |
| `models_body` | Use a subscription you already have through its command-line tool, or add your own API key. You can read and organise documents without connecting anything. | 透過命令列工具使用你已經訂閱的服務，或加入自己的 API 金鑰。不連接任何模型，也能閱讀與整理文件。 | すでに契約しているサービスをコマンドラインツール経由で使うか、ご自身の API キーを追加します。モデルを接続しなくても、ドキュメントの閲覧や整理はできます。 |
| `marquee_label` (aria-label; the marquee itself is aria-hidden) | Supported providers | 支援的服務供應商 | 対応プロバイダー |
| `via_cli` | Uses your existing sign-in | 沿用你現有的登入 | 既存のサインインを使用 |
| `via_key` | Your API key | 你的 API 金鑰 | ご自身の API キー |
| `via_compatible` | Base URL and API key | 服務網址與 API 金鑰 | ベース URL と API キー |
| `cmd_claude` (prefix text; command shown in `<code>`) | Run once in Terminal and sign in: | 在終端機執行一次並登入： | ターミナルで一度実行してサインイン： |
| `cmd_codex` | Sign in from Terminal: | 在終端機登入： | ターミナルでサインイン： |
| `cmd_agy` | Run once in Terminal and sign in: | 在終端機執行一次並登入： | ターミナルで一度実行してサインイン： |
| `key_anthropic` | Paste your key in Settings. | 在設定中貼上金鑰。 | 設定でキーを貼り付けます。 |
| `key_openai` | Paste your key in Settings. | 在設定中貼上金鑰。 | 設定でキーを貼り付けます。 |
| `key_compatible` | For services that offer an OpenAI-compatible endpoint. | 適用於提供 OpenAI 相容端點的服務。 | OpenAI 互換のエンドポイントを提供するサービス向けです。 |
| `models_note` | VStudy Pro checks which CLIs are signed in. API keys are encrypted with the macOS Keychain. CLI models get no tools: they see only the text VStudy Pro sends. | VStudy Pro 會自動偵測哪些 CLI 已登入。API 金鑰透過 macOS 鑰匙圈加密保存。CLI 模型不會取得任何工具權限，只看得到 VStudy Pro 傳送的文字。 | VStudy Pro はサインイン済みの CLI を自動で検出します。API キーは macOS のキーチェーンで暗号化して保存されます。CLI のモデルにはツールの権限を与えず、VStudy Pro が送るテキストだけを渡します。 |
| `models_cta` | Set up a model | 設定模型 | モデルを設定 |

Card titles use `providerName[id]` from `src/renderer/providers.tsx`, so they match Settings exactly: Claude CLI, Codex CLI, Antigravity CLI, Anthropic, OpenAI, and `common:openai_compatible`. Each CLI card has a one-line subtitle in the muted style: "Claude Code subscription", "ChatGPT / Codex subscription" (confirm, see Open questions), and "Antigravity account". These are product names and are not translated. Commands: `claude`, `codex login`, `agy`. `models_cta` opens Settings on the providers tab (`initialTab="providers"`).

### 4.6 Your library and your data

| key | en | zh-Hant | ja |
|---|---|---|---|
| `data_title` | Your library, on your Mac | 你的文件庫，就在你的 Mac 上 | ライブラリは、あなたの Mac の中に |
| `data_body` | Everything you import lives in a library on this Mac, organised the way you think. | 匯入的所有文件都存放在這台 Mac 的文件庫裡，用你習慣的方式整理。 | インポートしたものはすべて、この Mac のライブラリに保存され、考えやすい形で整理できます。 |
| `data_organise_title` | Organise | 整理 | 整理する |
| `data_organise_1` | Folders, pins and saved filters | 資料夾、釘選與已儲存的篩選條件 | フォルダ、ピン留め、保存したフィルター |
| `data_organise_2` | Search that finds Chinese and Japanese words, not just English | 搜尋也找得到中文和日文詞彙，不只英文 | 英語だけでなく、日本語や中国語の語句も見つかる検索 |
| `data_organise_3` | Filter by type, folder, tag, date or size | 依類型、資料夾、標籤、日期或大小篩選 | 種類、フォルダ、タグ、日付、サイズで絞り込み |
| `data_track_title` | Keep track | 掌握進度 | 記録を見る |
| `data_track_1` | Tokens and estimated cost for the month | 本月 token 用量與估計費用 | 今月のトークン数と推定コスト |
| `data_track_2` | A monthly budget, if you want one | 需要的話，可設定每月預算 | 必要に応じて月の予算を設定 |
| `data_track_3` | A study streak that counts reading, asking and importing | 閱讀、提問、匯入都算數的學習紀錄 | 読む・質問する・インポートするを数える学習の連続記録 |
| `data_private_title` | Stay private | 保有隱私 | プライバシーを守る |
| `data_private_1` | Documents and their originals are stored on this Mac | 文件與原始檔案都存放在這台 Mac 上 | ドキュメントと元のファイルは、この Mac に保存されます |
| `data_private_2` | API keys are encrypted with the macOS Keychain | API 金鑰透過 macOS 鑰匙圈加密 | API キーは macOS のキーチェーンで暗号化されます |
| `data_private_3` | No telemetry or analytics | 不收集遙測或分析資料 | テレメトリーや分析データは収集しません |
| `data_private_4` | When you ask, the relevant text and your question go only to the provider you chose | 提問時，相關內容與你的問題只會送到你選擇的服務供應商 | 質問するときは、関連する本文と質問内容が、選んだプロバイダーにだけ送信されます |
| `data_visual_alt` | Example Home cards: a study streak with seven days and a 14-day token sparkline. | 首頁卡片範例：七天的學習紀錄，以及 14 天的 token 用量走勢。 | ホームのカードの例：7 日間の学習記録と、14 日間のトークン使用量の推移。 |
| `good_to_know_label` | Good to know | 小提醒 | 補足 |
| `good_to_know` | VStudy Pro is a macOS app. It reads the text layer of PDFs and has no OCR yet, so scanned pages can't be read. Word, Excel and PowerPoint means .docx, .xlsx and .pptx, up to 50 MB per file. It doesn't sync between devices and isn't a note-taking app. The first conversion needs internet once to set up the converter. | VStudy Pro 是 macOS 應用程式。PDF 讀取的是文字層，目前還不支援 OCR，掃描的頁面無法讀取。Word、Excel、PowerPoint 指的是 .docx、.xlsx、.pptx，每個檔案上限 50 MB。不提供跨裝置同步，也不是筆記軟體。第一次轉換時需要連網一次，以安裝轉換工具。 | VStudy Pro は macOS 用のアプリです。PDF はテキストレイヤーを読み取るため、OCR にはまだ対応しておらず、スキャンしたページは読めません。Word・Excel・PowerPoint は .docx・.xlsx・.pptx 形式で、1 ファイル 50 MB までです。デバイス間の同期やノート機能はありません。初回の変換時のみ、変換ツールの準備のためにインターネット接続が必要です。 |

### 4.7 Closing

| key | en | zh-Hant | ja |
|---|---|---|---|
| `start_title` | Start with one document. | 從一份文件開始。 | まずは、ドキュメントを一つ。 |
| `start_body` | Pick something you actually need to understand this week. | 挑一份這週真的需要讀懂的資料。 | 今週しっかり理解したい資料を選んでみてください。 |
| primary | reuse `home:upload` | 帶一份文件來 | ドキュメントを追加 |
| secondary | reuse `onboarding:sample` | 試讀範例文件 | サンプルを試す |
| `start_home` (text link) | Go to Home | 前往首頁 | ホームへ |

The sample CTA calls `documents:importSample` with the active language, exactly as onboarding step 3 does. That IPC returns the `Document` (`src/shared/ipc.ts`), so navigate to `workspace` with its `id`.

## 5. Storyboards and motion

Conventions: **trigger** = `load` (on first paint of the view), `in-view` (IntersectionObserver, threshold 0.2, `rootMargin: 0px 0px -10% 0px`, root `.welcome`, fires **once**), `hover`, or `scroll` (scroll-linked via `animation-timeline`). **Final-state-first rule:** every element's default CSS is its final, visible state. Animations only ever add a `from` keyframe. Then `animation: none`, a missing feature, or a failed script all leave the page complete and readable, and screenshots under reduced motion show the finished page.

Global reduced motion (`prefers-reduced-motion: reduce`, already partly handled in `tokens.css`): Welcome adds `.welcome * { animation: none !important; transition: none !important; }`. Parallax, float, marquee, demo autoplay, count-up and view transitions are all off. Every section shows its final state. This is needed because `tokens.css` sets `animation-duration: 0ms`, which does not reliably resolve scroll-driven animations to their end state.

The "Pause animations" toggle sets `data-motion="paused"` on `.welcome`. CSS then sets `animation-play-state: paused` on the float, marquee and demo descendants, and the demo player stops its timers. Reveals that already ran are not affected.

### 5.1 Hero

**Layout.** L: grid `grid-template-columns: 7fr 5fr; gap: var(--space-8); align-items: center; min-block-size: min(640px, 82cqb)`. Do not use `100vh`, so the next section's heading always peeks above the fold. That peek is the scroll cue, so no "scroll down" arrow is needed. M and S: one column. The visual follows the text, `max-inline-size: 420px; margin-inline: auto`.

Text column, top to bottom: eyebrow (`--type-sm`, `--muted`, uppercase only in en, `letter-spacing: .04em` in en only), h1 (`--type-hero`, weight 600, `text-wrap: balance`, `margin-block: var(--space-3) var(--space-4)`), body (`--type-md`, `line-height: 1.7`, `--muted`, `max-inline-size: 34em` in en and 30em in CJK), CTA row (`gap: var(--space-3)`, `margin-top: var(--space-6)`). The primary button is `button.primary` at min-height 36 and the secondary is `button.secondary`. Both use radius `--r-sm`.

Visual: `.hero-stack`, a relative box with `aspect-ratio: 5 / 4`, holding three absolutely positioned glass layers. All three use `backdrop-filter`, because they overlap each other:
1. *Back*: a Library card (radius `--r-md`). It has a file icon, the sample title (`# Small questions, deeper reading` / `小問題，讀出新理解` / `小さな疑問から、深い理解へ`), and the chips `PDF → Markdown` and `pdf_md`. Position `inset-block-start: 0; inset-inline-start: 0; inline-size: 72%`.
2. *Middle*: a reader excerpt (radius `--r-md`). It shows two lines of the sample's second paragraph, with one phrase wrapped in `<mark>` using the app's highlight style (`--active` background). Position `top: 26%; left: 14%; width: 76%`.
3. *Front*: a chat bubble (radius `--r-md`). It has the first sentence of `demo_answer` and a citation chip (`--r-xs`, `Quote` icon 12 px, text `demo_citation`). Position `bottom: 0; right: 0; width: 64%`.

The stack carries `role="img"` with `aria-label=hero_visual_alt`, and its children are `aria-hidden`. It also carries the `example_badge` in the top-right corner (`--type-xs`, `--muted`).

**Motion.**

| What | Trigger | Keyframes (from → final) | Duration | Easing | Delay / stagger |
|---|---|---|---|---|---|
| Eyebrow | load | opacity 0 → 1 | 320 ms | `--ease-out-soft` | 0 |
| H1 groups (see below) | load | opacity 0, `filter: blur(6px)`, `translateY(.2em)` → none | 480 ms each | `--ease-out-soft` | starts 80 ms, stagger 40 ms, max 8 groups ⇒ ends ≤ 840 ms |
| Body | load | opacity 0, `translateY(8px)` → none | 320 ms | `--ease-out-soft` | 400 ms |
| CTA row | load | opacity 0 → 1 | 200 ms | `--ease-out-soft` | 560 ms |
| Stack layers back/mid/front | load | opacity 0, `translateY(16px) scale(.98)` → none | 800 ms | `--ease-out-soft` | 160 / 240 / 320 ms |
| Citation chip on front layer | load | `scale(.9)` opacity 0 → none | 200 ms | `--ease-standard` | 900 ms |
| Depth parallax | scroll (`animation-timeline: view(); animation-range: exit 0% exit 100%`) | back `translateY(0)` → `-8px`; mid `0` → `-16px`; front `0` → `-28px` | scroll-linked | `linear` | none |
| Idle float (front layer only) | after the entrance ends (`animationend`) | `translateY(0)` ↔ `translateY(-4px)` | 6000 ms, `alternate`, infinite | `--ease-in-out-soft` | paused when the hero is out of view, the window is hidden, or `data-motion=paused` |
| Cursor spotlight + lit edge | hover over `.hero-stack` | see §5.9 | per pointer frame | none | none |

*Word-by-word reveal.* `<SplitReveal text>` renders `<h1>`, containing `<span class="motion-sr">{text}</span>` followed by `<span aria-hidden="true">{groups}</span>`. Each group is `<span class="w-word" style="--i:n">`, displayed as `inline-block`. Group the text with `new Intl.Segmenter(lang, { granularity: 'word' })`. Attach punctuation and whitespace to the previous segment. Then merge neighbors evenly until there are ≤ 8 groups, so CJK headlines don't turn into 15 tiny characters. Never put a line break inside a group. Animation: `animation: w-word-in 480ms var(--ease-out-soft) both; animation-delay: calc(80ms + var(--i) * 40ms)`. `will-change: opacity, transform, filter` is set by the class `.is-revealing` and removed on the last group's `animationend`.

The `filter` animation breaks the "transform and opacity only" rule. It is a one-shot, under 1 s, on at most 8 small boxes, and it runs once per view mount. I accept that cost on purpose. If frame-time tests (§8) show long frames, drop the blur and keep the rise.

*Choreography summary.* Text settles by about 840 ms and the cards by about 1120 ms. The CTAs work from the first frame (opacity does not block clicks). No element moves after the entrance except the 4 px float, which can be paused.

**Reduced motion.** Everything static and final. No parallax, no float. The spotlight shows a static lit edge on hover, with no pointer tracking.

### 5.2 What it does

**Layout.** Heading block: h2 (`--type-xl`) and body (`--type-md`, `--muted`), `max-inline-size: 40em`, `margin-bottom: var(--space-8)`. Below it, three value cards: L in a 3-column grid with `gap: var(--space-4)`; M in 2 columns with the third card spanning both; S in 1 column. Each card (`.w-glass`, radius `--r-md`, `padding: var(--space-5)`) has a Lucide icon in a 32 px square tile (`--r-xs`, `--subtle` background): `FileText` (readable), `TextSelect` (grounded), `Quote` (cited). Then h3 (`--type-lg`) and body (`--type-base`, `line-height: 1.7`). Cards in a row share a baseline because the grid uses `align-items: stretch` and the h3 sits right after the icon.

Below the cards: the facts row (`<dl aria-label=facts_label>`, flex wrap, `gap: var(--space-6)`, `margin-top: var(--space-8)`). Each fact is a `<div>` with `<dt class="w-num">` (`--type-display`, `font-variant-numeric: tabular-nums`) and `<dd>` (`--type-base`, `--muted`). Three facts: formats (8), providers (6), languages (3). Under the languages fact, show the native names `English · 繁體中文 · 日本語`, each in a `<span lang>`.

**Motion.**

| What | Trigger | Keyframes | Duration | Easing | Stagger |
|---|---|---|---|---|---|
| Heading block | in-view | opacity 0, `translateY(12px)` → none | 320 ms | `--ease-out-soft` | none |
| Value cards | in-view (on the grid) | opacity 0, `translateY(24px)` → none | 600 ms | `--ease-out-soft` | 80 ms by `--i` |
| Count-up numbers | in-view (on the `<dl>`), once | integer text 0 → N via WAAPI-timed rAF limited to the duration | 600 ms | `--ease-out-soft` applied to the value | 80 ms between facts |

Count-up rules. The `<dt>` contains `<span class="motion-sr">{N}</span><span aria-hidden="true">{animated}</span>`. The width is reserved with `min-inline-size: 2ch` and tabular numbers, so there is no layout shift. The rAF runs at most 600 ms per number and stops itself. It does not run when the element was already in view at mount under reduced motion. With motion paused, show the final value.

Why reveals are trigger-once (IO) and not scroll-scrubbed (`view()`): a scrubbed reveal leaves cards half-transparent when the reader stops scrolling mid-range, and trackpad momentum makes it jitter. That hurts reading and makes screenshots flaky. Scroll-linked timelines are kept for continuous effects only (parallax, header hairline, progress line). If Chromium ships CSS `animation-trigger` in our Electron version, the IO code can be swapped for it later; see Open questions.

**Reduced motion.** Final numbers and static cards.

### 5.3 Live demo

**Layout.** Heading block as in §5.2, plus `demo_body`. Below it, the **stage** (`.demo-stage`): radius `--r-lg`, `padding: var(--inset)`, `--material-card` with hairline, `aspect-ratio: 16 / 10` at L and M, and 4 / 5 at S, where the chat sits under the reader instead of beside it. Inside, two panes separated by a 1 px `--hairline`. The reader pane takes 58% and the chat pane 42%. **Pane order follows the user's `settings.chatSide`**, so the demo mirrors their real layout (default: chat on the left, as in the screenshots). Inner panes use radius `--r-inner` (14). The `example_badge` sits at the top right of the stage. A `Replay` ghost button (`RotateCcw` icon + `demo_replay`) sits below the stage on the trailing side.

To the side of the stage at L (or below it at M and S), the **steps list**: `<ol aria-label=demo_steps_label>` with the 4 `demo_step_*` items. Each item shows a 20 px number disc (`--r-pill`) and its text. The item for the current script step gets `data-active`, which brings its text up to full `--ink` (inactive items use `--muted`) and fills the disc with `--ink`, transitioned over 200 ms with `--ease-standard`. **The list carries all the information. The stage is decoration:** the stage has `aria-hidden="true"` and `inert`. The steps list is not a live region, because announcing every loop would be noise.

Below the stage, in small muted text, the `demo_swap_hint` with the `ArrowLeftRight` icon, which is the icon the workspace swap button uses.

*Reader pane.* A 28 px header row shows `sample.md` and `Markdown · markitdown` in the real `.pane-toolbar` style of `.reading-pane` (`src/renderer/workspace/index.tsx`). Below it is a clipped viewport with `overflow: hidden`, holding `.demo-reader-content`: the sample Markdown rendered through the app's real Markdown renderer (`src/renderer/markdown.tsx`) in `.markdown` styles. The content is moved with `transform: translateY(var(--demo-scroll))`, not by scrolling, so movement stays on the compositor.

*Chat pane.* Message bubbles use the same classes and tokens as the real transcript (`chat-fixes.css` and the assistant-ui message styles). They are rendered statically by a `DemoMessage` component, without the assistant-ui runtime. At the bottom, a composer shell shows a selection chip (the real `.selection-chip` look from `src/renderer/chat.tsx`), the placeholder text, and a `demo_model_chip` pill.

**Script** (one loop ≈ 11.2 s; times are offsets from loop start; all durations are tokens):

| t | Step (`data-step`) | What moves | Duration / easing | Active caption |
|---|---|---|---|---|
| 0 | `enter` | Reader content fades in: opacity 0 → 1 per block, `translateY(6px)` → 0 | 320 ms, stagger 40 ms, `--ease-out-soft` | none |
| 900 | `select` | The target paragraph gets a highlight sweep: an overlay `<span class="demo-select">` with `transform: scaleX(0)` → `scaleX(1)`, `transform-origin: inline-start`, `--active` background behind the text (`mix-blend-mode` not used; the overlay sits under the text, z-index -1) | 600 ms, `--ease-in-out-soft` | 1 |
| 1700 | `chip` | A selection chip appears in the composer: opacity and `translateY(4px)` | 200 ms, `--ease-out-soft` | 1 |
| 2000 | `type-question` | The question types into the composer: `clip-path: inset(0 100% 0 0)` → `inset(0)` with `steps(n)`, where n = grapheme count (use `Intl.Segmenter('grapheme')`) | n × 45 ms, max 1200 ms | 2 |
| 3400 | `send` | Composer text clears (opacity 120 ms). The user bubble rises into the transcript: `translateY(8px)` + opacity | 200 ms, `--ease-out-soft` | 2 |
| 3700 | `thinking` | A three-dot indicator, opacity pulse | 600 ms, `--ease-in-out-soft`, 1 iteration | 3 |
| 4300 | `answer` | Answer words appear, each a span with `animation-delay: calc(var(--i) * 45ms)`, opacity 0 → 1, 160 ms (words from `Intl.Segmenter('word')`, CJK grouped to 2–4 characters) | total ≤ 1800 ms, `--ease-out-soft` | 3 |
| 6300 | `cite` | The citation chip appears (`scale(.9)` → 1, 200 ms), then pulses twice: `box-shadow: 0 0 0 0 var(--edge-lit)` → `0 0 0 6px transparent` | 2 × 600 ms, `--ease-out-soft` | 4 |
| 7700 | `press` | Chip pressed state (`--opacity-pressed` overlay) | 120 ms, `--ease-standard` | 4 |
| 7800 | `jump` | The reader moves so the `## Try it` heading sits 24 px from the top: `--demo-scroll` → measured offset | 600 ms, `--ease-in-out-soft` | 4 |
| 8400 | `highlight` | The target section gets the app's real `[data-citation-highlight]` outline (`chat-fixes.css`, `style.css`), which is removed again, matching `highlightCitation` | 1600 ms | 4 |
| 10300 | `reset` | Stage contents fade out | 320 ms, `--ease-exit` | none |
| 11200 | loop | Pause 600 ms, then `enter` | | |

Loop policy: play only while ≥ 40% of the stage is visible (IO threshold 0.4). When it leaves the view, **pause** in place (timers cleared with remaining time stored, `animation-play-state: paused`). When it comes back, resume. After **3 completed loops**, stop on the `highlight` frame (final state), the same policy `AnimatedText` uses. `Replay` restarts from `enter` and resets the loop count. Pausing also happens on `document.visibilityState === 'hidden'` and on `data-motion=paused`. Hovering the stage does **not** pause it; pausing on hover would freeze the story mid-step for a user who is just reading the steps beside it.

Measured values. The `jump` offset and the `select` overlay geometry are measured from the rendered DOM on mount and on stage resize (ResizeObserver, debounced to one rAF). They are never hard-coded, because CJK line wrapping changes them.

**Reduced motion / paused / no JS timers.** Render the final composed frame: reader at the `Try it` position with the highlight, the passage marked, the question and the full answer visible, the chip shown, and all 4 captions at full ink with no single active one. No autoplay. `Replay` is hidden.

### 5.4 Who it's for

**Layout.** Heading block, then the persona grid: L and M use 2 × 2 with `gap: var(--space-4)`; S uses 1 column. Each card is an `<article aria-labelledby>` built on `.w-glass`, radius `--r-md`, `padding: var(--space-6)`. Contents in order:
1. Icon tile 36 px (`--r-xs`, `--subtle`): `GraduationCap`, `Microscope`, `Briefcase`, `Languages`.
2. h3 role (`--type-lg`).
3. Situation (`--type-base`, `--ink`, `line-height: 1.7`).
4. The job, in a quote-like block with a `border-inline-start: 2px solid var(--hairline)` and `padding-inline-start: var(--space-3)`, in `--muted`.
5. A footer row separated by a hairline: label `who_first_label` (`--type-xs`, `--muted`) and the `pN_first` text (`--type-base`, weight 500).

All text is always visible. Nothing is revealed only on hover or focus.

**Motion.**

| What | Trigger | Keyframes | Duration | Easing | Stagger |
|---|---|---|---|---|---|
| Cards reveal | in-view (grid) | opacity 0, `translateY(24px)` → none | 600 ms | `--ease-out-soft` | 80 ms, row-major |
| Lift | hover (pointer: fine) | `transform: scale(1.01) translateY(-2px)`; shadow raised → floating | 200 ms | `--ease-standard` | none |
| Lit edge + spotlight | hover | see §5.9 | none | none | none |

Deviation from the brief, on purpose. The brief asked for cards that "expand on hover or focus". These cards have no action, so they are not focusable. Making them focusable only to show an effect would add useless tab stops. Hover expansion that reveals content would hide information from keyboard and touch users. So the hover effect is decorative only: scale 1.01 (within the ≤ 1.02 limit) and a lit edge, with `cursor: default` so the card doesn't pretend to be clickable. See Open questions for an alternative that gives each card a real action.

**Reduced motion.** No reveal and no lift. Hover shows the static edge only.

### 5.5 Bring your own model

**Layout.** Heading block. Then the **name marquee**: one row 44 px high, masked at both ends (`mask-image: linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent)`). It holds the 6 names (`providerName` values) in `--type-md` weight 500, `--muted`, separated by a 4 px dot. The track holds the list twice (the second copy is `aria-hidden`); the whole marquee is `aria-hidden` because the cards below repeat the same names. Below it, the **provider cards** grid: L 3 × 2, M 2 × 3, S 1 column, `gap: var(--space-3)`. Each card (`.w-glass`, `--r-md`, `padding: var(--space-4)`) contains:
- A header row: icon (`Terminal` for CLI, `KeyRound` for API keys, `Link2` for compatible), title from `providerName`, and a muted subtitle.
- The connection line: `via_*` text.
- For CLIs, the prefix text plus a `<code>` block (`--r-xs`, `--subtle` background, monospace `--type-base`, `user-select: all`) with a copy button (`Copy` icon, `aria-label` "Copy command", reusing `use-copy-to-clipboard.ts` and the existing copy-success feedback).
- For keys, the `key_*` text.

Under the grid: `models_note` (`--type-sm`, `--muted`, `max-inline-size: 48em`) and the `models_cta` (`button.secondary`).

Optional: if `providers:list` reports a CLI as available, its card shows a small "Ready" chip (reuse `onboarding:ready`). This is real data, not a claim. If the call fails, show nothing.

**Motion.**

| What | Trigger | Motion | Duration | Easing |
|---|---|---|---|---|
| Marquee | in-view; runs while visible | `translateX(0)` → `translateX(-50%)` of the doubled track | `--marquee-duration` = track half-width ÷ 32 px/s (measured once with ResizeObserver; usually 18–28 s), infinite | `linear` |
| Marquee pause | hover, focus-within anywhere in the section, out of view, hidden window, `data-motion=paused` | `animation-play-state: paused` | immediate | none |
| Cards reveal | in-view | opacity 0, `translateY(16px)` → none | 320 ms | `--ease-out-soft`, stagger 40 ms |
| Copy feedback | click | icon cross-fade Copy → Check | 120 ms | `--ease-standard` |

At S (< 560) the marquee is not rendered at all, because six names scrolling in a narrow pane read as noise. The cards are enough.

**Reduced motion.** The marquee renders as a static, centered, wrapping row (no duplicate list, no mask). Cards are static.

### 5.6 Your library and your data

**Layout.** Heading block. L: two columns, `5fr 7fr`, `gap: var(--space-8)`.
- *Left:* three short lists, each with an h3 (`--type-md`, weight 600) and a `<ul>` with check-style Lucide icons at 16 px (`FolderTree`, `BarChart3`, `ShieldCheck` as the list headers' icons; the bullets themselves are plain hairline dots).
- *Right:* the **example Home cards** composition. It is a `.demo-stage`-style frame (radius `--r-lg`, inset 6) holding two real Home components rendered with fixture data:
  - `<Streak>` from `home/home.tsx`, with a fixture of 7 days where 5 were studied and today was studied;
  - `<Sparkline>` with a 14-day fixture series, plus a static budget `progress` at 42%.

  Each is wrapped in the real `.home-card` class, so it inherits the true look. The frame carries `example_badge`, `role="img"` and `aria-label=data_visual_alt`. Children are `aria-hidden` and `inert`.

M and S: one column, visual after the lists.

Below both columns, full width: the **Good to know** line, a single `<p class="w-good-to-know">` with a leading `Info` icon (16 px). `--type-sm`, `--muted`, `border-top: 1px solid var(--hairline)`, `padding-top: var(--space-4)`, `margin-top: var(--space-8)`. The label `good_to_know_label` is bold and in `--ink`. It is deliberately quiet but at full contrast. Do not make it smaller than `--type-sm`.

**Motion.**

| What | Trigger | Motion | Duration | Easing |
|---|---|---|---|---|
| Lists | in-view | opacity 0, `translateY(12px)` → none; stagger 80 ms between the three lists | 320 ms | `--ease-out-soft` |
| Example frame | in-view | opacity 0, `translateY(16px) scale(.99)` → none | 600 ms | `--ease-out-soft` |
| Streak dots (inside the frame) | after the frame finishes | each studied dot `scale(.6)` → 1 | 200 ms, stagger 40 ms | `--ease-standard` |
| Sparkline | after the frame finishes | `stroke-dasharray` / `stroke-dashoffset` draw from length → 0 (paint-only, on a 100×30 SVG, so the cost is negligible) | 600 ms | `--ease-in-out-soft` |
| Budget bar | same | `transform: scaleX(0)` → `scaleX(1)` on an overlay that mirrors the progress value (the native `progress` is not animatable) | 600 ms | `--ease-out-soft` |

**Reduced motion.** All static.

### 5.7 Closing

**Layout.** Centered block, `max-inline-size: 36em`, `text-align: center`. h2 at `--type-display` (28) with `text-wrap: balance`, then the body (`--type-md`, `--muted`). The CTA row is centered: primary `home:upload`, secondary `onboarding:sample`. Under them, the `start_home` text link. Behind the block sits one very soft radial glow: `radial-gradient(60% 50% at 50% 40%, color-mix(in oklab, var(--ink) 4%, transparent), transparent)`, static, painted once. It is removed under reduced transparency.

**Motion.** In-view: h2, body and CTAs fade up (`translateY(8px)` + opacity) at 320 ms, `--ease-out-soft`, stagger 80 ms. Nothing loops.

### 5.8 Scroll progress dots

At L only (≥ 860): a sticky column at the inline end of `.welcome`, `position: sticky; top: 50%; transform: translateY(-50%)`, placed in a grid column of 32 px that the content does not use. A `<nav aria-label=sections_label>` holds 7 `<button>`s. Each has a 24 × 24 hit area around an 8 px visual dot (`--r-pill`, 1 px `--muted` border), `aria-label=go_to_section{section: nav_*}`, and `aria-current="true"` on the active one. The active dot is filled with `--ink` and scaled to 1.25 (200 ms, `--ease-standard`). A 1 px vertical line behind the dots fills from the top as the page scrolls: `transform: scaleY(0 → 1)` with `animation-timeline: --welcome` (the named scroll timeline), easing `linear`. Where `animation-timeline` is unsupported, the line is simply not drawn.

Active section: one IntersectionObserver over the 7 sections with `rootMargin: -45% 0px -45% 0px` (a center band); the last intersecting section wins. Click: `section.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })`, then `focus({ preventScroll: true })` on that section's h2, which has `tabIndex={-1}`. A tooltip with the section name (`title` attribute) appears on hover.

At M and S: no dots. The sticky header is enough, and space is precious.

### 5.9 Spotlight and lit edge (glass cards)

Used on `.hero-stack` layers, value cards, persona cards and provider cards. Only when `(hover: hover) and (pointer: fine)` matches and reduced transparency is off.

- On `pointerenter`, attach a `pointermove` listener to that one card. On `pointerleave`, remove it and fade the effect out (opacity 200 ms, `--ease-standard`). There are no global listeners.
- `pointermove` stores the latest coordinates. At most one rAF per frame writes `--mx` and `--my` (px, relative to the card) with `style.setProperty`. The rAF runs only after a move. There is no loop.
- `::before` (under the content, `z-index: 0`; content gets `position: relative; z-index: 1`): `background: radial-gradient(var(--spotlight-size) circle at var(--mx) var(--my), var(--spotlight-tint), transparent 70%)`.
- `::after` (lit edge): `inset: 0; padding: 1px; border-radius: inherit; background: radial-gradient(180px circle at var(--mx) var(--my), var(--edge-lit), transparent 70%); mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); mask-composite: exclude;`
- Both pseudo-elements start at `opacity: 0` and go to 1 on `:hover` (200 ms).
- Under reduced motion, the coordinates stay at the card center (no tracking), and only the hover fade-in remains.

### 5.10 View transitions between Home / Library / Workspace / Welcome

Electron 40 ships a Chromium new enough for same-document `document.startViewTransition` (Chromium 111+) and transition types (125+). Implement it in the shell, not in Welcome:

```ts
// src/renderer/shell/view-transition.ts
export function transitionTo(apply: () => void, type: 'view' | 'document') {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!('startViewTransition' in document) || reduced || document.visibilityState !== 'visible') { apply(); return; }
  document.startViewTransition({ update: () => flushSync(apply), types: [type] });
}
```

`navigate()` in `shell/index.tsx` wraps its `setRoute` with `transitionTo`. Do not start a second transition while one is running; call `skipTransition()` on the active one first. The sidebar and top bar get `view-transition-name: vt-sidebar` and `vt-topbar`, so they stay still and only the main pane changes.

- **View switch** (`:active-view-transition-type(view)`): `::view-transition-old(root)` fades out 120 ms `--ease-exit`; `::view-transition-new(root)` fades in with `translateY(8px)` → 0, 200 ms, `--ease-out-soft`, 40 ms delay. Total ≤ 240 ms.
- **Document card → reader** (`type: 'document'`): the clicked Library card, Home "Continue" row or pinned row gets `style.viewTransitionName = 'vt-document'` right before `transitionTo`. Names must be unique, so only the clicked element gets one. In the workspace, the reader pane gets the same name for the first render only (a `pendingDocumentMorph` module flag that is cleared on `transition.finished`). `::view-transition-group(vt-document)`: 320 ms, `--ease-in-out-soft`. Old and new images cross-fade inside the morphing box, which is the default.
- **To and from Welcome**: same as a view switch.
- During the transition the page does not take input. That is why every transition here is ≤ 320 ms.
- Reduced motion, a hidden window, or no API: an instant switch.

## 6. Performance budget

- **Route cost:** Welcome is lazy-loaded. Its chunk is ≤ 35 KB gzipped (JS + CSS), with **no new dependencies**. Decision: do not add `motion`. Everything here is CSS animations, WAAPI for the count-up timing, IntersectionObserver, ResizeObserver, and the View Transitions API. Revisit only if a later feature needs spring physics or gestures.
- **Compositor only** for continuous motion: `transform` and `opacity`. Documented exceptions: the hero headline `filter` blur (one-shot, ≤ 8 boxes), the sparkline `stroke-dashoffset` (one-shot, tiny SVG), and the spotlight's `background` repaint (hover only, one card).
- **No continuous JS loops.** Allowed rAF work: (a) spotlight, only after a pointermove on the hovered card; (b) count-up, ≤ 600 ms, once per number; (c) one measuring rAF after a resize. The demo player advances with ≤ 12 `setTimeout`s per loop; all its visual work is CSS keyed off `data-step`.
- **Off-screen = idle.** The demo is paused below 40% visibility. The marquee and float are paused when out of view (`data-inview="false"` sets `animation-play-state: paused`). Scroll-driven animations cost nothing when the page does not scroll.
- **Hidden window = idle.** On `visibilitychange` to hidden, add `data-hidden` on `.welcome` (all CSS animations paused) and pause the demo player. Keep Electron's default `backgroundThrottling: true`.
- **`will-change` discipline:** never in static CSS. It is added by a class only while an element is animating, and removed on `animationend`/`transitionend`. At most 8 elements carry it at once. The scroll-driven parallax layers do not need it; Chromium promotes them.
- **Backdrop blur:** at most 4 blurred surfaces on screen at once (the 3 hero layers + the sticky header). All other glass is blur-free translucent fill (§3).
- **No layout shift:** reserve space for every async or animated thing. The stack and stage use `aspect-ratio`. Numbers use tabular figures and `min-inline-size`. The demo answer is laid out in full from the start and revealed by opacity (not inserted). Provider "Ready" chips reserve their slot with `visibility: hidden`.
- **Targets** (measured in §8): 0 layout shifts after first paint (CLS = 0). No long animation frame over 50 ms during the hero choreography, a 3-second scripted scroll, or one demo loop. p95 frame duration ≤ 16.7 ms during the same, on the reference machine (Apple silicon, built app, 1200 px, both themes). First paint of the hero < 150 ms after navigation.

## 7. Accessibility

- **Structure.** One `<main aria-label=region_label>`, one `h1` (hero), one `h2` per section, `h3` for cards. DOM order equals visual order at every breakpoint. The hero text comes before the hero visual. In the demo, the steps list comes before the stage when stacked. The progress-dot nav is placed after the sticky header in the DOM, so screen-reader users meet it early and can skip it.
- **Focus.** On opening Welcome, focus moves to the `h1` (`tabIndex={-1}`), matching the onboarding pattern. "Close" returns to the previous route and restores focus to the control that opened Welcome (Home entry button or Settings button). Store a `returnFocus` id with the route. A dot click moves focus to the target heading. The skip link from the shell still works.
- **No information only in motion.** The demo's meaning lives in the static steps list. The stage and decorative visuals are `aria-hidden` and `inert`, and the visuals have text alternatives (`hero_visual_alt`, `data_visual_alt`). The marquee is `aria-hidden`; the cards list the same providers. Count-ups expose the final number to assistive tech from the start.
- **aria-live:** none on this page. Copy feedback and import results reuse the app's existing toast and status regions.
- **Pause, stop, hide (WCAG 2.2.2).** Anything that moves for more than 5 s (demo, marquee, float) stops with the header's "Pause animations" toggle. The demo also stops on its own after 3 loops.
- **Reduced motion:** see §5. Every section was designed to be complete with no motion at all.
- **Reduced transparency:** solid surfaces, no blur, no spotlight, static 1 px edges.
- **Contrast:** body text on glass and on the page ≥ 4.5:1, large text ≥ 3:1, UI boundaries (dots, chips, card edges) ≥ 3:1, in light and dark, with transparency on and off. Measure worst case with the spotlight at full opacity under the text; the 5% tint is chosen to stay within budget, so verify it.
- **Zoom and text scaling:** at 200% zoom the page reflows to the S layout with no horizontal scroll and no clipped text. No fixed heights on text containers. Aspect-ratio boxes contain decoration only.
- **Targets:** every button and dot has a hit area ≥ 24 × 24 px.
- **Language:** each `<span lang>` around native language names; the page `lang` follows the app.
- **VoiceOver:** add a manual script to the existing list (marked unverified until a human runs it). It covers: reading order, the headline being read once and whole, the dots announcing "Go to Demo, current", and the hidden stage not being announced.

## 8. Technical plan for the builder

### 8.1 File layout

```
src/renderer/welcome/
  index.tsx              WelcomeView: scroller, sticky header, sections, motion pause state, focus-on-mount
  welcome.css            section layout, glass recipes, all keyframes, reduced-motion/transparency overrides
  facts.ts               SUPPORTED_FILE_TYPES, PROVIDER_KINDS, INTERFACE_LANGUAGES (see 8.4)
  sections/
    hero.tsx             SplitReveal + HeroStack + CTAs
    values.tsx           value cards + Facts (<dl>) with CountUp
    demo.tsx             heading, DemoStage, DemoSteps, Replay, swap hint
    personas.tsx         4 PersonaCard
    models.tsx           Marquee + ProviderCard grid + note + CTA
    data.tsx             lists + ExampleHomeCards + GoodToKnow
    closing.tsx          final CTA block
  demo/
    script.ts            ordered steps [{ id, at, caption }] (the table in 5.3), no DOM
    use-demo-player.ts   state machine: play/pause/resume/stop-after-3/replay; IO + visibility + motion-paused aware
    demo-stage.tsx       reader (real Markdown renderer) + chat (DemoMessage) + composer shell; measures offsets
  motion/
    use-in-view.ts       IO hook: { ref, inView, seenOnce }; root = .welcome
    use-spotlight.ts     pointer → --mx/--my, rAF-coalesced, enter/leave scoped
    split-reveal.tsx     Intl.Segmenter grouping (≤ 8), sr text + aria-hidden groups
    count-up.tsx         sr final value + animated aria-hidden value
    marquee.tsx          doubled track, measured duration, pause rules, static fallback
    progress-dots.tsx    section IO band + nav buttons
  welcome.test.tsx
  split-reveal.test.ts
  demo-player.test.ts
  facts.test.ts
src/renderer/shell/view-transition.ts   transitionTo() (5.10)
src/shared/locales/{en,zh-Hant,ja}/welcome.json
e2e/welcome.mjs
```

Edits outside `welcome/`, all small: `shell/index.tsx` (`View` adds `'welcome'`; `navigate` uses `transitionTo`; a sidebar/top-bar `view-transition-name`), `app.tsx` (lazy route), `home/home.tsx` (entry button), `providers.tsx` (Settings button), `onboarding/onboarding.tsx` (navigate to Welcome on finish when `!welcomeSeen`), `shared/domain.ts` (`welcomeSeen` setting, default `false`), `tokens.css` (§3 tokens), the i18n namespace registration, and the Library card / Home rows (set `vt-document` on click).

### 8.2 Feature detection and fallbacks

- `CSS.supports('animation-timeline: view()')` → add `data-sda` on `.welcome`. Parallax, the header hairline and the progress line apply only under `[data-sda]`. Without it they are absent; the page is complete.
- Reveals always use `use-in-view` (IO), so there is one code path everywhere (see the rationale in §5.2).
- `'startViewTransition' in document` (see §5.10).
- `Intl.Segmenter` missing (it should not be in Electron) → SplitReveal renders the heading as one group with only a fade.
- jsdom (unit tests) has no IO or `matchMedia`. Hooks treat a missing API as "in view, reduced motion", which renders the final state, and tests stub them when they need behavior.

### 8.3 i18n

- New namespace `welcome`, registered with the others. All keys in §4 exist in en, zh-Hant and ja together; the existing parity test enforces identical interpolation variables. ICU plurals for the `fact_*` keys (CJK use `other`).
- Reuse the keys listed in §4 instead of duplicating them.
- The en-XA pseudo-locale must not break layout (40% expansion). Include it in one e2e screenshot pass.
- Headline and demo grouping use `document.documentElement.lang`.

### 8.4 Real facts, enforced by a test

`facts.ts` exports:

```ts
export const SUPPORTED_FILE_TYPES = ['pdf','docx','xlsx','pptx','html','csv','md','txt'] as const; // 8
export const PROVIDER_KINDS = ['claude-cli','codex-cli','agy-cli','anthropic-api','openai-api','openai-compatible'] as const; // 6
export const INTERFACE_LANGUAGES = ['en','zh-Hant','ja'] as const; // 3
```

`facts.test.ts` imports `documentFormats` from `src/main/services/documents.ts` and asserts that the set of distinct MIME types has size `SUPPORTED_FILE_TYPES.length`. It also asserts that `PROVIDER_KINDS` equals the provider id enum in `src/shared/domain.ts`, and that the locale directories equal `INTERFACE_LANGUAGES`. If someone adds a format, the test fails until the page agrees. The page never shows a number that the code does not back.

### 8.5 Tests

Unit (vitest, jsdom):
- `split-reveal`: en, zh-Hant and ja headlines produce ≤ 8 groups; concatenated groups equal the source text exactly; punctuation never starts a group; the sr-only text equals the source.
- `demo-player`: advances through `script.ts` in order with fake timers; pauses when `inView` is false or the document is hidden, and resumes with the remaining time; stops after 3 loops on the `highlight` step; `replay` resets; reduced motion renders the final step and schedules no timers.
- `welcome.test.tsx`: renders in all 3 locales with no missing keys; exactly one `h1`; 7 `section`s each labelled by an `h2`; the demo stage and visuals are `aria-hidden`; facts expose the final numbers in sr text; the primary CTA label switches between `home:upload` and `home:continue` from dashboard fixtures; `demo_citation` equals the `## ` heading in each `resources/samples/<locale>.md`.
- `facts.test.ts` (8.4).

E2E (`e2e/welcome.mjs`, built Electron, `VSTUDY_FAKE_PROVIDER=1`, seeded like the existing design capture matrix):
- **Screenshots:** {en, zh-Hant, ja} × {720, 900, 1200} × {light, dark}, with `reducedMotion: 'reduce'` emulated (final state). Each section scrolled into view, plus a full-page capture. Plus one en-XA pass at 900 light. Plus one non-reduced capture of the hero at t = 1200 ms (after the choreography) at 1200 light/dark. Save under `/tmp/vstudy-welcome/`, following the naming of `/tmp/vstudy-home/`.
- **Reduced transparency:** a 1200 light/dark pass with `html[data-reduced-transparency=true]`; assert no element has a computed `backdrop-filter` other than `none`.
- **axe-core** on the Welcome view in every locale and theme, with motion on and with reduced motion. 0 serious or critical violations. The contrast check runs with the spotlight forced on (`.welcome[data-test-spotlight]` sets the pseudo-elements to opacity 1 at the card center).
- **Keyboard:** Tab order matches reading order; dots move focus to headings; Close restores focus to the Home entry button.
- **Frame time:** in a non-reduced run at 1200 light, register `PerformanceObserver` for `long-animation-frame` and `layout-shift` before navigating to Welcome. Record during (a) the hero choreography, (b) a scripted 3 s wheel scroll from top to bottom, and (c) one full demo loop. Assert 0 LoAF > 50 ms and a cumulative layout shift of 0. Collect frame intervals with a rAF probe that runs **only during the measurement** and assert p95 ≤ 16.7 ms. Write the numbers to `/tmp/vstudy-welcome/performance.json`.
- **Idle checks:** scroll so the demo is off-screen, wait 1 s, and assert the demo player state is `paused` and `document.getAnimations()` holds no `running` animation inside `.demo-stage` or the marquee. Hide the window (`BrowserWindow.hide()` via the test hook) and assert `.welcome[data-hidden]` and a paused player.
- **View transitions:** click a Library card and assert a transition with type `document` ran (`document.activeViewTransition` or a test hook) and finished in under 400 ms. With reduced motion, assert no transition ran.
- **Design critique loop (PRODUCT_DESIGN_V2 §10):** the builder screenshots, self-critiques against the eight checks, revises, and then an independent reviewer from a different model family critiques the screenshots. At most two rounds per section.

### 8.6 Acceptance criteria

1. Welcome opens once after onboarding completes normally, and from Home and Settings via "What is VStudy Pro?" in all three languages. Close returns to where the user came from, with focus restored.
2. A first-time reader who sees only the hero and the 7 section headings can say what the app does, who it is for, and that documents stay local. Check this in the design review, using the copy in §4 verbatim (or reviewer-approved edits).
3. Every claim on the page is traceable to §0. The three numbers come from `facts.ts` and pass `facts.test.ts`. There are no testimonials, user counts, third-party logos or awards. The demo is labelled as scripted.
4. All motion in §5 is implemented with the listed triggers, durations and easings (±10%). Every section renders complete and correct with `prefers-reduced-motion: reduce`, with "Pause animations" on, and with JavaScript animation hooks disabled.
5. The demo pauses off-screen and when the window is hidden, stops after 3 loops, mirrors `chatSide`, and its steps list conveys the full story without the stage.
6. The performance targets in §6 are met and recorded in `performance.json`. CLS is 0, and there are no LoAF over 50 ms.
7. axe has 0 serious or critical issues in all locale × theme × motion combinations. Contrast is ≥ 4.5:1 on glass with the spotlight on. The page works at 200% zoom with no horizontal scroll.
8. The screenshot matrix (3 languages × 3 widths × 2 themes, plus reduced transparency and en-XA) passes the design review, with no ad-hoc radii, colors or shadows (tokens only).
9. View transitions run between Home, Library, Workspace and Welcome (cross-fade ≤ 240 ms) and morph a document card into the reader (320 ms). They are skipped under reduced motion.
10. No new runtime dependency. `pnpm typecheck`, `pnpm lint` and `pnpm test` pass, and `e2e/welcome.mjs` passes on the built app.

## 9. Open questions

1. **New tokens.** `--type-hero` (up to 40 px) is bigger than the 28 px top of the agreed type scale. The motion and easing tokens are also new. The lead needs to approve them, or ask for the hero to use `--type-display`. My view: 28 px is too quiet for a page whose whole job is the first impression; 40 px at L is still calm.
2. **CLI login commands.** I am confident about `codex login` and about running `agy` once (README). For Claude Code, running `claude` and following the sign-in prompt is how I understand it works; there is also `/login` inside a session. Confirm all three against the versions the app's provider probes expect, and confirm the subtitle wording ("ChatGPT / Codex subscription") for Codex.
3. **Provider marks.** I used text names only. Official logos are trademarks with usage rules and would bring color into a monochrome UI. Decide whether to use them; my recommendation is no.
4. **Persona card interaction.** The cards are decorative-hover only (§5.4). An alternative gives each card one real action. Student and language learner: "Set Reply language" (opens Settings). Researcher: "Create a folder" (opens the Library new-folder flow). Professional: `home:upload`. That would make the cards focusable, and the "expand on focus" in the brief would become meaningful. It adds 4 more buttons to a page that already has several CTAs.
5. **Sample content in the renderer.** The demo needs the sample Markdown in the renderer without importing it into the user's Library. Either expose a read-only `samples:get(language)` IPC (main reads `resources/samples`, containment-checked) or copy the three files into the renderer bundle at build time. I prefer the IPC: one source of truth and no duplicated text. It is a new IPC channel, so it needs zod validation per §6 of the design.
6. **Showing Welcome after onboarding.** Onboarding is already 4 steps. Adding a scrolling page right after may feel like a second onboarding. Alternatives: show it only when the user finished onboarding without connecting a model or importing a document, or show a one-time Home card ("New here? What is VStudy Pro?") instead of navigating. Needs a product call. I specified the brief's behavior.
7. **`prefers-reduced-transparency` in Chromium.** I am not certain the media query is enabled by default in the Chromium that ships with Electron 40. The app already sets `html[data-reduced-transparency]` from the main process (`settings:appearance`), and the spec relies on that attribute as well as the media query. Verify that it tracks changes to the macOS setting while the app is running.
8. **CSS `animation-trigger`.** If our Chromium version supports it, the IO reveal code could become pure CSS. I did not rely on it, because I am not sure it ships stable in this version.
9. **CJK search claim.** `data_organise_2` relies on the FTS work in `src/main/services/search.ts` (trigram and bigram). Confirm that the shipped index finds two-character words such as 資料 and 通信 before release, as PRODUCT_DESIGN_V2 §1 requires. If it does not, soften the line to "Search across titles and text".
10. **Help menu.** macOS apps usually put this kind of page under Help. Adding "What is VStudy Pro?" to the app menu next to "About VStudy Pro" (`common:menu_about`) would be natural, but it touches main-process menu code, so I left it out of scope.
11. **Native-speaker review.** The zh-Hant and ja copy was written natively by me, not translated word for word. The glossary still requires a native-speaker review before release, especially of persona situations and the Good-to-know line.
