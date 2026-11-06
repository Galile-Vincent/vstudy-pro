[English](README.md) · [繁體中文](README.zh-Hant.md) · 日本語

# VStudy Pro

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/generated/lockup-dark.svg">
  <img src="assets/brand/generated/lockup-light.svg" width="320" alt="VStudy Pro">
</picture>

macOS と Windows で教材を読み、Moodle の締め切りをまとめ、課題を学習計画に変えるアプリです。

![バージョン 0.3.0](https://img.shields.io/badge/version-0.3.0-blue) ![macOS and Windows](https://img.shields.io/badge/platform-macOS_%7C_Windows-black)

![グラフのノート、選択した文章、デモ回答と出典の引用](docs/assets/readme/reader.webp)

## ダウンロードとインストール

### アプリを入手する

| プラットフォーム | インストーラー |
| --- | --- |
| Apple シリコン Mac | [DMG をダウンロード](https://github.com/ava-apple/vstudy-pro/releases/latest/download/VStudy-Pro-mac-arm64.dmg) |
| Intel Mac | 予定。資料変換とネイティブのパッケージ検証が必要です。 |
| Windows x64 | [EXE をダウンロード](https://github.com/ava-apple/vstudy-pro/releases/latest/download/VStudy-Pro-win-x64.exe) |
| Windows ARM64 | 予定。資料変換とネイティブのインストール検証が必要です。 |

同じリリースの [SHA256SUMS.txt](https://github.com/ava-apple/vstudy-pro/releases/latest/download/SHA256SUMS.txt) もダウンロードしてください。固定リンクは最新の公開ファイルを指します。リポジトリは公開されています。404 の場合は[リリースノート](https://github.com/ava-apple/vstudy-pro/releases/latest)で配布対象と検証結果を確認してください。CI の成果物や試行ビルドは公開リリースではありません。リンクだけではバージョン、サイズ、動作確認を保証しません。

初回の配布対象は Apple シリコン Mac と Windows x64 です。Intel Mac と Windows ARM64 は、資料変換とネイティブのパッケージ検証が終わるまで予定です。資料変換には、Apple シリコンで macOS 14 以降、Intel で macOS 13 以降が必要です。Windows は x64 で Windows 10 以降、ARM64 で Windows 11 以降が必要です。ARM64 版は Windows のエミュレーションで x64 Python を実行します。アプリ自体は macOS 12 で Markdown とテキストを開けますが、変換ツールのネイティブ依存関係には新しい OS が必要です。Mac は「この Mac について」に Intel と表示される場合を除き、Apple シリコンを選びます。Windows は「設定 > システム > バージョン情報 > システムの種類」を確認し、ARM プロセッサーと Intel Mac の利用者は、対応版の公開をお待ちください。Linux 版はありません。AI と学校の同期にはネット接続が必要です。ローカルの Markdown とテキストの閲覧には AI アカウントは不要です。

### 検証して開く

1. インストーラーのハッシュ全体を `SHA256SUMS.txt` の同じファイル名の値と比較します。Mac はダウンロード先で `shasum -a 256 VStudy-Pro-mac-arm64.dmg` を実行し、実際のファイル名に置き換えます。Windows は PowerShell で `Get-FileHash -Algorithm SHA256 .\VStudy-Pro-win-x64.exe` を使います。一覧にはほかの成果物も含まれます。自分が取得したファイルを照合してください。チェックサムは改変を検出しますが、発行元の身元は証明しません。
2. Mac：DMG を開き、**VStudy Pro.app** を「**アプリケーション**」にドラッグします。イメージを取り出し、インストールしたアプリを開きます。未署名やアドホック署名でブロックされたら、一度起動を試します。入手元を信頼できる場合のみ「**システム設定 > プライバシーとセキュリティ**」で、表示される場合に「**このまま開く**」を選びます。Gatekeeper 全体を無効にしないでください。[Apple の初回起動手順](https://support.apple.com/en-us/102445)を参照してください。
3. Windows：EXE を実行し、現在のユーザー用にインストールします。未署名のファイルで SmartScreen が警告したら、検証後に、表示される場合のみ「**詳細情報 > 実行**」を選びます。組織の方針で禁止される場合もあります。SmartScreen を無効にしないでください。このユーザー用インストーラーが管理者権限を要求したら操作を止めてください。
4. 署名と公証済みの Mac 版は通常の初回確認で開きます。署名済み Windows 版はファイルの署名詳細で発行元を確認します。ただし署名は SmartScreen の評価を保証しません。実際の署名状態はリリースノートを確認し、[署名の検証](docs/SIGNING.md#verify-the-delivered-artifacts)も参照してください。
5. 初回ガイドに従うか、サンプル資料を開きます。学校は「**コース**」、任意の AI は「**設定 > プロバイダー**」で追加できます。

VStudy は Electron `safeStorage` で保存済み認証情報を暗号化します。macOS はログインキーチェーンのキーを使い、アドホック署名の再ビルド後にはアクセス確認が再表示される場合があります。Windows は現在の Windows ユーザーに結び付いた DPAPI を使い、Mac のキーチェーン確認は表示しません。どちらも再起動後は明示的なロック解除まで復号を待ちます。メイン画面を開くだけでは解除しません。再試行するか、保存せずにセッション中だけキーを使えます。

### 更新とアンインストール

更新は手動です。「**設定 > ストレージ**」でバックアップをエクスポートし、VStudy Pro を終了して、新しいインストーラーを検証します。Mac は「アプリケーション」のコピーを置き換え、Windows は同じユーザーで新版の EXE を実行します。データフォルダーを残せばライブラリと計画は保持されます。データベース更新前には移行用バックアップを作成します。ダウングレードは非対応です。自動更新は署名と公証を検証した後の別の変更です。

データを削除するには「**設定 > プライバシー > すべてのデータを削除**」で `DELETE` と入力し、システムの確認に同意します。アプリが専用データ領域を削除して終了したら、Mac アプリをゴミ箱に移すか、Windows の「**設定 > アプリ > インストールされているアプリ**」で削除します。アプリだけを削除してもローカルデータは残ります。

Main は Electron `app.getPath('userData')` を使います。現在の名前空間は `@vstudy/desktop` です。既定の場所は Mac が `~/Library/Application Support/@vstudy/desktop`、Windows が `%APPDATA%\@vstudy\desktop` で、`vstudy.sqlite`、`library/`、`secrets.json`、変換器のファイルを含みます。テストでは場所を変更できます。[ストレージの説明](docs/STORAGE.md)を参照してください。

全データ削除でも、ライブラリ外の原本、書き出したバックアップ、CLI の認証情報、共有 Python ダウンロードキャッシュ、独立した OS の認証保管項目は削除しません。バックアップや SSD の安全な消去を保証する操作ではありません。

### ソースからビルドする

macOS または Windows、`.node-version` の **Node 24.19.0**、`package.json` の **pnpm 10.28.2** を使います。engine 指定は Node >=24.15.0 です。公開リポジトリのルートで実行します。

```sh
git clone https://github.com/ava-apple/vstudy-pro.git
cd vstudy-pro
pnpm install --frozen-lockfile
pnpm build
```

`pnpm build` はアプリをコンパイルします。各アーキテクチャのインストーラーは[公開しない試行ビルドの手順](docs/ENGINEERING.md#prepare-a-release)で生成し、検証してください。認証情報は[署名ガイド](docs/SIGNING.md)を参照します。Mac のローカルビルドだけでは Windows の動作を確認できません。

文書変換で必要になったら **uv** または **Python 3.10+** を別途インストールします。初回変換では同意後にハッシュを固定したパッケージを PyPI から取得します。uv は GitHub から Python を取得する場合もあります。「**設定 > プライバシー**」に再試行と永続的なオフラインモードがあります。Markdown とテキストは Python が不要です。macOS は OS のサンドボックスで変換器の通信を拒否します。Windows には同等のカーネルによる通信拒否がありません。オフラインモードや Python の socket 制限は OS のセキュリティ境界ではありません。

## 主な機能

- **コースと締め切り。** 教材、お知らせ、成績、ファイル、通知、直近の課題、締め切りのリマインダーをまとめます。取得できる情報は学校によって異なります。
- **複数校の Moodle。** 内蔵の学校一覧を検索するか、公開 HTTPS の Moodle URL を入力します。複数校・複数ユーザーのアカウントを分離し、公式 Moodle モバイルサービスのパスワード認証や対応する SSO で接続します。
- **学習計画とコースアシスタント。** タスク、目標、試験、学習時間枠を追加できます。空き時間に合わせて日次・週次の予定を下書きし、カレンダーに書き出せます。アシスタントの変更提案は承認カードで確認してから保存します。コースとの関連を削除しても、自分で作った計画は残ります。
- **文書と AI の対話。** PDF、DOCX、XLSX、PPTX、HTML、CSV、Markdown、テキストを 1 ファイル 50 MiB まで取り込めます。フォルダ、タグ、ピン留め、保存したフィルターで整理し、選択した文章への質問、引用元への移動、報告値または推定値による使用量・費用の確認ができます。
- **テーマ。** ライト、ダーク、システム連動に対応します。9 種類の内蔵テーマ、コントラストとガラス不透明度の調整、検証済みカスタムテーマの読み込み・書き出しがあります。
- **チャット履歴検索。** 文書、コース、一般チャットを検索し、コース、文書、範囲、役割、日付で絞り込めます。名前の変更、ピン留め、アーカイブ、削除もできます。
- **アプリ内 Moodle ページ。** 学校のログイン状態を使い、アカウントごとに分離したビューで対応する教員ページやお知らせを開けます。移動、拡大縮小、再読み込みを備えています。
- **ストレージとバックアップ。** 使用量の確認、キャッシュや変換済みファイルの削除、データベースの整合性検査、ポータブルバックアップの書き出しと復元ができます。認証情報はバックアップに含まれず、復元後は学校への再ログインが必要です。
- **プライバシー。** ライブラリと SQLite はローカルに保存します。AI は任意で、保存する認証情報を暗号化し、セッション中のネットワーク活動を表示します。任意の利用分析は同意するまでオフで、デバイス間同期はありません。
- **初回ガイドと言語。** サンプル文書、再表示できる設定ガイド、操作説明、画面に応じたヒントがあります。English（`en`）、繁體中文（`zh-Hant`）、日本語（`ja`）に対応しています。
- **MCP でグローバルエージェントを接続。** アカウント・権限・期限を限定して授業を共有します。アプリのセッションで読み取り、書き込みは「設定 > エージェント」で毎回承認します。

## 画面ガイド

スクリーンショットは現在のビルドを使い、デモの授業、ローカル資料、模擬 AI 会話を表示しています。実際の学校や AI サービスの動作検証ではありません。[撮影手順と画像の出典](docs/assets/readme/README.md)。

### ホーム

設定チェックリスト、文書の取り込み、サンプルから始められます。最近読んだ文書や学習活動にも戻れます。

![最近の資料と完了した設定チェックリストのホーム](docs/assets/readme/home.webp)

### ライブラリ

文書の閲覧と検索ができます。フォルダ、タグ、ピン留め、最近の項目、保存したフィルター、変換状態で教材を探せます。

![2 つのフォルダーに整理した英語と繁体字中国語の学習ノート](docs/assets/readme/library.webp)

### リーダーとチャット

変換した Markdown の横で文書について対話します。文章を選んで質問し、引用元を確認し、同じ文書の過去の会話を開けます。AI を接続しなくても読めます。

![グラフのノート、選択した文章、デモ回答と出典の引用](docs/assets/readme/reader.webp)

### コース一覧

学校の接続・再接続、アカウントの同期、今後 7 日間の未提出課題の確認ができます。現在、今後、過去、すべてのコースを切り替えられます。

![アートの表紙と教員、締切、進捗が並ぶ授業カード](docs/assets/readme/courses.webp)

### コース詳細

**コンテンツ、締め切り、お知らせ、成績、ファイル、通知**のタブがあります。教材を開き、リマインダーを設定し、コースアシスタントに質問できます。学校が提供しない機能は利用できません。

![アルゴリズムとデータ構造の今週の教材と締切](docs/assets/readme/course.webp)

![独立したアプリ内表示で開いた Moodle のデモ教員ページ](docs/assets/readme/webview.webp)

### 今日とプランナー

コース画面からプランナーを開きます。今日と今週を切り替え、タスクや試験、使える時間を設定し、予定の提案を確認して保存できます。学習時間枠をカレンダーファイルにも書き出せます。

![今日の学習タスクと統計の中間試験](docs/assets/readme/planner.webp)

### 履歴

会話を横断して検索し、該当するメッセージを開けます。コース、文書、一般チャットを絞り込み、よく使う会話をピン留めできます。

![Command-K で保存済みの学習会話を検索](docs/assets/readme/history.webp)

### 設定

「**一般**」は言語と初回ガイド・Welcome、「**外観**」はテーマとコントラスト、「**プロバイダー**」は AI 接続、「**使用量**」は token と費用、「**ストレージ**」はバックアップと削除を扱います。「**プライバシー**」では変換ツールのインストール、オフラインモード、ネットワーク活動、データ削除を管理します。

![アプリ全体のライトとダークのテーマ設定](docs/assets/readme/themes.webp)

![ストレージ使用量の内訳](docs/assets/readme/storage.webp)

### ヘルプと Welcome

ヘルプから初回設定、図解や録画による操作ガイド、キーボードショートカットを開けます。Welcome はアプリを紹介し、学校や AI の認証情報がなくても試せるサンプルを提供します。

![読書画面のプレビューがある初回ガイド](docs/assets/readme/onboarding.webp)

### キーボードショートカット

Mac では Cmd、Windows では Ctrl を使います。

| ショートカット | 操作 |
| --- | --- |
| `Cmd/Ctrl+K` | 全体の会話検索を開く。 |
| `Cmd/Ctrl+B` | サイドバーの表示を切り替える。 |
| `Cmd/Ctrl+Shift+K` | リーダーで選択中の文章について質問する。 |
| 矢印キー / `Shift+矢印キー` | リーダー自体にフォーカスがあるとき、選択位置を移動・拡張する。 |
| `Enter` / `Shift+Enter` | チャット送信 / 改行。IME の変換中を除く。 |
| `Esc` | ダイアログや Moodle ページのパネルを閉じる。 |
| `Cmd/Ctrl+R` | フォーカス中の Moodle ページを再読み込みする。 |
| `Tab` / `Shift+Tab` | 操作項目間でフォーカスを移動する。 |

## グローバルエージェントを接続する

ソースビルドには Claude Code、Codex、Antigravity、Claude Desktop、Cursor 向けの MCP サーバーを含みます。選択した Moodle アカウントを VStudy の既存セッションで読み取ります。学校の認証情報はアプリ内に保持し、エージェントには期限付きの個別ローカル許可を渡します。すべての書き込みは VStudy 内で毎回承認します。

「設定 > エージェント」で接続を有効にし、接続ウィザードで設定変更を確認してインストールします。両方のコードを比較し、アカウントと権限を選択します。ソースをビルドした後、Codex の設定をプレビューできます。

```sh
node apps/mcp/dist/vstudy-mcp.cjs install --client codex --dry-run
```

ほかのクライアントは `claude`、`agy`、`claude-desktop`、`cursor` を指定します。Node.js 24.11.1 以降が必要です。小テストや動画は学生自身が取り組みます。MCP は小テストの解答・提出や活動進捗の偽造を行いません。`save_assignment_draft` は学生自身が承認したテキストだけを下書きとして保存します。最終提出は必ず学生が Moodle で手動で行います。

[MCP の設定・ツール・安全性](docs/MCP.md)、[クライアント形式と実際の検証範囲](apps/mcp/CLIENT_FORMATS.md)、[設計判断](docs/MCP_DESIGN.md)を参照してください。公式 SDK とローカル Moodle フィクスチャでパッケージ成果物を確認しました。ネイティブ Windows の統合と実際の学校での確認は別途必要です。

## 仕組み

学校を選んで Moodle サイトを確認すると、Main が公式モバイルサービスを検出し、対応するパスワード認証または SSO でログインします。アカウントごとのコース情報をローカルの SQLite に保存します。学校ごとの機能を確認し、同じ機能がすべての学校で使えるとは仮定しません。

文書を取り込むと、原本のコピーを内容のハッシュで管理するライブラリに保存します。Markdown とテキストは直接開き、その他の形式は必要なときだけ Python 変換ツールを起動して Markdown にします。変換中は macOS でネットワークを禁止し、アイドル後に停止します。書式が失われる場合があり、PDF を忠実に表示するビューアーではありません。

AI は任意です。サイドバーの「**AI ツール**」、初回案内、リーダー、または「**設定 > プロバイダー**」から「**AI ツールを設定**」を開きます。Claude Code（`claude`）、Codex（`codex`）、Antigravity（`agy`）を選び、個別に実行を許可します。無効なツールはファイルの確認だけを行い、起動しません。

1. **インストール。** 公式のダウンロード元と専用の保存先を確認します。管理対象のダウンロードは、アプリに固定したハッシュか独立した発行元の署名で検証してから実行します。Claude と検証済み macOS Codex 0.166.0 が対応します。Antigravity は「別のインストール方法」に公式コマンドを表示し、自分のターミナルで実行します。管理対象のインストールに管理者パスワードや PATH の変更は不要です。
2. **ログイン。** macOS では確認済みの操作を内蔵ターミナルで実行します。リンクやデバイスコードに従ってログインし、VStudy に戻ります。リンクを開く前に確認します。コマンドのコピーや、自分のターミナルを開く方法も使えます。Windows と Linux のログインは外部ターミナルを使います。
3. **テスト。** 「**テストする**」を選ぶと、実際のプロバイダーに短い質問を送ります。文書の内容は含まず、利用枠を消費する場合があります。同じ画面に対処方法と、先生や IT 担当者にコピーして相談できる文章があります。

サイドバーにバージョンと更新状況を表示します。「今すぐ確認」は一度だけバージョンを確認します。「**設定 > プライバシー**」の定期確認とアイドル時の自動更新は、初めは無効です。更新は現行版と別の場所へ保存します。進行中のチャットは旧版で続き、新しいチャットに更新を適用します。前の版へ戻すこともできます。別途インストールした CLI は更新しません。コピー専用の公式インストーラーを使う場合は、プロバイダー設定で既存の実行ファイルを選ぶ方法を案内します。

提供元を独立して検証できない更新には「新しいバージョンがあります。ご自身でインストールしてください」と提供元のリンクを表示します。プロバイダーの許可か更新設定のどちらかを取り消すと、保留中の自動更新は実行や切り替えの前に中止します。

VStudy に AI の契約は含まれません。利用資格と無料・有料の利用枠は各社の規約に従います。Anthropic、OpenAI、OpenAI-compatible API キーを保存するか、そのセッションだけ使う方法も選べます。Codex は検証済み CLI **0.166.0**、macOS、`/usr/bin/sandbox-exec` が必要です。管理対象のインストールもこの版を使い、新版で転送の検証を回避することはできません。[Codex の制約](docs/codex-tool-free.md)、[設定の設計と検証範囲](docs/AI_CLI_SETUP_DESIGN.md)、[実装の記録](docs/AI_CLI_SETUP_REPORT.md)を参照してください。

Windows には検証済みの同等なカーネルサンドボックスがないため、Codex CLI プロバイダーは無効です。Windows では API プロバイダーを利用できます。

質問はサイズを制限した文脈と組み合わせて送ります。文書チャットではメタデータ、会話履歴、選択した文章を含み、選択がなければアウトラインと冒頭の抜粋を含みます。コースチャットでは取得できる課程情報、プランナーの状態、選んだ変換済み文書を追加します。回答はストリーム表示してローカルに保存します。計画の変更提案は明示的な承認を受けてから Main が適用します。日付や回答は原典で確認してください。

キャッシュ済みのコース情報と変換済み文書はオフラインでも読めます。ただし締め切りが古い場合があります。新しい同期、学校のページ、リモート AI は接続が必要です。変換のオフラインモードを有効にしても、外部 AI がローカルで動くわけではありません。

### プライバシーと通信

VStudy は、同意しない限り利用分析を送信しません。初回起動時に、仮名の識別子による任意のプロダクト分析を共有するかどうか選べます。送信先は米国の PostHog で、初期設定はオフです。**設定 > プライバシー** でいつでもオフにでき、機能が制限されることはありません。内容は利用状況に限られます。起動と実際の利用時間、使った機能、AI プロバイダー、モデル、推論の強度とトークン数、質問の種類と文字数、資料や学習の操作、機微な内容を除いたエラーの種類、VStudy を知ったきっかけ、検証済みの Moodle 対応で判別した学校、基本的な端末とアプリの情報です。質問、回答、資料、ノート、検索語、ファイル名、キー入力、スクリーンショット、Moodle の本人情報は含まれません。イベントはランダムなインストール ID でひも付けます。これは仮名の識別子であり、匿名ではありません。任意の更新情報メールは別の選択で、初期状態ではチェックされておらず、分析には届きません。プライバシーポリシーと利用規約はウェブサイトで公開しています。学校へのログイン、同期、ページ表示は選んだ学校と通信します。有効にした API プロバイダーには上記の質問と文脈を送信し、以前選択した文章が履歴に残ることもあります。CLI ツールは独自のチャット、モデル検出、検証、利用枠、テレメトリーのサービスと通信する場合があります。Claude には非必須通信とテレメトリーの停止設定を渡します。Python のセットアップは同意後に PyPI や GitHub と通信する場合があります。

文書、Markdown、会話記録は、アプリによって**保存時に暗号化されません**。保存する秘密情報は Mac キーチェーンまたは Windows DPAPI で暗号化し、セッションのみの情報は Main のメモリに保持します。ファイルは OS のアカウント権限と FileVault や BitLocker などのディスク暗号化で保護してください。ポータブルバックアップには認証情報は含まれませんが、個人の学習内容は含まれます。

「**設定 > プライバシー**」は、そのセッションでアプリが開始したリクエストと CLI 起動を件数上限付きで表示します。AI ツールのバージョン情報とダウンロードも含みます。定期的なバージョン確認には別の同意が必要です。パケットキャプチャではなく、CLI や Chromium 内部のすべての通信は把握できません。通信バイト数も不明です。外部ブラウザーやメールのリンクを開く前には確認を求めます。機密資料を扱う前に[セキュリティモデル](docs/SECURITY.md)を確認してください。

## プロジェクト構成

```text
apps/desktop/
  src/
    main/       Electron の起動・終了、IPC、SQLite、Moodle、計画、AI、保存
    preload/    分離された Renderer と Main を結ぶ型付きブリッジ
    renderer/   React 画面、リーダー、チャット、設定、テーマ
    shared/     Zod 契約、ドメイン型、翻訳、テーマのスキーマ
  resources/    Python 変換ツールと同梱サンプル文書
  e2e/          実際の Electron を使う統合テストとテストデータ
  scripts/      ビルド、パッケージ、安全性、テストの補助ツール
apps/mcp/       Stdio MCP サーバー、クライアント設定、プラグイン、SDK 検証
docs/           設計、データ、セキュリティ、検証記録
scripts/        リポジトリ用ツール、hooks、README リンク検査
.github/        CI と未署名のタグリリースワークフロー
```

### プロセスモデル

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

### Moodle の同期

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

### AI への質問

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

[アーキテクチャ](docs/ARCHITECTURE.md)、[データモデル](docs/DATA_MODEL.md)、[ストレージ](docs/STORAGE.md)、[セキュリティ](docs/SECURITY.md)、[開発ガイド](docs/ENGINEERING.md)を参照してください。[ドキュメント一覧](docs/README.md)では、現在の仕様と過去の監査記録を区別しています。

## 開発

依存関係のインストール後、リポジトリのルートで実行します。メモリが少ない環境ではチェックを順番に実行してください。

| コマンド | 目的 |
| --- | --- |
| `pnpm dev` | Electron と Vite を起動する。Ctrl+C で停止する。 |
| `pnpm typecheck` | TypeScript を検査し、翻訳の型を生成する。 |
| `pnpm lint` | MCP、デスクトップ、ウェブサイトを検査する。 |
| `pnpm test --pool=forks --maxWorkers=2` | MCP、コントラスト、デスクトップの単体テストを 2 worker で実行する。 |
| `pnpm build` | MCP、ネイティブの相手確認ヘルパー、Main、Preload、Renderer をビルドする。 |
| `pnpm security:static` | 依存関係の方針とセキュリティ lint を検査する。 |
| `pnpm security:check` | 静的検査、lint、単体テストを実行する。 |
| `pnpm e2e` | ビルド後、実際の Electron の E2E を順番に実行する。 |
| `pnpm smoke` | ビルドして実際の Electron のスモークテストを起動する。 |
| `pnpm package` | 設定済みの署名の既定値でビルド・パッケージする。 |
| `node apps/desktop/scripts/marketing-shots.mjs` | `pnpm build` の後にマーケティング用スクリーンショットを生成する。 |
| `node scripts/check-readme-links.mjs` | 3 言語の README と文書一覧のローカルリンクを検査する。 |

E2E には **uv**、または `VSTUDY_CONVERTER_VENV` で指定する既存のハッシュ固定済み変換環境が必要です。未署名パッケージを用意し、Python の依存関係をダウンロードする場合があります。証跡の既定パスは `/tmp/vstudy-final/e2e` で、`VSTUDY_E2E_EVIDENCE` で変更できます。実際のプロバイダーを使うテストには明示的な有効化と認証が必要です。スキップは動作確認済みを意味しません。

変更、翻訳の同期、バージョンタグ、リリースチェックリストは [CONTRIBUTING](CONTRIBUTING.md) に従ってください。署名の秘密情報を Git に保存しないでください。現在、プロジェクトのライセンスファイルはありません。依存関係のライセンス一覧は本プロジェクトのライセンスではありません。

### 既知の制約

- macOS と Windows の各アーキテクチャは個別のパッケージ検証が必要です。検証結果と署名状態はリリースノートを確認してください。未署名では Gatekeeper や SmartScreen が警告する場合があります。
- OCR はありません。スキャン画像のみの PDF は非対応です。複雑な表、段組み、数式、画像は正しく変換できない場合があります。単一の HTML や Markdown を取り込んでも隣接画像はコピーしません。
- 学校との連携は Moodle モバイルサービスと権限に依存します。公開 HTTPS が必須で、LAN 限定サイト、自己署名 TLS、QR 認証情報の交換は非対応です。
- デバイス間同期はありません。API や CLI のモデルには各サービスのアクセス権が必要で、料金が発生する場合があります。
- AI による文書改善のバックエンドとパネルはありますが、現在のリーダーにはパネルを組み込んでいません。この操作は利用を前提にしないでください。[AI 解析の現状](docs/AI_PARSE.md)を参照してください。
