import { Buffer } from "node:buffer";
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

let source = process.argv[2];
const evidence = resolve(process.argv[3] ?? '/tmp/vstudy-pdf-evidence');
await mkdir(evidence, { recursive: true });
const directory = await mkdtemp(join(tmpdir(), 'vstudy-pdf-reader-'));
if (!source) {
  source=join(directory,'reader.pdf');
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const pages=[];
  for(let page=1;page<=10;page++) {
    const id=objects.length+1;pages.push(`${id} 0 R`);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${id+1} 0 R >>`);
    const text=page===3?'R12. Reading and understanding':page===5?'R23. Asking grounded questions':page===10?'Total average delay in learning':'Reading fixture section '+page;
    const stream=`BT /F1 12 Tf 50 700 Td (${text}) Tj ET`;
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  objects[1]=`<< /Type /Pages /Kids [${pages.join(' ')}] /Count 10 >>`;
  let pdf='%PDF-1.4\n';const offsets=[0];
  objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${object}\nendobj\n`;});
  const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 ${offsets.length}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  await writeFile(source,pdf);
}
if (process.env.VSTUDY_CONVERTER_VENV) await cp(process.env.VSTUDY_CONVERTER_VENV,join(directory,'converter-venv'),{recursive:true});
let app;
try {
  app = await electron.launch({ args: [resolve('.'), `--user-data-dir=${directory}`], env: { ...process.env, ELECTRON_RUN_AS_NODE: '', VSTUDY_FAKE_PROVIDER: '1' } });
  const page = await app.firstWindow();
 await page.evaluate(()=>window.localStorage.setItem('vstudy-route',JSON.stringify({view:'workspace'}))); await page.reload();
  await page.getByTestId('bridge-status').waitFor({state:'attached'});
  await app.evaluate(({ dialog }, path) => { dialog.showMessageBox = async () => ({response:1}); dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, resolve(source));
  await page.getByTestId('import-document').click();
  await page.getByTestId('document-markdown').filter({ hasText: 'R12.' }).waitFor({ timeout: 660_000 });
  await page.locator('.pane-toolbar').filter({ hasText: 'Markdown · pdf_md' }).waitFor({ timeout: 660_000 });
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
    await viewer.locator('p').filter({ hasText: new RegExp(`${prefix.replace('.', '\\.')}`) }).first().evaluate(element => element.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: join(evidence, `page-${number}.png`) });
  }
  console.log(JSON.stringify({ result: 'PASS', converter: document.converter, screenshots: [3,5,10], evidence }));
} finally {
  await app?.close();
  await rm(directory, { recursive: true, force: true });
}
