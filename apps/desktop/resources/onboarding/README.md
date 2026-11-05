# Offline recorded examples

`school.webm` and `documents.webm` are captioned sequences of real Electron screenshots from the merged school directory and theme picker. They use an example school and the local fake AI provider. They contain no real login or API key. They have no audio. The five interactive walkthrough transcripts provide text alternatives in all three interface languages.

These are deterministic recorded steps, not continuous mouse recordings. Each frame lasts five seconds. The school clip has four frames; the document clip has three. Regenerate from `apps/desktop` after building:

```sh
node e2e/first-time-user.mjs
node e2e/record-onboarding.mjs
pnpm build
```

The recorder uses the browser's canvas capture and MediaRecorder. Each file must stay below 4 MiB, for an 8 MiB combined budget. Vite bundles the assets referenced by the walkthrough component. No runtime download or external player is needed.
