import { poll } from '../scripts/poll.mjs';
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
      ELECTRON_RUN_AS_NODE: "", VSTUDY_LOCALE:"en",
      VSTUDY_FAKE_PROVIDER: "1",
    },
  });
  page = await app.firstWindow();
 await page.evaluate(async()=>{await window.desktop.invoke('providers:configure',{kind:'api',id:'anthropic-api',enabled:true});const s=await window.desktop.invoke('settings:get',{});await window.desktop.invoke('settings:set',{...s,lastProviderId:'anthropic-api',lastModelId:'fake'});});
 await page.evaluate(()=>window.localStorage.setItem('vstudy-route',JSON.stringify({view:'workspace'}))); await page.reload();
  const errors = [];
  page.on("console", msg => { if (/Content Security Policy|Refused to (?:apply|load|execute)/i.test(msg.text())) errors.push(msg.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.getByTestId("bridge-status").waitFor({state:"attached"});
  if (!mock) {
    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [path],
      });
    }, fixture);
  }
  await page
    .getByTestId("import-document")
    .click();
  const viewer = page.getByTestId("document-markdown");
  await viewer.waitFor({ timeout: 15000 });
  await page.screenshot({ path: screenshot.replace(/\.png$/, "-document.png"), fullPage: true, animations: "disabled" });
  const selectedText = mock
    ? "a closer look"
    : "This selected passage reaches the fake provider.";
  await viewer.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  for(let n=0;n<5;n++) await page.keyboard.press('Shift+ArrowRight');
  const keyboardText=await page.evaluate(()=>window.getSelection()?.toString());
  assert.equal(keyboardText.length,5,'keyboard selects an arbitrary five-character passage');
  await page.keyboard.press('Meta+Shift+k');
  await page.locator('.aui-composer-root .selection-preview').filter({hasText:keyboardText}).waitFor();
  await page.getByRole('button',{name:'Remove selection',exact:true}).click();
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
      window.document.dispatchEvent(new window.Event("mouseup"));
      return;
    }
    throw new Error("Fixture text missing");
  }, selectedText);
  await page
    .getByRole("button", { name: "Ask about this", exact: true })
    .click();
  const input = page.locator('.aui-composer-input');
  await input.fill("Explain this passage.");
  await page.screenshot({ path: screenshot.replace(/\.png$/, "-selection.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page
    .locator("[data-role=assistant]")
    .filter({ hasText: selectedText })
    .waitFor({ timeout: 15000 });
  await page.waitForFunction(() => !window.document.querySelector(".aui-composer-cancel"));
  if (!mock) {
    await page.locator('[data-role=assistant] .usage-chip').filter({hasText:'in 1.2k · out 340 · $0.012'}).waitFor();
    await page.getByRole('button',{name:'Conversation usage'}).filter({hasText:'1.5k tokens · $0.012'}).waitFor();
    const usage = await page.evaluate(() => window.desktop.invoke('usage:summary',{period:'month'}));
    assert.equal(usage.inputTokens,1200); assert.equal(usage.outputTokens,340); assert.equal(usage.costUsd,.012);
    await page.screenshot({path:screenshot.replace(/\.png$/, '-usage.png'),fullPage:true,animations:"disabled"});
  }
  assert.equal(await page.locator("[data-role=assistant] strong").innerText(), "bold");
  assert.deepEqual(await page.locator("[data-role=assistant] li").allTextContents(), ["First", "Second"]);
  await page.locator("[data-role=assistant] strong").scrollIntoViewIfNeeded();
  await page.screenshot({ path: screenshot.replace(/\.png$/, "-markdown.png"), fullPage: true, animations: "disabled" });
  await viewer.locator("h2").first().hover();
  await viewer.locator("h2").first().getByRole("button", { name: "Use section Details" }).click();
  const chip = page.locator(".aui-composer-root .selection-preview");
  assert.ok(!(await chip.innerText()).includes("| Topic |"), "preview removes table syntax");
  await chip.locator("summary").click();
  assert.equal(await chip.getAttribute("open"), "");
  await page.screenshot({ path: screenshot.replace(/\.png$/, "-section.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Remove selection" }).click();
  await page.waitForFunction(() => window.document.querySelector("[data-slot=aui_assistant-message-content]")?.textContent.includes("User question:"));
  const prompt = await page.locator("[data-slot=aui_assistant-message-content]").innerText();
  assert.equal(prompt.split(selectedText).length - 1, 1, "passage occurs exactly once");
  const block = prompt.split("<untrusted_document_content>")[1].split("</untrusted_document_content>")[0];
  assert.ok(block.includes(selectedText), "passage is inside untrusted boundary");
  assert.ok(!block.includes("Explain this passage."), "question is outside boundary");
  assert.ok(prompt.split("</untrusted_document_content>")[1].includes("User question:"), JSON.stringify(prompt));
  assert.ok(
    (await page.locator("[data-role=user]").first().textContent()).includes(selectedText),
    "Selection is visible in the user message",
  );
  await page.screenshot({ path: screenshot, fullPage: true, animations: "disabled" });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({
    path: screenshot.replace(/\.png$/, "-dark.png"),
    fullPage: true, animations: "disabled",
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
    (await page.locator("[data-role=user]").first().textContent()).includes(selectedText),
    "Swap preserves the conversation",
  );
  await page.screenshot({ path: screenshot.replace(/\.png$/, "-right.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("dialog").waitFor();
  await page.screenshot({ path: screenshot.replace(/\.png$/, "-settings.png"), fullPage: true, animations: "disabled" });
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
    await dashboard.screenshot({path:screenshot.replace(/\.png$/, '-token-dashboard.png'),animations:'disabled'});

    await page.getByRole('spinbutton',{name:'Monthly budget (USD)',exact:true}).fill('0.01');
    await page.getByRole('spinbutton',{name:'Monthly token cap',exact:true}).fill('1541');
    await page.getByRole('button',{name:'Save usage settings',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Usage settings saved'}).waitFor();
    await page.screenshot({path:screenshot.replace(/\.png$/, '-usage-settings.png'),fullPage:true,animations:"disabled"});
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
    assert.equal(await page.locator('[data-role=user]').count(),1);
    await page.screenshot({path:screenshot.replace(/\.png$/, '-budget-warning.png'),fullPage:true,animations:"disabled"});
    await page.getByRole('button',{name:'Send anyway',exact:true}).click();
    await page.waitForFunction(() => window.document.querySelectorAll('[data-role=user]').length === 2);
    await page.waitForFunction(() => !window.document.querySelector('.aui-composer-cancel'));
    const settings = await page.evaluate(() => window.desktop.invoke('settings:get',{}));
    await page.evaluate(s => window.desktop.invoke('settings:set',{...s,monthlyBudgetUsd:undefined,monthlyTokenBudget:undefined}),settings);
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
    await app.evaluate(({ shell, dialog }) => {
      globalThis.vstudyOriginalMessageBox = dialog.showMessageBox;
      dialog.showMessageBox = async (parent, options) => { if (!parent.isVisible()) throw new Error('Consent requires a visible parent'); globalThis.vstudyLinkConfirmation = options; return { response: 1, checkboxChecked: false }; };
      shell.openExternal = async (url) => { globalThis.vstudyOpenedUrl = url; };
    });
    await viewer.getByRole("link", { name: "Reference website" }).click();
    assert.equal(await app.evaluate(() => globalThis.vstudyOpenedUrl), "https://example.com");
    assert.match(await app.evaluate(() => globalThis.vstudyLinkConfirmation.message), /example\.com/);
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = globalThis.vstudyOriginalMessageBox; });
  }
  if (!mock) {
    const originalId = await page.evaluate(() => window.desktop.invoke("settings:get", {}).then(s => s.lastDocumentId));
    await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},fileURLToPath(new URL("../test-fixtures/converter/sample.md", import.meta.url)));
    await page.evaluate(()=>window.desktop.invoke("documents:import",{}));
    await page.reload();
    await page.getByTestId("document-markdown").filter({ hasText: "E2E reading document" }).waitFor();
    assert.equal(await page.evaluate(() => window.desktop.invoke("settings:get", {}).then(s => s.lastDocumentId)), originalId);
    await page.reload();
    await page.locator("[data-role=user] .selection-preview").waitFor();
    assert.ok((await page.locator("[data-role=user] .selection-preview").textContent()).includes(selectedText), "structured selection survives reload");
    await page.evaluate(() => window.desktop.invoke("providers:configure", { kind: "api", id: "anthropic-api", enabled: false }));
    await page.getByRole("alert").filter({ hasText: "This conversation’s provider is unavailable" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Send message", exact: true }).isDisabled(), true);
    await page.evaluate(() => window.desktop.invoke("providers:configure", { kind: "api", id: "anthropic-api", enabled: true }));
    await page.getByRole("alert").filter({ hasText: "This conversation’s provider is unavailable" }).waitFor({ state: "hidden" });
    await page.locator('.aui-composer-input').fill("Keep this draft");
    await page.getByRole('combobox',{name:'Model',exact:true}).click();
    const alternative = page.getByRole('option').filter({hasText:'CLI'}).filter({hasNotText:'static fallback'}).first();
    if (await alternative.count()) {
      await alternative.click();
      assert.equal(await page.locator('.aui-composer-input').inputValue(),'Keep this draft');
    } else await page.getByRole('combobox',{name:'Search models'}).press('Escape');
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole('button',{name:'Conversations',exact:true}).click();
    await page.locator('[data-slot=aui_thread-list-item]').first().getByRole('button',{name:'More options',exact:true}).click();
    await page.getByRole('menuitem',{name:'Delete',exact:true}).click();
    await page.locator(".chat-start").waitFor();
    page.once("dialog", dialog => dialog.dismiss());
    await page.getByRole("button", { name: "Delete document", exact: true }).click();
    assert.equal(await page.evaluate(async()=>(await window.desktop.invoke("documents:list",{})).length), 2, "cancel keeps document");
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Delete document", exact: true }).click();
    await poll(()=>page.evaluate(async()=>(await window.desktop.invoke("documents:list",{})).length === 1));
    await page.getByRole('combobox',{name:'Model',exact:true}).click();
    await page.getByRole('button',{name:'API keys & provider settings'}).click();
    const keyForm = page.locator('.provider-row').filter({hasText:'OpenAI compatible'});
    await keyForm.getByRole('textbox',{name:'OpenAI compatible API key',exact:true}).fill('local-test-key');
    await keyForm.getByRole('button',{name:'Save key',exact:true}).click();
    await page.getByRole('button',{name:'Close settings',exact:true}).click();
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
        fullPage: true, animations: "disabled",
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
