import { spawn } from "node:child_process";
import { access, mkdtemp, rm, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, join, isAbsolute } from "node:path";
import { parseStream, type ParserKind } from "./parsers";
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
export function cliArgs(kind: "claude" | "codex", modelId: string): string[] {
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
  child.stderr.resume();
  child.stdin.on("error", () => {});
  child.stdin.end(prompt);
  child.stdout.setEncoding("utf8");
  try {
    let terminal = false;
    for await (const event of parseStream(child.stdout, kind)) {
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
    throw new Error("CLI request failed");
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
      const ids =
        binary === "claude"
          ? ["default", "opus", "sonnet", "haiku"]
          : binary === "codex"
            ? ["default", "gpt-6.1-sol", "gpt-6-sol"]
            : [];
      return ids.map((id) => ({
        id,
        name: id === "default" ? "CLI default" : id,
      }));
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
          cliArgs(binary, request.modelId),
          request.prompt,
          cwd,
          binary,
          signal,
        );
      } finally {
        await rm(cwd, { recursive: true, force: true });
      }
    },
  };
}
