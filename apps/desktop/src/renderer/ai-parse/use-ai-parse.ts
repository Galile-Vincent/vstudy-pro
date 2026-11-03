import { useCallback, useEffect, useState } from 'react';
import type { AiParseRequest, AiParseState, AiParseEstimate } from '../../shared/ai-parse';
import type { Document } from '../../shared/domain';
export function useAiParse(documentId:Document['id']) {
 const [state,setState]=useState<AiParseState>();const [estimate,setEstimate]=useState<AiParseEstimate>();const [error,setError]=useState<string>();
 const refresh=useCallback(async()=>{const next=await window.desktop.invoke('aiParse:status',{documentId});setState(next);return next;},[documentId]);
 useEffect(()=>{let live=true;const poll=async()=>{try{const next=await window.desktop.invoke('aiParse:status',{documentId});if(live)setState(next);}catch{if(live)setError('errors.ai_parse.failed');}};void poll();const timer=setInterval(()=>{void poll();},750);return()=>{live=false;clearInterval(timer);};},[documentId]);
 const run=async(action:()=>Promise<unknown>)=>{setError(undefined);try{await action();await refresh();}catch{setError('errors.ai_parse.failed');}};
 return {state,estimate,error,estimateCost:async(request:Omit<AiParseRequest,'documentId'>)=>{const next=await window.desktop.invoke('aiParse:estimate',{...request,documentId});setEstimate(next);return next;},start:(request:Omit<AiParseRequest,'documentId'>)=>run(()=>window.desktop.invoke('aiParse:start',{...request,documentId})),cancel:()=>run(()=>window.desktop.invoke('aiParse:cancel',{documentId})),use:(version:'original'|'ai')=>run(()=>window.desktop.invoke('aiParse:use',{documentId,version})),discard:()=>run(()=>window.desktop.invoke('aiParse:discard',{documentId})),refresh};
}
