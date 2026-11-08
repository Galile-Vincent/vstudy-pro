import type { Language } from './ui';

export const macInstall = "curl -fsSL https://raw.githubusercontent.com/ava-apple/vstudy-pro/main/scripts/install/install.sh | bash";
export const windowsInstall = "Invoke-WebRequest https://raw.githubusercontent.com/ava-apple/vstudy-pro/main/scripts/install/install.ps1 -OutFile install.ps1; Get-Content install.ps1; & .\\install.ps1";
interface InstallCopy {
  firstOpen: string; macHelpTitle: string; updateUninstallTitle: string; otherPlatformsTitle: string;
  macTitle: string;
  dmgTitle: string;
  downloadDmg: string;
  steps: string[];
  signingStatus: {
    title: string; text: string; steps: string[]; older: string;
    optional: string; verifyLink: string; source: string; apple: string;
  };
  terminalTitle: string; terminalOpen: string; terminalTools: string;
  bullets: string[]; read: string; aiTitle: string; aiText: string; prompt: string;
  windowsTitle: string; downloadExe: string; windowsSteps: string[]; windowsScript: string;
  planned: string; updateTitle: string; update: string; uninstallTitle: string; uninstall: string;
  verifyTitle: string; verify: string; copy: string; copied: string; failed: string;
}

export const installCopy = {
  "en": {
    "firstOpen": "First open on Mac? See the quick steps",
    "macHelpTitle": "Mac says it cannot be opened",
    "updateUninstallTitle": "Update and uninstall",
    "otherPlatformsTitle": "Other platforms (Intel Mac and Windows ARM64 planned)",
    "macTitle": "Mac (Apple silicon)",
    "dmgTitle": "Option 1 - Download the DMG (easiest, nothing else needed)",
    "downloadDmg": "Download the .dmg",
    "steps": [
      "Double-click the downloaded .dmg file.",
      "Drag VStudy Pro into Applications in the window that opens.",
      "Eject the VStudy Pro disk image in Finder.",
      "Open VStudy Pro from Applications or Launchpad."
    ],
    "signingStatus": {
      "title": "If macOS says it cannot open the app or verify the developer",
      "text": "The Mac app is not yet signed with an Apple Developer ID or notarized by Apple. Proceed only if you downloaded it from this project’s releases page and trust the project.",
      "steps": [
        "Try to open VStudy Pro once, then dismiss the warning.",
        "Open System Settings > Privacy & Security. Scroll down to Security.",
        "Click Open Anyway, authenticate if asked, then confirm with Open."
      ],
      "older": "On older macOS versions, right-click VStudy Pro in Applications, choose Open, then confirm with Open.",
      "optional": "Checking the checksum is optional.",
      "verifyLink": "Verify your download",
      "source": "Project releases",
      "apple": "Apple’s opening instructions"
    },
    "terminalTitle": "Install with one line in Terminal",
    "terminalOpen": "Press Command-Space, type Terminal, then press Return. Paste this line and press Return.",
    "terminalTools": "No Homebrew, npm, Xcode, or Python needed. The command uses only tools built into macOS.",
    "bullets": [
      "Downloads the latest DMG and checks its SHA-256 checksum.",
      "Closes VStudy Pro and installs it in Applications. Your library stays.",
      "Removes the quarantine flag only from this app so it can open. It never uses sudo."
    ],
    "read": "Read the script first",
    "aiTitle": "Let an AI agent install it",
    "aiText": "Copy this prompt into your AI agent.",
    "windowsTitle": "Windows x64",
    "downloadExe": "Download the EXE",
    "windowsSteps": [
      "Double-click the downloaded EXE and follow the installer. It installs for your user without administrator access.",
      "If SmartScreen warns, choose More info > Run anyway if offered. Continue only if the file came from this project’s releases page and you trust it. A school-managed computer may block this option."
    ],
    "windowsScript": "Or open PowerShell from the Start menu. Paste this command to download and display the script before it runs.",
    "planned": "Intel Mac and Windows ARM64 installers are planned. No Linux installer yet.",
    "updateTitle": "Update",
    "update": "Quit VStudy Pro. Download the new DMG and drag VStudy Pro into Applications, choosing Replace. Or re-run the Terminal one-liner. On Windows, run the new EXE or re-run the PowerShell command. Your library and plans stay. You can export a backup in Settings > Storage first.",
    "uninstallTitle": "Uninstall",
    "uninstall": "On Mac, quit VStudy Pro and drag it from Applications to Trash. On Windows, use Settings > Apps > Installed apps. Removing the app keeps your library. If you also want to delete your data, first open VStudy Pro and use Settings > Privacy > Delete all data.",
    "verifyTitle": "Verify your download (SHA-256)",
    "verify": "Download SHA256SUMS.txt from the same release. In Terminal or PowerShell, open your Downloads folder and run the command for your system. Compare the entire result with the entry for your file. A matching checksum detects changed bytes. It does not identify the publisher.",
    "copy": "Copy",
    "copied": "Copied",
    "failed": "Copy failed",
    "prompt": "Install VStudy Pro for me. First fetch and READ https://raw.githubusercontent.com/ava-apple/vstudy-pro/main/scripts/install/install.sh on Apple silicon macOS, or install.ps1 in the same directory on Windows x64. Explain the signing status described on the download page and that the Mac script removes quarantine only from this app. Run the reviewed script, confirm SHA-256 verification passed, open VStudy Pro, and report the installed path and result. Do not use sudo, disable system protections globally, or delete user data. Stop on any verification failure."
  },
  "zh-Hant": {
    "firstOpen": "第一次在 Mac 開啟？查看操作步驟",
    "macHelpTitle": "Mac 顯示無法開啟",
    "updateUninstallTitle": "更新與解除安裝",
    "otherPlatformsTitle": "其他平台（Intel Mac 與 Windows ARM64 規劃中）",
    "macTitle": "Mac（Apple 晶片）",
    "dmgTitle": "方法 1 - 下載 DMG（最簡單，不必先裝其他工具）",
    "downloadDmg": "下載 .dmg 檔案",
    "steps": [
      "按兩下下載好的 .dmg 檔案。",
      "在開啟的視窗中，將 VStudy Pro 拖入「應用程式」。",
      "在 Finder 退出 VStudy Pro 磁碟映像。",
      "從「應用程式」或 Launchpad 開啟 VStudy Pro。"
    ],
    "signingStatus": {
      "title": "如果 macOS 顯示無法開啟或無法驗證開發者",
      "text": "Mac 版尚未使用 Apple 開發者 ID 簽署，也尚未經 Apple 公證。只有從本專案的版本發布頁下載，且你信任本專案時，才繼續操作。",
      "steps": [
        "先嘗試開啟 VStudy Pro 一次，再關閉警告。",
        "開啟「系統設定 > 隱私權與安全性」，向下捲動至「安全性」。",
        "按「強制打開」，依提示驗證身分，再按「打開」確認。"
      ],
      "older": "較舊的 macOS 可在「應用程式」中對 VStudy Pro 按右鍵，選「打開」，再按「打開」確認。",
      "optional": "校驗碼驗證是選用步驟。",
      "verifyLink": "驗證下載檔案",
      "source": "專案版本發布頁",
      "apple": "Apple 的開啟說明"
    },
    "terminalTitle": "在終端機貼上一行指令安裝",
    "terminalOpen": "按 Command-Space，輸入 Terminal，再按 Return。貼上以下指令並按 Return。",
    "terminalTools": "不需要 Homebrew、npm、Xcode 或 Python。指令只使用 macOS 內建工具。",
    "bullets": [
      "下載最新的 DMG，並驗證 SHA-256 校驗碼。",
      "關閉 VStudy Pro，安裝到「應用程式」。你的文件庫會保留。",
      "只移除此 app 的隔離標記，讓它能開啟。不會使用 sudo。"
    ],
    "read": "先閱讀安裝腳本",
    "aiTitle": "請 AI 智能體幫你安裝",
    "aiText": "將這段提示詞複製給你的 AI 智能體。",
    "windowsTitle": "Windows x64",
    "downloadExe": "下載 EXE 安裝檔",
    "windowsSteps": [
      "按兩下下載好的 EXE，依照畫面完成安裝。只安裝到你的使用者帳號，不需要管理員權限。",
      "如果 SmartScreen 顯示警告，在有提供選項時按「其他資訊 > 仍要執行」。只有從本專案的版本發布頁下載，且你信任本專案時，才繼續。學校管理的電腦可能無法使用這個選項。"
    ],
    "windowsScript": "也可以從「開始」選單開啟 PowerShell，貼上以下指令。指令會先下載並顯示腳本內容，再執行安裝。",
    "planned": "Intel Mac 與 Windows ARM64 安裝檔仍在規劃中。目前沒有 Linux 安裝檔。",
    "updateTitle": "更新",
    "update": "先關閉 VStudy Pro。下載新版 DMG，將 VStudy Pro 拖入「應用程式」並選「取代」，或重跑終端機的一行指令。Windows 可執行新版 EXE 或重跑 PowerShell 指令。你的文件庫與讀書計畫會保留。更新前也可以先到「設定 > 儲存空間」匯出備份。",
    "uninstallTitle": "解除安裝",
    "uninstall": "Mac 請先關閉 VStudy Pro，再從「應用程式」拖到「垃圾桶」。Windows 請到「設定 > 應用程式 > 已安裝的應用程式」解除安裝。只移除 app 會保留文件庫。若也想刪除資料，請先開啟 VStudy Pro，到「設定 > 隱私權 > 刪除所有資料」操作。",
    "verifyTitle": "驗證下載檔案（SHA-256）",
    "verify": "從同一個版本下載 SHA256SUMS.txt。在終端機或 PowerShell 切換到「下載項目」資料夾，執行對應系統的指令，再與檔案中的完整校驗碼比對。校驗碼相符代表檔案內容一致，不能證明發布者身分。",
    "copy": "複製",
    "copied": "已複製",
    "failed": "複製失敗",
    "prompt": "請幫我安裝 VStudy Pro。Apple 晶片 macOS 請先取得並完整閱讀 https://raw.githubusercontent.com/ava-apple/vstudy-pro/main/scripts/install/install.sh；Windows x64 請閱讀同目錄的 install.ps1。說明下載頁列出的簽署狀態，以及 Mac 腳本只會移除此 app 的隔離標記。執行已閱讀的腳本，確認 SHA-256 驗證通過，開啟 VStudy Pro，回報安裝路徑與結果。不要使用 sudo、全面停用系統防護或刪除使用者資料。驗證失敗時立即停止。"
  },
  "ja": {
    "firstOpen": "Mac で初めて開く場合は、起動手順を確認",
    "macHelpTitle": "Mac で開けないと表示されたら",
    "updateUninstallTitle": "更新とアンインストール",
    "otherPlatformsTitle": "その他の環境（Intel Mac と Windows ARM64 は予定）",
    "macTitle": "Mac（Apple シリコン）",
    "dmgTitle": "方法 1 - DMG をダウンロード（いちばん簡単。事前の準備は不要）",
    "downloadDmg": ".dmg をダウンロード",
    "steps": [
      "ダウンロードした .dmg ファイルをダブルクリックします。",
      "開いたウインドウで VStudy Pro を「アプリケーション」にドラッグします。",
      "Finder で VStudy Pro のディスクイメージを取り出します。",
      "「アプリケーション」または Launchpad から VStudy Pro を開きます。"
    ],
    "signingStatus": {
      "title": "macOS で「開けない」「開発元を確認できない」と表示されたら",
      "text": "Mac 版は Apple の Developer ID による署名と公証がまだ済んでいません。このプロジェクトのリリースページから入手し、プロジェクトを信頼できる場合のみ続けてください。",
      "steps": [
        "VStudy Pro を一度開こうとしてから、警告を閉じます。",
        "「システム設定 > プライバシーとセキュリティ」を開き、「セキュリティ」まで下にスクロールします。",
        "「このまま開く」をクリックし、必要に応じて認証してから「開く」で確定します。"
      ],
      "older": "古い macOS では、「アプリケーション」で VStudy Pro を右クリックし、「開く」を選んで、もう一度「開く」で確定できます。",
      "optional": "チェックサムの確認は任意です。",
      "verifyLink": "ダウンロードを検証",
      "source": "プロジェクトのリリース",
      "apple": "Apple の起動手順"
    },
    "terminalTitle": "ターミナルの 1 行コマンドでインストール",
    "terminalOpen": "Command-Space を押し、Terminal と入力して Return を押します。次のコマンドを貼り付け、Return を押してください。",
    "terminalTools": "Homebrew、npm、Xcode、Python は不要です。macOS に標準搭載されたツールだけで実行できます。",
    "bullets": [
      "最新の DMG をダウンロードし、SHA-256 チェックサムを確認します。",
      "VStudy Pro を終了し、「アプリケーション」にインストールします。ライブラリは残ります。",
      "このアプリの隔離属性だけを削除して、起動できるようにします。sudo は使いません。"
    ],
    "read": "先にスクリプトを読む",
    "aiTitle": "AI エージェントにインストールを任せる",
    "aiText": "このプロンプトを AI エージェントにコピーしてください。",
    "windowsTitle": "Windows x64",
    "downloadExe": "EXE をダウンロード",
    "windowsSteps": [
      "ダウンロードした EXE をダブルクリックし、画面の案内に従います。自分のユーザー用にインストールされ、管理者権限は不要です。",
      "SmartScreen の警告が出た場合は、表示されていれば「詳細情報 > 実行」を選びます。このプロジェクトのリリースページから入手し、信頼できる場合のみ続けてください。学校が管理するパソコンでは許可されない場合があります。"
    ],
    "windowsScript": "または、スタートメニューから PowerShell を開いて次のコマンドを貼り付けます。スクリプトをダウンロードして内容を表示してから実行します。",
    "planned": "Intel Mac 版と Windows ARM64 版は予定しています。Linux 用のインストーラーはまだありません。",
    "updateTitle": "更新",
    "update": "VStudy Pro を終了します。新しい DMG をダウンロードし、VStudy Pro を「アプリケーション」にドラッグして「置き換える」を選びます。ターミナルの 1 行コマンドを再実行しても更新できます。Windows では新しい EXE か PowerShell コマンドを実行します。ライブラリと学習計画は残ります。必要なら先に「設定 > ストレージ」でバックアップを書き出してください。",
    "uninstallTitle": "アンインストール",
    "uninstall": "Mac では VStudy Pro を終了し、「アプリケーション」からゴミ箱にドラッグします。Windows では「設定 > アプリ > インストールされているアプリ」から削除します。アプリを削除してもライブラリは残ります。データも削除したい場合は、先に VStudy Pro を開き、「設定 > プライバシー > すべてのデータを削除」を実行してください。",
    "verifyTitle": "ダウンロードを検証（SHA-256）",
    "verify": "同じリリースから SHA256SUMS.txt をダウンロードします。ターミナルまたは PowerShell で「ダウンロード」フォルダーに移動し、お使いの OS のコマンドを実行してください。結果全体をファイル内の該当する値と照合します。一致すればファイルの内容を確認できますが、発行元の身元は証明できません。",
    "copy": "コピー",
    "copied": "コピーしました",
    "failed": "コピー失敗",
    "prompt": "VStudy Pro をインストールしてください。Apple シリコン macOS では https://raw.githubusercontent.com/ava-apple/vstudy-pro/main/scripts/install/install.sh を取得して全文を読んでください。Windows x64 では同じディレクトリの install.ps1 を読んでください。ダウンロードページに記載された署名状況を説明し、Mac スクリプトがこのアプリの隔離属性だけを削除することも伝えてください。読んだスクリプトを実行し、SHA-256 検証の成功を確認して VStudy Pro を開き、インストール先と結果を報告してください。sudo、システム保護の一括無効化、ユーザーデータの削除は禁止です。検証に失敗したら停止してください。"
  }
} satisfies Record<Language, InstallCopy>;
