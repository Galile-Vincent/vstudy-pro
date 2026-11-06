/** Localized school connection steps and provider copy. Listings do not certify institutional compatibility. */
import type { Language } from './ui';
import type { ProviderConfig } from '../../../desktop/src/shared';

export const providerConnections = {
  'anthropic-api': { name: 'Anthropic API', brand: 'Anthropic', connection: 'key', privacy: 'api' },
  'openai-api': { name: 'OpenAI API', brand: 'OpenAI', connection: 'key', privacy: 'api' },
  'openai-compatible': { name: 'OpenAI-compatible', brand: 'OpenAI-compatible', connection: 'endpoint', privacy: 'endpoint' },
  'claude-cli': { name: 'Claude Code CLI', brand: 'Claude Code', connection: 'cli', privacy: 'cli' },
  'codex-cli': { name: 'Codex CLI', brand: 'Codex', connection: 'cli', privacy: 'cli' },
  'agy-cli': { name: 'Antigravity CLI', brand: 'Antigravity', connection: 'cli', privacy: 'cli' },
} as const satisfies Record<ProviderConfig['id'], { name: string; brand: string; connection: 'key' | 'endpoint' | 'cli'; privacy: 'api' | 'endpoint' | 'cli' }>;

interface TrustCopy {
  schoolEyebrow: string; schoolTitle: string; schoolBody: string;
  schoolSteps: [string, string, string]; schoolLookup: string; schoolDocs: string;
  schoolNote: string; newTab: string;
  providerTitle: string; providerBody: string; providerDocs: string;
  key: string; cli: string; endpoint: string; macOnly: string;
  privacy: Record<'api' | 'cli' | 'endpoint', string>; disclaimer: string;
}
export const trustCopy: Record<Language, TrustCopy> = {
  en: {
    schoolEyebrow: 'Your school, connected',
    schoolTitle: 'Any school that runs Moodle.',
    schoolBody: "If your school's Moodle has the mobile service switched on, you can sign in with your school account.",
    schoolSteps: ['Your school runs Moodle', 'Open VStudy Pro and choose Connect school', 'Sign in with your school account. Your courses appear.'],
    schoolLookup: 'Check whether your school uses Moodle',
    schoolDocs: 'How school connections work',
    schoolNote: "Availability depends on each school's settings. First tested with CYCU in Taiwan.",
    newTab: 'opens in a new tab',
    providerTitle: 'Your choice of AI.',
    providerBody: 'Connect a provider, then choose a model available to your account or endpoint. AI is optional. Bring your own access; provider terms and charges apply.',
    providerDocs: 'Provider setup and privacy', key: 'API key', cli: 'Uses your CLI sign-in',
    endpoint: 'Any OpenAI-compatible endpoint, including local', macOnly: 'macOS only · verified CLI version required',
    privacy: { api: 'Your prompts and selected context go to the provider.', cli: 'The CLI handles your prompts under its own network and privacy settings.', endpoint: 'Your prompts go to the endpoint you configure. Its privacy settings apply.' },
    disclaimer: 'Product names and logos are trademarks of their respective owners. VStudy Pro is not affiliated with or endorsed by them.',
  },
  'zh-Hant': {
    schoolEyebrow: '連接你的學校',
    schoolTitle: '學校有 Moodle，就能開始。',
    schoolBody: '只要學校的 Moodle 已啟用行動服務，就能使用學校帳號登入。',
    schoolSteps: ['學校使用 Moodle', '打開 VStudy Pro，選擇「連接學校」', '使用學校帳號登入，課程隨即顯示。'],
    schoolLookup: '查詢學校是否使用 Moodle',
    schoolDocs: '了解學校連線方式',
    schoolNote: '能否使用取決於各校設定。最初以台灣 CYCU 測試。',
    newTab: '在新分頁開啟',
    providerTitle: 'AI，由你選擇。',
    providerBody: '連接供應商後，選擇帳號或端點可用的模型。AI 為選用功能，需自備存取權，費用與使用條款依供應商規定。',
    providerDocs: '供應商設定與隱私', key: 'API 金鑰', cli: '使用 CLI 登入狀態',
    endpoint: '任何 OpenAI 相容端點，包含本機服務', macOnly: '僅限 macOS · 需要已驗證的 CLI 版本',
    privacy: { api: '提示與選取的上下文會傳送給供應商。', cli: 'CLI 依其自身網路與隱私設定處理提示。', endpoint: '提示會傳送至你設定的端點，並適用該端點的隱私設定。' },
    disclaimer: '產品名稱與標誌為各自擁有者的商標。VStudy Pro 與其並無隸屬關係，亦未獲其背書。',
  },
  ja: {
    schoolEyebrow: '学校とつながる',
    schoolTitle: 'Moodle を使う、どの学校でも。',
    schoolBody: '学校の Moodle でモバイルサービスが有効なら、学校のアカウントでログインできます。',
    schoolSteps: ['学校が Moodle を使用', 'VStudy Pro を開き「学校に接続」を選ぶ', '学校のアカウントでログインすると、授業が表示されます。'],
    schoolLookup: '学校が Moodle を使っているか調べる',
    schoolDocs: '学校への接続について',
    schoolNote: '利用可否は各校の設定によります。台湾の CYCU で初期テストを実施しました。',
    newTab: '新しいタブで開きます',
    providerTitle: 'AI は、自分で選ぶ。',
    providerBody: '接続後、アカウントやエンドポイントで利用できるモデルを選べます。AI は任意です。自分の利用権が必要で、各社の規約と料金が適用されます。',
    providerDocs: 'プロバイダーの設定とプライバシー', key: 'API キー', cli: 'CLI のログインを使用',
    endpoint: 'ローカルを含む任意の OpenAI 互換エンドポイント', macOnly: 'macOS のみ · 検証済み CLI バージョンが必要',
    privacy: { api: 'プロンプトと選択した文脈をプロバイダーに送信します。', cli: 'CLI 独自の通信とプライバシー設定でプロンプトを処理します。', endpoint: '設定したエンドポイントへ送信し、そのプライバシー設定が適用されます。' },
    disclaimer: '製品名とロゴは各所有者の商標です。VStudy Pro は各社と提携しておらず、推奨も受けていません。',
  },
};
