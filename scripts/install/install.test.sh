#!/bin/bash
set -euo pipefail
root=$(cd "$(dirname "$0")" && pwd)
test_root=$(mktemp -d "${TMPDIR:-/tmp}/vstudy-install-test.XXXXXX")
trap 'rm -rf "$test_root"' EXIT
mkdir -p "$test_root/source/VStudy Pro.app/Contents" "$test_root/release"
echo first > "$test_root/source/VStudy Pro.app/Contents/marker"
hdiutil create -quiet -size 5m -fs HFS+ -volname VStudyTest -srcfolder "$test_root/source" "$test_root/release/VStudy-Pro-mac-arm64.dmg"
(cd "$test_root/release" && shasum -a 256 VStudy-Pro-mac-arm64.dmg > SHA256SUMS.txt)
export VSTUDY_RELEASE_BASE="file://$test_root/release"
bash "$root/install.sh" --dest "$test_root/dry" --dry-run
[[ ! -e "$test_root/dry" ]]
bash "$root/install.sh" --dest "$test_root/apps"
[[ $(cat "$test_root/apps/VStudy Pro.app/Contents/marker") == first ]]
echo old > "$test_root/apps/VStudy Pro.app/Contents/marker"
bash "$root/install.sh" --dest "$test_root/apps"
[[ $(cat "$test_root/apps/VStudy Pro.app/Contents/marker") == first ]]
bash "$root/install.sh" --dest "$test_root/apps" --uninstall
[[ ! -e "$test_root/apps/VStudy Pro.app" ]]
printf '%064d  VStudy-Pro-mac-arm64.dmg\n' 0 > "$test_root/release/SHA256SUMS.txt"
if bash "$root/install.sh" --dest "$test_root/bad"; then echo 'Mismatch unexpectedly succeeded'; exit 1; fi
[[ ! -e "$test_root/bad" ]]
echo '' > "$test_root/release/SHA256SUMS.txt"
if bash "$root/install.sh" --dest "$test_root/missing"; then echo 'Missing checksum unexpectedly succeeded'; exit 1; fi
[[ ! -e "$test_root/missing" ]]
echo 'PASS: real DMG install, replacement, uninstall, dry-run, mismatch and missing checksum'
