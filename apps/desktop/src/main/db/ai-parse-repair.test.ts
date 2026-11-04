import { DatabaseSync } from "node:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { openStore } from "./index";

it("repairs a v11 database that lacks the parse rollup table", () => {
  const file = join(mkdtempSync(join(tmpdir(), "repair-")), "s.sqlite");
  const first = openStore(file);
  first.close?.();
  const raw = new DatabaseSync(file);
  raw.exec("DROP TRIGGER usage_parse_rollup; DROP TABLE usage_parse_daily; DELETE FROM migrations WHERE version=12;");
  raw.close();
  const store = openStore(file);
  expect(() => store.usage.dashboard("7d" as never)).not.toThrow();
  store.close?.();
});
