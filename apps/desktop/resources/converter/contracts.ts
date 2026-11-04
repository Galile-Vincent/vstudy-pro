export const MAX_MARKDOWN_BYTES = 8 * 1024 * 1024;
export type Progress = (message: string) => void;
export type ConverterRunner = (source: string, output: string, onProgress?: Progress) => Promise<"pdf_md" | "markitdown" | void>;

export function scrubbedEnvironment(cwd: string): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? "/usr/bin:/bin:/opt/homebrew/bin",
    HOME: cwd,
    TMPDIR: cwd,
    LANG: "en_US.UTF-8",
    PYTHONIOENCODING: "utf-8",
    PYTHONNOUSERSITE: "1",
    PIP_DISABLE_PIP_VERSION_CHECK: "1",
    PIP_CONFIG_FILE: "/dev/null",
    PIP_NO_INPUT: "1",
    UV_NO_CONFIG: "1",
    UV_NO_PROGRESS: "1",
  };
}

