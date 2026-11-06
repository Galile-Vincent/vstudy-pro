/** Reusable public Moodle snapshots for Electron visual checks and marketing captures. No school network or credentials. */
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';

export function courseArtFixture(now = Date.now()) {
  const id = n => `a17c0000-0000-4000-a000-${String(n).padStart(12, '0')}`;
  const at = days => new Date(now + days * 86400000).toISOString();
  const account = { id: id(1), siteUrl: 'https://moodle.example.edu', siteName: 'Chung Yuan Christian University', remoteUserId: 42, displayName: 'Alex Chen', status: 'connected', syncedAt: at(-0.002) };
  const catalog = [
    ['Algorithms & Data Structures', '演算法與資料結構', 'CS201', 'Dr. Mei-Ling Lin', '林美玲', 64, 'Graph traversal problem set', 0.7],
    ['Visual Communication', '視覺傳達設計', 'DES204', 'Prof. Daniel Huang', '黃建文', 38, 'Editorial design exploration', 2],
    ['Probability & Statistics', '機率與統計', 'MA203', 'Dr. Chih-Wen Su', '蘇志文', 82, 'Random variables quiz', 3],
    ['Computer Networks', '計算機網路', 'CS305', 'Dr. Yu-Chun Shen', '沈俞君', 46, 'Network protocol analysis', 4],
    ['Human–Computer Interaction', '人機互動', 'CS318', 'Prof. Sarah Wu', '吳思涵', null, 'Usability research journal', 5],
    ['Environmental Science', '環境科學', 'SCI108', 'Dr. James Chen', '陳志明', 24, 'Urban ecology field notes', 6],
    ['Digital Photography', '數位攝影', 'ART210', 'Prof. Yi-Ting Lee', '李怡婷', 0, 'Light & shadow study', 12],
    ['Introduction to Philosophy', '哲學概論', 'HUM101', 'Dr. Hsin-Yi Wang', '王心怡', 100, 'Final reflection', -30],
  ];
  const details = catalog.map(([en, zh, code, teacher, teacherZh, progress, task, due], i) => {
    const courseId = id(10 + i), base = 100 + i * 100;
    const imageUrl = i === 3 || i === 5 ? `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${i === 3 ? '#16405e' : '#284e3d'}"/><stop offset="1" stop-color="#18242e"/></linearGradient></defs><path fill="url(#g)" d="M0 0h640v360H0z"/>${Array.from({length:12},(_,n)=>`<path d="M${n*80-240} 360L${n*80+140} 0" stroke="${i===3?'#7bc2d8':'#c7d5a1'}" stroke-opacity=".25" stroke-width="${i===3?2:30}"/>`).join('')}</svg>`)}` : null;
    const course = { id: courseId, accountId: account.id, remoteId: i + 1, fullName: `${zh} ${en}`, shortName: code, imageUrl, progress, startAt: at(-50), endAt: at(i === 7 ? -15 : 70), favourite: false, identity: { title: {zh,en}, teachers: [{zh:teacherZh,en:teacher}], code, term: i === 7 ? '1142' : '1151', classLabel: {zh:'資訊二乙',en:'CS · Year 2'}, lifecycle: i === 7 ? 'past' : 'current', lifecycleSource: 'server', hidden:false, hasProgress:progress !== null, format:'weeks', summaryHtml:null } };
    const deadlines = [{id:id(base),courseId,title:task,kind:i===2?'quiz':'assignment',dueAt:at(due),url:null,submitted:i===7}, {id:id(base+1),courseId,title:'Project proposal',kind:'event',dueAt:at(14+i),url:null,submitted:false}];
    const files = [{id:id(base+2),courseId,section:'Week 8 · Exploring connections',module:'Lecture',name:'Week 8 lecture notes.pdf',mime:'application/pdf',size:2450000,modifiedAt:at(-1),documentId:null}];
    const module = (n,name,kind,completion) => ({id:id(base+n),cmid:base+n,kind,modname:kind,name,descriptionHtml:'<h2>Before our next class</h2><p>Explore the worked examples in the lecture notes. Write down two questions and bring a first attempt to our discussion.</p>',url:null,accessible:true,completion,dueAt:kind==='assign'?at(due):null,submitted:kind==='assign'?false:null,fileIds:kind==='resource'?[files[0].id]:[]});
    return {course,deadlines,files,reminders:[],cacheState:'fresh',lastSyncedAt:at(-0.002),fetchState:'idle',notifications:[{id:id(base+3),accountId:account.id,courseId,subject:'A few notes for our next class',body:'Review the worked examples before class. Bring your questions and a first draft of your work. We will compare approaches together.',createdAt:at(-0.2),read:i%3===0,url:null}], grades:[{courseId,name:'Weekly practice',grade:'27',max:30,percentage:90,gradedAt:at(-3)},{courseId,name:'Midterm assessment',grade:'42',max:50,percentage:84,gradedAt:at(-7)},{courseId,name:'Final project',grade:null,max:100,percentage:null,gradedAt:null}],announcements:[{id:id(base+4),subject:'This week · Connecting ideas to practice',author:teacher,createdAt:at(-1),bodyHtml:'<p>Our next session brings together the ideas from the first half of the term. Review the examples and bring your notebook.</p><p>Office hours are Thursday, 14:00–16:00.</p>',url:null}],sections:[{id:id(base+5),number:7,name:'Week 7 · Building foundations',summaryHtml:null,accessible:true,current:false,weekStart:at(-7),modules:[module(10,'Practice & reflection','resource','complete')]},{id:id(base+6),number:8,name:'Week 8 · Exploring connections',summaryHtml:'<p>Connect the concepts, work through examples, and test your understanding.</p>',accessible:true,current:true,weekStart:at(-1),modules:[module(11,'Lecture notes & worked examples','resource','complete'),module(12,task,'assign','incomplete'),module(13,'Questions for our next discussion','forum','none')]},{id:id(base+7),number:9,name:'Week 9 · Putting it into practice',summaryHtml:null,accessible:true,current:false,weekStart:at(6),modules:[module(14,'Project workshop','page','none')]}]};
  });
  return { account, details, overview: {accounts:[account],courses:details.map(d=>d.course),summaries:details.map(({course,notifications,reminders})=>({course,notifications,reminders})),upcoming:details.flatMap(d=>d.deadlines),otherNotifications:[],unreadNotifications:details.flatMap(d=>d.notifications).filter(n=>!n.read).length} };
}

/** Install fixture read handlers on an isolated Electron application. */
export async function seedArtCourses(app, now) {
  const fixture = courseArtFixture(now);
  const path = await app.evaluate(({app})=>app.getPath('userData'));
  const db = new DatabaseSync(join(path,'vstudy.sqlite'));
  try {
    db.exec('PRAGMA foreign_keys=ON');
    db.prepare('INSERT OR REPLACE INTO moodle_accounts(id,siteUrl,remoteUserId,data) VALUES (?,?,?,?)').run(fixture.account.id,fixture.account.siteUrl,fixture.account.remoteUserId,JSON.stringify(fixture.account));
    for(const {course} of fixture.details) db.prepare('INSERT OR REPLACE INTO moodle_courses(id,accountId,data) VALUES (?,?,?)').run(course.id,course.accountId,JSON.stringify(course));
  } finally {db.close();}
  await app.evaluate(({ipcMain}, fixture) => {
    for (const [channel,handler] of Object.entries({
      'moodle:overview':()=>fixture.overview,
      'moodle:course':(_event,{courseId})=>fixture.details.find(d=>d.course.id===courseId),
      'moodle:sync':()=>({errors:[],ok:true}),
    })) { ipcMain.removeHandler(channel); ipcMain.handle(channel,handler); }
  },fixture);
  return fixture;
}
