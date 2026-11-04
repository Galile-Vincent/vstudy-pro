import { _electron as electron } from "playwright";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const desktop = resolve(import.meta.dirname, "../../..");
const evidence = resolve(desktop, "../../docs/screenshots/moodle");
const directory = await mkdtemp(join(tmpdir(), "vstudy-moodle-renderer-"));
process.env.VITE_MOCK_DESKTOP = "1";
let app, server;
const results = [];
try {
  await mkdir(evidence, { recursive: true });
  server = await createServer({
    configFile: false,
    root: resolve(desktop, "src/renderer"),
    resolve: { alias: { "@": resolve(desktop, "src/renderer") } },
    html: { cspNonce: "vstudy-development" },
    plugins: [react(), tailwind()],
    server: { host: "127.0.0.1", port: 0, fs: { allow: [desktop] } },
  });
  await server.listen();
  app = await electron.launch({
    args: [desktop, `--user-data-dir=${directory}`],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "",
      ELECTRON_RENDERER_URL: server.resolvedUrls.local[0],
      VSTUDY_FAKE_PROVIDER: "1",
    },
  });
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1440, 1100),
  );
  await page.evaluate(() => {
    window.localStorage.setItem(
      "vstudy-route",
      JSON.stringify({ view: "courses" }),
    );
  });
  await page.reload();
  await page.locator(".moodle-course-card").first().waitFor();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const colorScheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme });
    await page.getByRole("button", { name: "Courses", exact: true }).click();
    await page.locator(".moodle-course-card").first().waitFor();
    assert.equal(await page.locator(".moodle-course-card").count(), 3);
    await page.screenshot({ path: join(evidence, `home-${colorScheme}.png`) });
    await page.locator(".moodle-course-card").first().focus();
    await page.keyboard.press("Enter");
    await page.getByRole("tab", { name: "Overview", exact: true }).waitFor();
    await page.screenshot({
      path: join(evidence, `course-${colorScheme}.png`),
    });
    await page.getByRole("tab", { name: "Files", exact: true }).click();
    assert.equal(await page.locator(".moodle-file-row").count(), 3);
    await page.locator(".moodle-page").evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await page.screenshot({ path: join(evidence, `files-${colorScheme}.png`) });
    const accessibility = await new AxeBuilder({ page })
      .setLegacyMode(true)
      .include(".moodle-page")
      .analyze();
    assert.deepEqual(
      accessibility.violations
        .filter((v) => ["serious", "critical"].includes(v.impact))
        .map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
      [],
    );
    assert.equal(
      await page
        .locator(".moodle-page")
        .evaluate((element) => element.scrollWidth > element.clientWidth),
      false,
    );
    results.push(
      `${colorScheme}: home, course, files captured; keyboard course navigation; no horizontal overflow or serious/critical axe violations`,
    );
  }
  await page.locator(".moodle-page").evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.getByRole("tab", { name: "Deadlines", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Set reminder for Binary tree practice",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "1 hour", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Set reminder for Binary tree practice",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Remove", exact: true }).waitFor();
  await page.keyboard.press("Escape");
  results.push("Reminder saved and displayed in the reopened popover");
  await page.getByRole("tab", { name: "Files", exact: true }).click();
  await page.locator(".moodle-file-row").first().click();
  await page.locator(".workspace").waitFor();
  await page.waitForFunction(() => window.document.querySelector(".markdown")?.textContent?.includes("A binary tree gives each node at most two children."));
  assert.match(
    await page.evaluate(
      () => JSON.parse(window.localStorage.getItem("vstudy-route")).documentId,
    ),
    /^[a-f\d-]{36}$/,
  );
  results.push(
    "File opened in workspace with a document ID and rendered reader content",
  );
  assert.deepEqual(errors, []);
  results.push("No renderer page errors during the tested flows");
  console.log(results.join("\n"));
} finally {
  await writeFile(
    join(evidence, "electron-verification.txt"),
    results.join("\n") + "\n",
  );
  await app?.close();
  await server?.close();
  await rm(directory, { recursive: true, force: true });
}
