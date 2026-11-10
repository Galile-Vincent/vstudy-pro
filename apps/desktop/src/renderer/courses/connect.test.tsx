// @vitest-environment jsdom
import './test-platform';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { ConnectDialog, fuzzySiteMatch } from './connect';
import { createMockMoodleApi } from '../dev-mock';
import { i18n, tr } from '../../shared/i18n';
import type { AuthPlan } from '../../shared/moodle';
vi.stubGlobal('ResizeObserver',class {observe() {} unobserve() {} disconnect() {}});
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
beforeEach(async () => {await i18n.changeLanguage('en');localStorage.clear();host = document.createElement('div');document.body.append(host);root = createRoot(host);});
afterEach(async () => {await act(async () => root.unmount());host.remove();});
async function click(name: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.includes(name));
  if (!button) throw new Error(`Missing button ${name}`);
  await act(async () => button.click());
}
async function mount(plan: AuthPlan = {kind:'password'}) {
  const api = createMockMoodleApi();
  const check = vi.fn(async () => ({siteUrl:'https://school.example/moodle',siteName:'Example University',authPlan:plan}));
  api.checkSite = check;
  const connected = vi.fn(async () => undefined), closed = vi.fn();
  const connect = vi.spyOn(api,'connect');
  await act(async () => root.render(<ConnectDialog open onOpenChange={closed} api={api} onConnected={connected} />));
  return {api,check,connect,connected,closed};
}
async function advance() {await click('Chung Yuan');await click('Continue to sign in');}
it('filters suggestions with fuzzy matching',() => {
  expect(fuzzySiteMatch('cycu','中原大學 Chung Yuan CYCU https://ilearning.cycu.edu.tw')).toBe(true);
  expect(fuzzySiteMatch('unknown','中原大學 CYCU')).toBe(false);
});
it('shows a checked site before asking for a password and clears form secrets on submit',async () => {
  const {connect,connected,closed} = await mount();
  expect(document.querySelector('input[type=password]')).toBeNull();
  await click('Chung Yuan');
  const { getByText } = await import('@testing-library/react');
  const result = document.querySelector<HTMLElement>('.moodle-site-result')!;
  expect(getByText(result, 'Example University')).toBeTruthy();
  expect(document.querySelector('.moodle-site-result')?.textContent).toContain('school.example/moodle');
  expect(document.querySelector('[aria-current=step]')?.textContent).toBe('2Check site');
  expect(document.querySelector('input[type=password]')).toBeNull();
  await click('Continue to sign in');
  const username = document.querySelector<HTMLInputElement>('[name=username]')!, password = document.querySelector<HTMLInputElement>('[name=password]')!;
  username.value = 'student';password.value = 'password-secret';
  await act(async () => password.form!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(connect.mock.calls).toEqual([[{siteUrl:'https://school.example/moodle',username:'student',password:'password-secret'}]]);
  expect(password.value).toBe('');
  expect(localStorage.getItem('vstudy-moodle-recent-sites')).not.toContain('password-secret');
  expect(connected.mock.calls).toEqual([[]]);expect(closed.mock.calls).toEqual([[false]]);
});
it.each(['browser','embedded'] as const)('offers provider buttons without password inputs for %s',async kind => {
  const {connect} = await mount({kind,providers:[{name:'Campus ID',iconurl:'',url:'https://school.example/auth/oauth2/login.php?id=9'}]});
  await advance();
  expect(document.querySelector('input[type=password]')).toBeNull();
  await click('Continue with Campus ID');
  expect(connect.mock.calls).toEqual([[{siteUrl:'https://school.example/moodle',provider:0}]]);
});
it('shows an unavailable reason and administrator next steps',async () => {
  const {connect} = await mount({kind:'unavailable',reason:'mobile-disabled'});
  await click('Chung Yuan');
  expect(document.querySelector('[role=alert]')?.textContent).toBe('The Moodle mobile service is disabled.Ask your administrator to enable the official Moodle mobile web service.');
  expect(document.querySelector('input[type=password]')).toBeNull();
  expect(document.querySelector('[aria-current=step]')?.textContent).toBe('2Check site');
  expect(connect.mock.calls).toEqual([]);
});
it('shows a typed authentication error and leaves credentials empty',async () => {
  const {api} = await mount();
  api.connect = async () => {throw new Error('VSTUDY_STATUS:{"code":"moodle.auth_invalidlogin"}');};
  await advance();
  const password = document.querySelector<HTMLInputElement>('[name=password]')!;
  password.value = 'secret';
  await act(async () => password.form!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(document.querySelector('[role=alert]')?.textContent).toBe('The username or password was not accepted. Try again.');
  expect(password.value).toBe('');
  expect(password.getAttribute('aria-invalid')).toBe('true');
  const error = document.getElementById(password.getAttribute('aria-describedby')!);
  expect(error?.getAttribute('role')).toBe('alert');
  expect(error?.textContent).toContain('not accepted');
});
it('ignores a completed check after the dialog closes',async () => {
  const {api} = await mount();let done!: (value: Awaited<ReturnType<typeof api.checkSite>>) => void;
  api.checkSite = () => new Promise(resolve => {done = resolve;});
  await click('Chung Yuan');
  expect(document.body.textContent).toContain('Checking your school…');
  await act(async () => root.render(<ConnectDialog open={false} onOpenChange={() => {}} api={api} onConnected={async () => {}} />));
  await act(async () => done({siteUrl:'https://school.example',siteName:'Late result',authPlan:{kind:'password'}}));
  expect(document.querySelector('[role=dialog]')).toBeNull();
});
it('shows the actual external mode and cancels the pending sign-in',async () => {
  const {api,connected} = await mount({kind:'browser',providers:[]});
  let reject!: (error:Error) => void;
  api.connect = () => new Promise((_resolve,fail) => {reject=fail;});
  api.ssoState = vi.fn(async () => 'external' as const);
  api.ssoCancel = vi.fn(async () => {reject(new Error('VSTUDY_STATUS:{"code":"moodle.auth_cancelled"}'));});
  await advance();await click('Sign in');
  expect(document.body.textContent).toContain('Waiting for your browser…');
  await click('Cancel sign-in');
  expect(api.ssoCancel).toHaveBeenCalledWith('https://school.example/moodle');
  expect(connected).not.toHaveBeenCalled();
  expect(document.querySelector('[role=alert]')?.textContent).toBe(i18n.t('moodle:auth_cancelled'));
});

it('waits for permission before sign-in without timing out',async () => {
  const {api,connect} = await mount({kind:'browser',providers:[]});
  let release!: (value:{ready:boolean}) => void;
  api.preflight = () => new Promise(resolve => {release=resolve;});
  await click('Chung Yuan');await click('Continue to sign in');
  expect(document.body.textContent).toContain(tr('moodle:keychain_waiting'));
  expect(document.body.textContent).toContain(tr('moodle:keychain_hint'));
  expect(connect).not.toHaveBeenCalled();
  expect([...document.querySelectorAll('button')].some(button => button.textContent === 'Sign in')).toBe(false);
  await act(async () => release({ready:true}));
  await click('Sign in');
  expect(connect).toHaveBeenCalledTimes(1);
});
it('offers retry and requires a session-only choice after unavailable permission',async () => {
  const {api,connect} = await mount({kind:'browser',providers:[]});
  api.preflight = vi.fn(async () => ({ready:false}));
  await advance();
  expect(document.body.textContent).toContain('Secure storage was denied or is unavailable');
  expect(connect).not.toHaveBeenCalled();
  await click('Retry secure storage');
  expect(api.preflight).toHaveBeenCalledTimes(2);
  await click('Use for this session only');await click('Sign in');
  expect(connect).toHaveBeenCalledWith({siteUrl:'https://school.example/moodle',storage:'session'});
});
it('keeps an unsaved connection open with a retry button',async () => {
  const {api,closed,connected} = await mount({kind:'browser',providers:[]});
  const original = api.connect;
  api.connect = async input => ({...await original(input),signInStorage:'unsaved'});
  api.retrySave = vi.fn(async () => {});
  await advance();await click('Sign in');
  expect(connected).toHaveBeenCalledTimes(1);
  expect(closed).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain('Could not save your sign-in securely');
  await click('Retry secure storage');
  expect(api.retrySave).toHaveBeenCalledTimes(1);
  expect(closed).toHaveBeenCalledWith(false);
});
it('offers an alternate SSO provider alongside a password form',async () => {
  const {connect}=await mount({kind:'password',providers:[{name:'Campus ID',iconurl:'',url:'https://school.example/auth/oauth2/login.php?id=9'}]});
  await advance();
  expect(document.querySelector('input[type=password]')).not.toBeNull();
  await click('Continue with Campus ID');
  expect(connect).toHaveBeenCalledWith({siteUrl:'https://school.example/moodle',provider:0});
});

it('associates an insecure URL error with the school combobox', async () => {
  const { fireEvent, getByRole } = await import('@testing-library/react');
  await mount();
  const input = getByRole(document.body, 'combobox');
  await act(async () => { fireEvent.change(input, { target: { value: 'http://school.example' } }); });
  expect(input.getAttribute('aria-invalid')).toBe('true');
  const ids = input.getAttribute('aria-describedby')!.split(' ');
  expect(ids.some(id => document.getElementById(id)?.getAttribute('role') === 'alert')).toBe(true);
});
