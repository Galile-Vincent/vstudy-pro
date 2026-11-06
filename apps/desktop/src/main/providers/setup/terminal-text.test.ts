/**
 * Exercise terminal filter behavior, recovery, and chunk invariance under hostile control input.
 * @packageDocumentation
 */
import { expect, it } from 'vitest';
import { TerminalText } from './terminal-text';
import { chunked, doubleEscapeAttack, hostileStream, oscPayloads, stringIntroducers, terminators } from './terminal-text-fixtures';

function filtered(chunks: readonly string[]): string {
  const filter = new TerminalText();
  return chunks.map(chunk => filter.filter(chunk)).join('');
}

it('preserves Unicode, C0 execution, ANSI styling, and interactive cursor and mode sequences', () => {
  const text = 'CLI 🦋繁體\r\n\t\b\x00\x07';
  const ansi = '\x1b[1;38;2;12;34;56mcolor\x1b[0m\x1b[2J\x1b[H\x1b[3A\x1b[?25l\x1b[?25h\x1b[?1049h\x1b[?1049l\x1b[?2004h\x1b[4:3m\x1b[2 q';
  const escapes = '\x1b7\x1b8\x1b(B\x1b(0\x1bD\x1bE\x1bM\x1b=\x1b>';
  const input = text + ansi + escapes;
  expect(filtered(input.split(''))).toBe(input);
});

it('normalizes C1 CSI and retains it across parameter and intermediate splits', () => {
  expect(filtered(['\x9b', '?20', '04h', '\x9b38:2::1:2:3', 'm', '\x9b2 ', 'q'])).toBe('\x1b[?2004h\x1b[38:2::1:2:3m\x1b[2 q');
});

it('drops every OSC payload with both introducers and BEL or either ST terminator', () => {
  for (const opener of ['\x1b]', '\x9d']) {
    for (const payload of oscPayloads) {
      for (const end of terminators) {
        const input = `before${opener}${payload}${end}after`;
        expect(filtered(input.split('')), JSON.stringify(input)).toBe('beforeafter');
      }
    }
  }
  expect(filtered([doubleEscapeAttack])).toBe('https://accounts.google.com');
});

it('drops DCS, SOS, PM, and APC bodies through ST and treats BEL as body content', () => {
  for (const opener of stringIntroducers) {
    for (const end of ['\x1b\\', '\x9c']) {
      const input = `before${opener}$qsecret\x07still secret${end}after`;
      expect(filtered(input.split('')), JSON.stringify(input)).toBe('beforeafter');
    }
  }
});

it('withholds incomplete ESC and CSI commands rather than emitting dangling prefixes', () => {
  const filter = new TerminalText();
  expect(filter.filter('safe\x1b')).toBe('safe');
  expect(filter.filter('')).toBe('');
  expect(filter.filter('\x1b')).toBe('');
  expect(filter.filter('[38;2;')).toBe('');
  expect(filter.filter('1;2;3')).toBe('');
  expect(filter.filter('mRED')).toBe('\x1b[38;2;1;2;3mRED');
  expect(filter.filter('\x1b(')).toBe('');
  expect(filter.filter('Btext')).toBe('\x1b(Btext');
});

it('tracks repeated ESC before both string openers and split ST without leaking a prefix', () => {
  for (const count of [1, 2, 3, 4, 15, 16, 31, 32, 127, 128, 4095, 4096]) {
    const esc = '\x1b'.repeat(count);
    const input = `before${esc}]2;secret${esc}\\after${esc}[31mred`;
    expect(filtered(input.split('')), String(count)).toBe('beforeafter\x1b[31mred');
    for (const opener of ['P', 'X', '^', '_']) {
      expect(filtered([esc, opener, 'secret', esc, '\\safe'])).toBe('safe');
    }
  }
});

it('recognizes OSC after ignored C0 and DEL bytes in an escape sequence', () => {
  for (const ignored of ['\x00', '\x07', '\x08', '\x09', '\x0a', '\x0d', '\x7f']) {
    const input = `\x1b${ignored}]2;secret\x07safe`;
    expect(filtered(input.split(''))).toBe((ignored === '\x7f' ? '' : ignored) + 'safe');
  }
});

it('cancels incomplete escapes, CSI, and strings with CAN, SUB, and C1 ST', () => {
  for (const prefix of ['\x1b', '\x1b(', '\x1b[31;', '\x1b[2 ', '\x1b[1?', '\x1b]2;secret', ...stringIntroducers.map(opener => opener + 'secret')]) {
    for (const cancel of ['\x18', '\x1a', '\x9c']) {
      expect(filtered([prefix, cancel, 'safe\x1b[32mOK'])).toBe('safe\x1b[32mOK');
    }
  }
});

it('restarts at ESC or C1 introducers in an interrupted control instead of passing them through', () => {
  for (const prefix of ['\x1b(', '\x1b[31;', '\x1b[1?', '\x1b]2;secret', ...stringIntroducers]) {
    for (const csi of ['\x1b[', '\x9b']) {
      expect(filtered([prefix, csi, '32mOK'])).toBe('\x1b[32mOK');
    }
    for (const osc of ['\x1b]', '\x9d']) {
      expect(filtered([prefix, osc, '2;secret\x07safe'])).toBe('safe');
    }
  }
});

it('does not assemble a new escape from commands on either side of a removed string', () => {
  for (const prefix of ['\x1b', '\x1b(', '\x1b[31;', '\x1b[2 ']) {
    expect(filtered([prefix, '\x9d2;secret\x07', ']2;literal\x07'])).toBe(']2;literal\x07');
  }
});

it('consumes malformed and oversized sequences, then recovers for the next CLI output', () => {
  expect(filtered(['\x1b[1?invalid', '\x1b[1 2mOK'])).toBe('nvalidOK');
  const oversizedCsi = '\x1b[' + '1;'.repeat(10000);
  const oversizedEscape = '\x1b' + '('.repeat(10000);
  expect(filtered(chunked(oversizedCsi + 'mOK' + oversizedEscape + 'Bsafe', 5))).toBe('OKsafe');
  expect(filtered(['\x1b]', '2;secret'.repeat(20000), '\x1b', '\\safe'])).toBe('safe');
  expect(filtered([oversizedCsi, '\x1b]2;secret\x07safe'])).toBe('safe');
});

it('produces the same result at every split in a mixed Unicode and control transcript', () => {
  const input = `start🦋\x9b31m${doubleEscapeAttack}\x1bP$qsecret\x07body\x1b\x1b\\\x1b[0m\x1b]52;c;secret\x18done`;
  const expected = 'start🦋\x1b[31mhttps://accounts.google.com\x1b[0mdone';
  for (let index = 0; index <= input.length; index++) {
    expect(filtered([input.slice(0, index), '', input.slice(index)]), String(index)).toBe(expected);
  }
});

it('is invariant under deterministic fuzzed chunk boundaries, including split surrogate pairs', () => {
  for (let seed = 1; seed <= 128; seed++) {
    const input = hostileStream(seed), expected = filtered([input]);
    expect(filtered(chunked(input, seed)), String(seed)).toBe(expected);
    expect(filtered(input.split('')), String(seed)).toBe(expected);
    expect(expected).toContain('https://accounts.google.com');
    expect(expected.endsWith('done')).toBe(true);
  }
});
