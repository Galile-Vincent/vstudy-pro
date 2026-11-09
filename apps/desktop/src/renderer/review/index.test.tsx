// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { i18n } from '../../shared/i18n';
import en from '../../shared/locales/en/review.json';
import { ReviewView } from './index';
const { invoke, navigate, nav, moodleListeners, realPlayer } = vi.hoisted(() => ({ invoke: vi.fn(), navigate: vi.fn(), realPlayer: { enabled: false }, nav: { route: { view: 'review' } as { view: string; courseId?: string } }, moodleListeners: [] as Array<(event: { state: string }) => void> }));
vi.mock('../bridge', () => ({ desktop: { invoke, onMoodleProgress: (listener: (event: { state: string }) => void) => { moodleListeners.push(listener); return () => { moodleListeners.splice(moodleListeners.indexOf(listener), 1); }; } } }));
vi.mock('../shell', () => ({ useNavigate: () => ({ navigate, route: nav.route }) }));
vi.mock('./test-player', async importOriginal => {
  const actual = await importOriginal<typeof import('./test-player')>();
  return { TestPlayer: (props: Parameters<typeof actual.TestPlayer>[0]) => realPlayer.enabled
    ? <actual.TestPlayer {...props} />
    : <button onClick={props.onConfirmed}>Confirm fixture session</button> };
});
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const course = (n: number, title: string) => ({ id: uuid(n), title, aliases: [], moodleCourseId: null, createdAt: `2026-11-0${n}T00:00:00.000Z`, archivedAt: null });
const concept = (n: number, state: string) => ({ id: uuid(100 + n), courseId: uuid(1), key: `k${n}`, label: `Concept ${n}`, source: 'heading', unitId: null, userState: 'none', note: null, createdAt: `2026-11-0${n}T00:00:00.000Z`, mastery: { state, risk: 0, negative: 0, positive: 0, episodeCount: 0, nextReviewAt: null } });
type Fixture = { courses: ReturnType<typeof course>[]; masteryPages: Array<ReturnType<typeof concept>[]>; jobs: Array<Record<string, unknown>>; moodle: unknown; prefs: Record<string, unknown> };
let state: Fixture;
function fixture(patch: Partial<Fixture> = {}) {
  state = { courses: [course(1, 'Calculus')], masteryPages: [[concept(1, 'needs_review')]], jobs: [{ id: uuid(50), conversationId: uuid(60), userMessageId: uuid(61), courseId: uuid(1), status: 'succeeded', errorCode: null, questionSummary: 'Why does the chain rule work?', occurredAt: '2026-11-06T00:00:00.000Z' }],
    moodle: { courses: [] }, prefs: { memoryEnabled: true, noticeAcknowledged: false, consentAcknowledged: true, timeZone: 'UTC' }, ...patch };
  invoke.mockImplementation(async (channel: string, input: { cursor?: { id: string }; scope?: { kind: string; conceptKeys?: string[] } }) => {
    if (channel === 'review:scope:preview') { const keys = input.scope?.kind === 'weak' ? state.masteryPages.flat().filter(c => c.mastery.state === 'needs_review').map(c => c.key) : input.scope?.conceptKeys ?? []; return { conceptKeys: keys.slice(0, 100), totalConcepts: keys.length, omittedConcepts: Math.max(0, keys.length - 100) }; }
    if (channel === 'providers:list' || channel === 'documents:list') return [];
    if (channel === 'settings:get') return {};
    if (channel === 'review:prefs:get') return state.prefs;
    if (channel === 'review:courses:list') return { items: state.courses, nextCursor: null };
    if (channel === 'review:jobs:page') return { items: state.jobs, nextCursor: null };
    if (channel === 'review:courses:mastery') { const index = input.cursor ? Number(input.cursor.id.slice(-1)) : 0; return { items: state.masteryPages[index] ?? [], nextCursor: index + 1 < state.masteryPages.length ? { at: '2026-11-01T00:00:00.000Z', id: uuid(index + 1) } : null }; }
    if (channel === 'review:courses:units') return { items: [{ id: uuid(80), title: 'Differentiation' }], nextCursor: null };
    if (channel === 'review:observations:page') return { items: [{ id: uuid(70), jobId: uuid(50), unitId: uuid(80), conceptKey: 'k1', conversationId: uuid(60), userMessageId: uuid(61), weaknessNote: null, evidenceQuote: 'I confuse the inner derivative' }], nextCursor: null };
    if (channel === 'moodle:overview') { if (state.moodle instanceof Error) throw state.moodle; return state.moodle; }
    if (channel === 'review:courses:materialize') { const created = course(2, 'Biology'); state.courses = [created, ...state.courses]; return created; }
    return { items: [], nextCursor: null };
  });
}
beforeEach(async () => { realPlayer.enabled = false; await i18n.changeLanguage('en'); localStorage.clear(); nav.route = { view: 'review' }; fixture(); });
afterEach(() => { cleanup(); vi.resetAllMocks(); moodleListeners.length = 0; });
const picker = () => screen.findByLabelText(en.course_picker) as Promise<HTMLSelectElement>;
it('opens on the first course and shows a question on day one, then opens its exact evidence in History', async () => {
  render(<ReviewView />);
  fireEvent.mouseDown(await screen.findByRole('tab', { name: en.recent }), { button: 0, ctrlKey: false });
  fireEvent.click(await screen.findByText('Why does the chain rule work?'));
  expect(navigate).toHaveBeenCalledWith({ view: 'history', conversationId: uuid(60), messageId: uuid(61) });
});
it('lands on the weak list when the course has one and on recent questions when it does not', async () => {
  render(<ReviewView />);
  expect((await screen.findByRole('tab', { name: en.weak })).getAttribute('aria-selected')).toBe('true');
  expect(await screen.findByText('Concept 1')).toBeTruthy();
  cleanup(); fixture({ masteryPages: [[concept(1, 'watching')]] });
  render(<ReviewView />);
  await waitFor(() => expect(screen.getByRole('tab', { name: en.recent }).getAttribute('aria-selected')).toBe('true'));
});
it('finds weak concepts on later pages instead of saying nothing needs review', async () => {
  fixture({ masteryPages: [[concept(1, 'watching'), concept(2, 'dismissed')], [concept(3, 'needs_review'), concept(4, 'needs_review')]] });
  render(<ReviewView />);
  expect(await screen.findByText('Concept 3')).toBeTruthy();
  expect(screen.getByText('Concept 4')).toBeTruthy();
  expect(screen.queryByText(en.weak_empty)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: en.today }));
  await waitFor(() => expect((within(screen.getByRole('tabpanel', { name: en.tests })).getByLabelText(en.scope_kind) as HTMLSelectElement).value).toBe('weak'));
  expect(invoke).toHaveBeenCalledWith('review:scope:preview', { courseId: uuid(1), scope: { kind: 'weak' } });
});
it('says nothing needs review only after every page has been read', async () => {
  fixture({ masteryPages: [[concept(1, 'watching')], [concept(2, 'candidate')]] });
  const healthy = invoke.getMockImplementation()!;
  let releaseLastPage!: () => void;
  const lastPage = new Promise<void>(resolve => { releaseLastPage = resolve; });
  invoke.mockImplementation(async (channel: string, input: { cursor?: { id: string }; scope?: { kind: string; conceptKeys?: string[] } }) => {
    if (channel === 'review:courses:mastery' && input.cursor) await lastPage;
    return healthy(channel, input);
  });
  render(<ReviewView />);
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('review:courses:mastery', expect.objectContaining({ cursor: expect.anything() })));
  expect(screen.queryByText(en.weak_empty)).toBeNull();
  await act(async () => { releaseLastPage(); });
  // Empty results automatically select Recent. Let that settle before selecting Weak.
  await waitFor(() => expect(screen.getByRole('tab', { name: en.recent }).getAttribute('aria-selected')).toBe('true'));
  fireEvent.mouseDown(screen.getByRole('tab', { name: en.weak }), { button: 0, ctrlKey: false });
  expect(await screen.findByText(en.weak_empty)).toBeTruthy();
  expect(invoke.mock.calls.filter(([channel]) => channel === 'review:courses:mastery')).toHaveLength(2);
  expect(screen.queryByRole('button', { name: en.load_more })).toBeNull();
});
it('remembers the course across a visit to History and honours a course in the route', async () => {
  fixture({ courses: [course(2, 'Biology'), course(1, 'Calculus')] });
  const first = render(<ReviewView />);
  fireEvent.change(await picker(), { target: { value: uuid(1) } });
  first.unmount();
  render(<ReviewView />);
  await waitFor(async () => expect((await picker()).value).toBe(uuid(1)));
  cleanup(); nav.route = { view: 'review', courseId: uuid(2) };
  render(<ReviewView />);
  await waitFor(async () => expect((await picker()).value).toBe(uuid(2)));
});
it('lets students mark understanding, preselect a concept for notes and keeps focus in the list', async () => {
  fixture({ masteryPages: [[concept(2, 'needs_review'), concept(1, 'needs_review')]] });
  render(<ReviewView />);
  const rows = await screen.findAllByRole('heading', { level: 3 });
  expect(rows.map(row => row.textContent)).toEqual(['Concept 1', 'Concept 2']);
  fireEvent.keyDown(within(rows[0]!.closest('li')!).getByRole('button', { name: 'Actions for Concept 1' }), { key: 'Enter' });
  fireEvent.click(await screen.findByRole('menuitem', { name: en.make_note }));
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: en.notes })));
  expect(await screen.findByRole('checkbox', { name: 'Concept 1' })).toBeTruthy();
  fireEvent.mouseDown(screen.getByRole('tab', { name: en.weak }), { button: 0, ctrlKey: false });
  const first = (await screen.findAllByRole('heading', { level: 3 }))[1]!.closest('li')!;
  state.masteryPages = [[concept(1, 'needs_review')]];
  fireEvent.click(within(first).getByRole('button', { name: en.understood }));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('review:concepts:understood', { conceptId: uuid(102) }));
  await waitFor(() => expect(screen.queryByText('Concept 2')).toBeNull());
  await waitFor(() => expect(document.activeElement?.closest('li')?.textContent).toContain('Concept 1'));
});
it('recovers a failed load through a labelled retry', async () => {
  const healthy = invoke.getMockImplementation()!;
  let down = true;
  invoke.mockImplementation(async (channel: string, input: never) => { if (down && channel === 'review:courses:list') throw new Error('offline'); return healthy(channel, input); });
  render(<ReviewView />);
  const alert = await screen.findByRole('alert'); down = false;
  fireEvent.click(within(alert).getByRole('button', { name: en.retry }));
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  expect(await screen.findByText('Concept 1')).toBeTruthy();
});
it('edits summaries without changing the conversation', async () => {
  render(<ReviewView />); fireEvent.mouseDown(await screen.findByRole('tab', { name: en.recent }), { button: 0, ctrlKey: false });
  fireEvent.click(await screen.findByRole('button', { name: en.edit }));
  fireEvent.change(screen.getByLabelText(en.summary), { target: { value: 'Corrected question' } });
  fireEvent.click(screen.getByRole('button', { name: en.save }));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('review:jobs:edit', { jobId: uuid(50), changes: { questionSummary: 'Corrected question' } }));
});
it('shows the related course and unit beside each summary', async () => {
  render(<ReviewView />); fireEvent.mouseDown(await screen.findByRole('tab', { name: en.recent }), { button: 0, ctrlKey: false });
  const panel = await screen.findByRole('tabpanel', { name: en.recent });
  expect(await within(panel).findByText('Differentiation')).toBeTruthy();
  expect(within(panel).getAllByText('Calculus').length).toBeGreaterThan(0);
});
it('sorts Moodle courses automatically on day one and keeps manual creation as the other path', async () => {
  fixture({ courses: [], moodle: { courses: [{ id: uuid(901), fullName: 'Biology', endAt: null }, { id: uuid(902), fullName: 'Old course', endAt: '2020-01-01T00:00:00.000Z' }] } });
  render(<ReviewView />);
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('review:courses:materialize', { moodleCourseId: uuid(901) }));
  expect(invoke).not.toHaveBeenCalledWith('review:courses:materialize', { moodleCourseId: uuid(902) });
  await waitFor(async () => expect((await picker()).textContent).toContain('Biology'));
  expect(screen.getByLabelText(en.course_title)).toBeTruthy();
});
it('opens course management on an empty state and ignores a student without Moodle', async () => {
  fixture({ courses: [], moodle: new Error('no account') });
  render(<ReviewView />);
  const summary = await screen.findByText(en.manage_courses);
  await waitFor(() => expect(summary.closest('details')!.open).toBe(true));
  expect(screen.queryByText(en.error)).toBeNull();
  expect(invoke).not.toHaveBeenCalledWith('review:courses:materialize', expect.anything());
});
it('looks for new Moodle courses again when Moodle finishes syncing', async () => {
  render(<ReviewView />);
  await waitFor(() => expect(moodleListeners).toHaveLength(1));
  const calls = () => invoke.mock.calls.filter(([channel]) => channel === 'moodle:overview').length;
  const before = calls();
  state.moodle = { courses: [{ id: uuid(903), fullName: 'Chemistry', endAt: null }] };
  act(() => moodleListeners[0]!({ state: 'loading' }));
  expect(calls()).toBe(before);
  act(() => moodleListeners[0]!({ state: 'idle' }));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('review:courses:materialize', { moodleCourseId: uuid(903) }));
});
it('retries a failed recording through review:jobs:retry', async () => {
  fixture({ jobs: [{ id: uuid(51), conversationId: uuid(60), userMessageId: uuid(61), courseId: uuid(1), status: 'failed', errorCode: 'extraction', questionSummary: null, occurredAt: '2026-11-06T00:00:00.000Z' }] });
  render(<ReviewView />); fireEvent.mouseDown(await screen.findByRole('tab', { name: en.recent }), { button: 0, ctrlKey: false });
  const retry = await within(await screen.findByRole('tabpanel', { name: en.recent })).findByRole('button', { name: en.retry });
  expect((retry as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(retry);
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('review:jobs:retry', { jobId: uuid(51) }));
});
it('explains budget-paused recording and offers one retry for the paused questions', async () => {
  fixture({ jobs: [51, 52].map(n => ({ id: uuid(n), conversationId: uuid(60), userMessageId: uuid(61), courseId: uuid(1), status: 'pending', errorCode: 'budget', questionSummary: null, occurredAt: '2026-11-06T00:00:00.000Z' })) });
  render(<ReviewView />); fireEvent.mouseDown(await screen.findByRole('tab', { name: en.recent }), { button: 0, ctrlKey: false });
  const banner = (await screen.findByText(en.budget)).closest('[role=status]') as HTMLElement;
  fireEvent.click(within(banner).getByRole('button', { name: en.retry }));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('review:jobs:retry', { jobId: uuid(51) }));
  expect(invoke).toHaveBeenCalledWith('review:jobs:retry', { jobId: uuid(52) });
});
it('says so when the device is offline', async () => {
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  render(<ReviewView />);
  expect(await screen.findByText(en.offline)).toBeTruthy();
  online.mockReturnValue(true); act(() => { window.dispatchEvent(new Event('online')); });
  await waitFor(() => expect(screen.queryByText(en.offline)).toBeNull());
  online.mockRestore();
});
it('asks for consent at the top of the page before memory records anything', async () => {
  fixture({ prefs: { memoryEnabled: true, noticeAcknowledged: false, consentAcknowledged: false, timeZone: 'UTC' } });
  sessionStorage.clear();
  render(<ReviewView />);
  expect(await screen.findByText(en.memory_disclosure)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: en.consent_turn_on }));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('review:prefs:set', { memoryEnabled: true, consentAcknowledged: true }));
});

it.each([[101, 'en'], [120, 'en'], [101, 'ja'], [120, 'ja'], [101, 'zh-Hant'], [120, 'zh-Hant']] as const)('bounds %i concepts in %s and clears the line on a new scope', async (count, language) => {
  await i18n.changeLanguage(language);
  const names = { today: i18n.t('review:today'), tests: i18n.t('review:tests'), scope: i18n.t('review:scope_kind'), generate: i18n.t('review:generate_test') };
  const all = Array.from({ length: count }, (_, i) => concept(i + 1, 'needs_review'));
  fixture({ masteryPages: [all.slice(0, 100), all.slice(100)] });
  const respond = invoke.getMockImplementation()!;
  invoke.mockImplementation(async (channel: string, input: never) => {
    if (channel === 'providers:list') return [{ config: { id: 'p', enabled: true },
      availability: { available: true }, models: [{ id: 'm', name: 'Model' }] }];
    return respond(channel, input);
  });
  render(<ReviewView />);
  await screen.findByText(`Concept ${count}`);
  fireEvent.click(screen.getByRole('button', { name: names.today }));
  await screen.findByRole('tabpanel', { name: names.tests });
  const message = i18n.t('review:bounded_session', { count: count - 100, selected: 100, total: count });
  const live = await screen.findByText(message);
  expect(live.getAttribute('aria-live')).toBe('polite');
  expect(screen.getAllByText(message)).toHaveLength(1);
  expect((within(screen.getByRole('tabpanel', { name: names.tests })).getByLabelText(names.scope) as HTMLSelectElement).value).toBe('weak');
  await waitFor(() => expect((screen.getByRole('button', { name: names.generate }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.change(within(screen.getByRole('tabpanel', { name: names.tests })).getByLabelText(names.scope), { target: { value: 'concepts' } });
  await waitFor(() => expect(screen.queryByText(message)).toBeNull());
});

it('refreshes parent mastery after confirming a session', async () => {
  const respond = invoke.getMockImplementation()!;
  invoke.mockImplementation(async (channel: string, input: never) => {
    if (channel === 'review:artifact:list') return { items: [{ id: 'saved', kind: 'test',
      title: 'Saved test', status: 'ready', createdAt: '2026-11-06T00:00:00Z' }], nextCursor: null };
    if (channel === 'review:artifact:get') return { id: 'saved', kind: 'test', title: 'Saved test',
      status: 'ready', courseId: uuid(1), resolvedScope: { unitIds: [], documentIds: [],
        assumptions: [], sources: [] } };
    return respond(channel, input);
  });
  render(<ReviewView />);
  await screen.findByText('Concept 1');
  fireEvent.mouseDown(screen.getByRole('tab', { name: en.tests }), { button: 0 });
  fireEvent.click(await screen.findByRole('button', { name: 'Saved test' }));
  state.masteryPages = [[]];
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm fixture session' }));
  fireEvent.mouseDown(screen.getByRole('tab', { name: en.weak }), { button: 0 });
  expect(await screen.findByText(en.weak_empty)).toBeTruthy();
  expect(screen.queryByText('Concept 1')).toBeNull();
});

it('associates segmented tabs with their panels and supports arrow navigation', async () => {
  render(<ReviewView />);
  await screen.findByText('Concept 1');
  const weak = screen.getByRole('tab', { name: en.weak });
  weak.focus();
  fireEvent.keyDown(weak, { key: 'ArrowRight' });
  const notes = screen.getByRole('tab', { name: en.notes });
  await waitFor(() => expect(document.activeElement).toBe(notes));
  expect(notes.getAttribute('aria-selected')).toBe('true');
  const panel = screen.getByRole('tabpanel', { name: en.notes });
  expect(notes.getAttribute('aria-controls')).toBe(panel.id);
  expect(panel.getAttribute('aria-labelledby')).toBe(notes.id);
});

it('focuses rename after the menu closes and restores the trigger on Escape', async () => {
  render(<ReviewView />);
  const trigger = await screen.findByRole('button', { name: 'Actions for Concept 1' });
  fireEvent.keyDown(trigger, { key: 'Enter' });
  fireEvent.click(await screen.findByRole('menuitem', { name: en.rename }));
  const input = await screen.findByLabelText(en.rename);
  await waitFor(() => expect(document.activeElement).toBe(input));
  fireEvent.keyDown(input, { key: 'Escape' });
  await waitFor(() => expect(document.activeElement).toBe(trigger));
});

it.each(['today', 'make_test'] as const)('moves focus after %s opens Tests', async action => {
  render(<ReviewView />);
  const button = await screen.findByRole('button', { name: en[action] });
  button.focus();
  fireEvent.click(button);
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: en.tests })));
});

it('removes refreshed understood concepts from the next generation scope', async () => {
  render(<ReviewView />);
  fireEvent.click(await screen.findByRole('button', { name: en.make_test }));
  expect((await screen.findByRole('checkbox', { name: 'Concept 1' }) as HTMLInputElement).checked).toBe(true);
  fireEvent.mouseDown(screen.getByRole('tab', { name: en.weak }), { button: 0 });
  state.masteryPages = [[]];
  fireEvent.click(await screen.findByRole('button', { name: en.understood }));
  await screen.findByText(en.weak_empty);
  fireEvent.mouseDown(screen.getByRole('tab', { name: en.tests }), { button: 0 });
  expect(screen.queryByRole('checkbox', { name: 'Concept 1' })).toBeNull();
});

it('restores menu focus after saving a rename with Enter', async () => {
  render(<ReviewView />);
  const trigger = await screen.findByRole('button', { name: 'Actions for Concept 1' });
  fireEvent.keyDown(trigger, { key: 'Enter' });
  fireEvent.click(await screen.findByRole('menuitem', { name: en.rename }));
  const input = await screen.findByLabelText(en.rename);
  fireEvent.change(input, { target: { value: 'Renamed' } });
  fireEvent.submit(input.closest('form')!);
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('review:concepts:edit', { conceptId: uuid(101), changes: { label: 'Renamed' } }));
  await waitFor(() => expect(document.activeElement).toBe(trigger));
});
it('focuses the surviving row after dismissing from the menu', async () => {
  fixture({ masteryPages: [[concept(1, 'needs_review'), concept(2, 'needs_review')]] });
  render(<ReviewView />);
  fireEvent.keyDown(await screen.findByRole('button', { name: 'Actions for Concept 1' }), { key: 'Enter' });
  state.masteryPages = [[concept(2, 'needs_review')]];
  fireEvent.click(await screen.findByRole('menuitem', { name: en.dismiss }));
  await waitFor(() => expect(screen.queryByText('Concept 1')).toBeNull());
  await waitFor(() => expect(document.activeElement?.closest('li')?.textContent).toContain('Concept 2'));
});
it.each(['recent', 'weak', 'notes', 'tests'] as const)('associates the %s tab and panel', async tab => {
  render(<ReviewView />);
  await screen.findByText('Concept 1');
  const trigger = screen.getByRole('tab', { name: en[tab] });
  fireEvent.mouseDown(trigger, { button: 0 });
  const panel = await screen.findByRole('tabpanel', { name: en[tab] });
  expect(panel.id).toBe(trigger.getAttribute('aria-controls'));
  expect(panel.getAttribute('aria-labelledby')).toBe(trigger.id);
});

it('confirms through the real player, refreshes selection and retains focus', async () => {
  realPlayer.enabled = true;
  const respond = invoke.getMockImplementation()!;
  const item = { id: 'q', conceptKey: 'k1', type: 'true_false', stem: 'Question', answer: true,
    explanation: 'Explanation', source: { documentId: uuid(90), version: 'original', excerptHash: 'a'.repeat(64), quote: 'Source' } };
  const artifact = { id: uuid(91), kind: 'test', title: 'Real session', status: 'ready',
    courseId: uuid(1), createdAt: '2026-11-06T00:00:00Z', test: { version: 1, items: [item] },
    resolvedScope: { unitIds: [], documentIds: [], assumptions: [], sources: [] } };
  const attempt = { id: uuid(92), phase: 'graded', answers: { q: true },
    results: [{ itemId: 'q', conceptKey: 'k1', correct: true, reportedBad: false, feedback: item }] };
  invoke.mockImplementation(async (channel: string, input: never) => {
    if (channel === 'review:artifact:list') return { items: [artifact], nextCursor: null };
    if (channel === 'review:artifact:get') return artifact;
    if (channel === 'review:attempt:start' || channel === 'review:attempt:get') return attempt;
    if (channel === 'review:attempt:confirm') { state.masteryPages = [[]]; return { ...attempt, phase: 'confirmed' }; }
    return respond(channel, input);
  });
  render(<ReviewView />);
  fireEvent.click(await screen.findByRole('button', { name: en.make_test }));
  fireEvent.click(await screen.findByRole('button', { name: 'Real session' }));
  fireEvent.click(await screen.findByRole('button', { name: en.view_results }));
  const confirm = await screen.findByRole('button', { name: en.update_review_list });
  confirm.focus(); fireEvent.click(confirm);
  await screen.findByText(en.review_list_updated);
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: en.tests })));
  expect(screen.queryByRole('checkbox', { name: 'Concept 1' })).toBeNull();
});
