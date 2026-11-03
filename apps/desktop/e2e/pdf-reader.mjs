import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const source = process.argv[2];
if (!source) throw new Error('Usage: node e2e/pdf-reader.mjs /path/to/source.pdf [evidence-directory]');
const evidence = resolve(process.argv[3] ?? '/tmp/vstudy-pdf-evidence');
await mkdir(evidence, { recursive: true });
const directory = await mkdtemp(join(tmpdir(), 'vstudy-pdf-reader-'));
let app;
try {
  app = await electron.launch({ args: [resolve('.'), `--user-data-dir=${directory}`], env: { ...process.env, ELECTRON_RUN_AS_NODE: '', VSTUDY_FAKE_PROVIDER: '1' } });
  const page = await app.firstWindow();
  await page.getByRole('heading', { name: 'VStudy Pro' }).waitFor();
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, resolve(source));
  await page.getByRole('button', { name: '＋ Import document', exact: true }).click();
  await page.getByTestId('document-markdown').filter({ hasText: 'R12.' }).waitFor({ timeout: 660_000 });
  const document = await page.evaluate(async () => (await window.desktop.invoke('documents:list', {}))[0]);
  assert.equal(document.status, 'ready');
  assert.equal(document.converter, 'pdf_md');
  assert.ok(await page.locator('.pane-toolbar').filter({ hasText: 'Markdown · pdf_md' }).count());
  const markdown = await page.evaluate(async (documentId) => window.desktop.invoke('documents:read', { documentId }), document.id);
  await writeFile(join(evidence, 'document.json'), JSON.stringify(document, null, 2));
  await writeFile(join(evidence, 'content.md'), typeof markdown === 'string' ? markdown : JSON.stringify(markdown));
  const viewer = page.getByTestId('document-markdown');
  assert.equal(await viewer.locator('table').count(), 0);
  assert.ok(!(await viewer.innerText()).includes('<!-- page'));
  for (const [number, prefix] of [[3, 'R12.'], [5, 'R23.'], [10, 'Total average delay']]) {
    await viewer.locator('p').filter({ hasText: new RegExp(`^${prefix.replace('.', '\\.')}`) }).first().evaluate(element => element.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: join(evidence, `page-${number}.png`) });
  }
  console.log(JSON.stringify({ result: 'PASS', converter: document.converter, screenshots: [3,5,10], evidence }));
} finally {
  await app?.close();
  await rm(directory, { recursive: true, force: true });
}
