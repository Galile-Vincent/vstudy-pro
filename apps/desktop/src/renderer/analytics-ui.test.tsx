// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { AnalyticsSettings, ExistingAnalyticsPrompt, ConsentChoice, completeAnalyticsOnboarding } from './analytics-ui';
import { Newsletter } from './newsletter';
import { i18n } from '../shared/i18n';
const invoke = vi.hoisted(() => vi.fn());
vi.mock('./bridge', () => ({desktop:{invoke}}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root:Root, host:HTMLDivElement;
let completed:boolean, available:boolean, decided:boolean;
beforeEach(async () => {
  await i18n.changeLanguage('en'); completed=false; available=false; decided=false;
  invoke.mockReset().mockImplementation(async (channel, input) => {
    if (channel === 'settings:get') return {onboardingCompleted:true};
    if (channel === 'newsletter:getConfig') return {available};
    if (channel === 'newsletter:subscribe') return {accepted:true};
    if (channel === 'analytics:getInstallationId') return {installation_id:'11111111-1111-4111-a111-111111111111'};
    if (channel === 'analytics:completeOnboarding') completed=true;
    if (channel === 'analytics:setConsent') decided=true;
    return {enabled:channel === 'analytics:setConsent' ? input.enabled : false,onboarding_completed:completed,consent_decided:decided};
  });
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async () => { await act(() => root.unmount());host.remove(); });
const render = (ui:React.ReactNode) => act(() => root.render(ui));
const button = (text:string) => [...host.querySelectorAll('button')].find(b=>b.textContent===text)!;
it('defaults off and changes consent only on an explicit settings toggle', async () => {
  await render(<AnalyticsSettings/>);
  expect(host.querySelector<HTMLInputElement>('[role=switch]')?.checked).toBe(false);
  expect(invoke.mock.calls.some(([c])=>c==='analytics:setConsent')).toBe(false);
  await act(() => { (host.querySelector('[role=switch]') as HTMLInputElement).click(); });
  expect(invoke).toHaveBeenCalledWith('analytics:setConsent',{enabled:true});
});
it('decline completes onboarding without requiring analytics', async () => {
  let entered=false;
  await render(<ConsentChoice onChoose={enabled => { void completeAnalyticsOnboarding(enabled,{acquisition_source:'prefer_not_to_say',email_provided:false,updates_opted_in:false,duration_ms:0}).then(()=>{entered=true;}); }}/>);
  await act(()=>button('No thanks').click());
  expect(entered).toBe(true);
  expect(invoke).toHaveBeenCalledWith('analytics:setConsent',{enabled:false});
  expect(invoke).toHaveBeenCalledWith('analytics:completeOnboarding',expect.objectContaining({updates_opted_in:false}));
});
it('hides the entire newsletter when no endpoint is configured', async () => {
  await render(<Newsletter onConsent={()=>{}}/>);
  expect(host.querySelector('input')).toBeNull();
  expect(invoke.mock.calls.some(([c])=>c==='newsletter:subscribe')).toBe(false);
});
it('requires valid email and separate unchecked consent; email never reaches analytics', async () => {
  available=true;let flags={email_provided:false,updates_opted_in:false};
  const onConsent=(email_provided:boolean,updates_opted_in:boolean)=>{flags={email_provided,updates_opted_in};};
  await render(<Newsletter onConsent={onConsent}/>);
  expect(host.querySelector('input[type=checkbox]')).toBeNull();
  expect(button('Subscribe').disabled).toBe(true);
  const input=host.querySelector('input[type=email]') as HTMLInputElement;
  const enter=async (value:string)=>act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
  await enter('invalid');expect(button('Subscribe').disabled).toBe(true);
  await enter('student@example.org');expect(button('Subscribe').disabled).toBe(false);
  expect(flags.updates_opted_in).toBe(false);
  expect(invoke.mock.calls.some(([c])=>c==='newsletter:subscribe')).toBe(false);
  await act(()=>button('Subscribe').click());
  expect(invoke).toHaveBeenCalledWith('newsletter:subscribe',{email:'student@example.org',locale:'en',source:'onboarding',consent:true});
  await completeAnalyticsOnboarding(false,{acquisition_source:'github',...flags,duration_ms:1});
  expect(flags).toEqual({email_provided:true,updates_opted_in:true});
  const analytics=invoke.mock.calls.filter(([c])=>c.startsWith('analytics:'));
  expect(JSON.stringify(analytics)).not.toContain('student@example.org');
  expect(analytics.find(([c])=>c==='analytics:completeOnboarding')?.[1]).not.toHaveProperty('email');
});
it('shows the existing-user invitation once across remounts after a choice', async () => {
  await render(<ExistingAnalyticsPrompt/>);expect(host.querySelector('aside')).not.toBeNull();
  await act(()=>button('No thanks').click());expect(host.querySelector('aside')).toBeNull();
  await render(<></>);await render(<ExistingAnalyticsPrompt/>);expect(host.querySelector('aside')).toBeNull();
  expect(invoke.mock.calls.some(([c])=>c==='analytics:completeOnboarding')).toBe(false);
});
it('shows deletion instructions without claiming the cloud data is gone', async () => {
  invoke.mockImplementation(async channel => {
    if(channel==='analytics:getInstallationId') return {installation_id:'11111111-1111-4111-a111-111111111111'};
    if(channel==='analytics:requestDeletion') return {pending:true,installation_id:'11111111-1111-4111-a111-111111111111',method:'contact',contact_url:'https://github.com/ava-apple/vstudy-pro',instructions:'Contact privately.'};
    return {enabled:true};
  });
  await render(<AnalyticsSettings/>);
  await act(()=>button('Request deletion of my cloud data').click());
  expect(invoke.mock.calls.some(([c])=>c==='analytics:requestDeletion')).toBe(false);
  await act(()=>button('Show deletion instructions').click());
  expect(host.textContent).toContain('Contact privately.');expect(host.textContent).toContain('Cloud deletion is not complete');
  expect(host.querySelector<HTMLInputElement>('[role=switch]')?.checked).toBe(false);
});

it('keeps a failed newsletter submission retryable and separate from continuing setup', async () => {
  available=true;let optedIn=true;
  const original=invoke.getMockImplementation()!;
  invoke.mockImplementation((channel,input)=>channel==='newsletter:subscribe' ? Promise.resolve({accepted:false}) : original(channel,input));
  await render(<Newsletter onConsent={(_email,opted)=>{optedIn=opted;}}/>);
  const input=host.querySelector('input[type=email]') as HTMLInputElement;
  await act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'student@example.org');input.dispatchEvent(new Event('input',{bubbles:true}));});
  await act(()=>button('Subscribe').click());
  expect(host.querySelector('p[role=status]')?.textContent).toContain('continue without subscribing');
  expect(button('Try again').disabled).toBe(false);expect(optedIn).toBe(false);
  await completeAnalyticsOnboarding(false,{acquisition_source:'prefer_not_to_say',email_provided:true,updates_opted_in:true,duration_ms:0});
  expect(completed).toBe(true);
});

it('a settings choice dismisses the upgrade invitation too', async () => {
  await render(<><ExistingAnalyticsPrompt/><AnalyticsSettings/></>);
  expect(host.querySelector('aside')).not.toBeNull();
  await act(()=>(host.querySelector('[role=switch]') as HTMLInputElement).click());
  expect(completed).toBe(false);expect(host.querySelector('aside')).toBeNull();
  expect(invoke.mock.calls.some(([c])=>c==='analytics:completeOnboarding')).toBe(false);
});

it('uses the shared website base for localized legal pages',async()=>{
  const {WEBSITE_URL}=await import('../shared/website');
  await render(<AnalyticsSettings/>);
  expect([...host.querySelectorAll('.analytics-links a')].map(a=>a.getAttribute('href'))).toEqual([`${WEBSITE_URL}/en/privacy`,`${WEBSITE_URL}/en/terms`]);
});
it.each([['en','Share usage data'],['ja','利用状況データを共有'],['zh-Hant','分享使用資料']])('discloses usage sharing accurately in %s',async(lang,label)=>{
  await i18n.changeLanguage(lang);await render(<ConsentChoice onChoose={()=>{}}/>);
  expect(host.textContent).toContain(label);
});

it('refreshes the displayed installation identity when consent regenerates it',async()=>{
  let identity='11111111-1111-4111-a111-111111111111';
  const original=invoke.getMockImplementation()!;
  invoke.mockImplementation(async(channel,input)=>{
    if(channel==='analytics:getInstallationId')return {installation_id:identity};
    if(channel==='analytics:setConsent')identity='22222222-2222-4222-a222-222222222222';
    return original(channel,input);
  });
  await render(<AnalyticsSettings/>);
  await act(()=>(host.querySelector('[role=switch]') as HTMLInputElement).click());
  expect(host.querySelector('code')?.textContent).toBe('22222222-2222-4222-a222-222222222222');
});
it('disables both privacy choices while locked',async()=>{
  const choose=vi.fn();await render(<ConsentChoice busy onChoose={choose}/>);
  for(const button of host.querySelectorAll('button')){expect(button.disabled).toBe(true);button.click();}
  expect(choose).not.toHaveBeenCalled();
});
