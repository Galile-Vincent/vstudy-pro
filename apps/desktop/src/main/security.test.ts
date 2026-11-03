import { expect, it } from "vitest";
import { isAppUrl } from "./security";
it("denies external origins and alternate local files", () => {
  for (const entry of [
    "file:///app/out/index.html",
    "http://localhost:5173/",
  ]) {
    expect(isAppUrl(`${entry}#section`, entry)).toBe(true);
    expect(isAppUrl("https://evil.example", entry)).toBe(false);
    expect(isAppUrl("file:///etc/passwd", entry)).toBe(false);
    expect(isAppUrl("http://localhost:5173/other", entry)).toBe(false);
    expect(isAppUrl("javascript:alert(1)", entry)).toBe(false);
  }
});
