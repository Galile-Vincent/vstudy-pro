/** Strict bounded UTF-8 length frames accept only the fixed shared JSON-RPC request schema. @packageDocumentation */
import { MCP_MAX_FRAME, bridgeRequestSchema, bridgeResponseSchema, type BridgeRequest, type BridgeResponse } from '../../shared/mcp';
import { McpFailure } from './errors';

/** Decode incrementally without repeatedly concatenating attacker-controlled fragments. */
export class RequestFrames {
  private readonly header = Buffer.alloc(4);
  private headerBytes = 0;
  private body: Buffer | undefined;
  private bodyBytes = 0;
  private failed = false;

  push(chunk: Buffer, accept: (request: BridgeRequest) => void): void {
    if (this.failed) throw new McpFailure('INVALID_ARGUMENT');
    try {
      let offset = 0;
      while (offset < chunk.length) {
        if (!this.body) {
          const count = Math.min(4 - this.headerBytes, chunk.length - offset);
          chunk.copy(this.header, this.headerBytes, offset, offset + count);
          offset += count;
          this.headerBytes += count;
          if (this.headerBytes !== 4) continue;
          const length = this.header.readUInt32BE(0);
          if (length === 0 || length > MCP_MAX_FRAME) throw new McpFailure('INVALID_ARGUMENT');
          this.body = Buffer.allocUnsafe(length);
          this.bodyBytes = 0;
        }
        const count = Math.min(this.body.length - this.bodyBytes, chunk.length - offset);
        chunk.copy(this.body, this.bodyBytes, offset, offset + count);
        offset += count;
        this.bodyBytes += count;
        if (this.bodyBytes !== this.body.length) continue;
        const text = new TextDecoder('utf-8', {fatal: true}).decode(this.body);
        const request = bridgeRequestSchema.parse(JSON.parse(text));
        this.body = undefined;
        this.headerBytes = 0;
        this.bodyBytes = 0;
        accept(request);
      }
    } catch { this.failed = true; throw new McpFailure('INVALID_ARGUMENT'); }
  }
}

/** Validate response shape and size before writing any bytes to a peer. */
export function responseFrame(response: BridgeResponse): Buffer {
  const body = Buffer.from(JSON.stringify(bridgeResponseSchema.parse(response)), 'utf8');
  if (body.length > MCP_MAX_FRAME) throw new McpFailure('INTERNAL');
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.length);
  return Buffer.concat([header, body]);
}
