[English](README.md) · 繁體中文 · [日本語](README.ja.md)

# VStudy Pro

在 macOS 與 Windows 上閱讀課程教材、整合 Moodle 作業期限，並把待辦事項排成讀書計畫。

![版本 0.2.2](https://img.shields.io/badge/version-0.2.2-blue) ![macOS and Windows](https://img.shields.io/badge/platform-macOS_%7C_Windows-black)

![圖論筆記、已選段落、示範回答與來源引用](docs/assets/readme/reader.webp)

## 下載與安裝

### 取得軟體

| 平台 | 直接下載安裝檔 |
| --- | --- |
| Apple 晶片 Mac | [下載 DMG](https://github.com/ava-apple/vstudy-pro/releases/latest/download/VStudy-Pro-mac-arm64.dmg) |
| Intel Mac | [下載 DMG](https://github.com/ava-apple/vstudy-pro/releases/latest/download/VStudy-Pro-mac-x64.dmg) |
| Windows x64 | [下載 EXE](https://github.com/ava-apple/vstudy-pro/releases/latest/download/VStudy-Pro-win-x64.exe) |
| Windows ARM64 | [下載 EXE](https://github.com/ava-apple/vstudy-pro/releases/latest/download/VStudy-Pro-win-arm64.exe) |

請下載同一版本的 [SHA256SUMS.txt](https://github.com/ava-apple/vstudy-pro/releases/latest/download/SHA256SUMS.txt)。固定連結指向最新已發布的檔案，儲存庫已公開。若出現 404，請查看[版本說明](https://github.com/ava-apple/vstudy-pro/releases/latest)中的發布平台與驗證結果。CI 成果物與試跑不等於公開版本；連結本身不代表版本、大小或該平台已通過測試。

需要 macOS 12 以上，或 64 位元 Windows 10 以上。Mac 預設選 Apple 晶片，除非「關於這台 Mac」顯示 Intel 處理器。Windows 請在「設定 > 系統 > 關於 > 系統類型」確認；ARM 處理器選 ARM64，其他選 x64。未提供 Linux 安裝檔。AI 與學校同步需要網路；閱讀本機 Markdown 與文字檔不需要 AI 帳號。

### 驗證並開啟

1. 比對安裝檔與 `SHA256SUMS.txt` 中對應檔名的完整雜湊。Mac 可在下載資料夾執行 `shasum -a 256 VStudy-Pro-mac-arm64.dmg`，並替換成實際檔名。Windows 可在 PowerShell 執行 `Get-FileHash -Algorithm SHA256 .\VStudy-Pro-win-x64.exe`。清單包含其他平台，請比對自己下載的那一項。校驗碼可偵測檔案變動，無法證明發布者身分。
2. Mac：開啟 DMG，將 **VStudy Pro.app** 拖入「**應用程式**」，退出映像檔後開啟安裝的 app。若未簽署或臨時簽署版本遭阻擋，先嘗試開啟一次。確認來源可信任後，在「**系統設定 > 隱私權與安全性**」於提供選項時選擇「**強制打開**」。請勿全面停用 Gatekeeper。詳見 [Apple 首次開啟說明](https://support.apple.com/en-us/102445)。
3. Windows：執行 EXE，安裝到目前使用者帳號。若 SmartScreen 警告未簽署安裝檔，僅在驗證後且有此選項時，選擇「**其他資訊 > 仍要執行**」。組織政策可能禁止此操作。請勿停用 SmartScreen。若此個人安裝程式意外要求管理員權限，請停止操作。
4. 已簽署且公證的 Mac 版本使用一般首次開啟確認。已簽署 Windows 版本可在檔案數位簽章詳細資料確認發布者，但簽署不保證已有 SmartScreen 信譽。實際簽署狀態以版本說明為準，詳見[簽章驗證](docs/SIGNING.md#verify-the-delivered-artifacts)。
5. 依首次使用導覽操作，或先開啟範例文件。需要時再到「**課程**」連接學校，到「**設定 > AI 服務供應商**」設定 AI。

VStudy 以 Electron `safeStorage` 加密已儲存憑證。macOS 使用登入鑰匙圈中的金鑰，臨時簽署重新建置後可能再次詢問存取權限。Windows 使用綁定目前 Windows 使用者的 DPAPI，不會顯示 Mac 式鑰匙圈提示。兩個系統都在重新啟動後，等待你明確解鎖才解密已儲存金鑰；開啟主視窗不會自動解鎖。你可重試，或只在本次執行使用金鑰而不儲存。

### 更新或解除安裝

目前採手動更新。先到「**設定 > 儲存空間**」匯出備份，結束 VStudy Pro，並驗證新版安裝檔。Mac 取代「應用程式」中的 app；Windows 使用相同帳號執行新版安裝程式。保留資料目錄即可保留文件庫與計畫。資料庫升級會先建立遷移備份，不支援降版。自動更新需等簽署與公證驗證完成後另行實作。

若要刪除資料，在 app 內開啟「**設定 > 隱私權 > 刪除所有資料**」，輸入 `DELETE` 並確認系統對話框。App 刪除專用資料目錄後結束，再將 Mac app 移到垃圾桶，或到 Windows「**設定 > 應用程式 > 已安裝的應用程式**」解除安裝。只刪除 app 會保留本機資料。

Main 使用 Electron `app.getPath('userData')`。目前套件命名空間是 `@vstudy/desktop`，Mac 預設為 `~/Library/Application Support/@vstudy/desktop`，Windows 為 `%APPDATA%\@vstudy\desktop`，包含 `vstudy.sqlite`、`library/`、`secrets.json` 與轉換器檔案。測試可另設路徑，詳見[儲存空間說明](docs/STORAGE.md)。

刪除所有資料不會移除文件庫外的原始檔、匯出備份、CLI 登入資料、共用 Python 下載快取，或獨立的系統憑證儲存項目，也不代表安全抹除備份或 SSD 區塊。

### 從原始碼建置

使用 macOS 或 Windows、`.node-version` 指定的 **Node 24.19.0**，以及 `package.json` 指定的 **pnpm 10.28.2**。套件引擎允許 Node >=24.11.1。以下指令從公開儲存庫的根目錄執行。

```sh
git clone https://github.com/ava-apple/vstudy-pro.git
cd vstudy-pro
pnpm install --frozen-lockfile
pnpm build
```

`pnpm build` 編譯 app。各架構安裝檔請依[不發布的試跑流程](docs/ENGINEERING.md#prepare-a-release)產生並驗證，憑證設定見[簽署指南](docs/SIGNING.md)。Mac 本機建置不能證明 Windows 可用。

文件轉換需要時，請另行安裝 **uv** 或 **Python 3.10+**。首次轉換會先徵求同意，才從 PyPI 下載以雜湊鎖定的套件；uv 也可能從 GitHub 下載 Python。「**設定 > 隱私權**」提供重試與持續生效的離線模式。Markdown 與文字檔不需要 Python。macOS 額外以系統沙箱禁止轉換器連網；Windows 目前沒有對等的核心層網路封鎖，離線模式與 Python socket 攔截不構成作業系統安全邊界。

## 功能介紹

- **課程與期限。** 整合教材、公告、成績、檔案、通知、即將到期的作業與提醒。可取得的資料依學校設定而定。
- **多校 Moodle。** 搜尋內建學校目錄，或輸入公開的 HTTPS Moodle 網址。多所學校與不同身分的帳號各自獨立，透過官方 Moodle 行動服務進行密碼登入或支援的 SSO 登入。
- **讀書計畫與課程助理。** 新增任務、目標、考試與讀書時段，依可用時間草擬每日或每週計畫，並匯出行事曆。課程助理以核准卡片提出修改，確認後才寫入。移除課程關聯不會刪除學生自己建立的計畫。
- **閱讀與 AI 問答。** 匯入每份最大 50 MiB 的 PDF、DOCX、XLSX、PPTX、HTML、CSV、Markdown 或文字檔。用資料夾、標籤、釘選與已儲存篩選整理文件；選取段落提問、回查引用來源，並查看回報或估算的用量與費用。
- **佈景主題。** 支援淺色、深色及跟隨系統，內建九組主題，可調整對比與玻璃透明度，也能匯入及匯出經驗證的自訂主題。
- **聊天記錄搜尋。** 搜尋文件、課程與一般對話，依課程、文件、範圍、角色與日期篩選，並重新命名、釘選、封存或刪除對話。
- **App 內 Moodle 頁面。** 使用學校登入狀態，在各帳號隔離的檢視中開啟支援的教師頁面與公告，提供導覽、縮放與重新載入。
- **儲存與備份。** 查看空間用量、清除快取或轉換檔、檢查資料庫完整性，以及匯出或還原可攜式備份。備份不含憑證；還原後須重新登入學校。
- **隱私。** 文件庫與 SQLite 儲存在本機，AI 服務可自由選用，已儲存的憑證會加密，並提供本次執行的網路活動清單。App 不傳送分析資料，也沒有跨裝置同步。
- **首次使用與語言。** 提供範例文件、可重播的設定導覽、操作示範與情境提示。介面支援 English（`en`）、繁體中文（`zh-Hant`）與日本語（`ja`）。

## 頁面導覽

截圖來自目前建置的 app，使用精心編排的示範課程、本機文件與模擬 AI 對話，不代表真實學校或 AI 服務已通過驗證。[截圖流程與圖片來源](docs/assets/readme/README.md)。

### 首頁

從設定清單開始，匯入文件或試用範例，也能返回最近閱讀的內容並查看學習活動。

![最近閱讀與已完成設定清單的首頁](docs/assets/readme/home.webp)

### 文件庫

瀏覽與搜尋文件，透過資料夾、標籤、釘選、最近開啟、已儲存篩選與轉換狀態找到教材。

![以兩個資料夾整理的英文與繁體中文學習筆記](docs/assets/readme/library.webp)

### 閱讀器與聊天

在轉換後的 Markdown 旁開啟文件對話，選取段落提問、回查引用，並重新開啟同一文件的舊對話。不連接 AI 也能閱讀。

![圖論筆記、已選段落、示範回答與來源引用](docs/assets/readme/reader.webp)

### 課程首頁

連接或重新登入學校、同步帳號、查看未來七天尚未繳交的作業，並切換目前、未來、過去或全部課程。

![以課程藝術封面呈現教師、截止日期與進度](docs/assets/readme/courses.webp)

### 課程頁面

分頁包含**內容、期限、公告、成績、檔案與通知**。可開啟教材、設定期限提醒，或詢問課程助理。學校未開放的功能無法使用。

![演算法與資料結構的本週教材與截止日期](docs/assets/readme/course.webp)

![在獨立 app 面板中開啟的 Moodle 示範教師頁面](docs/assets/readme/webview.webp)

### 今日與讀書計畫

從課程進入讀書計畫，切換今日與本週、新增任務與考試、設定可用時間，確認排程提案後再儲存，也能匯出行事曆檔案。

![今日學習待辦事項與統計期中考](docs/assets/readme/planner.webp)

### 聊天記錄

跨對話搜尋並重新開啟符合的訊息，以篩選條件區分課程、文件與一般聊天，也可保留常用的釘選對話。

![以 Command-K 搜尋已儲存的學習對話](docs/assets/readme/history.webp)

### 設定

「**一般**」切換語言並重開導覽或歡迎頁；「**外觀**」調整主題與對比；「**AI 服務供應商**」連接 AI；「**用量**」查看 token 與費用；「**儲存空間**」管理備份與清理；「**隱私權**」管理轉換器安裝、離線模式、網路活動與資料刪除。

![全介面淺色與深色主題設定](docs/assets/readme/themes.webp)

![儲存空間使用量與分類](docs/assets/readme/storage.webp)

### 說明與歡迎頁

「說明」可重開首次設定、圖解或錄製的操作示範，以及鍵盤快捷鍵。歡迎頁介紹 app 並提供範例，不必先準備學校或 AI 帳號。

![閱讀工作區預覽與歡迎導覽](docs/assets/readme/onboarding.webp)

### 鍵盤快捷鍵

Mac 使用 Cmd，Windows 使用 Ctrl。

| 快捷鍵 | 操作 |
| --- | --- |
| `Cmd/Ctrl+K` | 開啟全域對話搜尋。 |
| `Cmd/Ctrl+B` | 展開或收合側邊欄。 |
| `Cmd/Ctrl+Shift+K` | 針對目前選取的段落提問。 |
| 方向鍵 / `Shift+方向鍵` | 閱讀器本身取得焦點時，移動或延伸文字選取範圍。 |
| `Enter` / `Shift+Enter` | 傳送聊天 / 換行，輸入法組字期間除外。 |
| `Esc` | 關閉對話框或 Moodle 頁面面板。 |
| `Cmd/Ctrl+R` | 重新載入目前聚焦的 Moodle 頁面面板。 |
| `Tab` / `Shift+Tab` | 在控制項之間移動焦點。 |

## 運作方式

選擇學校並確認 Moodle 網站後，Main 探索官方行動服務，以學校支援的密碼或 SSO 流程登入，再將各帳號的課程快照存入本機 SQLite。App 會檢查伺服器能力，不假設每所學校都開放相同功能。

匯入時會複製原始檔到以內容雜湊管理的文件庫。Markdown 與文字檔可直接開啟，其他格式交由按需啟動的 Python 轉換器產生 Markdown。轉換器在 macOS 上禁止網路存取，閒置後停止。轉換可能遺失排版，不是精確還原 PDF 的檢視器。

AI 為選用功能。「**設定 > AI 服務供應商**」可個別啟用 Claude Code（`claude`）、Codex（`codex`）與 Antigravity（`agy`）既有的 CLI 登入。請先在 VStudy 外登入這些工具。也可使用 Anthropic、OpenAI 或 OpenAI-compatible API 金鑰，並選擇儲存或僅於本次執行保留。CLI 訂閱與 API 費用依供應商規則計算。目前 Codex 需要已登入的 CLI **0.166.0**、macOS 與 `/usr/bin/sandbox-exec`；傳輸驗證不支援或失敗時會拒絕執行。Windows 未實作對等且已驗證的核心沙箱，因此停用 Codex；可改用 API 供應商。詳見 [Codex 傳輸限制](docs/codex-tool-free.md)。

提問時會將你的訊息與有大小限制的背景資料組成提示。文件聊天包含中繼資料、對話記錄與選取文字；未選取時會加入大綱與開頭節錄。課程聊天會加入可取得的課程資料、讀書計畫狀態與選定且已轉換完成的文件。回答以串流顯示並存入本機。助理提出的計畫修改須經明確核准，Main 才會套用。請回到原始來源確認日期與答案。

已快取的課程快照與轉換文件可離線閱讀，但期限可能過期。重新同步、開啟學校頁面及遠端 AI 都需要網路。轉換器的離線模式不會讓外部 AI 服務改在本機執行。

### 隱私與網路

VStudy 不傳送 app 分析資料。學校登入、同步與內容檢視會連線至你選擇的學校。啟用的 API 服務會收到上述問題與背景資料；先前選取的內容可能仍在對話記錄中。CLI 工具可能連線至自己的聊天、模型探索、驗證、額度或遙測服務。App 會為 Claude 設定停用非必要流量與遙測。Python 安裝經同意後可能連線至 PyPI 與 GitHub。

App **不會加密磁碟上的文件、Markdown 與聊天記錄**。儲存的機密資料透過 Mac 鑰匙圈或 Windows DPAPI 加密，本次執行的資料保留在 Main 記憶體。請用系統帳號權限與 FileVault 或 BitLocker 等磁碟加密保護檔案。可攜式備份不含憑證，但仍包含私人學習資料。

「**設定 > 隱私權**」列出本次執行中有數量上限的 app 主動請求與 CLI 啟動記錄。這不是封包擷取，無法列出 CLI 或 Chromium 內部的每一個請求，目前也無法得知傳輸位元組數。開啟外部瀏覽器或郵件連結前會要求確認。處理敏感資料前請閱讀[安全模型](docs/SECURITY.md)。

## 專案結構

```text
apps/desktop/
  src/
    main/       Electron 生命週期、IPC、SQLite、Moodle、計畫、AI 與儲存
    preload/    隔離的 Renderer 與 Main 之間的型別橋接
    renderer/   React 頁面、閱讀器、聊天、設定與主題
    shared/     Zod 契約、領域型別、語言檔與主題結構
  resources/    Python 轉換器與內建範例文件
  e2e/          真實 Electron 整合測試與測試資料
  scripts/      建置、封裝、安全與測試工具
docs/           架構、資料、安全、設計與驗證記錄
scripts/        儲存庫工具、Git hooks 與 README 連結驗證
.github/        CI 與未經 Developer ID 簽署的標籤發布流程
```

### 程序模型

```mermaid
flowchart LR
  R[React renderer] <--> P[Isolated preload]
  P <-->|Validated IPC| M[Electron main]
  M <--> DB[(SQLite)]
  M <--> L[Library files]
  M <--> C[Python converter]
  M <--> K[Account cache]
  M --> W[Isolated Moodle webview]
  W <--> S[School Moodle]
  M <--> A[API or opted-in CLI]
```

### Moodle 同步

```mermaid
sequenceDiagram
  actor Student
  Student->>Renderer: Choose school and sign in
  Renderer->>Main: Validated IPC
  Main->>Moodle: Discover mobile service and authenticate
  Moodle-->>Main: Token and supported functions
  Main->>Moodle: Fetch courses and deadlines
  Moodle-->>Main: Validated responses
  Main->>SQLite: Save account-scoped snapshot and cache
  Main-->>Renderer: Courses, deadlines, and sync status
```

### AI 提問

```mermaid
sequenceDiagram
  actor Student
  Student->>Renderer: Ask with optional selection
  Renderer->>Main: Validated chat request
  Main->>SQLite: Read history and course or planner context
  Main->>Library: Read bounded document context
  Main->>Provider: Send prompt to enabled API or CLI
  Provider-->>Main: Stream answer and proposals
  Main-->>Renderer: Answer, citations, and approval cards
  Main->>SQLite: Save messages and usage
  Student->>Main: Explicitly approve a planner proposal
  Main->>SQLite: Validate and apply approved action
```

詳見[架構](docs/ARCHITECTURE.md)、[資料模型](docs/DATA_MODEL.md)、[儲存](docs/STORAGE.md)、[安全](docs/SECURITY.md)與[工程指南](docs/ENGINEERING.md)。[文件索引](docs/README.md)區分目前參考資料與歷史稽核記錄。

## 開發

安裝相依套件後，從儲存庫根目錄執行。記憶體有限時，請依序執行各項檢查。

| 指令 | 用途 |
| --- | --- |
| `pnpm dev` | 啟動 Electron 與 Vite，以 Ctrl+C 停止。 |
| `pnpm typecheck` | 檢查 TypeScript 並產生語言型別。 |
| `pnpm lint` | 執行桌面版 ESLint。 |
| `pnpm test --pool=forks --maxWorkers=2` | 以兩個 worker 執行對比檢查與單元測試。 |
| `pnpm build` | 建置 Main、Preload 與 Renderer。 |
| `pnpm security:static` | 檢查相依套件政策與安全規則。 |
| `pnpm security:check` | 執行靜態檢查、lint 與單元測試。 |
| `pnpm e2e` | 建置並依序執行真實 Electron E2E 測試。 |
| `pnpm smoke` | 建置並啟動真實 Electron 冒煙測試。 |
| `pnpm package` | 依預設簽署設定建置與封裝。 |
| `node apps/desktop/scripts/marketing-shots.mjs` | 先執行 `pnpm build`，再產生行銷截圖組合。 |
| `node scripts/check-readme-links.mjs` | 檢查三份 README 與文件索引的本機連結。 |

E2E 需要 **uv**，或透過 `VSTUDY_CONVERTER_VENV` 指定既有、以雜湊鎖定的轉換器環境。它會準備未簽署的封裝，也可能下載 Python 相依套件。驗證資料預設存於 `/tmp/vstudy-final/e2e`，可用 `VSTUDY_E2E_EVIDENCE` 更改。真實 AI 測試需要明確啟用並登入，略過不代表通過驗證。

提交變更、同步翻譯、建立版本標籤與發布檢查請依 [CONTRIBUTING](CONTRIBUTING.md)。簽署機密資料不可放入 Git。目前儲存庫沒有專案授權檔，相依套件的授權清單不等於本專案授權。

### 已知限制

- macOS 與 Windows 各架構需要分別驗證封裝版。測試結果與簽署狀態以版本說明為準；未簽署版本可能觸發 Gatekeeper 或 SmartScreen。
- 沒有 OCR，不支援掃描或純影像 PDF。複雜表格、分欄、公式與圖片可能失真。單檔 HTML 與 Markdown 匯入不會複製旁邊的圖片檔。
- 真實學校功能取決於該校 Moodle 行動服務與權限。需使用公開 HTTPS；不支援僅限區網、自簽 TLS 憑證與 QR 憑證交換。
- 本機資料沒有跨裝置同步。API 與 CLI 模型需要各自的存取權限，也可能產生費用。
- AI 文件改善後端與面板已存在，但目前閱讀器尚未掛載面板，請勿依賴這項操作。詳見 [AI 解析狀態](docs/AI_PARSE.md)。
