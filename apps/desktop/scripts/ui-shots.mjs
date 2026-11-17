/**
 * Before/after screenshot harness for UI redesign work. Reuses the marketing launch and seed in a disposable profile,
 * writes only to UI_SHOTS_OUT, and records visible elevation, focus ring and backdrop-filter counts per view
 * (see shadow-metric.mjs for what counts).
 *
 *   UI_SHOTS_OUT=<dir>   required, receives PNGs, metrics.json and index.html
 *   UI_SHOTS_BASE=<dir>  optional earlier run, adds before/after columns and metric deltas to index.html
 *   UI_SHOTS_ONLY=a,b    optional view names, for quick re-runs
 *   UI_SHOTS_MODES=light,dark  UI_SHOTS_THEME=vstudy  UI_SHOTS_SCALE=1
 *   VSTUDY_CONVERTER_VENV=<installed venv>  optional, copied into the disposable profile
 */
import { _electron as electron } from 'playwright';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative } from 'node:path';
import { launchMarketing, captureRaw, aliases, captureTime, viewport } from './marketing-session.mjs';
import { countEffects } from './shadow-metric.mjs';

const desktop = resolve(import.meta.dirname,'..');
const out = process.env.UI_SHOTS_OUT && resolve(process.env.UI_SHOTS_OUT);
if (!out) throw new Error('Set UI_SHOTS_OUT to the directory that should receive the screenshots.');
const base = process.env.UI_SHOTS_BASE && resolve(process.env.UI_SHOTS_BASE);
const only = process.env.UI_SHOTS_ONLY?.split(',').filter(Boolean);
const modes = (process.env.UI_SHOTS_MODES ?? 'light,dark').split(',');
const theme = process.env.UI_SHOTS_THEME ?? 'vstudy';
const scale = Number(process.env.UI_SHOTS_SCALE ?? 1);
const wanted = name => !only || only.includes(name);

const settingsPanes = ['general','appearance','providers','agents','usage','storage','privacy'];

/** Shots beyond marketing's views. Each prepares a state that opens deterministically from a seeded profile. */
function extraViews({ page, go, settings, documents, call }) {
  const home = '.home-page', dialog = () => page.getByRole('dialog').last();
  const help = async view => { await go({view:'home'},home); await page.evaluate(view=>window.dispatchEvent(new window.CustomEvent('vstudy:learning-help',{detail:view})),view); await dialog().waitFor(); };
  const reader = () => go({view:'workspace',documentId:documents[0].id},'[data-slot=aui_assistant-message-root]');
  const route = (view,selector) => () => go({view},selector);
  return {
    ...Object.fromEntries(settingsPanes.map(tab=>[`settings-${tab}`,async()=>{await settings(tab);}])),
    exams: route('exams','#active-tab-panel *'),
    review: route('review','#active-tab-panel *'),
    'ai-chats': route('ai-chats','#active-tab-panel *'),
    'web-chat-local': async()=>{
      const conversations=await call('conversations:list',{scope:'general'});
      if (!conversations[0]) throw new Error('Seed has no general conversation');
      await page.evaluate(id=>window.localStorage.setItem('vstudy-web-chat-conversation',id),conversations[0].id);
      await go({view:'ai-chats'},'.web-chat-local [data-role=assistant]');
    },
    'reader-table': async()=>{await reader();await page.locator('.reading-pane .markdown table').evaluate(element=>element.scrollIntoView({block:'center'}));},
    'reader-cjk': async()=>{await go({view:'workspace',documentId:documents[1].id},'.reading-pane .markdown');},
    'overlay-help-menu': async()=>{await go({view:'home'},home);await page.locator('.learning-help-trigger').first().click();await page.getByRole('menu').waitFor();},
    'overlay-help-shortcuts': ()=>help('shortcuts'),
    'overlay-help-walkthroughs': ()=>help('walkthroughs'),
    'overlay-help-checklist': ()=>help('checklist'),
    'overlay-help-setup': ()=>help('setup'),
    'overlay-new-tab-menu': async()=>{await go({view:'home'},home);await page.locator('.app-tabs-add').click();await page.locator('.app-tabs-menu').waitFor();},
    'overlay-model-picker': async()=>{await reader();await page.getByRole('combobox',{name:'Model',exact:true}).first().click();await page.getByRole('listbox').waitFor();},
    'overlay-library-new-folder': async()=>{await go({view:'library'},'.course-folder');await page.getByRole('button',{name:'New folder',exact:true}).first().click();await dialog().waitFor();},
    'overlay-folder-options': async()=>{await go({view:'library'},'.course-folder');await page.getByRole('button',{name:'Folder options: Course notes',exact:true}).click();await dialog().waitFor();},
    'overlay-subscription-usage': async()=>{
      await go({view:'home'},home);
      await page.getByRole('button',{name:'Expand subscription usage',exact:true}).click();
      return async()=>{await page.getByRole('button',{name:'Collapse subscription usage',exact:true}).click({timeout:2000}).catch(()=>{});};
    },
  };
}

const contactSheet = ({ shots, failures, metrics, baseMetrics, baseDir }) => {
  const esc = text => String(text).replace(/[&<>"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[char]);
  const elevationOf = m => m?.elevation ?? m?.boxShadow;
  const delta = (now,before) => before===undefined ? '' : now===before ? ` <small>(=)</small>` : ` <small class="${now<before?'down':'up'}">(${now>before?'+':''}${now-before})</small>`;
  const cell = (file,key,source) => {
    const m = (source??metrics)[key];
    return `<figure><a href="${esc(file)}"><img loading="lazy" src="${esc(file)}" alt="${esc(key)}"></a>${m?`<figcaption>elevation ${elevationOf(m)}${m.focusRing===undefined?'':` · ring ${m.focusRing}`} · backdrop ${m.backdropFilter}</figcaption>`:''}</figure>`;
  };
  const rows = shots.map(({name,mode,file}) => {
    const key = `${name}-${mode}`, before = baseMetrics?.[key];
    const beforeCell = base ? (before ? cell(`${relative(out,baseDir)}/${file}`,key,baseMetrics) : '<figure class="missing">not in base</figure>') : '';
    const now = metrics[key];
    return `<section><h2>${esc(name)} <small>${esc(mode)}</small>${now?`<span class="m">elevation ${elevationOf(now)}${delta(elevationOf(now),elevationOf(before))}${now.focusRing===undefined?'':` · ring ${now.focusRing}${delta(now.focusRing,before?.focusRing)}`} · backdrop ${now.backdropFilter}${delta(now.backdropFilter,before?.backdropFilter)}</span>`:''}</h2><div class="pair${base?' two':''}">${beforeCell}${cell(file,key)}</div></section>`;
  }).join('\n');
  const total = field => Object.values(metrics).reduce((sum,m)=>sum+(m[field]??0),0);
  const baseTotal = field => baseMetrics ? Object.values(baseMetrics).reduce((sum,m)=>sum+(m[field]??(field==='elevation'?m.boxShadow:0)),0) : undefined;
  return `<!doctype html><meta charset="utf-8"><title>UI shots</title><style>
:root{color-scheme:light dark;font:14px/1.4 -apple-system,system-ui,sans-serif}body{margin:24px;background:Canvas;color:CanvasText}h1{font-size:20px}h2{font-size:14px;margin:0 0 6px;display:flex;gap:12px;align-items:baseline}h2 small{opacity:.6;font-weight:400}.m{margin-left:auto;font-weight:400;font-variant-numeric:tabular-nums}.up{color:#b3261e}.down{color:#1b7a3d}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(440px,1fr));gap:20px 16px}.pair{display:grid;gap:8px}.pair.two{grid-template-columns:1fr 1fr}main:has(.two){grid-template-columns:repeat(auto-fill,minmax(760px,1fr))}
figure{margin:0}img{width:100%;display:block;border:1px solid #8884}figcaption{font-size:12px;opacity:.7}.missing{padding:24px;text-align:center;opacity:.6;border:1px dashed #8886}.fail{color:#b3261e}</style>
<h1>UI shots · ${esc(theme)} · ${viewport.width}×${viewport.height}${base?` · left: ${esc(baseDir)} · right: this run`:''}</h1>
<p>Rendered elements with a visible elevation shadow: ${total('elevation')}${delta(total('elevation'),baseTotal('elevation'))} · with a focus-ring shadow: ${total('focusRing')}${delta(total('focusRing'),baseTotal('focusRing'))} · with backdrop-filter: ${total('backdropFilter')}${delta(total('backdropFilter'),baseTotal('backdropFilter'))}</p>
${failures.length?`<p class="fail">Not captured: ${failures.map(f=>`${esc(f.name)} ${esc(f.mode)} (${esc(f.reason)})`).join('; ')}</p>`:''}
<main>
${rows}
</main>`;
};

/** The gallery is mounted only by development renderer builds, so serve the renderer source for it. */
async function captureGallery(capture) {
  const directory = await mkdtemp(join(tmpdir(),'vstudy-ui-gallery-'));
  let server, app;
  try {
    process.env.NODE_ENV = 'development'; // the Moodle fixture's vite build leaves production behind, which hides the gallery
    server = await createServer({mode:'development',configFile:false,logLevel:'error',root:resolve(desktop,'src/renderer'),resolve:{alias:{'@':resolve(desktop,'src/renderer')}},html:{cspNonce:'vstudy-development'},plugins:[react(),tailwind()],server:{host:'127.0.0.1',port:0,fs:{allow:[desktop]}}});
    await server.listen();
    app = await electron.launch({args:[desktop,`--user-data-dir=${directory}`,`--force-device-scale-factor=${scale}`],env:{...process.env,ELECTRON_RUN_AS_NODE:'',HOME:directory,XDG_CONFIG_HOME:directory,VSTUDY_LOCALE:'en',VSTUDY_FAKE_PROVIDER:'1',ELECTRON_RENDERER_URL:server.resolvedUrls.local[0]}});
    const page = await app.firstWindow();
    await page.emulateMedia({reducedMotion:'reduce'});
    await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setContentSize(size.width,size.height),viewport);
    await page.waitForFunction(()=>!!window.desktop?.invoke);
    await page.evaluate(()=>{window.location.hash='#/design';});
    await page.reload();
    await page.locator('label:has(> span:text-is("Scheme")) select').waitFor();
    for (const mode of modes) {
      await page.locator('label:has(> span:text-is("Scheme")) select').selectOption(mode);
      await page.locator('label:has(> span:text-is("Theme pack")) select').selectOption(theme);
      await page.evaluate(()=>window.document.fonts.ready);
      await capture('design',mode,page);
    }
  } catch (error) {
    const page = await app?.firstWindow().catch(()=>undefined);
    await page?.screenshot({path:join(out,'design.FAILED.png')}).catch(()=>{});
    console.error('gallery page:',page?.url(),(await page?.locator('body').innerText({timeout:2000}).catch(()=>''))?.slice(0,300));
    throw error;
  } finally {
    try {await app?.close();} finally {try {await server?.close();} finally {await rm(directory,{recursive:true,force:true});}}
  }
}

await mkdir(out,{recursive:true});
const shots = [], failures = [], metrics = {};
const record = async (name,mode,png,page) => {
  const file = `${name}-${mode}.png`;
  await writeFile(join(out,file),png);
  metrics[`${name}-${mode}`] = await page.evaluate(countEffects);
  shots.push({name,mode,file});
  const m = metrics[`${name}-${mode}`];
  console.log(`${name}-${mode}: elevation ${m.elevation}, ring ${m.focusRing}, backdrop ${m.backdropFilter}`);
};
const fail = (name,mode,error) => { failures.push({name,mode,reason:String(error.message??error).split('\n')[0].slice(0,200)}); console.error(`${name}-${mode} FAILED: ${failures.at(-1).reason}`); };

const directory = await mkdtemp(join(tmpdir(),'vstudy-ui-shots-'));
let session;
try {
  if (only && only.every(name=>name==='design')) throw Object.assign(new Error('gallery only'),{skip:true});
  session = await launchMarketing({desktop,directory,scale});
  const { page, views, applyAppearance, finishView } = session;
  const marketing = Object.fromEntries(Object.entries(views).map(([key,prepare])=>[aliases[key],{key,prepare}]));
  const all = {...Object.fromEntries(Object.entries(marketing).map(([name,{prepare}])=>[name,prepare])),...extraViews(session)};
  for (const mode of modes) for (const [name,prepare] of Object.entries(all)) {
    if (!wanted(name)) continue;
    let cleanup;
    try {
      await applyAppearance(theme,mode);
      cleanup = await prepare();
      await record(name,mode,await captureRaw(session,name,scale),page);
    } catch (error) {
      fail(name,mode,error);
      await page.screenshot({path:join(out,`${name}-${mode}.FAILED.png`)}).catch(()=>{});
    } finally {
      const key = marketing[name]?.key;
      if (key) await finishView(key).catch(()=>{});
      if (typeof cleanup === 'function') await cleanup().catch(()=>{});
    }
  }
  if (session.errors.length) failures.push({name:'(page errors)',mode:'-',reason:session.errors.join(' | ').slice(0,300)});
} catch (error) {
  if (!error.skip) throw error;
} finally {
  try {await session?.close();} finally {await rm(directory,{recursive:true,force:true});}
}
if (wanted('design')) {
  try {
    await captureGallery(async (name,mode,page)=>record(name,mode,await page.screenshot({fullPage:true}),page));
  } catch (error) {
    for (const mode of modes) if (!shots.some(shot=>shot.name==='design'&&shot.mode===mode)) fail('design',mode,error);
  }
}

const baseMetrics = base ? await readFile(join(base,'metrics.json'),'utf8').then(text=>JSON.parse(text).views).catch(()=>undefined) : undefined;
const order = Object.keys(metrics);
shots.sort((a,b)=>a.mode.localeCompare(b.mode)||order.indexOf(`${a.name}-${a.mode}`)-order.indexOf(`${b.name}-${b.mode}`));
await writeFile(join(out,'metrics.json'),JSON.stringify({captureTime:new Date(captureTime).toISOString(),theme,viewport:{...viewport,scale},counted:'rendered elements (non-zero box, visibility visible, opacity above zero) with a shadow layer of non-transparent colour and non-zero blur, spread or offset (elevation), spread-only layers (focusRing), or a backdrop-filter; rawBoxShadow is the old not-none count',views:metrics,failures},null,2)+'\n');
await writeFile(join(out,'index.html'),contactSheet({shots,failures,metrics,baseMetrics,baseDir:base}));
console.log(`${shots.length} shots, ${failures.length} failures → ${join(out,'index.html')}`);
if (failures.length) process.exitCode = 1;
