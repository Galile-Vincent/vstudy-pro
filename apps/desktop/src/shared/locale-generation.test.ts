/**
 * Verify locale generation against temporary catalog trees.
 * Owned by shared localization. Fixtures never modify the application catalogs.
 * @packageDocumentation
 */
import { mkdtemp, mkdir, readFile, rm, copyFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, expect, it } from 'vitest';

const run = promisify(execFile);
const fixtures: string[] = [];
afterEach(async () => { await Promise.all(fixtures.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'vstudy-locales-'));
  fixtures.push(root);
  await mkdir(join(root, 'scripts'));
  await copyFile(new URL('../../scripts/generate-locales.mjs', import.meta.url), join(root, 'scripts/generate-locales.mjs'));
  await mkdir(join(root, 'src/renderer'), {recursive:true});
  await writeFile(join(root, 'src/renderer/index.html'), '<div id="root"><!-- startup-fallback:start --><!-- startup-fallback:end --></div>');
  for (const language of ['en', 'zh-Hant', 'ja']) {
    const directory = join(root, 'src/shared/locales', language);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'common.json'), JSON.stringify({ greeting: 'Hello {{name}}', surface_render_error: language + ' <Retry> & recover' }));
  }
  return { root, generate: () => run(process.execPath, [join(root, 'scripts/generate-locales.mjs')]) };
}

it('discovers an added namespace in every language without a registration edit', async () => {
  const { root, generate } = await fixture();
  await generate();
  for (const language of ['en', 'zh-Hant', 'ja']) {
    await writeFile(join(root, 'src/shared/locales', language, 'new-feature.json'), JSON.stringify({ title: 'Feature' }));
  }
  await generate();
  const source = await readFile(join(root, 'src/shared/locales.generated.ts'), 'utf8');
  for (const language of ['en', 'zh-Hant', 'ja']) expect(source).toContain(`./locales/${language}/new-feature.json`);
  expect(source.match(/"new-feature":/g)).toHaveLength(3);
});

it('rejects missing translated namespaces before replacing a working registry', async () => {
  const { root, generate } = await fixture();
  await generate();
  const target = join(root, 'src/shared/locales.generated.ts');
  const previous = await readFile(target, 'utf8');
  await writeFile(join(root, 'src/shared/locales/en/only-english.json'), '{}');
  await expect(generate()).rejects.toThrow('Locale namespaces differ');
  expect(await readFile(target, 'utf8')).toBe(previous);
});

it('rejects non-string catalog values', async () => {
  const { root, generate } = await fixture();
  await writeFile(join(root, 'src/shared/locales/ja/common.json'), '{"greeting":42}');
  await expect(generate()).rejects.toThrow('Expected a flat string catalog');
});

it('generates escaped static recovery text from every locale',async()=>{
  const {root,generate}=await fixture();await generate();
  const html=await readFile(join(root,'src/renderer/index.html'),'utf8');
  for(const language of ['en','zh-Hant','ja'])expect(html).toContain(`<p lang="${language}">${language} &lt;Retry&gt; &amp; recover</p>`);
  expect(html).toContain('visibility:visible');expect(html).toContain('role="alert"');
});
