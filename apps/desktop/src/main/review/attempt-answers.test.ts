import {it,expect} from 'vitest';
import {fixture} from './regression-fixture';
import {Attempts} from './attempts';
import {validateStudyData} from '../db/study-validation';
it.each([
 ['true_false','true'],['true_false',1],['mcq',true],['mcq',2],['mcq',-1],['mcq',0.5],['cloze',true],['cloze','x'.repeat(2001)],
] as const)('rejects invalid %s answers without writing', (type,answer)=>{const f=fixture();try{
 const art=f.a.create(f.request,f.snapshot,'token');
 const common={id:'q1',conceptKey:'force',stem:'Question',explanation:'Explanation',source:{...f.source,quote:'Force'}};
 const item=type==='mcq'?{...common,type,options:['A','B'],answer:0}:type==='cloze'?{...common,type,answer:'Force',alternatives:[]}:{...common,type,answer:true};
 f.a.finish(art.id,'token',{test:{version:1,items:[item]}});
 const engine=new Attempts(f.a),attempt=engine.start(art.id);
 expect(()=>engine.answer(attempt.id,'q1',answer)).toThrow('review.invalid_answer');
 expect(engine.get(attempt.id).answers).toEqual({});
 expect(()=>validateStudyData(f.store.db)).not.toThrow();
}finally{f.store.close();}});
