/** Course-scoped Moodle navigation. The pane receives only a redacted state, never cookies or web-service credentials. */
import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import type { WebviewTarget } from '../../shared/moodle-webview';
import { MoodleWebviewPane } from './webview-pane';

type OpenMoodle = (accountId:string,target:WebviewTarget) => void;
const Context = createContext<OpenMoodle>(() => {});
export function useMoodleWebview() { return useContext(Context); }
export function MoodleWebviewProvider({children,onDocument,onReconnect}:{children:ReactNode;onDocument:(id:string)=>void;onReconnect:()=>void}) {
  const [request,setRequest] = useState<{accountId:string;target:WebviewTarget;key:number}>();
  const sequence = useRef(0);
  const trigger = useRef<HTMLElement|null>(null);
  const close = () => {setRequest(undefined);setTimeout(() => trigger.current?.isConnected && trigger.current.focus(),0);};
  return <Context.Provider value={(accountId,target) => {
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setRequest({accountId,target,key:++sequence.current});
  }}>
    {children}
    {request && <MoodleWebviewPane key={request.key} accountId={request.accountId} target={request.target} onClose={close}
      onDocument={id => {close();onDocument(id);}} onReconnect={() => {close();onReconnect();}} />}
  </Context.Provider>;
}
