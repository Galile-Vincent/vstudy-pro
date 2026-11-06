/** Consume one approved app-owned navigation target and open it in the existing isolated Moodle pane. */
import { useEffect, useRef, useState } from 'react';
import type { AgentNavigation } from '../../shared/mcp-navigation';
import { desktop } from '../bridge';
import { useNavigate } from '../shell';
import { MoodleWebviewPane } from '../courses/webview-pane';

export function AgentNavigation() {
  const [target,setTarget] = useState<AgentNavigation|null>(null);
  const navigation = useNavigate();
  const latest = useRef(navigation);
  latest.current = navigation;
  useEffect(() => {
    let stopped=false;
    let timer:ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next=await desktop.invoke('mcp:take-navigation',{});
        if (next && !stopped) {latest.current.navigate({view:'courses',courseId:next.courseId});setTarget(next);}
      } catch { /* A closed app cannot deliver navigation. */ }
      if (!stopped) timer=setTimeout(() => void poll(),1000);
    };
    void poll();
    return () => {stopped=true;clearTimeout(timer);};
  },[]);
  if (!target) return null;
  return <MoodleWebviewPane key={`${target.accountId}:${target.moduleId}`} accountId={target.accountId} target={{kind:'page',url:target.url}}
    onClose={() => setTarget(null)} onDocument={id => {setTarget(null);navigation.navigate({view:'workspace',documentId:id as import('../../shared').Document['id']});}}
    onReconnect={() => {setTarget(null);navigation.navigate({view:'courses',courseId:target.courseId,connectSchool:true});}} />;
}
