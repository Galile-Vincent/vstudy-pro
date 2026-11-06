/** Parse bounded four-byte big-endian JSON frames across arbitrary socket chunks. @packageDocumentation */
import { TextDecoder } from 'node:util';
import { MCP_MAX_FRAME } from './contract';

export function encodeFrame(value: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(value), 'utf8');
  if (!body.length || body.length > MCP_MAX_FRAME) throw new Error('Bridge frame exceeds its size limit.');
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.length);
  return Buffer.concat([header, body]);
}

export class Frames {
  private bytes = Buffer.alloc(0);
  push(chunk: Buffer): unknown[] {
    this.bytes = Buffer.concat([this.bytes, chunk]);
    const messages: unknown[] = [];
    while (this.bytes.length >= 4) {
      const length = this.bytes.readUInt32BE(0);
      if (!length || length > MCP_MAX_FRAME) throw new Error('Invalid bridge frame length.');
      if (this.bytes.length < 4 + length) break;
      messages.push(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(this.bytes.subarray(4, 4 + length))));
      this.bytes = this.bytes.subarray(4 + length);
    }
    return messages;
  }
}
