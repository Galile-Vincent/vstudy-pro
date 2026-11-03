import { URL } from 'node:url';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const css=readFileSync(new URL('../src/renderer/tokens.css',import.meta.url),'utf8');
const themes=css.split('@media(prefers-color-scheme:dark)').slice(0,2);
for(const [i,theme] of themes.entries()) {
 const values=Object.fromEntries([...theme.matchAll(/--(surface|ink|muted|line|focus):oklch\(([.\d]+) 0 0\)/g)].map(m=>[m[1],Number(m[2])**3]));
 for(const [fg,bg,min] of [['ink','surface',4.5],['muted','surface',4.5],['line','surface',3],['focus','surface',3]]) {
  const a=values[fg],b=values[bg];assert.ok(a!==undefined&&b!==undefined);
  const contrast=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  console.log(`${i?'dark':'light'} ${fg}/${bg}: ${contrast.toFixed(2)} (minimum ${min})`); assert.ok(contrast>=min);
 }
}
const luminance = hex => {
 const channels=hex.match(/[a-f\d]{2}/gi).map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
 return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
};
for (const [theme,background,palettes] of [['light','f2f2f2',[12,13,14]],['dark','181818',[27,28,29,14]]]) {
 for (const palette of palettes) {
  const matches=[...css.matchAll(new RegExp(`--palette-${palette}:#([a-f0-9]{6})`,'g'))];
  const color=matches[theme==='dark'?matches.length-1:0][1];
  const a=luminance(color), b=luminance(background), contrast=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  console.log(`${theme} syntax palette-${palette}: ${contrast.toFixed(2)}`);assert.ok(contrast>=4.5);
 }
}
