[English](INSTALL.md) · [繁體中文](INSTALL.zh-Hant.md) · [日本語](INSTALL.ja.md)

[Back to README](../README.md)

# Install VStudy Pro

## Contents

- [Download and install](#download-and-install)
- [Mac (Apple silicon)](#mac-apple-silicon)
- [Option 1 - Download the DMG (easiest, nothing else needed)](#option-1---download-the-dmg-easiest-nothing-else-needed)
- [Option 2 - One line in Terminal (also needs nothing installed)](#option-2---one-line-in-terminal-also-needs-nothing-installed)
- [Option 3 - Let an AI agent do it](#option-3---let-an-ai-agent-do-it)
- [Windows x64](#windows-x64)
- [Update](#update)
- [Uninstall](#uninstall)
- [Optional - Verify your download](#optional---verify-your-download)
- [Build from source](#build-from-source)
- [Credentials and requirements](#credentials-and-requirements)

## Download and install

### Mac (Apple silicon)

#### Option 1 - Download the DMG (easiest, nothing else needed)

1. [Download the .dmg](https://github.com/ava-apple/vstudy-pro/releases/latest/download/VStudy-Pro-mac-arm64.dmg).
2. Double-click the downloaded .dmg file.
3. Drag VStudy Pro into Applications in the window that opens.
4. Eject the VStudy Pro disk image in Finder.
5. Open VStudy Pro from Applications or Launchpad.

<!-- mac-signing-status -->
> The Mac app is not yet signed with an Apple Developer ID or notarized by Apple. Proceed only if you downloaded it from this project’s releases page and trust the project. [Project releases](https://github.com/ava-apple/vstudy-pro/releases/latest).
<!-- /mac-signing-status -->

**If macOS says it cannot open the app or verify the developer**

1. Try to open VStudy Pro once, then dismiss the warning.
2. Open System Settings > Privacy & Security. Scroll down to Security.
3. Click Open Anyway, authenticate if asked, then confirm with Open.

On older macOS versions, right-click VStudy Pro in Applications, choose Open, then confirm with Open. Checking the checksum is optional. [Verify your download](#optional---verify-your-download). [Apple’s opening instructions](https://support.apple.com/en-us/102445).

#### Option 2 - One line in Terminal (also needs nothing installed)

Press Command-Space, type Terminal, then press Return. Paste this line and press Return.

```sh
curl -fsSL https://raw.githubusercontent.com/ava-apple/vstudy-pro/main/scripts/install/install.sh | bash
```

No Homebrew, npm, Xcode, or Python needed. The command uses only tools built into macOS.

- Downloads the latest DMG and checks its SHA-256 checksum.
- Closes VStudy Pro and installs it in Applications. Your library stays.
- Removes the quarantine flag only from this app so it can open. It never uses sudo.

[Read the script first](https://raw.githubusercontent.com/ava-apple/vstudy-pro/main/scripts/install/install.sh).

#### Option 3 - Let an AI agent do it

Copy this prompt into your AI agent.

```text
Install VStudy Pro for me. First fetch and READ https://raw.githubusercontent.com/ava-apple/vstudy-pro/main/scripts/install/install.sh on Apple silicon macOS, or install.ps1 in the same directory on Windows x64. Explain the signing status described on the download page and that the Mac script removes quarantine only from this app. Run the reviewed script, confirm SHA-256 verification passed, open VStudy Pro, and report the installed path and result. Do not use sudo, disable system protections globally, or delete user data. Stop on any verification failure.
```

### Windows x64

1. [Download the EXE](https://github.com/ava-apple/vstudy-pro/releases/latest/download/VStudy-Pro-win-x64.exe).
2. Double-click the downloaded EXE and follow the installer. It installs for your user without administrator access.
3. If SmartScreen warns, choose More info > Run anyway if offered. Continue only if the file came from this project’s releases page and you trust it. A school-managed computer may block this option.

Or open PowerShell from the Start menu. Paste this command to download and display the script before it runs.

```powershell
Invoke-WebRequest https://raw.githubusercontent.com/ava-apple/vstudy-pro/main/scripts/install/install.ps1 -OutFile install.ps1
Get-Content install.ps1
& .\install.ps1
```

Intel Mac and Windows ARM64 installers are planned. No Linux installer yet.

### Update

Quit VStudy Pro. Download the new DMG and drag VStudy Pro into Applications, choosing Replace. Or re-run the Terminal one-liner. On Windows, run the new EXE or re-run the PowerShell command. Your library and plans stay. You can export a backup in Settings > Storage first.

### Uninstall

On Mac, quit VStudy Pro and drag it from Applications to Trash. On Windows, use Settings > Apps > Installed apps. Removing the app keeps your library. If you also want to delete your data, first open VStudy Pro and use Settings > Privacy > Delete all data.

### Optional - Verify your download

Download SHA256SUMS.txt from the same release. In Terminal or PowerShell, open your Downloads folder and run the command for your system. Compare the entire result with the entry for your file. A matching checksum detects changed bytes. It does not identify the publisher.

[SHA256SUMS.txt](https://github.com/ava-apple/vstudy-pro/releases/latest/download/SHA256SUMS.txt)

```sh
cd ~/Downloads
shasum -a 256 VStudy-Pro-mac-arm64.dmg
```

```powershell
cd $HOME\Downloads
Get-FileHash -Algorithm SHA256 .\VStudy-Pro-win-x64.exe
```

[Project releases](https://github.com/ava-apple/vstudy-pro/releases/latest) · [Verify your download](https://vstudy.vcstudio.app/en/download/#verify-download)

### Build from source

Use macOS or Windows, Node **24.19.0** from `.node-version`, and **pnpm 10.28.2** from `package.json`. The package engine permits Node >=24.15.0. Run from the public repository's root.

```sh
git clone https://github.com/ava-apple/vstudy-pro.git
cd vstudy-pro
pnpm install --frozen-lockfile
pnpm build
```

`pnpm build` compiles the app. Use [the nonpublishing release procedure](ENGINEERING.md#prepare-a-release) to produce and verify installers for each architecture. See [signing setup](SIGNING.md) for credentials. A local Mac build does not verify Windows.

Install **uv** or **Python 3.10+** separately when document conversion requires it. First conversion asks permission before downloading hash-locked packages from PyPI. uv may also download Python from GitHub. **Settings > Privacy** offers retry and a persistent offline mode. Markdown and text need no Python setup. macOS additionally denies converter network access with an OS sandbox. Windows currently has no equivalent kernel-enforced network denial; offline mode and Python socket interception are not an OS security boundary.

## Credentials and requirements

Apple silicon needs macOS 14 or later. Windows x64 needs Windows 10 or later.

Documents, Markdown, and chats are **not encrypted at rest** by the app. Saved secrets use Mac Keychain-backed encryption or Windows DPAPI. Session-only secrets remain in main-process memory. Protect local files with OS account access and disk encryption such as FileVault or BitLocker. Portable backups exclude credentials but contain private study content.

**Settings > Privacy** lists bounded, session-only app-initiated requests and CLI launches, including AI tool metadata checks and downloads. Background AI tool checks are a separate opt-in. The inventory is not a packet capture and cannot enumerate every request inside a CLI or Chromium; byte counts are unknown. External browser and mail links require confirmation. Read the [security model](SECURITY.md) before using sensitive material.

safeStorage encrypts saved credentials with Mac Keychain or Windows DPAPI. After an update from an unsigned Mac build, Keychain may ask for access again. Choose Always Allow for the app you trust. [Storage details](STORAGE.md).
