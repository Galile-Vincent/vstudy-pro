#!/bin/bash
set -euo pipefail
root=$(cd "$(dirname "$0")" && pwd)
test_root=$(mktemp -d "${TMPDIR:-/tmp}/vstudy-install-test.XXXXXX")
trap 'rm -rf "$test_root"' EXIT
mkdir -p "$test_root/source/VStudy Pro.app/Contents" "$test_root/release"
echo first > "$test_root/source/VStudy Pro.app/Contents/marker"
hdiutil create -quiet -size 5m -fs HFS+ -volname VStudyTest -srcfolder "$test_root/source" "$test_root/release/VStudy-Pro-mac-arm64.dmg"
(cd "$test_root/release" && shasum -a 256 VStudy-Pro-mac-arm64.dmg > SHA256SUMS.txt)
mkdir "$test_root/bin"
cat > "$test_root/bin/codesign" <<'SH'
#!/bin/bash
if [[ "$1" == -dv ]]; then
  printf 'Authority=Developer ID Application: Test Publisher (TESTTEAM)\nTeamIdentifier=TESTTEAM\n' >&2
else
  exit "${TEST_SIGNATURE_EXIT:-0}"
fi
SH
cat > "$test_root/bin/spctl" <<'SH'
#!/bin/bash
echo 'accepted' >&2
echo 'source=Notarized Developer ID' >&2
exit "${TEST_ASSESSMENT_EXIT:-0}"
SH
cat > "$test_root/bin/xattr" <<'SH'
#!/bin/bash
printf '%s\n' "$*" >> "$TEST_QUARANTINE_LOG"
SH
cat > "$test_root/bin/osascript" <<'SH'
#!/bin/bash
exit 0
SH
cat > "$test_root/bin/pgrep" <<'SH'
#!/bin/bash
exit 1
SH
chmod +x "$test_root/bin/"*
export PATH="$test_root/bin:$PATH"
export TEST_QUARANTINE_LOG="$test_root/quarantine.log"
sed 's|/usr/sbin/spctl|spctl|' "$root/install.sh" > "$test_root/install.sh"
installer="$test_root/install.sh"
export VSTUDY_RELEASE_BASE="file://$test_root/release"
bash "$installer" --dest "$test_root/dry" --dry-run
[[ ! -e "$test_root/dry" ]]
bash "$installer" --dest "$test_root/apps" > "$test_root/signed.log"
grep -q "Verified: signed by Developer ID Application: Test Publisher (TESTTEAM) (TESTTEAM) and notarized by Apple" "$test_root/signed.log"
[[ $(cat "$test_root/apps/VStudy Pro.app/Contents/marker") == first ]]
[[ ! -e "$TEST_QUARANTINE_LOG" ]]
echo preserved > "$test_root/apps/VStudy Pro.app/Contents/marker"
export TEST_ASSESSMENT_EXIT=1 TEST_SIGNATURE_EXIT=1
bash "$installer" --dest "$test_root/legacy" --version 0.3.0 > "$test_root/legacy.log"
[[ $(cat "$test_root/legacy/VStudy Pro.app/Contents/marker") == first ]]
grep -q 'Legacy unsigned' "$test_root/legacy.log"
grep -q "$test_root/legacy/VStudy Pro.app" "$TEST_QUARANTINE_LOG"
if bash "$installer" --dest "$test_root/apps" --version 0.4.4; then echo 'Rejected modern app unexpectedly succeeded'; exit 1; fi
[[ $(cat "$test_root/apps/VStudy Pro.app/Contents/marker") == preserved ]]
unset TEST_ASSESSMENT_EXIT
if bash "$installer" --dest "$test_root/invalid-signature" --version 0.4.4; then echo 'Invalid signature unexpectedly succeeded'; exit 1; fi
[[ ! -e "$test_root/invalid-signature/VStudy Pro.app" ]]
unset TEST_SIGNATURE_EXIT
rm "$TEST_QUARANTINE_LOG"
echo old > "$test_root/apps/VStudy Pro.app/Contents/marker"
bash "$installer" --dest "$test_root/apps"
[[ $(cat "$test_root/apps/VStudy Pro.app/Contents/marker") == first ]]
bash "$installer" --dest "$test_root/apps" --uninstall
[[ ! -e "$test_root/apps/VStudy Pro.app" ]]
printf '%064d  VStudy-Pro-mac-arm64.dmg\n' 0 > "$test_root/release/SHA256SUMS.txt"
if bash "$installer" --dest "$test_root/bad"; then echo 'Mismatch unexpectedly succeeded'; exit 1; fi
[[ ! -e "$test_root/bad" ]]
echo '' > "$test_root/release/SHA256SUMS.txt"
if bash "$installer" --dest "$test_root/missing"; then echo 'Missing checksum unexpectedly succeeded'; exit 1; fi
[[ ! -e "$test_root/missing" ]]
[[ ! -e "$TEST_QUARANTINE_LOG" ]]
echo 'PASS: signed accepted without quarantine removal, legacy unsigned, modern rejection with rollback, real DMG install, replacement, uninstall, dry-run, mismatch and missing checksum'
