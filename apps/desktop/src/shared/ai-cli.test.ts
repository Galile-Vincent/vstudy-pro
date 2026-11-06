/** Setup IPC rejects command and environment injection before privileged work starts. */
import { describe, expect, it } from 'vitest';
import { aiCliContract, cliToolStateSchema } from './ai-cli';

describe('AI setup capability boundary', () => {
  it('accepts only action IDs and a preview token', () => {
    const request = { actionId: 'login-claude', token: '3ecdf1a0-4fe8-4aac-b8d8-059f8ee90ba6' };
    expect(aiCliContract['ai-cli:run'].request.parse(request)).toEqual(request);
    for (const extra of [{ command: 'echo hacked' }, { args: ['--help'] }, { env: { PATH: '/tmp' } }, { cwd: '/tmp' }]) {
      expect(aiCliContract['ai-cli:run'].request.safeParse({ ...request, ...extra }).success).toBe(false);
    }
    expect(aiCliContract['ai-cli:preview'].request.safeParse({ actionId: 'login-claude; echo hacked' }).success).toBe(false);
  });
  it('bounds interactive input and terminal size', () => {
    const id = '3ecdf1a0-4fe8-4aac-b8d8-059f8ee90ba6';
    expect(aiCliContract['ai-cli:input'].request.safeParse({ id, data: 'x'.repeat(4097) }).success).toBe(false);
    expect(aiCliContract['ai-cli:resize'].request.safeParse({ id, columns: 0, rows: 24 }).success).toBe(false);
  });
  it('requires a specific recovery hint for errors', () => {
    const state = { provider: 'claude', consented: false, version: null, path: null, managed: false, latestVersion: null, releaseNotesUrl: null, checkedAt: null, previousVersion: null, appliesToNewChats: false, tested: false, status: 'error', error: null };
    expect(cliToolStateSchema.safeParse(state).success).toBe(false);
    expect(cliToolStateSchema.safeParse({ ...state, error: { code: 'offline', hint: 'offline' } }).success).toBe(true);
  });
});
