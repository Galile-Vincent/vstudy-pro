import { describe, expect, it } from 'vitest';
import { classifySetupError, setupDiagnostic, setupErrors, setupFailure } from './ai-setup-errors';

describe('setup recovery', () => {
  it.each([
    ['not-installed', '', 'not-installed'], ['not-signed-in', '', 'not-signed-in'],
    ['unknown', 'session expired', 'login-expired'], ['unknown', 'ENOTFOUND', 'offline'],
    ['unknown', 'EACCES permission denied', 'permission-denied'], ['unknown', 'ENOENT', 'command-not-found'],
    ['unknown', 'version too old', 'wrong-version'], ['unknown', '429 quota exceeded', 'rate-limit'],
    ['unknown', 'something unexpected', 'unknown'],
  ])('classifies %s %s into actionable recovery', (code, text, expected) => {
    const issue = classifySetupError(code, text);
    expect(issue).toBe(expected);
    expect(setupErrors[issue].title).toBeTruthy();
    expect(setupErrors[issue].next).toBeTruthy();
    if (code === 'unknown') expect(setupFailure(text)).toBe(expected);
  });
  it('copies metadata and last error without credentials or home paths on any platform', () => {
    const result = setupDiagnostic({ tool: 'Codex', version: '0.166.0', os: 'darwin', exitCode: 1,
      error: 'token=secret123 Authorization: Bearer abc123\n/Users/student/private /home/student/key C:\\Users\\student\\private\nOPENAI_API_KEY=sk-example123 cookie: session=secret' });
    expect(result).toContain('Tool: Codex\nVersion: 0.166.0\nOS: darwin\nExit code: 1');
    expect(result).toContain('Last error:');
    expect(result).not.toMatch(/secret123|abc123|student|sk-example123|session=secret/);
  });
});
