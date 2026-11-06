/** Auth checks use provider semantics, and tiny tests return only bounded tool-free text. @packageDocumentation */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { ActionPty } from './pty';
import { authStatus, tinyTest } from './probes';
import { buildPlan } from './plans';
import { ProviderRegistry } from '../index';
import { AgyAdapter, agyArgs } from '../agy';
import { temporaryDirectories } from './test-fixtures';
const temporary = temporaryDirectories();
it.each([0, 1])('uses Codex exit status %s without parsing account text', async code => {
  const root = await temporary(), script = join(root, 'login');
  const program = `console.log('localized account description');process.exit(${code});\n`;
  await writeFile(script, program);
  const plan = buildPlan('status-codex', root, process.execPath, null, null, Date.now());
  expect(await authStatus('codex', plan, new ActionPty(), AbortSignal.timeout(5000))).toBe(code === 0);
});
it('probes agy using initialize and session/new without authenticate or browser launch', async () => {
  const root = await temporary(), script = join(root, 'acp'), auth = join(root, 'signed-in'), methods = join(root, 'methods');
  const program = `
const fs=require('fs'), readline=require('readline');
const send=value=>console.log(JSON.stringify({jsonrpc:'2.0',...value}));
readline.createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);fs.appendFileSync(${JSON.stringify(methods)},r.method+'\\n');
if(r.method==='initialize')send({id:r.id,result:{protocolVersion:1}});
else if(r.method==='session/new'){if(!fs.existsSync(${JSON.stringify(auth)}))send({id:r.id,error:{code:401,message:'not logged in'}});else send({id:r.id,result:{sessionId:'test',models:{availableModels:[{modelId:'gemini-3.8-flash-high',name:'Fixture'}]}}});}
else if(r.method==='session/set_model')send({id:r.id,result:{}});
else if(r.method==='session/prompt'){send({method:'session/update',params:{sessionId:'test',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'AGY_OK'}}}});send({id:r.id,result:{stopReason:'end_turn'}});}
});
`;
  await writeFile(script, program);
  const plan = buildPlan('status-agy', root, process.execPath, null, null, Date.now());
  expect(await authStatus('agy', plan, new ActionPty(), AbortSignal.timeout(5000))).toBe(false);
  await writeFile(auth, 'yes');
  expect(await authStatus('agy', plan, new ActionPty(), AbortSignal.timeout(5000))).toBe(true);
  const registry = new ProviderRegistry(), adapter = new AgyAdapter({ findBinary: async () => process.execPath, args: [script, ...agyArgs] });
  registry.configure({ kind: 'cli', id: 'agy-cli', enabled: true }); registry.register('agy-cli', adapter);
  try { expect(await tinyTest(registry, 'agy', AbortSignal.timeout(5000))).toBe('AGY_OK'); }
  finally { adapter.dispose(); }
  const called = (await readFile(methods, 'utf8')).trim().split('\n');
  expect(called).toContain('initialize'); expect(called).toContain('session/new'); expect(called).not.toContain('authenticate');
});
it('rejects false success and tool calls from an adapter test', async () => {
  const registry = new ProviderRegistry(); registry.configure({ kind: 'cli', id: 'claude-cli', enabled: true });
  registry.register('claude-cli', { async detect() { return { available: true }; }, async listModels() { return []; }, async *stream() { yield { type: 'done' }; } });
  await expect(tinyTest(registry, 'claude', AbortSignal.timeout(5000))).rejects.toMatchObject({ code: 'unknown' });
  const tools = new ProviderRegistry(); tools.configure({ kind: 'cli', id: 'claude-cli', enabled: true });
  tools.register('claude-cli', { async detect() { return { available: true }; }, async listModels() { return []; }, async *stream() { yield { type: 'tool-call', call: { toolCallId: 'tool', toolName: 'shell', args: {} } }; yield { type: 'done' }; } });
  await expect(tinyTest(tools, 'claude', AbortSignal.timeout(5000))).rejects.toMatchObject({ code: 'blocked' });
});
