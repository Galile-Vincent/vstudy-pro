/** Fictional school demos and connection copy. No record asserts institutional compatibility or endorsement. */
import type { Language } from './ui';
import type { ProviderConfig } from '../../../desktop/src/shared';

export const exampleSchools = [
  { name: 'Example University', monogram: 'EU', country: 0 },
  { name: 'Northfield College', monogram: 'NC', country: 1 },
  { name: 'Harbor Institute', monogram: 'HI', country: 2 },
  { name: 'Lakeside University', monogram: 'LU', country: 3 },
  { name: 'Metro Tech', monogram: 'MT', country: 4 },
] as const;

export const providerConnections = {
  'anthropic-api': { name: 'Anthropic API', brand: 'Anthropic', connection: 'key', privacy: 'api' },
  'openai-api': { name: 'OpenAI API', brand: 'OpenAI', connection: 'key', privacy: 'api' },
  'openai-compatible': { name: 'OpenAI-compatible', brand: 'OpenAI-compatible', connection: 'endpoint', privacy: 'endpoint' },
  'claude-cli': { name: 'Claude Code CLI', brand: 'Claude Code', connection: 'cli', privacy: 'cli' },
  'codex-cli': { name: 'Codex CLI', brand: 'Codex', connection: 'cli', privacy: 'cli' },
  'agy-cli': { name: 'Antigravity CLI', brand: 'Antigravity', connection: 'cli', privacy: 'cli' },
} as const satisfies Record<ProviderConfig['id'], { name: string; brand: string; connection: 'key' | 'endpoint' | 'cli'; privacy: 'api' | 'endpoint' | 'cli' }>;

interface TrustCopy {
  schoolTitle: string; schoolBody: string; availability: string; demo: string;
  search: string; detected: string; connect: string; signIn: string; countries: string[];
  pause: string; play: string; previous: string; next: string; show: string; carousel: string;
  schoolDocs: string; cycu: string;
  providerTitle: string; providerBody: string; providerDocs: string;
  key: string; cli: string; endpoint: string; macOnly: string;
  privacy: Record<'api' | 'cli' | 'endpoint', string>; disclaimer: string;
}
export const trustCopy: Record<Language, TrustCopy> = {
  en: {
    schoolTitle: 'Find your school.',
    schoolBody: 'Works with schools whose Moodle has the mobile service switched on',
    availability: "Availability depends on each school's settings and sign-in requirements.",
    demo: 'Fictional schools · Demo only · No connection is made',
    search: 'Search for your school', detected: 'Moodle mobile service detected', connect: 'Connect',
    signIn: 'Next, sign in through your school in the app.',
    countries: ['Taiwan', 'United Kingdom', 'Japan', 'Canada', 'Australia'],
    pause: 'Pause', play: 'Play', previous: 'Previous school', next: 'Next school', show: 'Show', carousel: 'carousel',
    schoolDocs: 'School availability and directory',
    cycu: 'First tested with CYCU in Taiwan. Full course-content compatibility is still unconfirmed.',
    providerTitle: 'Your choice of AI.',
    providerBody: 'Connect a provider, then choose a model available to your account or endpoint. AI is optional. Bring your own access; provider terms and charges apply.',
    providerDocs: 'Provider setup and privacy', key: 'API key', cli: 'Uses your CLI sign-in',
    endpoint: 'Any OpenAI-compatible endpoint, including local', macOnly: 'macOS only · verified CLI version required',
    privacy: { api: 'Your prompts and selected context go to the provider.', cli: 'The CLI handles your prompts under its own network and privacy settings.', endpoint: 'Your prompts go to the endpoint you configure. Its privacy settings apply.' },
    disclaimer: 'Product names and logos are trademarks of their respective owners. VStudy Pro is not affiliated with or endorsed by them.',
  },
  'zh-Hant': {
    schoolTitle: '找到你的學校。',
    schoolBody: '適用於已啟用 Moodle 行動服務的學校',
    availability: '能否連接取決於各校設定與登入要求。',
    demo: '虛構學校 · 僅為示範 · 不會建立連線',
    search: '搜尋你的學校', detected: '已偵測到 Moodle 行動服務', connect: '連接',
    signIn: '下一步，在應用程式中透過學校登入。',
    countries: ['台灣', '英國', '日本', '加拿大', '澳洲'],
    pause: '暫停', play: '播放', previous: '上一所學校', next: '下一所學校', show: '顯示', carousel: '輪播',
    schoolDocs: '學校可用性與名錄說明',
    cycu: '最初以台灣中原大學（CYCU）測試，完整課程內容的相容性仍未確認。',
    providerTitle: 'AI，由你選擇。',
    providerBody: '連接供應商後，選擇帳號或端點可用的模型。AI 為選用功能，需自備存取權，費用與使用條款依供應商規定。',
    providerDocs: '供應商設定與隱私', key: 'API 金鑰', cli: '使用 CLI 登入狀態',
    endpoint: '任何 OpenAI 相容端點，包含本機服務', macOnly: '僅限 macOS · 需要已驗證的 CLI 版本',
    privacy: { api: '提示與選取的上下文會傳送給供應商。', cli: 'CLI 依其自身網路與隱私設定處理提示。', endpoint: '提示會傳送至你設定的端點，並適用該端點的隱私設定。' },
    disclaimer: '產品名稱與標誌為各自擁有者的商標。VStudy Pro 與其並無隸屬關係，亦未獲其背書。',
  },
  ja: {
    schoolTitle: 'あなたの学校を見つける。',
    schoolBody: 'Moodle のモバイルサービスを有効にしている学校で利用できます',
    availability: '接続の可否は各校の設定とログイン要件によって異なります。',
    demo: '架空の学校 · デモのみ · 接続は行いません',
    search: '学校を検索', detected: 'Moodle モバイルサービスを検出', connect: '接続',
    signIn: '次に、アプリ内で学校の認証を使ってログインします。',
    countries: ['台湾', 'イギリス', '日本', 'カナダ', 'オーストラリア'],
    pause: '一時停止', play: '再生', previous: '前の学校', next: '次の学校', show: '表示', carousel: 'カルーセル',
    schoolDocs: '学校の対応状況と一覧について',
    cycu: '台湾の中原大学（CYCU）で初期テストを実施しました。授業コンテンツ全体の互換性は未確認です。',
    providerTitle: 'AI は、自分で選ぶ。',
    providerBody: '接続後、アカウントやエンドポイントで利用できるモデルを選べます。AI は任意です。自分の利用権が必要で、各社の規約と料金が適用されます。',
    providerDocs: 'プロバイダーの設定とプライバシー', key: 'API キー', cli: 'CLI のログインを使用',
    endpoint: 'ローカルを含む任意の OpenAI 互換エンドポイント', macOnly: 'macOS のみ · 検証済み CLI バージョンが必要',
    privacy: { api: 'プロンプトと選択した文脈をプロバイダーに送信します。', cli: 'CLI 独自の通信とプライバシー設定でプロンプトを処理します。', endpoint: '設定したエンドポイントへ送信し、そのプライバシー設定が適用されます。' },
    disclaimer: '製品名とロゴは各所有者の商標です。VStudy Pro は各社と提携しておらず、推奨も受けていません。',
  },
};
