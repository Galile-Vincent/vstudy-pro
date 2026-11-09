# App updates

The first release containing this service can update itself. v0.4.4 and older
installations have no updater code: download and install the new release once
from https://vstudy.vcstudio.app/download. Existing local data is retained.

Supported installations are signed, notarized macOS arm64 applications and the
Windows x64 NSIS installer. Windows installers are currently unsigned. Intel Mac
has no published build. Development, unsigned Mac, Windows ZIP/portable and Linux
builds offer the download page instead. Main checks the Mac Developer ID signature
and the Windows app-update.yml plus NSIS uninstaller before enabling updates.

Checks start 15 seconds after launch, repeat every six hours, skip offline periods,
and share a ten-minute minimum interval with Check now. Settings > General has
Check for updates automatically (on by default), current version, last check time,
and Check now. The timestamp is session-only; the automatic preference persists
in the existing settings record and defaults on for old records.

A check GETs only the fixed metadata file `latest-mac.yml` or `latest.yml` under
`https://github.com/ava-apple/vstudy-pro/releases/latest/download`. There is no
identifier, document, account data, credential, request body, or staging-ID header.
GitHub can see ordinary connection information such as the IP address and may
redirect to its release CDN. No GitHub API or release-notes fetch is needed.
The provider adapter removes electron-updater's staging header and cache query.

Downloads require clicking Update available in the sidebar. That action fetches
the release ZIP on Mac or EXE on Windows (including GitHub/CDN redirects), checks
the feed's SHA-512, and on Mac verifies the update's signature. Differential and
web installers are disabled. Restart to update installs the downloaded release;
after download consent, quitting also installs a ready update. No downgrade or
prerelease is allowed. Error UI exposes only offline/network/integrity/failed codes.
What's new opens a main-built versioned release link through the existing external
link confirmation. The renderer cannot choose the updater's URL.

The main bundle includes electron-updater and its JavaScript dependencies:
electron-vite has externalizeDeps=false, and electron-builder includes out/**/* in
app.asar. Only node-pty is externalized. Distribution smoke asserts the fixed
resources/app-update.yml feed; release assembly requires metadata, matching payload,
ZIP archive and payload blockmap. Mac uses ZIP blockmaps; NSIS uses EXE blockmaps,
not ZIP blockmaps. Release assembly also checks the metadata references the payload.

## Manual acceptance with two releases

1. Publish signed/notarized v0.4.5 with this code and the metadata/payload/blockmaps.
2. Install v0.4.5 on Apple silicon Mac and Windows x64 using NSIS; launch it.
3. Publish v0.4.6. After the minimum check interval, use Check now or wait for the
   scheduled check. Confirm Update available - v0.4.6 and the correct What's new URL.
4. Click Update available. Confirm progress and Restart to update, restart, and
   verify v0.4.6, local library/settings preservation, and an empty update row.
5. Repeat with quit after a completed download. Verify no download occurs before
   consent, automatic opt-out persists across relaunch, offline checks send nothing,
   and repeated checks respect ten minutes. Test interrupted download and retry.
6. Check unsigned Mac, Windows ZIP and Linux show a quiet download-page fallback.
   Check keyboard focus, screen reader announcements, High contrast, forced colors,
   reduced motion, RTL, 150% scale, and English/Traditional Chinese/Japanese.

CI fakes cannot prove signed replacement, Gatekeeper, NSIS replacement, restart,
or GitHub/CDN delivery. A real update requires these two published releases.

## Renderer fixtures

Run the renderer with its existing dev mock and query `?updateState=idle` (or
`checking`, `available`, `downloading`, `ready`, `error`, `unsupported`). These
fixtures bypass onboarding and use version 0.4.5 and 42% progress.
`&updateCollapsed=1` exercises the footer's collapsed icon variant; the current
shell hides its sidebar instead of providing an icon rail. Production ignores this
flag. Settings opens through the profile gear. Mock actions change the state in
memory and never request a network update or restart.
