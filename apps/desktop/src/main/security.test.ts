/**
 * Regression coverage for security.
 * Owned by main.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
import { expect, it } from "vitest";
import { isAppUrl, productionCsp } from "./security";
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

it("permits required style and font sources while keeping scripts strict", () => {
  const directives = productionCsp.split("; ");
  expect(directives.find(d => d.startsWith("script-src"))).toBe("script-src 'self'");
  expect(directives.find(d => d.startsWith("style-src"))).toBe("style-src 'self' 'unsafe-inline'");
  expect(directives.find(d => d.startsWith("font-src"))).toBe("font-src 'self' data:");
  expect(directives.find(d => d.startsWith("media-src"))).toBe("media-src 'self'");
  expect(directives.find(d => d.startsWith("connect-src"))).toBe("connect-src 'none'");
});

it('checks custom app hosts even when URL.origin is opaque', () => {
 expect(isAppUrl('vstudy://app/index.html', 'vstudy://app/index.html')).toBe(true);
 expect(isAppUrl('vstudy://evil/index.html', 'vstudy://app/index.html')).toBe(false);
});

it.each(['NUL.txt', 'con.pdf', 'COM1.md', 'LPT1.csv'])('keeps device names out of suggested filenames %s', async name => {
  const { safeFilename } = await import('./security');
  expect(safeFilename(name)).toBe('_' + name);
});
