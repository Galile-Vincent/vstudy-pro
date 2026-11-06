/** A saved opt-in restores the real Unix runtime and authenticates the bundled CLI without new consent. @packageDocumentation */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Credentials } from '../src/credentials';
import { toolResultSchema } from '../src/contract';

it.skipIf(process.platform === 'win32')('reconnects an SDK client with an existing grant after restoring saved opt-in', async () => {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'vmr-'));
  const userData = join(root, 'data'), home = join(root, 'home');
  mkdirSync(userData); mkdirSync(home);
  let runtime:import('../../desktop/src/main/mcp/runtime').McpRuntime | undefined;
  let client:Client | undefined;
  try {
    await build({entryPoints:{runtime:resolve('../desktop/src/main/mcp/runtime.ts'), grants:resolve('../desktop/src/main/mcp/grants.ts')},
      nodePaths:[resolve('../desktop/node_modules')], bundle:true, platform:'node', format:'cjs', outdir:root, outExtension:{'.js':'.cjs'}, mainFields:['module','main'],
    });
    const require = createRequire(import.meta.url);
    const {GrantStore} = require(join(root, 'grants.cjs')) as typeof import('../../desktop/src/main/mcp/grants');
    const {createMcpRuntime} = require(join(root, 'runtime.cjs')) as typeof import('../../desktop/src/main/mcp/runtime');
    const account = {id:randomUUID(), school:'Fixture University', user:'Student'};
    const store = new GrantStore(userData);
    store.setEnabled(true);
    const credentials = new Credentials(join(home, '.config/vstudy-mcp/codex.json'));
    const identity = credentials.identity();
    const paired = store.issue(identity.clientId, 'Existing Codex', ['read:courses'], [account.id]);
    credentials.save({...identity, grant:paired.grant, expiresAt:paired.grantInfo.expiresAt});
    const saved = readFileSync(join(userData, 'mcp/state.json'), 'utf8');
    const helper = join(root, 'mcp-peer');
    execFileSync(process.execPath, [resolve('../../scripts/build-mcp-peer.mjs'), '--output', helper]);
    const restoreWindow = vi.fn(), onFailure = vi.fn();
    runtime = createMcpRuntime({userData, peerHelper:helper, backend:{accounts:()=>[account], prepare:async()=>({
      accountId:account.id, target:'Course', provenance:{account:account.id, school:account.school, courseId:null, moduleId:null, author:null, syncedAt:null}, execute:async()=>({content:{title:'Course'}}),
    })}, secretValues:()=>[], restoreWindow, onFailure});
    expect(existsSync(join(userData, 'mcp/bridge.sock'))).toBe(false);
    await runtime.restore();
    await runtime.ready;
    expect(runtime.state()).toMatchObject({enabled:true, unavailable:false});
    expect(readFileSync(join(userData, 'mcp/state.json'), 'utf8')).toBe(saved);
    expect(existsSync(join(userData, 'mcp/bridge.sock'))).toBe(true);
    client = new Client({name:'Startup regression', version:'1.0.0'});
    await client.connect(new StdioClientTransport({command:process.execPath, args:[resolve('dist/vstudy-mcp.cjs'), '--client', 'codex'], stderr:'pipe',
      env:{HOME:home, PATH:process.env.PATH ?? '', VSTUDY_USER_DATA:userData},
    }));
    expect(toolResultSchema.parse((await client.callTool({name:'list_courses', arguments:{}})).structuredContent)).toMatchObject({ok:true, data:{content:{title:'Course'}}});
    expect(runtime.state().pairings).toEqual([]);
    expect(restoreWindow).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();
    expect(runtime.state().grants.some(grant => grant.id === paired.grantInfo.id && grant.lastUsedAt !== null)).toBe(true);
  } finally {
    await client?.close();
    await runtime?.dispose();
    rmSync(root, {recursive:true, force:true});
  }
}, 15_000);
