export const macInstall = "curl -fsSL https://raw.githubusercontent.com/ava-apple/vstudy-pro/main/scripts/install/install.sh | bash";
export const windowsInstall = "Invoke-WebRequest https://raw.githubusercontent.com/ava-apple/vstudy-pro/main/scripts/install/install.ps1 -OutFile install.ps1; Get-Content install.ps1; & .\\install.ps1";
export const reviewedInstall = "curl -fsSL https://raw.githubusercontent.com/ava-apple/vstudy-pro/main/scripts/install/install.sh -o install.sh\nless install.sh\nbash install.sh --open";
export const installCopy = {
  "en": {
    "title": "Install with a command or an AI agent",
    "text": "The app is unsigned and not notarized. This command trusts this repository. [Read the script first](https://raw.githubusercontent.com/ava-apple/vstudy-pro/main/scripts/install/install.sh). It resolves the release, downloads the DMG and checksums, verifies SHA-256, mounts read-only, quits VStudy Pro, copies it to /Applications, and removes that app’s quarantine flag to allow it to open. It never uses sudo or deletes user data. A checksum detects changed bytes, not publisher identity.",
    "read": "To download, read, then run instead",
    "prompt": "Install VStudy Pro for me. First fetch and READ https://raw.githubusercontent.com/ava-apple/vstudy-pro/main/scripts/install/install.sh on Apple silicon macOS, or install.ps1 in the same directory on Windows x64. Explain that this is unsigned, and that the Mac script removes quarantine only from this app. Run the reviewed script, confirm SHA-256 verification passed, open VStudy Pro, and report the installed path and result. Do not use sudo, disable system protections globally, or delete user data. Stop on any verification failure.",
    "windows": "Windows x64 (PowerShell). Download and read before running. The per-user unsigned installer may trigger SmartScreen. It does not require admin.",
    "options": "Use `bash install.sh --open` to open after install, `--version 0.3.0` to pin, `--dest ~/Applications` if /Applications is not writable, or `--dry-run` to preview. Intel Mac is not released yet. The manual DMG steps below remain available.",
    "update": "For script installs, export a backup and re-run the same one-liner to update. To uninstall only the Mac app, download the script as above and run `bash install.sh --uninstall` (include your original `--dest` if used). To delete data, use **Settings > Privacy > Delete all data** before uninstalling. On Windows, re-run the PowerShell script to update and use **Settings > Apps > Installed apps** to uninstall.",
    "copy": "Copy",
    "copied": "Copied",
    "failed": "Copy failed"
  },
  "zh-Hant": {
    "title": "用指令或 AI 智能體安裝",
    "text": "此應用程式未簽署，也未經 Apple 公證。這個指令代表你信任此儲存庫。[請先閱讀腳本](https://raw.githubusercontent.com/ava-apple/vstudy-pro/main/scripts/install/install.sh)。腳本會解析版本、下載 DMG 與校驗碼、驗證 SHA-256、唯讀掛載、結束 VStudy Pro、複製到 /Applications，並移除此 app 的隔離標記以允許開啟。不會使用 sudo 或刪除使用者資料。校驗碼可偵測檔案變動，不能證明發布者身分。",
    "read": "也可以先下載、閱讀，再執行",
    "prompt": "請幫我安裝 VStudy Pro。Apple 晶片 macOS 請先取得並完整閱讀 https://raw.githubusercontent.com/ava-apple/vstudy-pro/main/scripts/install/install.sh；Windows x64 請閱讀同目錄的 install.ps1。說明 app 未簽署，Mac 腳本只會移除此 app 的隔離標記。執行已閱讀的腳本，確認 SHA-256 驗證通過，開啟 VStudy Pro，回報安裝路徑與結果。不要使用 sudo、全面停用系統防護或刪除使用者資料。驗證失敗時立即停止。",
    "windows": "Windows x64（PowerShell）。先下載並閱讀再執行。未簽署的安裝程式僅安裝於目前使用者，可能觸發 SmartScreen，不需要管理員權限。",
    "options": "安裝後開啟可用 `bash install.sh --open`，固定版本用 `--version 0.3.0`，/Applications 無法寫入時用 `--dest ~/Applications`，預覽用 `--dry-run`。Intel Mac 尚未發布。也可使用下方手動 DMG 步驟。",
    "update": "腳本安裝後，請先匯出備份，再重跑同一行指令更新。僅移除 Mac app 時，依上方方式下載腳本後執行 `bash install.sh --uninstall`，若曾使用 `--dest` 請加上原路徑。要刪除資料，請先在 **設定 > 隱私權 > 刪除所有資料** 操作。Windows 重跑 PowerShell 腳本可更新，解除安裝請用 **設定 > 應用程式 > 已安裝的應用程式**。",
    "copy": "複製",
    "copied": "已複製",
    "failed": "複製失敗"
  },
  "ja": {
    "title": "コマンドまたは AI エージェントでインストール",
    "text": "このアプリは未署名で、Apple の公証もありません。このコマンドはリポジトリを信頼して実行するものです。[先にスクリプトを読んでください](https://raw.githubusercontent.com/ava-apple/vstudy-pro/main/scripts/install/install.sh)。リリースの解決、DMG とチェックサムの取得、SHA-256 検証、読み取り専用マウント、VStudy Pro の終了、/Applications へのコピーを行い、このアプリの隔離属性を削除して起動できるようにします。sudo の使用やユーザーデータの削除は行いません。チェックサムは変更を検出しますが、発行元の身元を証明しません。",
    "read": "先にダウンロードして読み、その後に実行する方法",
    "prompt": "VStudy Pro をインストールしてください。Apple シリコン macOS では https://raw.githubusercontent.com/ava-apple/vstudy-pro/main/scripts/install/install.sh を取得して全文を読んでください。Windows x64 では同じディレクトリの install.ps1 を読んでください。アプリが未署名で、Mac スクリプトはこのアプリの隔離属性だけを削除すると説明してください。読んだスクリプトを実行し、SHA-256 検証の成功を確認して VStudy Pro を開き、インストール先と結果を報告してください。sudo、システム保護の一括無効化、ユーザーデータの削除は禁止です。検証に失敗したら停止してください。",
    "windows": "Windows x64（PowerShell）。ダウンロードして読んでから実行します。未署名のユーザー単位インストーラーは SmartScreen の警告が出る場合があります。管理者権限は不要です。",
    "options": "インストール後に開くには `bash install.sh --open`、バージョン固定には `--version 0.3.0`、/Applications に書き込めない場合は `--dest ~/Applications`、確認のみには `--dry-run` を使います。Intel Mac 版は未公開です。下記の手動 DMG 手順も使えます。",
    "update": "スクリプトでインストールした場合は、バックアップを書き出して同じコマンドを再実行すると更新できます。Mac アプリだけを削除するには、上記の方法でスクリプトを取得して `bash install.sh --uninstall` を実行します。`--dest` を使った場合は同じ保存先を指定します。データを削除する場合は、先に **設定 > プライバシー > すべてのデータを削除** を使います。Windows は PowerShell スクリプトを再実行して更新し、**設定 > アプリ > インストールされているアプリ** からアンインストールします。",
    "copy": "コピー",
    "copied": "コピーしました",
    "failed": "コピー失敗"
  }
} as const;
