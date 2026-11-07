import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { courseArtFixture } from './art-courses.mjs';

export const captureTime = Date.parse('2026-11-06T04:00:00Z');
export function coursesDesignFixture() {
  const base = courseArtFixture(captureTime);
  const id = n => `dc000000-0000-4000-a000-${String(n).padStart(12, '0')}`;
  const at = days => new Date(captureTime + days * 86400000).toISOString();
  const titles = ['資料結構與演算法', '視覺傳達設計與跨媒體敘事實作：從概念研究到整合設計的專題工作坊', 'Probability & Statistics', '計算機網路', 'Human Computer Interaction', '環境科學與永續城市研究', 'Digital Photography', '哲學概論', '人工智慧導論與負責任科技應用', 'Academic English', '專題研究與實務討論'];
  const tasks = ['期中專題報告：從日常觀察到問題定義與研究方法的完整提案', '編輯設計實驗：跨媒體敘事作品與設計歷程反思', 'Random variables and probability distributions', '網路協定分析與封包傳輸實驗報告', '使用者研究：訪談紀錄、洞察整理與原型評估', '永續城市田野調查與環境議題分析', 'Light and shadow study'];
  const subjects = ['課程公告：下週課堂準備事項與討論主題', 'Your assignment has been graded', 'New reply in the weekly discussion', '本週教材已更新：閱讀資料與練習範例'];
  const details = titles.map((title, i) => {
    const template = structuredClone(base.details[i % base.details.length]);
    const courseId = id(10 + i);
    template.course = {...template.course, id:courseId, remoteId:10+i, fullName:title, shortName:`${['CS','DES','MA','CS','CS','SCI','ART','HUM','CS','ENG','RES'][i]}${201+i}`, imageUrl:null, progress:i===2?36:i===6?null:0, endAt:at(70), identity:{...template.course.identity,title:{zh:title,en:title},teachers:i===4||i===9?[]:[{zh:`範例教師 ${i+1}`,en:`Example Teacher ${i+1}`}],code:`${['CS','DES','MA','CS','CS','SCI','ART','HUM','CS','ENG','RES'][i]}${201+i}`,term:'1151',lifecycle:'current'}};
    template.deadlines = i<7 ? [{id:id(100+i),courseId,title:tasks[i],kind:i===2?'quiz':'assignment',dueAt:at([0.2,0.7,1.4,2,3,4,6][i]),url:null,submitted:false}] : [];
    if (i===0 || i===2 || i===7) template.deadlines.push(...Array.from({length:i===0?2:1},(_,j)=>({id:id(400+i*10+j),courseId,title:`練習與反思 ${j+1}`,kind:'assignment',dueAt:at(-2-j),url:null,submitted:false})));
    if (i===3) {
      template.course.fullName='1151Operating Systems-EXAMPLE TEACHER 4';
      template.course.identity.title={en:template.course.fullName,zh:'1151作業系統-範例教師 4'};
    }
    if (i===5) template.deadlines.push({id:id(499),courseId,title:'已提交的研究摘要',kind:'assignment',dueAt:at(-1),url:null,submitted:true});
    template.notifications = Array.from({length:3},(_,j)=>({id:id(200+i*3+j),accountId:base.account.id,courseId,source:'message',subject:subjects[(i+j)%subjects.length],body:'請先閱讀本週的講義與範例，記錄兩個你想討論的問題。\nReview the worked examples before our next class. Bring your questions and a first draft to the discussion.',createdAt:at(-[0.03,1.1,3.2][j]-i*0.006),read:i===4||i===8||(i+j)%3===0,url:null}));
    template.files=[]; template.sections=[]; template.announcements=[]; template.grades=[];
    return template;
  });
  const account={...base.account,siteName:'Example University',displayName:'Example Student',syncedAt:at(-0.002)};
  return {account,details};
}

export async function seedCoursesDesign(app, profile) {
  const fixture=coursesDesignFixture();
  const db=new DatabaseSync(join(profile,'vstudy.sqlite'));
  try {
    db.exec('PRAGMA foreign_keys=ON');
    db.prepare('INSERT OR REPLACE INTO moodle_accounts(id,siteUrl,remoteUserId,data) VALUES (?,?,?,?)').run(fixture.account.id,fixture.account.siteUrl,fixture.account.remoteUserId,JSON.stringify(fixture.account));
    for(const detail of fixture.details) {
      db.prepare('INSERT OR REPLACE INTO moodle_courses(id,accountId,data) VALUES (?,?,?)').run(detail.course.id,fixture.account.id,JSON.stringify(detail.course));
      for(const deadline of detail.deadlines) db.prepare('INSERT OR REPLACE INTO moodle_deadlines(id,courseId,data) VALUES (?,?,?)').run(deadline.id,detail.course.id,JSON.stringify(deadline));
      for(const [n,item] of detail.notifications.entries()) db.prepare('INSERT OR REPLACE INTO moodle_notifications(id,remoteId,accountId,data) VALUES (?,?,?,?)').run(item.id,detail.course.remoteId*100+n,fixture.account.id,JSON.stringify(item));
    }
  } finally {db.close();}
  await app.evaluate(async ({ipcMain,session},{fixture,profile})=>{
    const {DatabaseSync}=process.getBuiltinModule('node:sqlite');
    const db=new DatabaseSync(profile+'/vstudy.sqlite');
    const notifications=()=>db.prepare('SELECT data FROM moodle_notifications').all().map(row=>JSON.parse(row.data));
    globalThis.__coursesDesignOverview=()=>{
      const items=notifications();
      return {accounts:[fixture.account],courses:db.prepare('SELECT data FROM moodle_courses ORDER BY id').all().map(row=>JSON.parse(row.data)),pinnedCourseIds:db.prepare('SELECT courseId FROM moodle_course_pins').all().map(row=>row.courseId),upcoming:db.prepare('SELECT data FROM moodle_deadlines').all().map(row=>JSON.parse(row.data)),summaries:fixture.details.map(d=>({course:d.course,notifications:items.filter(n=>n.courseId===d.course.id),reminders:[]})),otherNotifications:[],unreadNotifications:items.filter(n=>!n.read).length};
    };
    ipcMain.removeHandler('moodle:overview'); ipcMain.handle('moodle:overview',globalThis.__coursesDesignOverview);
    session.defaultSession.webRequest.onBeforeRequest({urls:['https://*/*','http://*/*']},(_details,callback)=>callback({cancel:true}));
    globalThis.fetch=async()=>{throw new Error('Capture fixture prohibits network');};
    ipcMain.removeHandler('moodle:course'); ipcMain.handle('moodle:course',(_event,{courseId})=>({...fixture.details.find(d=>d.course.id===courseId),deadlines:db.prepare('SELECT data FROM moodle_deadlines WHERE courseId=?').all(courseId).map(row=>JSON.parse(row.data)),notifications:notifications().filter(item=>item.courseId===courseId)}));
    ipcMain.removeHandler('moodle:sync'); ipcMain.handle('moodle:sync',()=>({...globalThis.__coursesDesignOverview(),errors:[]}));
  },{fixture,profile});
  return fixture;
}

export async function changeDeadlineOnNextSync(app, profile, courseId, dueAt) {
  await app.evaluate(({ipcMain},{profile,courseId,dueAt})=>{
    ipcMain.removeHandler('moodle:sync');
    ipcMain.handle('moodle:sync',()=>{
      const {DatabaseSync}=process.getBuiltinModule('node:sqlite'),db=new DatabaseSync(profile+'/vstudy.sqlite');
      const row=db.prepare("SELECT id,data FROM moodle_deadlines WHERE courseId=? AND json_extract(data,'$.dueAt') > ? LIMIT 1").get(courseId,new Date('2026-11-06T04:00:00Z').toISOString());
      const deadline=JSON.parse(row.data);db.prepare('UPDATE moodle_deadlines SET data=? WHERE id=?').run(JSON.stringify({...deadline,dueAt}),row.id);db.close();
      return {...globalThis.__coursesDesignOverview(),errors:[]};
    });
  },{profile,courseId,dueAt});
}
