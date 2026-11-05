# Contribute to VStudy Pro

Use [the engineering guide](docs/ENGINEERING.md) to install dependencies, navigate the code, and run checks.

## Make a focused change

1. Branch from current `main`. Use a short-lived `t3/<topic>` or `feat/<topic>` branch.
2. Keep one purpose per branch. Update from `main` frequently. Avoid mass formatting while other streams edit source.
3. Add tests for behavior and update the relevant subsystem documentation. Explain non-obvious constraints in comments.
4. Open a pull request using the template. Link the issue, record exact checks, and attach UI evidence when relevant.
5. Request a CODEOWNERS review. Merge only after CI and review pass. Prefer squash merge, then delete the branch.

Use trunk-based development. Keep `main` releasable. Do not use a long-lived develop branch. Configure GitHub protection for `main` to require the CI `check` job, one approval, resolved conversations, and no force pushes. Repository settings require a maintainer to enable them.

## Write Conventional Commits

Use `type(scope): summary`. Supported types include `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `build`, and `ci`.
Use `!` or a `BREAKING CHANGE:` footer for an incompatible change. Use an imperative summary and a body that explains why.
A squash PR title must also follow this format. Add `Co-Authored-By: Codex <noreply@openai.com>` when Codex contributes.

`pnpm install` attempts to install Lefthook in local Git checkouts. CI and archives without Git skip installation. Installation does not fail if hooks cannot be installed.
Pre-commit runs incremental typechecking for staged TypeScript and ESLint for staged app code. It does not rewrite staged files. Partially staged source is checked using its working-tree content. CI checks the complete committed tree.
Commit-msg runs commitlint. Pre-push runs tests with two workers. Hooks skip when `CI` is set. Use `LEFTHOOK=0` only for a documented exceptional bypass. CI remains required.

## Prepare a version

The desktop version in `apps/desktop/package.json` is authoritative. Use SemVer. Increment patch for fixes, minor for compatible features, and major for incompatible changes. During `0.x`, document incompatible changes prominently and increment minor.

1. Update the desktop version in a release PR.
2. Run `pnpm release --tag vX.Y.Z` to regenerate `CHANGELOG.md` with that proposed version.
3. Review the grouped history. Summarize user impact and call out migrations or breaking changes.
4. Complete the release checklist below, then merge the release PR.
5. A maintainer creates an annotated `vX.Y.Z` tag on the reviewed commit and pushes that tag. Never move a published tag.

`pnpm release` only generates the changelog. It does not bump versions, commit, tag, push, or publish.
Git-cliff fits this single-app repository without a changeset file per change or a package publishing lifecycle. Its pinned binary and one TOML file group existing history, including older nonconventional subjects.

## Release checklist

- [ ] Typecheck, lint, tests, build, `pnpm security:check`, `pnpm vendor:check`, and `pnpm knip` pass on the release commit.
- [ ] Review [the security model](docs/SECURITY.md), dependency exceptions, privacy, migration backups, and recovery behavior.
- [ ] Run the Electron smoke and E2E checks on a machine with sufficient memory. Review keyboard, VoiceOver, locales, and first-run behavior.
- [ ] Set signing and notarization credentials outside the repository as described below.
- [ ] Run `pnpm package:signed`. Verify codesign, stapling, Gatekeeper, and first open on a clean Mac using the commands below.
- [ ] Generate SHA-256 checksums for the exact signed DMG. Attach checksums, evidence, and release notes.
- [ ] Confirm the version matches the tag and obtain maintainer approval before distributing the signed artifact.

A tag push produces an unsigned macOS test DMG, checksums, and a draft GitHub release. It never receives signing secrets. The unsigned CI artifact does not satisfy the signed release checklist. Replace it with verified signed artifacts before publication.

## Store evidence without growing Git

Keep source fixtures and small text summaries in Git. Upload screenshots, recordings, packages, and generated SBOMs as CI or release attachments. Link them in PRs with the commit and command that produced them. Remove credentials and student content first.

Existing binary evidence has been removed from the index only. Historical screenshots remain available in earlier commits. Existing prose may refer to those historical paths.
Git LFS is not required for current screenshots, which were individually below 256 KB at this audit. Keep video outside Git. Reconsider LFS if stable binary reference assets must be versioned with source. Agree on retention, hosting quota, and contributor setup first. Do not migrate history as part of routine hygiene.

See [stream H notes](docs/REPO_HYGIENE.md) for the baseline tag proposal and validation limits.

## Keep the user guides in sync

Update `README.md`, `README.zh-Hant.md`, and `README.ja.md` together. Keep the same heading order, screenshots, commands, supported features, and limits. Use natural Taiwanese Traditional Chinese and Japanese, and preserve technical names. Keep the language switcher on the first line. Check version badges against `apps/desktop/package.json` and runtime versions against `.node-version` and `package.json`.

Run `node scripts/check-readme-links.mjs` before submitting. Pre-push runs the same check. It validates local inline and reference links, Markdown heading fragments, and the 400 KB screenshot limit in the three READMEs and `docs/README.md`. It does not check remote URL availability. Stable README images are an exception to the generated-evidence retention policy above. Store optimized copies under `docs/assets/readme/` and record their source there.

## Sign a distribution build

Install a Developer ID Application certificate in your build keychain. Set `CSC_NAME` to its identity, or set `CSC_LINK` to a private certificate file and `CSC_KEY_PASSWORD` to its password. For notarization, set `APPLE_API_KEY` to your private `.p8` path, `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER`. Alternatively, use `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`. Keep all credentials outside Git.

`pnpm package:signed` rejects missing signing or notarization configuration, builds with hardened runtime, and requests notarization. Verify the actual artifact before distribution.

```sh
pnpm package:signed
codesign --verify --deep --strict 'apps/desktop/release/mac-arm64/VStudy Pro.app'
xcrun stapler staple 'apps/desktop/release/mac-arm64/VStudy Pro.app'
xcrun stapler validate 'apps/desktop/release/mac-arm64/VStudy Pro.app'
spctl --assess --type execute --verbose 'apps/desktop/release/mac-arm64/VStudy Pro.app'
```

Verify first-open behavior on a quarantined copy on a clean Mac. Generate `SHA256SUMS.txt` with `shasum -a 256 ./*.dmg > SHA256SUMS.txt` from `apps/desktop/release`. Attach it beside the exact signed DMG. An unsigned build passing packaging checks does not establish Developer ID trust or notarization.
