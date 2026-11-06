# Disclosure visibility audit

All quoted values below are unchanged from HEAD. `providers.tsx:156` now places them inside a closed details element.

## en

- `novice:without_ai`: "You can read and organise documents, view connected school deadlines, and make a study plan without AI. Answers about your reading need a connected AI service." May remain in the optional guide.
- `novice:step_access`: "Choose an AI service approved by your school. Ask your teacher or IT team if you are unsure. A ChatGPT or Claude chat subscription does not include API credit. The service may charge separately." Keep visible before credentials and setup actions.
- `novice:step_key`: "Use Get a key below for that service. Paste its secret code into the matching field. Choose Use without saving keys for this session, or Save key. If secure storage permission is denied, you can retry or use the session option." Keep visible before credentials and setup actions.
- `novice:step_answer`: "Select Test connection and wait for confirmation. Close Settings, choose a model in Chat, select a passage, and ask a question. If the check fails, follow its message or ask your school for help." May remain in the optional guide.
- `novice:ask_school`: "You do not need Terminal or a paid account to keep reading. Ask your teacher or IT team which AI access your school permits. You can copy this request:" May remain in the optional guide.
- `novice:school_request`: "I use VStudy Pro to read course materials. Does our school provide an approved AI service and an API key? How do I connect it, and are there any costs or restrictions? If AI access is unavailable, who can help me with questions about my reading?" May remain in the optional guide.
- `novice:privacy`: "Never paste your school password into AI settings or a chat. A connected AI service receives your question, chat history, and document context, including selected text. Check your school rules before sharing coursework." Keep visible before credentials and setup actions.
- `novice:continue_reading`: "Continue without AI" May remain in the optional guide.

## zh-Hant

- `novice:without_ai`: "不使用 AI 也能閱讀與整理文件、查看已連接學校的期限，以及建立讀書計畫。若想針對教材獲得回答，需要先連接 AI 服務。" May remain in the optional guide.
- `novice:step_access`: "選擇學校允許使用的 AI 服務。不確定時，先詢問老師或學校資訊單位。ChatGPT 或 Claude 的聊天訂閱不包含 API 額度，服務可能另外收費。" Keep visible before credentials and setup actions.
- `novice:step_key`: "按下對應服務的「取得金鑰」，取得秘密代碼後貼到該服務的欄位。可選「使用但不儲存金鑰」僅供本次使用，或選「儲存金鑰」。若拒絕安全儲存權限，可重試或改用本次使用的選項。" Keep visible before credentials and setup actions.
- `novice:step_answer`: "按「測試連線」並等待成功訊息。關閉設定，在對話區選擇模型，再選取段落並提問。若測試失敗，依訊息操作或請學校協助。" May remain in the optional guide.
- `novice:ask_school`: "你不需要使用終端機或付費帳號就能繼續閱讀。請向老師或學校資訊單位詢問允許使用的 AI 服務。可以複製以下問題：" May remain in the optional guide.
- `novice:school_request`: "我用 VStudy Pro 閱讀課程教材。學校有提供允許使用的 AI 服務與 API 金鑰嗎？如何連接？有費用或使用限制嗎？如果無法使用 AI，可以找誰協助我理解教材？" May remain in the optional guide.
- `novice:privacy`: "不要把學校密碼貼進 AI 設定或對話。連接的 AI 服務會收到問題、聊天記錄與文件內容，包括選取的文字。分享教材前，請先確認學校規定。" Keep visible before credentials and setup actions.
- `novice:continue_reading`: "不使用 AI，繼續閱讀" May remain in the optional guide.

## ja

- `novice:without_ai`: "AI がなくても、文書の閲覧と整理、接続済みの学校の締め切り確認、学習計画の作成ができます。教材について回答を得るには、AI サービスへの接続が必要です。" May remain in the optional guide.
- `novice:step_access`: "学校が認めた AI サービスを選びます。不明な場合は教員や情報システム担当者に確認してください。ChatGPT や Claude のチャット契約には API の利用枠は含まれず、別途料金がかかる場合があります。" Keep visible before credentials and setup actions.
- `novice:step_key`: "該当するサービスの「キーを取得」から秘密のコードを取得し、そのサービスの欄に貼り付けます。今回だけ使う場合は「キーを保存せずに使用」、保存する場合は「キーを保存」を選びます。安全なストレージの許可を拒否した場合も、再試行または今回だけの使用を選べます。" Keep visible before credentials and setup actions.
- `novice:step_answer`: "「接続をテスト」を選び、成功の表示を待ちます。設定を閉じてチャットでモデルを選び、文章を選択して質問します。失敗した場合は表示の案内に従うか、学校に相談してください。" May remain in the optional guide.
- `novice:ask_school`: "ターミナルや有料アカウントがなくても読書を続けられます。利用できる AI について教員や情報システム担当者に相談してください。次の質問をコピーできます。" May remain in the optional guide.
- `novice:school_request`: "VStudy Pro で教材を読んでいます。学校が認めた AI サービスと API キーは提供されていますか？接続方法、料金、利用制限を教えてください。AI を利用できない場合、教材について誰に相談できますか？" May remain in the optional guide.
- `novice:privacy`: "学校のパスワードを AI の設定やチャットに貼り付けないでください。接続した AI サービスには質問、会話履歴、選択した文章などの文書内容が送信されます。教材を共有する前に学校の規則を確認してください。" Keep visible before credentials and setup actions.
- `novice:continue_reading`: "AI を使わずに続ける" May remain in the optional guide.

## Relocated helper text

The API forms now precede these unchanged helpers. Keep the secure-storage explanation discoverable before saving a key.

- en `settings:key_help`: "An API key is a secret code from your AI service’s developer website. A chat login is different. The service may charge you for use."
- en `settings:keychain_help`: "On Mac, saving may ask for your Mac login password so VStudy Pro can use Keychain. A session key lasts only until you quit the app."
- zh-Hant `settings:key_help`: "API 金鑰是從 AI 服務開發者網站取得的秘密代碼，與聊天帳號登入不同。使用時可能收費。"
- zh-Hant `settings:keychain_help`: "在 Mac 儲存時，可能需要輸入 Mac 登入密碼，讓 VStudy Pro 使用鑰匙圈。暫存金鑰只保留到關閉程式。"
- ja `settings:key_help`: "APIキーはAIサービスの開発者サイトで取得する秘密のコードです。チャットのログインとは別で、利用料金がかかる場合があります。"
- ja `settings:keychain_help`: "Macでは保存時にキーチェーンへのアクセスのためMacのログインパスワードを求められる場合があります。一時キーはアプリ終了まで有効です。"