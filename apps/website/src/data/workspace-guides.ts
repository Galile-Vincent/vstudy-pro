/** Current reader and customization controls, grounded in the desktop settings and reader UI. */
import type { Guide } from './docs';
import type { Language } from './ui';
type Page = Pick<Guide,'title'|'description'|'sections'>;
const image=(name:string,alt:string)=>({name,width:1440,height:900,alt});
export const workspaceGuides: Record<Language, Record<string,Page>> = {
  en: {
    'reading-documents': {title:'Reading documents with AI',description:'Keep figures, inspect original pages, and attach a page or region to chat.',sections:[
      {id:'import',title:'Import and organize',paragraphs:['Import PDF, DOCX, XLSX, PPTX, HTML, CSV, Markdown, or text up to 50 MB. Library offers All files and Folders views, including course folders, plus pins, tags, and saved filters. Originals and converted text stay in the local library. Markdown and text work without Python; other formats need the on-demand converter.'],image:image('library','Library with folders and local course documents')},
      {id:'figures',title:'Read text and figures together',paragraphs:['Converted document figures appear alongside the parsed text. AI improvement preserves referenced figures when it rewrites the text. Complex layouts, equations, and tables can still lose fidelity. Single-file HTML and Markdown imports do not copy neighboring images. Scanned PDFs need OCR elsewhere.'],image:image('document-figures','Converted PDF text and embedded graph figure')},
      {id:'original',title:'Inspect the original page',paragraphs:['Switch from Parsed text to Original file inside the reader. PDFs support page navigation; supported Office files on macOS offer a first-page preview. Export Office files to PDF to inspect every page. This view is separate from opening the original in your system app.'],image:image('original-page','Original PDF page with navigation and capture tools')},
      {id:'capture',title:'Attach a page or region',paragraphs:['Choose Attach page, or Capture region and drag over the page. Add a question beside the attachment. Native AI chat needs an image-capable model. For web chat, copy the image and page context, then paste it into the web chat. You control when the image is sent.'],image:image('capture-to-chat','A PDF page attached beside a draft question')},
      {id:'ask',title:'Ask about a passage',paragraphs:['Select text and choose Ask about this, or press Cmd/Ctrl+Shift+K. Choose an enabled provider and model before sending. Answers can cite stored passages; check the source for important claims. Without a selection the app includes a bounded outline and excerpt, not necessarily the whole document.'],image:image('reader','Selected passage beside a saved demo answer and citation')},
      {id:'improve',title:'Improve parsed text with AI',paragraphs:['Re-parse with AI is available in the reader for completed conversions. Choose a model and page range, estimate the cost, and confirm before starting. Estimates are approximate; the panel does not provide a guaranteed spending cap. Compare reading versions or revert to the original parsed text. This is optional and does not provide independent OCR.']},
    ]},
    themes:{title:'Customize your workspace',description:'Choose palettes, card transparency, reading controls, and how documents open.',sections:[
      {id:'packs',title:'Choose a theme pack',paragraphs:['Settings > Appearance includes VStudy, Ocean, Grove, Ember, Iris, Rose, Slate, Paper, and High contrast. Each pack has light and dark palettes. Choose System, Light, or Dark.'],image:image('themes','Appearance settings with Card transparency and default document opening')},
      {id:'cards',title:'Card transparency',paragraphs:['Choose Solid, Soft, or Glass independently of the palette. Advanced settings include contrast and glass opacity. Reduced transparency and solid material settings can override glass effects.']},
      {id:'reading',title:'Text, language, and document opening',paragraphs:['Appearance includes text scale (100%, 125%, 150%, or 200%), comfortable or compact density, system/serif/mono reader font, and reader sizes S–XL. Choose whether documents open in the VStudy reader or your system’s default app. You can override this when opening a file. General settings offer English, Traditional Chinese, and Japanese.']},
      {id:'custom',title:'Custom packs',paragraphs:['Create, edit, import, and export theme packs. Imports accept validated JSON up to 32 KB and 30 unique custom packs. Colors must be opaque six-digit hex values. The editor previews both schemes and reports contrast warnings. Cancel restores the saved appearance.']},
    ]},
    usage:{title:'Usage and limits',description:'Read subscription limits and set local monthly budgets.',sections:[
      {id:'subscription',title:'Subscription limits in the sidebar',paragraphs:['The sidebar and Settings > Usage show Claude and Codex subscription windows when available, including five-hour and weekly usage. Unknown, stale, unavailable, and unsupported states are shown explicitly. Refresh checks again. Reading Claude Code credentials from macOS Keychain requires session permission. These meters are separate from API billing.'],image:image('usage-settings','Synthetic subscription limits and usage settings')},
      {id:'budgets',title:'Set your own budget',paragraphs:['Usage settings let you set monthly USD and token limits and a warning percentage. Leave a limit blank for no limit. Token counts and prices may be unknown; API-equivalent subscription estimates are not a provider invoice or account balance. Export usage or inspect custom prices under Advanced.']},
    ]},
  },
  'zh-Hant': {
    'reading-documents':{title:'使用 AI 閱讀文件',description:'保留圖表、檢視原始頁面，將整頁或擷取區域附加至聊天。',sections:[
      {id:'import',title:'匯入與整理',paragraphs:['支援 50 MB 以內的 PDF、DOCX、XLSX、PPTX、HTML、CSV、Markdown 與純文字。資料庫可切換所有檔案與資料夾檢視，包含課程資料夾，也支援釘選、標籤與儲存篩選。原始檔與轉換文字保存在本機。Markdown 與文字不需 Python，其他格式需按需安裝的轉換器。'],image:image('library','包含課程文件與資料夾的資料庫')},
      {id:'figures',title:'文字與圖表一起讀',paragraphs:['轉換擷取的圖像會顯示在解析文字中。AI 改善文字時會保留已引用的圖像。複雜排版、公式與表格仍可能失真。單檔 HTML 與 Markdown 匯入不會複製相鄰圖片；掃描 PDF 需先在其他工具進行 OCR。'],image:image('document-figures','轉換 PDF 的文字與內嵌圖像')},
      {id:'original',title:'檢視原始頁面',paragraphs:['在閱讀器切換解析文字與原始檔。PDF 可逐頁瀏覽；macOS 上支援的 Office 文件提供首頁預覽。需要所有頁面時，請先匯出為 PDF。這與使用系統應用程式開啟原始檔是不同操作。'],image:image('original-page','原始 PDF 頁面與擷取工具')},
      {id:'capture',title:'附加整頁或區域',paragraphs:['選擇附加頁面，或擷取區域並拖曳框選，再輸入問題。原生 AI 聊天需要支援圖片的模型。網頁聊天可複製圖片與頁面脈絡後自行貼上。由你決定何時傳送圖片。'],image:image('capture-to-chat','PDF 頁面已附加至問題草稿')},
      {id:'ask',title:'針對段落提問',paragraphs:['選取文字後使用「詢問這段」或 Cmd/Ctrl+Shift+K。傳送前選擇已啟用的供應商與模型。回答的引用可回到文件，重要內容請核對原文。未選取時會提供有長度上限的大綱與摘錄，不一定是整份文件。'],image:image('reader','選取段落、示範回答與引用')},
      {id:'improve',title:'以 AI 改善解析文字',paragraphs:['完成轉換後，可在閱讀器使用 AI 重新解析。選擇模型與頁面範圍、估算費用並確認後開始。估價可能不準確，面板不提供保證的消費上限。可比較閱讀版本或還原原始解析文字。此功能為選用，不提供獨立 OCR。']},
    ]},
    themes:{title:'自訂工作空間',description:'調整配色、卡片透明度、閱讀與文件開啟方式。',sections:[
      {id:'packs',title:'選擇主題',paragraphs:['「設定 > 外觀」包含 VStudy、海洋、森林、餘燼、鳶尾、玫瑰、石板、紙張與高對比九組主題，每組都有明暗配色。可選擇跟隨系統、淺色或深色。'],image:image('themes','外觀設定中的卡片透明度與預設開啟方式')},
      {id:'cards',title:'卡片透明度',paragraphs:['可獨立於配色選擇實心、柔和或玻璃效果。進階設定包含對比與玻璃不透明度。減少透明效果與實心材質設定可能覆寫玻璃效果。']},
      {id:'reading',title:'文字、語言與開啟方式',paragraphs:['可調整文字縮放 100%、125%、150%、200%，舒適或緊湊密度，系統、襯線或等寬閱讀字體，以及 S–XL 字級。可預設使用 VStudy 閱讀器或系統應用程式開啟文件，每次開啟也能個別選擇。一般設定支援英文、繁體中文與日文。']},
      {id:'custom',title:'自訂主題',paragraphs:['可建立、編輯、匯入與匯出主題。JSON 匯入上限為 32 KB，最多 30 組不重複的自訂主題；色彩必須是六位不透明十六進位值。編輯器預覽明暗兩種配色並提示對比問題，取消會還原已儲存外觀。']},
    ]},
    usage:{title:'用量與限制',description:'查看訂閱用量並設定本機每月預算。',sections:[
      {id:'subscription',title:'側邊欄訂閱用量',paragraphs:['側邊欄與「設定 > 用量」可在資料可用時顯示 Claude 與 Codex 的五小時及每週訂閱用量。未知、過期、無法取得與不支援狀態會明確顯示，可重新整理。讀取 macOS 鑰匙圈中的 Claude Code 憑證需要本次工作階段授權。訂閱用量與 API 帳單分開。'],image:image('usage-settings','示範訂閱限制與用量設定')},
      {id:'budgets',title:'設定自己的預算',paragraphs:['可設定每月美元與 token 上限及警告百分比，留白代表不設限。token 數與價格可能未知；訂閱的 API 等值估算不代表供應商帳單或帳戶餘額。可匯出用量，或在進階設定檢查自訂價格。']},
    ]},
  },
  ja:{
    'reading-documents':{title:'AI と資料を読む',description:'図を残し、元のページを確認し、ページや範囲をチャットに添付します。',sections:[
      {id:'import',title:'取り込みと整理',paragraphs:['50 MB までの PDF、DOCX、XLSX、PPTX、HTML、CSV、Markdown、テキストを取り込めます。ライブラリには全ファイルとフォルダー表示、授業フォルダー、ピン、タグ、保存したフィルターがあります。原本と変換テキストはローカルに保存します。Markdown とテキスト以外はオンデマンドの変換器が必要です。'],image:image('library','授業資料とフォルダーのライブラリ')},
      {id:'figures',title:'文章と図を一緒に読む',paragraphs:['変換で抽出した図を解析テキストに表示します。AI による改善でも参照された図を保持します。複雑なレイアウト、数式、表は崩れる場合があります。単一の HTML や Markdown の取り込みは隣接画像をコピーしません。スキャン PDF は別のツールで OCR を行ってください。'],image:image('document-figures','PDF の変換テキストとグラフ')},
      {id:'original',title:'元のページを見る',paragraphs:['リーダー内で解析テキストと原本を切り替えます。PDF はページ移動に対応し、macOS の対応 Office ファイルは先頭ページをプレビューします。全ページを見るには PDF に書き出してください。システムのアプリで原本を開く操作とは別です。'],image:image('original-page','元の PDF ページとキャプチャ操作')},
      {id:'capture',title:'ページや範囲を添付',paragraphs:['ページを添付するか、範囲をキャプチャしてドラッグし、質問を入力します。ネイティブの AI チャットには画像対応モデルが必要です。Web チャットには画像とページ情報をコピーして貼り付けます。画像を送るタイミングは自分で決めます。'],image:image('capture-to-chat','質問の下書きに添付した PDF ページ')},
      {id:'ask',title:'文章について質問する',paragraphs:['文章を選び、質問する操作または Cmd/Ctrl+Shift+K を使います。送信前に有効なプロバイダーとモデルを選びます。引用から原文に戻り、重要な内容を確認してください。未選択の場合は長さに上限のある目次と抜粋を使い、全文とは限りません。'],image:image('reader','選択した文章、デモ回答と引用')},
      {id:'improve',title:'AI で解析テキストを改善',paragraphs:['変換完了後はリーダーから AI で再解析できます。モデルとページ範囲を選び、料金を見積もり、確認して開始します。見積額は概算で、この画面には支出額を保証する上限設定はありません。読み取り版の比較や元の解析テキストへの復帰も可能です。任意の機能で、独立した OCR は提供しません。']},
    ]},
    themes:{title:'ワークスペースのカスタマイズ',description:'配色、カードの透明度、読み方、資料の開き方を選べます。',sections:[
      {id:'packs',title:'テーマを選ぶ',paragraphs:['設定 > 外観には VStudy、Ocean、Grove、Ember、Iris、Rose、Slate、Paper、ハイコントラストの 9 組があります。それぞれライトとダークに対応し、システム追従も選べます。'],image:image('themes','カードの透明度と資料の開き方の設定')},
      {id:'cards',title:'カードの透明度',paragraphs:['配色とは別にソリッド、ソフト、ガラスを選べます。詳細設定にはコントラストとガラスの不透明度があります。透明度を下げる設定やソリッド素材がガラス効果より優先される場合があります。']},
      {id:'reading',title:'文字、言語、資料の開き方',paragraphs:['文字倍率 100%、125%、150%、200%、標準またはコンパクトな密度、システム・セリフ・等幅の書体、S–XL の文字サイズを選べます。資料は VStudy リーダーまたはシステムの既定アプリで開く設定にでき、開く際にも変更できます。一般設定では英語、繁体字中国語、日本語を選べます。']},
      {id:'custom',title:'カスタムテーマ',paragraphs:['テーマの作成、編集、インポート、エクスポートに対応します。検証済み JSON は 32 KB、重複しないカスタムテーマは 30 組まで。色は不透明の 6 桁の 16 進数値を使います。編集画面で両配色とコントラストの警告を確認でき、キャンセルで保存済みの外観に戻ります。']},
    ]},
    usage:{title:'使用量と制限',description:'サブスクリプションの制限とローカルの月間予算を確認します。',sections:[
      {id:'subscription',title:'サイドバーの使用量',paragraphs:['サイドバーと設定 > 使用量に、取得できた Claude と Codex の 5 時間・週間の利用枠を表示します。不明、古い情報、取得不可、非対応は明示され、更新できます。macOS キーチェーンの Claude Code 認証情報を読むにはセッションごとの許可が必要です。API の請求とは別の情報です。'],image:image('usage-settings','デモのサブスクリプション制限と使用量設定')},
      {id:'budgets',title:'予算を設定する',paragraphs:['月間 USD、トークン上限、警告の割合を設定できます。空欄は上限なしです。トークン数や価格が不明な場合もあり、サブスクリプションの API 相当額は請求書や口座残高ではありません。使用量を書き出し、詳細設定で独自価格を確認できます。']},
    ]},
  },
};
