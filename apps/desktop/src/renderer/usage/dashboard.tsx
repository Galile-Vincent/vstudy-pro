import { useEffect, useState } from 'react';
import type { IpcResponse, UsagePeriod, UsageSummary } from '../../shared';
import { desktop } from '../bridge';
import { money, compactTokens } from './chip';
import './usage.css';
type Dashboard = IpcResponse<'usage:dashboard'>;
export function UsageTrend({ days }: Pick<Dashboard,'days'>) {
  const max = Math.max(1,...days.map(d => d.inputTokens + d.outputTokens));
  const width = 720, height = 124, column = width / Math.max(1,days.length);
  return <figure className="usage-trend">
    <figcaption><strong>Daily tokens</strong><span><i className="usage-key input"/>Input <i className="usage-key output"/>Output · peak {compactTokens(max === 1 && days.every(d => !d.inputTokens && !d.outputTokens) ? 0 : max)}</span></figcaption>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Daily input and output tokens. Exact values are available in the daily totals table.">
      <line x1="0" x2={width} y1={height-1} y2={height-1} className="usage-axis"/>
      {days.map((d,i) => {
        const input=d.inputTokens/max*(height-8), output=d.outputTokens/max*(height-8);
        return <g key={d.date}><title>{d.date}: {d.inputTokens.toLocaleString()} input, {d.outputTokens.toLocaleString()} output</title><rect className="usage-bar-input" x={i*column+column*.17} width={column*.66} y={height-1-input} height={input}/><rect className="usage-bar-output" x={i*column+column*.17} width={column*.66} y={height-1-input-output} height={output}/></g>;
      })}
    </svg>
    <div className="usage-axis-labels"><span>{days[0]?.date}</span><span>{days.at(-1)?.date}</span></div>
    <details><summary>Daily totals</summary><div className="usage-breakdown"><table><thead><tr><th>Date</th><th>Input</th><th>Output</th><th>Total tokens</th></tr></thead><tbody>{days.map(d=><tr key={d.date}><td>{d.date}</td><td>{d.inputTokens.toLocaleString()}</td><td>{d.outputTokens.toLocaleString()}</td><td>{(d.inputTokens+d.outputTokens).toLocaleString()}</td></tr>)}</tbody></table></div></details>
  </figure>;
}
export function UsageOverview({ data }: { data: Dashboard }) {
  const {summary:s}=data;
  return <div className="usage-overview">
    <div className="usage-token-total"><span>Total tokens</span><strong>{(s.inputTokens+s.outputTokens).toLocaleString()}</strong><span>{s.calls.toLocaleString()} recorded model calls</span></div>
    <dl className="usage-token-details">{[['Input',s.inputTokens],['Output',s.outputTokens],['Cache read',data.cacheReadTokens],['Cache write',data.cacheWriteTokens],['Reasoning',data.reasoningTokens]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{Number(value).toLocaleString()}</dd></div>)}</dl>
    <div className="usage-cost-total"><span>Recorded cost</span><strong>{money(s.costUsd ?? (s.calls ? undefined : 0))}</strong><span>{s.unknownPrices ? `${s.unknownPrices} calls unpriced; total is a lower bound.` : 'Reported and estimated costs'}</span></div>
  </div>;
}
function groupRows(summary: UsageSummary, by: 'provider'|'model'|'document', documents: IpcResponse<'documents:list'>) {
  const rows=new Map<string,{label:string; tokens:number; costUsd:number|undefined; unknown:number; calls:number}>();
  for(const g of summary.groups) {
    const key=by==='provider'?g.providerId:by==='model'?`${g.providerId}/${g.modelId}`:g.documentId??'No document';
    const label=by==='document' ? documents.find(d=>d.id===g.documentId)?.title ?? key : key;
    const r=rows.get(key)??{label,tokens:0,costUsd:undefined,unknown:0,calls:0};
    r.tokens+=g.inputTokens+g.outputTokens;r.calls+=g.calls;r.unknown+=g.unknownPrices;if(g.costUsd!==undefined)r.costUsd=(r.costUsd??0)+g.costUsd;rows.set(key,r);
  }
  return [...rows.entries()].sort((a,b)=>b[1].tokens-a[1].tokens||a[0].localeCompare(b[0]));
}
export function UsageDashboard({ documents }: {documents:IpcResponse<'documents:list'>}) {
  const [period,setPeriod]=useState<UsagePeriod>('all');
  const [data,setData]=useState<Dashboard>();
  const [error,setError]=useState('');
  const [by,setBy]=useState<'provider'|'model'|'document'>('provider');
  const [revision,setRevision]=useState(0);
  useEffect(()=>{
    let active=true;setData(undefined);setError('');
    const refresh=()=>{void desktop.invoke('usage:dashboard',{period}).then(value=>{if(active){setData(value);setError('');}}).catch(()=>{if(active)setError('Could not load usage. Try refreshing.');});};
    refresh();window.addEventListener('usage-updated',refresh);
    return()=>{active=false;window.removeEventListener('usage-updated',refresh);};
  },[period,revision]);
  return <section className="usage-dashboard" aria-label="Overall token dashboard">
    <div className="usage-dashboard-toolbar"><div><h3>Overall usage</h3><p className="muted">All providers and documents recorded by VStudy on this device.</p></div><div className="row"><select aria-label="Usage period" value={period} onChange={e=>setPeriod(e.target.value as UsagePeriod)}><option value="all">All time</option><option value="month">This month</option><option value="last30days">Last 30 days</option><option value="day">Today</option></select><button onClick={()=>setRevision(r=>r+1)}>Refresh usage</button></div></div>
    {error ? <p role="alert">{error}</p> : !data ? <p role="status">Loading dashboard…</p> : <>
      <UsageOverview data={data}/>
      {!data.summary.calls && <p className="muted">No model usage recorded in this period. Send a chat to start tracking.</p>}
      <p className="usage-count-note muted">Input includes cache reads and writes. Output includes reasoning. CLI costs are API-equivalent (subscription), not subscription charges.</p>
      <UsageTrend days={data.days}/>{period==='all'&&<p className="muted">Totals cover all time; the chart shows the last 30 calendar days.</p>}
      <div className="usage-breakdown-heading"><strong>Breakdown</strong><select aria-label="Group usage by" value={by} onChange={e=>setBy(e.target.value as typeof by)}><option value="provider">Provider</option><option value="model">Model</option><option value="document">Document</option></select></div>
      <div className="usage-breakdown"><table><thead><tr><th>{by==='provider'?'Provider':by==='model'?'Provider / model':'Document'}</th><th>Tokens</th><th>Calls</th><th>Cost</th></tr></thead><tbody>{groupRows(data.summary,by,documents).map(([key,r])=><tr key={key}><td>{r.label}</td><td>{r.tokens.toLocaleString()}</td><td>{r.calls}</td><td>{money(r.costUsd)}{r.unknown>0&&' + unknown'}</td></tr>)}</tbody></table></div>
    </>}
  </section>;
}
