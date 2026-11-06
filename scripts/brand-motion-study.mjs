/** Renders twelve reproducible frames for each flight direction in both schemes. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { flights, frame, duration } from '../apps/website/src/scripts/butterfly-model.ts';
const output = new URL('../docs/evidence/brand/motion/', import.meta.url);
await mkdir(output,{recursive:true});
const symbol = Buffer.from(await readFile(new URL('../assets/brand/generated/symbol.svg',import.meta.url))).toString('base64');
const label = (text,x,y,color,size=12) => `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-family="Arial">${text}</text>`;
for (const scheme of ['light','dark']) {
  const bg=scheme==='light'?'#fafafa':'#14141a', ink=scheme==='light'?'#18181b':'#f8f8fa', muted=scheme==='light'?'#737380':'#a2a2af';
  for (const direction of ['arc','ribbon','orbit']) {
    const paths=flights(1440,{x:720,y:176},{x:100,y:65},850,4,direction);
    const zones=[{left:400,right:1040,top:224,bottom:391},{left:410,right:1030,top:415,bottom:479},{left:520,right:920,top:511,bottom:559}];
    const frames=[];
    for(let i=0;i<12;i++) {
      const elapsed=duration*i/11;
      const marks=paths.map((path,j)=>{const state=frame(path,elapsed,zones);const scale=.68+Math.sin(elapsed/165+j)*.28;return `<g transform="translate(${state.point.x} ${state.point.y}) rotate(${state.angle}) scale(${scale} 1)" opacity="${state.opacity}"><image x="${-path.size/2}" y="${-path.size/2}" width="${path.size}" height="${path.size}" href="data:image/svg+xml;base64,${symbol}"/></g>`;}).join('');
      const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="900"><rect width="1440" height="900" fill="${bg}"/>${label('VStudy Pro',80,42,ink,20)}<image x="706" y="165" width="28" height="22" href="data:image/svg+xml;base64,${symbol}"/>${label('Your semester,',430,292,ink,64)}${label('with room to think.',390,370,ink,64)}${label('Coursework, reading, and study plans in one calm workspace.',400,445,muted,20)}<rect x="520" y="511" width="400" height="48" rx="12" fill="${muted}" opacity=".1"/><rect x="168" y="659" width="1104" height="241" rx="22" fill="${muted}" opacity=".08"/>${marks}${label(`${direction} | ${(elapsed/1000).toFixed(1)} s`,30,870,muted,18)}</svg>`;
      const png=await sharp(Buffer.from(svg)).resize(480,300).png().toBuffer();
      await writeFile(new URL(`${direction}-${scheme}-${String(i).padStart(2,'0')}.png`,output),png);
      frames.push({input:png,left:(i%3)*480,top:Math.floor(i/3)*300});
    }
    await sharp({create:{width:1440,height:1200,channels:4,background:bg}}).composite(frames).png().toFile(new URL(`${direction}-${scheme}-sequence.png`,output).pathname);
  }
}
console.log('Rendered 72 prototype frames and six contact sheets.');
