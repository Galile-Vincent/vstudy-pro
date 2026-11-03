import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { createHash } from "node:crypto";

export const MAX_MARKDOWN_BYTES = 8 * 1024 * 1024;
export type Progress = (message: string) => void;
export type ConverterRunner = (source: string, output: string) => Promise<void>;

export function scrubbedEnvironment(cwd: string): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? "/usr/bin:/bin:/opt/homebrew/bin",
    HOME: cwd,
    TMPDIR: cwd,
    LANG: "en_US.UTF-8",
    PYTHONIOENCODING: "utf-8",
    PYTHONNOUSERSITE: "1",
    PIP_DISABLE_PIP_VERSION_CHECK: "1",
    UV_NO_PROGRESS: "1",
  };
}

export async function runProcess(
  executable: string,
  args: string[],
  cwd: string,
  timeoutMs = 120_000,
  maxOutputBytes = 1024 * 1024,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd, env: scrubbedEnvironment(cwd), shell: false, stdio: ["ignore", "pipe", "pipe"],
    });
    let bytes = 0;
    let stderr = "";
    let failure: Error | undefined;
    const stop = (message: string) => {
      failure ??= new Error(message);
      child.kill("SIGKILL");
    };
    const timer = setTimeout(() => stop("Converter process timed out"), timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxOutputBytes) stop("Converter process output exceeds limit");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxOutputBytes) stop("Converter process output exceeds limit");
      else stderr += chunk.toString("utf8");
    });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (failure) reject(failure);
      else if (code !== 0) {
        const errorType = /"type":\s*"([A-Za-z0-9_]+)"/.exec(stderr)?.[1];
        reject(new Error(errorType ? `Conversion failed (${errorType})` : `Converter process failed (exit ${code})`));
      } else resolve();
    });
  });
}

async function findExecutable(name: string): Promise<string | undefined> {
  const paths = (process.env.PATH ?? "").split(delimiter);
  paths.push("/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", join(homedir(), ".local/bin"));
  for (const directory of paths) {
    if (!directory) continue;
    const candidate = join(directory, name);
    try { await access(candidate, constants.X_OK); return candidate; } catch { /* An executable can disappear while resolving PATH. */ }
  }
  return undefined;
}

export function createConverter(options: {
  userData: string;
  resources: string;
  onProgress?: Progress;
}): { convert: ConverterRunner; ensureReady: () => Promise<string> } {
  const venv = join(options.userData, "converter-venv");
  const python = join(venv, process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  let bootstrap: Promise<string> | undefined;
  async function install(): Promise<string> {
    await mkdir(options.userData, { recursive: true, mode: 0o700 });
    const requirements = join(options.resources, "requirements.txt");
    const fingerprint = createHash("sha256").update(await readFile(requirements)).digest("hex");
    const marker = join(venv, ".requirements-sha256");
    const cwd = await mkdtemp(join(tmpdir(), "vstudy-bootstrap-"));
    try {
      try {
        if ((await readFile(marker, "utf8")) === fingerprint) {
          await runProcess(python, ["-c", "import markitdown"], cwd);
          return python;
        }
      } catch { /* An interrupted installation is rebuilt on the next attempt. */ }
      options.onProgress?.("Preparing Python converter");
      const uv = await findExecutable("uv");
      let systemPython: string | undefined;
      for (const name of ["python3.12", "python3.11", "python3.10", "python3"]) {
        const candidate = await findExecutable(name);
        if (!candidate) continue;
        try {
          await runProcess(candidate, ["-c", "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)"], cwd, 10_000);
          systemPython = candidate;
          break;
        } catch { /* macOS may provide a Python older than MarkItDown supports. */ }
      }
      if (!uv && !systemPython) throw new Error("Install uv or Python 3.10+ to enable document conversion; then retry");
      await rm(venv, { recursive: true, force: true });
      if (uv) {
        await runProcess(uv, ["venv", "--python", systemPython ?? "3.12", venv], cwd, 300_000);
        options.onProgress?.("Installing MarkItDown (first run may take several minutes)");
        await runProcess(uv, ["pip", "install", "--python", python, "-r", requirements], cwd, 600_000, 8 * 1024 * 1024);
      } else if (systemPython) {
        await runProcess(systemPython, ["-m", "venv", venv], cwd, 300_000);
        options.onProgress?.("Installing MarkItDown (first run may take several minutes)");
        await runProcess(python, ["-m", "pip", "install", "-r", requirements], cwd, 600_000, 8 * 1024 * 1024);
      }
      await runProcess(python, ["-c", "import markitdown"], cwd);
      await writeFile(marker, fingerprint);
      options.onProgress?.("Converter ready");
      return python;
    } finally { await rm(cwd, { recursive: true, force: true }); }
  }
  function ensureReady(): Promise<string> {
    bootstrap ??= install().catch((error: unknown) => { bootstrap = undefined; throw error; });
    return bootstrap;
  }
  return {
    ensureReady,
    async convert(source, output) {
      const executable = await ensureReady();
      const cwd = await mkdtemp(join(tmpdir(), "vstudy-convert-"));
      try {
        const temporaryOutput = join(cwd, "content.md");
        await runProcess(executable, [join(options.resources, "convert.py"), source, temporaryOutput], cwd);
        if ((await stat(temporaryOutput)).size > MAX_MARKDOWN_BYTES) throw new Error("Converted Markdown exceeds 8 MiB");
        const content = await readFile(temporaryOutput);
        if (content.length > MAX_MARKDOWN_BYTES) throw new Error("Converted Markdown exceeds 8 MiB");
        // The library may be on another volume, so publish via a sibling file.
        await writeFile(`${output}.tmp`, content, { mode: 0o600 });
        await rename(`${output}.tmp`, output);
      } finally { await rm(cwd, { recursive: true, force: true }); }
    },
  };
}
