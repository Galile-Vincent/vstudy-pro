import type { ThreadAssistantMessagePart, ToolCallMessagePart } from '@assistant-ui/react';
import type { DocumentCitation, ToolCall } from '../shared';
export function assistantContent(text: string, reasoning = '', citations: DocumentCitation[] = [], toolCalls: ToolCall[] = []): ThreadAssistantMessagePart[] {
  return [
    ...(reasoning ? [{type:'reasoning' as const,text:reasoning}] : []),
    {type:'text',text},
    ...toolCalls.map(call => ({...call,type:'tool-call' as const,args:call.args as ToolCallMessagePart['args'],argsText:JSON.stringify(call.args)})),
    ...citations.map(citation => ({type:'source' as const,sourceType:'document' as const,id:citation.id,title:citation.page && citation.title !== `p. ${citation.page}` ? `p. ${citation.page} · ${citation.title}` : citation.title,mediaType:'text/markdown',providerMetadata:{vstudy:{id:citation.id,documentId:citation.documentId,title:citation.title,offset:citation.offset,quote:citation.quote,...(citation.page === undefined ? {} : {page:citation.page})}}})),
  ];
}
