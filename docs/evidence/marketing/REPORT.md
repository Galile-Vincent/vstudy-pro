# Current marketing refresh

Base: main `6ee5617d`. Implementation branch: `chore/refresh-marketing-captures`.

The app was built from this base, then captured with disposable synthetic fixtures. No user profile, school credentials, provider login, live school request, or paid AI request was used. Converter package downloads are the only external setup required by the fixture. The native Moodle page is served over loopback.

## Scope

Retake the existing eleven views in every existing palette/mode. Extend to all nine app palettes and add converted figures, original PDF page, page attached to chat, Usage settings, Connect AI, and school discovery: 17 views × 9 palettes × 2 schemes = 306 variants, each WebP and AVIF, plus default aliases and README exports. Remove the stale public school-picker duplicate; preserve established shot names. The brand-only OG image does not need regeneration.

Home feature cards now show attachments, subscription limits, Connect AI and the current MCP grant workflow. Appearance previews show Card transparency and default document opening. English, Traditional Chinese and Japanese share equivalent reader, customization and usage guides and feature lists. README feature/customization lists and AI parsing availability are updated in all three languages. Existing unrelated untranslated reference guides retain the explicit English fallback.

## Pipeline repairs

The original fixed November 6 epoch caused production planner validation to reject study blocks once that date passed. Capture dates now default to tomorrow, with SHOT_DATE for an explicit valid future epoch. Old Moodle hero and Library row selectors no longer matched the current app. School discovery uses its actual combobox. New reader shots explicitly await the chat composer and the capture step rejects a loading conversation. Visible images are decoded and error alerts rejected. Synthetic subscription windows and CLI inventory avoid account discovery; analytics and memory consent cards are disabled in the fixture. A generated PDF exercises real figure extraction and page rendering. AVIF effort is reduced from 4 to 2 while retaining quality 50 and the same byte ceiling.

## Verification

Final command results and image audit are recorded alongside this report. Raw PNGs, per-palette review sheets, and built-site screenshots remain local ignored evidence. The existing tracked full contact sheet is updated; older historical evidence files are preserved. The capture manifest is the source of truth for per-file dimensions, sizes and capture epoch.

The first capture attempts failed on the stale date and selectors, and visual review caught the memory consent card, a synthetic graph drawing mistake, and a transient loading conversation. These were corrected before accepting the corresponding captures. The shared preview DOM check worked, but preview screenshots twice timed out; local Playwright with isolated Chrome was used for built-site visual checks.

Final results: [VERIFICATION.md](VERIFICATION.md), [export audit](export-audit.json), and [browser checks](site/checks.json). All 306 final captures passed. The largest derivative is 193,548 bytes. Website build produced 64 pages; static verification checked 3,664 links with zero failures. Root typechecking, script lint and download verification passed.

Language coverage: English, Traditional Chinese and Japanese each gained equivalent reader (figures, original view, attachment, AI re-parsing), customization (nine palettes, Card transparency, text/density/font, language, opening method) and usage guides; updated Connect AI steps, home feature cards, MCP availability/permissions, demo captions, and README feature lists. Other established reference guides keep their existing explicit English fallback.
