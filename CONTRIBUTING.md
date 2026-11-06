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
3. Review the grouped history. Write `docs/releases/<version>.md`, for example `docs/releases/0.2.1.md`. Summarize user impact, migrations, tested architectures, signing status, and known limits. Keep the filename version equal to the desktop package version without the leading `v`.
4. Complete a nonpublishing workflow dry run and the release checklist below, then merge the release PR.
5. A maintainer creates an annotated `vX.Y.Z` tag on the reviewed commit and pushes that tag. Never move a published tag.

`pnpm release` only generates the changelog. It does not bump versions, commit, tag, push, or publish.
Git-cliff fits this single-app repository without a changeset file per change or a package publishing lifecycle. Its pinned binary and one TOML file group existing history, including older nonconventional subjects.

## Release checklist

- [ ] Typecheck, lint, tests with two fork workers, build, security, vendor checks, and Knip pass on the reviewed release commit. Avoid launching a second local Electron instance.
- [ ] Review [the security model](docs/SECURITY.md), privacy disclosures, dependency exceptions, migration backups, and recovery behavior on Mac and Windows.
- [ ] Commit `docs/releases/<version>.md`. State actual signing and notarization status. Include the lack of a Windows kernel network deny for Python conversion and that Codex is disabled on Windows.
- [ ] Trigger the release workflow on a `ci/**` branch push or by manual **workflow_dispatch** for a dry run. CI branch pushes must never use signing secrets, publish a release, or upload to Releases. Inspect the workflow's dispatch inputs before running it. Dry-run output belongs in Actions artifacts.
- [ ] Inspect GitHub-hosted packaging and smoke evidence for Mac arm64, Mac x64, Windows x64, and Windows ARM64. Each packaged smoke must launch a window, exercise SQLite, check converter availability without an implicit download, and exit. A missing target or skipped launch is an open gap.
- [ ] Test direct download, per-user install, first launch, manual upgrade, and uninstall on clean Mac and Windows machines. Review Cmd on Mac, Ctrl on Windows, native controls, accessibility, locales, and first-run behavior.
- [ ] For a separately authorized signing run, verify the delivered signatures and Mac notarization using [SIGNING.md](docs/SIGNING.md#verify-the-delivered-artifacts). Invalid or partial credentials must fail. The branch-only CI dry run remains unsigned regardless of configured secrets.
- [ ] Compare the installer aliases below with the versioned files. Generate `SHA256SUMS.txt` only after all signing, notarization, and stapling finish. Validate update metadata without enabling an updater.
- [ ] Record workflow run URLs, commit SHA, platform results, artifact checksums, and signing gaps in the release review. Have the owner approve the exact reviewed commit before a tag is pushed.

The owner may authorize pushing a reviewed branch under `ci/**` to trigger a branch-only dry run. That authorization is not permission to tag or publish. A CI push receives no signing credentials, creates no release, and uploads no files to Releases. Retain installers and reports as Actions artifacts.

Manual dispatch with `dry_run: true` is also unsigned and nonpublishing. Use the GitHub Actions **Run workflow** form on the reviewed branch, or the commands below. Replace the branch placeholder and keep the dry-run value explicit.

```sh
gh workflow view release.yml --repo ava-apple/vstudy-pro --yaml
gh workflow run release.yml --repo ava-apple/vstudy-pro --ref YOUR_REVIEWED_BRANCH -f dry_run=true
```

Only an owner-approved `v*.*.*` tag may publish a non-draft release. The tag version must match `apps/desktop/package.json`, and its release notes come from `docs/releases/X.Y.Z.md`. Pushing that tag publishes. Dispatching with `dry_run: false` against that exact tag also publishes and needs the same owner approval. Non-dry dispatch against a branch fails. Never move an existing release tag or call `gh release create` as part of a dry run. A successful dry run alone does not authorize publishing.

The latest published release must contain these stable assets, versioned archives, and checksums. Signing must not change their names.

- `VStudy-Pro-mac-arm64.dmg`
- `VStudy-Pro-mac-x64.dmg`
- `VStudy-Pro-win-x64.exe`
- `VStudy-Pro-win-arm64.exe`
- `SHA256SUMS.txt`

After an owner-approved publication, test each `https://github.com/ava-apple/vstudy-pro/releases/latest/download/<filename>` link as an unauthenticated user. Check the release body and its actual signing status. Do not advertise an architecture whose packaged checks failed. Website version and file size must come from verified published assets, not the source package version or an estimate.

## Store evidence without growing Git

Keep source fixtures and small text summaries in Git. Upload screenshots, recordings, packages, and generated SBOMs as CI or release attachments. Link them in PRs with the commit and command that produced them. Remove credentials and student content first.

Existing binary evidence has been removed from the index only. Historical screenshots remain available in earlier commits. Existing prose may refer to those historical paths.
Git LFS is not required for current screenshots, which were individually below 256 KB at this audit. Keep video outside Git. Reconsider LFS if stable binary reference assets must be versioned with source. Agree on retention, hosting quota, and contributor setup first. Do not migrate history as part of routine hygiene.

See [stream H notes](docs/REPO_HYGIENE.md) for the baseline tag proposal and validation limits.

## Keep the user guides in sync

Update `README.md`, `README.zh-Hant.md`, and `README.ja.md` together. Keep the same heading order, screenshots, commands, supported features, and limits. Use natural Taiwanese Traditional Chinese and Japanese, and preserve technical names. Keep the language switcher on the first line. Check version badges against `apps/desktop/package.json` and runtime versions against `.node-version` and `package.json`.

Run `node scripts/check-readme-links.mjs` before submitting. Pre-push runs the same check. It validates local inline and reference links, Markdown heading fragments, and the 400 KB screenshot limit in the three READMEs and `docs/README.md`. It does not check remote URL availability. Stable README images are an exception to the generated-evidence retention policy above. Store optimized copies under `docs/assets/readme/` and record their source there.

## Sign a distribution build

Use [the signing guide](docs/SIGNING.md) for account enrollment, certificate export, exact secret names, Azure and PFX options, safe `gh secret set` examples, rotation, and artifact verification.

For trusted jobs permitted to sign, no credentials produces explicitly unsigned builds. Complete credentials enable signing on the same targets. Partial or invalid credentials fail instead of falling back to unsigned. Mac direct distribution needs Developer ID Application signing and successful Apple notarization. Windows uses one configured signing route. Verify signatures on the actual installer and installed executable. A `ci/**` push must never receive signing secrets.

Keep updates manual. Activating `electron-updater` is separate work after signing, Mac notarization, feed validation, user controls, and rollback policy are verified.
