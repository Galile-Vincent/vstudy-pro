/**
 * Verify filtering against the pinned browser xterm parser in Node without opening a GUI.
 * Private parser and link-service access bypasses DOM rendering and public write scheduling.
 * These tests prove parser effects, not renderer integration or link activation behavior.
 * @packageDocumentation
 */
import { createRequire } from 'node:module';
import type { Terminal as XtermTerminal } from '@xterm/xterm';
import { expect, it, vi } from 'vitest';
import { TerminalText } from './pty';
import { chunked, doubleEscapeAttack, hostileStream, oscPayloads, stringIntroducers, terminators } from './terminal-text-fixtures';

const require = createRequire(import.meta.url);
const { Terminal }: typeof import('@xterm/xterm') = require('@xterm/xterm');

interface ParserTerminal extends XtermTerminal {
  _core: {
    _inputHandler: { parse(data: string): void | Promise<boolean> };
    _oscLinkService: {
      registerLink(data: { id?: string; uri: string }): number;
      _dataByLinkId: Map<number, { data: { uri: string } }>;
    };
  };
}

function terminal() {
  const term = new Terminal() as ParserTerminal;
  const titles: string[] = [];
  const osc: { id: number; data: string }[] = [], dcs: string[] = [];
  term.onTitleChange(title => titles.push(title));
  for (const id of [0, 1, 2, 8, 52, 1337]) {
    term.parser.registerOscHandler(id, data => { osc.push({ id, data }); return false; });
  }
  term.parser.registerDcsHandler({ intermediates: '$', final: 'q' }, data => { dcs.push(data); return false; });
  const registrations = vi.spyOn(term._core._oscLinkService, 'registerLink');
  return {
    term, titles, registrations, osc, dcs,
    parse: (data: string) => expect(term._core._inputHandler.parse(data)).toBeUndefined(),
    links: () => [...term._core._oscLinkService._dataByLinkId.values()].map(link => link.data.uri),
    dispose: () => { registrations.mockRestore(); term.dispose(); },
  };
}

it('uses the real pinned xterm 6.0.0 parser and reproduces the unfiltered double-ESC exploit', () => {
  expect(require('@xterm/xterm/package.json').version).toBe('6.0.0');
  const observed = terminal();
  try {
    observed.parse(doubleEscapeAttack);
    expect(observed.titles).toEqual(['INJECTED TITLE']);
    expect(observed.registrations).toHaveBeenCalledWith({ id: undefined, uri: 'https://evil.example/' });
    expect(observed.links()).toEqual(['https://evil.example/']);
  } finally { observed.dispose(); }
});

it('blocks the reviewer double-ESC title and hidden-link exploit after filtering', () => {
  const observed = terminal();
  try {
    observed.parse(new TerminalText().filter(doubleEscapeAttack));
    expect(observed.titles).toEqual([]);
    expect(observed.registrations).not.toHaveBeenCalled();
    expect(observed.links()).toEqual([]);
    expect(observed.osc).toEqual([]);
    expect(observed.term.buffer.active.getLine(0)?.translateToString(true)).toBe('https://accounts.google.com');
  } finally { observed.dispose(); }
});

it('observes C1 title and hyperlink effects and DCS dispatch without a renderer', () => {
  const observed = terminal();
  try {
    observed.parse('\x9d0;C1 TITLE\x9c\x9d8;;https://evil.example/\x9clabel\x9d8;;\x9c\x90$qm\x9c');
    expect(observed.titles).toEqual(['C1 TITLE']);
    expect(observed.osc.map(event => event.id)).toEqual([0, 8, 8]);
    expect(observed.registrations).toHaveBeenCalledOnce();
    expect(observed.links()).toEqual(['https://evil.example/']);
    expect(observed.dcs).toEqual(['m']);
  } finally { observed.dispose(); }
});

function expectInert(chunks: readonly string[]) {
  const observed = terminal(), filter = new TerminalText();
  try {
    for (const chunk of chunks) observed.parse(filter.filter(chunk));
    expect(observed.titles).toEqual([]);
    expect(observed.registrations).not.toHaveBeenCalled();
    expect(observed.links()).toEqual([]);
    expect(observed.osc).toEqual([]);
    expect(observed.dcs).toEqual([]);
  } finally { observed.dispose(); }
}

it('blocks the reviewer exploit at every split and when xterm receives one character per chunk', () => {
  for (let index = 0; index <= doubleEscapeAttack.length; index++) {
    expectInert([doubleEscapeAttack.slice(0, index), doubleEscapeAttack.slice(index)]);
  }
  expectInert(doubleEscapeAttack.split(''));
});

it('blocks OSC, DCS, APC, PM, and SOS with repeated ESC, C1, and split terminators in real xterm', () => {
  for (const count of [1, 2, 3, 4, 15, 16, 127, 128]) {
    const escapes = '\x1b'.repeat(count);
    let input = '';
    for (const opener of [escapes + ']', '\x9d']) {
      for (const payload of oscPayloads) {
        for (const end of terminators) input += opener + payload + end;
      }
    }
    for (const opener of stringIntroducers) input += escapes + opener + '$qm\x07body' + escapes + '\\';
    input += escapes + ']8;;https://evil.example/\x07https://accounts.google.com' + escapes + ']8;;\x07';
    expectInert(input.split(''));
    expectInert(chunked(input, count));
  }
});

it('registers no titles, hidden links, OSC callbacks, or DCS callbacks under hostile fuzzed chunking', () => {
  for (let seed = 1; seed <= 128; seed++) {
    const input = hostileStream(seed);
    expectInert(chunked(input, seed));
    expectInert(input.split(''));
  }
});

it('retains real xterm colors, cursor movement, line clearing, and interactive CLI modes', () => {
  const observed = terminal(), filter = new TerminalText();
  try {
    const input = '\x9b2J\x9bH\x1b[31mRED\x1b[0m\r\nprogress 1%\r\x1b[2Kdone\x1b[?25l\x1b[?2004h';
    for (const chunk of chunked(input, 11)) observed.parse(filter.filter(chunk));
    const buffer = observed.term.buffer.active;
    expect(buffer.getLine(0)?.translateToString(true)).toBe('RED');
    expect(buffer.getLine(0)?.getCell(0)?.getFgColor()).toBe(1);
    expect(buffer.getLine(1)?.translateToString(true)).toBe('done');
    expect(buffer.cursorX).toBe(4);
    expect(buffer.cursorY).toBe(1);
    expect(observed.term.modes.bracketedPasteMode).toBe(true);
  } finally { observed.dispose(); }
});
