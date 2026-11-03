import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath, URL } from "node:url";
import { join, resolve } from "node:path";

const directory = await mkdtemp(join(tmpdir(), "vstudy-e2e-"));
const fixture = fileURLToPath(
  new URL("./fixtures/reading.md", import.meta.url),
);
const mock = process.env.VSTUDY_RENDERER_MOCK === "1";
const screenshot =
  process.env.VSTUDY_SCREENSHOT ?? join(tmpdir(), "vstudy-selection-chat.png");
let app, page;
try {
  app = await electron.launch({
    args: [resolve("."), `--user-data-dir=${directory}`],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "",
      VSTUDY_FAKE_PROVIDER: "1",
    },
  });
  page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.getByRole("heading", { name: "VStudy Pro" }).waitFor();
  if (!mock) {
    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [path],
      });
    }, fixture);
  }
  await page
    .getByRole("button", { name: "＋ Import document", exact: true })
    .click();
  const viewer = page.getByTestId("document-markdown");
  await viewer.waitFor({ timeout: 15000 });
  const selectedText = mock
    ? "a closer look"
    : "This selected passage reaches the fake provider.";
  assert.ok(await viewer.locator("table").count(), "Markdown table rendered");
  assert.ok(await viewer.locator("pre code").count(), "Markdown code rendered");
  await viewer.evaluate((element, text) => {
    const walker = window.document.createTreeWalker(
      element,
      window.NodeFilter.SHOW_TEXT,
    );
    let node;
    while ((node = walker.nextNode())) {
      const offset = node.textContent.indexOf(text);
      if (offset < 0) continue;
      const range = window.document.createRange();
      range.setStart(node, offset);
      range.setEnd(node, offset + text.length);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      element.dispatchEvent(
        new window.MouseEvent("mouseup", { bubbles: true }),
      );
      return;
    }
    throw new Error("Fixture text missing");
  }, selectedText);
  await page
    .getByRole("button", { name: "Ask about this", exact: true })
    .click();
  const start = page.getByRole("button", {
    name: "Start a conversation",
    exact: true,
  });
  if (await start.isVisible()) await start.click();
  const input = page.getByRole("textbox", {
    name: "Ask about your document",
    exact: true,
  });
  await input.fill("Explain this passage.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page
    .locator(".message.assistant")
    .filter({ hasText: selectedText })
    .waitFor({ timeout: 15000 });
  assert.ok(
    (await page.locator(".message.user").textContent()).includes(selectedText),
    "Selection is visible in the user message",
  );
  await page.screenshot({ path: screenshot, fullPage: true });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({
    path: screenshot.replace(/\.png$/, "-dark.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Swap chat side" }).click();
  const chatBox = await page
    .getByRole("region", { name: "Chat", exact: true })
    .boundingBox();
  const documentBox = await page
    .getByRole("region", { name: "Document", exact: true })
    .boundingBox();
  assert.ok(chatBox.x > documentBox.x, "Pane order swaps");
  assert.ok(
    (await page.locator(".message.user").textContent()).includes(selectedText),
    "Swap preserves the conversation",
  );
  await page.getByRole("button", { name: "Toggle document library" }).click();
  assert.equal(
    await page.getByRole("complementary", { name: "Document library" }).count(),
    0,
  );
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("dialog").waitFor();
  assert.equal(
    await page
      .getByRole("textbox", { name: "OpenAI API key", exact: true })
      .getAttribute("type"),
    "password",
  );
  await page.getByRole("button", { name: "Close settings" }).click();
  if (mock) {
    await page
      .getByRole("button", { name: "Add API key", exact: true })
      .click();
    const form = page.getByRole("group", { name: "Add API key" });
    await form
      .getByRole("textbox", { name: "API key", exact: true })
      .fill("preview-only-key");
    await form.getByRole("button", { name: "Save key", exact: true }).click();
    await form.waitFor({ state: "hidden" });
  }
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      result: "PASS",
      mock,
      screenshot,
      title: await page.title(),
      selectedText,
      consoleErrors: errors,
    }),
  );
} catch (error) {
  if (page) {
    await page
      .screenshot({
        path: screenshot.replace(/\.png$/, "-failure.png"),
        fullPage: true,
      })
      .catch(() => {});
    console.error(
      await page
        .locator("body")
        .innerText()
        .catch(() => "Window unavailable"),
    );
  }
  throw error;
} finally {
  await app?.close();
  await rm(directory, { recursive: true, force: true });
}
