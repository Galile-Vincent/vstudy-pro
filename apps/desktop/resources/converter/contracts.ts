import { delimiter, dirname } from 'node:path';
import { executableDirectories, systemExecutable } from '../../src/main/platform/process';
export const MAX_MARKDOWN_BYTES = 8 * 1024 * 1024;
export type Progress = (message: string) => void;
export type ConverterRunner = (source: string, output: string, onProgress?: Progress) => Promise<"pdf_md" | "markitdown" | void>;

export function scrubbedEnvironment(cwd: string): NodeJS.ProcessEnv {
  return {
    PATH: [...executableDirectories(), ...(process.platform === 'win32' ? [dirname(systemExecutable('cmd.exe'))] : ['/usr/bin', '/bin'])].join(delimiter),
    HOME: cwd,
    TMPDIR: cwd,
    ...(process.platform === 'win32' ? {
      SystemRoot: process.env.SystemRoot ?? process.env.SYSTEMROOT ?? 'C:\\Windows',
      USERPROFILE: cwd, TEMP: cwd, TMP: cwd,
      LOCALAPPDATA: cwd, APPDATA: cwd,
    } : {}),
    LANG: "en_US.UTF-8",
    PYTHONIOENCODING: "utf-8",
    PYTHONNOUSERSITE: "1",
    PIP_DISABLE_PIP_VERSION_CHECK: "1",
    PIP_CONFIG_FILE: process.platform === 'win32' ? 'NUL' : '/dev/null',
    PIP_NO_INPUT: "1",
    UV_NO_CONFIG: "1",
    UV_NO_PROGRESS: "1",
  };
}

