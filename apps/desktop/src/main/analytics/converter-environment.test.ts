import { expect, it, vi } from 'vitest';
import { delimiter, dirname } from 'node:path';
import { executableDirectories, systemExecutable } from '../platform/process';
import { scrubbedEnvironment } from '../../../resources/converter/contracts';
it('uses fixed executable directories and managed Python without inherited secrets',()=>{
 vi.stubEnv('PATH','/attacker');vi.stubEnv('OPENAI_API_KEY','secret');vi.stubEnv('PYTHONPATH','/attacker');
 try {
  const env=scrubbedEnvironment('/scratch');
  expect(env.PATH).toBe([...executableDirectories(),...(process.platform==='win32'?[dirname(systemExecutable('cmd.exe'))]:['/usr/bin','/bin'])].join(delimiter));
  expect(env).toMatchObject({HOME:'/scratch',TMPDIR:'/scratch',UV_PYTHON_PREFERENCE:'only-managed',UV_NO_CONFIG:'1',PYTHONNOUSERSITE:'1'});
  expect(env.OPENAI_API_KEY).toBeUndefined();expect(env.PYTHONPATH).toBeUndefined();
 }finally{vi.unstubAllEnvs();}
});
