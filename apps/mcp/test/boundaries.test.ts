/** Enforce package ownership and build ordering without launching Electron. @packageDocumentation */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

describe('package boundaries', () => {
  it('has no school networking or privileged desktop imports and keeps modules bounded', () => {
    for (const name of readdirSync('src').filter(name => name.endsWith('.ts'))) {
      const source = readFileSync(`src/${name}`, 'utf8');
      expect(source.split('\n').length, name).toBeLessThan(400);
      expect(source.startsWith('/**'), name).toBe(true);
      expect(source, name).not.toMatch(/from ['"](?:electron|node:https?|node:http2|undici|axios)/);
      expect(source, name).not.toMatch(/\bfetch\s*\(|webContents|safeStorage|wstoken|autologin/);
      const privileged = source.match(/from ['"]([^'"]*desktop[^'"]*)['"]/g) ?? [];
      expect(privileged.every(value => value.includes('/shared/mcp') || value.includes('/main/platform/app-data') || value.includes('/main/mcp/endpoint')), name).toBe(true);
    }
  });

});
