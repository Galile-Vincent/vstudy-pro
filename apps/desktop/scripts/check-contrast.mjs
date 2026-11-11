/** Checks the actual shipped theme model and prevents new fixed renderer CSS colors. */
import { readdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { URL } from 'node:url';
import { courseArtContrast } from './course-art-contrast.mjs';
import { builtinThemes, adjustedTokens, contrastFailures, contrastRatio } from '../src/shared/themes/index.ts';

for (const theme of builtinThemes) {
  for (const scheme of ['light','dark']) {
    for (let contrast=100;contrast<=150;contrast++) {
      const tokens=adjustedTokens(theme[scheme],scheme,contrast);
      const failures=contrastFailures(tokens);
      const art=courseArtContrast(tokens,scheme);
      assert.ok(art.label >= 4.5 && art.hero >= 4.5, `${theme.id} ${scheme} ${contrast}% course scrim AA ${JSON.stringify(art)}`);
      assert.deepEqual(failures,[],`${theme.id} ${scheme} ${contrast}%`);
    }
    assert.ok(contrastRatio(theme[scheme].ink,theme[scheme].surface)>=4.5,`${theme.id} ${scheme} document-cover label over opaque surface scrim`);
    console.log(`${theme.name} ${scheme}: WCAG AA passed at every contrast setting`);
  }
}
function composite(foreground, background, opacity) {
  return '#' + [1,3,5].map(i => Math.round(parseInt(foreground.slice(i,i+2),16)*opacity
    + parseInt(background.slice(i,i+2),16)*(1-opacity)).toString(16).padStart(2,'0')).join('');
}
let surfaceMinimum=Infinity;
for (const theme of builtinThemes) for (const scheme of ['light','dark']) {
  const tokens=theme[scheme];
  for (const opacity of [1,.88,.72]) for (const tint of ['surface','sidebar']) {
    for (const background of ['background','surface','sidebar','subtle','active']) {
      for (const foreground of ['ink','muted','accent-color','danger','success','warning','info']) {
        const ratio=contrastRatio(tokens[foreground],composite(tokens[tint],tokens[background],opacity));
        surfaceMinimum=Math.min(surfaceMinimum,ratio);
        assert.ok(ratio>=4.5,`${theme.id} ${scheme} ${opacity} translucent ${tint} over ${background}: ${foreground} ${ratio}`);
      }
    }
  }
}
console.log(`Translucent surfaces: minimum text contrast ${surfaceMinimum.toFixed(2)}:1`);
/* Frosted glass (tokens.css). The page field is --background under two static washes: the accent hue at a fixed
   pastel lightness, and a cool counter hue 100deg below it. An achromatic accent borrows the brand hue (265deg). The
   worst point is where both washes peak. Panels are 68% of the card surface over the field, chrome 72% of --surface or
   --sidebar-surface, overlays 92% of --surface over the field and over the 45% modal scrim. Text is checked on the field, on every glass, and on glass under
   the 6% and 10% ink hover overlays (5% in the sidebar, shell.css), at contrast settings 100% to 150%. Keep these numbers in step with tokens.css. */
const glassModel={
  light:{ l:.9, c:[.1,.16], accent:.5, complement:.35 },
  dark:{ l:.4, c:[.08,.13], accent:.45, complement:.35 },
  panel:.68, chrome:.72, float:.92, scrim:.45, hover:[.06,.1],
};
function toOklch(hex) {
  const [r,g,b]=[1,3,5].map(i => { const c=parseInt(hex.slice(i,i+2),16)/255; return c<=.04045?c/12.92:((c+.055)/1.055)**2.4; });
  const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b), m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b), s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
  const A=1.9779984951*l-2.428592205*m+.4505937099*s, B=.0259040371*l+.7827717662*m-.808675766*s, C=Math.hypot(A,B);
  return [.2104542553*l+.793617785*m-.0040720468*s,C,C<1e-4?0:Math.atan2(B,A)*180/Math.PI];
}
function fromOklch([L,C,H]) {
  const A=C*Math.cos(H*Math.PI/180), B=C*Math.sin(H*Math.PI/180);
  const l=(L+.3963377774*A+.2158037573*B)**3, m=(L-.1055613458*A-.0638541728*B)**3, s=(L-.0894841775*A-1.291485548*B)**3;
  return '#'+[4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.707614701*s]
    .map(c => { c=Math.min(1,Math.max(0,c)); c=c<=.0031308?12.92*c:1.055*c**(1/2.4)-.055; return Math.round(c*255).toString(16).padStart(2,'0'); }).join('');
}
function washes(accent, scheme) {
  const { l, c:[low,high] }=glassModel[scheme];
  const [,C,H]=toOklch(accent);
  const hue=H+(1-Math.min(C*50,1))*265, chroma=Math.min(Math.max(C,low),high);
  return [fromOklch([l,chroma,hue]),fromOklch([l,chroma,hue+260])];
}
const allText=['ink','muted','accent-color','danger','success','warning','info'];
let glassMinimum=Infinity, glassWorst='';
for (const theme of builtinThemes) for (const scheme of ['light','dark']) for (let contrast=100;contrast<=150;contrast+=25) {
  const tokens=adjustedTokens(theme[scheme],scheme,contrast);
  const [accentWash,complementWash]=washes(tokens['accent-color'],scheme), { accent, complement }=glassModel[scheme];
  const peak=composite(accentWash,tokens.background,accent);
  const fields=[tokens.background,peak,composite(complementWash,tokens.background,complement),composite(complementWash,peak,complement)];
  const card=scheme==='dark' ? composite(tokens.surface,tokens.ink,.94) : tokens.surface;
  const checks=[];
  for (const field of fields) {
    checks.push(['field',field,allText]);
    for (const [name,base,opacity] of [['panel',card,glassModel.panel],['topbar',tokens.surface,glassModel.chrome],['sidebar',tokens.sidebar,glassModel.chrome],['overlay',tokens.surface,glassModel.float]]) {
      if (name==='overlay') checks.push(['modal',composite(tokens.surface,composite(tokens['shadow-color'],field,glassModel.scrim),glassModel.float),allText]);
      const glass=composite(base,field,opacity);
      checks.push([name,glass,allText]);
      for (const hover of name==='sidebar'?[.05]:glassModel.hover) checks.push([`${name} hover ${hover}`,composite(tokens.ink,glass,hover),['ink','muted']]);
    }
  }
  for (const [name,surface,foregrounds] of checks) for (const foreground of foregrounds) {
    const ratio=contrastRatio(tokens[foreground],surface);
    if (ratio<glassMinimum) { glassMinimum=ratio; glassWorst=`${theme.id} ${scheme} ${contrast}% ${foreground} on ${name} ${surface}`; }
    assert.ok(ratio>=4.5,`${theme.id} ${scheme} ${contrast}% frosted ${name}: ${foreground} on ${surface} ${ratio.toFixed(2)}`);
  }
}
console.log(`Frosted glass over the ambient field: minimum text contrast ${glassMinimum.toFixed(2)}:1 (${glassWorst})`);
let count=0;
async function audit(url) {
  for (const entry of await readdir(url,{withFileTypes:true})) {
    const path=new URL(entry.name+(entry.isDirectory()?'/':''),url);
    if (entry.isDirectory()) await audit(path);
    else if (entry.name.endsWith('.css')) {
      const css=await readFile(path,'utf8');
      assert.equal(/\boklch\((?!from var\(--(?:accent-color|course-color)\))/.test(css),false,`OKLCH must derive from a semantic theme token in ${path.pathname}`);
      assert.equal(/#[a-f\d]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|lab|lch)\(|prefers-color-scheme|--palette-\d+|:\s*(?:white|black)\b|,\s*(?:white|black)\s+\d/.test(css),false,`Fixed CSS color or scheme override in ${path.pathname}`);
      count++;
    }
  }
}
await audit(new URL('../src/renderer/',import.meta.url));
console.log(`${count} renderer CSS files use semantic theme tokens`);
