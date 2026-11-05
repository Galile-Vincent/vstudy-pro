# Stream H implementation notes

The goal is maintainable version control, contributor documentation, and reproducible repository checks without source churn.
Work is on `t3/repo-hygiene`. No application source, shared IPC contract, locale, token file, or vendor manifest was edited.

## Baseline proposal

The starting `main` commit was `8e429e0477ccbd64245e661ff7d64734bb48d2bc`.
Propose an annotated `v0.1.0` baseline tag at that commit after coordinator review.
This stream created no tag, rewrote no history, pushed nothing, and published no release.
The coordinator owns baseline tagging and branch protection settings.

## Tracking audit

`git ls-files -z` with file-size inspection found no tracked `apps/desktop/out`, `release`, or `node_modules` content.
Those paths were already ignored. The DMG was not tracked in this checkout.
The index contained 20,580,076 bytes of files before this change.
`git rm --cached` removed `docs/sbom.cdx.json` and 75 PNG evidence files, totaling 13,011,247 bytes.
All 76 files remained on disk after removal. Source PDF fixtures and bundled sample assets remain tracked.
The old files stay in prior commits. Historical documentation links may require checking out that recorded commit or opening a release attachment.

`git count-objects -vH` measured 2.30 MiB loose and 21.06 MiB packed before the change.
After the index cleanup and checks it measured 2.31 MiB loose and 21.06 MiB packed.
These are shared object-store sizes across concurrent worktrees, not the size of this branch's file tree.
Removing index entries cannot reclaim historical objects. No garbage collection or history rewrite was attempted.
The command reports a 64-byte worktree refs item as garbage. This stream left Git metadata untouched.
Raw snapshots are in [the evidence directory](evidence/repo-hygiene/).

[CONTRIBUTING](../CONTRIBUTING.md) explains the choice to keep screenshots and video in attachments rather than require Git LFS now.

## Decisions and data shapes

Hook commands are a Lefthook YAML map keyed by hook and check name. Checks run serially.
The changelog uses git-cliff commit-parser records with regex and group fields. Legacy subjects are retained under matching groups or Other changes.
Workflows separate read-only build jobs from the release upload job with `contents: write`.
Release tags must match the desktop manifest's SemVer version. CI attaches unsigned artifacts and SHA-256 checksums to a draft release.
Signed distribution still requires `pnpm package:signed` and the documented manual verification.

The Model the Domain principle led to declarative hook and changelog tables rather than a custom release engine.
The Prove It Works principle led to direct hook invocation, valid and invalid commit-message checks, no-Git installation checks, and actionlint validation.
No subagents ran because the operator prohibited them. Independent review remains with the coordinator.

## Commands and results

All commands ran from this worktree. Output logs are in [evidence/repo-hygiene](evidence/repo-hygiene/).

| Exact command | Result |
| --- | --- |
| `git status --short` and `git branch --show-current` | Initially clean on `t3/repo-hygiene`. |
| `git ls-files -z` with Python size inspection | Found generated SBOM and evidence PNGs. |
| `git rm --cached -- <76 artifact paths selected from git ls-files>` | Success. Python verified every removed path still existed. |
| `git count-objects -vH` before and after cleanup | Recorded above. No history size reduction claimed. |
| `pnpm add -DwE @commitlint/cli @commitlint/config-conventional lefthook git-cliff` | Passed. Exact versions written to manifest and lockfile. Existing electron-builder peer warnings remain. |
| `CI=true pnpm install --frozen-lockfile` | Passed. Hook setup skipped. Existing unapproved optional dependency scripts remain disabled. |
| `pnpm typecheck-fast` | Passed. |
| `pnpm typecheck` | Passed. |
| `pnpm lint` | Passed. |
| `pnpm test --pool=forks --maxWorkers=2` | Passed once. 93 files passed, 5 skipped. 727 tests passed, 14 skipped. No watch mode. |
| `pnpm build` | Passed. Built main, preload, and renderer without launching Electron. |
| `pnpm security:check` | Failed at audit before lint/tests. Unreviewed advisory 1244623, minimatch globparts amplification denial of service. |
| `pnpm security:static` | Failed at the same audit. |
| `pnpm audit --json` | Exit 1 with vulnerability report. Advisory paths use minimatch 9.0.9 and 10.2.6 from existing desktop dependencies. Both versions were present in the starting lockfile. |
| `pnpm --filter @vstudy/desktop exec node scripts/security-lint.mjs` | Passed with two existing Electron URL warnings. |
| `pnpm vendor:check` | Failed. Eight vendor files have unreviewed drift and suggestions.test.ts is an untracked vendor source according to its manifest. Left to the owning stream. |
| `pnpm knip` | Failed. Five unused source files, tw-shimmer, and three unlisted openssl calls. No new root tooling findings. |
| `pnpm exec lefthook validate` | Passed. |
| `pnpm exec lefthook dump` | Verified parsed configuration. |
| `pnpm exec lefthook run pre-commit --file apps/desktop/src/shared/plain-text.ts --no-auto-install` | Passed. Actual staged-file ESLint and incremental typecheck ran. Verbose repeat confirmed the app-relative file path. |
| `CI=true pnpm exec lefthook run pre-push --force --no-auto-install` | Passed without running tests. |
| `CI=true pnpm exec lefthook run pre-commit --file apps/desktop/src/shared/plain-text.ts --no-auto-install` | Passed without running checks. |
| `CI=true pnpm exec lefthook run commit-msg --no-auto-install --force /tmp/nonexistent-commit-message` | Passed without reading a message. |
| `pnpm exec commitlint` with stdin `chore(repo): improve hygiene` | Exit 0. |
| `pnpm exec commitlint` with stdin `bad commit message` | Exit 1 as expected. |
| `node scripts/install-hooks.mjs` under a temporary non-Git cwd and under `CI=true` | Both exit 0 with no hook installation. |
| `node scripts/install-hooks.mjs` in a temporary initialized Git repository with the local tool PATH | Exit 0. Created pre-commit, commit-msg, and pre-push hooks. Temporary repository removed afterward. |
| `node --check scripts/install-hooks.mjs` and `node --check commitlint.config.cjs` | Passed. |
| `brew install actionlint` | Installed actionlint 1.7.12 for local validation. |
| `actionlint .github/workflows/ci.yml .github/workflows/release.yml` | Passed with no findings. |
| `pnpm release` | Passed. Generated grouped changelog from current history. |
| `pnpm release --tag v0.1.0 --output /tmp/vstudy-h-proposed-changelog.md` | Failed because the script already supplies --output. Corrected command below. |
| `pnpm release --tag v0.1.0` followed by `pnpm release` | Both passed. Verified proposed-version generation, then restored Unreleased output. No tag created. |
| `git check-ignore apps/desktop/out/main/index.js apps/desktop/release/test.dmg node_modules/.cache docs/screenshots/moodle/course-dark.png docs/sbom.cdx.json docs/evidence/test/video.webm` | All ignored. |
| `git diff --check` | Passed. |

## Verification limits

The operator prohibited Electron launches, background servers, extra agents, and repeated full-suite runs because RAM was nearly full.
`pnpm dev`, `pnpm smoke`, `pnpm e2e`, signed packaging, and the GitHub release upload were not run.
The engineering guide marks GUI commands accordingly. No screenshots were created because no UI changed.
The focused registrar test command in the guide is covered by the single full-suite run rather than a second execution.
CI will remain red until the security, vendor, and knip findings are resolved by their owners.
The new workflows have local syntax validation, not a hosted GitHub Actions run.
