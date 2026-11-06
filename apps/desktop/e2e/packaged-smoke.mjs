if (process.platform !== 'darwin') { console.log('SKIP: legacy macOS codesign smoke; use scripts/smoke-distribution.mjs for cross-platform artifacts.'); process.exit(0); }
import { setTimeout } from 'node:timers';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile, realpath, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
const root=await realpath(await mkdtemp(join(tmpdir(),'vstudy-packaged-smoke-')));
const app=resolve('release/mac-arm64/VStudy Pro.app');
let child;
try {
  await mkdir(join(root,'user-data'),{mode:0o700});
  execFileSync('/usr/bin/python3',['test-fixtures/converter/generate.py',join(root,'fixtures')]);
  // Copy a prepared converter so the smoke never bootstraps over the network.
  const venv=process.env.VSTUDY_CONVERTER_VENV;
  assert.ok(venv,'Set VSTUDY_CONVERTER_VENV to an existing locked converter environment');
  execFileSync('/bin/cp',['-cR',venv,join(root,'user-data','converter-venv')]);
  const signature=execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',app],{encoding:'utf8'});
  const entitlements=execFileSync('/usr/bin/codesign',['-d','--entitlements',':-',app],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  assert.ok(!entitlements.includes('allow-jit')&&!entitlements.includes('disable-library-validation'));
  const {getCurrentFuseWire,FuseV1Options:F}=await import('@electron/fuses');
  const fuses=await getCurrentFuseWire(app);
  for(const key of [F.EnableCookieEncryption,F.RunAsNode,F.EnableNodeOptionsEnvironmentVariable,F.EnableNodeCliInspectArguments,F.GrantFileProtocolExtraPrivileges]) assert.equal(fuses[key],48);
  for(const key of [F.OnlyLoadAppFromAsar,F.EnableEmbeddedAsarIntegrityValidation]) assert.equal(fuses[key],49);
  let log='';
  child=spawn(join(app,'Contents/MacOS/VStudy Pro'),[],{env:{...process.env,ELECTRON_RUN_AS_NODE:'',ELECTRON_ENABLE_LOGGING:'1',VSTUDY_PACKAGED_SMOKE_DIR:root,VSTUDY_FAKE_PROVIDER:'1'},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',d=>{log+=d;});child.stderr.on('data',d=>{log+=d;});
  const exit=await Promise.race([new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal}))),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Packaged app timed out')),90000).unref())]).catch(async error=>{
    try {execFileSync('/usr/bin/sample',[String(child.pid),'2','-file','/tmp/vstudy-packaged-hang.sample.txt']);}catch{ /* A terminated process cannot be sampled. */ }
    await writeFile('/tmp/vstudy-packaged-hang.log',log);
    throw error;
  });
  await writeFile('/tmp/vstudy-packaged-smoke.log',log);
  assert.equal(exit.code,0,log);
  const result=JSON.parse(await readFile(join(root,'smoke-result.json'),'utf8'));
  assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.windowVisible,true);assert.equal(result.imports,2);assert.equal(result.chatPersisted,true);
  assert.equal(result.userData,join(root,'user-data'));
  console.log(JSON.stringify({result,signature,fuses,asarBytes:(await stat(join(app,'Contents/Resources/app.asar'))).size}));
} finally {child?.kill('SIGKILL');await rm(root,{recursive:true,force:true});}
