// @vitest-environment jsdom
import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
const coursesCss = readFileSync("src/renderer/courses/courses.css", "utf8");
const rootCss = readFileSync("src/renderer/style.css", "utf8");

it("gives flat week headings a contrast edge without restoring card paint", () => {
  const style = document.createElement("style");
  style.textContent = coursesCss;
  document.head.append(style);
  try {
    const media = [...style.sheet!.cssRules].filter(
      rule => rule.type === 4 && /contrast|forced-colors/.test((rule as CSSMediaRule).media.mediaText),
    ) as CSSMediaRule[];
    expect(media.some(rule => [...rule.cssRules].some(child =>
      child.cssText.includes(".moodle-week-heading") && child.cssText.includes("outline"),
    ))).toBe(true);
    expect(rootCss).not.toMatch(/:is\([^)]*\.moodle-week[,)]/);
  } finally {
    style.remove();
  }
});
