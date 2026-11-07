import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewAudit } from './security-audit.mjs';
const report = {advisories:{123:{module_name:'fixture',findings:[{version:'1.0.0'}]}},metadata:{vulnerabilities:{low:1}}};
const accepted = {123:{reason:'Pending upstream update',expires:'2027-02-05',package:'fixture',version:'1.0.0'}};
test('accepts a reviewed package version before expiry',()=>assert.deepEqual(reviewAudit(report,accepted,new Date('2026-11-07')),[]));
test('rejects expired entries even if no longer reported',()=>assert.match(reviewAudit({advisories:{}},accepted,new Date('2027-02-06'))[0],/expired/));
test('rejects package and version drift and unreviewed advisories',()=>{
 for(const entry of [{...accepted[123],package:'other'},{...accepted[123],version:'2.0.0'}])assert.match(reviewAudit(report,{123:entry},new Date('2026-11-07'))[0],/drift/);
 assert.match(reviewAudit(report,{},new Date('2026-11-07'))[0],/unreviewed/);
});
test('rejects malformed exceptions and checks every finding',()=>{
 assert.match(reviewAudit(report,{123:{}},new Date('2026-11-07'))[0],/invalid/);
 const multiple=JSON.parse(JSON.stringify(report));multiple.advisories[123].findings.push({version:'1.1.0'});
 assert.match(reviewAudit(multiple,accepted,new Date('2026-11-07'))[0],/drift/);
});
