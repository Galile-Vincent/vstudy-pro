import {it,expect} from 'vitest';
import {fixture} from './regression-fixture';
import {resolveScope} from './scope';
it('keeps selected unitless concepts and resolves attached course sources',()=>{const f=fixture();try{
 const c=f.r.addConcept({courseId:f.c.id,label:'Energy',unitId:null,note:null});
 const conceptScope={kind:'concepts' as const,conceptKeys:[c.key]};
 const resolved=resolveScope(conceptScope,f.a.scopeInputs(f.c.id,conceptScope));
 expect(resolved.status).toBe('resolved');expect(resolved.snapshot.documentIds).toEqual([f.d]);expect(resolved.snapshot.conceptKeys).toEqual([c.key]);
 const documentScope={kind:'documents' as const,documentIds:[f.d]};
 const selected=resolveScope(documentScope,f.a.scopeInputs(f.c.id,documentScope));
 expect(selected.snapshot.conceptKeys).toContain(c.key);
 f.r.unlinkDocument(f.c.id,f.d);
 const missing=resolveScope(conceptScope,f.a.scopeInputs(f.c.id,conceptScope));
 expect(missing.status).toBe('needs_source_selection');expect(missing.snapshot.conceptKeys).toContain(c.key);
}finally{f.store.close();}});
