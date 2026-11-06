/** Verifies vector render comparisons, icon geometry, flight bounds, and protected text. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { bezier, flights, frame, duration, protectedPoint } from '../apps/website/src/scripts/butterfly-model.ts';
const original = JSON.parse(await readFile(new URL('../assets/brand/generated/validation.json', import.meta.url)));
assert.equal(original.length, 9);
assert.ok(original.every(item => item.meanChannelError < .2));
const { data, info } = await sharp(new URL('../apps/desktop/build/icon-mac.png', import.meta.url).pathname).ensureAlpha().raw().toBuffer({resolveWithObject:true});
assert.equal(info.width,1024); assert.equal(info.height,1024);
const alpha = (x,y) => data[(y * 1024 + x)*4+3];
assert.equal(alpha(0,0),0); assert.equal(alpha(512,50),0);
assert.equal(alpha(512,100),255); assert.equal(alpha(512,923),255);
assert.ok(alpha(512,924) < 80);
assert.ok(alpha(512,949) > 0 && alpha(512,949) < 80);
assert.equal(alpha(512,1000),0);
for (const width of [390,768,1024,1440,1920]) for (const direction of ['arc','ribbon','orbit']) {
  const paths=flights(width,{x:width/2,y:180},{x:50,y:75},740,width<768?3:4,direction);
  const zones=[{left:width*.1,right:width*.9,top:240,bottom:560}];
  for (const flight of paths) {
    assert.deepEqual(bezier(flight.points,0),flight.points[0]);
    assert.deepEqual(bezier(flight.points,1),flight.points[3]);
    for (let elapsed=0;elapsed<=duration;elapsed+=16) {
      const state=frame(flight,elapsed,zones);
      assert.ok(Number.isFinite(state.point.x) && state.opacity>=0 && state.opacity<=1);
      if(protectedPoint(state.point,zones,flight.size*.8)) assert.equal(state.opacity,0);
    }
    assert.equal(frame(flight,duration,zones).opacity,0);
  }
}
console.log('PASS. Nine SVG render comparisons, 824px macOS icon body and transparent margin, five flight widths, three variants, protected text, and finite lifecycle.');

for (const name of ['apps/desktop/build/icon.ico','apps/website/public/favicon.ico']) {
  const ico=await readFile(new URL('../'+name,import.meta.url));
  for(let i=0;i<ico.readUInt16LE(4);i++) {
    const entry=6+i*16;
    const start=ico.readUInt32LE(entry+12),size=ico.readUInt32LE(entry+8);
    const png=await sharp(ico.subarray(start,start+size)).metadata();
    assert.equal(png.width,ico[entry] || 256);assert.equal(png.height,ico[entry+1] || 256);
  }
}
