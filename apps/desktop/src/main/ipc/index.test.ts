/** MCP calendar export uses the app-owned window even when the OS refuses focus. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import type { McpBackendOptions } from '../mcp/backend-types';
import type { SecretStore } from '../services/secrets';
import { openStore } from '../db';
import { id, seedStudent } from '../planner/__fixtures__/student';
import { registerIpc } from './index';

const mocks=vi.hoisted(()=>({
  focused:vi.fn(), save:vi.fn(), write:vi.fn(),
  exportCalendar:undefined as McpBackendOptions['exportCalendar'] | undefined,
}));
vi.mock('electron',()=>({
  app:{getPath:()=>'/unused',getAppPath:()=>'/unused',once:vi.fn(),removeListener:vi.fn()},
  BrowserWindow:{getFocusedWindow:mocks.focused},dialog:{showSaveDialog:mocks.save},
  nativeTheme:{},shell:{},ipcMain:{handle:vi.fn(),removeHandler:vi.fn()},
}));
vi.mock('../providers/executable-pins',()=>({ExecutablePins:class {},setExecutablePins:vi.fn()}));
vi.mock('../providers',()=>({createProviderRegistry:()=>({})}));
vi.mock('../i18n',()=>({tr:(key:string)=>key,updateApplicationMenu:vi.fn()}));
vi.mock('./usage',()=>({registerUsageIpc:vi.fn()}));
vi.mock('./chat',()=>({registerChatIpc:()=>({dispose:vi.fn()})}));
vi.mock('./ai-cli',()=>({registerAiCliIpc:()=>vi.fn()}));
vi.mock('./documents',()=>({registerDocumentsIpc:()=>vi.fn()}));
vi.mock('./planner',()=>({registerPlannerIpc:()=>vi.fn()}));
vi.mock('./moodle',()=>({registerMoodleIpc:()=>Object.assign(vi.fn(),{service:{repository:{}}})}));
vi.mock('./mcp',()=>({registerMcpIpc:vi.fn()}));
vi.mock('./library',()=>({registerLibraryIpc:()=>Object.assign(vi.fn(),{waitForIdle:vi.fn()})}));
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
vi.mock('../services/search-runner',()=>({disposeSearchWorkers:vi.fn()}));
vi.mock('../providers/models',()=>({disposeDiscovery:vi.fn()}));

const stores:ReturnType<typeof openStore>[]=[];
beforeEach(()=>{vi.clearAllMocks();mocks.focused.mockReturnValue(null);mocks.save.mockResolvedValue({canceled:false,filePath:'/calendar.ics'});});
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
