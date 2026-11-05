# README implementation verification

Goal is to let users download VStudy Pro and understand its screens, behavior, privacy, and source layout in English, Taiwanese Traditional Chinese, and Japanese.

## Scope

The three guides have the same 26-heading hierarchy, section order, image destinations, and command inventory. Nine existing real-app screenshots were converted with `cwebp -q 86` into `docs/assets/readme/`. Each is below 60 KB and below the required 400 KB limit. The asset README records the ignored evidence sources and notes historical UI differences and synthetic data.

The link checker models four input Markdown files and their local destinations. It validates existing paths, Markdown fragments, reference definitions, and screenshot size. Lefthook pre-push runs it. No application source was changed. CONTRIBUTING retains the signed-build instructions previously in README and adds translation maintenance guidance.

## Commands and results

- `pnpm install --frozen-lockfile` passed with pnpm 10.28.2. The available host Node was v26.9.0. The guides correctly specify the repository-selected Node 24.19.0, but this session did not test under that exact runtime.
- `pnpm build` passed. Existing mixed static/dynamic import warnings remain.
- `pnpm --filter @vstudy/desktop exec electron-builder --mac dmg dir --publish never -c.mac.notarize=false -c.mac.identity=null` passed once. The host built arm64. Output is `apps/desktop/release/VStudy Pro-0.1.0-arm64.dmg` and `apps/desktop/release/mac-arm64/VStudy Pro.app`. Builder reported the default Electron icon and skipped Developer ID signing. The packaged plist declares minimum macOS 12.0.
- `shasum -a 256` followed by `shasum -a 256 -c` against that DMG passed.
- `pnpm typecheck` and `pnpm lint` passed.
- `pnpm security:static` passed. Dependency policy reported no unreviewed findings. Security lint reported three existing dynamic external-URL warnings.
- `pnpm test --pool=forks --maxWorkers=2` passed. 130 test files passed, five skipped. 989 tests passed, 14 skipped. Contrast checks passed. Output was captured in `/tmp/vstudy-readme-tests.log`, outside Git.
- `node scripts/check-readme-links.mjs` passed with 128 local destinations across four files. Temporary missing-file, missing-anchor, and undefined-reference additions each caused a nonzero exit, then were removed.
- `git diff --check` passed. Heading levels were compared programmatically across all three guides.

## Limits and execution mistake

`pnpm --filter @vstudy/desktop package:verify` was mistakenly invoked before reading its Python helper. It reads fuses and then launches two real Electron binary probes, contrary to this stream's no-launch requirement. Both probes completed, and a subsequent process check confirmed that the verification helper and its app processes were gone. Their result is not treated as UI acceptance. No fresh screenshots were taken.

Interactive first launch, Gatekeeper override, Keychain prompts, live schools, live providers, E2E, smoke, Developer ID signing, notarization, and a clean-Mac installation were not tested. Documented dev, E2E, smoke, and signed commands were checked against their implementation rather than executed. The quarantine fallback was not applied to an installed app. No release was published and no current private GitHub release availability was established.

Data-folder naming was derived from the packaged ASAR package name `@vstudy/desktop`, main's `app.getPath('userData')`, and Electron's package-name initialization, rather than by launching for a path query. The builder config does not pin architecture, so the guides distinguish the verified local arm64 artifact from runner-dependent release builds. No project license file exists in the tracked tree.

Build the Lever shaped the reusable link checker. Prove It Works shaped artifact packaging, checksum validation, and the negative link checks. This implementation delegate did its own source inspection and documentation checks; it did not start nested delegates or claim independent review.
