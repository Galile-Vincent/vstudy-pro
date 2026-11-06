/** Native fake CLI fixtures traverse real PTYs and tool-free adapters in backend tests. @packageDocumentation */
import { join } from 'node:path';
import { ExecutablePins } from '../executable-pins';
import { ProviderRegistry } from '../index';
import { createCliAdapter } from '../cli';
import { AiCliSetup, type SetupDependencies } from './service';
import { ReleaseSource } from './releases';
import { payloadNetwork, payloadRelease, fixtureStore } from './test-fixtures';
export function claudeFixture(root: string, version = '1.0.0') {
  return Buffer.from(`#!${process.execPath}
const fs=require('fs');
const args=process.argv.slice(2), auth=${JSON.stringify(join(root, 'auth'))};
if(args[0]==='--version'){console.log('${version} (Claude Code)');process.exit(0);}
fs.appendFileSync(${JSON.stringify(join(root, 'argv.jsonl'))},JSON.stringify({args,env:{browser:process.env.BROWSER,updates:process.env.DISABLE_AUTOUPDATER}})+'\\n');
if(args[0]==='auth'&&args[1]==='status'){const ok=fs.existsSync(auth);console.log(JSON.stringify({loggedIn:ok,email:'PRIVATE@example.test',token:'PRIVATE'}));process.exit(ok?0:1);}
if(args[0]==='auth'&&args[1]==='login'){console.log('https://auth.example.test/manual');process.stdin.on('data',value=>{if(value.toString().trim()==='confirm'){fs.writeFileSync(auth,'yes');process.exit(0);}});}
else if(args[0]==='-p'){process.stdin.resume();process.stdin.on('end',()=>{console.log(JSON.stringify({type:'stream_event',event:{type:'content_block_delta',delta:{type:'text_delta',text:'OK'}}}));console.log(JSON.stringify({type:'result',is_error:false}));});}
else process.exit(2);
`);
}
export function setupFixture(root: string, overrides: Partial<SetupDependencies> = {}) {
  const payload = claudeFixture(root);
  const source = new ReleaseSource(payloadNetwork(payload));
  source.installable = async () => payloadRelease(payload);
  source.latest = async provider => {
    if (provider !== 'claude') throw new Error('unsupported fixture');
    return payloadRelease(payload);
  };
  const store = fixtureStore(join(root, 'tools'));
  const pins = new ExecutablePins(join(root, 'pins.json'), async () => false);
  const registry = new ProviderRegistry(); registry.register('claude-cli', createCliAdapter('claude'));
  const service = new AiCliSetup({ store, pins, registry, source, chatBusy: () => false, chatRevision: () => 0, loginInterpreters: [process.execPath], describe: provider => pins.describe(provider), ...overrides });
  return { service, store, pins, registry, source, payload };
}
