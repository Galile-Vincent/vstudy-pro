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

if (process.isMainFrame) {
  const removeFrames = () => document.querySelectorAll('iframe,frame,object,embed').forEach(frame => {
    frame.setAttribute('sandbox', '');
    frame.remove();
  });
  new MutationObserver(removeFrames).observe(document, {childList:true,subtree:true,attributes:true,attributeFilter:['sandbox','src','srcdoc']});
}
ipcRenderer.on('vstudy:open-settings', () => window.dispatchEvent(new Event('vstudy:open-settings')));
const dropTokens = new Map<string, string>();
if (process.isMainFrame) window.addEventListener('drop', event => {
  if (!event.isTrusted || !event.dataTransfer) return;
  const files = [...event.dataTransfer.files].slice(0, 100);
  const paths = files.map(file => webUtils.getPathForFile(file));
  const tokens: string[] = ipcRenderer.sendSync('vstudy:preload-drop', paths);
  dropTokens.clear();
  paths.forEach((path, index) => { if (tokens[index]) dropTokens.set(path, tokens[index]!); });
}, true);
const api: DesktopApi = {
  onDocumentProgress(listener) {
    const receive = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      const parsed = documentProgressSchema.safeParse(payload);
      if (parsed.success) listener(parsed.data);
    };
    ipcRenderer.on(documentProgressChannel, receive);
    return () => ipcRenderer.removeListener(documentProgressChannel, receive);
  },
  getPathForFile: (file) => dropTokens.get(webUtils.getPathForFile(file)) ?? "",
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
if (process.isMainFrame) contextBridge.exposeInMainWorld("desktop", api);
