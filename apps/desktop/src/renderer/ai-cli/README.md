# AI tool setup sheet

`AiCliSetupHost` mounts the Quiet folio setup sheet once at the app root. `openAiCliSetup(provider?)` is the public renderer seam for onboarding, the Reader, Settings, the sidebar, and stream M's Connect an agent flow. `desktop.invoke('ai-cli:list', {})` supplies file-only state without launching disabled providers. No MCP files need to import a second installer or executable resolver.

`model.ts` derives the Install, Sign in, or Test step from `CliToolState`. `use-tools.ts` reads the inventory. `use-action.ts` previews and runs one main-issued action capability, polls output while visible, and closes late sessions on teardown. `preview.tsx` shows the plan before its Run button. Copy-only vendor installer commands in `manual-install.tsx` are never submitted to main for execution.

`terminal.tsx` renders bounded inert text with xterm.js. It reveals a new action's output, follows semantic theme tokens, and accepts input only for a running login or explicitly enabled advanced shell. HTTPS links pass through the existing native external-link confirmation. `inventory.tsx` keeps versions and update state visible in the sidebar. `preferences.tsx` supplies default-off update and advanced-shell controls in Privacy.

Keep all new UI strings in `shared/locales/{en,zh-Hant,ja}/ai-cli.json`. The sheet uses existing semantic tokens, supports enlarged text and keyboard dismissal, and never builds an executable command to send to main. Status and tiny tests use the real main adapters.

```sh
pnpm --filter @vstudy/desktop test src/renderer/ai-cli/setup.test.tsx --pool=forks --maxWorkers=2
pnpm --filter @vstudy/desktop contrast:check
```

Component tests cover consent, preview before execution, recovery, cancellation, hidden polling, owner cleanup, update compatibility, rollback, and hostile output. The real Electron suite and three-language/theme/scheme screenshots live in [the acceptance evidence](../../../../../docs/evidence/ai-cli/index.md). Component fixtures alone do not establish native installation or authentication.
