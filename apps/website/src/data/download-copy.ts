/** Download and first-open copy, isolated from the site's visual redesign. */
import type { Language } from './ui';

export const downloadCopy = {
  en: {
    download: 'Download for', other: 'Other platforms', intel: 'Intel Mac download',
    checksums: 'SHA-256 checksums', releases: 'Release notes and availability',
    requirements: 'macOS 12+ · Windows 10+ (64-bit). Choose the installer for your processor. No Linux installer.',
    status: 'Links point to the latest published release. If an asset is missing, check the release notes. Version and file size appear only when verified.',
    help: 'Install and first-open instructions', safety: 'Opening a downloaded app',
    unsigned: 'Unsigned builds can trigger Gatekeeper or SmartScreen. Verify the download and trust its source before continuing.',
    mac: 'Mac: open the DMG and drag VStudy Pro to Applications. If blocked, try opening once, then use System Settings > Privacy & Security > Open Anyway if offered. Never disable Gatekeeper globally.',
    win: 'Windows: run the EXE to install for your user. If SmartScreen warns, use More info > Run anyway only after verification and only if offered. A managed device may block this option.',
    signed: 'A signed and notarized Mac release normally needs only the usual first-open confirmation. A signed Windows release identifies its publisher, but SmartScreen reputation can still cause a warning.',
  },
  'zh-Hant': {
    download: '下載', other: '其他平台', intel: '下載 Intel Mac 版',
    checksums: 'SHA-256 校驗碼', releases: '版本說明與檔案狀態',
    requirements: 'macOS 12 以上 · Windows 10 以上（64 位元）。請依處理器選擇安裝檔。未提供 Linux 安裝檔。',
    status: '連結指向最新已發布版本。若缺少檔案，請查看版本說明；版本與檔案大小僅在確認後顯示。',
    help: '安裝與首次開啟說明', safety: '開啟下載的應用程式',
    unsigned: '未簽署的組建可能觸發 Gatekeeper 或 SmartScreen。請先驗證下載檔案，確認來源可信任後再繼續。',
    mac: 'Mac：開啟 DMG，將 VStudy Pro 拖入「應用程式」。若遭阻擋，先嘗試開啟一次，再到「系統設定 > 隱私權與安全性」，於提供選項時選擇「強制打開」。請勿全面停用 Gatekeeper。',
    win: 'Windows：執行 EXE，安裝至目前使用者帳號。若 SmartScreen 顯示警告，僅在驗證後且系統提供選項時，選擇「其他資訊 > 仍要執行」。受管理裝置可能禁止此操作。',
    signed: '經簽署與公證的 Mac 版本通常只需一般首次開啟確認。已簽署的 Windows 版本會顯示發布者身分，但 SmartScreen 仍可能因信譽不足而警告。',
  },
  ja: {
    download: 'ダウンロード', other: 'ほかのプラットフォーム', intel: 'Intel Mac 版をダウンロード',
    checksums: 'SHA-256 チェックサム', releases: 'リリースノートと配布状況',
    requirements: 'macOS 12 以降 · Windows 10 以降（64 ビット）。プロセッサーに合うインストーラーを選んでください。Linux 版はありません。',
    status: 'リンクは最新の公開リリースを指します。ファイルがない場合はリリースノートを確認してください。バージョンとサイズは確認できた場合のみ表示します。',
    help: 'インストールと初回起動の手順', safety: 'ダウンロードしたアプリを開く',
    unsigned: '未署名のビルドでは Gatekeeper や SmartScreen が警告する場合があります。ダウンロードを検証し、入手元を信頼できる場合のみ続けてください。',
    mac: 'Mac：DMG を開き、VStudy Pro を「アプリケーション」にドラッグします。ブロックされたら一度起動を試し、「システム設定 > プライバシーとセキュリティ」で、表示される場合のみ「このまま開く」を選びます。Gatekeeper 全体を無効にしないでください。',
    win: 'Windows：EXE を実行し、現在のユーザー用にインストールします。SmartScreen の警告が出たら、検証後に、表示される場合のみ「詳細情報 > 実行」を選びます。管理された端末では許可されない場合があります。',
    signed: '署名と公証済みの Mac 版では、通常の初回起動確認だけで開けます。署名済み Windows 版には発行元が表示されますが、SmartScreen の評価による警告は残る場合があります。',
  },
} satisfies Record<Language, { download: string; other: string; intel: string; checksums: string; releases: string; requirements: string; status: string; help: string; safety: string; unsigned: string; mac: string; win: string; signed: string }>;
