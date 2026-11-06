/** Windows pipe bytes enter the shared protocol only after the helper verifies a current-user ACL and peer SID. */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { join, resolve, win32 } from 'node:path';
import { app } from 'electron';
import { MCP_MAX_FRAME, type BridgeRequest, type BridgeResponse } from '../../shared/mcp';
import type { McpTransportOptions, McpTransport } from '../../shared/mcp-platform';
import { RequestFrames, responseFrame } from './protocol';
import { currentWindowsSid, resolveMcpEndpoint } from './endpoint';
import { McpFailure, publicFailure } from './errors';
import { systemExecutable } from '../platform/process';
import { cliEnvironment } from '../providers/cli-transport';

interface Connection {
  frames: RequestFrames;
  pending: Set<string>;
  timers: Set<NodeJS.Timeout>;
  idle: NodeJS.Timeout;
}
interface WindowsBridgeOptions extends McpTransportOptions { script?: string; diagnostic?: (output: string) => void }

/** A packaged, argv-only PowerShell host owns the native ACL. Node never opens a permissive pipe. */
export async function createWindowsBridge(options: WindowsBridgeOptions): Promise<McpTransport> {
  if (process.platform !== 'win32') throw new McpFailure('UNSUPPORTED');
  const sid = currentWindowsSid();
  const endpoint = resolveMcpEndpoint(options.userData, 'win32', sid);
  const script = options.script ?? (app.isPackaged ? join(process.resourcesPath, 'mcp', 'windows-pipe.ps1') : resolve(__dirname, '../../resources/mcp/windows-pipe.ps1'));
  const powershell = systemExecutable('WindowsPowerShell/v1.0/powershell.exe');
  const environment = cliEnvironment();
  const host = spawn(powershell, [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script,
    '-PipeName', endpoint.path.slice('\\\\.\\pipe\\'.length),
  ], {env: {...environment, WINDIR: environment.SystemRoot ?? environment.SYSTEMROOT ?? 'C:\\Windows',
    PSModulePath: win32.join(win32.dirname(powershell), 'Modules'), ...(options.diagnostic ? {VSTUDY_PIPE_FIXTURE_TRACE: '1'} : {})},
    windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe']});
  const closed = new Promise<void>(accept => { host.once('close', () => accept()); host.once('error', () => accept()); });
  const lines = createInterface({input: host.stdout});
  const connections = new Map<string, Connection>();
  let active = 0;
  let ready = false;
  let disposed = false;
  let disposing: Promise<void> | undefined;
  host.stderr.on('data', chunk => options.diagnostic?.(String(chunk).slice(-8192)));
  const disconnect = (id: string) => {
    const state = connections.get(id);
    if (!state) return;
    connections.delete(id);
    clearTimeout(state.idle);
    for (const timer of state.timers) clearTimeout(timer);
    options.onDisconnect(id);
  };
  const close = (id: string) => {
    disconnect(id);
    if (!host.stdin.destroyed) host.stdin.write(`${id}:-\n`);
  };
  const fail = () => {
    ready = false;
    for (const id of connections.keys()) disconnect(id);
    host.kill();
  };
  host.stdin.on('error', fail);
  host.stderr.on('error', fail);
  lines.on('error', fail);
  lines.on('close', () => {if (!disposed) fail();});
  const send = (id: string, response: BridgeResponse) => {
    if (!ready || !connections.has(id)) return;
    try {
      const frame = responseFrame(response);
      if (host.stdin.writableLength + Math.ceil(frame.length * 4 / 3) > 2 * MCP_MAX_FRAME) { close(id); return; }
      for (let offset = 0; offset < frame.length; offset += 65536) host.stdin.write(`${id}:${frame.subarray(offset, offset + 65536).toString('base64')}\n`);
    } catch { close(id); }
  };
  const accept = (id: string, request: BridgeRequest) => {
    const state = connections.get(id);
    if (!state) return;
    if (state.pending.has(request.id) || state.pending.size >= 4 || active >= 32) { close(id); throw new McpFailure('RATE_LIMITED'); }
    state.pending.add(request.id);
    active++;
    const timer = setTimeout(() => close(id), 125000);
    timer.unref();
    state.timers.add(timer);
    void Promise.resolve().then(() => options.handleRequest(request, id)).then(response => send(id, response), () => {
      const failure = publicFailure('INTERNAL').error;
      send(id, {jsonrpc: '2.0', id: request.id, error: {code: -32603, message: failure.message, data: {code: failure.code, hint: failure.hint}}});
    }).finally(() => {clearTimeout(timer); state.timers.delete(timer); state.pending.delete(request.id); active--;});
  };
  try {
    await new Promise<void>((acceptReady, reject) => {
      const timeout = setTimeout(() => { fail(); reject(new McpFailure('UNSUPPORTED')); }, process.arch === 'arm64' ? 90000 : 25000);
      const failed = () => { clearTimeout(timeout); reject(new McpFailure('UNSUPPORTED')); };
      host.once('error', failed);
      host.once('close', failed);
      lines.on('line', line => {
        if (line.length > 90000) { fail(); return; }
        const parts = line.split(':');
        if (!ready) {
          if (parts[0] !== 'ready' || parts[1] !== sid || parts.length !== 3) { fail(); return; }
          clearTimeout(timeout);
          ready = true;
          acceptReady();
          return;
        }
        const [kind, id, body] = parts;
        if (!id || !/^[a-f0-9]{32}$/.test(id)) { fail(); return; }
        if (kind === 'open' && parts.length === 2) {
          if (connections.has(id) || connections.size >= 32) { close(id); return; }
          const idle = setTimeout(() => close(id), 90000); idle.unref();
          connections.set(id, {frames: new RequestFrames(), pending: new Set(), timers: new Set(), idle});
        } else if (kind === 'close' && parts.length === 2) disconnect(id);
        else if (kind === 'data' && parts.length === 3 && body && /^[A-Za-z0-9+/]+={0,2}$/.test(body)) {
          const state = connections.get(id);
          if (!state) return;
          state.idle.refresh();
          const bytes = Buffer.from(body, 'base64');
          if (bytes.length > 65536 || bytes.toString('base64') !== body) { close(id); return; }
          try { state.frames.push(bytes, request => accept(id, request)); } catch { close(id); }
        } else fail();
      });
    });
  } catch (error) { fail(); await closed; lines.close(); throw error; }
  host.on('close', () => { if (!disposed) fail(); });
  return {
    endpoint,
    closed,
    dispose() {
      return disposing ??= (async () => {
        disposed = true;
        ready = false;
        for (const id of connections.keys()) disconnect(id);
        host.stdin.end();
        const deadline = setTimeout(() => host.kill(), 5000); deadline.unref();
        try { await closed; } finally { clearTimeout(deadline); lines.close(); }
      })();
    },
  };
}
