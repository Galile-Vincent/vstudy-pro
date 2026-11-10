/** Capture real built Electron views sequentially in a disposable profile. No student data or remote services. */
import sharp from 'sharp';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile, copyFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Buffer } from 'node:buffer';
import { launchMarketing, captureRaw, aliases, captureTime } from './marketing-session.mjs';

const desktop = resolve(import.meta.dirname,'..');
const root = resolve(desktop,'../..');
const evidence = join(root,'docs/evidence/marketing');
const shots = join(root,'apps/website/src/assets/shots');
const readme = join(root,'docs/assets/readme');
const directory = await mkdtemp(join(tmpdir(),'vstudy-marketing-'));
const themes = (process.env.SHOT_THEMES ?? 'vstudy,ocean,grove,ember,iris,rose,slate,paper,contrast').split(',');
const modes = (process.env.SHOT_MODES ?? 'light,dark').split(',');
const only = process.env.SHOT_ONLY?.split(',');
const previous = only ? await readFile(join(evidence,'manifest.json'),'utf8').then(JSON.parse).then(data=>data.shots).catch(error=>{if(error.code==='ENOENT') return [];throw error;}) : [];
const manifest = [];
let session;
try {
  for (const dir of [evidence,shots,readme,join(evidence,'raw')]) await mkdir(dir,{recursive:true});
  session = await launchMarketing({desktop,directory});
  const {views,applyAppearance,finishView,errors} = session;
  const capture = async (name,theme,mode) => {
    const raw = await captureRaw(session,name);
    const key = `${name}-${theme}-${mode}`;
    await writeFile(join(evidence,'raw',`${key}.png`),raw);
    const webp = await sharp(raw).webp({quality:82,effort:6}).toBuffer();
    assert.ok(webp.length<=220_000,`${key} exceeds 220 KB (${webp.length})`);
    await writeFile(join(shots,`${key}.webp`),webp);
    let avifBytes;
    if (sharp.format.heif.output.buffer) {
      const avif=await sharp(raw).avif({quality:50,effort:2}).toBuffer();
      assert.ok(avif.length<=220_000,`${key} AVIF exceeds 220 KB`);
      await writeFile(join(shots,`${key}.avif`),avif);avifBytes=avif.length;
    }
    if (theme==='vstudy'&&mode==='light') {
      for (const dest of [join(readme,`${aliases[name]}.webp`),join(shots,`${name}.webp`)]) await writeFile(dest,webp);
      if (avifBytes) for(const dest of [join(readme,`${aliases[name]}.avif`),join(shots,`${name}.avif`)]) await copyFile(join(shots,`${key}.avif`),dest);
    }
    manifest.push({name,theme,mode,width:2880,height:1800,webpBytes:webp.length,avifBytes,file:`${key}.webp`});
    console.log(`${key}: ${(webp.length/1024).toFixed(1)} KiB`);
  };
  for (const theme of themes) for (const mode of modes) {
    for (const [name,prepare] of Object.entries(views)) {
      if(only&&!only.includes(name)) continue;
      await applyAppearance(theme,mode);
      await prepare();await capture(name,theme,mode);
      await finishView(name);
    }
  }
  assert.ok(manifest.length>0,'No views matched SHOT_ONLY');
  assert.deepEqual(errors,[]);
  manifest.push(...previous.filter(old=>!manifest.some(shot=>shot.file===old.file)));
  manifest.sort((a,b)=>themes.indexOf(a.theme)-themes.indexOf(b.theme)||a.mode.localeCompare(b.mode)||a.name.localeCompare(b.name));
  await rm(join(evidence,'failure.png'),{force:true});
  await writeFile(join(evidence,'manifest.json'),JSON.stringify({captureTime:new Date(captureTime).toISOString(),viewport:{width:1440,height:900,scale:2},artifact:'Built Electron app, synthetic course/provider/saved-conversation fixtures, real document imports and planner IPC',shots:manifest,errors},null,2)+'\n');
  if(!only&&!process.env.SHOT_THEMES&&!process.env.SHOT_MODES) {
    const expected=new Set(manifest.flatMap(shot=>['webp','avif'].map(ext=>shot.file.replace(/\.webp$/,'.'+ext))));
    for(const name of Object.keys(views)) for(const ext of ['webp','avif']) expected.add(`${name}.${ext}`);
    for(const file of await readdir(shots)) if(/\.(webp|avif)$/.test(file)&&!expected.has(file)) await rm(join(shots,file));
  }
  const columns=3, w=480, h=330;
  const thumbs=await Promise.all(manifest.map(async (shot,i)=>({input:await sharp(join(shots,shot.file)).resize(w,300).extend({bottom:30,background:'#f3f2ef'}).composite([{input:Buffer.from(`<svg width="480" height="30"><text x="12" y="20" fill="#302e3a" font-family="sans-serif" font-size="12">${shot.name} · ${shot.theme} ${shot.mode}</text></svg>`),top:300,left:0}]).png().toBuffer(),left:(i%columns)*w,top:Math.floor(i/columns)*h})));
  await sharp({create:{width:columns*w,height:Math.ceil(manifest.length/columns)*h,channels:3,background:'#f3f2ef'}}).composite(thumbs).png().toFile(join(evidence,'contact-sheet.png'));
} catch(error) {
  if(session) {await session.page.screenshot({path:join(evidence,'failure.png')});console.error(await session.page.locator('body').innerText());}
  throw error;
} finally {
  try {await session?.close();} finally {await rm(directory,{recursive:true,force:true});}
}
