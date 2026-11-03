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
