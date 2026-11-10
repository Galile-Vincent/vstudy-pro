/** MCP calendar export uses the app-owned window even when the OS refuses focus. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import type { McpBackendOptions } from '../mcp/backend-types';
import type { SecretStore } from '../services/secrets';
import { openStore } from '../db';
import { id, seedStudent } from '../planner/__fixtures__/student';
let registerIpc: typeof import('./index').registerIpc;

const mocks=vi.hoisted(()=>({
  log:vi.fn(), chatDispose:vi.fn(), focused:vi.fn(), save:vi.fn(), write:vi.fn(), confirm:vi.fn(), external:vi.fn(), idle:vi.fn(async()=>{}),
  exportCalendar:undefined as McpBackendOptions['exportCalendar'] | undefined,
}));
vi.mock('electron',()=>({
  app:{getPath:()=>'/unused',getAppPath:()=>'/unused',once:vi.fn(),removeListener:vi.fn()},
  BrowserWindow:{getFocusedWindow:mocks.focused,getAllWindows:()=>[]},dialog:{showSaveDialog:mocks.save},
  nativeTheme:{},shell:{openExternal:mocks.external},ipcMain:{handle:vi.fn(),removeHandler:vi.fn()},
}));
vi.mock('../logging',()=>({log:mocks.log}));
vi.mock('../dialogs',()=>({showAttachedMessage:mocks.confirm,ownerWindow:vi.fn()}));
vi.mock('../providers/executable-pins',()=>({ExecutablePins:class {},setExecutablePins:vi.fn()}));
vi.mock('../providers',()=>({createProviderRegistry:()=>({})}));
vi.mock('../i18n',()=>({tr:(key:string)=>key,updateApplicationMenu:vi.fn()}));
vi.mock('./usage',()=>({registerUsageIpc:vi.fn()}));
vi.mock('./chat',()=>({registerChatIpc:()=>({dispose:mocks.chatDispose,waitForIdle:mocks.idle})}));
vi.mock('./ai-cli',()=>({registerAiCliIpc:()=>vi.fn()}));
vi.mock('./documents',()=>({registerDocumentsIpc:()=>Object.assign(vi.fn(),{waitForIdle:mocks.idle})}));
vi.mock('./planner',()=>({registerPlannerIpc:()=>vi.fn()}));
vi.mock('./moodle',()=>({registerMoodleIpc:()=>Object.assign(vi.fn(),{waitForIdle:mocks.idle,service:{repository:{}}})}));
vi.mock('./mcp',()=>({registerMcpIpc:vi.fn()}));
vi.mock('./library',()=>({registerLibraryIpc:()=>Object.assign(vi.fn(),{waitForIdle:mocks.idle})}));
vi.mock('./storage',()=>({registerStorageIpc:vi.fn()}));
vi.mock('../mcp/client-setup',()=>({createAgentClientSetup:vi.fn()}));
vi.mock('../mcp/backend',()=>({createMcpBackend:(options:McpBackendOptions)=>{
  mocks.exportCalendar=options.exportCalendar;
  return {};
}}));
vi.mock('../mcp/runtime',()=>({createMcpRuntime:(options:{backend:()=>unknown})=>{
  options.backend();
  return {restore:vi.fn(),dispose:vi.fn()};
}}));
vi.mock('../services/export-file',()=>({exportText:mocks.write}));
vi.mock('../services/search-runner',()=>({disposeSearchWorkers:vi.fn(),waitForSearchWorkers:vi.fn(async()=>{})}));
vi.mock('../providers/models',()=>({disposeDiscovery:vi.fn()}));

const stores:ReturnType<typeof openStore>[]=[];
beforeEach(async()=>{vi.resetModules();registerIpc=(await import('./index')).registerIpc;vi.clearAllMocks();mocks.focused.mockReturnValue(null);mocks.save.mockResolvedValue({canceled:false,filePath:'/calendar.ics'});});
afterEach(()=>{for(const store of stores.splice(0))store.close();});
function fixture(owner:BrowserWindow | undefined) {
  const store=openStore(':memory:');stores.push(store);seedStudent(store);
  const restore=vi.fn(async()=>owner);
  const dispose=registerIpc(store,{} as SecretStore,()=>true,restore);
  return {restore,dispose};
}
it.each(['no focus','other window focused'])('opens and saves an MCP calendar with %s',async focus=>{
  const owner={isDestroyed:()=>false} as BrowserWindow;
  mocks.focused.mockReturnValue(focus==='no focus' ? null : {id:99,isDestroyed:()=>false});
  const {restore,dispose}=fixture(owner);
  try {
    expect(await mocks.exportCalendar!({deadlineIds:[id(3)]})).toEqual({saved:true});
    expect(restore).toHaveBeenCalledOnce();
    expect(mocks.save).toHaveBeenCalledWith(owner,expect.objectContaining({defaultPath:'vstudy-study-plan.ics'}));
    expect(mocks.write).toHaveBeenCalledWith(expect.stringContaining('Lab report'),'/calendar.ics');
  } finally {await dispose();}
});
it.each(['missing','destroyed'])('reports an unavailable main window (%s) instead of cancellation',async state=>{
  const {dispose}=fixture(state==='missing' ? undefined : {isDestroyed:()=>true} as BrowserWindow);
  try {
    await expect(mocks.exportCalendar!({deadlineIds:[id(3)]})).rejects.toThrow();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  } finally {await dispose();}
});
it('retains user cancellation without writing the calendar',async()=>{
  const {dispose}=fixture({isDestroyed:()=>false} as BrowserWindow);
  mocks.save.mockResolvedValue({canceled:true});
  try {
    expect(await mocks.exportCalendar!({deadlineIds:[id(3)]})).toEqual({saved:false});
    expect(mocks.write).not.toHaveBeenCalled();
  } finally {await dispose();}
});
it('recovers interrupted memory and abandoned generation only at normal IPC startup',async()=>{
 const {ReviewRepository}=await import('../review/repository');
 const {ArtifactRepository}=await import('../review/artifact-repository');
 const {MemoryRepository}=await import('../review/memory-repository');
 const {randomUUID}=await import('node:crypto');
 const store=openStore(':memory:');stores.push(store);
 const review=new ReviewRepository(store.db),course=review.createCourse({title:'Physics'});review.setPrefs({consentAcknowledged:true});
 const chat=randomUUID(),user=randomUUID(),assistant=randomUUID(),at=new Date().toISOString();
 store.db.prepare("INSERT INTO conversations(id,scope,providerId,modelId,createdAt) VALUES(?,'general','openai-api','gpt-5.4',?)").run(chat,at);
 for(const [messageId,role] of [[user,'user'],[assistant,'assistant']])store.db.prepare('INSERT INTO messages(id,conversationId,role,parts,createdAt,parentMessageId) VALUES(?,?,?,?,?,?)').run(messageId!,chat,role!,JSON.stringify([{type:'text',text:'Force?',status:'complete'}]),at,role==='assistant'?user:null);
 review.assignChat(chat,course.id);
 const jobs=new MemoryRepository(store.db);jobs.enqueue(assistant);const job=jobs.claim()!;
 const artifacts=new ArtifactRepository(store.db);
 const artifact=artifacts.create({requestId:randomUUID(),courseId:course.id,kind:'note',title:'Notes',scope:{kind:'weak'},idempotencyKey:randomUUID(),providerId:'openai-api',modelId:'gpt-5.4',locale:'en'},{unitIds:[],documentIds:[],conceptKeys:[],from:null,to:null,timeZone:'UTC',sources:[],assumptions:[]},'abandoned');
 expect(store.db.prepare('SELECT status FROM study_jobs WHERE id=?').get(job.id)?.status).toBe('running');
 expect(artifacts.find(artifact.id)?.status).toBe('generating');
 const dispose=registerIpc(store,{} as SecretStore,()=>true,async()=>undefined);
 try{
  expect(artifacts.find(artifact.id)?.status).toBe('interrupted');
  expect(store.db.prepare('SELECT attemptToken FROM study_jobs WHERE id=?').get(job.id)?.attemptToken).not.toBe(job.attemptToken);
 }finally{await dispose();}
});

it('keeps IPC handlers until workers stop during normal shutdown', async () => {
  const {dispose}=fixture(undefined);
  const {reviewWorkers}=await import('../review/workers');
  const {ipcMain}=await import('electron');
  const order:string[]=[];
  vi.spyOn(reviewWorkers,'dispose').mockImplementationOnce(async()=>{order.push('workers');});
  vi.mocked(ipcMain.removeHandler).mockImplementation(()=>{order.push('ipc');});
  await dispose();
  expect(order[0]).toBe('workers');
});

it('removes IPC and starts chat cancellation before deletion waits on review disposal', async () => {
  const {dispose}=fixture(undefined);
  const {reviewWorkers}=await import('../review/workers');
  const {ipcMain}=await import('electron');
  let release!:()=>void;
  vi.spyOn(reviewWorkers,'dispose').mockImplementationOnce(() => new Promise(resolve => {release=resolve;}));
  vi.mocked(ipcMain.removeHandler).mockClear();
  const pending=dispose(true);
  try {
    expect(ipcMain.removeHandler).toHaveBeenCalled();
    expect(mocks.chatDispose).toHaveBeenCalledOnce();
  } finally {release();await pending;}
});

it('wires all update channels, filters push owners, confirms notes and protects stored opt-out',async()=>{
  const {ipcMain}=await import('electron');
  const store=openStore(':memory:');stores.push(store);
  const snapshot={state:{status:'available',version:'0.4.5',releaseUrl:'https://github.com/ava-apple/vstudy-pro/releases/tag/v0.4.5'},
    currentVersion:'0.4.4',lastCheckedAt:null,automatic:false};
  let listener: (value:unknown)=>void=()=>{};
  const updates={snapshot:()=>snapshot,subscribe:vi.fn(fn=>{listener=fn;return ()=>{};}),
    check:vi.fn(()=>snapshot),download:vi.fn(()=>snapshot),install:vi.fn(()=>snapshot),
    waitForWork:vi.fn(async (work:()=>Promise<void>)=>{await work();return true;}),
    cancelWait:vi.fn(()=>snapshot),setAuto:vi.fn(()=>snapshot),dispose:vi.fn()};
  const frame={url:'app://index'};
  const sender={id:1,mainFrame:frame,isDestroyed:()=>false,send:vi.fn()};
  let trusted=true;
  const event={sender,senderFrame:frame};
  const dispose=registerIpc(store,{} as SecretStore,()=>trusted,async()=>undefined,{updates:updates as never});
  const handlers=new Map(vi.mocked(ipcMain.handle).mock.calls);
  try {
    const channels=['state','check','download','install','cancel','setAuto','notes'];
    for(const channel of channels)expect(handlers.has(`updates:${channel}`)).toBe(true);
    await handlers.get('updates:state')!(event as never,{});
    listener(snapshot);expect(sender.send).toHaveBeenCalledWith('updates:state',snapshot);
    trusted=false;listener(snapshot);expect(sender.send).toHaveBeenCalledTimes(1);
    await expect(handlers.get('updates:check')!(event as never,{})).rejects.toThrow('Untrusted');
    trusted=true;mocks.confirm.mockResolvedValue({response:0});
    await handlers.get('updates:notes')!(event as never,{});expect(mocks.external).not.toHaveBeenCalled();
    mocks.confirm.mockResolvedValue({response:1});
    await handlers.get('updates:notes')!(event as never,{});
    expect(mocks.external).toHaveBeenCalledWith(snapshot.state.releaseUrl);
    mocks.confirm.mockResolvedValue({response:0});
    await handlers.get('updates:download')!(event as never,{});expect(updates.download).not.toHaveBeenCalled();
    snapshot.state={status:'ready',version:'0.4.5'} as typeof snapshot.state;
    await handlers.get('updates:install')!(event as never,{});expect(updates.install).not.toHaveBeenCalled();
    const dialogs = mocks.confirm.mock.calls.length;
    await handlers.get('updates:download')!(event as never,{});
    expect(mocks.confirm).toHaveBeenCalledTimes(dialogs);
    let consent: (value:{response:number})=>void = ()=>{};
    mocks.confirm.mockImplementationOnce(()=>new Promise(resolve=>{consent=resolve;}));
    let finish=()=>{};const drain=new Promise<void>(resolve=>{finish=resolve;});
    mocks.idle.mockImplementationOnce(()=>drain);
    const installing=handlers.get('updates:install')!(event as never,{});
    await Promise.resolve();expect(updates.install).not.toHaveBeenCalled();
    await handlers.get('updates:install')!(event as never,{});
    expect(mocks.confirm).toHaveBeenCalledTimes(dialogs+1);
    const {exclusiveStorage}=await import('../storage/maintenance');
    await expect(exclusiveStorage(async()=>{},async()=>true)).resolves.toBe(true);
    consent({response:1});
    await Promise.resolve();await Promise.resolve();
    await handlers.get('updates:install')!(event as never,{});
    expect(updates.waitForWork).toHaveBeenCalledOnce();
    finish();await installing;expect(mocks.idle).toHaveBeenCalledTimes(4);
    expect(updates.install).toHaveBeenCalledOnce();
    store.settings.set({autoCheckUpdates:false});
    await handlers.get('settings:set')!(event as never,{...store.settings.get(),autoCheckUpdates:true});
    expect(store.settings.get().autoCheckUpdates).toBe(false);
  }finally{await dispose();}
});

it.each(['before consent','during drain'])('blocks update installation when deletion starts %s',async phase=>{
  const {ipcMain}=await import('electron');
  const store=openStore(':memory:');stores.push(store);
  const snapshot={state:{status:'ready',version:'0.4.5'},currentVersion:'0.4.4',lastCheckedAt:null,automatic:false};
  let allowed=phase!=='before consent';
  const updates={snapshot:()=>snapshot,subscribe:()=>()=>{},dispose:vi.fn(),install:vi.fn(()=>snapshot),
    waitForWork:vi.fn(async()=>{allowed=false;return true;})};
  const dispose=registerIpc(store,{} as SecretStore,()=>true,undefined,{updates:updates as never,canInstallUpdate:()=>allowed});
  mocks.confirm.mockResolvedValue({response:1});
  const handler=new Map(vi.mocked(ipcMain.handle).mock.calls).get('updates:install')!;
  try {
    expect(await handler({sender:{isDestroyed:()=>false}} as never,{})).toEqual(snapshot);
    expect(snapshot).toEqual({state:{status:'ready',version:'0.4.5'},currentVersion:'0.4.4',lastCheckedAt:null,automatic:false});
    expect(mocks.log).toHaveBeenCalledWith({phase:'updates-install-blocked'});
    expect(updates.install).not.toHaveBeenCalled();
    expect(mocks.confirm).toHaveBeenCalledTimes(phase==='before consent'?0:1);
  }finally{await dispose();}
});

it.each([false,true])('disposes updates and unsubscribes on deleting=%s',async deleting=>{
  const store=openStore(':memory:');stores.push(store);
  const unsubscribe=vi.fn();
  const updates={snapshot:vi.fn(),subscribe:vi.fn(()=>unsubscribe),dispose:vi.fn()};
  const dispose=registerIpc(store,{} as SecretStore,()=>true,undefined,{updates:updates as never});
  await dispose(deleting);
  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(updates.dispose).toHaveBeenCalledOnce();
});
