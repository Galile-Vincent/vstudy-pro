import { describe, expect, it } from 'vitest';
import { classifySetupError, setupDiagnostic, setupErrors, setupFailure } from './ai-setup-errors';

describe('setup recovery', () => {
  it.each([
    ['not-installed', '', 'not-installed'], ['not-signed-in', '', 'not-signed-in'],
    ['unknown', 'session expired', 'login-expired'], ['unknown', 'ENOTFOUND', 'offline'],
    ['unknown', 'EACCES permission denied', 'permission-denied'], ['unknown', 'ENOENT', 'command-not-found'],
    ['unknown', 'version too old', 'wrong-version'], ['unknown', '429 quota exceeded', 'rate-limit'],
    ['unknown', 'ENOSPC: no space left on device', 'disk-full'], ['unknown', 'EDQUOT disk quota exceeded', 'disk-full'],
    ['disk-full', '', 'disk-full'],
    ['unknown', 'TLS certificate expired', 'certificate'],
    ['unknown', 'SSL certificate verification failed', 'certificate'],
    ['unknown', 'token expired', 'login-expired'],
    ['unknown', 'expired authentication credentials', 'login-expired'],
    ['unknown', 'download URL expired', 'unknown'],
    ['unknown', 'something unexpected', 'unknown'],
  ])('classifies %s %s into actionable recovery', (code, text, expected) => {
    const issue = classifySetupError(code, text);
    expect(issue).toBe(expected);
    expect(setupErrors[issue].title).toBeTruthy();
    expect(setupErrors[issue].next).toBeTruthy();
    if (code === 'unknown') expect(setupFailure(text)).toBe(expected);
  });
  it.each([
    '--password swordfish123',
    '-----BEGIN PRIVATE KEY-----\nPRIVATEKEYMATERIAL123\n-----END PRIVATE KEY-----',
    'Login failed for user AliceNg',
    '--token hostileToken123 -p hiddenPassword123 /Users/AliceNg/private',
  ])('excludes hostile raw errors from copied diagnostics: %s', error => {
    const result = setupDiagnostic({ tool: 'Codex', version: '0.166.0', os: 'darwin', exitCode: 1, error });
    expect(result).not.toMatch(/swordfish123|PRIVATE KEY|PRIVATEKEYMATERIAL123|AliceNg|hostileToken123|hiddenPassword123/);
    expect(result).toContain('Exit code: 1');
  });
  it.each([['ENOSPC: no space left on device', 'disk-full'], ['permission-denied', 'permission-denied'], ['offline', 'offline'], ['EPERM: operation not permitted', 'permission-denied']])('keeps the classified cause %s in copied diagnostics', (error, cause) => {
    expect(setupDiagnostic({ tool: 'Codex', version: null, os: 'darwin', exitCode: 1, error })).toContain(`Last error: ${cause}`);
  });
  it('rejects injected diagnostic metadata', () => {
    const result = setupDiagnostic({ tool: 'Codex\nuser AliceNg', version: 'secret123', os: '/Users/AliceNg', exitCode: NaN, error: 'private output' });
    expect(result).toBe('Tool: unknown\nVersion: unknown\nOS: unknown\nExit code: unknown\nLast error: unknown');
  });
  it('copies metadata and last error without credentials or home paths on any platform', () => {
    const result = setupDiagnostic({ tool: 'Codex', version: '0.166.0', os: 'darwin', exitCode: 1,
      error: 'token=secret123 Authorization: Bearer abc123\n/Users/student/private /home/student/key C:\\Users\\student\\private\nOPENAI_API_KEY=sk-example123 cookie: session=secret' });
    expect(result).toContain('Tool: Codex\nVersion: 0.166.0\nOS: darwin\nExit code: 1');
    expect(result).toContain('Last error:');
    expect(result).not.toMatch(/secret123|abc123|student|sk-example123|session=secret/);
  });
});

it('classifies and copies a huge error string without stalling', () => {
  const start = Date.now();
  const diagnostic = setupDiagnostic({ tool: 'codex', version: null, os: 'darwin', exitCode: 1, error: 'executable '.repeat(500_000) });
  expect(diagnostic).toContain('Last error:');
  expect(Date.now() - start).toBeLessThan(200);
});
