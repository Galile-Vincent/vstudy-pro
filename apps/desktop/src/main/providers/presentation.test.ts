import { it,expect } from 'vitest';
import { createApiAdapter } from './api';
import { chatRequestSchema } from '../../shared';
import { presentationSchema } from '../../shared/presentation';
const request=chatRequestSchema.parse({requestId:'00000000-0000-4000-8000-000000000001',conversationId:'00000000-0000-4000-8000-000000000002',documentId:'00000000-0000-4000-8000-000000000003',providerId:'openai-api',modelId:'model',userMessage:'Compare'});
it.each(['openai-api','anthropic-api'] as const)('declares only the read-only present tool when enabled for %s',async providerId=>{
 let body:Record<string,unknown>={};
 const adapter=createApiAdapter(()=>({kind:'api',id:providerId,enabled:true}),{getInMainOnly:()=> 'test-key'},async(_url,init)=>{body=JSON.parse(String(init?.body));return new Response(providerId==='openai-api'?'data: [DONE]\n\n':'data: {"type":"message_stop"}\n\n');});
 for await(const event of adapter.stream({...request,providerId,prompt:'Document',allowPresentation:false},new AbortController().signal)) void event;
 expect(body.tools).toBeUndefined();
 for await(const event of adapter.stream({...request,providerId,prompt:'Document',allowPresentation:true},new AbortController().signal)) void event;
 const tools=body.tools as {name?:string;function?:{name:string};input_schema?:{additionalProperties:boolean}}[];
 expect(tools).toHaveLength(1);
 expect(providerId==='openai-api'?tools[0]?.function?.name:tools[0]?.name).toBe('present');
 if(providerId==='anthropic-api')expect(tools[0]?.input_schema?.additionalProperties).toBe(false);
});
it('rejects oversized, non-text and unbalanced presentation tables',()=>{
 expect(presentationSchema.safeParse({title:'Summary',columns:['Topic'],rows:[['Fact']]}).success).toBe(true);
 expect(presentationSchema.safeParse({title:'Summary',columns:['Topic'],rows:[['Fact','Extra']]}).success).toBe(false);
 expect(presentationSchema.safeParse({title:'Summary',columns:['Topic'],rows:[[{html:'<script/>'}]]}).success).toBe(false);
 expect(presentationSchema.safeParse({title:'Summary',columns:['Topic'],rows:Array.from({length:31},()=>['Fact'])}).success).toBe(false);
});
