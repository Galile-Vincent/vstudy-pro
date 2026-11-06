/**
 * Deterministic hostile terminal streams and chunk partitions shared by filter regressions.
 * @packageDocumentation
 */
export const doubleEscapeAttack = '\x1b\x1b]2;INJECTED TITLE\x07\x1b\x1b]8;;https://evil.example/\x07https://accounts.google.com\x1b\x1b]8;;\x07';

export const stringIntroducers = ['\x1bP', '\x90', '\x1bX', '\x98', '\x1b^', '\x9e', '\x1b_', '\x9f'];
export const terminators = ['\x07', '\x1b\\', '\x9c'];
export const oscPayloads = ['0;TITLE AND ICON', '1;ICON', '2;TITLE', '8;;https://evil.example/', '52;c;c2VjcmV0', '1337;untrusted'];

function random(seed: number) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state; };
}

export function chunked(value: string, seed: number): string[] {
  const next = random(seed), chunks: string[] = [];
  for (let offset = 0; offset < value.length;) {
    const end = offset + 1 + next() % 19;
    chunks.push(value.slice(offset, end));
    offset = end;
  }
  return chunks;
}

export function hostileStream(seed: number): string {
  const next = random(seed);
  const fragments = [
    'text🦋繁體', ']', '[', 'P', 'X', '^', '_', '\\', '0;TITLE', '2;TITLE',
    '8;;https://evil.example/', '52;c;c2VjcmV0', '31;4:3', '$qm', 'm',
    '\x1b', '\x1b\x1b', '\x1b[31m', '\x9b31m', '\x9b', '\x9d', '\x90', '\x98', '\x9e', '\x9f',
    '\x9c', '\x07', '\x18', '\x1a', '\x00', '\x7f', '\x85', '\r', '\n',
    ...oscPayloads.map(payload => `\x1b\x1b]${payload}\x07`),
    ...stringIntroducers.map(opener => `${opener}$qm\x1b\\`),
  ];
  let stream = '';
  for (let index = 0; index < 256; index++) stream += fragments[next() % fragments.length];
  return stream + '\x18' + doubleEscapeAttack + '\x18done';
}
