import {expect,it} from 'vitest';
import {computeMastery,type MasteryObservation} from './mastery';
const day=86400000, base=Date.UTC(2030,0,1), iso=(days:number)=>new Date(base+days*day).toISOString();
const negative:MasteryObservation={id:'1',jobId:'1',occurredAt:iso(0),errorType:'misconception',signal:'wrong',evidenceKind:'quote',confidence:1,resolved:false};
it('computes stable expanding due dates and resets after negative evidence',()=>{
 const due=(attempts:{at:string;correct:boolean;confirmed:boolean;reportedBad?:boolean}[],rows=[negative])=>computeMastery(rows,{now:base+30*day,attempts}).nextReviewAt;
 expect(due([])).toBe(iso(1));
 expect(due([{at:iso(2),correct:true,confirmed:true}])).toBe(iso(5));
 expect(due([{at:iso(2),correct:true,confirmed:true},{at:iso(6),correct:true,confirmed:true}])).toBe(iso(13));
 expect(due([{at:iso(2),correct:true,confirmed:true},{at:iso(6),correct:false,confirmed:true}])).toBe(iso(7));
 expect(due([{at:iso(2),correct:true,confirmed:false},{at:iso(3),correct:true,confirmed:true,reportedBad:true}])).toBe(iso(1));
 expect(due([],[])).toBeNull();
 expect(computeMastery([negative],{now:base+day,userState:'dismissed'}).nextReviewAt).toBeNull();
});
