# frozen_string_literal: true

cask "vstudy-pro" do
  version "0.3.0"
  sha256 "e981578a43522926e82baa57fdc4e882ad481f1b84fd0f914683eec87925693e"

  url "https://github.com/ava-apple/vstudy-pro/releases/download/v#{version}/VStudy-Pro-#{version}-mac-arm64.dmg"
  name "VStudy Pro"
  desc "Document reading and grounded AI chat"
  homepage "https://github.com/ava-apple/vstudy-pro"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on arch: :arm64
  depends_on macos: ">= :monterey"

  app "VStudy Pro.app"

  postflight_steps do
    run "/usr/bin/xattr",
        args: ["-dr", "com.apple.quarantine", "{{appdir}}/VStudy Pro.app"]
  end

  zap trash: [
    "~/Library/Application Support/@vstudy/desktop",
    "~/Library/Preferences/com.vstudy.pro.plist",
  ]
end
