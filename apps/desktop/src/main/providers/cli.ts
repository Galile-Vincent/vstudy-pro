import { ProviderError } from "./api";
import { discoverModels } from "./models";
import { spawn } from "node:child_process";
import { access, mkdtemp, rm, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, join, isAbsolute } from "node:path";
import { parseStream, type ParserKind } from "./parsers";
import type { Usage } from "../../shared/domain";
import type { ProviderAdapter } from "./index";
export function cliEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of [
    "HOME",
    "PATH",
    "USER",
    "LOGNAME",
    "TMPDIR",
    "LANG",
    "LC_ALL",
    "SYSTEMROOT",
  ])
    if (source[key]) env[key] = source[key];
  env.PATH = [
    ...new Set([
      ...(source.PATH ?? "").split(delimiter),
      join(homedir(), ".local/bin"),
      "/opt/homebrew/bin",
      "/usr/local/bin",
    ]),
  ]
    .filter(isAbsolute)
    .join(delimiter);
  return env;
}
export async function findCli(binary: string): Promise<string | null> {
  for (const directory of (cliEnvironment().PATH ?? "").split(delimiter)) {
    const file = join(directory, binary);
    try {
      await access(file, constants.X_OK);
      if ((await stat(file)).isFile()) return file;
    } catch {
      continue;
    }
  }
  return null;
}
export function cliArgs(kind: "claude" | "codex", modelId: string, options: Record<string, string | boolean> = {}): string[] {
  const extra = kind === "codex"
    ? Object.entries(options).map(([id, value]) => ['-c', `${id === 'reasoningEffort' ? 'model_reasoning_effort' : 'service_tier'}=${JSON.stringify(value)}`]).flat()
    : [ ...(options.effort && options.effort !== 'ultrathink' ? ['--effort', options.effort === 'ultracode' ? 'xhigh' : String(options.effort)] : []), ...(options.fastMode !== undefined || options.thinking !== undefined || options.effort === 'ultracode' ? ['--settings', JSON.stringify({ ...(options.effort === 'ultracode' ? { ultracode: true } : {}), ...(options.fastMode !== undefined ? { fastMode: String(options.fastMode) === 'true' } : {}), ...(options.thinking !== undefined ? { alwaysThinkingEnabled: options.thinking === 'enabled' } : {}) })] : []) ];
  const model = modelId === "default" ? [] : ["--model", modelId];
  return kind === "claude"
    ? [
        "-p",
        "--safe-mode",
        "--output-format",
        "stream-json",
        "--include-partial-messages",
        "--verbose",
        "--tools",
        "",
        "--strict-mcp-config",
        "--mcp-config",
        '{"mcpServers":{}}',
        "--setting-sources",
        "",
        "--no-session-persistence",
        ...model,
        ...extra,
      ]
    : [
        "exec",
        "--json",
        "--sandbox",
        "read-only",
        "--ephemeral",
        "--skip-git-repo-check",
        "--ignore-user-config",
        "--ignore-rules",
        ...model,
        ...extra,
        "-",
      ];
}
export async function* runCli(
  binary: string,
  args: string[],
  prompt: string,
  cwd: string,
  kind: ParserKind,
  signal: AbortSignal,
  timeoutMs = 120_000,
  snapshot: (usage: Usage, models?: { modelId: string; usage: Usage }[]) => void = () => {},
) {
  signal.throwIfAborted();
  const child = spawn(binary, args, {
    cwd,
    env: cliEnvironment(),
    shell: false,
    detached: process.platform !== "win32",
    stdio: ["pipe", "pipe", "pipe"],
  });
  let spawnFailed = false;
  const closed = new Promise<number | null>((resolve) => {
    child.once("error", () => {
      spawnFailed = true;
      resolve(null);
    });
    child.once("close", resolve);
  });
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  const terminate = (signal: NodeJS.Signals) => {
    try {
      if (process.platform !== "win32" && child.pid)
        process.kill(-child.pid, signal);
      else child.kill(signal);
    } catch {
      /* The process may already have exited. */
    }
  };
  const kill = () => {
    child.stdout.unpipe();
    child.stdout.destroy();
    terminate("SIGTERM");
    killTimer ??= setTimeout(() => terminate("SIGKILL"), 1_000);
    killTimer.unref();
  };
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    kill();
  }, timeoutMs);
  signal.addEventListener("abort", kill, { once: true });
  let diagnostic = '';
  child.stderr.on('data', chunk => { diagnostic = (diagnostic + String(chunk)).slice(-8192); });
  child.stdin.on("error", () => {});
  child.stdin.end(prompt);
  child.stdout.setEncoding("utf8");
  let stdoutDiagnostic = '';
  let resolvedModel: string | undefined;
  async function* checkedOutput() {
    let buffer = '';
    for await (const chunk of child.stdout) {
      buffer += String(chunk);
      if (buffer.length > 2_000_000) throw new Error('CLI event too large');
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        stdoutDiagnostic = line.slice(-8192);
        let record: Record<string, unknown> | undefined;
        try { record = JSON.parse(line) as Record<string, unknown>; } catch { /* Some CLIs print plain diagnostics. */ }
        if (record?.type === 'system' && record.subtype === 'init' && typeof record.model === 'string') resolvedModel = record.model;
        if (record?.is_error || record?.error || record?.type === 'error' || record?.type === 'turn.failed' || /not logged in|please run \/login/i.test(line)) throw new Error('CLI request failed');
        yield line + '\n';
      }
    }
    if (buffer) { stdoutDiagnostic = buffer.slice(-8192); yield buffer; }
  }
  try {
    let terminal = false;
    for await (const event of parseStream(checkedOutput(), kind, false, (usage, models) => snapshot(usage, models ?? (resolvedModel ? [{ modelId: resolvedModel, usage }] : undefined)))) {
      signal.throwIfAborted();
      if (event.type === "error") throw new Error("CLI request failed");
      if (event.type === "done") {
        terminal = true;
        break;
      }
      yield event;
    }
    const exit = await closed;
    signal.throwIfAborted();
    if (timedOut || spawnFailed || exit !== 0 || !terminal)
      throw new Error("CLI request failed");
    yield { type: "done" } as const;
  } catch {
    signal.throwIfAborted();
    diagnostic += '\n' + stdoutDiagnostic;
    if (/auth|login|logged.?in|unauthorized|401|403/i.test(diagnostic)) throw new ProviderError('auth failed', kind === 'claude' ? 'Authentication failed. Run `claude` and /login.' : 'Authentication failed. Run `codex login`.');
    throw new ProviderError(/auth|login|unauthorized|401|403/i.test(diagnostic) ? 'auth failed' : /rate.limit|429/i.test(diagnostic) ? 'rate limited' : /budget|quota|credit/i.test(diagnostic) ? 'budget' : /network|ECONN|ENOTFOUND|fetch failed/i.test(diagnostic) ? 'network' : 'provider unavailable');
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", kill);
    if (child.exitCode === null && child.signalCode === null) kill();
    await closed;
    if (killTimer) clearTimeout(killTimer);
  }
}
export function createCliAdapter(
  binary: "claude" | "codex" | "agy",
): ProviderAdapter {
  return {
    async detect() {
      if (!(await findCli(binary)))
        return { available: false, reason: `${binary} CLI not found` };
      if (binary === "agy")
        return {
          available: false,
          reason: "agy CLI detected; streaming protocol is not supported",
        };
      return { available: true };
    },
    async listModels() {
      return binary === 'agy' ? [] : discoverModels(binary);
    },
    async *stream(request, signal) {
      const file = await findCli(binary);
      if (!file || binary === "agy") throw new Error("CLI unavailable");
      const cwd = await mkdtemp(
        join(tmpdir(), `vstudy-${request.conversationId}-`),
      );
      try {
        yield* runCli(
          file,
          cliArgs(binary, request.modelId, request.options),
          request.options?.effort === 'ultrathink' ? `ultrathink\n\n${request.prompt}` : request.prompt,
          cwd,
          binary,
          signal,
          120_000, request.onUsageSnapshot,
        );
      } finally {
        await rm(cwd, { recursive: true, force: true });
      }
    },
  };
}
