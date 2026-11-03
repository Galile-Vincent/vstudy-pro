import type { Store } from '../db';
export function localDate(now:Date,zone:string):string {return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function shiftDay(date:string,days:number) {const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
export function computeStreak(rows:{date:string;chatCount:number;readSeconds:number;importCount:number}[],zone:string,clock:()=>Date) {
 const today=localDate(clock(),zone);const days=new Set(rows.filter(r=>r.chatCount>0||r.importCount>0||r.readSeconds>=60).map(r=>r.date).filter(d=>d<=today));
 let current=0;for(let d=days.has(today)?today:shiftDay(today,-1);days.has(d);d=shiftDay(d,-1)) current++;
 let best=0,run=0,previous='';for(const d of [...days].sort()){run=previous&&shiftDay(previous,1)===d?run+1:1;best=Math.max(best,run);previous=d;}
 return {current,best,today:days.has(today),days:Array.from({length:7},(_,i)=>{const date=shiftDay(today,i-6);return {date,studied:days.has(date)};})};
}
export class ActivityService {
 constructor(private readonly store:Store,readonly zone=Intl.DateTimeFormat().resolvedOptions().timeZone,private readonly clock=()=>new Date()){}
 record(kind:'chat'|'import'|'read',documentId:string,seconds=0,eventId?:string) {
  const now=this.clock();const db=this.store.db;db.exec('SAVEPOINT activity');
  try{
   if(eventId && !db.prepare('INSERT OR IGNORE INTO activity_events(id,documentId,kind,createdAt) VALUES(?,?,?,?)').run(eventId,documentId,kind,now.toISOString()).changes){db.exec('RELEASE activity');return;}
   db.prepare('INSERT INTO activity_days VALUES(?,?,?,?) ON CONFLICT(date) DO UPDATE SET chatCount=chatCount+excluded.chatCount,readSeconds=readSeconds+excluded.readSeconds,importCount=importCount+excluded.importCount').run(localDate(now,this.zone),kind==='chat'?1:0,kind==='read'?Math.min(60,Math.max(0,Math.floor(seconds))):0,kind==='import'?1:0);
   db.exec('RELEASE activity');
  }catch(e){db.exec('ROLLBACK TO activity; RELEASE activity');throw e;}
 }
 opened(id:string){this.store.db.prepare('UPDATE documents SET lastOpenedAt=? WHERE id=? AND deletedAt IS NULL').run(this.clock().toISOString(),id);}
 streak(){return computeStreak(this.store.db.prepare('SELECT * FROM activity_days').all() as {date:string;chatCount:number;readSeconds:number;importCount:number}[],this.zone,this.clock);}
}
