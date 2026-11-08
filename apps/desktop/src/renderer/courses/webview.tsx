import { createContext, useContext, type ReactNode } from 'react';
import type { WebviewTarget } from '../../shared/moodle-webview';
import { useOptionalNavigation } from '../shell';
type OpenMoodle = (accountId:string,target:WebviewTarget,returnFocus?:HTMLElement|null) => void;
const Context = createContext<OpenMoodle>(() => {});
export function useMoodleWebview() { return useContext(Context); }
export function MoodleWebviewProvider({children}:{children:ReactNode;onDocument:(id:string)=>void;onReconnect:()=>void}) {
  const navigation=useOptionalNavigation();
  return <Context.Provider value={(accountId,target)=>navigation?.openTab({view:'moodle',accountId,target})}>{children}</Context.Provider>;
}
