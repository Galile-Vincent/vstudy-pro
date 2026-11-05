/**
 * Regression coverage for moodle contents.
 * Owned by main/moodle.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
import { expect, it, vi } from 'vitest';
import { contentsWire, parseCourseContents, sanitizeCourseHtml, completionState } from './contents';
import { MoodleClient } from './client';
import { account, fixtureFetch } from './fixtures/support';

it('retains ordered contents, merges delegated sections, preserves locked rows and derives files',async () => {
 const course = (await new MoodleClient(account.siteUrl,'token',fixtureFetch()).courses(account))[0]!;
 course.identity.format = 'weeks'; course.startAt = '2026-11-01T00:00:00.000Z';
 const raw = contentsWire.parse([
  {id:10,section:0,name:'General',modules:[{id:1,name:'News',modname:'forum'},{id:0,name:'invalid'}]},
  {id:11,section:1,name:'Week 1',summary:'<p onclick="evil()">Summary<img src="https://site/pluginfile.php?token=secret"></p>',modules:[
   {id:2,name:'Read me',modname:'label',description:'<script>bad()</script><p>Read</p>'},
   {id:3,name:'Folder',modname:'folder',contents:[{type:'file',filename:'notes.pdf',fileurl:'https://ilearning.cycu.edu.tw/pluginfile.php/notes.pdf?token=secret',filesize:120}]},
   {id:4,name:'More',modname:'subsection',customdata:'{"sectionid":12}'},
   {id:5,name:'Homework',modname:'assign',uservisible:false},
   {id:6,name:'Quiz',modname:'quiz',completiondata:{state:2,tracking:1}},
  ]},
  {id:12,section:2,name:'More',modules:[{id:7,name:'Page',modname:'page'},{id:3,name:'Duplicate',modname:'folder'}]},
 ]);
 const result = parseCourseContents(raw,course,new Date('2026-11-03T00:00:00Z'));
 expect(result.sections.map(section => ({name:section.name,current:section.current,modules:section.modules.map(module => [module.cmid,module.kind,module.accessible,module.completion])}))).toEqual([
  {name:'General',current:false,modules:[[1,'forum',true,'none']]},
  {name:'Week 1',current:true,modules:[[2,'label',true,'none'],[3,'folder',true,'none'],[4,'subsection',true,'none'],[7,'page',true,'none'],[5,'assign',false,'none'],[6,'quiz',true,'pass']]},
 ]);
 expect(result.sections[1]!.summaryHtml).toBe('<p>Summary</p>');
 expect(result.sections[1]!.weekStart).toBe('2026-11-01T00:00:00.000Z');
 expect(result.files).toMatchObject([{url:'https://ilearning.cycu.edu.tw/pluginfile.php/notes.pdf',value:{name:'notes.pdf',size:120}}]);
 expect(result.sections[1]!.modules[1]!.fileIds).toEqual([result.files[0]!.value.id]);
 course.identity.format = 'topics';
 expect(parseCourseContents(raw,course).sections.map(row => row.current)).toEqual([false,false]);
});
it('uses server markers and avoids week inference on gapped sections',async () => {
 const course = (await new MoodleClient(account.siteUrl,'token',fixtureFetch()).courses(account))[0]!;
 course.identity.format = 'weeks'; course.startAt = '2026-11-01T00:00:00.000Z';
 const raw = contentsWire.parse([{id:1,section:1,name:'First',modules:[]},{id:2,section:3,name:'Third',highlighted:1,modules:[]}]);
 expect(parseCourseContents(raw,course,new Date('2026-11-02T00:00:00Z')).sections.map(row => [row.current,row.weekStart])).toEqual([[false,null],[true,null]]);
});
it('sanitizes active elements, attributes and images and maps completion literally',() => {
 expect(sanitizeCourseHtml('<iframe src="evil">bad</iframe><form>bad</form><svg onload="evil"></svg><a href="javascript:evil()">Link</a><p style="x" onmouseover="evil()">Text<img src=x onerror=evil()></p>')).toBe('Link<p>Text</p>');
 expect([undefined,0,1,2,3,8].map(state => completionState(state))).toEqual(['none','incomplete','complete','pass','fail','none']);
 expect(completionState(1,0)).toBe('none');
});

it.each([
 ['nullable file metadata', {contents:[{type:'file',filename:'notes.pdf',filesize:null,mimetype:null,timemodified:null}]}],
 ['nullable contents', {contents:null}],
 ['nullable completion', {completiondata:null}],
 ['nullable visibility', {visible:null,uservisible:null}],
 ['nullable instance', {instance:null}],
])('accepts real-world Moodle wire variation %s',(_name,fields) => {
 const parsed = contentsWire.safeParse([{id:'10',section:'1',summary:null,availabilityinfo:'<p>Locked</p>',modules:[{id:'2',name:'Item',modname:'customplugin',customdata:'{}',...fields}]}]);
 expect(parsed.success).toBe(true);
 if (parsed.success) expect(parsed.data[0]?.modules).toHaveLength(1);
});

it('skips malformed modules independently, retains empty sections and reports partial data',async () => {
 const logger=vi.spyOn(console,'log').mockImplementation(() => {});
 try {
 const request=fixtureFetch({core_course_get_contents:[{id:10,modules:[{id:1,name:'Good',modname:'unfamiliar'},{id:'broken',name:'Bad'}]},{id:11,modules:[{id:2,name:null}]},{id:'bad'}]});
 const client=new MoodleClient(account.siteUrl,'token',request);
 const course=(await client.courses(account))[0]!;
 const result=await client.courseContents(course);
 expect(result.partial).toBe(true);
 expect(result.sections.map(section => section.modules.map(module => module.kind))).toEqual([['other'],[]]);
 expect(logger.mock.calls.flat().join(' ')).toContain('sections.0.modules.1.id');
 } finally {logger.mockRestore();}
});

it('maps a full Moodle 4.x fixture with delegated sections and hidden content',async () => {
 const {readFileSync}=await import('node:fs');
 const raw=JSON.parse(readFileSync(new URL('./fixtures/contents-4x.json',import.meta.url),'utf8'));
 const client=new MoodleClient(account.siteUrl,'token',fixtureFetch({core_course_get_contents:raw}));
 const course=(await client.courses(account))[0]!;
 const result=await client.courseContents(course);
 expect(result.partial).toBe(false);
 expect(result.sections).toHaveLength(1);
 expect(result.sections[0]!.modules.map(module => [module.cmid,module.kind])).toEqual([[30,'resource'],[31,'label'],[32,'subsection'],[34,'page'],[33,'other']]);
 expect(result.sections[0]!.modules.find(module => module.cmid === 34)?.accessible).toBe(false);
 expect(result.files[0]?.value).toMatchObject({name:'lecture.pdf',size:0,mime:'application/octet-stream'});
});
