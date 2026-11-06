# AI setup folio layout

Choose a two-column folio with the current instruction beside its reviewed action. A vertical rail spends too much width on three step names. A stacked layout pushes the command preview below the account explanation. The folio retains the provider chooser and three numbered steps above both columns. Narrow windows collapse to one column.

Three static sketches live outside the repository in `/private/tmp/vstudy-ai-cli-renderer-sketches/`. They compare the folio, a vertical rail, and a stacked layout.

The first real Electron review found that the default 1200 by 768 window hid the Run button below the footer. Round 2 shortens the introduction, compacts the chooser, bounds the scrollable full command preview, and moves account details behind an accessible disclosure. The command remains keyboard-focusable. The test now checks the primary action fits above the footer at default size. Round 3 tightens short-window spacing and flattens the high-contrast sheet.

Screenshots in `docs/evidence/ai-cli/round-1/`, `round-2/`, and `round-3/` use visual fixtures only. They do not establish installation or authentication behavior. The process acceptance suite has separate evidence.
