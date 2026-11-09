# frozen_string_literal: true

cask "vstudy-pro" do
  version "0.4.4"
  sha256 "5d18dce4f8244b9771c0e28c0f60d6bed09e74dd8080c22b7b647bdc3e5b53a6"

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

  zap trash: [
    "~/Library/Application Support/@vstudy/desktop",
    "~/Library/Preferences/com.vstudy.pro.plist",
  ]
end
