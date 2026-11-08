import { useRef } from 'react';
import type { useNavigate } from './shell';
import type { TabPresentation } from '../shared/app-tabs';
export function useTabPresentation(navigation:ReturnType<typeof useNavigate> | null) {
  const id=navigation?.activeTabId;
  const saved=navigation?.tabs?.tabs.find(tab=>tab.id===id)?.presentation;
  const route=useRef(navigation?.route).current;
  const initial=useRef(saved).current;
  const latest=useRef(navigation);latest.current=navigation;
  const update=(patch:Partial<TabPresentation>)=>{
    const nav=latest.current,tab=nav?.tabs?.tabs.find(tab=>tab.id===id);
    if(tab)nav?.updateNativePresentation(tab.id,{...tab.presentation,...patch} as TabPresentation,undefined,route);
  };
  return {initial,update};
}
