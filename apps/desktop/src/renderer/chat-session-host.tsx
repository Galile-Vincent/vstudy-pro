import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react';
import { useNavigate } from './shell';

type Connection = { adapter: Parameters<typeof useLocalRuntime>[0]; dispose: () => void };
type Options = Parameters<typeof useLocalRuntime>[1];
type Runtime = ReturnType<typeof useLocalRuntime>;
type Session = { id:string; tabIds:Set<string>; connection:Connection; connections:Set<Connection>; options:Options; runtime?:Runtime; attached:number; notify:()=>void };
type Host = { sessions:Map<string,Session>; changed:()=>void };
const Context=createContext<Host | null>(null);
function SessionRuntime({session,changed}:{session:Session;changed:()=>void}) {
  const runtime=useLocalRuntime(useMemo(()=>({run:args=>session.connection.adapter.run(args)}),[session]),session.options);
  useEffect(()=>{
    const update=()=>{
      const state=runtime.thread.getState();
      if(state.isLoading)return;
      if(!session.runtime){session.runtime=runtime;session.notify();}
      if(!session.attached && !state.isRunning)changed();
    };
    const unsubscribe=runtime.thread.subscribe(update);update();
    return()=>{unsubscribe();if(!runtime.thread.getState().isLoading)runtime.thread.cancelRun();for(const connection of session.connections)connection.dispose();delete session.runtime;};
  },[runtime,session,changed]);
  return <AssistantRuntimeProvider runtime={runtime}/>;
}
export function ChatSessionHost({children}:{children:ReactNode}) {
  const {tabs}=useNavigate();
  const [,render]=useState(0);
  const host=useMemo<Host>(()=>({sessions:new Map(),changed:()=>render(n=>n+1)}),[]);
  useEffect(()=>{
    const ids=new Set(tabs.tabs.map(tab=>tab.id));
    let removed=false;
    for(const [id,session] of host.sessions) {
      for(const tabId of session.tabIds)if(!ids.has(tabId))session.tabIds.delete(tabId);
      if(!session.tabIds.size || (!session.attached && !session.runtime?.thread.getState().isRunning)){host.sessions.delete(id);removed=true;}
    }
    if(removed)host.changed();
  },[tabs.tabs,host]);
  const changed=useMemo(()=>()=>{
    for(const [id,session] of host.sessions)if(!session.attached && !session.runtime?.thread.getState().isRunning)host.sessions.delete(id);
    host.changed();
  },[host]);
  return <Context.Provider value={host}>{[...host.sessions.values()].map(session=><SessionRuntime key={session.id} session={session} changed={changed}/>)}{children}</Context.Provider>;
}
export function useChatSession(id:string,tabId:string,connection:Connection,options:Options) {
  const host=useContext(Context);
  const [,render]=useState(0);
  const [standalone]=useState(()=>!host);
  useEffect(()=>{
    if(!host)return;
    let session=host.sessions.get(id);
    if(!session) {session={id,tabIds:new Set(),connection,connections:new Set(),options,attached:0,notify:()=>{}};host.sessions.set(id,session);}
    session.connection=connection;session.connections.add(connection);
    session.tabIds.add(tabId);session.attached++;session.notify=()=>render(n=>n+1);host.changed();
    return()=>{session.attached--;session.notify=()=>{};queueMicrotask(()=>{if(!session.attached && !session.runtime?.thread.getState().isRunning)host.sessions.delete(id);host.changed();});};
  },[host,id,tabId,connection]);
  return {runtime:host?.sessions.get(id)?.runtime,standalone};
}
