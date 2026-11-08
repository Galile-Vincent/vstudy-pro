[English](INSTALL.md) · [繁體中文](INSTALL.zh-Hant.md) · [日本語](INSTALL.ja.md)

[返回 README](../README.zh-Hant.md)

# 安裝 VStudy Pro

## 目錄

- [下載與安裝](#下載與安裝)
- [Mac（Apple 晶片）](#macapple-晶片)
- [方法 1 - 下載 DMG（最簡單，不必先裝其他工具）](#方法-1---下載-dmg最簡單不必先裝其他工具)
- [方法 2 - 在終端機貼上一行指令（同樣不必先裝其他工具）](#方法-2---在終端機貼上一行指令同樣不必先裝其他工具)
- [方法 3 - 請 AI 智能體幫你安裝](#方法-3---請-ai-智能體幫你安裝)
- [Windows x64](#windows-x64)
- [更新](#更新)
- [解除安裝](#解除安裝)
- [選用步驟 - 驗證下載檔案](#選用步驟---驗證下載檔案)
- [從原始碼建置](#從原始碼建置)
- [憑證與系統需求](#憑證與系統需求)

## 下載與安裝

### Mac（Apple 晶片）

#### 方法 1 - 下載 DMG（最簡單，不必先裝其他工具）

1. [下載 .dmg 檔案](https://github.com/ava-apple/vstudy-pro/releases/latest/download/VStudy-Pro-mac-arm64.dmg)。
2. 按兩下下載好的 .dmg 檔案。
3. 在開啟的視窗中，將 VStudy Pro 拖入「應用程式」。
4. 在 Finder 退出 VStudy Pro 磁碟映像。
5. 從「應用程式」或 Launchpad 開啟 VStudy Pro。

<!-- mac-signing-status -->
> Mac 版尚未使用 Apple 開發者 ID 簽署，也尚未經 Apple 公證。只有從本專案的版本發布頁下載，且你信任本專案時，才繼續操作。 [專案版本發布頁](https://github.com/ava-apple/vstudy-pro/releases/latest)。
<!-- /mac-signing-status -->

**如果 macOS 顯示無法開啟或無法驗證開發者**

1. 先嘗試開啟 VStudy Pro 一次，再關閉警告。
2. 開啟「系統設定 > 隱私權與安全性」，向下捲動至「安全性」。
3. 按「強制打開」，依提示驗證身分，再按「打開」確認。

較舊的 macOS 可在「應用程式」中對 VStudy Pro 按右鍵，選「打開」，再按「打開」確認。 校驗碼驗證是選用步驟。 [驗證下載檔案](#選用步驟---驗證下載檔案)。 [Apple 的開啟說明](https://support.apple.com/en-us/102445)。

#### 方法 2 - 在終端機貼上一行指令（同樣不必先裝其他工具）

按 Command-Space，輸入 Terminal，再按 Return。貼上以下指令並按 Return。

```sh
curl -fsSL https://raw.githubusercontent.com/ava-apple/vstudy-pro/main/scripts/install/install.sh | bash
```

不需要 Homebrew、npm、Xcode 或 Python。指令只使用 macOS 內建工具。

- 下載最新的 DMG，並驗證 SHA-256 校驗碼。
- 關閉 VStudy Pro，安裝到「應用程式」。你的文件庫會保留。
- 只移除此 app 的隔離標記，讓它能開啟。不會使用 sudo。

[先閱讀安裝腳本](https://raw.githubusercontent.com/ava-apple/vstudy-pro/main/scripts/install/install.sh)。

#### 方法 3 - 請 AI 智能體幫你安裝

將這段提示詞複製給你的 AI 智能體。

```text
請幫我安裝 VStudy Pro。Apple 晶片 macOS 請先取得並完整閱讀 https://raw.githubusercontent.com/ava-apple/vstudy-pro/main/scripts/install/install.sh；Windows x64 請閱讀同目錄的 install.ps1。說明下載頁列出的簽署狀態，以及 Mac 腳本只會移除此 app 的隔離標記。執行已閱讀的腳本，確認 SHA-256 驗證通過，開啟 VStudy Pro，回報安裝路徑與結果。不要使用 sudo、全面停用系統防護或刪除使用者資料。驗證失敗時立即停止。
```

### Windows x64

1. [下載 EXE 安裝檔](https://github.com/ava-apple/vstudy-pro/releases/latest/download/VStudy-Pro-win-x64.exe)。
2. 按兩下下載好的 EXE，依照畫面完成安裝。只安裝到你的使用者帳號，不需要管理員權限。
3. 如果 SmartScreen 顯示警告，在有提供選項時按「其他資訊 > 仍要執行」。只有從本專案的版本發布頁下載，且你信任本專案時，才繼續。學校管理的電腦可能無法使用這個選項。

也可以從「開始」選單開啟 PowerShell，貼上以下指令。指令會先下載並顯示腳本內容，再執行安裝。

```powershell
Invoke-WebRequest https://raw.githubusercontent.com/ava-apple/vstudy-pro/main/scripts/install/install.ps1 -OutFile install.ps1
Get-Content install.ps1
& .\install.ps1
```

Intel Mac 與 Windows ARM64 安裝檔仍在規劃中。目前沒有 Linux 安裝檔。

### 更新

先關閉 VStudy Pro。下載新版 DMG，將 VStudy Pro 拖入「應用程式」並選「取代」，或重跑終端機的一行指令。Windows 可執行新版 EXE 或重跑 PowerShell 指令。你的文件庫與讀書計畫會保留。更新前也可以先到「設定 > 儲存空間」匯出備份。

### 解除安裝

Mac 請先關閉 VStudy Pro，再從「應用程式」拖到「垃圾桶」。Windows 請到「設定 > 應用程式 > 已安裝的應用程式」解除安裝。只移除 app 會保留文件庫。若也想刪除資料，請先開啟 VStudy Pro，到「設定 > 隱私權 > 刪除所有資料」操作。

### 選用步驟 - 驗證下載檔案

從同一個版本下載 SHA256SUMS.txt。在終端機或 PowerShell 切換到「下載項目」資料夾，執行對應系統的指令，再與檔案中的完整校驗碼比對。校驗碼相符代表檔案內容一致，不能證明發布者身分。

[SHA256SUMS.txt](https://github.com/ava-apple/vstudy-pro/releases/latest/download/SHA256SUMS.txt)

```sh
cd ~/Downloads
shasum -a 256 VStudy-Pro-mac-arm64.dmg
```

```powershell
cd $HOME\Downloads
Get-FileHash -Algorithm SHA256 .\VStudy-Pro-win-x64.exe
```

[專案版本發布頁](https://github.com/ava-apple/vstudy-pro/releases/latest) · [驗證下載檔案](https://vstudy.vcstudio.app/zh-Hant/download/#verify-download)

### 從原始碼建置

使用 macOS 或 Windows、`.node-version` 指定的 **Node 24.19.0**，以及 `package.json` 指定的 **pnpm 10.28.2**。套件引擎允許 Node >=24.15.0。以下指令從公開儲存庫的根目錄執行。

```sh
git clone https://github.com/ava-apple/vstudy-pro.git
cd vstudy-pro
pnpm install --frozen-lockfile
pnpm build
```

`pnpm build` 編譯 app。各架構安裝檔請依[不發布的試跑流程](ENGINEERING.md#prepare-a-release)產生並驗證，憑證設定見[簽署指南](SIGNING.md)。Mac 本機建置不能證明 Windows 可用。

文件轉換需要時，請另行安裝 **uv** 或 **Python 3.10+**。首次轉換會先徵求同意，才從 PyPI 下載以雜湊鎖定的套件；uv 也可能從 GitHub 下載 Python。「**設定 > 隱私權**」提供重試與持續生效的離線模式。Markdown 與文字檔不需要 Python。macOS 額外以系統沙箱禁止轉換器連網；Windows 目前沒有對等的核心層網路封鎖，離線模式與 Python socket 攔截不構成作業系統安全邊界。

## 憑證與系統需求

Apple 晶片需要 macOS 14 以上。Windows x64 需要 Windows 10 以上。

App **不會加密磁碟上的文件、Markdown 與聊天記錄**。儲存的機密資料透過 Mac 鑰匙圈或 Windows DPAPI 加密，本次執行的資料保留在 Main 記憶體。請用系統帳號權限與 FileVault 或 BitLocker 等磁碟加密保護檔案。可攜式備份不含憑證，但仍包含私人學習資料。

「**設定 > 隱私權**」列出本次執行中有數量上限的 app 主動請求與 CLI 啟動記錄，包含 AI 工具版本資料檢查與下載。背景版本檢查須另外同意。這不是封包擷取，無法列出 CLI 或 Chromium 內部的每一個請求，目前也無法得知傳輸位元組數。開啟外部瀏覽器或郵件連結前會要求確認。處理敏感資料前請閱讀[安全模型](SECURITY.md)。

safeStorage 透過 Mac 鑰匙圈或 Windows DPAPI 加密儲存的憑證。從未簽署的 Mac 版本更新後，鑰匙圈可能再次要求授權。確認是你信任的 app 後，選擇「永遠允許」。[儲存說明](STORAGE.md)。
