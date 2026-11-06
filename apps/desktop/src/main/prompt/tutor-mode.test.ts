import { describe, expect, it } from 'vitest';
import { chatRequestSchema, tutorDecisionSchema } from '../../shared/domain';
import { planTutorTurn, tutorReplyMetadata, countTutorQuestions } from './tutor-mode';
const user = (text: string) => ({ role: 'user' as const, parts: [{ type: 'text' as const, text }] });
const tutor = (text: string) => ({ role: 'assistant' as const, parts: [{ type: 'text' as const, text }] });
const plan = (userMessage: string, history: ReturnType<typeof user | typeof tutor>[] = [], mode: 'direct' | 'socratic' = 'socratic') => planTutorTurn({ history, userMessage, mode, replyLanguage: 'zh-Hant' });
describe('Socratic decision policy, not a guarantee of generated wording', () => {
  it.each([
    ['off', 'Why?', [], 'direct', 'disabled'],
    ['concept', '為什麼 TCP 要三向交握？', [], 'guide', 'guide'],
    ['attempt', 'I think both sides agree', [], 'hint', 'attempt'],
    ['pure question', 'Maybe?', [user('Why?'), tutor('What changes?')], 'direct', 'give-first'],
    ['uncertain correctness never counts as wrong', 'Still e^x?', [user('Integrate'), tutor('Use parts. Which u?'), user('e^x'), tutor('Try simplifying. Which u?')], 'hint', 'attempt'],
    ['three questions', 'Continue', [tutor('Fact. A?'), tutor('Fact. B?'), tutor('Fact. C?')], 'direct', 'question-budget'],
    ['stacked questions', 'Continue', [tutor('A? B？')], 'direct', 'multi-question'],
    ['turn six', 'Continue', Array.from({length:5}, () => tutor('Fact.')), 'direct', 'exit-offer'],
    ['soft fatigue', 'New question: why?', [user('just tell me'), tutor('Answer.'), user('給我答案'), tutor('答案。'), user('答えだけ'), tutor('答え。')], 'hint', 'fatigue'],
    ['one explicit uncertainty', "I'm lost", [], 'hint', 'stuck'],
    ['two explicit uncertainties', 'I do not understand', [user("I'm lost"), tutor('A useful step.')], 'direct', 'stuck'],
    ['repeated question', 'Why TCP?', [user('Why TCP?'), tutor('A fact.')], 'direct', 'repeated'],
  ] as const)('%s', (name, message, history, level, reason) => {
    expect(plan(message, [...history], name === 'off' ? 'direct' : 'socratic')).toMatchObject({level,reason});
  });
  it.each(['just tell me', 'just answer', 'answer directly', 'give me the answer', '直接告訴我', '直接回答', '給我答案', '答えを教えて', '答えだけ'])('explicit request wins: %s', message => {
    expect(plan(message, [], 'direct')).toMatchObject({level:'direct', reason:'requested'});
    expect(plan(message)).toMatchObject({level:'direct', reason:'requested'});
  });
  it.each(['en','zh-Hant','ja'] as const)('includes best-effort lookup and exam routing in vetted %s instructions', replyLanguage => {
    const decision = planTutorTurn({history:[],userMessage:'UNIQUE_INJECTION',mode:'socratic',replyLanguage});
    expect(decision.instruction).not.toContain('UNIQUE_INJECTION');
    expect(decision.instruction.length).toBeGreaterThan(100);
  });
  it('instructs an exit offer at turn six without rewriting provider text', () => expect(plan('Continue',Array.from({length:5}, () => tutor('Fact.'))).instruction).toContain('需要的話，我可以把重點整理成幾點。'));
  it('records every displayed question and skips fenced code', () => {
    const reply = 'One? Two？\n```js\na ? b : c\n```';
    expect(countTutorQuestions(reply)).toBe(2);
    expect(tutorReplyMetadata(plan('Why?'), reply)).toMatchObject({questionCount:2,level:'guide',move:'probe',step:1});
  });
  it('defaults old decision objects safely', () => expect(tutorDecisionSchema.parse({})).toMatchObject({level:'direct',reason:'legacy',step:0,questionCount:0}));
  it('validates tutor mode and defaults legacy requests', () => {
    const request = {scope:'general',requestId:'00000000-0000-4000-8000-000000000001',conversationId:'00000000-0000-4000-8000-000000000002',providerId:'openai-api',modelId:'m',userMessage:'Hi'};
    expect(chatRequestSchema.parse(request).tutorMode).toBe('direct');
    expect(chatRequestSchema.safeParse({...request,tutorMode:'unknown'}).success).toBe(false);
  });
});
// R-S 1.12: legacy dialogues are inputs, not permission to repeat their extra questions.
const dialogues = [
  {id:'D1', history:[user('為什麼 TCP 要三向交握？'),tutor('好問題。你覺得如果只有「我說了，你收到」兩步，會漏掉什麼情況？')], message:'對方不知道我有沒有收到他的回覆？', level:'hint'},
  {id:'D2', history:[user('求 ∫x·e^x dx'),tutor('這題適合用分部積分。你會怎麼選 u 和 dv？'),user('u=e^x, dv=x dx'),tutor('這樣 dv 積分後會變 x²/2，反而更複雜。提示：挑「微分後會變簡單」的當 u。你覺得哪個符合？')], message:'呃 還是 e^x？', level:'hint'},
  {id:'D3',history:[],message:'直接告訴我答案就好 CAP 定理是什麼',level:'direct'},
  {id:'D4',history:[],message:'Midterm 範圍到哪一章？',level:'direct'},
  {id:'D5',history:[],message:'我真的不懂 為什麼 P 值不是假設為真的機率 煩死了',level:'direct'},
  {id:'D6',history:[],message:'明天考作業系統，幫我複習 deadlock',level:'direct'},
  {id:'D7',history:[user('什麼是遞迴？不太懂'),tutor('你寫過 function 嗎？大概知道「函式呼叫函式」的意思嗎？')],message:'不知道',level:'direct'},
  {id:'D8',history:[],message:'我覺得 quicksort 最壞情形是已排序陣列，因為 pivot 取第一個元素。對嗎？',level:'hint'},
];
it.each(dialogues)('$id reviewed policy fixture', ({history,message,level}) => expect(plan(message,history).level).toBe(level));
it('falls back after multi-question output even when the previous decision was direct', () => {
  const decision = plan('just tell me');
  const history = [{role:'assistant' as const,parts:[{type:'text' as const,text:'One? Two?',tutorDecision:tutorReplyMetadata(decision,'One? Two?')}]}];
  expect(plan('Another concept', history)).toMatchObject({level:'direct',reason:'multi-question'});
});

it.each([
  ['微分を教えてください','guide','guide'], ['麻煩你解釋一下備抵呆帳','guide','guide'],
  ['煩請解釋微分','guide','guide'], ['我看不懂這題','hint','stuck'], ['根本不會','hint','stuck'],
  ['直接說','direct','requested'], ['不要一直問我','direct','requested'], ['不要反問','direct','requested'],
  ['可以直接給嗎','direct','requested'], ['stop asking me','direct','requested'], ['質問しないで','direct','requested'],
  ['lim x→0 sin x / x = ?','guide','guide'], ['我算出來是 0','hint','attempt'], ['答えは 3 ですか','hint','attempt'],
  ['我不確定是不是 5','guide','guide'], ['not sure whether it is 5','guide','guide'],
  ['期中考範圍到哪一章？','direct','lookup'], ['明天考會計，幫我整理折舊的重點','direct','exam-prep'],
  ['排一下這週的讀書計畫','direct','planning'], ['折舊跟攤銷有什麼不一樣？','direct','lookup'],
])('precise routing: %s', (message,level,reason) => expect(plan(message)).toMatchObject({level,reason}));
it('softens immediately after an unwanted probe', () => {
  const decision=plan('不要一直問我');
  const history=[user('不要一直問我'),{...tutor('答案。'),parts:[{type:'text' as const,text:'答案。',tutorDecision:tutorReplyMetadata(decision,'答案。')}]}];
  expect(plan('為什麼會這樣？',history)).toMatchObject({level:'hint',reason:'fatigue'});
});
const auditDialogues = [
  {id:'C1',history:[user('請問 lim x→0 sin x / x 為什麼等於 1？'),tutor('可以用夾擠定理。下一步呢？')],message:'那 sin x/x 不就是 0/0 嗎？',level:'hint'},
  {id:'C2',history:[],message:'折舊跟攤銷有什麼不一樣？',level:'direct'},
  {id:'C3',history:[],message:'我真的不懂 為什麼 P 值不是假設為真的機率 煩死了',level:'direct'},
  {id:'C4',history:[],message:'明天考會計，幫我整理折舊的重點',level:'direct'},
  {id:'C5',history:[],message:'期中考範圍到哪一章？',level:'direct'},
  {id:'C6',history:[user('∫x e^x dx 怎麼算？'),tutor('適合用分部積分。u 要選哪一個？')],message:'u=e^x, dv=x dx',level:'hint'},
];
it.each(auditDialogues)('$id audit simulation policy fixture', ({history,message,level}) => expect(plan(message,history).level).toBe(level));
it('lets a student finish one step and requests consistent polite Japanese', () => {
  expect(plan('我算出來是 3').instruction).toContain('自己完成最後一小步');
  expect(planTutorTurn({history:[],userMessage:'なぜ？',mode:'socratic',replyLanguage:'ja'}).instruction).toContain('です・ます');
});
