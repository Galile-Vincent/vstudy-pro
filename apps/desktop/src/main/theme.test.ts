/** Native background color follows the renderer without startup animation or overlapping timers. */
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { defaultSettings } from '../shared/domain';
const state = vi.hoisted(() => ({
  visible:false, destroyed:false, reduced:false,
  window:{setBackgroundColor:vi.fn(),setVibrancy:vi.fn(),isVisible:()=>state.visible,isDestroyed:()=>state.destroyed},
}));
vi.mock('electron', () => ({
  BrowserWindow:{getAllWindows:()=>[state.window]},
  nativeTheme:{themeSource:'light',shouldUseDarkColors:false,prefersReducedTransparency:false},
  systemPreferences:{getAnimationSettings:()=>({prefersReducedMotion:state.reduced})},
}));
import { applyNativeTheme, nativeBackground } from './theme';

beforeEach(() => {
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});
  state.visible=false; state.destroyed=false; state.reduced=false;
  applyNativeTheme({...defaultSettings,colorScheme:'light'});
  state.window.setBackgroundColor.mockClear();
});
afterEach(() => {vi.clearAllTimers();vi.useRealTimers();});

it('sets startup colors immediately and produces intermediate colors for a visible window', () => {
  applyNativeTheme({...defaultSettings,themeId:'ocean',colorScheme:'light'});
  expect(state.window.setBackgroundColor).toHaveBeenLastCalledWith(nativeBackground({...defaultSettings,themeId:'ocean',colorScheme:'light'}));
  state.visible=true;
  state.window.setBackgroundColor.mockClear();
  applyNativeTheme({...defaultSettings,themeId:'iris',colorScheme:'dark'});
  vi.advanceTimersByTime(80);
  const intermediate=state.window.setBackgroundColor.mock.lastCall![0];
  expect(intermediate).not.toBe(nativeBackground({...defaultSettings,themeId:'ocean',colorScheme:'light'}));
  expect(intermediate).not.toBe(nativeBackground({...defaultSettings,themeId:'iris',colorScheme:'dark'}));
  vi.advanceTimersByTime(240);
  expect(state.window.setBackgroundColor).toHaveBeenLastCalledWith(nativeBackground({...defaultSettings,themeId:'iris',colorScheme:'dark'}));
});

it('cancels the previous target when users switch again', () => {
  state.visible=true;
  applyNativeTheme({...defaultSettings,themeId:'ocean',colorScheme:'dark'});
  vi.advanceTimersByTime(80);
  applyNativeTheme({...defaultSettings,themeId:'grove',colorScheme:'dark'});
  vi.advanceTimersByTime(320);
  expect(state.window.setBackgroundColor).toHaveBeenLastCalledWith(nativeBackground({...defaultSettings,themeId:'grove',colorScheme:'dark'}));
  expect(vi.getTimerCount()).toBe(0);
});

it('respects reduced motion and stops when the window closes', () => {
  state.visible=true; state.reduced=true;
  applyNativeTheme({...defaultSettings,themeId:'ember',colorScheme:'dark'});
  expect(vi.getTimerCount()).toBe(0);
  state.reduced=false;
  applyNativeTheme({...defaultSettings,themeId:'rose',colorScheme:'dark'});
  state.destroyed=true;
  vi.advanceTimersByTime(320);
  expect(vi.getTimerCount()).toBe(0);
});
