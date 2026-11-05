# Welcome experience copy contract

The optional Welcome view opens from Home, Settings, or the final onboarding action. It does not automatically open after onboarding. Visiting records `welcomeSeen`. The demo is scripted and makes no model call. Native-speaker review remains outstanding for Traditional Chinese and Japanese.

Current claims were checked against these implementation boundaries:

| Claim | Implementation and limit |
| --- | --- |
| Supported documents | `shared/document-formats.ts`, `main/services/documents.ts`: eight format families, modern Office only, 50 MB source limit. No claim of arbitrary document compatibility. |
| PDF readability | `resources/converter/convert.py` and `pdf_md`: text-layer extraction, ruled tables, fallback parser, no OCR. Fidelity and images are limited. |
| Selected-passage chat | `main/prompt/index.ts`: selection up to 16k characters, earlier selections, metadata and history; without selection, outline and opening excerpt. Copy must disclose all these data classes. |
| Citations | `main/prompt/citations.ts`, `renderer/citation-highlight.ts`: validated catalog references jump to stored offsets. Model correctness is not guaranteed. |
| Models | `main/providers/index.ts`: six connections; CLI defaults OFF, explicit opt-in, file-only discovery before enabling. Authentication is external. Codex is version-gated; availability is not promised. |
| Keys | `main/services/secrets.ts`: explicitly saved keys use asynchronous Keychain encryption. Session keys are memory-only; saved keys require unlocking after restart. |
| Privacy | `main/services/egress.ts`: VStudy sends no analytics; enabled provider/CLI services, converter installation and confirmed external opening can use the network. Inventory is session-only and cannot enumerate opaque CLI or Chromium traffic. |
| Library | `main/services/library.ts`, `main/services/search.ts`: folders, pins, tags, filters and CJK search. No synchronization or note editing. |
| Usage | `main/db/usage.ts` / `main/ipc/usage.ts`: reported or estimated usage/cost, optional budget; not a billing statement. |
| Languages | `shared/locales/{en,zh-Hant,ja}`: three live interface languages; reply-language instruction is model guidance. |

The `welcome` catalogs in all three languages are the shipped copy. Historical reviews under `design-reviews/` are dated evidence, not additional product promises. Animation/VoiceOver/performance acceptance must use current verification results.

## First-run learning guidance

The six-step onboarding sequence now introduces coursework and reading, then language, existing Appearance settings, a school/document/sample goal, optional AI, and a first task. Home and Help resume saved progress. Help also contains five offline walkthroughs and a shortcuts sheet. The reader and Courses show a profile-local hint that stays dismissed. The longer Welcome page remains available independently.

The appearance step imports the shared theme picker. School setup opens the existing Courses connection dialog through a transient route flag. No school credential handling or theme model is duplicated in onboarding. See `FIRST_RUN_AUDIT.md` for fresh-profile observations and current acceptance evidence.
