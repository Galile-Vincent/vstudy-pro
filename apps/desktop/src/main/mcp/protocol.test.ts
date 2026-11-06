/** Wire framing rejects oversized, ambiguous, malformed, and unsupported requests. @packageDocumentation */
import { expect, it } from 'vitest';
import { MCP_MAX_FRAME, bridgeResponseSchema, type BridgeRequest } from '../../shared/mcp';
import { RequestFrames, responseFrame } from './protocol';

function frame(value: unknown) {
  const body = Buffer.from(JSON.stringify(value));
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.length);
  return Buffer.concat([header, body]);
}
const ping = (id = '1') => ({jsonrpc: '2.0', id, method: 'ping', params: {}});

it('accepts byte-fragmented headers and bodies as well as coalesced frames', () => {
  const decoder = new RequestFrames();
  const requests: BridgeRequest[] = [];
  const bytes = frame(ping());
  for (const byte of bytes) decoder.push(Buffer.from([byte]), request => requests.push(request));
  decoder.push(Buffer.concat([frame(ping('2')), frame(ping('3'))]), request => requests.push(request));
  expect(requests).toEqual([ping(), ping('2'), ping('3')]);
});

it.each([
  {jsonrpc: '2.0', id: '1', method: 'approve', params: {}},
  {...ping(), unknown: true}, {...ping(), id: 1}, {...ping(), params: {unknown: true}},
  {...ping(), method: 'pair.finish', params: {pairingId: 'invalid'}},
  {...ping(), method: 'tools.call', params: {grant: 'a'.repeat(32), name: 'mod_quiz_process_attempt', args: {}}},
])('rejects requests outside the fixed strict schema', request => {
  expect(() => new RequestFrames().push(frame(request), () => { throw new Error('accepted invalid request'); })).toThrow('INVALID_ARGUMENT');
});

it('rejects zero and oversized frames before allocating or waiting for their bodies', () => {
  for (const size of [0, MCP_MAX_FRAME + 1, 0xffffffff]) {
    const bytes = Buffer.alloc(4);
    bytes.writeUInt32BE(size);
    expect(() => new RequestFrames().push(bytes, () => {})).toThrow('INVALID_ARGUMENT');
  }
});

it('rejects malformed UTF-8 and JSON, and cannot recover by accepting later frames', () => {
  const malformed = [Buffer.from([0, 0, 0, 1, 0xff]), Buffer.from([0, 0, 0, 1, 0x7b])];
  for (const bytes of malformed) {
    const decoder = new RequestFrames();
    expect(() => decoder.push(bytes, () => {})).toThrow('INVALID_ARGUMENT');
    expect(() => decoder.push(frame(ping()), () => {})).toThrow('INVALID_ARGUMENT');
  }
});

it('frames only valid bounded responses with exactly one of result and error', () => {
  const response = {jsonrpc: '2.0' as const, id: '1', result: {version: 1}};
  const bytes = responseFrame(response);
  expect(bytes.readUInt32BE(0)).toBe(bytes.length - 4);
  expect(bridgeResponseSchema.parse(JSON.parse(bytes.subarray(4).toString()))).toEqual(response);
  expect(() => responseFrame({...response, result: 'x'.repeat(MCP_MAX_FRAME)})).toThrow('INTERNAL');
  expect(() => responseFrame({...response, error: {code: -1, message: 'bad'}})).toThrow();
});
