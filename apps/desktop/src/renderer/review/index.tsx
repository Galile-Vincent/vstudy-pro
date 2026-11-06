import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, RefreshCw } from 'lucide-react';
import type { Conversation } from '../../shared/domain';
import type { IpcResponse } from '../../shared/ipc';
import { tr } from '../../shared/i18n';
import { desktop } from '../bridge';
import { useNavigate } from '../shell';
import { Button } from '../components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { useReviewPage, type Cursor } from './paging';
import { ArtifactPlaceholder, type ReviewSelection } from './artifact-placeholder';
import './review.css';
/** W2 supplies this adapter once retry and paused reasons are available. W1 never invokes unknown IPC. */
export type ReviewJobsAdapter = { status?: 'offline'|'budget'|'error'; retry?: (jobId?: string)=>Promise<void> };
type Course = IpcResponse<'review:courses:list'>['items'][number];
function PageState({page,empty}:{page:{loading:boolean;error:boolean;items:unknown[];cursor:Cursor|null;retry:()=>void;more:()=>void};empty?:string}) {
 return <>{page.error && <p role="alert">{tr('review:error')} <Button onClick={page.retry}>{tr('review:retry')}</Button></p>}{page.loading && <p role="status">{tr('review:loading')}</p>}{!page.loading&&!page.error&&!page.items.length&&empty&&<div className="review-empty"><BookOpen aria-hidden="true"/><p>{tr(`review:${empty}`)}</p><Button onClick={page.retry}>{tr('review:retry')}</Button></div>}{page.cursor&&<Button disabled={page.loading} onClick={page.more}>{tr('review:load_more')}</Button>}</>;
}
export function ReviewView({jobsAdapter}:{jobsAdapter?:ReviewJobsAdapter}) {
 useTranslation();
 const {navigate}=useNavigate();
 const [courseId,setCourseId]=useState(''),[tab,setTab]=useState('recent'),[revision,setRevision]=useState(0),[actionError,setActionError]=useState(false),[busy,setBusy]=useState(false),[selection,setSelection]=useState<ReviewSelection|null>(null);
 const courses=useReviewPage(useCallback((cursor?:Cursor)=>desktop.invoke('review:courses:list',{includeArchived:false,limit:50,...(cursor?{cursor}:{})}),[]));
 const course=courses.items.find(c=>c.id===courseId);
 const failedAction=useRef<(()=>Promise<unknown>)|null>(null);
 const reload=()=>setRevision(n=>n+1);
 const mutate=async(action:()=>Promise<unknown>)=>{failedAction.current=action;setBusy(true);setActionError(false);try{await action();reload();}catch{setActionError(true);}finally{setBusy(false);}};
 const open=(conversationId:string,messageId?:string)=>navigate({view:'history',conversationId:conversationId as Conversation['id'],messageId});
 const artifacts=(kind:'note'|'test',keys:string[],labels:string[])=>{setSelection({courseId,conceptKeys:keys,labels});setTab(kind==='note'?'notes':'tests');};
 return <main className="review-page"><div className="review-content"><header className="review-heading"><div><h1>{tr('review:title')}</h1><p>{tr('review:subtitle')}</p></div><Button variant="ghost" aria-label={tr('review:retry')} onClick={()=>{courses.retry();reload();}}><RefreshCw size={16}/></Button></header>
 <div className="review-toolbar"><label>{tr('review:course_picker')}<select aria-label={tr('review:course_picker')} value={courseId} onChange={e=>{setCourseId(e.target.value);setSelection(null);}}><option value="">{tr('review:unsorted')}</option>{courses.items.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label></div>
 <PageState page={courses}/><CourseTools course={course} refresh={()=>{courses.retry();reload();}} onCreated={setCourseId}/>
 {actionError&&<p role="alert">{tr('review:error')} <Button onClick={()=>{if(failedAction.current)void mutate(failedAction.current);}}>{tr('review:retry')}</Button></p>}
 {jobsAdapter?.status&&<p role="status">{tr(`review:${jobsAdapter.status}`)} <Button disabled={!jobsAdapter.retry||busy} onClick={()=>void mutate(async()=>{await jobsAdapter.retry?.();})}>{tr('review:retry')}</Button></p>}
 {!courseId ? <Inbox key={revision} courses={courses.items} open={open}/> : <Tabs value={tab} onValueChange={setTab}><TabsList aria-label={tr('review:title')}>{['recent','weak','notes','tests'].map(t=><TabsTrigger key={t} value={t}>{tr(`review:${t}`)}</TabsTrigger>)}</TabsList>
 <TabsContent value="recent"><Recent key={courseId+revision} course={course} courseId={courseId} open={open} mutate={mutate} busy={busy} jobsAdapter={jobsAdapter}/></TabsContent>
 <TabsContent value="weak"><Weak key={courseId+revision} courseId={courseId} open={open} mutate={mutate} busy={busy} artifacts={artifacts}/></TabsContent>
 <TabsContent value="notes"><ArtifactPlaceholder kind="note" selection={selection}/></TabsContent><TabsContent value="tests"><ArtifactPlaceholder kind="test" selection={selection}/></TabsContent></Tabs>}
 </div></main>;
}
function CourseTools({course,refresh,onCreated}:{course:Course|undefined;refresh:()=>void;onCreated:(id:string)=>void}) {
 const [title,setTitle]=useState(''),[failed,setFailed]=useState(false),[busy,setBusy]=useState(false),[moodle,setMoodle]=useState<IpcResponse<'moodle:overview'>|null>(null);
 const failedAction=useRef<(()=>Promise<unknown>)|null>(null);
 const run=async(action:()=>Promise<unknown>)=>{failedAction.current=action;setBusy(true);setFailed(false);try{await action();refresh();}catch{setFailed(true);}finally{setBusy(false);}};
 return <details className="review-tools"><summary>{tr('review:manage_courses')}</summary><form onSubmit={e=>{e.preventDefault();void run(async()=>{const c=await desktop.invoke('review:courses:create',{title:title.trim(),aliases:[]});setTitle('');onCreated(c.id);});}}><label>{tr('review:course_title')}<input value={title} maxLength={240} required onChange={e=>setTitle(e.target.value)}/></label><Button disabled={busy||!title.trim()} type="submit">{tr('review:create_course')}</Button></form>
 {course&&<><Button disabled={busy} onClick={()=>void run(()=>desktop.invoke('review:courses:archive',{courseId:course.id,archived:true}).then(()=>onCreated('')))}>{tr('review:archive')}</Button><Button disabled={busy} onClick={()=>void run(async()=>setMoodle(await desktop.invoke('moodle:overview',{})))}>{tr('review:link_moodle')}</Button>{moodle&&<label>{tr('review:link_moodle')}<select value={course.moodleCourseId??''} disabled={busy} onChange={e=>void run(()=>desktop.invoke('review:courses:link-moodle',{courseId:course.id,moodleCourseId:e.target.value||null}))}><option value="">{tr('review:unlinked')}</option>{moodle.courses.map(c=><option key={c.id} value={c.id}>{c.fullName}</option>)}</select></label>}</>}{failed&&<p role="alert">{tr('review:error')} <Button onClick={()=>{if(failedAction.current)void run(failedAction.current);}}>{tr('review:retry')}</Button></p>}</details>;
}
function Inbox({courses,open}:{courses:Course[];open:(id:string)=>void}) {
 const page=useReviewPage(useCallback((cursor?:Cursor)=>desktop.invoke('review:chat:inbox',{limit:20,...(cursor?{cursor}:{})}),[]));
 const [failed,setFailed]=useState(false),[busy,setBusy]=useState(false);
 const run=async(action:()=>Promise<unknown>)=>{setBusy(true);try{await action();page.retry();}catch{setFailed(true);}finally{setBusy(false);}};
 return <section><h2>{tr('review:unsorted')}</h2><p>{tr('review:inbox_help')}</p>{failed&&<p role="alert">{tr('review:error')} <Button onClick={()=>{setFailed(false);page.retry();}}>{tr('review:retry')}</Button></p>}<ul className="review-list">{page.items.map((link,i)=><li key={link.conversationId}><Button variant="ghost" onClick={()=>open(link.conversationId)}>{tr('review:chat_number',{number:i+1})}</Button><label>{tr('review:move')}<select aria-label={tr('review:move')} value="" disabled={busy} onChange={e=>void run(()=>desktop.invoke('review:chat:assign',{conversationId:link.conversationId,courseId:e.target.value}))}><option value="">{tr('review:course_picker')}</option>{courses.map(c=><option value={c.id} key={c.id}>{c.title}</option>)}</select></label><Button disabled={busy} onClick={()=>void run(()=>desktop.invoke('review:chat:exclude',{conversationId:link.conversationId,excluded:!link.excludeFromMemory}))}>{tr(link.excludeFromMemory?'review:include_chat':'review:exclude_chat')}</Button></li>)}</ul><PageState page={page} empty="inbox_empty"/></section>;
}
function Recent({course,courseId,open,mutate,busy,jobsAdapter}:{course:Course|undefined;courseId:string;open:(id:string,messageId:string)=>void;mutate:(action:()=>Promise<unknown>)=>Promise<void>;busy:boolean;jobsAdapter:ReviewJobsAdapter|undefined}) {
 const page=useReviewPage(useCallback((cursor?:Cursor)=>desktop.invoke('review:jobs:page',{courseId,limit:20,...(cursor?{cursor}:{})}),[courseId]));
 const units=useReviewPage(useCallback((cursor?:Cursor)=>desktop.invoke('review:courses:units',{courseId,limit:50,...(cursor?{cursor}:{})}),[courseId]));
 const observations=useReviewPage(useCallback((cursor?:Cursor)=>desktop.invoke('review:observations:page',{courseId,limit:50,...(cursor?{cursor}:{})}),[courseId]));
 const [edit,setEdit]=useState<string|null>(null),[text,setText]=useState('');
 return <section><h2>{tr('review:recent')}</h2><p>{tr('review:recent_help')}</p><ol className="review-list">{page.items.map(job=><li key={job.id}><time dateTime={job.occurredAt}>{new Date(job.occurredAt).toLocaleDateString(document.documentElement.lang||'en')}</time><span className="review-chip">{course?.title??tr('review:unsorted')}</span>{[...new Set(observations.items.filter(o=>o.jobId===job.id).map(o=>o.unitId))].map(id=>{const unit=units.items.find(u=>u.id===id);return unit?<span className="review-chip" key={unit.id}>{unit.title}</span>:null;})}{edit===job.id?<form onSubmit={e=>{e.preventDefault();void mutate(async()=>{await desktop.invoke('review:jobs:edit',{jobId:job.id,changes:{questionSummary:text}});setEdit(null);});}}><label>{tr('review:summary')}<input autoFocus value={text} maxLength={240} onChange={e=>setText(e.target.value)}/></label><Button type="submit" disabled={busy||!text.trim()}>{tr('review:save')}</Button><Button type="button" onClick={()=>setEdit(null)}>{tr('review:cancel')}</Button></form>:<Button variant="ghost" className="review-question" onClick={()=>open(job.conversationId,job.userMessageId)}>{job.questionSummary??tr('review:pending')}</Button>}<div className="review-actions"><Button disabled={busy} onClick={()=>{setEdit(job.id);setText(job.questionSummary??'');}}>{tr('review:edit')}</Button><Button disabled={busy} onClick={()=>void mutate(()=>desktop.invoke('review:chat:exclude',{conversationId:job.conversationId,excluded:true}))}>{tr('review:exclude_chat')}</Button>{job.status!=='succeeded'&&<span>{tr(`review:job_${job.status}`)}{job.status==='failed'&&<Button disabled={!jobsAdapter?.retry||busy} title={!jobsAdapter?.retry?tr('review:retry_unavailable'):undefined} onClick={()=>void mutate(async()=>{await jobsAdapter?.retry?.(job.id);})}>{tr('review:retry')}</Button>}</span>}</div></li>)}</ol><PageState page={page} empty="recent_empty"/><details><summary>{tr('review:related_units')}</summary><PageState page={units}/><PageState page={observations}/></details></section>;
}
function Weak({courseId,open,mutate,busy,artifacts}:{courseId:string;open:(id:string,messageId:string)=>void;mutate:(action:()=>Promise<unknown>)=>Promise<void>;busy:boolean;artifacts:(kind:'note'|'test',keys:string[],labels:string[])=>void}) {
 const page=useReviewPage(useCallback((cursor?:Cursor)=>desktop.invoke('review:courses:mastery',{courseId,limit:5,...(cursor?{cursor}:{})}),[courseId]));
 const weak=page.items.filter(c=>c.mastery.state==='needs_review');
 const [editing,setEditing]=useState<string|null>(null),[label,setLabel]=useState('');
 return <section><div className="review-section-heading"><div><h2>{tr('review:needs_review')}</h2><p>{tr('review:weak_help')}</p></div><Button disabled={!weak.length} onClick={()=>artifacts('test',weak.map(c=>c.key),weak.map(c=>c.label))}>{tr('review:today')}</Button></div><Popover><PopoverTrigger asChild><Button variant="ghost" className="review-help">{tr('review:why')}</Button></PopoverTrigger><PopoverContent><p>{tr('review:evidence_rule')}</p></PopoverContent></Popover><ul className="review-list">{weak.map(c=><li key={c.id}><h3>{c.label}</h3>{editing===c.id&&<form onSubmit={e=>{e.preventDefault();void mutate(()=>desktop.invoke('review:concepts:edit',{conceptId:c.id,changes:{label}}));}}><label>{tr('review:rename')}<input autoFocus maxLength={240} value={label} onChange={e=>setLabel(e.target.value)}/></label><Button disabled={busy||!label.trim()} type="submit">{tr('review:save')}</Button><Button type="button" onClick={()=>setEditing(null)}>{tr('review:cancel')}</Button></form>}<div className="review-actions"><Button onClick={()=>artifacts('note',[c.key],[c.label])}>{tr('review:make_note')}</Button><Button onClick={()=>artifacts('test',[c.key],[c.label])}>{tr('review:make_test')}</Button><Button disabled={busy} onClick={()=>void mutate(()=>desktop.invoke('review:concepts:understood',{conceptId:c.id}))}>{tr('review:understood')}</Button><Button onClick={()=>{setEditing(c.id);setLabel(c.label);}}>{tr('review:rename')}</Button><Button disabled={busy} onClick={()=>void mutate(()=>desktop.invoke('review:concepts:dismiss',{conceptId:c.id}))}>{tr('review:dismiss')}</Button></div><Evidence courseId={courseId} conceptKey={c.key} open={open}/></li>)}</ul>{!page.loading&&!page.error&&!weak.length&&<p>{tr('review:weak_empty')}</p>}<PageState page={page}/></section>;
}
function Evidence({courseId,conceptKey,open}:{courseId:string;conceptKey:string;open:(id:string,messageId:string)=>void}) {
 const [expanded,setExpanded]=useState(false);
 return <details onToggle={e=>setExpanded(e.currentTarget.open)}><summary>{tr('review:evidence')}</summary>{expanded&&<EvidencePage courseId={courseId} conceptKey={conceptKey} open={open}/>}</details>;
}
function EvidencePage({courseId,conceptKey,open}:{courseId:string;conceptKey:string;open:(id:string,messageId:string)=>void}) {
 const page=useReviewPage(useCallback((cursor?:Cursor)=>desktop.invoke('review:observations:page',{courseId,limit:20,...(cursor?{cursor}:{})}),[courseId]));
 return <><ul>{page.items.filter(o=>o.conceptKey===conceptKey).map(o=><li key={o.id}><p>{o.weaknessNote}</p><blockquote>{o.evidenceQuote}</blockquote><Button onClick={()=>open(o.conversationId,o.userMessageId)}>{tr('review:open_evidence')}</Button></li>)}</ul><PageState page={page} empty="evidence_empty"/></>;
}
