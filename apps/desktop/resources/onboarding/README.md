# Onboarding media

`hero-dark.webp` and `hero-light.webp` are lossless 2x stills of the real Electron reader and chat. The welcome screen preloads both images, with the light asset revealed by the app's resolved `data-scheme`. Each asset is 2560 pixels wide and must stay below 1.5 MB. There is no playback or caption strip.

Regenerate the hero and verify the welcome dialog from `apps/desktop`:

```sh
pnpm build && node e2e/capture-onboarding-hero.mjs && pnpm build
```

The capture imports the English sample, selects a sentence, and sends a question to a script-local loopback AI fixture. It uses a temporary profile and `deviceScaleFactor: 2`, closes the sidebar, and captures only the reader and chat at 150% UI text size. It hides fixture usage counters through capture-only CSS. Real product usage information remains available. It rejects prompt dumps and checks image dimensions and size. A second fresh profile verifies both welcome schemes and saves 2x dialog screenshots and measurements under `docs/evidence/onboarding/hero/`. To use an already running dev renderer, prefix the Node command with `ELECTRON_RENDERER_URL=http://localhost:5173`.

## Walkthrough recordings

`school.webm` and `documents.webm` are captioned sequences of real Electron screenshots from the merged school directory and theme picker. They use an example school and the local fake AI provider. They contain no real login or API key. They have no audio. The five interactive walkthrough transcripts provide text alternatives in all three interface languages.

These are deterministic recorded steps, not continuous mouse recordings. Each frame lasts five seconds. The school clip has four frames; the document clip has three. Regenerate from `apps/desktop` after building:

```sh
node e2e/first-time-user.mjs
node e2e/record-onboarding.mjs
pnpm build
```

The recorder uses the browser's canvas capture and MediaRecorder. Each file must stay below 4 MiB, for an 8 MiB combined budget. Vite bundles the assets referenced by the walkthrough component. No runtime download or external player is needed.
