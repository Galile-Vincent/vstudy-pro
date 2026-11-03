import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'../../..');
const manifest=JSON.parse(await readFile(resolve(root,'docs/evidence/ui2-vendor-manifest.json'),'utf8'));
const failures=[];
for(const file of manifest.files){
 try{const data=await readFile(resolve(root,file.path));const hash=createHash('sha256').update(data).digest('hex');if(hash!==(file.patchedSha256??file.registrySha256))failures.push(`${file.path}: unreviewed drift`);}catch{failures.push(`${file.path}: missing`);}
}
const paths=new Set(manifest.files.map(f=>f.path));
async function walk(dir){for(const e of await readdir(resolve(root,dir),{withFileTypes:true})){const path=`${dir}/${e.name}`;if(e.isDirectory())await walk(path);else if(!paths.has(path))failures.push(`${path}: untracked vendor source`);}}
await walk('apps/desktop/src/renderer/components/assistant-ui');await walk('apps/desktop/src/renderer/components/ui');
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}else console.log(`${manifest.files.length} vendor sources match pinned registry hashes and reviewed patches`);
