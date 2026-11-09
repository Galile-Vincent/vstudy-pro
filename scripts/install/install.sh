#!/bin/bash
# Install VStudy Pro on Apple silicon macOS.
set -euo pipefail

dest=/Applications
version=${VSTUDY_VERSION:-}
launch=false
uninstall=false
dry_run=false
fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }
while (($#)); do
  case "$1" in
    --dest|--version)
      (($# >= 2)) || fail "$1 requires a value"
      [[ -n "$2" ]] || fail "$1 requires a value"
      if [[ "$1" == --dest ]]; then dest=$2; else version=$2; fi
      shift 2 ;;
    --open) launch=true; shift ;;
    --uninstall) uninstall=true; shift ;;
    --dry-run) dry_run=true; shift ;;
    --help)
      echo 'Install VStudy Pro on Apple silicon macOS.'
      echo 'Usage: bash install.sh [--dest DIR] [--version X] [--open] [--uninstall] [--dry-run]'
      echo 'Default destination: /Applications. No sudo. Use --dest ~/Applications if needed.'
      echo 'VSTUDY_VERSION pins a release. VSTUDY_RELEASE_BASE overrides the asset directory for tests only.'
      exit 0 ;;
    *) fail "Unknown option: $1" ;;
  esac
done
[[ $(uname -s) == Darwin ]] || fail 'macOS only. Windows: https://github.com/ava-apple/vstudy-pro/releases/latest/download/VStudy-Pro-win-x64.exe'
[[ $(uname -m) == arm64 ]] || fail 'Intel Mac installer not released yet. Apple silicon is required.'
[[ "$dest" == /* ]] || fail '--dest must be an absolute directory (use --dest ~/Applications).'
[[ -z "$version" || "$version" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+([.-][a-zA-Z0-9.-]+)?$ ]] || fail 'Invalid version'
app="$dest/VStudy Pro.app"
echo "Destination: $app"
if $dry_run; then
  echo "Dry run: would quit VStudy Pro and $($uninstall && echo remove || echo verify-and-install) the app. No downloads or changes."
  exit 0
fi
parent=$dest
while [[ ! -e "$parent" ]]; do parent=$(dirname "$parent"); done
[[ -d "$parent" && -w "$parent" ]] || fail 'Destination is not writable. No sudo is used. Try --dest ~/Applications'
[[ ! -L "$app" ]] || fail 'Refusing to replace a symlink at the app destination'
work=''
stage=''
backup=''
mounted=false
cleanup() {
  if [[ -n "$work" ]]; then
    if $mounted; then
      hdiutil detach "$work/mount" || hdiutil detach -force "$work/mount" || return
    fi
    rm -rf "$work"
  fi
  [[ -z "$stage" ]] || rm -rf "$stage"
  if [[ -n "$backup" && -e "$backup/VStudy Pro.app" && ! -e "$app" ]]; then mv "$backup/VStudy Pro.app" "$app"; fi
  [[ -z "$backup" ]] || rm -rf "$backup"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
if ! $uninstall; then
  work=$(mktemp -d "${TMPDIR:-/tmp}/vstudy-install.XXXXXX")
  echo 'Resolving release'
  if [[ -n ${VSTUDY_RELEASE_BASE:-} ]]; then
    base=${VSTUDY_RELEASE_BASE%/}
  else
    if [[ -z "$version" ]]; then
      release=$(curl -fsSL -o /dev/null -w '%{url_effective}' https://github.com/ava-apple/vstudy-pro/releases/latest)
      version=${release##*/}
      [[ "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([.-][a-zA-Z0-9.-]+)?$ ]] || fail 'Cannot resolve latest release'
    fi
    base="https://github.com/ava-apple/vstudy-pro/releases/download/v${version#v}"
  fi
  echo "Downloading checksums from $base"
  curl -fsSL "$base/SHA256SUMS.txt" -o "$work/SHA256SUMS.txt"
  asset=VStudy-Pro-mac-arm64.dmg
  echo "Downloading $asset"
  if ! curl -fsSL "$base/$asset" -o "$work/app.dmg"; then
    [[ -n "$version" ]] || fail 'Stable asset missing and no version supplied'
    asset="VStudy-Pro-${version#v}-mac-arm64.dmg"
    echo "Downloading $asset"
    curl -fsSL "$base/$asset" -o "$work/app.dmg"
  fi
  expected=$(awk -v file="$asset" '$2 == file || $2 == "*" file {print $1}' "$work/SHA256SUMS.txt")
  [[ "$expected" =~ ^[a-fA-F0-9]{64}$ ]] || fail 'Missing, duplicate, or invalid checksum entry'
  actual=$(shasum -a 256 "$work/app.dmg" | awk '{print $1}')
  [[ $(printf '%s' "$expected" | tr 'A-F' 'a-f') == "$actual" ]] || fail 'SHA-256 mismatch. Nothing installed.'
  echo "SHA-256 verified: $actual ($asset)"
  echo 'Mounting read-only'
  mkdir "$work/mount"
  hdiutil attach -nobrowse -readonly -noverify -noautoopen -mountpoint "$work/mount" "$work/app.dmg"
  mounted=true
  [[ -d "$work/mount/VStudy Pro.app/Contents" && ! -L "$work/mount/VStudy Pro.app" ]] || fail 'DMG does not contain VStudy Pro.app'
  mkdir -p "$dest"
  stage=$(mktemp -d "$dest/.vstudy-install.XXXXXX")
  echo 'Copying app with ditto'
  ditto "$work/mount/VStudy Pro.app" "$stage/VStudy Pro.app"
fi
echo 'Requesting VStudy Pro to quit politely'
osascript -e 'if application id "com.vstudy.pro" is running then tell application id "com.vstudy.pro" to quit'
for ((i=0; i<30; i++)); do
  if ! pgrep -x 'VStudy Pro' >/dev/null; then break; fi
  sleep 1
done
if pgrep -x 'VStudy Pro' >/dev/null; then fail 'VStudy Pro is still running. Quit it and retry.'; fi
if $uninstall; then
  echo "Removing only $app"
  rm -rf "$app"
  echo 'User data retained. Before uninstalling, use Settings > Privacy > Delete all data to delete app data.'
  exit 0
fi
if [[ -e "$app" ]]; then
  backup=$(mktemp -d "$dest/.vstudy-backup.XXXXXX")
  mv "$app" "$backup/VStudy Pro.app"
fi
echo 'Moving verified app into place'
mv "$stage/VStudy Pro.app" "$app"
signature_valid=false
if codesign --verify --deep --strict "$app"; then signature_valid=true; fi
if assessment=$(/usr/sbin/spctl -a -t exec -vv "$app" 2>&1) && $signature_valid && [[ "$assessment" == *"source=Notarized Developer ID"* ]]; then
  identity=$(codesign -dv --verbose=2 "$app" 2>&1)
  authority=$(printf '%s\n' "$identity" | sed -n 's/^Authority=//p' | head -n 1)
  team=$(printf '%s\n' "$identity" | sed -n 's/^TeamIdentifier=//p')
  echo "Verified: signed by $authority ($team) and notarized by Apple"
else
  case "${version#v}" in
    0.[0-2].*|0.3.0)
      echo 'Legacy unsigned Mac build (v0.3.0 or earlier). Removing quarantine from this app only.'
      xattr -dr com.apple.quarantine "$app" ;;
    *)
      rm -rf "$app"
      fail 'Signature or notarization verification failed. Previous app restored if present.' ;;
  esac
fi
echo "Installed $app. Re-run this script to update."
if $launch; then echo 'Opening VStudy Pro'; open "$app"; fi
