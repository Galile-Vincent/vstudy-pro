import { libraryErrors } from '../../shared/library-errors';
/**
 * Register validated register IPC operations and delegate privileged work to main services.
 * Owned by main/ipc.
 * Request and response validation and sender ownership stay at the IPC boundary.
 * @packageDocumentation
 */
import { z } from 'zod';
import { MessageTextLimitError } from '../../shared/message-text';
import { log } from '../logging';
import { enterStorageRequest } from "../storage/maintenance";
import { MoodleAuthError } from '../moodle/auth';
import { importError } from '../../shared/import-error';
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import {
  ipcContract,
  type IpcChannel,
  type IpcRequest,
  type IpcResponse,
} from "../../shared/ipc";

export function channelPolicy(channel: string) {
  const expensive = /import|reconvert|retry|chat:start|aiParse:(?:start|estimate|use|discard)|review:(?:artifact:generate|attempt:(?:finish|commit|confirm|explain))|export/i.test(channel);
  return { bytes: channel === 'chat:start' || channel === 'usage:estimate' || channel === 'documents:copyContext' ? 8 * 1024 * 1024 : 512 * 1024,
    requests: expensive ? 12 : channel === 'activity:heartbeat' ? 120 : 600, windowMs: 60_000 };
}
/** Validate sender, request, and response at one boundary before exposing a service operation. */
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
        let release = () => {};
        try {
          release = (channel.startsWith('storage:') || ['updates:install', 'updates:cancel', 'updates:download'].includes(channel)) ? () => {} : enterStorageRequest();
          const request = ipcContract[channel].request.parse(payload) as IpcRequest<C>;
          const response = await handler(request, event);
          if (channel.startsWith('review:') && Buffer.byteLength(JSON.stringify(response) ?? '') > 512 * 1024) throw new Error('review.response_limit');
          return ipcContract[channel].response.parse(response);
        } catch (error) {
          if (error instanceof MessageTextLimitError || channel === 'chat:start' && error instanceof z.ZodError && error.issues.some(issue=>issue.code==='too_big' && issue.path[0]==='userMessage')) {
            throw new Error('VSTUDY_STATUS:'+JSON.stringify({code:'errors.message_too_large',params:{}}));
          }
          if (channel.startsWith('storage:') || error instanceof Error && error.message.startsWith('storage.')) {
            const errno=(error as NodeJS.ErrnoException).code;
            const code=errno==='ENOSPC' ? 'disk_full' : errno==='EACCES' || errno==='EPERM' ? 'permission' : errno==='EBUSY' ? 'busy' : error instanceof Error && error.message.startsWith('storage.') ? error.message.slice(8) : 'failed';
            throw new Error('VSTUDY_STATUS:'+JSON.stringify({code:'storage.'+code,params:{}}));
          }
          if (!channel.startsWith('moodle:')) {
            const errno=(error as NodeJS.ErrnoException | null)?.code;
            log({phase:'ipc-failed', channel, code:typeof errno === 'string' && /^[A-Z_]{1,40}$/.test(errno) ? errno : 'FAILED'});
          }
          if (channel === 'moodle:connect' && error instanceof MoodleAuthError && error.code === 'cancelled') return {moodleAuthCancelled:true};
          if (error instanceof MoodleAuthError) throw new Error('VSTUDY_STATUS:' + JSON.stringify({code:'moodle.auth_' + error.code.replaceAll('-','_'),params:error.reason ? {reason:error.reason} : {}}));
          if (channel.startsWith('moodle:')) throw new Error('VSTUDY_STATUS:' + JSON.stringify({code:'errors.generic',params:{}}));
          if (/^documents:import/.test(channel)) throw new Error('VSTUDY_STATUS:' + JSON.stringify(importError(error)));
          if (error instanceof Error && /Search took too long|Refine your query/.test(error.message)) throw new Error('VSTUDY_STATUS:' + JSON.stringify({code:error.message.startsWith('Search took too long') ? 'errors.search_too_long' : 'errors.search_refine',params:{}}));
          if (error instanceof Error && error.message.startsWith('ai_parse.')) throw new Error('VSTUDY_STATUS:' + JSON.stringify({code:'errors.'+error.message,params:{}}));
          if (error instanceof Error && error.message === 'errors.keychain_unavailable') throw new Error('VSTUDY_STATUS:' + JSON.stringify({code:error.message,params:{}}));
          if (channel.startsWith('library:') && error instanceof Error) {
            const reason = Object.entries(libraryErrors).find(([, message]) => message === error.message);
            if (reason) throw new Error('VSTUDY_STATUS:' + JSON.stringify({code:'library.' + reason[0],params:{}}));
          }
          if (channel === 'converter:mode') throw new Error('VSTUDY_STATUS:' + JSON.stringify({code:error instanceof Error && /offline/.test(error.message) ? 'errors.converter_offline' : error instanceof Error && /Install uv|Python 3.10/.test(error.message) ? 'errors.converter_python' : 'errors.converter_failed',params:{}}));
          if (channel.startsWith('review:') && error instanceof Error && /^review\.[a-z_]+$/.test(error.message)) throw new Error('VSTUDY_STATUS:' + JSON.stringify({code:error.message,params:{}}));
          const code=error instanceof Error && error.message.includes('Only empty conversations') ? 'errors.conversation_not_empty' : 'errors.generic';
          // Electron strips custom Error fields, so keep the stable payload in its message.
          throw new Error('VSTUDY_STATUS:' + JSON.stringify({code,params:{}}));
        } finally { release(); }
      });
      registered.push(channel);
    },
    dispose(): void {
      for (const channel of registered) ipc.removeHandler(channel);
      budgets.clear();
    },
  };
}
