import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, symlink, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveAssetPath } from "./assets";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
it("contains assets after decoding and realpath, including symlink escapes", async () => {
  const temp = await mkdtemp(join(tmpdir(), "vstudy-assets-"));
  roots.push(temp);
  const root = join(temp, "document");
  await mkdir(join(root, "images"), { recursive: true });
  await writeFile(join(root, "images", "a b.png"), "image");
  await writeFile(join(temp, "secret.png"), "secret");
  await symlink(join(temp, "secret.png"), join(root, "escape.png"));
  expect(await resolveAssetPath(root, "images/a%20b.png")).toBe(await realpath(join(root, "images", "a b.png")));
  for (const path of ["../secret.png", "%2e%2e/secret.png", "%2fsecret.png", "/secret.png", "images/../../secret.png", "images\\secret.png", "escape.png", "%00.png", "%zz"]) {
    await expect(resolveAssetPath(root, path)).rejects.toThrow();
  }
});
