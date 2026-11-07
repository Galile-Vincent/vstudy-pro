# Stream C: renderer startup and Markdown

Baseline: c67522f5. Same worktree, dependencies and build command for both measurements:
`pnpm --filter @vstudy/desktop exec electron-vite build` (exactly one baseline and one fixed build).
`bundle-before.json` and `bundle-after.json` retain all emitted JS chunk names and byte sizes.
The after inventory also retains static/dynamic JS import edges and content markers.

| Measurement | Before | After |
| --- | ---: | ---: |
| Renderer entry bytes | 5,458,028 | 1,857,416 |
| Total renderer JS bytes | 7,773,251 | 4,188,312 |
| Emitted renderer source maps | 0 | 0 |

The entry has no static JS chunk imports. Entry markers `xterm-screen`, `react-markdown`,
and `reading-scroll` were present before and absent after. Afterward their respective chunks
are `terminal-DQsFzprp.js` (333,999 bytes), `index-BAQQROFi.js` (52,384), and
`markdown-Cguuy48X.js` (11,297). Chat is `chat-CKkFS3ql.js` (520,652), setup is
`setup-Bz2JjTsz.js` (15,838). `math-plugins-COooPPQk.js` (276,146) remains dynamic;
KaTeX was absent from the entry before and after. Highlight.js grammars remain dynamic too.

Profiler fixture: 33,803 ASCII bytes, 512 Markdown paragraphs with emphasis and links.
Both document and reply renderers committed twice before and once after. The math fixture
(14 bytes) committed twice both times and produced `.katex`. The test also verifies that
plain Markdown does not load the math module. See retained verbose Profiler logs.
These are jsdom development React measurements, not production wall-clock claims.

Validation:
- 64 focused Markdown/CLI/setup/app-recovery tests passed.
- 62 focused Profiler/course/review tests passed (includes the same 3 Profiler cases).
- Desktop typecheck and ESLint on all touched TypeScript files passed.
- `pnpm --filter @vstudy/desktop exec node scripts/security-lint.mjs` passed with the
  existing 3 allowlisted openExternal warnings, zero errors.
- Renderer output inventory contains no maps/tests/docs/e2e/fixtures.

No renderer reliance on function/constructor names or tests grepping readable built renderer
symbols was found. Error handling uses explicit codes. Minification changes only renderer
build options; source-map policy is unchanged. The checked-in historical
`docs/security-evidence/bundle-inventory.json` counts packaged ASAR files; no producer for
that historical JSON exists in the repository. No packaged application was built or launched.
The renderer inventory here checks the relevant emitted output without claiming ASAR coverage.
Vite still warns about chunks over 500 kB; the entry and Chat remain above that threshold.
