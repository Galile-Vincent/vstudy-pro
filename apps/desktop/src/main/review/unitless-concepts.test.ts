import {it,expect} from 'vitest';
import {fixture} from './regression-fixture';
import {resolveScope} from './scope';
it('keeps selected unitless concepts and resolves attached course sources',()=>{const f=fixture();try{
 const c=f.r.addConcept({courseId:f.c.id,label:'Energy',unitId:null,note:null});
 const resolved=resolveScope({kind:'concepts',conceptKeys:[c.key]},f.a.scopeInputs(f.c.id));
 expect(resolved.status).toBe('resolved');expect(resolved.snapshot.documentIds).toEqual([f.d]);expect(resolved.snapshot.conceptKeys).toEqual([c.key]);
 const selected=resolveScope({kind:'documents',documentIds:[f.d]},f.a.scopeInputs(f.c.id));
 expect(selected.snapshot.conceptKeys).toContain(c.key);
 f.r.unlinkDocument(f.c.id,f.d);
 const missing=resolveScope({kind:'concepts',conceptKeys:[c.key]},f.a.scopeInputs(f.c.id));
 expect(missing.status).toBe('needs_source_selection');expect(missing.snapshot.conceptKeys).toContain(c.key);
}finally{f.store.close();}});
