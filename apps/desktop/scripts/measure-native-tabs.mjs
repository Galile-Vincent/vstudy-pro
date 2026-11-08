import { spawnSync } from 'node:child_process';
const count=Number(process.argv[2] ?? 5);
if(!Number.isInteger(count) || count<1 || count>30) throw Error('Specify 1 to 30 tabs');
const result=spawnSync(process.execPath,['e2e/moodle-webview.mjs'],{stdio:'inherit',env:{...process.env,VSTUDY_MEASURE_NATIVE_TABS:String(count)}});
process.exitCode=result.status ?? 1;
