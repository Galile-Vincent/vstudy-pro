import { it } from 'vitest';
import { readFile,writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createCliAdapter } from '../providers/cli';
import { requestIdSchema,conversationIdSchema,documentIdSchema } from '../../shared/domain';
import { AI_PARSE_SYSTEM,aiParsePrompt } from '../prompt/ai-parse';
import { splitParsePages,validateAiPage } from './ai-parse-gate';
import { priceUsage } from '../pricing';
it.skipIf(process.env.VSTUDY_AI_EVALUATION!=='1')('evaluates supplied CH2 locally',async()=>{
 const pages=splitParsePages(await readFile('/tmp/pdf-last/cli/00_user_ch2.md','utf8'));
 const adapter=createCliAdapter('claude');
 await Promise.all([3,5,10,16].map(async page=>{
  const original=pages[page-1]??'';const image=await readFile(`/tmp/vstudy-ai-evaluation/${page}.png`);const text=JSON.parse(await readFile(`/tmp/vstudy-ai-evaluation/${page}.png.json`,'utf8')).text;
  const started=Date.now();let output='';let usage;
  for await(const e of adapter.stream({requestId:requestIdSchema.parse(randomUUID()),conversationId:conversationIdSchema.parse(randomUUID()),documentId:documentIdSchema.parse(randomUUID()),providerId:'claude-cli',modelId:'sonnet',userMessage:'Improve page',prompt:aiParsePrompt(original),systemPrompt:AI_PARSE_SYSTEM,images:[{mediaType:'image/png',data:image.toString('base64')}]},AbortSignal.timeout(180000))){if(e.type==='text-delta')output+=e.text;if(e.type==='usage')usage=e.usage;if(e.type==='error')throw new Error(e.message);}
  let gate;try{gate=validateAiPage(text,output);}catch(error){gate={error:String(error)};}
  await writeFile(`/tmp/vstudy-ai-evaluation/${page}.result.json`,JSON.stringify({page,original,output,seconds:(Date.now()-started)/1000,usage:usage?priceUsage('sonnet',usage):null,gate},null,2));
 }));
},240000);
it.skipIf(process.env.VSTUDY_AI_RECHECK!=='1')('rechecks saved private evaluation outputs without provider calls',async()=>{
 for(const page of [3,5,10,16]) {
  const path=`/tmp/vstudy-ai-evaluation/${page}.result.json`;const result=JSON.parse(await readFile(path,'utf8'));
  const source=JSON.parse(await readFile(`/tmp/vstudy-ai-evaluation/${page}.png.json`,'utf8')).text;
  result.gate=validateAiPage(source,result.output);await writeFile(path,JSON.stringify(result,null,2));
 }
});
