/** Localized demonstration copy. Examples use synthetic coursework. MCP access requires explicit grants. */
import type { Language } from './ui';
interface RedesignCopy {
  hero: [string, string];
  demo: string; deadline: string; course: string; review: string;
  tasks: string[]; approve: string; approved: string; reset: string;
  search: string; query: string; result: string; noResults: string;
  mcpTitle: string; mcpBody: string; mcpLink: string; mcpQuestion: string; mcpAnswer: string;
  pause: string; resume: string;
}
export const redesign: Record<Language, RedesignCopy> = {
  en: {
    hero: ['Your semester,', 'with room to think.'],
    demo: 'Interactive example', deadline: 'Until your next deadline', course: 'Algorithms assignment',
    review: 'Review the proposed plan',
    tasks: ['Review graph traversal · 25 min', 'Practice with three problems · 40 min'],
    approve: 'Approve example', approved: 'Example approved', reset: 'Try again',
    search: 'Try conversation search', query: 'graph traversal', result: 'Why does breadth-first search find the shortest path?', noResults: 'No example matches. Try “graph”.',
    mcpTitle: 'Works with your AI agents (MCP)',
    mcpBody: 'Connect external AI agents to Moodle coursework with scoped local grants and approval for every write.',
    mcpLink: 'Permission-based access', mcpQuestion: 'Can I connect my own AI agent through MCP?',
    mcpAnswer: 'Yes. Open Settings > Agents to connect a supported MCP client, compare the pairing code, and select accounts and scopes. Writes require approval inside VStudy.',
    pause: 'Pause motion', resume: 'Resume motion',
  },
  'zh-Hant': {
    hero: ['整理好學期，', '留點空間思考。'],
    demo: '互動範例', deadline: '距離下一個截止時間', course: '演算法作業',
    review: '檢視建議的讀書計畫',
    tasks: ['複習圖遍歷 · 25 分鐘', '練習三道題目 · 40 分鐘'],
    approve: '核准範例', approved: '範例已核准', reset: '再試一次',
    search: '試試對話搜尋', query: '圖遍歷', result: '為什麼廣度優先搜尋可以找到最短路徑？', noResults: '沒有符合的範例。試試「圖」。',
    mcpTitle: '連接你的 AI 助理（MCP）', mcpBody: '以本機權限連接外部 AI 助理與 Moodle 課業，每次寫入都需核准。',
    mcpLink: '由你授權存取', mcpQuestion: '可以透過 MCP 連接自己的 AI 助理嗎？',
    mcpAnswer: '可以。在「設定 > 代理程式」連接支援的 MCP 用戶端，比對配對碼並選擇帳號與權限。寫入需在 VStudy 內核准。',
    pause: '暫停動態效果', resume: '繼續動態效果',
  },
  ja: {
    hero: ['学期を整えて、', '考える余白を。'],
    demo: '操作できるサンプル', deadline: '次の締切まで', course: 'アルゴリズムの課題',
    review: '提案された計画を確認',
    tasks: ['グラフ探索を復習 · 25 分', '問題を 3 問解く · 40 分'],
    approve: 'サンプルを承認', approved: '承認しました', reset: 'もう一度試す',
    search: '会話の検索を試す', query: 'グラフ探索', result: '幅優先探索で最短経路が見つかるのはなぜ？', noResults: '一致するサンプルがありません。「グラフ」をお試しください。',
    mcpTitle: 'AI エージェントと連携（MCP）', mcpBody: '権限を限定したローカル接続で、外部 AI エージェントと Moodle を連携。書き込みは毎回承認します。',
    mcpLink: '許可した範囲で接続', mcpQuestion: 'MCP で自分の AI エージェントと接続できますか？',
    mcpAnswer: 'はい。設定 > エージェントで対応 MCP クライアントを接続し、コードを照合してアカウントと権限を選びます。書き込みは VStudy 内で承認します。',
    pause: '動きを一時停止', resume: '動きを再開',
  },
};
