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
const evidence = process.env.MOODLE_EVIDENCE_DIR ?? resolve(desktop, "../../docs/screenshots/moodle-round2");
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
  for (const width of [1440, 760]) {
    await app.evaluate(
      ({ BrowserWindow }, width) =>
        BrowserWindow.getAllWindows()[0].setSize(width, 1000),
      width,
    );
    for (const colorScheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme });
      const shot = async (name) => {
        await page.screenshot({
          path: join(evidence, `${name}-${colorScheme}-${width}.png`),
        });
      };
      await page.getByRole("button", { name: "Courses", exact: true }).click();
      await page.locator(".moodle-course-card").first().waitFor();
      assert.equal(await page.locator(".moodle-course-card").count(), 1);
      await shot("home-current");
      await page.getByRole("button", { name: "Connect school", exact: true }).first().click();
      await page.locator(".moodle-connect").waitFor();
      await shot("connect");
      await page.keyboard.press("Escape");
      await page.locator(".moodle-connect").waitFor({ state: "detached" });
      await page.getByRole("tab", { name: /^Past/ }).click();
      assert.equal(await page.locator(".moodle-course-card").count(), 2);
      await shot("home-past");
      await page.getByRole("tab", { name: /^All/ }).click();
      assert.equal(await page.locator(".moodle-course-card").count(), 4);
      await shot("home-all");
      await page.locator(".moodle-course-card h3 button").first().click();
      await page
        .locator(".moodle-week[data-current=true] .moodle-module")
        .first()
        .waitFor();
      await page.locator(".moodle-page").evaluate((el) => {
        el.scrollTop = 0;
      });
      await shot("course-content");
      await page
        .locator(".moodle-week[data-current=true]")
        .scrollIntoViewIfNeeded();
      await shot("current-week-chat-collapsed");
      await page.locator(".moodle-module").first().click();
      await page.locator("[data-slot=sheet-content]").waitFor();
      await shot("module-sheet");
      await page.keyboard.press("Escape");
      await page
        .locator("[data-slot=sheet-content]")
        .waitFor({ state: "detached" });
      await page.getByRole("tab", { name: "Deadlines", exact: true }).click();
      await shot("deadlines");
      await page.getByRole("button", { name: "Set reminder for Amplifier lab report", exact: true }).click();
      await page.locator(".moodle-reminder").waitFor();
      await shot("reminder");
      await page.keyboard.press("Escape");
      await page.locator(".moodle-reminder").waitFor({ state: "detached" });
      await page
        .getByRole("tab", { name: "Announcements", exact: true })
        .click();
      await page.locator(".moodle-page").evaluate((el) => {
        el.scrollTop = 0;
      });
      await shot("announcements");
      await page.locator(".moodle-chat-button").click();
      await page.locator(".moodle-assistant-panel:not([hidden])").waitFor();
      const composer = page.locator(
        ".moodle-assistant-panel .aui-composer-input",
      );
      await composer.waitFor();
      assert.equal(await page.locator(".moodle-agent-suggestions [data-slot=suggestions] button").count(), 3);
      for (const selector of [".moodle-agent-suggestions [data-slot=suggestions] button", ".moodle-course-chat [data-slot=aui_composer-shell]"]) {
        assert.equal(await page.locator(selector).first().evaluate(el => el.ownerDocument.defaultView.getComputedStyle(el).borderTopWidth), "0px");
      }
      const panelBox = await page
        .locator(".moodle-assistant-panel")
        .boundingBox();
      const composerBox = await composer.boundingBox();
      assert.ok(
        composerBox.y >= panelBox.y &&
          composerBox.y + composerBox.height <= panelBox.y + panelBox.height,
      );
      await shot("assistant-expanded");
      await page.keyboard.press("Escape");
      assert.equal(
        await page.locator(".moodle-chat-button").getAttribute("aria-expanded"),
        "false",
      );
      assert.equal(
        await page
          .locator(".moodle-chat-button")
          .evaluate((el) => el === el.ownerDocument.activeElement),
        true,
      );
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
          .evaluate((el) => el.scrollWidth > el.clientWidth),
        false,
      );
      results.push(
        `${colorScheme} ${width}px. Eleven captures. Term counts, current week, module sheet, assistant Escape and focus, no horizontal overflow, no serious or critical axe violations.`,
      );
    }
  }
  assert.deepEqual(errors, []);
  results.push("No renderer page errors during verification.");
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
