import { expect, it } from "vitest";
import { ipcContract, externalUrlSchema } from "./ipc";

it("allows only explicit browser/mail schemes and rejects extra IPC fields", () => {
  for (const url of ["https://example.com/a?q=b#c", "http://localhost:8080", "mailto:test@example.com", "HTTPS://example.com"]) {
    expect(externalUrlSchema.safeParse(url).success).toBe(true);
  }
  for (const url of ["javascript:alert(1)", "file:///etc/passwd", "data:text/html,hi", "vstudy-asset://id/image.png", "//example.com", "https://example.com\n", " https://example.com", "https:\\example.com"]) {
    expect(externalUrlSchema.safeParse(url).success).toBe(false);
  }
  expect(ipcContract["shell:openExternal"].request.safeParse({ url: "https://example.com", extra: true }).success).toBe(false);
});
