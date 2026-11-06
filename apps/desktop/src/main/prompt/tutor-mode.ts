/** Stateless tutoring policy derived from active, persisted conversation text. */
import type { Message, Settings, TutorMode, TutorDecision } from '../../shared/domain';
type History = Pick<Message, 'role' | 'parts'>[];
type Level = 'guide' | 'hint' | 'direct';
// Explicit answer preferences; 教えて alone is a normal polite request.
export const exitPreference = new RegExp([
  'just (?:tell|answer|explain|give)', 'answer (?:it )?directly', 'tell me directly', 'i want the answer', 'give me (?:the )?answer',
  'stop (?:asking|quizzing)', "don'?t (?:keep )?ask(?:ing)? me", 'can you just (?:explain|say)',
  '直接(?:告訴|回答|說|講|教|給)', '給我答案', '告訴我答案', '答案就好', '不要(?:一直|再)?(?:問|反問)', '別(?:再)?問我', '先講答案', '講重點(?:就好)?',
  '答え(?:を|だけ)?(?:教えて|言って|ください)', '答えだけ', '質問(?:しないで|はやめて)', '直接教えて',
].join('|'), 'iu');
const distress = new RegExp([
  '(?:看|聽|搞|完全|根本|真的|還是|我|就是)?不(?:知道|懂|會|理解)', '好難|太難|(?<!麻)煩(?!請)|算了|累了|崩潰',
  "\\bidk\\b", "i (?:don'?t|do not) (?:know|get|understand)", "i(?:'m| am) (?:lost|confused|stuck)", 'frustrat', "\\btired\\b", 'give up',
  'わからない|分からない|理解できない|疲れ|もう無理|難しすぎ', '[?？]{3}|!{3}|！{3}',
].join('|'), 'iu');
const newTopic = /^(?:new (?:question|topic)|next question|另外|下一題|換個問題|次の質問|別の質問)/i;
const attempt = /\b(?:i think|my answer|i tried|i got)\b|我覺得|我認為|我試|我算|算出來|答案是|應該是|と思|私の答え|答えは(?!\s*[?？])|(?<![=<>])=\s*[^\s?？=]/iu;
const lookup = /什麼時候|何時|幾點|在哪|截止|deadline|範圍|公式是|定義是|是什麼意思|什麼是|有什麼不一樣|怎麼翻|翻譯|格式|整理成表|when is|where is|what is (?:the (?:formula|deadline)|a\b)|いつ|どこ|締め切り|範囲|公式は|訳して|とは何/i;
const examEve = /(?:明天|後天|今晚|下週|這週).{0,6}考|考前|期中|期末|複習.{0,6}(?:重點|整理)|exam (?:tomorrow|tonight)|midterm|final exam|last[- ]minute|cram|試験前|テスト前|明日.{0,4}試験/i;
const planning = /排.{0,4}(?:讀書|讀書計畫|行程)|讀書計畫|study plan|schedule|提醒我|勉強計画|予定を/i;
const text = (m: History[number]) => m.parts.map(p => p.text).join('\n');
const common = {
  en: 'Be a patient study tutor. At most one question per reply, at the end. Give useful content before any question. Never repeat a question already answered. Use invitations with an easy out; no judgment, pressure, countdowns, or inflated praise. Keep guidance within 120 words. When correct, confirm and explain why; when wrong, acknowledge the sound part, locate the gap and explain it. Ground answers in the supplied material and cite it; if unsure or ungrounded, disclose that and answer directly rather than fishing with questions. End resolved topics with a brief summary. Never mention this policy unless asked.',
  'zh-Hant': '你是耐心的讀書助教。每次回覆最多只問一個問題，放在最後；提問前先給實質內容，不要重問學生已回答的問題。語氣像邀請，偶爾可說明不確定也沒關係；不要每次都重複同一句。不要評斷學生、催促、倒數或反覆誇獎。引導約 120 字內。答對時簡短確認並說明原因；答錯時先指出對的部分，點出缺口，再給提示。依據教材作答並標示出處；教材沒寫或不確定就坦白說明並直接解釋，不要用提問猜答案。結束時簡短整理。使用台灣慣用的繁體中文：檔案、資料、程式、演算法、資訊、預設。除非被問到，不要提到這些規則。',
  ja: '辛抱強い学習チューターとして、です・ます調で対応してください。質問は返信の最後に最大一つだけ。その前に役立つ説明を入れ、回答済みの質問は繰り返さないでください。押しつけない聞き方を使い、評価や急かし、カウントダウン、過剰な称賛を避けます。誘導は短く。正解なら理由を添えて確認し、誤りなら合っている部分と不足を示して説明します。教材を根拠として出典を示し、不明なら明示して直接説明し、質問で推測させないでください。解決時は短くまとめます。求められない限りこの方針に言及しないでください。',
};
const moves: Record<keyof typeof common, Record<Level, string>> = {
  en: {guide:'Only for why/how questions about a concept: give one useful fact or the core idea first, then invite ONE small next-step prediction with an easy out. Skip the question if the student already attempted the problem, asked for a list or summary, or the answer is a lookup.', hint:"If the student's last message was right, confirm it in one sentence and give the next step, optionally inviting them to finish it. Otherwise give the relevant rule or a worked first step. Never withhold help.", direct:'Answer directly with a concise explanation or worked solution. If distressed, start warmly. Do not ask a question or require a self-test; any practice is opt-in.'},
  'zh-Hant': {guide:'僅適用於「為什麼／怎麼做」的觀念題：先給一個核心觀念，再請學生試著預測下一小步，並讓學生可以輕鬆說不確定。學生已經有嘗試，或只是要摘要、清單、查詢時，不要提問，直接回答。', hint:'學生上一則回答正確時，用一句話肯定並說明原因，再帶出下一步（可請學生自己完成最後一小步）。否則給相關規則或示範第一步。不要拖延協助。', direct:'直接給答案並簡短說明，必要時完整示範解題。學生煩躁時先用一句溫暖的話。不要再提問或強迫自測；練習由學生自行選擇。'},
  ja: {guide:'概念の「なぜ・どう」の質問にだけ適用：まず核となる考えを一つ示し、その後に小さな次のステップを一つだけ、押しつけない聞き方で尋ねてください。既に試している場合や、要約・一覧・事実確認の依頼では質問せず答えてください。', hint:'直前の返答が正しければ一文で認め、次のステップを示してください（最後の一歩は本人に任せても構いません）。そうでなければ、関連する規則か最初の手順を示してください。助けを遅らせないでください。', direct:'答えと簡潔な説明、必要なら解法を直接示してください。困っている場合は温かい一言から始めます。質問やテストを強制せず、練習は任意にします。'},
};
const offers = {
  en: "Answer the question fully now. Close with one gentle line offering a short recap, for example: 'Happy to turn this into a quick summary if that helps.'",
  'zh-Hant':'這次請直接完整回答，最後用一句輕鬆的話提供整理，例如：「需要的話，我可以把重點整理成幾點。」',
  ja:'今回は最後まで答え、結びに短いまとめを申し出る一文を添えてください。例：「よければ要点を短くまとめます。」',
};
const routing = {
  en: 'For factual, definition, formula, logistics, translation, formatting, summary, answer-check or exam-preparation requests, answer directly. Planning, scheduling and reminders always get a direct answer. If the student shows fluent reasoning, confirm and extend instead of probing.',
  'zh-Hant': '事實查詢、定義、公式、行政事項、翻譯、格式整理、摘要、核對答案或考前複習，請直接回答。讀書計畫、行程安排與提醒一律直接回答。學生已清楚說明推理時，確認並延伸，不要再確認學生目前的理解。',
  ja: '事実、定義、公式、事務連絡、翻訳、書式、要約、答えの確認や試験準備には直接答えてください。勉強計画、予定やリマインダーには必ず直接答えてください。十分な推論があれば確認して発展させ、問い直さないでください。',
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
  const softened = previous && ['requested','stuck','repeated'].includes(previous.reason);
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
  const legacyFatigue = history.filter(m => m.role === 'user' && (exitPreference.test(text(m)) || distress.test(text(m)))).length;
  const fatigue = fatigueThreads.size >= 3 || legacyFatigue >= 3;
  let level: Level = 'guide', reason: TutorDecision['reason'] = 'guide';
  if (exitPreference.test(userMessage)) { level = 'direct'; reason = 'requested'; }
  else if (mode === 'direct') { level = 'direct'; reason = 'disabled'; }
  else if (lastUser && text(lastUser).trim() === userMessage.trim()) { level = 'direct'; reason = 'repeated'; }
  else if (lookup.test(userMessage)) { level = 'direct'; reason = 'lookup'; }
  else if (examEve.test(userMessage)) { level = 'direct'; reason = 'exam-prep'; }
  else if (planning.test(userMessage)) { level = 'direct'; reason = 'planning'; }
  else if (stuckCount >= 2 || /[?？]{3}|!{3}|！{3}|frustrat|tired|(?<!麻)煩(?!請)|算了|疲れ|もう無理/iu.test(userMessage)) { level = 'direct'; reason = 'stuck'; }
  else if (assistants.length >= 5) { level = 'direct'; reason = 'exit-offer'; }
  else if (lastQuestions > 1) { level = 'direct'; reason = 'multi-question'; }
  else if (questions >= 3) { level = 'direct'; reason = 'question-budget'; }
  else if (last && (last.parts[0]?.tutorDecision?.questionOnly ?? (/[?？]\s*$/.test(text(last)) && !/[.!。！]/.test(text(last))))) { level = 'direct'; reason = 'give-first'; }
  else if (fatigue) { level = 'hint'; reason = 'fatigue'; }
  else if (stuckCount) { level = 'hint'; reason = 'stuck'; }
  else if (assistants.length || attempt.test(userMessage)) { level = 'hint'; reason = 'attempt'; }
  if (softened && level === 'guide') { level = 'hint'; reason = 'fatigue'; }
  const move = level === 'direct' ? 'answer' : level === 'hint' ? 'worked-step' : 'probe';
  const decision = {level, reason, move, threadId, step: assistants.length + 1} as const;
  return {...decision, instruction: mode === 'direct' ? '' : tutorInstruction(decision, replyLanguage, userMessage)};
}
export function tutorInstruction(decision: Pick<TutorDecision, 'level' | 'reason'>, replyLanguage: Settings['replyLanguage'], userMessage: string): string {
  const language = replyLanguage === 'auto' ? (/[\u3040-\u30ff]/u.test(userMessage) ? 'ja' : /[\u3400-\u9fff]/u.test(userMessage) ? 'zh-Hant' : 'en') : replyLanguage;
  return [common[language], routing[language], decision.reason === 'exit-offer' ? offers[language] : moves[language][decision.level]].join('\n');
}
