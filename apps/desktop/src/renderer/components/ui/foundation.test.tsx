// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Card, CardContent, CardHeader } from './card';
import { PageContainer, PageHeader, Section, Toolbar } from './page-layout';
import { FormField } from './form-field';
import { ListRow } from './list-row';
import { EmptyState } from './empty-state';
import { Stat } from './stat';
import { SegmentedControl, SegmentedControlItem, Tabs, TabsContent, SegmentedTabsList, SegmentedTabsTrigger } from './segmented-tabs';
afterEach(cleanup);
it('uses native card activation and preserves composition', () => {
  const click = vi.fn();
  render(<Card variant="interactive" onClick={click}><CardHeader>Open</CardHeader><CardContent>Details</CardContent></Card>);
  const button = screen.getByRole('button');
  expect(button.tagName).toBe('BUTTON');
  expect(button.getAttribute('type')).toBe('button');
  button.focus();
  expect(document.activeElement).toBe(button);
  fireEvent.click(button);
  expect(click).toHaveBeenCalledOnce();
});
it('renders card links and disables their navigation', () => {
  const { rerender } = render(<Card variant="interactive" href="#course">Course</Card>);
  expect(screen.getByRole('link').getAttribute('href')).toBe('#course');
  rerender(<Card variant="interactive" href="#course" disabled>Course</Card>);
  expect(screen.getByText('Course').getAttribute('href')).toBeNull();
  expect(screen.getByText('Course').getAttribute('aria-disabled')).toBe('true');
});
it('wires label, description, error and caller description to the control', () => {
  const { rerender } = render(<FormField label="Name" description="Hint" error="Required" describedBy="external">{props => <input {...props}/>}</FormField>);
  const control = screen.getByRole('textbox');
  expect(screen.getByLabelText('Name')).toBe(control);
  expect(control.getAttribute('aria-invalid')).toBe('true');
  expect(control.getAttribute('aria-describedby')?.split(' ').slice(1).map(id => document.getElementById(id)?.textContent)).toEqual(['Hint', 'Required']);
  rerender(<FormField label="Name">{props => <input {...props}/>}</FormField>);
  expect(control.hasAttribute('aria-invalid')).toBe(false);
  expect(control.hasAttribute('aria-describedby')).toBe(false);
});
it('keeps row actions separate and exposes selection on the native target', () => {
  render(<ListRow title="Course" subtitle="Notes" selected onClick={() => {}} actions={<button>More</button>}/>);
  expect(screen.getByRole('button', {name:/Course.*Notes/}).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('button', {name:'More'}).closest('.ui-row-target')).toBeNull();
});
it('keeps static rows static and marks selected links current', () => {
  const { rerender } = render(<ListRow title="Static"/>);
  expect(screen.queryByRole('button')).toBeNull();
  rerender(<ListRow title="Linked" href="#course" selected/>);
  expect(screen.getByRole('link').getAttribute('aria-current')).toBe('page');
});
it('labels sections and preserves page header and toolbar slots', () => {
  render(<PageContainer><PageHeader title="Library" description="Documents" leading={<a href="#">Back</a>} actions={<button>Import</button>} meta="Updated"/><Section title="Recent" count={0}><Toolbar left="Left" center="Center" right="Right"/></Section></PageContainer>);
  expect(screen.getByRole('heading', {level:1}).textContent).toBe('Library');
  expect(screen.getByRole('region', {name:/Recent.*0/})).toBeTruthy();
  expect(screen.getByText('Right')).toBeTruthy();
  expect(screen.queryByRole('main')).toBeNull();
  expect(document.querySelector('[data-slot=page-container]')?.tagName).toBe('DIV');
});
it('renders caller empty copy, action and stat units and delta', () => {
  render(<><EmptyState title="No files" description="Import one" action={<button>Import</button>}/><Stat label="Time" value={12} unit="min" delta="+2"/></>);
  expect(screen.getByRole('heading').textContent).toBe('No files');
  expect(screen.getByText('min').parentElement?.textContent).toBe('12 min');
  expect(screen.getByText('+2')).toBeTruthy();
});
it('exposes selected tabs and uses roving keyboard focus', async () => {
  render(<Tabs defaultValue="one"><SegmentedTabsList aria-label="Views"><SegmentedTabsTrigger value="one">One</SegmentedTabsTrigger><SegmentedTabsTrigger value="two">Two</SegmentedTabsTrigger><SegmentedTabsTrigger value="three" disabled>Three</SegmentedTabsTrigger></SegmentedTabsList><TabsContent value="one">First</TabsContent><TabsContent value="two">Second</TabsContent></Tabs>);
  expect(screen.getByRole('tab', {name:'One'}).getAttribute('aria-selected')).toBe('true');
  fireEvent.mouseDown(screen.getByRole('tab', {name:'Two'}), {button:0, ctrlKey:false});
  expect(screen.getByRole('tab', {name:'Two'}).getAttribute('aria-selected')).toBe('true');
  expect(screen.getByRole('tabpanel').textContent).toBe('Second');
  expect(screen.getByRole('tab', {name:'Three'}).hasAttribute('disabled')).toBe(true);
  screen.getByRole('tab', {name:'Two'}).focus();
  fireEvent.keyDown(screen.getByRole('tab', {name:'Two'}), {key:'ArrowRight'});
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('tab', {name:'One'})));
});

it('supports contextual empty-state heading levels', () => {
  const { rerender } = render(<EmptyState title="Empty" />);
  expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('Empty');
  for (const level of [2, 3, 4, 5, 6] as const) {
    rerender(<EmptyState title="Empty" headingLevel={level} />);
    expect(screen.getByRole('heading', { level }).textContent).toBe('Empty');
  }
});

it('does not describe ordinary row actions as toggles', () => {
  render(<ListRow title="Open notes" onClick={() => {}} />);
  expect(screen.getByRole('button', { name: 'Open notes' }).hasAttribute('aria-pressed')).toBe(false);
});

it('marks a current button without making it a toggle', () => {
  render(<ListRow title="Current" selected aria-current="page" onClick={() => {}} />);
  const row = screen.getByRole('button', { name: 'Current' });
  expect(row.getAttribute('aria-current')).toBe('page');
  expect(row.hasAttribute('aria-pressed')).toBe(false);
});

it('omits a page heading when no title is supplied', () => {
  render(<PageHeader title={undefined} actions={<button>Refresh</button>} />);
  expect(screen.queryByRole('heading')).toBeNull();
  expect(screen.getByRole('button', {name: 'Refresh'})).toBeTruthy();
});

it('selects a mode with the shared control and preserves disabled choices', () => {
  const change = vi.fn();
  render(<SegmentedControl type="single" defaultValue="files" onValueChange={change} aria-label="View">
    <SegmentedControlItem value="files">Files</SegmentedControlItem>
    <SegmentedControlItem value="folders">Folders</SegmentedControlItem>
    <SegmentedControlItem value="disabled" disabled>Unavailable</SegmentedControlItem>
  </SegmentedControl>);
  const folders = screen.getByRole('radio', { name: 'Folders' });
  fireEvent.click(folders);
  expect(change).toHaveBeenLastCalledWith('folders');
  expect(folders.getAttribute('aria-checked')).toBe('true');
  fireEvent.click(screen.getByRole('radio', { name: 'Unavailable' }));
  expect(change).toHaveBeenCalledTimes(1);
});
