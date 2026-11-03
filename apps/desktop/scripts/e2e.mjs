import { setTimeout, clearTimeout } from 'node:timers';
import { spawn } from 'node:child_process';
import { readdir, mkdir, writeFile, open, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..');
const evidence=process.env.VSTUDY_E2E_EVIDENCE ?? '/tmp/vstudy-final/e2e';
await mkdir(evidence,{recursive:true});
const results=[];
async function run(command,args,name,timeout) {
 const file=await open(`${evidence}/${name}.log`,'w');
 const start=Date.now();
 const child=spawn(command,args,{cwd:root,env:{...process.env,VSTUDY_FAKE_PROVIDER:'1',CSC_IDENTITY_AUTO_DISCOVERY:'false'},stdio:['ignore',file.fd,file.fd],detached:true});
 let timedOut=false;
 const timer=setTimeout(()=>{timedOut=true;process.kill(-child.pid,'SIGKILL');},timeout);
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
 clearTimeout(timer);await file.close();
 const skipped=code===0 && /^SKIP:/m.test(await readFile(`${evidence}/${name}.log`,'utf8'));
 return {script:name,status:timedOut?'TIMEOUT':skipped?'SKIP':code===0?'PASS':'FAIL',seconds:Math.round((Date.now()-start)/1000),code};
}
const build=await run('pnpm',['package'],'build',240000);
if(build.status!=='PASS')throw new Error(`Build failed: ${evidence}/build.log`);
for(const script of (await readdir(`${root}/e2e`)).filter(n=>n.endsWith('.mjs')).sort()) {
 let result=await run(process.execPath,[`e2e/${script}`],script,script==='a11y-regressions.mjs'?600000:script.includes('welcome')?180000:240000);
 if(result.status!=='PASS' && script==='welcome-performance.mjs') { console.log('Retrying welcome-performance once; first attempt retained'); await writeFile(`${evidence}/${script}-attempt1.json`,JSON.stringify(result)); result=await run(process.execPath,[`e2e/${script}`],script+'-retry',180000); result.script=script; }
 results.push(result);console.log(`${result.status.padEnd(7)} ${script} (${result.seconds}s)`);
 await writeFile(`${evidence}/results.json`,JSON.stringify(results,null,2));
}
console.table(results);process.exitCode=results.some(r=>!['PASS','SKIP'].includes(r.status))?1:0;
