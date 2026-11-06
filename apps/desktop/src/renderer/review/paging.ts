import { useCallback, useEffect, useRef, useState } from 'react';
export type Cursor = { at: string; id: string };
export type Page<T> = { items: T[]; nextCursor: Cursor | null };
/** Ignore late replies after a course change, including late load-more replies. */
export function useReviewPage<T>(load: (cursor?: Cursor) => Promise<Page<T>>) {
 const [items,setItems]=useState<T[]>([]),[cursor,setCursor]=useState<Cursor|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(false);
 const generation=useRef(0), busy=useRef(false);
 const fetch=useCallback(async (append=false)=>{
  if(append && busy.current) return;
  const version=append ? generation.current : ++generation.current;
  busy.current=true;setLoading(true);setError(false);
  try {const page=await load(append ? cursor ?? undefined : undefined);if(version===generation.current){setItems(old=>append?[...old,...page.items]:page.items);setCursor(page.nextCursor);}}
  catch {if(version===generation.current)setError(true);}
  finally {if(version===generation.current){busy.current=false;setLoading(false);}}
 },[load,cursor]);
 useEffect(()=>{setItems([]);setCursor(null);void fetch();return()=>{generation.current++;};},[load]);
 return {items,cursor,loading,error,retry:()=>void fetch(),more:()=>void fetch(true)};
}
