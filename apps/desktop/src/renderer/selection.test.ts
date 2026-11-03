import { describe, expect, it } from "vitest";
import { headingsIn, headingPath, resolveTextOffset } from "./selection";

describe("Markdown source offsets", () => {
  it("resolves escapes, entities and UTF-16 offsets", () => {
    expect(resolveTextOffset("a &amp; b", "a & b", 3, true)).toBe(7);
    expect(resolveTextOffset("a &amp; b", "a & b", 4)).toBe(8);
    expect(resolveTextOffset("\\*word\\*", "*word*", 1)).toBe(2);
    expect(resolveTextOffset("a😀b", "a😀b", 3)).toBe(3);
    expect(resolveTextOffset("&#x1f600;!", "😀!", 2, true)).toBe(9);
    expect(resolveTextOffset("a\r\nb", "a\nb", 2)).toBe(3);
    expect(resolveTextOffset("&frac12; of it", "½ of it", 1, true)).toBe(8);
  });
  it("resolves section boundaries and nested heading paths with a parser", () => {
    const source =
      "# One\n\ntext\n\n### Nested\n\nbody\n\n## Next\n\n```\n# Not a heading\n```\n\n# Two\n";
    const headings = headingsIn(source);
    expect(headings.map((h) => h.text)).toEqual([
      "One",
      "Nested",
      "Next",
      "Two",
    ]);
    expect(headingPath(headings, source.indexOf("body"))).toEqual([
      "One",
      "Nested",
    ]);
    expect(headingPath(headings, source.indexOf("```"))).toEqual([
      "One",
      "Next",
    ]);
    expect(headings[0]!.end).toBe(source.indexOf("# Two"));
    expect(headings[1]!.end).toBe(source.indexOf("## Next"));
    expect(headingPath(headings, 0)).toEqual(["One"]);
  });
  it("supports setext headings and formatted titles", () => {
    expect(headingsIn("An **idea**\n===\n\nBody")[0]?.text).toBe("An idea");
  });
});
