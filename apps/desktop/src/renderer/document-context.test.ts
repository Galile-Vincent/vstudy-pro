import { describe, expect, it } from 'vitest';
import { captureRect, contextLabel } from './document-context';
import { documentContextAttachmentSchema, chatRequestSchema } from '../shared/domain';
const documentId='00000000-0000-4000-8000-000000000001';
const context={documentId,documentName:'Lecture.pdf',page:24,kind:'region',image:'data:image/png;base64,AAAA'};
describe('original document context',()=>{
  it('normalizes reverse drags and clamps all edges to the displayed page',()=>{
    expect(captureRect({x:130,y:90},{x:-10,y:10},{width:100,height:80})).toEqual({x:0,y:10,width:100,height:70});
    expect(captureRect({x:10,y:10},{x:30,y:40},{width:100,height:80})).toEqual({x:10,y:10,width:20,height:30});
  });
  it('ignores clicks, off-page rectangles and invalid geometry',()=>{
    for(const end of [{x:10,y:10},{x:12,y:30},{x:NaN,y:30}])expect(captureRect({x:10,y:10},end,{width:100,height:80})).toBeNull();
    expect(captureRect({x:110,y:90},{x:120,y:100},{width:100,height:80})).toBeNull();
  });
  it('keeps document identity, page and image together in a removable chip',()=>{
    const parsed=documentContextAttachmentSchema.parse(context);
    expect(contextLabel(parsed)).toBe('Lecture.pdf · 24');
    expect(parsed.image).toBe(context.image);
    expect(chatRequestSchema.safeParse({scope:'document',documentId,conversationId:documentId,requestId:documentId,providerId:'anthropic-api',modelId:'fake',userMessage:'Explain',documentContext:{...context,documentId:'00000000-0000-4000-8000-000000000002'}}).success).toBe(false);
    expect(documentContextAttachmentSchema.safeParse({...context,page:0}).success).toBe(false);
    expect(documentContextAttachmentSchema.safeParse({...context,image:'file:///private/secret.png'}).success).toBe(false);
    expect(chatRequestSchema.safeParse({scope:'document',documentId,conversationId:documentId,requestId:documentId,providerId:'anthropic-api',modelId:'fake',userMessage:'Explain',documentContext:context}).success).toBe(true);
  });
});
