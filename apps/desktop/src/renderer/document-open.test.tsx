// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { fireEvent, getByRole } from '@testing-library/dom';
import { afterEach, expect, it, vi } from 'vitest';
import { defaultSettings, documentIdSchema, settingsSchema, settingsPatchSchema } from '../shared/domain';
import { desktop } from './bridge';
import { CourseFileActions, openDocument, performDocumentAction } from './document-open';
import { ProviderSettings } from './providers';
import { DocumentSettings } from './settings/documents';
import { i18n } from '../shared/i18n';
vi.mock('./bridge', () => ({desktop:{invoke:vi.fn()}}));
HTMLElement.prototype.scrollIntoView = vi.fn();
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.resetAllMocks());
const id = documentIdSchema.parse('00000000-0000-4000-8000-000000000001');

it('migrates old settings to reader mode and rejects unknown methods', () => {
  const legacy = {...defaultSettings, documentOpenMethod:undefined};
  expect(settingsSchema.parse(legacy).documentOpenMethod).toBe('reader');
  expect(settingsPatchSchema.safeParse({documentOpenMethod:'shell'}).success).toBe(false);
});

it('honors the default and lets an explicit reader choice override original mode', async () => {
  vi.mocked(desktop.invoke).mockResolvedValue({...defaultSettings,documentOpenMethod:'original'});
  const read = vi.fn();
  await openDocument(id,read);
  expect(desktop.invoke).toHaveBeenCalledWith('library:openOriginal',{documentId:id});
  expect(read).not.toHaveBeenCalled();
  vi.mocked(desktop.invoke).mockClear();
  await openDocument(id,read,'reader');
  expect(read).toHaveBeenCalledOnce();
  expect(desktop.invoke).not.toHaveBeenCalled();
  vi.mocked(desktop.invoke).mockRejectedValueOnce(new Error('Missing original'));
  await expect(openDocument(id,read,'original')).rejects.toThrow('Missing original');
});

it('offers open, download and save in the course dialog, with a switchable method', async () => {
  await i18n.changeLanguage('en');
  vi.mocked(desktop.invoke).mockResolvedValue({...defaultSettings,documentOpenMethod:'original'});
  const action = vi.fn(async () => 'saved' as const);
  const host=document.createElement('div'); document.body.append(host); const root=createRoot(host);
  try {
    await act(async () => root.render(<CourseFileActions name="Lecture.pdf" disabled={false} onAction={action}/>));
    const method = getByRole(host,'combobox');
    expect(method.textContent).toContain('Original file in system app');
    expect(host.textContent).toContain('Open as');
    expect(getByRole(host,'button',{name:'Open'}).getAttribute('data-variant')).toBe('default');
    expect(getByRole(host,'button',{name:'Download a copy…'}).getAttribute('data-variant')).toBe('outline');
    await act(async () => fireEvent.click(getByRole(host,'button',{name:'Open'})));
    expect(action).toHaveBeenLastCalledWith({kind:'open',method:'original'});
    await chooseMethod(method, 'VStudy reader');
    expect(method.textContent).toContain('VStudy reader');
    await act(async () => fireEvent.click(getByRole(host,'button',{name:'Open'})));
    expect(action).toHaveBeenLastCalledWith({kind:'open',method:'reader'});
    await act(async () => fireEvent.click(getByRole(host,'button',{name:'Download a copy…'})));
    expect(action).toHaveBeenLastCalledWith({kind:'download'});
    await act(async () => fireEvent.click(getByRole(host,'button',{name:'Save to document library'})));
    expect(action).toHaveBeenLastCalledWith({kind:'save'});
    expect(getByRole(host,'status').textContent).toBe('Saved to document library');
    expect(desktop.invoke).not.toHaveBeenCalledWith('settings:set',expect.anything());
  } finally {await act(async () => root.unmount()); host.remove();}
});

it('persists the default using existing settings and reports write failures', async () => {
  await i18n.changeLanguage('en');
  vi.mocked(desktop.invoke).mockImplementation(async (channel,request) => channel === 'settings:set' ? request : {...defaultSettings,displayName:'Student'});
  const host=document.createElement('div'); document.body.append(host); const root=createRoot(host);
  try {
    await act(async () => root.render(<DocumentSettings/>));
    expect(host.textContent).not.toContain("Original files open in your system’s default app");
    await chooseMethod(getByRole(host,'combobox'), 'Original file in system app');
    expect(desktop.invoke).toHaveBeenCalledWith('settings:set',expect.objectContaining({displayName:'Student',documentOpenMethod:'original'}));
    expect(getByRole(host,'combobox').textContent).toContain('Original file in system app');
    expect(host.textContent).toContain("Original files open in your system’s default app");
    await chooseMethod(getByRole(host,'combobox'), 'VStudy reader');
    expect(host.textContent).not.toContain("Original files open in your system’s default app");
    await chooseMethod(getByRole(host,'combobox'), 'Original file in system app');
    vi.mocked(desktop.invoke).mockRejectedValueOnce(new Error('Disk full'));
    await chooseMethod(getByRole(host,'combobox'), 'VStudy reader');
    expect(getByRole(host,'alert').textContent).toBeTruthy();
    expect(getByRole(host,'combobox').textContent).toContain('Original file in system app');
  } finally {await act(async () => root.unmount()); host.remove();}
});

it('saves without navigating and exports a copy through the native save dialog IPC', async () => {
  const read = vi.fn();
  expect(await performDocumentAction(id,read,{kind:'save'})).toBe('saved');
  expect(read).not.toHaveBeenCalled();
  expect(desktop.invoke).not.toHaveBeenCalled();
  vi.mocked(desktop.invoke).mockResolvedValueOnce({saved:true});
  expect(await performDocumentAction(id,read,{kind:'download'})).toBe('downloaded');
  expect(desktop.invoke).toHaveBeenLastCalledWith('library:exportOriginal',{documentId:id});
  expect(read).not.toHaveBeenCalled();
  vi.mocked(desktop.invoke).mockResolvedValueOnce({saved:false});
  expect(await performDocumentAction(id,read,{kind:'download'})).toBe('cancelled');
});

async function chooseMethod(trigger: HTMLElement, name: string) {
  await act(async () => fireEvent.keyDown(trigger, {key:'Enter'}));
  await act(async () => fireEvent.click(getByRole(document.body,'option',{name})));
}

it('places the document default in General under Documents', async () => {
  await i18n.changeLanguage('en');
  vi.mocked(desktop.invoke).mockImplementation(async channel => channel === 'updates:state'
    ? {state:{status:'idle'},currentVersion:'0.4.4',lastCheckedAt:null,automatic:true}
    : defaultSettings);
  const host=document.createElement('div'); document.body.append(host); const root=createRoot(host);
  try {
    await act(async () => root.render(<ProviderSettings providers={[]} onClose={() => {}} onRefresh={async () => {}} />));
    const documents = getByRole(document.body,'heading',{name:'Documents'}).closest('section')!;
    expect(getByRole(document.body,'tab',{name:'General'}).getAttribute('aria-selected')).toBe('true');
    expect(getByRole(documents,'combobox').textContent).toContain('VStudy reader');
    expect(documents.textContent).toContain('Open documents by default');
    expect(host.textContent).not.toContain('VStudy reader (Markdown)');
  } finally {await act(async () => root.unmount()); host.remove();}
});
