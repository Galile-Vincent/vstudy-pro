/**
 * Extract course names, teachers, and lifecycle hints from multilingual Moodle metadata.
 * Owned by main/moodle.
 * Credentials and authenticated transports stay in main; renderer results use shared schemas.
 * @packageDocumentation
 */
import { emptyCourseIdentity, type MoodleCourseIdentity } from '../../shared/moodle-course';
import { decodeHtmlEntities } from '../../shared/html';

const normalizeLanguage = (language: string) => language.toLowerCase().replace(/_/g, '-');
/** Select the requested Moodle multilang content with a fallback to available text. */
export function filterMultilang(raw: string, language: string, fallback = 'en'): string {
  const lang = normalizeLanguage(language);
  const parent = lang.split('-')[0]!;
  const span = /<span\b(?=[^>]*\bclass\s*=\s*["'][^"']*\bmultilang\b[^"']*["'])(?=[^>]*\blang\s*=\s*["']([^"']+)["'])[^>]*>([\s\S]*?)<\/span\s*>/gi;
  const matches = [...raw.matchAll(span)];
  if (matches.length) {
    const languages = matches.map(match => normalizeLanguage(match[1]!));
    const selected = [lang,parent,normalizeLanguage(fallback),languages[0]].find(candidate => languages.includes(candidate!));
    raw = raw.replace(span, (_all, code: string, text: string) => normalizeLanguage(code) === selected ? text : '');
  }
  const block = /\{\s*mlang\s+([\w,\s-]+)\}([\s\S]*?)\{\s*mlang\s*\}/gi;
  let found = false;
  const replace = (target: string) => raw.replace(block, (_all, codes: string, text: string) => {
    const keep = codes.split(',').map(code => normalizeLanguage(code.trim())).some(code => code === target || target !== 'other' && code === parent);
    if (keep) found = true;
    return keep ? text : '';
  });
  const result = replace(lang);
  return found ? result : replace('other');
}
/** Normalize identity text without exposing markup as a display label. */
export function identityText(value: string): string {
  return decodeHtmlEntities(value.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,'').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
}
/** Extract a bounded teacher label from the available Moodle metadata. */
export function teacherName(value: string) { return identityText(value).replace(/^\s*\d+\s*[-:]?\s*/, '').trim(); }
const cjk = /[\u3400-\u9fff]/;
function personalName(value: string): boolean {
  const words = value.replace(/-\s+/g,'-').split(/[\s,]+/).filter(Boolean);
  const tokens = words.flatMap(word => word.split('-'));
  return tokens.length >= 2 && tokens.length <= 4 && words.every(word => /^[A-Z][a-zA-Z]*(?:-[A-Za-z]+)*$/.test(word)) && !tokens.some(token => /^(of|and|the|in|for|to)$/i.test(token));
}
function candidate(raw: string, teacherLength?: number) {
  const value = raw.replace(/[（）［］－]/g, char => ({'（':'(','）':')','［':'[','］':']','－':'-'}[char]!)).trim();
  const match = /^(\d{3,4})(.+)\[([A-Za-z0-9_-]+)\]$/.exec(value);
  if (!match) return null;
  let body = match[2]!.trim();
  if (body.includes('[') || body.includes(']')) return null;
  let classLabel: string | null = null;
  if (body.endsWith(')')) {
    let depth = 0;
    for (let i = body.length - 1; i >= 0; i--) {
      if (body[i] === ')') depth++;
      if (body[i] === '(' && --depth === 0) {
        const label = body.slice(i + 1,-1);
        if (!/^(?:\d+|[一二三四五六七八九十]+|I{1,3}|IV|V)$/i.test(label)) { classLabel = label; body = body.slice(0,i).trim(); }
        break;
      }
    }
  }
  let separator = -1;
  let bestScore = Infinity;
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '(') depth++;
    if (body[i] === ')') depth--;
    if (body[i] === '-' && depth === 0) {
      const suffix = body.slice(i+1).trim();
      const names = suffix.split(/、|\s*\/\s*|\s*;\s*/).map(teacherName).filter(Boolean);
      const teachers = names.length > 0 && names.every(name => /^[\u3400-\u9fff·]{1,5}$/.test(name) || (teacherLength !== 0 && personalName(name) && (teacherLength !== undefined || name.includes(','))));
      const title = body.slice(0,i).trim();
      const danglingSurname = /\b[A-Z]{2,}$/.test(title) && !/\b(?:I|II|III|IV|VI?)$/.test(title);
      const count = suffix.split(/[\s,-]+/).filter(Boolean).length;
      const score = Math.abs(count - (teacherLength || 3)) * 100 + suffix.length;
      if ((teachers && !danglingSurname || !suffix && classLabel !== null) && score < bestScore) {separator = i; bestScore = score;}
    }
  }
  const title = (separator < 0 ? body : body.slice(0,separator)).trim();
  if (!title || depth !== 0) return null;
  const teacher = separator < 0 ? '' : body.slice(separator+1).trim();
  return {term:match[1]!,code:match[3]!,title,classLabel,teachers:teacher.split(/、|\s*\/\s*|\s*;\s*/).map(teacherName).filter(Boolean)};
}
/** Infer display identity while retaining raw names and the source of lifecycle hints. */
export function parseCourseIdentity(fullName: string, shortName: string, hasProgress = false): MoodleCourseIdentity {
  const raw = identityText(fullName);
  const identity = emptyCourseIdentity(raw,hasProgress);
  const short = /^(\d{3,4})_([A-Za-z0-9_-]+)$/.exec(shortName);
  const marked = /multilang|\{\s*mlang\s/i.test(fullName);
  let halves = [raw];
  if (marked) {
    const languages = [...fullName.matchAll(/\blang\s*=\s*["']([^"']+)["']|\{\s*mlang\s+([\w-]+)/gi)].map(match => normalizeLanguage(match[1] ?? match[2]!));
    const zh = languages.find(lang => /^zh(?:-|$)/.test(lang)) ?? 'zh-tw';
    const en = languages.find(lang => /^en(?:-|$)/.test(lang)) ?? 'en';
    halves = [...new Set([zh,en].map(lang => identityText(filterMultilang(fullName,lang))))].filter(Boolean);
  }
  else {
    const boundary = /^(\d{3,4})[\s\S]*?\[([A-Za-z0-9_-]+)\]/.exec(raw);
    if (boundary) {
      const rest = raw.slice(boundary[0].length);
      if (rest.startsWith(boundary[1]!) && rest.endsWith(`[${boundary[2]}]`)) halves = [boundary[0],rest];
    }
  }
  identity.title = {zh:null,en:null};
  halves.sort((a,b) => Number(cjk.test(b)) - Number(cjk.test(a)));
  let zhTeacherLength: number | undefined;
  for (const half of halves) {
    const lang = cjk.test(half) ? 'zh' : 'en';
    const parsed = candidate(half,lang === 'en' ? zhTeacherLength : undefined);
    if (lang === 'zh') zhTeacherLength = parsed?.teachers[0]?.length ?? 0;
    identity.title[lang] = parsed?.title ?? (/^\d{3,4}[^\x5b\x5d]+$/.test(half) ? half.replace(/^\d{3,4}/,'') : half);
    if (!parsed && /^\d{3,4}[^\x5b\x5d]+$/.test(half)) identity.term = half.match(/^\d{3,4}/)![0];
    if (!parsed) continue;
    identity.term = parsed.term;
    identity.code = parsed.code;
    identity.classLabel[lang] = parsed.classLabel;
    parsed.teachers.forEach((name,index) => {
      identity.teachers[index] ??= {zh:null,en:null};
      identity.teachers[index]![lang] = name;
    });
  }
  if (short) { identity.term = short[1]!; identity.code = short[2]!; }
  return identity;
}

/** Calculate the academic term from the supplied clock rather than persisting a stale term. */
export function currentTaiwanTerm(now: Date): string {
  const local = new Date(now.getTime() + 8 * 3600_000);
  const year = local.getUTCFullYear() - 1911;
  const month = local.getUTCMonth() + 1;
  return `${month < 9 ? year - 1 : year}${month >= 9 || month === 1 ? 1 : month >= 7 ? 3 : 2}`;
}
/** Prefer authoritative dates and preserve unknown lifecycle when evidence is insufficient. */
export function courseLifecycle(input: {completed?:boolean;startAt:string|null;endAt:string|null;term:string|null;server?:'past'|'current'|'future'}, now = new Date()): Pick<MoodleCourseIdentity,'lifecycle'|'lifecycleSource'> {
  if (input.server) return {lifecycle:input.server,lifecycleSource:'server'};
  if (input.completed || input.endAt && Date.parse(input.endAt) < now.getTime()) return {lifecycle:'past',lifecycleSource:'dates'};
  if (input.startAt && Date.parse(input.startAt) > now.getTime()) return {lifecycle:'future',lifecycleSource:'dates'};
  if (input.startAt || input.endAt) return {lifecycle:'current',lifecycleSource:'dates'};
  if (input.term && /^\d{2,3}[123]$/.test(input.term)) {
    const term = Number(input.term), current = Number(currentTaiwanTerm(now));
    return {lifecycle:term < current ? 'past' : term > current ? 'future' : 'current',lifecycleSource:'term'};
  }
  return {lifecycle:'unknown',lifecycleSource:'none'};
}

/** Replace inferred teacher labels only when authoritative teacher data is available. */
export function applyAuthoritativeTeachers(identity: MoodleCourseIdentity, teachers: MoodleCourseIdentity['teachers']): MoodleCourseIdentity {
  const title = {...identity.title};
  for (const lang of ['zh','en'] as const) {
    for (const teacher of teachers) {
      const name = teacher[lang];
      if (!name || !title[lang]) continue;
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      title[lang] = title[lang]!.replace(new RegExp(`\\s*-\\s*${escaped}\\s*$`,'i'),'').trim();
    }
  }
  return {...identity,title,teachers:teachers.map(teacher => {
    const parsed = identity.teachers.find(value => (teacher.zh && value.zh === teacher.zh) || (teacher.en && value.en?.toLowerCase() === teacher.en.toLowerCase()));
    return {zh:teacher.zh ?? parsed?.zh ?? null,en:teacher.en ?? parsed?.en ?? null};
  })};
}
