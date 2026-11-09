[English](INSTALL.md) · [繁體中文](INSTALL.zh-Hant.md) · [日本語](INSTALL.ja.md)

[README に戻る](../README.ja.md)

# VStudy Pro をインストールする

## 目次

- [ダウンロードとインストール](#ダウンロードとインストール)
- [Mac（Apple シリコン）](#macapple-シリコン)
- [方法 1 - DMG をダウンロード（いちばん簡単。事前の準備は不要）](#方法-1---dmg-をダウンロードいちばん簡単事前の準備は不要)
- [方法 2 - ターミナルに 1 行貼り付ける（こちらも事前の準備は不要）](#方法-2---ターミナルに-1-行貼り付けるこちらも事前の準備は不要)
- [方法 3 - AI エージェントに任せる](#方法-3---ai-エージェントに任せる)
- [Windows x64](#windows-x64)
- [更新](#更新)
- [アンインストール](#アンインストール)
- [任意 - ダウンロードを検証](#任意---ダウンロードを検証)
- [ソースからビルドする](#ソースからビルドする)
- [認証情報と動作環境](#認証情報と動作環境)

## ダウンロードとインストール

### Mac（Apple シリコン）

#### 方法 1 - DMG をダウンロード（いちばん簡単。事前の準備は不要）

1. [.dmg をダウンロード](https://github.com/ava-apple/vstudy-pro/releases/latest/download/VStudy-Pro-mac-arm64.dmg)。
2. ダウンロードした .dmg ファイルをダブルクリックします。
3. 開いたウインドウで VStudy Pro を「アプリケーション」にドラッグします。
4. Finder で VStudy Pro のディスクイメージを取り出します。
5. 「アプリケーション」または Launchpad から VStudy Pro を開きます。

<!-- mac-signing-status -->
> Mac 版は Apple の Developer ID で署名され、Apple の公証も受けています。他の Mac アプリと同じように開けます。Windows インストーラーはまだ未署名のため、初回実行時に SmartScreen の警告が表示される場合があります。 [インストールガイド](#macapple-シリコン)。
<!-- /mac-signing-status -->

**Mac で初めて開くとき**

署名と公証が済んだバージョンでは、通常、セキュリティの警告は表示されません。初回起動時は、インターネットからダウンロードしたアプリを開くかどうか macOS が確認します。「開く」をクリックしてください。

<details>
<summary>macOS が引き続きブロックする場合</summary>

v0.3.0 以前の未署名の Mac 版では、「システム設定 > プライバシーとセキュリティ」で「このまま開く」を選ぶ必要がありました。現在のバージョンでもブロックされる場合は、プロジェクトのリリースから再ダウンロードし、署名を検証してから続けてください。

</details>

#### 署名を検証する

```sh
codesign --verify --deep --strict --verbose=2 "/Applications/VStudy Pro.app"
spctl -a -t exec -vv "/Applications/VStudy Pro.app"
```

Gatekeeper が `accepted` と `source=Notarized Developer ID` を表示することを確認してください。

#### 方法 2 - ターミナルに 1 行貼り付ける（こちらも事前の準備は不要）

Command-Space を押し、Terminal と入力して Return を押します。次のコマンドを貼り付け、Return を押してください。

```sh
curl -fsSL https://raw.githubusercontent.com/ava-apple/vstudy-pro/main/scripts/install/install.sh | bash
```

Homebrew、npm、Xcode、Python は不要です。macOS に標準搭載されたツールだけで実行できます。

- 最新の DMG をダウンロードし、SHA-256 チェックサムを確認します。
- VStudy Pro を終了し、「アプリケーション」にインストールします。ライブラリは残ります。
- インストールしたアプリの署名と Apple の公証を検証します。検証済みのバージョンの隔離属性は保持します。sudo は使いません。

[先にスクリプトを読む](https://raw.githubusercontent.com/ava-apple/vstudy-pro/main/scripts/install/install.sh)。

#### 方法 3 - AI エージェントに任せる

このプロンプトを AI エージェントにコピーしてください。

```text
VStudy Pro をインストールしてください。Apple シリコン macOS では https://raw.githubusercontent.com/ava-apple/vstudy-pro/main/scripts/install/install.sh を取得して全文を読んでください。Windows x64 では同じディレクトリの install.ps1 を読んでください。Mac 版は署名と公証が済んでおり、Windows インストーラーは未署名であることを説明してください。Mac の署名と公証の検証が成功したことを確認してください。読んだスクリプトを実行し、SHA-256 検証の成功を確認して VStudy Pro を開き、インストール先と結果を報告してください。sudo、システム保護の一括無効化、ユーザーデータの削除は禁止です。検証に失敗したら停止してください。
```

### Windows x64

1. [EXE をダウンロード](https://github.com/ava-apple/vstudy-pro/releases/latest/download/VStudy-Pro-win-x64.exe)。
2. ダウンロードした EXE をダブルクリックし、画面の案内に従います。自分のユーザー用にインストールされ、管理者権限は不要です。
3. SmartScreen の警告が出た場合は、表示されていれば「詳細情報 > 実行」を選びます。このプロジェクトのリリースページから入手し、信頼できる場合のみ続けてください。学校が管理するパソコンでは許可されない場合があります。

または、スタートメニューから PowerShell を開いて次のコマンドを貼り付けます。スクリプトをダウンロードして内容を表示してから実行します。

```powershell
Invoke-WebRequest https://raw.githubusercontent.com/ava-apple/vstudy-pro/main/scripts/install/install.ps1 -OutFile install.ps1
Get-Content install.ps1
& .\install.ps1
```

Intel Mac 版と Windows ARM64 版は予定しています。Linux 用のインストーラーはまだありません。

### 更新

VStudy Pro を終了します。新しい DMG をダウンロードし、VStudy Pro を「アプリケーション」にドラッグして「置き換える」を選びます。ターミナルの 1 行コマンドを再実行しても更新できます。Windows では新しい EXE か PowerShell コマンドを実行します。ライブラリと学習計画は残ります。必要なら先に「設定 > ストレージ」でバックアップを書き出してください。

### アンインストール

Mac では VStudy Pro を終了し、「アプリケーション」からゴミ箱にドラッグします。Windows では「設定 > アプリ > インストールされているアプリ」から削除します。アプリを削除してもライブラリは残ります。データも削除したい場合は、先に VStudy Pro を開き、「設定 > プライバシー > すべてのデータを削除」を実行してください。

### 任意 - ダウンロードを検証

同じリリースから SHA256SUMS.txt をダウンロードします。ターミナルまたは PowerShell で「ダウンロード」フォルダーに移動し、お使いの OS のコマンドを実行してください。結果全体をファイル内の該当する値と照合します。一致すればファイルの内容を確認できますが、発行元の身元は証明できません。

[SHA256SUMS.txt](https://github.com/ava-apple/vstudy-pro/releases/latest/download/SHA256SUMS.txt)

```sh
cd ~/Downloads
shasum -a 256 VStudy-Pro-mac-arm64.dmg
```

```powershell
cd $HOME\Downloads
Get-FileHash -Algorithm SHA256 .\VStudy-Pro-win-x64.exe
```

[プロジェクトのリリース](https://github.com/ava-apple/vstudy-pro/releases/latest) · [ダウンロードを検証](https://vstudy.vcstudio.app/ja/download/#verify-download)

### ソースからビルドする

macOS または Windows、`.node-version` の **Node 24.19.0**、`package.json` の **pnpm 10.28.2** を使います。engine 指定は Node >=24.15.0 です。公開リポジトリのルートで実行します。

```sh
git clone https://github.com/ava-apple/vstudy-pro.git
cd vstudy-pro
pnpm install --frozen-lockfile
pnpm build
```

`pnpm build` はアプリをコンパイルします。各アーキテクチャのインストーラーは[公開しない試行ビルドの手順](ENGINEERING.md#prepare-a-release)で生成し、検証してください。認証情報は[署名ガイド](SIGNING.md)を参照します。Mac のローカルビルドだけでは Windows の動作を確認できません。

文書変換で必要になったら **uv** または **Python 3.10+** を別途インストールします。初回変換では同意後にハッシュを固定したパッケージを PyPI から取得します。uv は GitHub から Python を取得する場合もあります。「**設定 > プライバシー**」に再試行と永続的なオフラインモードがあります。Markdown とテキストは Python が不要です。macOS は OS のサンドボックスで変換器の通信を拒否します。Windows には同等のカーネルによる通信拒否がありません。オフラインモードや Python の socket 制限は OS のセキュリティ境界ではありません。

## 認証情報と動作環境

Apple シリコンでは macOS 14 以降、Windows x64 では Windows 10 以降が必要です。

文書、Markdown、会話記録は、アプリによって**保存時に暗号化されません**。保存する秘密情報は Mac キーチェーンまたは Windows DPAPI で暗号化し、セッションのみの情報は Main のメモリに保持します。ファイルは OS のアカウント権限と FileVault や BitLocker などのディスク暗号化で保護してください。ポータブルバックアップには認証情報は含まれませんが、個人の学習内容は含まれます。

「**設定 > プライバシー**」は、そのセッションでアプリが開始したリクエストと CLI 起動を件数上限付きで表示します。AI ツールのバージョン情報とダウンロードも含みます。定期的なバージョン確認には別の同意が必要です。パケットキャプチャではなく、CLI や Chromium 内部のすべての通信は把握できません。通信バイト数も不明です。外部ブラウザーやメールのリンクを開く前には確認を求めます。機密資料を扱う前に[セキュリティモデル](SECURITY.md)を確認してください。

safeStorage は Mac キーチェーンまたは Windows DPAPI で認証情報を暗号化します。未署名の Mac 版（v0.3.0 以前）から署名済みのバージョンに更新すると、macOS が「VStudy Pro Safe Storage」へのアクセスを一度だけ確認します。「常に許可」を選んでください。保存済みのキーは失われません。[ストレージの詳細](STORAGE.md)。
