import { expect, it } from 'vitest';
import { moodleWebviewContract, nativeCheckpointSchema } from './moodle-webview';
const tabId='11111111-1111-4111-a111-111111111111';
it('requires owned tab identity and bounded activation generations',()=>{
  const open=moodleWebviewContract['moodle:webview-open'].request;
  const request={tabId,accountId:tabId,target:{kind:'page',url:'https://school.example/'}};
  expect(open.safeParse(request).success).toBe(true);
  expect(open.safeParse({...request,tabId:undefined}).success).toBe(false);
  expect(open.safeParse({...request,partition:'evil'}).success).toBe(false);
  expect(moodleWebviewContract['moodle:webview-state'].request.safeParse({id:tabId}).success).toBe(false);
  expect(moodleWebviewContract['moodle:webview-hide'].request.safeParse({tabId,generation:-1}).success).toBe(false);
  expect(moodleWebviewContract['moodle:webview-sync'].request.safeParse({tabIds:Array(31).fill(tabId)}).success).toBe(false);
});
it('redacts restoration URLs and rejects arbitrary scripts and invalid scroll',()=>{
  const checkpoint={url:'https://user:pass@school.example/page?id=2&token=secret#private',zoom:1,scrollTop:20};
  expect(nativeCheckpointSchema.parse(checkpoint).url).toBe('https://school.example/page?id=2');
  expect(nativeCheckpointSchema.safeParse({...checkpoint,script:'alert(1)'}).success).toBe(false);
  expect(nativeCheckpointSchema.safeParse({...checkpoint,scrollTop:Infinity}).success).toBe(false);
});
