// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SchoolPicker } from './school-picker';
import { schools } from '../../main/moodle/schools';
import { i18n } from '../../shared/i18n';
import type { MoodleAccount } from '../../shared/moodle';
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
beforeEach(async () => {await i18n.changeLanguage('en');host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async () => {await act(async () => root.unmount());host.remove();});
async function mount(input='',accounts:MoodleAccount[]=[]) {
  const find=vi.fn(),change=vi.fn();
  await act(async () => root.render(<SchoolPicker schools={schools} recent={[{siteName:'CYCU recent',siteUrl:schools[0]!.host,authPlan:{kind:'password'}}]} accounts={accounts} input={input} onInput={change} onFind={find} busy={false} />));
  return {find,change};
}
it('keeps search local and selects a matching school with the keyboard',async () => {
  const {find}=await mount('Taiwan');
  expect(document.querySelectorAll('[role=option]')).toHaveLength(schools.filter(school => school.country === 'TW').length);
  expect(find).not.toHaveBeenCalled();
  const input=document.querySelector('[role=combobox]')!;
  await act(async () => input.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));
  expect(input.getAttribute('aria-activedescendant')).toBe('moodle-school-0');
  expect(document.querySelector('[role=option]')?.getAttribute('aria-selected')).toBe('true');
  await act(async () => input.closest('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(find).toHaveBeenCalledWith(schools[0]!.host);
});
it('deduplicates connected, recent, and bundled entries by site URL',async () => {
  await mount('',[{id:'11111111-1111-4111-a111-111111111111',siteUrl:schools[0]!.host,siteName:'My CYCU',remoteUserId:42,displayName:'Student',status:'connected',syncedAt:null}]);
  expect(document.querySelectorAll('[role=option]')).toHaveLength(schools.length);
  expect(document.querySelector('[role=option]')?.textContent).toContain('My CYCU');
  expect(document.querySelector('[role=group]')?.getAttribute('aria-label')).toBe('Connected schools');
});
it('offers URL entry when no bundled school matches and submits the entered address',async () => {
  const {find}=await mount('new-university.example/moodle');
  expect(document.querySelectorAll('[role=option]')).toHaveLength(0);
  expect(document.body.textContent).toContain('No matching schools');
  expect(document.body.textContent).toContain('Add by URL');
  await act(async () => document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(find).toHaveBeenCalledWith('new-university.example/moodle');
});
it('uses monograms without loading remote logos while searching',async () => {
  await mount();
  expect(document.querySelectorAll('img')).toHaveLength(0);
  expect(document.querySelectorAll('.moodle-school-monogram')).toHaveLength(schools.length);
});

it('puts Taiwan directory entries first in Traditional Chinese and sorts English names alphabetically',async () => {
  await i18n.changeLanguage('zh-Hant');
  await mount();
  const taiwan=schools.filter(school => school.country === 'TW');
  const options=document.querySelector('[role=group][aria-label="學校目錄"]')!.querySelectorAll('[role=option]');
  expect(Array.from(options).slice(0,taiwan.length-1).every(option => option.textContent?.includes('.edu.tw'))).toBe(true);
  await i18n.changeLanguage('en');
  await mount();
  const names=Array.from(document.querySelector('[role=group][aria-label="School directory"]')!.querySelectorAll('[role=option]')).map(option => option.querySelector('span:not(.moodle-school-monogram)')!.firstChild!.textContent ?? '');
  expect(names).toEqual([...names].sort(new Intl.Collator('en').compare));
});
