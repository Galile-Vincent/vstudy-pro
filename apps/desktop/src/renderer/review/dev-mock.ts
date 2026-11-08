import { conversationSchema, messageSchema } from '../../shared/domain';
import { reviewGenerateIpc } from '../../shared/review-generate';
import { reviewIpc, studyConceptSchema, studyPrefsSchema } from '../../shared/review';
import type { IpcRequest, IpcResponse } from '../../shared/ipc';

type ReviewChannel = keyof typeof reviewIpc;
type Course = IpcResponse<'review:courses:create'>;
type Concept = IpcResponse<'review:courses:mastery'>['items'][number];
type Link = IpcResponse<'review:chat:assign'>;
type Job = IpcResponse<'review:jobs:page'>['items'][number];
type Observation = IpcResponse<'review:observations:page'>['items'][number];
const at = '2026-11-06T08:00:00.000Z';
const id = (number:number) => `00000000-0000-4000-8000-${String(number).padStart(12,'0')}`;
const request = <C extends ReviewChannel>(channel:C, input:unknown):IpcRequest<C> => reviewIpc[channel].request.parse(input) as IpcRequest<C>;

export function createReviewMock(demo = false) {
  let prefs = studyPrefsSchema.parse({});
  const courses:Course[] = [], concepts:Concept[] = [], links:Link[] = [], jobs:Job[] = [], observations:Observation[] = [];
  const units:IpcResponse<'review:courses:units'>['items'] = [];
  const documents = new Map<string, Set<string>>();
  if (demo) {
    courses.push({id:id(1),title:'Biology',aliases:[],moodleCourseId:null,createdAt:at,archivedAt:null});
    units.push({id:id(2),courseId:id(1),kind:'document',ordinal:1,title:'Cell transport',sourceKey:id(20),sourceSectionId:null,startsAt:null,endsAt:null});
    concepts.push({id:id(3),courseId:id(1),key:'osmosis',label:'Osmosis and diffusion',source:'heading',unitId:id(2),userState:'none',note:'Try explaining what moves across the membrane.',createdAt:at,mastery:{state:'needs_review',risk:1,negative:2,positive:0,episodeCount:2,nextReviewAt:at}});
    for (const n of [4,5]) {
      jobs.push({id:id(n),conversationId:id(10),userMessageId:id(n+20),assistantMessageId:id(n+30),courseId:id(1),status:'succeeded',errorCode:null,questionSummary:n===4?'How does water cross a cell membrane?':'What changes when a solution becomes more concentrated?',occurredAt:`2026-11-0${n}T08:00:00.000Z`,createdAt:at});
      observations.push({id:id(n+40),jobId:id(n),courseId:id(1),unitId:id(2),conceptKey:'osmosis',proposedLabel:null,errorType:'gap',signal:'confused',evidenceQuote:'I am not sure which direction water moves.',evidenceKind:'quote',weaknessNote:null,confidence:1,dismissed:false,resolved:false,wrongAttempt:false,createdAt:at,occurredAt:jobs.at(-1)!.occurredAt,conversationId:id(10),userMessageId:id(n+20),assistantMessageId:id(n+30),questionSummary:jobs.at(-1)!.questionSummary});
    }
    links.push({conversationId:id(11),courseId:null,method:'manual',confidence:1,confirmed:true,excludeFromMemory:false,revision:0,updatedAt:at});
  }
  function course(courseId:string) { const found=courses.find(row=>row.id===courseId); if(!found) throw new Error('Course unavailable'); return found; }
  function concept(conceptId:string) { const found=concepts.find(row=>row.id===conceptId); if(!found) throw new Error('Concept unavailable'); return found; }
  function link(conversationId:string) { let found=links.find(row=>row.conversationId===conversationId); if(!found) { found={conversationId,courseId:null,method:'manual',confidence:1,confirmed:true,excludeFromMemory:false,revision:0,updatedAt:at}; links.push(found); } return found; }
  function page<T>(rows:T[], input:{limit?:number|undefined;cursor?:{at:string;id:string}|undefined}, key:(row:T)=>{at:string;id:string}) {
    const sorted=[...rows].sort((a,b)=>key(b).at.localeCompare(key(a).at)||key(b).id.localeCompare(key(a).id));
    const remaining=sorted.filter(row=>!input.cursor||key(row).at<input.cursor.at||(key(row).at===input.cursor.at&&key(row).id<input.cursor.id));
    const items=remaining.slice(0,input.limit??50);
    return {items,nextCursor:remaining.length>items.length?key(items.at(-1)!):null};
  }
  function run(channel:ReviewChannel,input:unknown):unknown {
    switch(channel) {
      case 'review:prefs:get': return prefs;
      case 'review:prefs:set': prefs=studyPrefsSchema.parse({...prefs,...request(channel,input)}); return prefs;
      case 'review:prefs:erase': courses.length=concepts.length=links.length=jobs.length=observations.length=units.length=0; documents.clear(); prefs={...prefs,memoryEnabled:false}; return {ok:true};
      case 'review:courses:create': { const value=request(channel,input); const row:Course={id:crypto.randomUUID(),title:value.title,aliases:value.aliases??[],moodleCourseId:null,createdAt:new Date().toISOString(),archivedAt:null}; courses.push(row); return row; }
      case 'review:courses:update': { const value=request(channel,input); return Object.assign(course(value.courseId),value.changes); }
      case 'review:courses:get': return courses.find(row=>row.id===request(channel,input).courseId)??null;
      case 'review:courses:archive': { const value=request(channel,input); course(value.courseId).archivedAt=value.archived?new Date().toISOString():null; return {ok:true}; }
      case 'review:courses:link-moodle': { const value=request(channel,input); const row=course(value.courseId); row.moodleCourseId=value.moodleCourseId; return row; }
      case 'review:courses:materialize': { const value=request(channel,input); const found=courses.find(row=>row.moodleCourseId===value.moodleCourseId); if(found)return found; const row:Course={id:crypto.randomUUID(),title:'Moodle course',aliases:[],moodleCourseId:value.moodleCourseId,createdAt:new Date().toISOString(),archivedAt:null}; courses.push(row); return row; }
      case 'review:courses:list': { const value=request(channel,input); return page(courses.filter(row=>value.includeArchived||!row.archivedAt),value,row=>({at:row.createdAt,id:row.id})); }
      case 'review:courses:units': { const value=request(channel,input); return page(units.filter(row=>row.courseId===value.courseId),value,row=>({at,id:row.id})); }
      case 'review:courses:mastery': { const value=request(channel,input); return page(concepts.filter(row=>row.courseId===value.courseId),value,row=>({at:row.createdAt,id:row.id})); }
      case 'review:concepts:list': { const value=request(channel,input); return page(concepts.filter(row=>row.courseId===value.courseId).map(row=>studyConceptSchema.strip().parse(row)),value,row=>({at:row.createdAt,id:row.id})); }
      case 'review:concepts:add': { const value=request(channel,input); course(value.courseId); const row:Concept={...value,id:crypto.randomUUID(),key:value.label.toLocaleLowerCase(),source:'user',userState:'none',createdAt:new Date().toISOString(),unitId:value.unitId??null,note:value.note??null,mastery:{state:'candidate',risk:0,negative:0,positive:0,episodeCount:0,nextReviewAt:null}}; concepts.push(row); return studyConceptSchema.strip().parse(row); }
      case 'review:concepts:edit': { const value=request(channel,input); return studyConceptSchema.strip().parse(Object.assign(concept(value.conceptId),value.changes)); }
      case 'review:concepts:dismiss': { const row=concept(request(channel,input).conceptId); row.userState='dismissed';row.mastery.state='dismissed';return {ok:true}; }
      case 'review:concepts:restore': { const row=concept(request(channel,input).conceptId); row.userState='none';row.mastery.state='watching';return {ok:true}; }
      case 'review:concepts:understood': concept(request(channel,input).conceptId).mastery.state='watching';return {ok:true};
      case 'review:chat:link-get': return links.find(row=>row.conversationId===request(channel,input).conversationId)??null;
      case 'review:chat:assign': { const value=request(channel,input); if(value.courseId)course(value.courseId);const row=link(value.conversationId);row.courseId=value.courseId;row.revision++;row.updatedAt=new Date().toISOString(); for(const job of jobs.filter(job=>job.conversationId===value.conversationId))job.courseId=value.courseId;return row; }
      case 'review:chat:exclude': { const value=request(channel,input);const row=link(value.conversationId);row.excludeFromMemory=value.excluded;row.revision++;return row; }
      case 'review:chat:inbox': return page(links.filter(row=>!row.courseId),request(channel,input),row=>({at:row.updatedAt,id:row.conversationId}));
      case 'review:jobs:page': {const value=request(channel,input);return page(jobs.filter(row=>row.courseId===value.courseId&&!links.some(link=>link.conversationId===row.conversationId&&link.excludeFromMemory)),value,row=>({at:row.occurredAt,id:row.id}));}
      case 'review:jobs:delete': {const {jobId}=request(channel,input);const row=jobs.find(row=>row.id===jobId);if(!row)throw new Error('Summary unavailable');jobs.splice(jobs.indexOf(row),1);for(let i=observations.length-1;i>=0;i--)if(observations[i]!.jobId===jobId)observations.splice(i,1);return {ok:true};}
      case 'review:jobs:edit': {const value=request(channel,input);const row=jobs.find(row=>row.id===value.jobId);if(!row)throw new Error('Summary unavailable');row.questionSummary=value.changes.questionSummary;return {ok:true};}
      case 'review:observations:page': {const value=request(channel,input);return page(observations.filter(row=>row.courseId===value.courseId&&!links.some(link=>link.conversationId===row.conversationId&&link.excludeFromMemory)),value,row=>({at:row.createdAt,id:row.id}));}
      case 'review:observations:edit': {const value=request(channel,input);const row=observations.find(row=>row.id===value.observationId);if(!row)throw new Error('Evidence unavailable');Object.assign(row,value.changes);return {ok:true};}
      case 'review:observations:delete': {const value=request(channel,input);const index=observations.findIndex(row=>row.id===value.observationId);if(index>=0)observations.splice(index,1);return {ok:true};}
      case 'review:docs:link': {const value=request(channel,input);course(value.courseId);const set=documents.get(value.courseId)??new Set<string>();set.add(value.documentId);documents.set(value.courseId,set);return {ok:true};}
      case 'review:docs:unlink': {const value=request(channel,input);documents.get(value.courseId)?.delete(value.documentId);return {ok:true};}
    }
  }
  return (channel:string,input:unknown):unknown => {
    if(Object.hasOwn(reviewGenerateIpc,channel)) {
      const key=channel as keyof typeof reviewGenerateIpc;
      reviewGenerateIpc[key].request.parse(input);
      if(key==='review:exam:history')return {items:[],nextCursor:null};
      if(key==='review:artifact:list') return {items:[],nextCursor:null};
      if(key==='review:artifact:get') return null;
      if(key==='review:artifact:delete'||key==='review:artifact:cancel') return {ok:true};
      if(key==='review:artifact:export') return {saved:false};
      throw new Error(key.startsWith('review:attempt:')?'review.attempt_unavailable':'review.provider_unavailable');
    }
    if(!Object.hasOwn(reviewIpc,channel))return undefined;
    const key=channel as ReviewChannel;
    reviewIpc[key].request.parse(input);
    return reviewIpc[key].response.parse(run(key,input));
  };
}

export function reviewDemoChat() {
  return {
    conversations:[10,11].map(number=>conversationSchema.parse({id:id(number),scope:'general',providerId:'openai-api',modelId:'mock-model',createdAt:at})),
    messages:[4,5].flatMap(number=>[
      messageSchema.parse({id:id(number+20),conversationId:id(10),role:'user',parts:[{type:'text',text:number===4?'How does water cross a cell membrane?':'I am not sure which direction water moves.'}],createdAt:`2026-11-0${number}T08:00:00.000Z`}),
      messageSchema.parse({id:id(number+30),conversationId:id(10),role:'assistant',parts:[{type:'text',text:'Water moves across a selectively permeable membrane toward the side with more dissolved particles. Try comparing the two sides in your own words.'}],createdAt:`2026-11-0${number}T08:01:00.000Z`}),
    ]),
  };
}
