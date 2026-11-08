[English](README.md) · [繁體中文](README.zh-Hant.md) · 日本語

# VStudy Pro

macOS と Windows で教材を読み、Moodle の締め切りをまとめ、課題を学習計画に変えるアプリです。

![バージョン 0.4.1](https://img.shields.io/badge/version-0.4.1-blue) ![macOS and Windows](https://img.shields.io/badge/platform-macOS_%7C_Windows-black)

![グラフのノート、選択した文章、デモ回答と出典の引用](docs/assets/readme/reader.webp)

## ダウンロード

| macOS / Windows | |
| --- | --- |
| Mac（Apple シリコン） | [.dmg をダウンロード](https://github.com/ava-apple/vstudy-pro/releases/latest/download/VStudy-Pro-mac-arm64.dmg) |
| Windows x64 | [.exe をダウンロード](https://github.com/ava-apple/vstudy-pro/releases/latest/download/VStudy-Pro-win-x64.exe) |

Mac では DMG を開き、VStudy Pro を「アプリケーション」にドラッグします。

Windows では EXE を開き、画面の案内に従ってください。

Mac ではターミナルからもインストールできます。

```sh
curl -fsSL https://raw.githubusercontent.com/ava-apple/vstudy-pro/main/scripts/install/install.sh | bash
```

AI エージェントに任せる場合は、インストールガイドの[プロンプト](docs/INSTALL.ja.md#方法-3---ai-エージェントに任せる)をコピーしてください。

<!-- mac-signing-status -->
> Mac 版は Apple の Developer ID による署名と公証がまだ済んでいません。[起動手順を見る](docs/INSTALL.ja.md#macapple-シリコン)。
<!-- /mac-signing-status -->

## 主な機能

- PDF、Word、PowerPoint、Markdown などの教材を読む。
- 選択した文章について AI に質問し、引用元を確認する。
- Moodle のコース、提出期限、ファイルをまとめて確認する。
- タスク、目標、試験に合わせて日や週の学習計画を立てる。
- 複数のコース、資料、会話をタブで開いておく。
- 任意でローカル MCP 接続を有効にし、Claude Code、Codex、Antigravity に指定したコースを読ませる。
- 対応する環境で Claude や Codex CLI を接続するか、自分の API キーを使う。
- ライブラリを自分のパソコンに保存する。AI は任意で、利用分析は既定で無効。
- 英語、繁体字中国語、日本語で使う。

## 詳しい使い方

- [インストール、更新、削除](docs/INSTALL.ja.md)
- [画面ガイド、AI 設定、プライバシー](docs/GUIDE.ja.md)
- [MCP エージェントの設定](docs/MCP.md)
- [セキュリティ](docs/SECURITY.md)
- [開発ガイド](docs/ENGINEERING.md)
- [リリースノート](docs/releases/0.4.1.md)

## リポジトリの構成

`apps/desktop/` は Electron デスクトップアプリです。
`apps/mcp/` はローカルのエージェント接続を担当します。
`apps/website/` はウェブサイト、`apps/newsletter/` はニュースレター登録を担当します。
`docs/` にガイドと設計資料をまとめています。
`scripts/` に開発ツールとインストールスクリプトを置いています。
