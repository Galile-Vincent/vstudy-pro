import type { ReactNode } from 'react';
import { Button } from '../components/ui/button';
import type { AiParseState, AiParseEstimate } from '../../shared/ai-parse';
export interface AiParsePanelProps {
 pageCount:number; disabled?:boolean; state:AiParseState; estimate:AiParseEstimate|undefined; modelPicker:ReactNode;
 scope:'all'|'range'|'preview'; startPage:number; endPage:number;
 onScope:(scope:'all'|'range'|'preview')=>void; onRange:(start:number,end:number)=>void;
 onEstimate:()=>void; onStart:()=>void; onCancel:()=>void; onUse:(version:'original'|'ai')=>void; onDiscard:()=>void;
 t:(key:string)=>string;
}
export function AiParsePanel(p:AiParsePanelProps) {
 const done=p.state.pages.filter(page=>['done','kept-original','failed'].includes(page.status)).length;
 const busy=p.state.status==='running';
 return <section className="text-sm space-y-3" aria-label={p.t('library:ai_parse.title')}>
  <h3 className="font-medium">{p.t('library:ai_parse.title')}</h3><p>{p.pageCount} {p.t('library:pageCount')}</p>{p.modelPicker}
  <select aria-label={p.t('library:ai_parse.scope')} value={p.scope} onChange={e=>p.onScope(e.target.value==='range'?'range':e.target.value==='preview'?'preview':'all')} disabled={busy} className="rounded-md border px-2 py-1">
   {(['all','range','preview'] as const).map(scope=><option key={scope} value={scope}>{p.t('library:ai_parse.'+scope)}</option>)}
  </select>
  {p.scope==='range' && <div><label>{p.t('library:ai_parse.start_page')}<input type="number" max={p.pageCount} min={1} value={p.startPage} aria-label={p.t('library:ai_parse.start_page')} onChange={e=>p.onRange(Number(e.target.value),p.endPage)}/></label><label>{p.t('library:ai_parse.end_page')}<input type="number" max={p.pageCount} min={p.startPage} value={p.endPage} aria-label={p.t('library:ai_parse.end_page')} onChange={e=>p.onRange(p.startPage,Number(e.target.value))}/></label></div>}
  <Button variant="outline" className="rounded-md border px-3 py-1" disabled={busy || p.disabled} onClick={p.onEstimate}>{p.t('library:ai_parse.estimate')}</Button>
  {p.estimate && <p aria-live="polite">{p.estimate.pages} {p.t('library:pageCount')} · {p.estimate.inputTokens+p.estimate.outputTokens} {p.t('library:ai_parse.tokens')} · {p.estimate.costUsd===undefined?p.t('library:ai_parse.unknown'):`USD ${p.estimate.costUsd.toFixed(4)}`} {p.estimate.billing==='api-equivalent'?p.t('library:ai_parse.equivalent'):''}{p.estimate.reason && p.t('errors:'+p.estimate.reason)}</p>}
  {p.state.status!=='idle' && <progress className="w-full" max={Math.max(1,p.state.pages.length)} value={done} aria-label={p.t('library:ai_parse.progress')}/>}
  <ol className="flex flex-wrap gap-2">{p.state.pages.map(page=><li key={page.page} className="rounded border px-2 py-1"><span aria-hidden="true" className={`mr-1 inline-block size-2 rounded-full ${page.status==='done'?'bg-green-600':page.status==='failed'?'bg-destructive':'bg-muted-foreground'}`}/>{page.page} · {p.t('library:ai_parse.'+page.status)}</li>)}</ol>
  {!busy && (!p.estimate || p.disabled || p.estimate.reason) && <p>{p.t('library:estimate_hint')}</p>}
  <div className="flex flex-wrap gap-2">{busy?<Button variant="outline" onClick={p.onCancel}>{p.t('common:cancel')}</Button>:<Button disabled={p.disabled || !p.estimate || !!p.estimate.reason} onClick={p.onStart}>{p.t('library:ai_parse.'+(p.state.status==='cancelled'?'resume':'start'))}</Button>}
   {p.state.pages.some(page=>page.status==='done') && <><Button variant="outline" disabled={busy} onClick={()=>p.onUse('ai')}>{p.t('library:ai_parse.use')}</Button><Button variant="outline" disabled={busy} onClick={()=>p.onUse('original')}>{p.t('library:ai_parse.revert')}</Button><Button variant="ghost" disabled={busy} onClick={p.onDiscard}>{p.t('library:ai_parse.discard')}</Button></>}

  </div>
 </section>;
}
