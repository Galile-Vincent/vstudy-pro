/** Consume one approved app-owned navigation target and open it in an isolated Moodle tab. */
import { useEffect, useRef } from 'react';
import { desktop } from '../bridge';
import { useNavigate } from '../shell';

export function AgentNavigation() {
  const navigation = useNavigate();
  const latest = useRef(navigation);
  latest.current = navigation;
  useEffect(() => {
    let stopped=false;
    let timer:ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next=await desktop.invoke('mcp:take-navigation',{});
        if (next && !stopped) {latest.current.openTab({view:'moodle',accountId:next.accountId,target:{kind:'page',url:next.url}});}
      } catch { /* A closed app cannot deliver navigation. */ }
      if (!stopped) timer=setTimeout(() => void poll(),1000);
    };
    void poll();
    return () => {stopped=true;clearTimeout(timer);};
  },[]);
  return null;
}
