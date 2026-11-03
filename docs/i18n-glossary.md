# Interface language glossary

| English | Traditional Chinese (Taiwan) | Japanese |
|---|---|---|
| File | 檔案 | ファイル |
| Folder | 資料夾 | フォルダ |
| Document | 文件 | ドキュメント |
| Library | 文件庫 | ライブラリ |
| Settings | 設定 | 設定 |
| Conversation / Chat | 對話 | 会話 |
| Model | 模型 | モデル |
| Usage | 用量 | 使用量 |
| Provider | 服務供應商 | プロバイダー |
| API key | API 金鑰 | API キー |
| Import | 匯入 | インポート |
| Export | 匯出 | エクスポート |
| Selection | 選取內容 | 選択した箇所 |
| Reasoning effort | 推理強度 | 推論の強度 |
| Cache | 快取 | キャッシュ |
| Token | token | トークン |
| Pin | 釘選 | ピン留め |
| Unfiled | 未分類 | 未分類 |

Keep VStudy Pro, provider names, model identifiers, Markdown, JSON, CSV and API unchanged. Localize “OpenAI compatible” because “compatible” describes a connection type. Language choices use native names so users can recover from an accidental switch.

Traditional Chinese uses Taiwan vocabulary and full-width punctuation. Japanese explanatory sentences use です・ます; buttons use concise conventional action labels. Avoid translating document text, user messages, generated answers or model-provided labels as interface copy. Reply language affects instructions only; documents remain unmodified.

Use `tr('namespace:key', params)` for copy and `useTranslation()` for reactive components. Use named interpolation instead of concatenated grammar. `LanguageSettings` is reusable by onboarding. `useFormat()` supplies date, relative-time, number and USD formatting. Never infer USD from the display language.

Catalogs live in `apps/desktop/src/shared/locales/{en,zh-Hant,ja}` with common, chat, library, home, onboarding, settings, usage, errors and picker namespaces. Home/onboarding are reserved for the subsequent UI workers. Add keys to all locales together. Plurals use i18next/Intl rules, not English suffix logic. CJK languages normally use the `other` category. Do not add synthetic English singular grammar to their messages.

Main-process structured statuses use `namespace.code` plus a scalar `params` object. Renderer lookup maps the first dot to the namespace separator. Electron invocation errors encode the object after `VSTUDY_STATUS:` because Electron strips custom Error fields. Chat/progress keep legacy message fields for wire compatibility; render code-based translations. Unknown exceptions show a localized generic error, never arbitrary provider diagnostics.

Development Settings offers en-XA, preserving interpolation and expanding text by 40%. This is a layout aid, not a shipped language. Content-language detection prefers kana → Japanese, then Han → Traditional Chinese; Han-only Japanese cannot be reliably distinguished and needs explicit document metadata in future.

Native-speaker review for both Japanese and Traditional Chinese remains required before release.
