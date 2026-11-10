// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { settingsSchema } from '../../shared';
import { builtinThemes } from '../../shared/themes';
import { i18n, tr } from '../../shared/i18n';
import { AppearanceSection } from './appearance';
const invoke = vi.hoisted(() => vi.fn());
vi.mock('../bridge', () => ({ desktop: { invoke } }));
vi.mock('./apply-appearance', () => ({ applyAppearance: vi.fn() }));
vi.mock('../analytics', () => ({ track: vi.fn() }));
vi.mock('./documents', () => ({ DocumentSettings: () => null }));
beforeEach(async () => { await i18n.changeLanguage('en'); });
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it('disables creation and import at the inventory limit', async () => {
  const settings = settingsSchema.parse({chatSide:"right",lastProviderId:"openai-api",lastModelId:"gpt", customThemes: Array.from({length:30}, (_, i) => ({...builtinThemes[0], id:`custom-${i}`})) });
  invoke.mockResolvedValue(settings);
  render(<AppearanceSection />);
  expect((await screen.findByRole('button', { name: tr('themes:create') }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: tr('themes:add') }) as HTMLButtonElement).disabled).toBe(true);
});
it('requires confirmation before deleting an active custom theme', async () => {
  let settings = settingsSchema.parse({chatSide:"right",lastProviderId:"openai-api",lastModelId:"gpt",themeId:'custom-one',customThemes:[{...builtinThemes[0],id:'custom-one',name:'My theme'}]});
  invoke.mockImplementation(async (channel, value) => channel === 'settings:set' ? (settings = value) : settings);
  render(<AppearanceSection />);
  fireEvent.click(await screen.findByRole('button', {name:/Delete My theme/}));
  expect(invoke.mock.calls.some(([c]) => c === 'settings:set')).toBe(false);
  fireEvent.click(screen.getByRole('button', {name:tr('common:delete')}));
  await waitFor(() => expect(settings.customThemes).toHaveLength(0));
  expect(settings.themeId).toBe('vstudy');
});
it('previews five slider steps but persists only on commit', async () => {
  const settings = settingsSchema.parse({chatSide:'right',lastProviderId:'openai-api',lastModelId:'gpt'});
  invoke.mockImplementation(async (channel,value) => channel === 'settings:get' ? settings : value);
  render(<AppearanceSection />);
  const slider = await screen.findByRole('slider',{name:tr('themes:contrast')});
  for (let value=101;value<=105;value++) {
    fireEvent.change(slider,{target:{value:String(value)}});
    fireEvent.keyUp(slider,{key:'ArrowRight'});
  }
  expect(invoke.mock.calls.filter(([c]) => c === 'settings:set')).toHaveLength(0);
  fireEvent.blur(slider);
  await waitFor(() => expect(invoke.mock.calls.filter(([c]) => c === 'settings:set')).toHaveLength(1));
  expect(slider.getAttribute('aria-valuetext')).toBe('105%');
});

it('persists keyboard slider changes when closed without blur', async () => {
  let settings = settingsSchema.parse({chatSide:'right',lastProviderId:'openai-api',lastModelId:'gpt'});
  invoke.mockImplementation(async (channel,value) => channel === 'settings:set' ? (settings=value) : settings);
  const view=render(<AppearanceSection/>);
  const slider=await screen.findByRole('slider',{name:tr('themes:contrast')});
  fireEvent.change(slider,{target:{value:'101'}});
  fireEvent.keyDown(slider,{key:'Escape'});
  view.unmount();
  await waitFor(()=>expect(settings.contrast).toBe(101));
  expect(invoke.mock.calls.filter(([c])=>c==='settings:set')).toHaveLength(1);
});
it('debounces keyboard slider changes', async () => {
  let settings = settingsSchema.parse({chatSide:'right',lastProviderId:'openai-api',lastModelId:'gpt'});
  invoke.mockImplementation(async (channel,value) => channel === 'settings:set' ? (settings=value) : settings);
  render(<AppearanceSection/>);
  const slider=await screen.findByRole('slider',{name:tr('themes:contrast')});
  for(let value=101;value<=105;value++) fireEvent.change(slider,{target:{value:String(value)}});
  await waitFor(()=>expect(settings.contrast).toBe(105));
  expect(invoke.mock.calls.filter(([c])=>c==='settings:set')).toHaveLength(1);
});

it('shows a specific deletion failure inside confirmation and returns focus after retry', async () => {
  let settings=settingsSchema.parse({chatSide:'right',lastProviderId:'openai-api',lastModelId:'gpt',themeId:'custom-one',customThemes:[{...builtinThemes[0],id:'custom-one',name:'My theme'}]});
  let fail=true;
  invoke.mockImplementation(async (channel,value)=>{
    if(channel==='settings:set') {if(fail)throw new Error('VSTUDY_STATUS:{"code":"storage.permission","params":{}}');settings=value;}
    return settings;
  });
  render(<AppearanceSection/>);
  fireEvent.click(await screen.findByRole('button',{name:/Delete My theme/}));
  fireEvent.click(screen.getByRole('button',{name:tr('common:delete')}));
  expect((await within(screen.getByRole('alertdialog')).findByRole('alert')).textContent).toBe(tr('storage:permission'));
  fail=false;fireEvent.click(screen.getByRole('button',{name:tr('common:delete')}));
  await waitFor(()=>expect(screen.queryByRole('alertdialog')).toBeNull());
  await waitFor(()=>expect(document.activeElement?.textContent).toBe(tr('themes:system')));
});

it.each(['solid', 'glass'] as const)('keeps native %s material independent of legacy card transparency', async material => {
  let settings = settingsSchema.parse({chatSide:'right',lastProviderId:'openai-api',lastModelId:'gpt',material,cardTransparency:'soft'});
  invoke.mockImplementation(async (channel,value) => channel === 'settings:set' ? (settings=value) : settings);
  render(<AppearanceSection/>);
  const soft = await screen.findByRole('radio',{name:tr('themes:card_soft')});
  expect(soft.getAttribute('aria-checked')).toBe('true');
  fireEvent.click(screen.getByRole('radio',{name:tr('themes:card_solid')}));
  await waitFor(()=>expect(settings.cardTransparency).toBe('solid'));
  expect(settings.material).toBe(material);
  fireEvent.click(soft);
  await waitFor(()=>expect(settings.cardTransparency).toBe('soft'));
  expect(settings.material).toBe(material);
});
