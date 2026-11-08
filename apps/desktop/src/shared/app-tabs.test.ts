import { it, expect } from 'vitest';
import { tabSetSchema, tabPresentationSchema, tabRouteSchema } from './app-tabs';
import { initialTabs } from '../renderer/shell/tab-state';
const state = initialTabs('00000000-0000-4000-8000-000000000001');
it('validates a strict bounded tab set and history', () => {
  expect(tabSetSchema.safeParse(state).success).toBe(true);
  for (const invalid of [{ ...state, token: 'secret' }, { ...state, activeId: crypto.randomUUID() }, { ...state, tabs: [] }, { ...state, tabs: [...state.tabs, ...state.tabs] }, { ...state, tabs: [{ ...state.tabs[0], history: { entries: [{ view: 'home' }], index: 2 } }] }, { ...state, tabs: [{ ...state.tabs[0], presentation: { kind: 'app', scrollTop: -1 } }] }]) expect(tabSetSchema.safeParse(invalid).success).toBe(false);
});
it('rejects more than 30 distinct tabs and unknown presentation fields', () => {
  expect(tabSetSchema.safeParse({ ...state, tabs: Array.from({ length: 31 }, (_, index) => ({ ...state.tabs[0], id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}` })) }).success).toBe(false);
  expect(tabSetSchema.safeParse({ ...state, tabs: [{ ...state.tabs[0], presentation: { kind: 'app', scrollTop: 0, cookie: 'not allowed' } }] }).success).toBe(false);
});
it('persists only redacted native URLs',()=>{
  const input={...state,tabs:[{...state.tabs[0],history:{entries:[{view:'moodle',accountId:state.activeId,target:{kind:'page',url:'https://school.example/?token=secret&id=1'}}],index:0},presentation:{kind:'moodle',accountId:state.activeId,url:'https://school.example/?sesskey=secret&id=1',zoom:1,scrollTop:20}}]};
  const persisted=JSON.stringify(tabSetSchema.parse(input));
  expect(persisted).not.toContain('secret');
  expect(persisted).toContain('id=1');
});

it('bounds drafts and reader state and validates hosted restoration',()=>{
  expect(tabRouteSchema.safeParse({view:'hosted-chat'}).success).toBe(false);
  expect(tabRouteSchema.parse({view:'hosted-chat',provider:'gemini'}).provider).toBe('gemini');
  for(const presentation of [
    {kind:'app',scrollTop:0,draft:'x'.repeat(100001)},
    {kind:'document',scrollTop:0,readerScrollTop:Infinity},
    {kind:'document',scrollTop:0,paneSizes:[-1,101]},
    {kind:'document',scrollTop:0,readerMode:'html'},
  ])expect(tabPresentationSchema.safeParse(presentation).success).toBe(false);
  const saved=JSON.stringify(tabPresentationSchema.parse({kind:'hosted-chat',provider:'gemini',url:'https://gemini.google.com/app/thread?token=secret#secret',scrollTop:0}));
  expect(saved).not.toContain('secret');expect(saved).toContain('/app/thread');
});
it('validates imported document markers in persisted Moodle history',()=>{
 const route={view:'moodle',accountId:'11111111-1111-4111-a111-111111111111',target:{kind:'file',fileId:'11111111-1111-4111-a111-111111111111'},importedDocumentId:'11111111-1111-4111-a111-111111111111'};
 expect(tabRouteSchema.safeParse(route).success).toBe(true);
 expect(tabRouteSchema.safeParse({...route,importedDocumentId:'invalid'}).success).toBe(false);
 expect(tabRouteSchema.safeParse({...route,cookies:'secret'}).success).toBe(false);
});
