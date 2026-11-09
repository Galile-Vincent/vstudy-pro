English · [繁體中文](README.zh-Hant.md) · [日本語](README.ja.md)

# VStudy Pro

Read course documents, keep Moodle deadlines together, and turn coursework into a study plan on macOS and Windows.

![Version 0.4.4](https://img.shields.io/badge/version-0.4.4-blue) ![macOS and Windows](https://img.shields.io/badge/platform-macOS_%7C_Windows-black)

![Graph traversal notes with a selected passage, demo answer, and source citation](docs/assets/readme/reader.webp)

## Download

| macOS / Windows | |
| --- | --- |
| Mac (Apple silicon) | [Download .dmg](https://github.com/ava-apple/vstudy-pro/releases/latest/download/VStudy-Pro-mac-arm64.dmg) |
| Windows x64 | [Download .exe](https://github.com/ava-apple/vstudy-pro/releases/latest/download/VStudy-Pro-win-x64.exe) |

Open the DMG and drag VStudy Pro into Applications.

On Windows, open the EXE and follow the installer.

Or install on Mac from Terminal.

```sh
curl -fsSL https://raw.githubusercontent.com/ava-apple/vstudy-pro/main/scripts/install/install.sh | bash
```

Give your AI agent the [install prompt](docs/INSTALL.md#option-3---let-an-ai-agent-do-it).

<!-- mac-signing-status -->
> The Mac app is signed with an Apple Developer ID and notarized by Apple. It opens like any other Mac app. The Windows installer is not signed yet, so SmartScreen may warn on first run. [Install guide](docs/INSTALL.md#mac-apple-silicon).
<!-- /mac-signing-status -->

## What it does

- Read PDF, Word, PowerPoint, Markdown, and other course documents.
- Ask AI about a selected passage and follow source citations.
- Keep Moodle courses, deadlines, and files in one place.
- Make daily or weekly study plans with tasks, goals, and exams.
- Keep courses, documents, and chats open in separate tabs.
- Let Claude Code, Codex, or Antigravity read selected courses through an opt-in local MCP bridge.
- Connect Claude or Codex CLIs on supported systems, or use your own API keys.
- Keep your library on your computer, with optional AI and analytics off by default.
- Use English, Traditional Chinese, or Japanese.

## More details

- [Installation, updates, and removal](docs/INSTALL.md)
- [Feature guide, AI setup, and privacy](docs/GUIDE.md)
- [MCP agent setup](docs/MCP.md)
- [Security](docs/SECURITY.md)
- [Engineering](docs/ENGINEERING.md)
- [Release notes](docs/releases/0.4.4.md)

## How it is built

`apps/desktop/` contains the Electron desktop app.
`apps/mcp/` contains the local agent bridge.
`apps/website/` contains the website; `apps/newsletter/` handles newsletter signup.
`docs/` holds guides and design references.
`scripts/` holds repository and installation tools.
