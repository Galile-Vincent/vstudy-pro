/** The ACL helper receives only its native runtime environment and opaque path parameters. */
import { expect, it, vi } from 'vitest';
import { protectWindowsPath, verifyWindowsPath } from '../src/windows-acl';

it('keeps inherited credentials and user PowerShell module paths outside the storage helper', () => {
  const execute = vi.fn((_executable, _args, options) => {
    expect(options.env).not.toHaveProperty('OPENAI_API_KEY');
    expect(options.env).not.toHaveProperty('NODE_OPTIONS');
    expect(options.env.PSModulePath).toBe('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules');
    expect(options.env.SystemRoot).toBe('C:\\Windows');
    expect(options.windowsHide).toBe(true);
    return 'VSTUDY_ACL_OK';
  });
  const options = {sid: 'S-1-5-21-111-222-333-1001', execute,
    environment: {SystemRoot: 'C:\\Windows', PSModulePath: 'C:\\untrusted', OPENAI_API_KEY: 'synthetic', NODE_OPTIONS: '--inspect'}};
  protectWindowsPath('C:\\fixture\\private.json', false, options);
  verifyWindowsPath('C:\\fixture\\private.json', false, options);
  expect(execute).toHaveBeenCalledTimes(2);
});
