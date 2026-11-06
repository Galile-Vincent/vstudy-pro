# W3 provider verification

The W4 schools band replaces the former school demo. Its playback code, tests, screenshots, and evidence references have been removed. Current school checks are in [website-schools-band](../website-schools-band/VERIFICATION.md).

The provider section remains unchanged. `data/trust.ts` owns the provider connection registry and localized copy. The registry satisfies the desktop `ProviderConfig` ID union. It describes account-dependent models, connection methods, privacy categories, and the macOS limitation for Codex. Neutral brand names use the site's system typography. No provider logos ship.

The [website design notes](../../WEBSITE_DESIGN_NOTES.md) retain source grounding and official brand references. The provider captures in this directory cover English, Traditional Chinese, and Japanese at 390px and 1440px in light and dark. `screenshot-manifest.json` lists those twelve provider captures. The retained W3 JSON audits are historical measurements of that revision.

`verify-browser.mjs` now checks the provider section without school playback assertions. `verify-controls.mjs` checks the localized connection guide. The current W4 verification does not claim to have rerun the retained provider harness. `verify-lighthouse.mjs` remains a general home and guide audit.

QA packages stay outside the workspace. Set `QA_PACKAGE_DIR`, `WEBSITE_URL`, and `CHROME_PATH` when rerunning these scripts. Use one browser at a time.
