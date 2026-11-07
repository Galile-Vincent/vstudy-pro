/** Download page and first-open copy, isolated from the site's visual redesign. */
import type { Language } from './ui';

interface DownloadCopy {
  download: string; planned: string;
  checksums: string; releases: string; requirements: string; status: string;
  help: string; safety: string; unsigned: string; mac: string; win: string; signed: string;
  title: string; metaDescription: string; lead: string;
  recommended: string; getIt: string; unknown: string; unavailable: string;
  osMac: string; osWin: string; osLinux: string; noLinux: string;
  requirementsTitle: string; badge: string; macHint: string; winHint: string;
  dmg: string; exe: string;
  arch: Record<'mac-arm64' | 'mac-x64' | 'win-x64' | 'win-arm64', { name: string; note: string }>;
}

export const downloadCopy = {
  en: {
    download: 'Download for', planned: 'Planned',
    checksums: 'SHA-256 checksums', releases: 'Release notes and availability',
    requirements: 'Full document conversion requires macOS 14+ on Apple silicon, macOS 13+ on Intel, Windows 10+ on x64, or Windows 11+ on ARM64. ARM64 conversion uses x64 Python through Windows emulation. No Linux installer.',
    status: 'Links point to the latest published release. If an asset is missing, check the release notes. Version and file size appear only when verified.',
    help: 'Install and first-open instructions', safety: 'Opening a downloaded app',
    unsigned: 'Unsigned builds can trigger Gatekeeper or SmartScreen. Verify the download and trust its source before continuing.',
    mac: 'Mac: open the DMG and drag VStudy Pro to Applications. If blocked, try opening once, then use System Settings > Privacy & Security > Open Anyway if offered. Never disable Gatekeeper globally.',
    win: 'Windows: run the EXE to install for your user. If SmartScreen warns, use More info > Run anyway only after verification and only if offered. A managed device may block this option.',
    signed: 'A signed and notarized Mac release normally needs only the usual first-open confirmation. A signed Windows release identifies its publisher, but SmartScreen reputation can still cause a warning.',
    title: 'Download VStudy Pro',
    metaDescription: 'Download VStudy Pro for macOS or Windows. Every installer, the checksums and the release notes in one place.',
    lead: 'Choose the installer that matches your computer.',
    recommended: 'Recommended for this device', getIt: 'Download',
    unknown: 'We could not tell which computer you are using. Choose the one that matches yours below.',
    unavailable: 'The build for this device is planned and not available yet.',
    osMac: 'macOS', osWin: 'Windows', osLinux: 'Linux', noLinux: 'No Linux installer yet',
    requirementsTitle: 'Requirements', badge: 'Recommended',
    macHint: 'Not sure which Mac you have? Open the Apple menu and choose About This Mac. If it lists a chip such as Apple M1, choose Apple silicon.',
    winHint: 'Most Windows PCs are x64. Choose ARM64 only if Settings > System > About shows an ARM-based processor.',
    dmg: 'DMG disk image', exe: 'EXE installer',
    arch: {
      'mac-arm64': { name: 'Apple silicon', note: 'Macs with M1, M2, M3, M4 or newer. macOS 14 or later.' },
      'mac-x64': { name: 'Intel', note: 'Macs with an Intel processor. macOS 13 or later.' },
      'win-x64': { name: 'x64', note: 'Most Windows PCs. Windows 10 or later.' },
      'win-arm64': { name: 'ARM64', note: 'Windows on ARM. Windows 11 or later.' },
    },
  },
  'zh-Hant': {
    download: '下載', planned: '規劃中',
    checksums: 'SHA-256 校驗碼', releases: '版本說明與檔案狀態',
    requirements: '完整文件轉換需要 Apple 晶片 macOS 14 以上、Intel macOS 13 以上、x64 Windows 10 以上，或 ARM64 Windows 11 以上。ARM64 轉換透過 Windows 模擬功能執行 x64 Python。未提供 Linux 安裝檔。',
    status: '連結指向最新已發布版本。若缺少檔案，請查看版本說明；版本與檔案大小僅在確認後顯示。',
    help: '安裝與首次開啟說明', safety: '開啟下載的應用程式',
    unsigned: '未簽署的組建可能觸發 Gatekeeper 或 SmartScreen。請先驗證下載檔案，確認來源可信任後再繼續。',
    mac: 'Mac：開啟 DMG，將 VStudy Pro 拖入「應用程式」。若遭阻擋，先嘗試開啟一次，再到「系統設定 > 隱私權與安全性」，於提供選項時選擇「強制打開」。請勿全面停用 Gatekeeper。',
    win: 'Windows：執行 EXE，安裝至目前使用者帳號。若 SmartScreen 顯示警告，僅在驗證後且系統提供選項時，選擇「其他資訊 > 仍要執行」。受管理裝置可能禁止此操作。',
    signed: '經簽署與公證的 Mac 版本通常只需一般首次開啟確認。已簽署的 Windows 版本會顯示發布者身分，但 SmartScreen 仍可能因信譽不足而警告。',
    title: '下載 VStudy Pro',
    metaDescription: '下載適用於 macOS 或 Windows 的 VStudy Pro。所有安裝檔、校驗碼與版本說明都在這一頁。',
    lead: '選擇與你的電腦相符的安裝檔。',
    recommended: '建議用於這台裝置', getIt: '下載',
    unknown: '無法判斷你使用的電腦。請在下方選擇與你的電腦相符的版本。',
    unavailable: '適用於這台裝置的版本仍在規劃中，目前尚未提供。',
    osMac: 'macOS', osWin: 'Windows', osLinux: 'Linux', noLinux: '尚未提供 Linux 安裝檔',
    requirementsTitle: '系統需求', badge: '建議',
    macHint: '不確定你的 Mac 屬於哪一種？點選蘋果選單，選擇「關於這台 Mac」。若顯示 Apple M1 之類的晶片，請選擇 Apple 晶片。',
    winHint: '大多數 Windows 電腦都是 x64。只有在「設定 > 系統 > 關於」顯示 ARM 處理器時，才選擇 ARM64。',
    dmg: 'DMG 磁碟映像', exe: 'EXE 安裝程式',
    arch: {
      'mac-arm64': { name: 'Apple 晶片', note: '搭載 M1、M2、M3、M4 或更新晶片的 Mac。需要 macOS 14 以上。' },
      'mac-x64': { name: 'Intel', note: '搭載 Intel 處理器的 Mac。需要 macOS 13 以上。' },
      'win-x64': { name: 'x64', note: '大多數 Windows 電腦。需要 Windows 10 以上。' },
      'win-arm64': { name: 'ARM64', note: 'ARM 版 Windows。需要 Windows 11 以上。' },
    },
  },
  ja: {
    download: 'ダウンロード', planned: '予定',
    checksums: 'SHA-256 チェックサム', releases: 'リリースノートと配布状況',
    requirements: '資料変換には Apple シリコンで macOS 14 以降、Intel で macOS 13 以降、x64 で Windows 10 以降、ARM64 で Windows 11 以降が必要です。ARM64 の変換は Windows のエミュレーションで x64 Python を実行します。Linux 版はありません。',
    status: 'リンクは最新の公開リリースを指します。ファイルがない場合はリリースノートを確認してください。バージョンとサイズは確認できた場合のみ表示します。',
    help: 'インストールと初回起動の手順', safety: 'ダウンロードしたアプリを開く',
    unsigned: '未署名のビルドでは Gatekeeper や SmartScreen が警告する場合があります。ダウンロードを検証し、入手元を信頼できる場合のみ続けてください。',
    mac: 'Mac：DMG を開き、VStudy Pro を「アプリケーション」にドラッグします。ブロックされたら一度起動を試し、「システム設定 > プライバシーとセキュリティ」で、表示される場合のみ「このまま開く」を選びます。Gatekeeper 全体を無効にしないでください。',
    win: 'Windows：EXE を実行し、現在のユーザー用にインストールします。SmartScreen の警告が出たら、検証後に、表示される場合のみ「詳細情報 > 実行」を選びます。管理された端末では許可されない場合があります。',
    signed: '署名と公証済みの Mac 版では、通常の初回起動確認だけで開けます。署名済み Windows 版には発行元が表示されますが、SmartScreen の評価による警告は残る場合があります。',
    title: 'VStudy Pro をダウンロード',
    metaDescription: 'macOS と Windows 向けの VStudy Pro をダウンロード。インストーラー、チェックサム、リリースノートをこのページにまとめています。',
    lead: 'お使いのパソコンに合うインストーラーを選んでください。',
    recommended: 'この端末におすすめ', getIt: 'ダウンロード',
    unknown: 'お使いのパソコンを判別できませんでした。下の一覧から合うものを選んでください。',
    unavailable: 'この端末向けのビルドは準備中で、まだ入手できません。',
    osMac: 'macOS', osWin: 'Windows', osLinux: 'Linux', noLinux: 'Linux 版はまだありません',
    requirementsTitle: '動作環境', badge: 'おすすめ',
    macHint: 'お使いの Mac の種類が分からない場合は、アップルメニューの「この Mac について」を開きます。Apple M1 などのチップと表示されていれば Apple シリコンを選んでください。',
    winHint: 'ほとんどの Windows パソコンは x64 です。「設定 > システム > バージョン情報」に ARM ベースのプロセッサーと表示される場合のみ ARM64 を選んでください。',
    dmg: 'DMG ディスクイメージ', exe: 'EXE インストーラー',
    arch: {
      'mac-arm64': { name: 'Apple シリコン', note: 'M1、M2、M3、M4 以降を搭載した Mac。macOS 14 以降。' },
      'mac-x64': { name: 'Intel', note: 'Intel プロセッサー搭載の Mac。macOS 13 以降。' },
      'win-x64': { name: 'x64', note: 'ほとんどの Windows パソコン。Windows 10 以降。' },
      'win-arm64': { name: 'ARM64', note: 'ARM 版 Windows。Windows 11 以降。' },
    },
  },
} satisfies Record<Language, DownloadCopy>;
