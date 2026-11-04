import { expect, it } from 'vitest';
import { courseLifecycle, currentTaiwanTerm, filterMultilang, parseCourseIdentity } from './identity';
import { displayTitle } from '../../shared/moodle-course-display';

it.each([
 ['1142電子電路實驗-湯松年(資訊二乙)[CS924E]1142Electronics Laboratory-TANG, SONG-NIEN(CSB)[CS924E]','1142_CS924E','電子電路實驗','Electronics Laboratory','湯松年','TANG, SONG-NIEN','資訊二乙','CSB'],
 ['1141數位邏輯電路設計-(資訊二乙)[CS210E]1141Logic Design(CSB)[CS210E]','1141_CS210E','數位邏輯電路設計','Logic Design',null,null,'資訊二乙','CSB'],
 ['1151機率與統計(一)-蘇志文(資訊三乙)[CS313H]1151Probability & Statistics (1)-SU,CHIH-WEN(CSB)[CS313H]','1151_CS313H','機率與統計(一)','Probability & Statistics (1)','蘇志文','SU,CHIH-WEN','資訊三乙','CSB'],
 ['1132英文(二)-沈俞君(工業管理組 一丙)[IE609C]1132English (II)-SHEN, YU-CHUN(IE)[IE609C]','1132_IE609C','英文(二)','English (II)','沈俞君','SHEN, YU-CHUN','工業管理組 一丙','IE'],
])('parses %s',(name,short,zh,en,teacherZh,teacherEn,classZh,classEn) => {
 const identity = parseCourseIdentity(name!,short!);
 expect(identity.title).toEqual({zh,en});
 expect(identity.teachers).toEqual(teacherZh || teacherEn ? [{zh:teacherZh,en:teacherEn}] : []);
 expect(identity.classLabel).toEqual({zh:classZh,en:classEn});
 expect(identity.term).toBe(short!.slice(0,4));
 expect(identity.code).toBe(short!.slice(5));
});
it('resolves explicit languages before HTML stripping and preserves surrounding text',() => {
 expect(filterMultilang('Before {mlang zh_tw}中文{mlang}{mlang en}English{mlang} after','zh-tw')).toBe('Before 中文 after');
 expect(filterMultilang('{mlang fr}Oui{mlang}{mlang other}Fallback{mlang}','ja')).toBe('Fallback');
 expect(filterMultilang('<span class="multilang" lang="zh">中文</span><span lang="en" class="multilang">English</span>','zh-Hant')).toBe('中文');
 expect(parseCourseIdentity('<span class="multilang" lang="zh_tw">中文</span><span class="multilang" lang="en">English</span>','').title).toEqual({zh:'中文',en:'English'});
});
it('keeps malformed names and co-instructors',() => {
 expect(parseCourseIdentity('AI 與程式設計','bad')).toMatchObject({title:{zh:'AI 與程式設計',en:null},term:null,code:null,teachers:[]});
 expect(parseCourseIdentity('1143實驗-123王、456李(資訊)[X]','1143_X')).toMatchObject({term:'1143',teachers:[{zh:'王',en:null},{zh:'李',en:null}]});
 expect(displayTitle(parseCourseIdentity('English',''),'ja')).toBe('English');
});
it.each([
 ['2026-01-31T16:00:00Z','1142'],['2026-06-30T16:00:00Z','1143'],['2026-08-31T16:00:00Z','1151'],['2026-01-01T00:00:00Z','1141'],
])('uses Taiwanese academic boundaries %s',(now,expected) => expect(currentTaiwanTerm(new Date(now))).toBe(expected));
it('uses server, dates, term, then unknown lifecycle',() => {
 const now = new Date('2026-07-05T00:00:00Z');
 const base = {startAt:null,endAt:null,term:null};
 expect(courseLifecycle({...base,server:'past',term:'1151'},now)).toEqual({lifecycle:'past',lifecycleSource:'server'});
 expect(courseLifecycle({...base,startAt:'2027-01-01T00:00:00Z'},now)).toEqual({lifecycle:'future',lifecycleSource:'dates'});
 expect(courseLifecycle({...base,term:'1143'},now)).toEqual({lifecycle:'current',lifecycleSource:'term'});
 expect(courseLifecycle(base,now)).toEqual({lifecycle:'unknown',lifecycleSource:'none'});
});

it('retains explicitly marked Traditional Chinese and regional English titles',() => {
 expect(parseCourseIdentity('<span class="multilang" lang="zh-Hant">物理</span><span class="multilang" lang="en-AU">Physics</span>','').title).toEqual({zh:'物理',en:'Physics'});
 expect(parseCourseIdentity('1142A Very Long Title [X]1142Different [Y]','').title).toEqual({zh:null,en:'1142A Very Long Title [X]1142Different [Y]'});
});
it.each([
 [{completed:true,startAt:null,endAt:null,term:'1151'},'past','dates'],
 [{startAt:null,endAt:'2025-01-01T00:00:00Z',term:'1151'},'past','dates'],
 [{startAt:'2025-01-01T00:00:00Z',endAt:null,term:'1151'},'current','dates'],
 [{startAt:null,endAt:null,term:'1151'},'future','term'],
 [{startAt:null,endAt:null,term:'1131'},'past','term'],
 [{startAt:null,endAt:null,term:'1149'},'unknown','none'],
] as const)('classifies lifecycle %#',(input,lifecycle,lifecycleSource) => {
 expect(courseLifecycle(input,new Date('2026-07-01T00:00:00Z'))).toEqual({lifecycle,lifecycleSource});
});

it('preserves hyphens in titles and teacher names, including titles without a class suffix',() => {
 expect(parseCourseIdentity('1142Object-Oriented Programming (1)-TANG, SONG-NIEN(CSB)[CS1]','1142_CS1')).toMatchObject({title:{zh:null,en:'Object-Oriented Programming (1)'},teachers:[{zh:null,en:'TANG, SONG-NIEN'}]});
 expect(parseCourseIdentity('1142Object-Oriented Programming(CSB)[CS1]','1142_CS1')).toMatchObject({title:{zh:null,en:'Object-Oriented Programming'},teachers:[]});
 expect(parseCourseIdentity('1142人工智慧-AI應用-蘇志文[CS1]','1142_CS1')).toMatchObject({title:{zh:'人工智慧-AI應用',en:null},teachers:[{zh:'蘇志文',en:null}]});
});
