import {webChatClearedChannel,webChatProviderSchema} from '../shared/web-chat';
import { draftFlushAckChannel, draftFlushIdSchema, draftFlushRequestChannel, reviewProgressChannel, reviewProgressSchema } from '../shared/review-generate';
import { contextBridge, ipcRenderer, webUtils } from "electron";
import {
  nativeTabShortcutChannel,nativeTabShortcutSchema,
  trackpadScrollBeginChannel, trackpadScrollEndChannel, trackpadEventArgumentsSchema,
  moodleProgressChannel, moodleProgressSchema,
  documentProgressChannel, documentProgressSchema,
  chatEnvelopeSchema,
  chatEventChannel, historyChangedChannel, historyChangedArgumentsSchema,
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
ipcRenderer.on(historyChangedChannel, (_event, ...args: unknown[]) => {
  if (historyChangedArgumentsSchema.safeParse(args).success) window.dispatchEvent(new Event(historyChangedChannel));
});
ipcRenderer.on('vstudy:providers-changed', () => window.dispatchEvent(new Event('vstudy:providers-changed')));
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
function subscribeTrackpad(channel: typeof trackpadScrollBeginChannel | typeof trackpadScrollEndChannel, listener: () => void): () => void {
  const receive = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => {
    if (trackpadEventArgumentsSchema.safeParse(args).success) listener();
  };
  ipcRenderer.on(channel, receive);
  return () => { ipcRenderer.removeListener(channel, receive); };
}
const api: DesktopApi = {
  onReviewProgress(listener) {
    const receive = (_event:Electron.IpcRendererEvent,payload:unknown) => {const parsed=reviewProgressSchema.safeParse(payload);if(parsed.success)listener(parsed.data);};
    ipcRenderer.on(reviewProgressChannel,receive);
    return () => ipcRenderer.removeListener(reviewProgressChannel,receive);
  },
  onDraftFlushRequest(listener) {
    const receive = (_event:Electron.IpcRendererEvent,payload:unknown) => {
      const id = draftFlushIdSchema.safeParse(payload);
      if (!id.success) return;
      void Promise.resolve().then(listener).catch(() => {}).finally(() => ipcRenderer.send(draftFlushAckChannel,id.data));
    };
    ipcRenderer.on(draftFlushRequestChannel,receive);
    return () => ipcRenderer.removeListener(draftFlushRequestChannel,receive);
  },
  onWebChatCleared: listener => {const receive=(_event:Electron.IpcRendererEvent,payload:unknown)=>{const parsed=webChatProviderSchema.safeParse(payload);if(parsed.success)listener(parsed.data);};ipcRenderer.on(webChatClearedChannel,receive);return()=>ipcRenderer.removeListener(webChatClearedChannel,receive);},
  onNativeTabShortcut: listener => {const receive=(_event:Electron.IpcRendererEvent,payload:unknown)=>{const parsed=nativeTabShortcutSchema.safeParse(payload);if(parsed.success) listener(parsed.data);};ipcRenderer.on(nativeTabShortcutChannel,receive);return ()=>{ipcRenderer.removeListener(nativeTabShortcutChannel,receive);};},
  onTrackpadScrollBegin: listener => subscribeTrackpad(trackpadScrollBeginChannel, listener),
  onTrackpadScrollEnd: listener => subscribeTrackpad(trackpadScrollEndChannel, listener),
  onMoodleProgress(listener) {
    const receive = (_event:Electron.IpcRendererEvent,payload:unknown) => {const parsed=moodleProgressSchema.safeParse(payload);if(parsed.success)listener(parsed.data);};
    ipcRenderer.on(moodleProgressChannel,receive);
    return () => ipcRenderer.removeListener(moodleProgressChannel,receive);
  },
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
    const result: unknown = await ipcRenderer.invoke(channel, payload);
    if (channel === 'moodle:connect' && result && typeof result === 'object' && 'moodleAuthCancelled' in result && result.moodleAuthCancelled === true) throw new Error('VSTUDY_STATUS:' + JSON.stringify({code:'moodle.auth_cancelled',params:{}}));
    return ipcContract[channel].response.parse(result) as IpcResponse<C>;
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
