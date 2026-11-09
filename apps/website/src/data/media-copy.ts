import type { Language } from './ui';
export interface MediaCopy {
  beta: string; title: string; intro: string; kit: string; assets: string; symbol: string; lockups: [string,string];
  screenshots: string; shotNames: string[]; colors: string; colorNames: string[]; rules: string; usage: string[];
  boilerplate: string; about: string; contact: string; share: string; shareIntro: string; format: string; look: string;
  formats: [string,string]; looks: [string,string,string]; headline: [string,string]; chips: [string,string,string];
  free: string; download: string; shareAction: string; copyLink: string; copyCaption: string; copy: string;
  caption: string; preview: string; ready: string; copied: string; saved: string; error: string; loading: string;
}
export const mediaCopy: Record<Language, MediaCopy> = {
  en: {
    beta: 'beta',
    title: 'Made to be shared.', intro: 'A little VStudy Pro, out in the world. Pick up our brand assets or make a post of your own.',
    kit: 'Media kit', assets: 'The essentials', symbol: 'Symbol', lockups: ['Lockup · light backgrounds','Lockup · dark backgrounds'],
    screenshots: 'Inside the app', shotNames: ['Courses','Study with AI','Library','Documents'], colors: 'Our palette',
    colorNames: ['Accent','Ink','Paper','Sky','Iris'], rules: 'Keep it VStudy Pro',
    usage: ['Always spell the name VStudy Pro.', 'Use the original colors. Do not recolor the mark.', 'Leave clear space of at least half the symbol’s height.', 'Keep the small beta badge beside the symbol when promoting the beta.'],
    boilerplate: 'In a few words', about: 'VStudy Pro is a desktop study workspace that brings courses, Moodle, documents, notes, and AI conversations together. Students can ask questions about their materials, keep work open in tabs, and plan what comes next. The library stays on their computer, with optional AI connections.',
    contact: 'Press & questions', share: 'Your next study story.', shareIntro: 'Choose a format and a look. Your image is made right here in your browser.',
    format: 'Format', look: 'Look', formats: ['Story','Square'], looks: ['Light','Dark','Aurora'],
    headline: ['Less switching.', 'More learning.'], chips: ['Study with AI','Courses & Moodle','Notes & documents'],
    free: 'Download free', download: 'Download PNG', shareAction: 'Share image', copyLink: 'Copy link', copyCaption: 'Copy caption', copy: 'Copy text',
    caption: 'Less switching. More learning. My study workspace with AI, courses, Moodle, notes and documents. Download VStudy Pro free',
    preview: 'Share image preview', ready: 'Your image is ready.', copied: 'Copied.', saved: 'PNG download started.', error: 'Could not complete that action. Please try again.', loading: 'Preparing your image…',
  },
  'zh-Hant': {
    beta: '測試版',
    title: '讓好用的工具，被看見。', intro: '下載 VStudy Pro 品牌素材，或製作一張屬於你的分享圖片。',
    kit: '媒體素材', assets: '品牌標誌', symbol: '品牌圖示', lockups: ['標誌組合・淺色背景','標誌組合・深色背景'],
    screenshots: '看看 App 裡面', shotNames: ['課程','AI 學習','資料庫','文件'], colors: '品牌色彩', colorNames: ['主色','墨色','紙白','天空藍','鳶尾紫'],
    rules: '一起維持品牌的樣子', usage: ['名稱請統一寫作 VStudy Pro。','請使用原始色彩，不要重新上色。','圖示周圍請保留至少半個圖示高度的留白。','介紹測試版時，請在圖示旁保留小型 beta 標籤。'],
    boilerplate: '關於 VStudy Pro', about: 'VStudy Pro 是一款桌面學習工作空間，將課程、Moodle、文件、筆記與 AI 對話整合在一起。學生可以針對教材提問，在分頁之間切換學習內容，並規劃接下來的任務。資料庫保留在自己的電腦上，AI 連線則由使用者自由選擇。',
    contact: '媒體與聯絡', share: '把你的學習日常，分享出去。', shareIntro: '選擇尺寸與風格，直接在瀏覽器製作圖片。',
    format: '圖片尺寸', look: '風格', formats: ['限時動態','正方形'], looks: ['淺色','深色','極光'], headline: ['少一點切換，','多一點理解。'],
    chips: ['與 AI 一起學習','課程與 Moodle','筆記與文件'], free: '免費下載', download: '下載 PNG', shareAction: '分享圖片', copyLink: '複製連結', copyCaption: '複製貼文', copy: '複製介紹',
    caption: '少一點切換，多一點理解。用 VStudy Pro 整合 AI、課程、Moodle、筆記與文件，打造自己的學習空間。免費下載',
    preview: '分享圖片預覽', ready: '圖片已準備好。', copied: '已複製。', saved: '已開始下載 PNG。', error: '操作未完成，請再試一次。', loading: '正在準備圖片…',
  },
  ja: {
    beta: 'ベータ',
    title: '学びの道具を、もっと身近に。', intro: 'VStudy Pro のブランド素材をダウンロード。自分らしいシェア画像も作れます。',
    kit: 'メディアキット', assets: 'ブランド素材', symbol: 'シンボル', lockups: ['ロゴ・明るい背景用','ロゴ・暗い背景用'],
    screenshots: 'アプリの中を見る', shotNames: ['コース','AI と学ぶ','ライブラリ','ドキュメント'], colors: 'ブランドカラー', colorNames: ['アクセント','インク','ペーパー','スカイ','アイリス'],
    rules: 'ブランドの使い方', usage: ['名称は VStudy Pro と表記してください。','元の色を使い、色を変更しないでください。','シンボルの高さの半分以上の余白を確保してください。','ベータ版の紹介には、シンボルの横に小さな beta バッジを添えてください。'],
    boilerplate: 'VStudy Pro について', about: 'VStudy Pro は、コース、Moodle、ドキュメント、ノート、AI との会話をひとつにまとめたデスクトップ学習ワークスペースです。教材について質問し、タブで学習内容を開き、次の課題を計画できます。ライブラリは自分のパソコンに保存され、AI への接続は任意で選べます。',
    contact: '取材・お問い合わせ', share: '今日の学びを、シェアしよう。', shareIntro: 'サイズとスタイルを選ぶだけ。画像はブラウザー内で作成されます。',
    format: 'サイズ', look: 'スタイル', formats: ['ストーリー','スクエア'], looks: ['ライト','ダーク','オーロラ'], headline: ['切り替えを減らして','学びを深める。'],
    chips: ['AI と学ぶ','コースと Moodle','ノートと資料'], free: '無料ダウンロード', download: 'PNG をダウンロード', shareAction: '画像を共有', copyLink: 'リンクをコピー', copyCaption: '投稿文をコピー', copy: '紹介文をコピー',
    caption: '切り替えを減らして、学びを深める。AI、コース、Moodle、ノートと資料をひとつに。VStudy Pro を無料ダウンロード',
    preview: 'シェア画像のプレビュー', ready: '画像の準備ができました。', copied: 'コピーしました。', saved: 'PNG のダウンロードを開始しました。', error: '操作できませんでした。もう一度お試しください。', loading: '画像を準備しています…',
  },
};
