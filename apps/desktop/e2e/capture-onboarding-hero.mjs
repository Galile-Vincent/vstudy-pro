import { _electron as electron } from 'playwright';
import sharp from 'sharp';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'resources/onboarding');
const evidence = resolve(root, '../../docs/evidence/onboarding/hero');
const copy = JSON.parse(await readFile(join(root, 'src/shared/locales/en/onboarding.json'), 'utf8'));
await mkdir(join(root, 'node_modules/.cache'), { recursive: true });
const profile = await mkdtemp(join(root, 'node_modules/.cache/onboarding-hero-'));
const selected = 'A useful habit is to explain one idea in your own words.';
const question = 'How can I put this idea into practice?';
const answer = '**Close the notes. Explain the idea.**\n\nDescribe the main idea in one sentence. Check what you missed, then try again tomorrow.';
const requests = [];
const provider = createServer(async (request, response) => {
  if (request.url === '/v1/models') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ data: [{ id: 'Study assistant' }] }));
  } else if (request.url === '/v1/chat/completions') {
    let body = '';
    for await (const chunk of request) body += chunk;
    requests.push(JSON.parse(body));
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.end(`data: ${JSON.stringify({ choices: [{ delta: { content: answer } }] })}\n\ndata: [DONE]\n\n`);
  } else {
    response.writeHead(404).end();
  }
});
let app;
const errors = [];
const measurements = [];
try {
  await mkdir(evidence, { recursive: true });
  await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
  app = await electron.launch({
    args: [root, `--user-data-dir=${profile}`, '--force-device-scale-factor=2'],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '', VSTUDY_LOCALE: 'en', VSTUDY_FAKE_PROVIDER: '' },
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 800));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 2, mobile: false });
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  await page.locator('.onboarding').waitFor();
  const call = (channel, request) => page.evaluate(({ channel, request }) => window.desktop.invoke(channel, request), { channel, request });
  const settings = await call('settings:get', {});
  await call('settings:set', { ...settings, themeId: 'vstudy', colorScheme: 'dark', material: 'solid', language: 'en', chatSide: 'right', uiScale: 150, readerSize: 'l', onboardingCompleted: true, welcomeSeen: true, lastProviderId: 'openai-compatible', lastModelId: 'Study assistant' });
  for (const entry of await call('providers:list', { discover: false })) {
    if (entry.config.enabled) await call('providers:configure', { ...entry.config, enabled: false });
  }
  await call('providers:configure', { kind: 'compatible', id: 'openai-compatible', enabled: true, baseUrl: `http://127.0.0.1:${provider.address().port}/v1` });
  const document = await call('documents:importSample', { language: 'en' });
  await page.evaluate(documentId => {
    window.localStorage.setItem('vstudy-route', JSON.stringify({ view: 'workspace', documentId }));
  }, document.id);
  await page.reload();
  const reader = page.getByTestId('document-markdown');
  await reader.waitFor();
  const sidebarToggle = page.getByRole('button', { name: 'Toggle document library', exact: true });
  if (await page.locator('.shell-sidebar').isVisible()) await sidebarToggle.click();
  await reader.evaluate((element, text) => {
    const walker = window.document.createTreeWalker(element, window.NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const start = node.textContent.indexOf(text);
      if (start < 0) continue;
      const range = window.document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + text.length);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      window.document.dispatchEvent(new window.Event('mouseup'));
      return;
    }
    throw new Error('Sample sentence missing');
  }, selected);
  await page.getByRole('button', { name: 'Ask about this', exact: true }).click();
  const composer = page.locator('.aui-composer-input');
  await composer.fill(question);
  await composer.press('Enter');
  await page.locator('[data-role=assistant]').filter({ hasText: 'Close the notes.' }).waitFor();
  await page.waitForFunction(() => !window.document.querySelector('.aui-composer-cancel'));
  assert.equal(requests.length, 1, 'one request reaches the local fixture provider');
  assert.ok(JSON.stringify(requests[0]).includes(selected), 'the provider receives the selected sentence');
  for (const scheme of ['dark', 'light']) {
    const latest = await call('settings:get', {});
    await call('settings:set', { ...latest, colorScheme: scheme });
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: scheme });
    await page.reload();
    await page.locator('[data-role=assistant]').filter({ hasText: 'Close the notes.' }).waitFor();
    if (await page.locator('.shell-sidebar').isVisible()) await sidebarToggle.click();
    await page.waitForFunction(scheme => window.document.documentElement.dataset.scheme === scheme, scheme);
    await page.evaluate(() => window.document.fonts.ready);
    await page.addStyleTag({ content: '.message-usage, .composer-usage, .aui-thread-scroll-to-bottom { visibility: hidden !important; }' });
    await page.locator('[data-slot=aui_thread-viewport]').evaluate(element => element.scrollTo({ top: 0, behavior: 'instant' }));
    const workspace = page.locator('.workspace');
    assert.doesNotMatch(await workspace.innerText(), /Answer in the language|UNTRUSTED|Fake|test only|system prompt/i);
    const pixels = await page.locator('.workspace-body').screenshot({ animations: 'disabled', scale: 'device' });
    const file = join(output, `hero-${scheme}.webp`);
    await sharp(pixels).webp({ lossless: true }).toFile(file);
    const metadata = await sharp(file).metadata();
    const bytes = (await readFile(file)).length;
    assert.ok(metadata.width >= 2000, 'hero is at least 2000 pixels wide');
    assert.ok(bytes < 1500000, 'hero stays below 1.5 MB');
    assert.equal(await page.evaluate(() => window.devicePixelRatio), 2);
    measurements.push({ file, width: metadata.width, height: metadata.height, bytes });
  }
  await app.close();
  app = undefined;
  await rm(profile, { recursive: true, force: true });
  await mkdir(profile);
  app = await electron.launch({
    args: [root, `--user-data-dir=${profile}`, '--force-device-scale-factor=2'],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '', VSTUDY_LOCALE: 'en', VSTUDY_FAKE_PROVIDER: '' },
  });
  const welcome = await app.firstWindow();
  welcome.on('pageerror', error => errors.push(error.message));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 800));
  const welcomeCdp = await welcome.context().newCDPSession(welcome);
  await welcomeCdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 2, mobile: false });
  for (const scheme of ['dark', 'light']) {
    await welcome.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await welcome.reload();
    const dialog = welcome.locator('.onboarding');
    await dialog.waitFor();
    await welcome.waitForFunction(scheme => window.document.documentElement.dataset.scheme === scheme, scheme);
    const image = dialog.locator('img.product-preview');
    await image.waitFor();
    await image.evaluate(image => image.decode());
    assert.equal(await image.getAttribute('alt'), copy.preview_label, 'hero has translated alt text');
    assert.ok(await image.evaluate(image => image.naturalWidth >= image.clientWidth * 2), 'hero has at least two source pixels per CSS pixel');
    assert.equal(await dialog.locator('video').count(), 0, 'welcome contains no video');
    await welcome.evaluate(() => window.document.fonts.ready);
    const file = join(evidence, `welcome-${scheme}-2x.png`);
    const pixels = await dialog.screenshot({ path: file, animations: 'disabled', scale: 'device' });
    const metadata = await sharp(pixels).metadata();
    const { channels } = await sharp(pixels).stats();
    assert.ok(scheme === 'dark' ? channels[0].mean < 128 : channels[0].mean > 128, 'welcome pixels match the requested scheme');
    measurements.push({ file, width: metadata.width, height: metadata.height, bytes: pixels.length, ...await image.evaluate(image => ({ naturalWidth: image.naturalWidth, renderedWidth: image.clientWidth, scheme: window.document.documentElement.dataset.scheme })) });
  }
  assert.deepEqual(errors, [], 'no renderer errors');
  await writeFile(join(evidence, 'verification.json'), JSON.stringify({ result: 'PASS', deviceScaleFactor: 2, source: 'Real Electron, imported English sample, selected sentence, local loopback AI fixture', measurements, errors }, null, 2) + '\n');
  console.log(JSON.stringify(measurements, null, 2));
  console.log('PASS. Fresh-profile Electron welcome renders a still at 2x in both schemes.');
} catch (error) {
  await app?.windows()[0]?.screenshot({ path: join(evidence, 'failure.png') }).catch(() => {});
  throw error;
} finally {
  await app?.close();
  await new Promise(resolve => provider.close(resolve));
  await rm(profile, { recursive: true, force: true });
}
