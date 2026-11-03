import { useTranslation } from "react-i18next";
import { tr } from '../../shared/i18n';
import { useEffect, useState } from 'react';
import type { IpcResponse, UsagePeriod, UsageSummary } from '../../shared';
import { useFormat } from '../i18n';
import { desktop } from '../bridge';
import { money, compactTokens } from './chip';
import './usage.css';
type Dashboard = IpcResponse<'usage:dashboard'>;
export function UsageTrend({ days }: Pick<Dashboard,'days'>) {
  useTranslation();
  const format = useFormat();
  const max = Math.max(1,...days.map(d => d.inputTokens + d.outputTokens));
  const width = 720, height = 124, column = width / Math.max(1,days.length);
  return <figure className="usage-trend">
    <figcaption><strong>{tr('common:daily_tokens')}</strong><span><i className="usage-key input"/>{tr('common:input')}<i className="usage-key output"/>{tr('common:output_peak')}{compactTokens(max === 1 && days.every(d => !d.inputTokens && !d.outputTokens) ? 0 : max)}</span></figcaption>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={tr('common:daily_input_and_output_tokens_exact_values_are_available_in_the_daily_totals_table')}>
      <line x1="0" x2={width} y1={height-1} y2={height-1} className="usage-axis"/>
      {days.map((d,i) => {
        const input=d.inputTokens/max*(height-8), output=d.outputTokens/max*(height-8);
        return <g key={d.date}><title>{tr('usage:daily_description',{date:d.date,input:format.number(d.inputTokens),output:format.number(d.outputTokens)})}</title><rect className="usage-bar-input" x={i*column+column*.17} width={column*.66} y={height-1-input} height={input}/><rect className="usage-bar-output" x={i*column+column*.17} width={column*.66} y={height-1-input-output} height={output}/></g>;
      })}
    </svg>
    <div className="usage-axis-labels"><span>{days[0]?.date}</span><span>{days.at(-1)?.date}</span></div>
    <details><summary>{tr('common:daily_totals')}</summary><div className="usage-breakdown"><table><thead><tr><th>{tr('common:date')}</th><th>{tr('common:input')}</th><th>{tr('common:output')}</th><th>{tr('common:total_tokens')}</th></tr></thead><tbody>{days.map(d=><tr key={d.date}><td>{d.date}</td><td>{format.number(d.inputTokens)}</td><td>{format.number(d.outputTokens)}</td><td>{format.number((d.inputTokens+d.outputTokens))}</td></tr>)}</tbody></table></div></details>
  </figure>;
}
export function UsageOverview({ data }: { data: Dashboard }) {
  useTranslation();
  const format = useFormat();
  const {summary:s}=data;
  return <div className="usage-overview">
    <div className="usage-token-total"><span>{tr('common:total_tokens')}</span><strong>{format.number((s.inputTokens+s.outputTokens))}</strong><span>{format.number(s.calls)} {tr('common:recorded_model_calls')}</span></div>
    <dl className="usage-token-details">{[[tr('common:input'),s.inputTokens],[tr('common:output'),s.outputTokens],[tr('common:cache_read'),data.cacheReadTokens],[tr('common:cache_write'),data.cacheWriteTokens],[tr('common:reasoning'),data.reasoningTokens]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{format.number(Number(value))}</dd></div>)}</dl>
    <div className="usage-cost-total"><span>{tr('common:recorded_cost')}</span><strong>{money(s.costUsd ?? (s.calls ? undefined : 0))}</strong><span>{s.unknownPrices ? tr('usage:unknown_calls',{count:s.unknownPrices}) : tr('common:reported_and_estimated_costs')}</span></div>
  </div>;
}
function groupRows(summary: UsageSummary, by: 'provider'|'model'|'document', documents: IpcResponse<'documents:list'>) {
  const rows=new Map<string,{label:string; tokens:number; costUsd:number|undefined; unknown:number; calls:number}>();
  for(const g of summary.groups) {
    const key=by==='provider'?g.providerId:by==='model'?`${g.providerId}/${g.modelId}`:g.documentId??tr('common:no_document');
    const label=by==='document' ? documents.find(d=>d.id===g.documentId)?.title ?? key : key;
    const r=rows.get(key)??{label,tokens:0,costUsd:undefined,unknown:0,calls:0};
    r.tokens+=g.inputTokens+g.outputTokens;r.calls+=g.calls;r.unknown+=g.unknownPrices;if(g.costUsd!==undefined)r.costUsd=(r.costUsd??0)+g.costUsd;rows.set(key,r);
  }
  return [...rows.entries()].sort((a,b)=>b[1].tokens-a[1].tokens||a[0].localeCompare(b[0]));
}
export function UsageDashboard({ documents }: {documents:IpcResponse<'documents:list'>}) {
  useTranslation();
  const format = useFormat();
  const [period,setPeriod]=useState<UsagePeriod>('all');
  const [data,setData]=useState<Dashboard>();
  const [error,setError]=useState('');
  const [by,setBy]=useState<'provider'|'model'|'document'>('provider');
  const [revision,setRevision]=useState(0);
  useEffect(()=>{
    let active=true;setData(undefined);setError('');
    const refresh=()=>{void desktop.invoke('usage:dashboard',{period}).then(value=>{if(active){setData(value);setError('');}}).catch(()=>{if(active)setError(tr('common:could_not_load_usage_try_refreshing'));});};
    refresh();window.addEventListener('usage-updated',refresh);
    return()=>{active=false;window.removeEventListener('usage-updated',refresh);};
  },[period,revision]);
  return <section className="usage-dashboard" aria-label={tr('common:overall_token_dashboard')}>
    <div className="usage-dashboard-toolbar"><div><h3>{tr('common:overall_usage')}</h3><p className="muted">{tr('common:all_providers_and_documents_recorded_by_vstudy_on_this_device')}</p></div><div className="row"><select aria-label={tr('common:usage_period')} value={period} onChange={e=>setPeriod(e.target.value as UsagePeriod)}><option value="all">{tr('common:all_time')}</option><option value="month">{tr('common:this_month')}</option><option value="last30days">{tr('common:last_30_days')}</option><option value="day">{tr('common:today')}</option></select><button onClick={()=>setRevision(r=>r+1)}>{tr('common:refresh_usage')}</button></div></div>
    {error ? <p role="alert">{error}</p> : !data ? <p role="status">{tr('common:loading_dashboard')}</p> : <>
      <UsageOverview data={data}/>
      {!data.summary.calls && <p className="muted">{tr('common:no_model_usage_recorded_in_this_period_send_a_chat_to_start_tracking')}</p>}
      <p className="usage-count-note muted">{tr('common:input_includes_cache_reads_and_writes_output_includes_reasoning_cli_costs_are_api_equivalent_subscription_not_subscription_charges')}</p>
      <UsageTrend days={data.days}/>{period==='all'&&<p className="muted">{tr('common:totals_cover_all_time_the_chart_shows_the_last_30_calendar_days')}</p>}
      <div className="usage-breakdown-heading"><strong>{tr('common:breakdown')}</strong><select aria-label={tr('common:group_usage_by')} value={by} onChange={e=>setBy(e.target.value as typeof by)}><option value="provider">{tr('common:provider')}</option><option value="model">{tr('common:model')}</option><option value="document">{tr('common:document')}</option></select></div>
      <div className="usage-breakdown"><table><thead><tr><th>{by==='provider'?tr('common:provider'):by==='model'?'Provider / model':tr('common:document')}</th><th>{tr('common:tokens')}</th><th>{tr('common:calls')}</th><th>{tr('common:cost')}</th></tr></thead><tbody>{groupRows(data.summary,by,documents).map(([key,r])=><tr key={key}><td>{r.label}</td><td>{format.number(r.tokens)}</td><td>{r.calls}</td><td>{money(r.costUsd)}{r.unknown>0&&' + unknown'}</td></tr>)}</tbody></table></div>
    </>}
  </section>;
}
