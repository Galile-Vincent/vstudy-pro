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
  await page.screenshot({ path: screenshot.replace(/\.png$/, "-document.png"), fullPage: true });
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
      window.document.dispatchEvent(new window.Event("selectionchange"));
      return;
    }
    throw new Error("Fixture text missing");
  }, selectedText);
  await page
    .getByRole("button", { name: "Ask about this", exact: true })
    .click();
  const input = page.getByRole("textbox", {
    name: "Ask about your document",
    exact: true,
  });
  await input.fill("Explain this passage.");
  await page.screenshot({ path: screenshot.replace(/\.png$/, "-selection.png"), fullPage: true });
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page
    .locator(".message.assistant")
    .filter({ hasText: selectedText })
    .waitFor({ timeout: 15000 });
  await page.waitForFunction(() => window.document.querySelector(".stop-button")?.disabled === true);
  const prompt = await page.locator(".message.assistant .message-text").innerText();
  assert.equal(prompt.split(selectedText).length - 1, 1, "passage occurs exactly once");
  const block = prompt.split("<untrusted_document_content>")[1].split("</untrusted_document_content>")[0];
  assert.ok(block.includes(selectedText), "passage is inside untrusted boundary");
  assert.ok(!block.includes("Explain this passage."), "question is outside boundary");
  assert.ok(prompt.split("</untrusted_document_content>")[1].includes("User question:"));
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
  await page.waitForFunction(() => {
    const chat = window.document.querySelector('[aria-label="Chat"]');
    const reading = window.document.querySelector('[aria-label="Document"]');
    return chat && reading && chat.getBoundingClientRect().x > reading.getBoundingClientRect().x;
  });
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
  await page.screenshot({ path: screenshot.replace(/\.png$/, "-right.png"), fullPage: true });
  await page.getByRole("button", { name: "Toggle document library" }).click();
  assert.equal(
    await page.getByRole("complementary", { name: "Document library" }).count(),
    0,
  );
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("dialog").waitFor();
  await page.screenshot({ path: screenshot.replace(/\.png$/, "-settings.png"), fullPage: true });
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
  if (!mock) {
    await assert.rejects(page.evaluate(() => window.desktop.invoke("shell:openExternal", { url: "file:///etc/passwd" })));
    await app.evaluate(({ shell }) => {
      shell.openExternal = async (url) => { globalThis.vstudyOpenedUrl = url; };
    });
    await viewer.getByRole("link", { name: "Reference website" }).click();
    assert.equal(await app.evaluate(() => globalThis.vstudyOpenedUrl), "https://example.com");
  }
  if (!mock) {
    await page.reload();
    await page.locator(".message.user blockquote").waitFor();
    assert.equal(await page.locator(".message.user blockquote").innerText(), selectedText, "structured selection survives reload");
    await page.evaluate(() => window.desktop.invoke("providers:configure", { kind: "api", id: "anthropic-api", enabled: false }));
    await page.getByRole("alert").filter({ hasText: "This conversation’s provider is unavailable" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Send message", exact: true }).isDisabled(), true);
    await page.evaluate(() => window.desktop.invoke("providers:configure", { kind: "api", id: "anthropic-api", enabled: true }));
    await page.getByRole("alert").filter({ hasText: "This conversation’s provider is unavailable" }).waitFor({ state: "hidden" });
    await page.getByRole("textbox", { name: "Ask about your document", exact: true }).fill("Keep this draft");
    const picker = page.getByRole("combobox", { name: "Model", exact: true });
    const alternative = await picker.locator("option:not([disabled])").evaluateAll(options => options.map(o => o.value).find(value => value && !value.startsWith("anthropic-api/")));
    if (alternative) {
      await picker.selectOption(alternative);
      assert.equal(await page.getByRole("textbox", { name: "Ask about your document", exact: true }).inputValue(), "Keep this draft");
      assert.ok((await page.locator(".notice").innerText()).includes("next conversation"));
    }
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Delete conversation", exact: true }).click();
    await page.locator(".chat-start").waitFor();
    page.once("dialog", dialog => dialog.dismiss());
    await page.getByRole("button", { name: "Delete document", exact: true }).click();
    assert.equal(await page.locator(".document-item").count(), 1, "cancel keeps document");
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Delete document", exact: true }).click();
    await page.locator(".document-item").waitFor({ state: "detached" });
    await page.getByRole("button", { name: "Add API key", exact: true }).click();
    const keyForm = page.getByRole("group", { name: "Add API key" });
    await keyForm.getByRole("combobox", { name: "Key provider" }).selectOption("openai-compatible");
    await keyForm.getByRole("textbox", { name: "API key", exact: true }).fill("local-test-key");
    await keyForm.getByRole("button", { name: "Save key", exact: true }).click();
    await keyForm.waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(async () => (await window.desktop.invoke("providers:list", {})).find(p => p.config.id === "openai-compatible").config.enabled), true, "saving compatible key enables provider");
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
