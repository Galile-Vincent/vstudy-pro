// @vitest-environment jsdom
/** Theme application verifies visible CSS, system changes, and optional renderer storage. */
import { beforeEach, expect, it, vi } from 'vitest';
import { defaultSettings } from '../../shared/domain';
import { builtinThemes } from '../../shared/themes';

const state = vi.hoisted(() => ({dark:false,change:()=>{},invoke:vi.fn()}));
vi.mock('../bridge', () => ({desktop:{invoke:state.invoke}}));
import { applyAppearance, initializeAppearance } from './apply-appearance';

beforeEach(() => {
  state.dark=false;state.change=()=>{};state.invoke.mockReset();
  state.invoke.mockResolvedValue(defaultSettings);
  localStorage.clear();
  document.documentElement.removeAttribute('style');
  vi.stubGlobal('matchMedia', () => ({matches:state.dark,addEventListener:(_name:string,listener:()=>void)=>{state.change=listener;}}));
});

it('paints authoritative settings before marking the UI ready', async () => {
  localStorage.setItem('vstudy-appearance-v1',JSON.stringify({...defaultSettings,themeId:'grove'}));
  state.invoke.mockResolvedValue({...defaultSettings,themeId:'iris',colorScheme:'dark',readerFont:'serif',uiScale:125});
  await initializeAppearance();
  expect(document.documentElement.dataset).toMatchObject({appearanceReady:'true',theme:'iris',scheme:'dark'});
  expect(document.documentElement.style.getPropertyValue('--surface')).toBe(builtinThemes.find(t=>t.id==='iris')!.dark.surface);
  expect(document.documentElement.style.getPropertyValue('--ui-scale')).toBe('1.25');
  expect(document.documentElement.style.getPropertyValue('--font-reader')).toContain('Georgia');
});

it('follows system appearance changes only for System', async () => {
  await initializeAppearance();
  applyAppearance({...defaultSettings,themeId:'ocean'});
  state.dark=true;state.change();
  expect(document.documentElement.dataset.scheme).toBe('dark');
  expect(document.documentElement.classList.contains('dark')).toBe(true);
  applyAppearance({...defaultSettings,colorScheme:'light'});
  state.change();
  expect(document.documentElement.dataset.scheme).toBe('light');
});

it('applies every token and works when localStorage is unavailable', () => {
  const storage=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('blocked');});
  const pack={...builtinThemes[1]!,id:'custom-sea'};
  expect(()=>applyAppearance({...defaultSettings,themeId:pack.id,customThemes:[pack],glassOpacity:95})).not.toThrow();
  for (const [name,value] of Object.entries(pack.light)) {
    expect(document.documentElement.style.getPropertyValue(`--${name==='sidebar'?'sidebar-surface':name}`)).toBe(value);
  }
  expect(document.documentElement.style.getPropertyValue('--glass-opacity')).toBe('95%');
  storage.mockRestore();
});


it('does not cut the slider preview when its identical value is persisted', async () => {
  await initializeAppearance();
  Object.defineProperty(document, 'visibilityState', {value:'visible', configurable:true});
  let update: (() => void) | undefined;
  let finish!: () => void;
  const skip = vi.fn();
  document.startViewTransition = vi.fn((callback: () => void) => {
    update = callback;
    return {ready:Promise.resolve(), finished:new Promise<void>(resolve=>{finish=resolve;}), skipTransition:skip} as unknown as ViewTransition;
  }) as typeof document.startViewTransition;
  const next = {...defaultSettings,contrast:110};
  applyAppearance(next, true);
  applyAppearance(next, true);
  expect(skip).not.toHaveBeenCalled();
  expect(document.documentElement.dataset.themeTransition).toBe('view');
  update!();
  finish();
  await Promise.resolve();
  document.startViewTransition = undefined as unknown as typeof document.startViewTransition;
});
