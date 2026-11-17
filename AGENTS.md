# Agent rules for VStudy Pro

These rules apply to every agent working in this repo, including Claude Code and Codex.
They add to [CONTRIBUTING.md](CONTRIBUTING.md) and [the engineering guide](docs/ENGINEERING.md). They do not replace them. Follow those for branches, Conventional Commits, hooks, checks, and releases.
`apps/mcp/plugins/codex/AGENTS.md` is product guidance shipped inside the Codex plugin. It is not a rule file for this repo.

## 1. Work style

- Run non-trivial work through the `t3-pstack:poteto-mode` skill and its playbooks. A one-line edit or a question may skip the playbook. Verify on the real artifact anyway.
- Name the data shape and the smallest change that meets the goal before you write code.
- Keep one purpose per branch. Do not mass-format files another stream is editing.
- Read the existing code and docs first. Match their conventions. Add user-facing strings to all three locales as the engineering guide describes.

## 2. Linear is the record

Team: **VCStudio** (key `VC`). Project: **VStudy Pro**.

- One canonical Linear issue per piece of work. Search for an existing one before you create one.
- One owner thread per issue. That thread is the only writer on the issue's branch and file set.
- Start a separate thread or child only for bounded, separate work, such as an independent review or a disjoint file set. Never run two writers on one branch or one set of files.
- The issue description is a short PRD for a person to read. It has `## Goal`, `## Problem`, `## Scope`, and `## Acceptance criteria`. Put plans, file lists, and logs in a collapsible `+++ Agent notes` section at the end.
- Branch names carry the issue key, for example `feat/vc-12-short-name`.
- Record problems, root causes, blockers, decisions, and evidence on the issue. Do not keep them only in chat.

### Status transitions

Use only the real VC statuses and set each one from evidence. Check the live list with `list_issue_statuses` before a transition.

| Status | Set it when |
| --- | --- |
| Backlog, Todo | Work is not started and nothing is running. |
| In Progress | A person is working on it, or work is paused mid-way with nothing running. |
| t3 running | An agent run is actively implementing, fixing, or running checks right now. |
| In Review | An independent review of the exact head commit has started and its verdict is pending. |
| Needs Vincent | Only Vincent can unblock it. The comment names the exact question and the next action after he answers. |
| Ready for PR | Implementation, checks, and review are done on the exact head, and no run or review is pending. This status grants no permission to push, open a PR, or merge. |
| Done | The outcome is delivered and verified, with the evidence on the issue. |
| Canceled, Duplicate | The work is dropped, or another issue owns it. Link that issue. |

Rules:
- Never leave an issue on t3 running when no run is active. When a run stops, finishes, or blocks, move the issue to the status the evidence supports.
- An open PR alone is not evidence of active work or of review.
- Merged Staging, Staging Reviwed (sic, this is the real spelling), and Merged Prod do not apply by default. VStudy Pro is a desktop Electron app that ships through GitHub releases. It has no staging environment. Use those states only when Vincent explicitly names a staging or production step for that issue, and say in the comment what it means.
- Reconcile the status at the start of work, at each phase change, at each blocker or stop, and before your final reply. Each time, set the status, add a short evidence comment, and read the issue back to confirm it saved.

### Evidence comments

Each status comment states:
- The exact branch and head commit SHA.
- What ran, the command, and its result.
- What did not run and why.
- Blockers, stated plainly, with the next action and who owns it.

Never report CI or a check as passed when it was skipped or did not run. A skipped test is not evidence. Say "not run" and give the reason.

## 3. Implement, review, repair, verify

1. **Implement.** One writer builds the change in its own branch or worktree.
2. **Independent review.** A reviewer from a different model family reads the exact head commit. Your own review, passing tests, and CI do not count as this verdict. If no independent reviewer can run, the issue stays out of Ready for PR. Record `BLOCKED: independent review` and say which reviewers ran.
3. **Repair.** Fix each verified finding. Dismiss a nit or an impossible edge case with a concrete reason. Round 1 reviews the whole change. Later rounds review only the fix diff.
4. **Re-verify on the exact head.** After every repair, rerun the applicable checks on the new head commit and report the SHA. Do not claim done on a stale commit.
5. **Stop after three fix rounds.** Report the open findings, what kind of failure they suggest, and a recommendation.

Checks come from the repo, not from memory. Run what applies to the change.

| Change | Check |
| --- | --- |
| Any TypeScript | `pnpm typecheck`, `pnpm lint` |
| Behavior | `pnpm test` (hooks and CI use `--pool=forks --maxWorkers=2`) |
| Security, IPC, or file access | `pnpm security:static` |
| Build, packaging, or GUI flow | `pnpm build`, `pnpm smoke`, `pnpm e2e`, or the one relevant script in `apps/desktop/e2e/` |
| README or docs links | `node scripts/check-readme-links.mjs` |

Electron checks use real memory. Run one Electron instance at a time.

## 4. UI evidence gate

A UI change needs real rendered evidence before it moves to Ready for PR. Code review, a passing build, and structural assertions do not prove the UI.

- Capture the real built Electron app. Mockups, static HTML, and hand-edited images do not count.
- Use synthetic demo data in a disposable profile. `apps/desktop/scripts/marketing-seed.mjs` and `apps/desktop/e2e/fixtures/` hold fixtures. `VSTUDY_FAKE_PROVIDER=1` avoids AI calls.
- Cover light and dark. Cover a wide window (1440 px) and a narrow one (about 720 to 900 px). Cover each changed state, such as empty, loading, error, and selected.
- Capture before and after for every UI change. Take the "before" from the base commit.
- Inspect each image for clipping, overflow, wrapping, spacing, alignment, and contrast. Check keyboard focus on changed controls. Say what you checked.
- Run `pnpm --filter @vstudy/desktop contrast:check` and `pnpm --filter @vstudy/desktop ui:check` when you change colors, themes, or styles.
- Harness examples. `apps/desktop/scripts/marketing-shots.mjs` captures 1440 px views in light and dark. `apps/desktop/e2e/assistant-elements.mjs` and `apps/desktop/e2e/privacy-segmented-control.mjs` resize the window and switch the color scheme. Copy their pattern for a new capture.
- `marketing-shots.mjs` overwrites tracked files under `docs/evidence/marketing`, `docs/assets/readme`, and `apps/website/src/assets/shots`. Do not commit those changes unless the issue is about marketing images. Use `SHOT_ONLY`, `SHOT_THEMES`, and `SHOT_MODES` to limit a run, then restore unrelated files.
- Do not commit screenshots or recordings. Follow the evidence policy in CONTRIBUTING.md. Attach the images to the Linear issue. Link them from the PR with the commit and command that produced them.

## 5. Privacy

Evidence must contain no private course or account data, student content, credentials, tokens, or real notifications. Use synthetic data. Check each screenshot and log before you attach it. Use read-only Moodle functions unless Vincent approves a write action.

## 6. Authority

- Commit locally in the owner thread. Push, open a PR, edit a PR, merge, tag, or publish a release only when Vincent asks for that action. Approval for one action does not extend to the next.
- Keep `main` releasable. Follow the release checklist in CONTRIBUTING.md. Dry runs are unsigned and non-publishing.
- Never create credentials, change auth or security settings, or switch login sessions to get around a limit or a block. Report the block on the issue and set Needs Vincent.
- Do not change global agent instructions or machine-wide settings from this repo's work.
