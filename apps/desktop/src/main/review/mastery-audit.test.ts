import {expect,it} from 'vitest';
import {computeMastery,type MasteryObservation} from './mastery';
import {buildEpisodes} from './episodes';
const day=86400000,base=Date.UTC(2030,0,1),iso=(days:number)=>new Date(base+days*day).toISOString();
const row=(days:number,changes:Partial<MasteryObservation>={}):MasteryObservation=>({id:String(days),jobId:String(days),occurredAt:iso(days),signal:'wrong',errorType:'misconception',confidence:1,evidenceKind:'quote',resolved:false,...changes});
it('weighs slips and corrected attempts below uncorrected misconceptions',()=>{
 const score=(changes:Partial<MasteryObservation>)=>computeMastery([row(0,changes)],{now:base}).negative;
 expect(score({errorType:'slip'})).toBeLessThan(score({}));
 expect(score({resolved:true})).toBeGreaterThan(0);
 expect(score({resolved:true})).toBeLessThan(score({}));
});
it('does not count wrong then fixed in one episode as a full weakness',()=>{
 expect(computeMastery([row(0),row(0.01,{signal:'resolved',errorType:'none',resolved:true})],{now:base+day}).state).not.toBe('needs_review');
});
it('does not split a study episode at local midnight or at 04:00',()=>{
 for(const times of [['2030-01-01T15:40:00Z','2030-01-01T16:20:00Z'],['2030-01-01T19:40:00Z','2030-01-01T20:20:00Z']]){
  expect(buildEpisodes(times.map((occurredAt,id)=>({...row(id),occurredAt})),'Asia/Taipei')).toHaveLength(1);
 }
});
it('adds confirmed quiz failures to review and clears with spaced quiz successes',()=>{
 const attempts=[{at:iso(0),correct:false,confirmed:true},{at:iso(1),correct:false,confirmed:true}];
 expect(computeMastery([],{now:base+day,attempts}).state).toBe('needs_review');
 expect(computeMastery([],{now:base+5*day,attempts:[...attempts,{at:iso(2),correct:true,confirmed:true},{at:iso(5),correct:true,confirmed:true}]}).state).not.toBe('needs_review');
 expect(computeMastery([],{now:base+2*day,attempts:[...attempts,{at:iso(2),correct:true,confirmed:true},{at:iso(2.01),correct:true,confirmed:true}]}).state).toBe('needs_review');
});
it('ignores unconfirmed, reported-bad and future quiz evidence',()=>{
 expect(computeMastery([],{now:base+day,attempts:[{at:iso(0),correct:false,confirmed:false},{at:iso(0),correct:false,confirmed:true,reportedBad:true},{at:iso(2),correct:false,confirmed:true}]}).state).toBe('candidate');
});
it('lets old negative evidence decay out of needs review',()=>{
 expect(computeMastery([row(0),row(1)],{now:base+120*day}).state).not.toBe('needs_review');
});
it('new quiz failure overrides an older resolved observation or understood click',()=>{
 const attempts=[{at:iso(3),correct:false,confirmed:true},{at:iso(4),correct:false,confirmed:true}];
 expect(computeMastery([row(0),row(1,{resolved:true,signal:'resolved'})],{now:base+4*day,understoodAt:iso(2),attempts}).state).toBe('needs_review');
});
it('counts several errors followed by a correction as one reduced session signal',()=>{
 const observations=[0,1].flatMap(d=>[row(d),row(d+.01),row(d+.02,{signal:'resolved',errorType:'none',resolved:true})]);
 expect(computeMastery(observations,{now:base+2*day}).negative).toBeLessThan(.6);
 expect(computeMastery(observations,{now:base+2*day}).state).not.toBe('needs_review');
});
