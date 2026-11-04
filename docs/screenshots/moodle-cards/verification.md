The captures use real Electron with the production renderer build and an isolated temporary profile. Course names, progress, and dates come from all 47 rows in `apps/desktop/src/main/moodle/fixtures/real-cycu-courses.tsv`. The mock invokes the production identity parser. Deadline titles and course contents are synthetic.

On November 4, 2026, the fixture has 11 Current courses and 36 Past courses. Lifecycle tests inject that date and assert date-based classification for every row. Server lifecycle precedence has separate tests.

To regenerate from the repository root, run these commands.

```sh
NODE_OPTIONS=--no-experimental-webstorage VITE_MOCK_DESKTOP=1 VITE_MOODLE_REAL_COURSES=1 pnpm build
NODE_OPTIONS=--no-experimental-webstorage pnpm --filter @vstudy/desktop exec node scripts/verify-moodle-cards.mjs
NODE_OPTIONS=--no-experimental-webstorage pnpm build
```

The last command restores a normal production build. Neither fixture flag is enabled by default.

The script captures Current, Past, and All at 1440, 1000, and 760 CSS pixels in light and dark modes. It also captures due-soon cards at all six combinations, the course hero at 760 pixels, and the last content row at 760 pixels. All 28 PNG files were visually inspected. `geometry.json` records card counts and slot dimensions for the 18 tab captures. The script asserts matching card and slot heights across every visible course, matching due-soon card heights, matching heights between both card types, correct hero identity, and clearance above the floating chat button at the last row.

Validation passed with Node 26 and `NODE_OPTIONS=--no-experimental-webstorage`.

- `pnpm typecheck`.
- `pnpm lint`.
- `pnpm test`, through `pnpm security:check`, with 682 passing and 13 skipped tests.
- `pnpm security:check`, including the dependency audit, ESLint, security lint, and test suite.
- `pnpm build`, for both fixture and normal production builds.

The 13 skipped tests are existing suite skips. This run did not contact live CYCU Moodle. A parent review remains separate from this implementation delegate's checks.
