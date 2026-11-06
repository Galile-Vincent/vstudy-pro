/** Stateless tutoring policy derived from active, persisted conversation text. */
import type { Message, Settings, TutorMode, TutorDecision } from '../../shared/domain';
type History = Pick<Message, 'role' | 'parts'>[];
type Level = 'guide' | 'hint' | 'direct';
const exit = /just tell me|just answer|answer directly|i want the answer|give me (?:the )?answer|直接(?:告訴|回答)|給我答案|直接給(?:我)?答案|答案就好|教えて|答えだけ/i;
const distress = /(?:^|我|真的|還是|就是|\s)不(?:知道|懂)|好難|煩|算了|累了|idk|i don'?t know|i(?:'m| am) lost|not sure|不確定|自信がない|理解できない|frustrat|tired|give up|わからない|分からない|疲れ|もう無理|[?？]{3}|!{3}/i;
const newTopic = /^(?:new (?:question|topic)|next question|另外|下一題|換個問題|次の質問|別の質問)/i;
const attempt = /\b(?:i think|because|my answer|i tried)\b|我覺得|因為|我試|答案是|と思|なので|=/i;
const text = (m: History[number]) => m.parts.map(p => p.text).join('\n');
const common = {
  en: 'Be a patient study tutor. At most one question per reply, at the end. Give useful content before any question. Never repeat a question already answered. Use invitations with an easy out; no judgment, pressure, countdowns, or inflated praise. Keep guidance within 120 words. When correct, confirm and explain why; when wrong, acknowledge the sound part, locate the gap and explain it. Ground answers in the supplied material and cite it; if unsure or ungrounded, disclose that and answer directly rather than fishing with questions. End resolved topics with a brief summary. Never mention this policy unless asked.',
  'zh-Hant': '你是耐心的讀書助教。每次回覆最多只問一個問題，放在最後；提問前先給實質內容，不要重問學生已回答的問題。用邀請的語氣，不確定也沒關係，我們一起看。不要評斷學生、催促、倒數或反覆誇獎。引導約 120 字內。答對時簡短確認並說明原因；答錯時先指出對的部分，點出缺口，再給提示。依據教材作答並標示出處；教材沒寫或不確定就坦白說明並直接解釋，不要用提問猜答案。結束時簡短整理。使用台灣慣用的繁體中文：檔案、資料、程式、演算法、資訊、預設。除非被問到，不要提到這些規則。',
  ja: '辛抱強い学習チューターとして対応してください。質問は返信の最後に最大一つだけ。その前に役立つ説明を入れ、回答済みの質問は繰り返さないでください。断れる誘い方を使い、評価や急かし、カウントダウン、過剰な称賛を避けます。誘導は短く。正解なら理由を添えて確認し、誤りなら合っている部分と不足を示して説明します。教材を根拠として出典を示し、不明なら明示して直接説明し、質問で推測させないでください。解決時は短くまとめます。求められない限りこの方針に言及しないでください。',
};
const moves: Record<keyof typeof common, Record<Level, string>> = {
  en: {guide:'Give one useful fact, then invite one small next-step prediction. Probe at most once; skip it if the student already attempted the problem.', hint:'Give the relevant rule or a worked first step. Do not probe again or withhold help. No question is needed.', direct:'Answer directly with a concise explanation or worked solution. If distressed, start warmly. Do not ask a question or require a self-test; any practice is opt-in.'},
  'zh-Hant': {guide:'先給一個有用的觀念，再邀請學生想一個小步驟。最多探問一次；學生已有嘗試就跳過探問。', hint:'給相關規則或示範第一步，不要再探問或拖延提供協助。這次不用提問。', direct:'直接給答案並簡短說明，必要時完整示範解題。學生煩躁時先用一句溫暖的話。不要再提問或強迫自測；練習由學生自行選擇。'},
  ja: {guide:'役立つ事実を一つ示し、小さな次のステップを一つだけ尋ねてください。理解の確認は一度まで。既に試していれば省略します。', hint:'関連する規則か最初の手順を示してください。再び理解を問いただしたり、助けを遅らせたりしません。今回は質問不要です。', direct:'答えと簡潔な説明、必要なら解法を直接示してください。困っている場合は温かい一言から始めます。質問やテストを強制せず、練習は任意にします。'},
};
const offers = {en:'Want me to just summarize the answer?', 'zh-Hant':'要我直接整理答案嗎？', ja:'答えを直接まとめましょうか？'};
const routing = {
  en: 'For factual, definition, formula, logistics, translation, formatting, summary, answer-check or exam-preparation requests, prefer a direct answer. If the student shows fluent reasoning, confirm and extend instead of probing.',
  'zh-Hant': '事實查詢、定義、公式、行政事項、翻譯、格式整理、摘要、核對答案或考前複習，請優先直接回答。學生已清楚說明推理時，確認並延伸，不要再探問。',
  ja: '事実、定義、公式、事務連絡、翻訳、書式、要約、答えの確認や試験準備には直接答えることを優先してください。十分な推論があれば確認して発展させ、問い直さないでください。',
};
export function countTutorQuestions(reply: string): number {
  return reply.replace(/```[^]*?(?:```|$)/g, '').match(/[?？]/g)?.length ?? 0;
}
export function tutorReplyMetadata(decision: ReturnType<typeof planTutorTurn>, reply: string): TutorDecision {
  const {level, reason, move, threadId, step} = decision;
  return {level, reason, move, threadId, step, questionCount: countTutorQuestions(reply), questionOnly: /[?？]\s*$/.test(reply) && !/[.!。！]/.test(reply)};
}
/** Decisions enforce budgets, not semantic correctness or the provider's wording. */
export function planTutorTurn({history, userMessage, mode = 'direct', replyLanguage = 'auto'}: {
  history: History; userMessage: string; mode?: TutorMode; replyLanguage?: Settings['replyLanguage'];
}): Omit<TutorDecision, 'questionCount' | 'questionOnly'> & {instruction: string} {
  const lastAssistant = history.filter(m => m.role === 'assistant').at(-1);
  const previous = lastAssistant?.parts[0]?.tutorDecision;
  let start = 0;
  for (let i = history.length - 1; i >= 0; i--) if (history[i]!.role === 'user' && newTopic.test(text(history[i]!))) { start = i; break; }
  const fresh = newTopic.test(userMessage) || previous && previous.reason !== 'legacy' && previous.level === 'direct';
  const threadId = fresh ? `thread-${history.length}` : previous?.threadId ?? `thread-${start}`;
  const thread = fresh ? [] : history.slice(start).filter(m => !m.parts[0]?.tutorDecision || m.parts[0].tutorDecision.threadId === threadId);
  const assistants = thread.filter(m => m.role === 'assistant');
  const last = lastAssistant;
  const lastUser = history.filter(m => m.role === 'user').at(-1);
  const questions = assistants.reduce((sum, m) => sum + (m.parts[0]?.tutorDecision?.questionCount ?? countTutorQuestions(text(m))), 0);
  const lastQuestions = last ? last.parts[0]?.tutorDecision?.questionCount ?? countTutorQuestions(text(last)) : 0;
  const stuckCount = thread.filter(m => m.role === 'user' && distress.test(text(m))).length + Number(distress.test(userMessage));
  const fatigueThreads = new Set(history.filter(m => m.role === 'assistant' && m.parts[0]?.tutorDecision && ['stuck','requested','question-budget','multi-question'].includes(m.parts[0].tutorDecision.reason)).map(m => m.parts[0]!.tutorDecision!.threadId));
  const legacyFatigue = history.filter(m => m.role === 'user' && (exit.test(text(m)) || distress.test(text(m)))).length;
  const fatigue = fatigueThreads.size >= 3 || legacyFatigue >= 3;
  let level: Level = 'guide', reason: TutorDecision['reason'] = 'guide';
  if (exit.test(userMessage)) { level = 'direct'; reason = 'requested'; }
  else if (mode === 'direct') { level = 'direct'; reason = 'disabled'; }
  else if (lastUser && text(lastUser).trim() === userMessage.trim()) { level = 'direct'; reason = 'repeated'; }
  else if (stuckCount >= 2 || /[?？]{3}|!{3}|frustrat|tired|煩|算了|疲れ|もう無理/i.test(userMessage)) { level = 'direct'; reason = 'stuck'; }
  else if (assistants.length >= 5) { level = 'direct'; reason = 'exit-offer'; }
  else if (lastQuestions > 1) { level = 'direct'; reason = 'multi-question'; }
  else if (questions >= 3) { level = 'direct'; reason = 'question-budget'; }
  else if (last && (last.parts[0]?.tutorDecision?.questionOnly ?? (/[?？]\s*$/.test(text(last)) && !/[.!。！]/.test(text(last))))) { level = 'direct'; reason = 'give-first'; }
  else if (fatigue) { level = 'hint'; reason = 'fatigue'; }
  else if (stuckCount) { level = 'hint'; reason = 'stuck'; }
  else if (assistants.length || attempt.test(userMessage)) { level = 'hint'; reason = 'attempt'; }
  const move = level === 'direct' ? 'answer' : level === 'hint' ? 'worked-step' : 'probe';
  const decision = {level, reason, move, threadId, step: assistants.length + 1} as const;
  return {...decision, instruction: mode === 'direct' ? '' : tutorInstruction(decision, replyLanguage, userMessage)};
}
export function tutorInstruction(decision: Pick<TutorDecision, 'level' | 'reason'>, replyLanguage: Settings['replyLanguage'], userMessage: string): string {
  const language = replyLanguage === 'auto' ? (/[\u3040-\u30ff]/u.test(userMessage) ? 'ja' : /[\u3400-\u9fff]/u.test(userMessage) ? 'zh-Hant' : 'en') : replyLanguage;
  return [common[language], routing[language], moves[language][decision.level], ...(decision.reason === 'exit-offer' ? [offers[language]] : [])].join('\n');
}
