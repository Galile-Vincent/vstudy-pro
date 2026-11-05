# Documentation index

[The project README](../README.md) is the current user guide. Audit reports and design reviews record dated snapshots; their historical pass counts are not current acceptance.

| Document | Purpose |
| --- | --- |
| [README.md](README.md) | Documentation inventory and current-versus-historical evidence guide. |
| [final-implementation-response.md](final-implementation-response.md) | Current implementation, verification evidence and remaining acceptance gaps. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Application architecture and process boundaries. |
| [ASSISTANT_UI_COMPARISON.md](ASSISTANT_UI_COMPARISON.md) | Dated assistant UI comparison and design reference. |
| [DATA_MODEL.md](DATA_MODEL.md) | Database and domain model reference. |
| [PDF_MD_FINAL_ROUND.md](PDF_MD_FINAL_ROUND.md) | Dated PDF conversion validation record. |
| [PDF_MD_REVALIDATION.md](PDF_MD_REVALIDATION.md) | Dated PDF conversion validation record. |
| [PDF_MD_VALIDATION.md](PDF_MD_VALIDATION.md) | Dated PDF conversion validation record. |
| [PRODUCT_DESIGN_V2.md](PRODUCT_DESIGN_V2.md) | Product and interaction design reference. |
| [SECURITY.md](SECURITY.md) | Security controls, trust boundaries, risks and historical verification. |
| [VOICEOVER_TEST_SCRIPT.md](VOICEOVER_TEST_SCRIPT.md) | Manual assistive technology acceptance protocol. |
| [WELCOME_EXPERIENCE.md](WELCOME_EXPERIENCE.md) | Current Welcome copy contract and implementation sources. |
| [a11y-perf-audit-1-response.md](a11y-perf-audit-1-response.md) | Dated audit implementation response. |
| [a11y-perf-audit-1.md](a11y-perf-audit-1.md) | Dated accessibility/performance audit. |
| [codex-tool-free.md](codex-tool-free.md) | Pinned Codex transport mechanism and live proof limits. |
| [design-reviews/home-onboarding.md](design-reviews/home-onboarding.md) | Dated design review and evidence. |
| [design-reviews/independent-review-1.md](design-reviews/independent-review-1.md) | Dated design review and evidence. |
| [design-reviews/library.md](design-reviews/library.md) | Dated design review and evidence. |
| [design-reviews/round1-after.md](design-reviews/round1-after.md) | Dated design review and evidence. |
| [design-reviews/round1-response.md](design-reviews/round1-response.md) | Dated design review and evidence. |
| [design-reviews/welcome-independent.md](design-reviews/welcome-independent.md) | Dated design review and evidence. |
| [design-reviews/welcome-response.md](design-reviews/welcome-response.md) | Dated design review and evidence. |
| [design-reviews/welcome.md](design-reviews/welcome.md) | Dated design review and evidence. |
| [i18n-glossary.md](i18n-glossary.md) | Localization terminology. |
| [i18n-verification.md](i18n-verification.md) | Localization verification protocol. |
| [security-audit-1-response.md](security-audit-1-response.md) | Dated audit implementation response. |
| [security-audit-1.md](security-audit-1.md) | Dated security audit. |

Other project documentation:

| Document | Purpose |
| --- | --- |
| [Project README](../README.md) | Current features, setup, commands, providers, privacy and limits. |
| [Converter README](../apps/desktop/resources/converter/README.md) | Converter protocol, installation and resource boundaries. |
| [Converter performance](../apps/desktop/resources/converter/PERFORMANCE.md) | Historical baselines, progressive-delivery targets and current probes. |
| [Provider fixture provenance](../apps/desktop/src/main/providers/fixtures/README.md) | Provider catalog/parser fixture origins. |
| [PDF golden fixtures](../apps/desktop/test-fixtures/pdf_md/README.md) | PDF extraction fixtures and expected behavior. |

## Current engineering and subsystem references

- [Engineering procedures](ENGINEERING.md) describe setup, checks, IPC, migrations, locale generation, and releases.
- [Cleanup verification](ENGINEERING_CLEANUP.md) records current commands and scoped exceptions.
- [Storage and recovery](STORAGE.md) describes persistence ownership, cache limits, and portable backups.
- [Vendor patches](VENDOR_PATCHES.md) records source hashes and exact reviewed diffs.
- [Proposed 0.2.0 notes](releases/0.2.0.md) describe the release candidate without creating a tag.
- [Moodle](../apps/desktop/src/main/moodle/README.md), [database](../apps/desktop/src/main/db/README.md), [cache](../apps/desktop/src/main/cache/README.md), [storage](../apps/desktop/src/main/storage/README.md), [services](../apps/desktop/src/main/services/README.md), [providers](../apps/desktop/src/main/providers/README.md), [planner](../apps/desktop/src/main/planner/README.md), [IPC](../apps/desktop/src/main/ipc/README.md), and [themes](../apps/desktop/src/shared/themes/README.md) document subsystem data flow and invariants.
