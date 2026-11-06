/** Stream HTTP JSON under a byte budget before parsing untrusted responses. @packageDocumentation */

/** Distinguish invalid response data from a transport failure while reading its body. */
export class JsonResponseError extends Error {
  constructor() { super('Invalid or oversized JSON response'); }
}

/** Count decompressed body bytes, cancel overflow, and release the reader on every path. */
export async function readBoundedJson(response: Response): Promise<{value:unknown;bytes:number}> {
  if (!response.body) throw new JsonResponseError();
  const reader = response.body.getReader(), chunks:Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 16*1024*1024) throw new JsonResponseError();
      chunks.push(part.value);
    }
  } finally { await reader.cancel().catch(() => {});reader.releaseLock(); }
  try { return {value:JSON.parse(new TextDecoder('utf-8').decode(Buffer.concat(chunks,bytes))) as unknown,bytes}; }
  catch { throw new JsonResponseError(); }
}
