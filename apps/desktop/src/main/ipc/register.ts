import type { IpcMain, IpcMainInvokeEvent } from "electron";
import {
  ipcContract,
  type IpcChannel,
  type IpcRequest,
  type IpcResponse,
} from "../../shared/ipc";

export function createIpcRegistrar(
  ipc: Pick<IpcMain, "handle" | "removeHandler">,
  isTrusted: (event: IpcMainInvokeEvent) => boolean,
) {
  const registered: IpcChannel[] = [];
  return {
    handle<C extends IpcChannel>(
      channel: C,
      handler: (
        request: IpcRequest<C>,
        event: IpcMainInvokeEvent,
      ) => IpcResponse<C> | Promise<IpcResponse<C>>,
    ): void {
      ipc.handle(channel, async (event, payload: unknown) => {
        if (!isTrusted(event)) throw new Error("Untrusted IPC sender");
        const request = ipcContract[channel].request.parse(
          payload,
        ) as IpcRequest<C>;
        try {
          const response = await handler(request, event);
          return ipcContract[channel].response.parse(response);
        } catch (error) {
          const code=error instanceof Error && error.message.includes('Only empty conversations') ? 'errors.conversation_not_empty' : 'errors.generic';
          // Electron strips custom Error fields, so keep the stable payload in its message.
          throw new Error('VSTUDY_STATUS:' + JSON.stringify({code,params:{}}));
        }
      });
      registered.push(channel);
    },
    dispose(): void {
      for (const channel of registered) ipc.removeHandler(channel);
    },
  };
}
