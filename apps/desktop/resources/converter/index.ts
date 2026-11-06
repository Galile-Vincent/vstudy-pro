import { atomicWrite } from "../../src/main/storage/atomic";
import { recordEgress } from '../../src/main/services/egress';
import { resolveInstalledExecutable, installDirectories } from '../../src/main/providers/trusted-executable';
import { ProcessScope } from "./process-scope";
import { profileStage } from "./profile";
import { WarmWorker } from "./warm-worker";
import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { managedConverterPython } from '../../src/main/platform/process';

import { scrubbedEnvironment, type Progress, type ConverterRunner, MAX_MARKDOWN_BYTES } from './contracts';
export { scrubbedEnvironment, type Progress, type ConverterRunner, MAX_MARKDOWN_BYTES } from './contracts';

export async function runProcess(
  executable: string,
  args: string[],
  cwd: string,
  timeoutMs = 120_000,
  maxOutputBytes = 1024 * 1024,
  onProgress?: Progress,
  cacheDirectory?: string,
  scope?: ProcessScope,
  diagnostic?: Progress,
  managedPythonDirectory?: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = (scope ? scope.spawn.bind(scope) : spawn)(executable, args, {
      cwd, env: { ...scrubbedEnvironment(cwd), ...(cacheDirectory ? { PIP_CACHE_DIR: cacheDirectory, UV_CACHE_DIR: cacheDirectory } : {}),
        ...(managedPythonDirectory ? { UV_PYTHON_INSTALL_DIR: managedPythonDirectory, UV_PYTHON_INSTALL_BIN: '0', UV_PYTHON_INSTALL_REGISTRY: '0' } : {}),
      }, shell: false, stdio: ["ignore", "pipe", "pipe"],
    });
    let bytes = 0;
    let stderr = "";
    let fallbackReported = false;
    const downloads = new Set<string>();
    let failure: Error | undefined;
    const stop = (message: string) => {
      failure ??= new Error(message);
      if (scope) scope.terminate(child, "SIGKILL"); else child.kill("SIGKILL");
    };
    const timer = setTimeout(() => stop("Converter process timed out"), timeoutMs);
    child.stdout!.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxOutputBytes) stop("Converter process output exceeds limit");
    });
    child.stderr!.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxOutputBytes) stop("Converter process output exceeds limit");
      stderr = (stderr + chunk.toString("utf8")).slice(-4000);
      if (cacheDirectory) {
        for (const match of stderr.matchAll(/Downloading ([^\n\r]{1,160})/g)) {
          if (!downloads.has(match[1]!)) { downloads.add(match[1]!); onProgress?.("Downloading converter dependencies…"); }
        }
      }
      if (!fallbackReported && stderr.includes("PDF_FALLBACK")) {
        fallbackReported = true;
        onProgress?.("PDF too complex or large for the built-in parser; trying fallback…");
      }
    });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (failure) reject(failure);
      else if (code !== 0) {
        diagnostic?.(stderr);
        const errorCode = [...stderr.matchAll(/"code":\s*"([A-Z_]+)"/g)].at(-1)?.[1];
        if (errorCode === "PDF_RESOURCE_LIMIT" || errorCode === "PDF_TIME_LIMIT") {
          reject(new Error("This PDF is too large or complex to convert"));
          return;
        }
        if (errorCode === "NO_TEXT_LAYER") { reject(new Error("NO_TEXT_LAYER: OCR not supported")); return; }
        reject(new Error(`Converter process failed (exit ${code})`));
      } else resolve();
    });
  });
}

async function findExecutable(name: string): Promise<string | undefined> {
  return (await resolveInstalledExecutable(name, [...installDirectories(), ...(process.platform === 'win32' ? [] : ['/usr/bin', '/bin'])])) ?? undefined;
}

export function createConverter(options: {
  userData: string;
  resources: string;
  onProgress?: Progress;
  idleMinutes?: () => number;
  authorizeDownload?: () => Promise<boolean>;
  diagnostic?: Progress;
}): { convert: ConverterRunner; ensureReady: () => Promise<string>; dispose: () => Promise<void> } {
  const scope = new ProcessScope();
  let disposed = false;
  const checkOpen = () => { if (disposed) throw new Error('Converter closed'); };
  const run: typeof runProcess = (executable, args, cwd, timeout, max, progress, cache) => runProcess(executable, args, cwd, timeout, max, progress, cache, scope, options.diagnostic, join(options.userData, 'converter-python'));
  const venv = join(options.userData, "converter-venv");
  const python = join(venv, process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  let worker: WarmWorker | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  function scheduleIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { worker?.stop(); worker = undefined; bootstrap = undefined; }, (options.idleMinutes?.() ?? 5) * 60_000);
    idleTimer.unref();
  }
  let bootstrap: Promise<string> | undefined;
  let progress: Progress | undefined;
  const report = (message: string) => { options.onProgress?.(message); progress?.(message); };
  async function install(): Promise<string> {
    const checked = profileStage("Venv/bootstrap check");
    await mkdir(options.userData, { recursive: true, mode: 0o700 });
    const nativeRequirements = join(options.resources, 'requirements.native.lock.txt');
    const requirements = process.platform === 'darwin' && process.arch === 'x64' && await stat(nativeRequirements).then(file => file.isFile(), () => false)
      ? nativeRequirements : join(options.resources, "requirements.lock.txt");
    const wheels = requirements === nativeRequirements ? ['--find-links', join(options.resources, 'wheels')] : [];
    options.diagnostic?.(JSON.stringify({ converterInstall: { platform: process.platform, arch: process.arch,
      requirements, wheels: wheels.length ? await readdir(join(options.resources, 'wheels')) : [] } }));
    const fingerprint = createHash("sha256").update(await readFile(requirements)).digest("hex");
    const marker = join(venv, ".requirements-sha256");
    const cwd = await mkdtemp(join(tmpdir(), "vstudy-bootstrap-"));
    try {
      try {
        if ((await readFile(marker, "utf8")) === fingerprint) {
          await access(python, constants.X_OK);
          checked();
          return python;
        }
      } catch { /* An interrupted installation is rebuilt on the next attempt. */ }
      if (!await options.authorizeDownload?.()) throw new Error('Converter offline: allow the dependency download and retry');
      recordEgress('converter_install', 'pypi.org, files.pythonhosted.org; github.com for Python if needed');
      report("Setting up converter (one time; download size depends on platform)…");
      const uv = await findExecutable("uv");
      // Cache wheels across private bootstrap directories without inheriting user configuration.
      const cache = join(homedir(), ".cache", uv ? "uv" : "pip");
      await mkdir(cache, { recursive: true, mode: 0o700 });
      let systemPython: string | undefined;
      for (const name of process.platform === 'win32' ? ['python', 'python3'] : ["python3.12", "python3.11", "python3.10", "python3"]) {
        const candidate = await findExecutable(name);
        if (!candidate) continue;
        try {
          await run(candidate, ["-c", "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)"], cwd, 10_000);
          systemPython = candidate;
          break;
        } catch { /* macOS may provide a Python older than MarkItDown supports. */ }
      }
      if (!uv && !systemPython) throw new Error("Install uv or Python 3.10+ to enable document conversion; then retry");
      await rm(venv, { recursive: true, force: true });
      if (uv) {
        await run(uv, ["venv", "--python", managedConverterPython(), venv], cwd, 300_000);
        report("Installing markitdown…");
        await run(uv, ["pip", "install", "--require-hashes", "--only-binary", ":all:", ...wheels, "--python", python, "-r", requirements], cwd, 600_000, 8 * 1024 * 1024, report, cache);
      } else if (systemPython) {
        await run(systemPython, ["-m", "venv", venv], cwd, 300_000);
        report("Installing markitdown…");
        await run(python, ["-m", "pip", "install", "--require-hashes", "--only-binary", ":all:", ...wheels, "-r", requirements], cwd, 600_000, 8 * 1024 * 1024, report, cache);
      }
      await run(python, ["-c", "import markitdown, pdfplumber"], cwd);
      checkOpen();
      await atomicWrite(marker, fingerprint);
      report("Converter ready");
      return python;
    } finally { await rm(cwd, { recursive: true, force: true }); }
  }
  function ensureReady(): Promise<string> {
    if (disposed) return Promise.reject(new Error("Converter closed"));
    bootstrap ??= install().then(async executable => {
      checkOpen();
      const warmed = profileStage("Python spawn + warm imports");
      worker = new WarmWorker(executable, join(options.resources, "convert.py"), options.userData, scope, options.idleMinutes);
      await worker.start();
      warmed();
      scheduleIdle();
      return executable;
    }).catch((error: unknown) => { bootstrap = undefined; throw error; });
    return bootstrap;
  }
  return {
    ensureReady,
    async dispose() {
      disposed = true;
      clearTimeout(idleTimer);
      const stopping = scope.dispose();
      await stopping;
      worker?.stop();
      await bootstrap?.catch(() => undefined);
    },
    async convert(source, output, onProgress) {
      progress = onProgress;
      await ensureReady();
      clearTimeout(idleTimer);
      report("Converting…");
      const cwd = await mkdtemp(join(tmpdir(), "vstudy-convert-"));
      try {
        const temporaryOutput = join(cwd, "content.md");
        await rm(`${output}.partial`, { force: true });
        let publishPreview = Promise.resolve();
        worker ??= new WarmWorker(python, join(options.resources, "convert.py"), options.userData, scope, options.idleMinutes);
        const extracted = profileStage("Worker conversion + preview delivery");
        await worker.run(source, temporaryOutput, output, message => {
          publishPreview = publishPreview.then(async () => {
            if (/^Converting page [1-5]\//.test(message)) {
              const path = `${temporaryOutput}.partial`;
              if ((await stat(path)).size > MAX_MARKDOWN_BYTES) throw new Error("Markdown exceeds 8 MiB");
              const content = await readFile(path);
              if (content.length > MAX_MARKDOWN_BYTES) throw new Error("Markdown exceeds 8 MiB");
              await atomicWrite(`${output}.partial`, content);
            }
            report(message);
          });
          void publishPreview.catch(() => undefined);
        });
        await publishPreview;
        extracted();
        if ((await stat(temporaryOutput)).size > MAX_MARKDOWN_BYTES) throw new Error("Converted Markdown exceeds 8 MiB");
        const content = await readFile(temporaryOutput);
        if (content.length > MAX_MARKDOWN_BYTES) throw new Error("Converted Markdown exceeds 8 MiB");
        // The library may be on another volume, so publish via a sibling file.
        await atomicWrite(output, content);
        const metadata: unknown = JSON.parse(await readFile(`${temporaryOutput}.json`, "utf8"));
        if (typeof metadata !== "object" || metadata === null || !("converter" in metadata) || (metadata.converter !== "pdf_md" && metadata.converter !== "markitdown")) throw new Error("Invalid converter metadata");
        return metadata.converter;
      } finally { scheduleIdle(); progress = undefined; await rm(`${output}.partial`, { force: true }); await rm(cwd, { recursive: true, force: true }); }
    },
  };
}
