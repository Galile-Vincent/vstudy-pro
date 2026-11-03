import { it, expect } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import { createCliAdapter } from './cli';
import { createCodexAdapter, probeCodexChat } from './codex';
import { requestIdSchema, conversationIdSchema, documentIdSchema } from '../../shared/domain';
import { randomUUID } from 'node:crypto';
const live=process.env.VSTUDY_AI_PARSE_LIVE==='1';
for(const binary of ['claude','codex'] as const)it.skipIf(!live)(`${binary} reads an image without tools`,async()=>{
 const image=await readFile(new URL('./fixtures/ai-parse-trivial.png',import.meta.url));
 const adapter=binary==='claude'?createCliAdapter('claude'):createCodexAdapter();
 let text='';const events=[];
 for await(const e of adapter.stream({requestId:requestIdSchema.parse(randomUUID()),conversationId:conversationIdSchema.parse(randomUUID()),documentId:documentIdSchema.parse(randomUUID()),providerId:binary==='claude'?'claude-cli':'codex-cli',modelId:binary==='claude'?'haiku':'gpt-6.1-sol',userMessage:'Transcribe the image.',prompt:'Transcribe the image.',systemPrompt:'Return only visible text. No tools.',images:[{mediaType:'image/png',data:image.toString('base64')}]},AbortSignal.timeout(120000))){events.push(e);if(e.type==='text-delta')text+=e.text;if(e.type==='error')throw new Error(e.message);expect(e.type).not.toBe('tool-call');}
 expect(text).toContain('2468');
 if(binary==='codex')await probeCodexChat('/Users/vc/.local/bin/codex','gpt-6.1-sol',new URL('./fixtures/ai-parse-trivial.png',import.meta.url).pathname);
 await writeFile(`/tmp/vstudy-ai-${binary}-live.json`,JSON.stringify(events));
},240000);
