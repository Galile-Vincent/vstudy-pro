import { useCallback, useEffect, useRef, useState } from 'react';
import type { AiParseRequest, AiParseState, AiParseEstimate } from '../../shared/ai-parse';
import type { Document } from '../../shared/domain';
export function useAiParse(documentId:Document['id'], enabled=true) {
 const [state,setState]=useState<AiParseState>();const [estimate,setEstimate]=useState<AiParseEstimate>();const [error,setError]=useState<string>();
 const estimateRevision=useRef(0);
 const refresh=useCallback(async()=>{const next=await window.desktop.invoke('aiParse:status',{documentId});setState(next);return next;},[documentId]);
 useEffect(()=>{if(!enabled)return;let live=true;const poll=async()=>{try{const next=await window.desktop.invoke('aiParse:status',{documentId});if(live)setState(next);}catch{if(live)setError('errors:ai_parse.failed');}};void poll();const timer=setInterval(()=>{void poll();},750);return()=>{live=false;clearInterval(timer);};},[documentId,enabled]);
 const run=async(action:()=>Promise<unknown>)=>{setError(undefined);try{await action();await refresh();return true;}catch(error){const code=error instanceof Error ? error.message.match(/ai_parse\.[a-z_]+/)?.[0] : undefined;setError('errors:'+(code??'ai_parse.failed'));return false;}};
 return {state,estimate,error,clearEstimate:()=>{estimateRevision.current++;setEstimate(undefined);},estimateCost:(request:Omit<AiParseRequest,'documentId'>)=>run(async()=>{const revision=++estimateRevision.current;setEstimate(undefined);const next=await window.desktop.invoke('aiParse:estimate',{...request,documentId});if(revision===estimateRevision.current)setEstimate(next);}),start:(request:Omit<AiParseRequest,'documentId'>)=>run(()=>window.desktop.invoke('aiParse:start',{...request,documentId})),cancel:()=>run(()=>window.desktop.invoke('aiParse:cancel',{documentId})),use:(version:'original'|'ai')=>run(()=>window.desktop.invoke('aiParse:use',{documentId,version})),discard:()=>run(()=>window.desktop.invoke('aiParse:discard',{documentId})),refresh};
}
