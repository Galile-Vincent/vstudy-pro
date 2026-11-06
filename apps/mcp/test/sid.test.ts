/** Verify the shared SID resolver invokes whoami directly and rejects ambiguous identities. @packageDocumentation */
import { expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { currentWindowsSid } from '../../desktop/src/main/mcp/endpoint';

vi.mock('node:child_process', async original => ({ ...await original<typeof import('node:child_process')>(), execFileSync: vi.fn() }));

it('uses the actual SID from fixed whoami argv rather than a claimed name', () => {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
  const previous = process.env.SystemRoot;
  try {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    process.env.SystemRoot = 'D:\\Windows';
    vi.mocked(execFileSync).mockReturnValue('"Domain/User","S-1-5-21-100-200-300-1001"');
    expect(currentWindowsSid()).toBe('S-1-5-21-100-200-300-1001');
    expect(execFileSync).toHaveBeenCalledWith('D:\\Windows\\System32\\whoami.exe', ['/user', '/fo', 'csv', '/nh'],
      expect.objectContaining({ encoding: 'utf8', timeout: 2000, windowsHide: true }));
    vi.mocked(execFileSync).mockReturnValue('"user","not-a-SID"');
    expect(() => currentWindowsSid()).toThrow();
    vi.mocked(execFileSync).mockReturnValue('S-1-5-21-100-200 S-1-5-21-300-400');
    expect(() => currentWindowsSid()).toThrow();
  } finally {
    Object.defineProperty(process, 'platform', descriptor);
    if (previous === undefined) delete process.env.SystemRoot; else process.env.SystemRoot = previous;
  }
});
