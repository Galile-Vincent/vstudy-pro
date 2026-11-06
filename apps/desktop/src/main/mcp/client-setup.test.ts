/** The app wizard previews entry-only changes and writes client configuration only after an explicit install. @packageDocumentation */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createAgentClientSetup } from './client-setup';
it('provides quoted actionable commands and preserves unrelated config during install',async()=>{
  const root=mkdtempSync('/private/tmp/vm-client-');
  try {
    const home=join(root,'student home'),bin=join(root,"student's mcp.cjs");mkdirSync(home);writeFileSync(bin,'');
    const api=createAgentClientSetup(bin,join(root,'data'),{home,command:process.execPath,environment:{PATH:''}});
    const clients=await api.list();expect(clients).toHaveLength(5);
    expect(clients.find(client=>client.client==='codex')?.command).toContain("install --client codex");
    expect(clients[0]?.command).toContain("student'\\''s mcp.cjs");
    const path=join(home,'.codex/config.toml');
    const preview=await api.install('codex',true);expect(preview.changed).toBe(true);expect(existsSync(path)).toBe(false);
    mkdirSync(join(home,'.codex'));writeFileSync(path,'model = "student-choice"\n');
    const installed=await api.install('codex',false);expect(installed.changed).toBe(true);
    expect(readFileSync(path,'utf8')).toContain('model = "student-choice"');
    expect(readFileSync(path,'utf8')).toContain('[mcp_servers.vstudy]');
    expect((await api.install('codex',false)).changed).toBe(false);
  } finally {rmSync(root,{recursive:true,force:true});}
});
