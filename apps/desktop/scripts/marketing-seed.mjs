/** Populate an isolated marketing profile. Uses real imports and planner IPC; synthetic saved chats never contact AI. */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { waitForDocumentStatus } from '../e2e/helpers/document-status.mjs';
import { seedArtCourses } from '../e2e/fixtures/art-courses.mjs';

export const captureTime = Date.parse('2026-11-06T02:00:00Z');
export const passage = 'Breadth-first search explores a graph one layer at a time. A queue keeps the frontier in order, so every vertex is reached along a shortest path in an unweighted graph.';
const reading = `# Graphs, one connection at a time

CS201 · Week 8 · Dr. Mei-Ling Lin

A city map, a circle of friends, a network of ideas. Graphs help us see how things connect, and find a way through.

## Start with the frontier

${passage}

Think of ripples spreading across a pond. First visit the starting point, then its neighbours, then their neighbours. Mark each vertex when it enters the queue so you never visit it twice.

> The first time you reach a vertex, you have found its shortest path from the source.

## Two ways to explore

| Strategy | Data structure | A good fit |
| --- | --- | --- |
| Breadth-first search | Queue | Shortest unweighted paths |
| Depth-first search | Stack | Dependencies and cycles |

Both methods take **O(V + E)** time with an adjacency list. The difference is the order in which they explore.

## Try it on paper

Draw six connected vertices. Start at A, record the queue after each step, and trace the shortest path to F.

### Questions for our next class

- Why do we mark a vertex when we enqueue it?
- What changes when edges have different weights?
- Where could you use a graph in everyday life?
`;
const library = [
  ['Graphs, one connection at a time', reading, 'Course notes'],
  ['機率與統計：從直覺到推論', '# 機率與統計\n\nMA203 · 第八週 · 蘇志文老師\n\n## 讓資料說故事\n\n統計是一種理解不確定性的方法。從觀察開始，提出問題，再用資料檢驗你的想法。\n\n## 隨機變數與期望值\n\n期望值描述大量重複實驗的平均結果。它不是每一次實驗的預測，而是長期趨勢。\n\n> 好的問題，比複雜的公式更重要。\n\n## 本週練習\n\n- 比較離散與連續分布。\n- 用生活中的例子解釋條件機率。\n- 整理抽樣與估計的重點。', 'Course notes'],
  ['The shape of a good question', '# The shape of a good question\n\nHCI research journal · November 2026\n\n## Listen before you design\n\nAn interview is a chance to understand how someone sees the world. Ask about a recent experience, then give them room to tell the story.\n\n## Follow the detail\n\nAsk what happened next. Look for the moments when expectations and experience diverge. These moments often reveal the most useful design questions.', 'Research studio'],
  ['Light & shadow: a field notebook', '# Light & shadow\n\nART210 · Observation notebook\n\n## Morning light\n\nLook for the places where light becomes soft. Make three photographs of the same scene, each with a different point of attention.\n\n## A study in contrast\n\nLet the shadows describe the shape. Leave space for the viewer to notice the small details.', 'Research studio'],
  ['Networks beneath the everyday', '# Networks beneath the everyday\n\nCS305 · Protocol study guide\n\n## A journey in packets\n\nFollow a request from a browser to a server. Each layer adds the information needed for the next part of the journey.\n\n## Reliable delivery\n\nSequence numbers and acknowledgements let the receiver reconstruct a stream even when packets arrive out of order.', 'Course notes'],
  ['An ecology of small places', '# An ecology of small places\n\nSCI108 · Urban field observations\n\n## Begin close to home\n\nA small patch of shade can hold a surprising variety of life. Record the temperature, light, and species you notice at the same time each day.\n\n## Connect the observations\n\nCompare your notes across a week. Which patterns repeat? Which questions need a longer study?', 'Research studio'],
];

export async function seedMarketing(app, page, directory) {
  const call = (channel, request) => page.evaluate(({channel,request}) => window.desktop.invoke(channel,request), {channel,request});
  await page.waitForFunction(() => !!window.desktop?.invoke);
  await app.evaluate((_electron,now)=>{
    const NativeDate=Date, startedAt=NativeDate.now();
    globalThis.Date=class extends NativeDate {constructor(...args){super(...(args.length?args:[now]));}static now(){return now+NativeDate.now()-startedAt;}};
    let sequence=0;
    process.getBuiltinModule('crypto').randomUUID=()=>`b00c0000-0000-4000-a000-${String(++sequence).padStart(12,'0')}`;
  },captureTime);
  const fixture = await seedArtCourses(app, captureTime);
  await call('settings:set', {...await call('settings:get', {}), onboardingCompleted:true, welcomeSeen:true, displayName:'Alex', language:'en', chatSide:'right', lastProviderId:'anthropic-api', lastModelId:'fake'});
  await call('providers:configure', {kind:'api',id:'anthropic-api',enabled:true});
  await page.evaluate(() => {
    window.localStorage.setItem('vstudy-onboarding-v1', JSON.stringify({version:1,step:'start',goal:'documents',status:'completed',done:['setup','document','walkthrough','help'],dismissed:['workspace','courses']}));
    window.localStorage.setItem('library-grid','true');
    window.localStorage.setItem('vstudy:citation-hint-seen','1');
  });
  const folders = new Map();
  for (const name of ['Course notes','Research studio']) folders.set(name, await call('library:folders:create',{name,parentId:null}));
  const documents = [];
  for (const [title,text,folder] of library) {
    const path = join(directory,`${title.replaceAll('/','-')}.md`);
    await writeFile(path,text);
    await app.evaluate(({dialog},path) => {dialog.showOpenDialog = async () => ({canceled:false,filePaths:[path]});},path);
    const doc = await call('documents:import',{folderId:folders.get(folder).id});
    await waitForDocumentStatus(page,doc.id);
    await call('library:documents:rename',{documentId:doc.id,title});
    await call('documents:read',{documentId:doc.id});
    documents.push(doc);
  }
  const at = days => new Date(captureTime + days * 86400000).toISOString();
  const tasks=[];
  for (const [i,title] of ['Trace three shortest paths','Finish the editorial moodboard','Review conditional probability','Sketch the network layers','Prepare interview questions'].entries()) {
    tasks.push(await call('planner:quick-add',{title,courseId:fixture.details[i].course.id,dueAt:at(i<3?0.5:i-1),estimateMinutes:[35,50,25,40,30][i]}));
  }
  await call('planner:approve',{approvalId:randomUUID(),action:{type:'make-study-plan',title:'Friday focus',timeZone:'Asia/Taipei',dailyBudgetMinutes:120,assumptions:['A focused evening with a little room between sessions.'],blocks:tasks.slice(0,3).map((task,i)=>({title:task.title,courseId:task.courseId,target:{kind:'task',id:task.id},startsAt:new Date(captureTime+(8*60+[0,35,85][i])*60000).toISOString(),durationMinutes:task.estimateMinutes}))}});
  await call('planner:approve',{approvalId:randomUUID(),action:{type:'create-exam',exam:{title:'Probability & Statistics · Midterm',courseId:fixture.details[2].course.id,date:at(4),scopeTopics:['Random variables','Conditional probability','Sampling & estimation'],materialIds:[],deadlineId:null}}});
  const db = new DatabaseSync(join(await app.evaluate(({app})=>app.getPath('userData')),'vstudy.sqlite'));
  try {
    const titles = ['Finding the shortest path','Designing a calmer reading experience','A little intuition for probability','How packets find their way','Better questions for interviews','Reading the city as an ecosystem','Seeing with light & shadow','A plan for the week ahead'];
    const offset = reading.indexOf(passage);
    const citation = {id:'s1',documentId:documents[0].id,title:'Start with the frontier',offset,quote:passage};
    for (const [i,title] of titles.entries()) {
      const id = `c0de0000-0000-4000-a000-${String(i+1).padStart(12,'0')}`, date = at(-i*0.45);
      const scope = i===7?'general':i===1?'course':'document';
      db.prepare('INSERT INTO conversations(id,scope,documentId,courseId,providerId,modelId,createdAt,updatedAt,title,pinned) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,scope,scope==='document'?documents[[0,2,1,4,2,5,3,0][i]].id:null,scope==='course'?fixture.details[1].course.id:null,'anthropic-api','fake',date,date,title,i===0?1:0);
      const question = i===0?'Why does a queue help us find the shortest path?':`Help me understand ${title.toLowerCase()}.`;
      const answer = i===0?`A queue visits the closest vertices first. Think of ripples spreading across water.\n\n- **Explore one layer at a time.** Visit every neighbour before moving farther away.\n- **Keep the first route.** It is the shortest path in an unweighted graph. [[cite:s1]]\n\n**Try it:** start at A and write down the queue after each visit.`:[null,'A calmer reading experience begins with a clear hierarchy. Give the main text room, keep supporting controls quiet, and let the reader choose when to ask a question.','An expected value describes the long-run average. Try rolling a die many times: individual results vary, but their average moves toward 3.5.','A packet carries an address for each part of its journey. Routers choose the next hop; TCP sequence numbers help the destination put everything back in order.','Ask about a recent experience instead of a hypothetical preference. Follow up with what happened next, and listen for the detail that changes your understanding.','Compare observations from the same place and time each day. Temperature, light, and the species you notice can reveal how a small urban habitat changes.','Photograph the same scene in morning and afternoon light. Compare the direction of the shadows and notice which details become the focus.','Set aside a short session for each subject. Start with the nearest deadline and leave a little room to review what you learned.'][i];
      for (const [role,text] of [['user',question],['assistant',answer]]) {
        const part = {type:'text',text,...(i===0&&role==='user'?{selection:{documentId:documents[0].id,startOffset:offset,endOffset:offset+passage.length,text:passage,headingPath:['Start with the frontier']}}:{}),...(i===0&&role==='assistant'?{citations:[citation],status:'complete'}:{})};
        db.prepare('INSERT INTO messages(id,conversationId,role,parts,createdAt) VALUES (?,?,?,?,?)').run(`c17e0000-0000-4000-a000-${String(i*2+(role==='assistant'?2:1)).padStart(12,'0')}`,id,role,JSON.stringify([part]),new Date(Date.parse(date)+(role==='assistant'?1000:0)).toISOString());
      }
    }
  } finally {db.close();}

  const providers=await call('providers:list',{discover:false});
  await app.evaluate(({ipcMain},providers)=>{ipcMain.removeHandler('providers:list');ipcMain.handle('providers:list',()=>providers.map(provider=>({...provider,models:provider.models.map(model=>({...model,name:model.id==='fake'?'Demo assistant':model.name}))})));},providers);
  return {fixture,documents,call};
}
