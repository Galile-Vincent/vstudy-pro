/** Build a side-by-side art review board from unchanged reference crops and captured Electron cards. */
import sharp from 'sharp';
import { Buffer } from 'node:buffer';
import { resolve, join } from 'node:path';
const [referenceOne,referenceTwo]=process.argv.slice(2);
if(!referenceOne || !referenceTwo) throw new Error('Provide both owner reference image paths.');
const evidence=resolve('../../docs/evidence/art/courses/refine');
const target=join(evidence,process.env.REFINE_PHASE ?? 'final');
const cropOne=await sharp(referenceOne).extract({left:0,top:187,width:920,height:1224}).resize(400,620,{fit:'contain',background:'#f4f3f8'}).toBuffer();
const cropTwo=await sharp(referenceTwo).extract({left:0,top:200,width:920,height:1400}).resize(400,620,{fit:'contain',background:'#f4f3f8'}).toBuffer();
const card=await sharp(join(target,'ember-light-card.png')).resize(360,400,{fit:'inside'}).toBuffer();
const before=await sharp(join(evidence,'before/ember-light-card.png')).resize(360,400,{fit:'inside'}).toBuffer();
const labels=Buffer.from('<svg width="1200" height="760"><g font-family="system-ui,sans-serif" font-size="16" fill="#22293c"><text x="20" y="28">Reference 1 · Art above quiet type</text><text x="420" y="28">Reference 2 · Saturated art</text><text x="820" y="28">Courses · Refined Ember card</text><text x="820" y="465">Before · Muted cover</text></g></svg>');
await sharp({create:{width:1200,height:900,channels:4,background:'#f4f3f8'}}).composite([{input:cropOne,left:0,top:50},{input:cropTwo,left:400,top:50},{input:card,left:820,top:60},{input:before,left:820,top:485},{input:labels,left:0,top:0}]).png().toFile(join(target,'references-comparison.png'));
const grids=await Promise.all(['before',process.env.REFINE_PHASE ?? 'final'].map(async phase=>sharp(join(evidence,phase,'ember-light-grid.png')).resize(720,450).toBuffer()));
await sharp({create:{width:1440,height:490,channels:4,background:'#f4f3f8'}}).composite([{input:grids[0],left:0,top:40},{input:grids[1],left:720,top:40},{input:Buffer.from('<svg width="1440" height="40"><g font-family="system-ui,sans-serif" font-size="18" fill="#22293c"><text x="20" y="27">Before</text><text x="740" y="27">After</text></g></svg>'),left:0,top:0}]).png().toFile(join(target,'before-after-grid.png'));
console.log(`Art comparison boards saved in ${target}`);
