/** Compare three throwaway cover treatments in the Chromium renderer. */
import sharp from 'sharp';
import { chromium } from 'playwright';
import { builtinThemes } from '../src/shared/themes/index.ts';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const evidence=resolve('../../docs/evidence/art/clean/prototypes');
await mkdir(evidence,{recursive:true});
const base=`*{box-sizing:border-box}body{margin:0;font:14px system-ui;background:var(--background);color:var(--ink);padding:24px}h1{font-size:24px}main{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}article{min-width:0}.art{position:relative;overflow:hidden;border-radius:12px;isolation:isolate;background:radial-gradient(ellipse at 20% 10%,var(--a),transparent 72%),radial-gradient(ellipse at 90% 80%,var(--b),transparent 75%),var(--c)}.art:before{content:'';position:absolute;width:110%;height:160%;left:38%;top:28%;border-radius:50%;background:linear-gradient(155deg,color-mix(in oklab,var(--surface) 14%,transparent),transparent 65%);transform:rotate(-24deg)}.card{height:180px;margin-bottom:16px}.hero{height:340px}.pill{position:absolute;bottom:12px;left:12px;color:var(--surface);background:var(--ink);padding:6px 10px;border-radius:999px}.hero .pill{bottom:24px;font-size:24px}.b{background:linear-gradient(150deg,var(--a),var(--c) 52%,var(--b))}.b:before{left:0;top:65%;width:150%;background:var(--a);opacity:.24}.c{background:radial-gradient(ellipse at 50% 45%,var(--a),transparent 60%),radial-gradient(ellipse at 100% 100%,var(--b),var(--c))}.c:before{width:80%;height:85%;left:55%;top:-15%;background:color-mix(in oklab,var(--surface) 10%,transparent)}.flat .art{background:var(--surface);outline:1px solid var(--line)}.flat .art:before{display:none}`;
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:780}});
 for(const theme of builtinThemes)for(const scheme of ['light','dark']){
  const tokens=theme[scheme];
  const colors=`--a:oklch(from var(--accent-color) ${scheme==='light'?'.80':'.46'} .085 calc(h - 18));--b:oklch(from var(--accent-color) ${scheme==='light'?'.72':'.36'} .08 calc(h + 40));--c:oklch(from var(--accent-color) ${scheme==='light'?'.62':'.27'} .055 h)`;
  const html=`<!doctype html><style>:root{${Object.entries(tokens).map(([k,v])=>`--${k}:${v}`).join(';')};${colors}}${base}</style><body class="${theme.id==='contrast'?'flat':''}"><h1>${theme.name} / ${scheme}. Card and hero comparison.</h1><main>${['Aurora field','Soft wave','Halo'].map((name,i)=>`<article><h2>${name}</h2><div class="art card ${['a','b','c'][i]}"><span class="pill">1151 · CS201</span></div><div class="art hero ${['a','b','c'][i]}"><span class="pill">Algorithms &amp; Data Structures</span></div></article>`).join('')}</main>`;
  await writeFile(`/tmp/vstudy-clean-art-${theme.id}-${scheme}.html`,html);
  await page.setContent(html);
  await page.screenshot({path:join(evidence,`${theme.id}-${scheme}.png`)});
 }
}finally{await browser.close();}

const composites=[];
for(const [index,id] of builtinThemes.flatMap(t=>['light','dark'].map(s=>`${t.id}-${s}`)).entries()) {
  composites.push({input:await sharp(join(evidence,`${id}.png`)).resize(480,260).png().toBuffer(),left:index%3*480,top:Math.floor(index/3)*260});
}
await sharp({create:{width:1440,height:1560,channels:3,background:'#ffffff'}}).composite(composites).png().toFile(join(evidence,'all-themes.png'));
