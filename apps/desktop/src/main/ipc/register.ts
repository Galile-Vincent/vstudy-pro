import { importError } from '../../shared/import-error';
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import {
  ipcContract,
  type IpcChannel,
  type IpcRequest,
  type IpcResponse,
} from "../../shared/ipc";

export function channelPolicy(channel: string) {
  const expensive = /import|reconvert|retry|chat:start|aiParse:(?:start|estimate|use|discard)|export/i.test(channel);
  return { bytes: channel === 'chat:start' || channel === 'usage:estimate' ? 8 * 1024 * 1024 : 512 * 1024,
    requests: expensive ? 12 : channel === 'activity:heartbeat' ? 120 : 600, windowMs: 60_000 };
}
export function createIpcRegistrar(
  ipc: Pick<IpcMain, "handle" | "removeHandler">,
  isTrusted: (event: IpcMainInvokeEvent) => boolean,
) {
  const registered: IpcChannel[] = [];
  const budgets = new Map<string, { start: number; count: number }>();
  return {
    handle<C extends IpcChannel>(
      channel: C,
      handler: (
        request: IpcRequest<C>,
        event: IpcMainInvokeEvent,
      ) => IpcResponse<C> | Promise<IpcResponse<C>>,
    ): void {
      ipc.handle(channel, async (event, payload: unknown) => {
        if (!isTrusted(event) || (event.sender?.mainFrame && event.senderFrame !== event.sender.mainFrame)) throw new Error("Untrusted IPC sender");
        const policy = channelPolicy(channel);
        if (Buffer.byteLength(JSON.stringify(payload) ?? '') > policy.bytes) throw new Error('IPC payload too large');
        const now = Date.now(), key = `${event.sender?.id ?? 0}:${channel}`;
        const budget = budgets.get(key);
        if (!budget || now - budget.start >= policy.windowMs) budgets.set(key, { start: now, count: 1 });
        else if (++budget.count > policy.requests) throw new Error('IPC rate limited');
        try {
          const request = ipcContract[channel].request.parse(payload) as IpcRequest<C>;
          const response = await handler(request, event);
          return ipcContract[channel].response.parse(response);
        } catch (error) {
          console.error(`[ipc] ${channel} failed:`, error instanceof Error ? error.stack ?? error.message : String(error));
          if (/^documents:import/.test(channel)) throw new Error('VSTUDY_STATUS:' + JSON.stringify(importError(error)));
          if (error instanceof Error && /Search took too long|Refine your query/.test(error.message)) throw new Error('VSTUDY_STATUS:' + JSON.stringify({code:error.message.startsWith('Search took too long') ? 'errors.search_too_long' : 'errors.search_refine',params:{}}));
          if (error instanceof Error && error.message.startsWith('ai_parse.')) throw new Error('VSTUDY_STATUS:' + JSON.stringify({code:'errors.'+error.message,params:{}}));
          if (error instanceof Error && error.message === 'errors.keychain_unavailable') throw new Error('VSTUDY_STATUS:' + JSON.stringify({code:error.message,params:{}}));
          if (channel === 'converter:mode') throw new Error('VSTUDY_STATUS:' + JSON.stringify({code:error instanceof Error && /offline/.test(error.message) ? 'errors.converter_offline' : error instanceof Error && /Install uv|Python 3.10/.test(error.message) ? 'errors.converter_python' : 'errors.converter_failed',params:{}}));
          const code=error instanceof Error && error.message.includes('Only empty conversations') ? 'errors.conversation_not_empty' : 'errors.generic';
          // Electron strips custom Error fields, so keep the stable payload in its message.
          throw new Error('VSTUDY_STATUS:' + JSON.stringify({code,params:{}}));
        }
      });
      registered.push(channel);
    },
    dispose(): void {
      for (const channel of registered) ipc.removeHandler(channel);
      budgets.clear();
    },
  };
}
