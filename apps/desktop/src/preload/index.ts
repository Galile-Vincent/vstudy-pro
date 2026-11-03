import { contextBridge, ipcRenderer, webUtils } from "electron";
import {
  documentProgressChannel, documentProgressSchema,
  chatEnvelopeSchema,
  chatEventChannel,
  ipcContract,
  requestIdSchema,
  type DesktopApi,
  type IpcChannel,
  type IpcRequest,
  type IpcResponse,
} from "../shared";

const api: DesktopApi = {
  onDocumentProgress(listener) {
    const receive = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      const parsed = documentProgressSchema.safeParse(payload);
      if (parsed.success) listener(parsed.data);
    };
    ipcRenderer.on(documentProgressChannel, receive);
    return () => ipcRenderer.removeListener(documentProgressChannel, receive);
  },
  getPathForFile: (file) => webUtils.getPathForFile(file),
  async invoke<C extends IpcChannel>(
    channel: C,
    request: IpcRequest<C>,
  ): Promise<IpcResponse<C>> {
    if (!Object.hasOwn(ipcContract, channel))
      throw new Error("Unknown IPC channel");
    const payload = ipcContract[channel].request.parse(request);
    return ipcContract[channel].response.parse(
      await ipcRenderer.invoke(channel, payload),
    ) as IpcResponse<C>;
  },
  onChatEvent(requestId, listener) {
    const id = requestIdSchema.parse(requestId);
    const receive = (
      _event: Electron.IpcRendererEvent,
      payload: unknown,
    ): void => {
      const parsed = chatEnvelopeSchema.safeParse(payload);
      if (parsed.success && parsed.data.requestId === id)
        listener(parsed.data.event);
    };
    ipcRenderer.on(chatEventChannel, receive);
    return () => ipcRenderer.removeListener(chatEventChannel, receive);
  },
};
contextBridge.exposeInMainWorld("desktop", api);
