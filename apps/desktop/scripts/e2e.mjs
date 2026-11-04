import { setTimeout, clearTimeout } from 'node:timers';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
if(!process.env.VSTUDY_CONVERTER_VENV) {
 const lock=resolve(root,'resources/converter/requirements.lock.txt');
 const fingerprint=createHash('sha256').update(await readFile(lock)).digest('hex');
 const venv=join(tmpdir(),`vstudy-e2e-converter-${fingerprint.slice(0,12)}`);
 const marker=join(venv,'.requirements-sha256');
 let installed=false;try {installed=(await readFile(marker,'utf8'))===fingerprint;}catch { /* A missing environment is prepared once for the suite. */ }
 if(!installed) {
  const created=await run('uv',['venv','--python','3.12',venv],'converter-environment',300000);
  if(created.status!=='PASS')throw new Error(`Install uv or set VSTUDY_CONVERTER_VENV; see ${evidence}/converter-environment.log`);
  const installed=await run('uv',['pip','install','--require-hashes','--python',join(venv,'bin/python'),'-r',lock],'converter-dependencies',600000);
  if(installed.status!=='PASS')throw new Error(`Locked converter installation failed; see ${evidence}/converter-dependencies.log`);
  await writeFile(marker,fingerprint);
 }
 process.env.VSTUDY_CONVERTER_VENV=venv;
}
const build=await run('pnpm',['package'],'build',240000);
if(build.status!=='PASS')throw new Error(`Build failed: ${evidence}/build.log`);
for(const script of (await readdir(`${root}/e2e`)).filter(n=>n.endsWith('.mjs')).sort()) {
 let result=await run(process.execPath,[`e2e/${script}`],script,['a11y-regressions.mjs','welcome-supplement.mjs','welcome-layout.mjs','welcome.mjs'].includes(script)?600000:script.includes('welcome')?180000:240000);
 if(result.status!=='PASS' && script==='welcome-performance.mjs') { console.log('Retrying welcome-performance once; first attempt retained'); await writeFile(`${evidence}/${script}-attempt1.json`,JSON.stringify(result)); result=await run(process.execPath,[`e2e/${script}`],script+'-retry',180000); result.script=script; }
 results.push(result);console.log(`${result.status.padEnd(7)} ${script} (${result.seconds}s)`);
 await writeFile(`${evidence}/results.json`,JSON.stringify(results,null,2));
}
console.table(results);process.exitCode=results.some(r=>!['PASS','SKIP'].includes(r.status))?1:0;
