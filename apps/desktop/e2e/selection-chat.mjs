import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
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
  page.on("console", msg => { if (/Content Security Policy|Refused to (?:apply|load|execute)/i.test(msg.text())) errors.push(msg.text()); });
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
  if (!mock) {
    await page.locator('.message.assistant .usage-chip').filter({hasText:'in 1.2k · out 340 · $0.012'}).waitFor();
    await page.locator('.usage-meter').filter({hasText:'1.5k tokens · $0.012'}).waitFor();
    const usage = await page.evaluate(() => window.desktop.invoke('usage:summary',{period:'month'}));
    assert.equal(usage.inputTokens,1200); assert.equal(usage.outputTokens,340); assert.equal(usage.costUsd,.012);
    await page.screenshot({path:screenshot.replace(/\.png$/, '-usage.png'),fullPage:true});
  }
  assert.equal(await page.locator(".message.assistant strong").innerText(), "bold");
  assert.deepEqual(await page.locator(".message.assistant li").allTextContents(), ["First", "Second"]);
  await page.locator(".message.assistant strong").scrollIntoViewIfNeeded();
  await page.screenshot({ path: screenshot.replace(/\.png$/, "-markdown.png"), fullPage: true });
  await viewer.locator("h2").first().hover();
  await viewer.locator("h2").first().getByRole("button", { name: "Use section Details" }).click();
  const chip = page.locator(".composer .selection-preview");
  assert.ok(!(await chip.innerText()).includes("| Topic |"), "preview removes table syntax");
  await chip.locator("summary").click();
  assert.equal(await chip.getAttribute("open"), "");
  await page.screenshot({ path: screenshot.replace(/\.png$/, "-section.png"), fullPage: true });
  await page.getByRole("button", { name: "Remove selection" }).click();
  const prompt = await page.locator(".message.assistant .message-text").innerText();
  assert.equal(prompt.split(selectedText).length - 1, 1, "passage occurs exactly once");
  const block = prompt.split("<untrusted_document_content>")[1].split("</untrusted_document_content>")[0];
  assert.ok(block.includes(selectedText), "passage is inside untrusted boundary");
  assert.ok(!block.includes("Explain this passage."), "question is outside boundary");
  assert.ok(prompt.split("</untrusted_document_content>")[1].includes("User question:"));
  assert.ok(
    (await page.locator(".message.user").first().textContent()).includes(selectedText),
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
    (await page.locator(".message.user").first().textContent()).includes(selectedText),
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
  if (!mock) {
    await page.getByRole('tab',{name:'Usage',exact:true}).click();
    const dashboard = page.getByRole('region',{name:'Overall token dashboard',exact:true});
    await page.locator('.usage-token-total strong').filter({hasText:'1,540'}).waitFor();
    assert.equal(await page.getByRole('combobox',{name:'Usage period',exact:true}).inputValue(),'all');
    await page.getByRole('combobox',{name:'Group usage by',exact:true}).selectOption('model');
    await page.locator('.usage-dashboard table').filter({hasText:'anthropic-api/fake'}).waitFor();
    await page.getByRole('combobox',{name:'Usage period',exact:true}).selectOption('day');
    await page.locator('.usage-token-total strong').filter({hasText:'1,540'}).waitFor();
    await page.getByRole('combobox',{name:'Usage period',exact:true}).selectOption('all');
    await page.locator('.usage-token-total strong').filter({hasText:'1,540'}).waitFor();
    await dashboard.screenshot({path:screenshot.replace(/\.png$/, '-token-dashboard.png')});

    await page.getByRole('spinbutton',{name:'Monthly budget (USD)',exact:true}).fill('0.01');
    await page.getByRole('button',{name:'Save usage settings',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Usage settings saved'}).waitFor();
    await page.screenshot({path:screenshot.replace(/\.png$/, '-usage-settings.png'),fullPage:true});
    const csvPath = join(directory, 'usage.csv');
    await app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled:false,filePath:path }); }, csvPath);
    await page.getByRole('button',{name:'Export CSV',exact:true}).click();
    await page.getByRole('status').filter({hasText:'CSV exported'}).waitFor();
    const csv = await readFile(csvPath,'utf8');
    assert.ok(csv.includes('"1200","340","200","","40","0.012","reported"'));

  }
  await page.getByRole("button", { name: "Close settings" }).click();
  if (!mock) {
    await input.fill('Check budget warning');
    await page.getByRole('button',{name:'Send message',exact:true}).click();
    await page.getByRole('button',{name:'Send anyway',exact:true}).waitFor();
    assert.equal(await page.locator('.message.user').count(),1);
    await page.screenshot({path:screenshot.replace(/\.png$/, '-budget-warning.png'),fullPage:true});
    await page.getByRole('button',{name:'Send anyway',exact:true}).click();
    await page.waitForFunction(() => window.document.querySelectorAll('.message.user').length === 2);
    await page.waitForFunction(() => window.document.querySelector('.stop-button')?.disabled === true);
    const settings = await page.evaluate(() => window.desktop.invoke('settings:get',{}));
    await page.evaluate(s => window.desktop.invoke('settings:set',{...s,monthlyBudgetUsd:undefined}),settings);
    await input.fill('');
  }

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
    const originalId = await page.evaluate(() => window.desktop.invoke("settings:get", {}).then(s => s.lastDocumentId));
    await page.evaluate(path => window.desktop.invoke("documents:importPaths", { paths: [path] }), fileURLToPath(new URL("../test-fixtures/converter/sample.md", import.meta.url)));
    await page.reload();
    await page.getByTestId("document-markdown").filter({ hasText: "E2E reading document" }).waitFor();
    assert.equal(await page.evaluate(() => window.desktop.invoke("settings:get", {}).then(s => s.lastDocumentId)), originalId);
    await page.reload();
    await page.locator(".message.user .selection-preview").waitFor();
    assert.ok((await page.locator(".message.user .selection-preview").innerText()).includes(selectedText), "structured selection survives reload");
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
      await page.waitForFunction(value => window.document.querySelector('select[aria-label="Model"]').value === value, alternative);
      assert.ok((await page.getByRole("combobox", { name: "Conversation", exact: true }).locator("option:checked").innerText()).endsWith(alternative.slice(alternative.indexOf("/") + 1)));
      assert.equal(await page.evaluate(() => window.desktop.invoke("settings:get", {}).then(s => `${s.lastProviderId}/${s.lastModelId}`)), alternative);
    }
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Delete conversation", exact: true }).click();
    await page.locator(".chat-start").waitFor();
    page.once("dialog", dialog => dialog.dismiss());
    await page.getByRole("button", { name: "Delete document", exact: true }).click();
    assert.equal(await page.locator(".document-item").count(), 2, "cancel keeps document");
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Delete document", exact: true }).click();
    await page.waitForFunction(() => window.document.querySelectorAll(".document-item").length === 1);
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
