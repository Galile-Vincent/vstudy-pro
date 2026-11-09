# App updates

Signed, notarized macOS arm64 installations support in-app updates. Squirrel.Mac
checks the Developer ID signature during installation, after update-downloaded.
A completed download is not proof that Squirrel has verified it.
Windows is disabled as unsigned unless app-update.yml declares publisherName;
only x64 NSIS installations may enable updates. Unsupported builds link to the
[download page](https://vstudy.vcstudio.app/download).

The feed and SHA-512 protect transport consistency, not release authorization.
Anyone able to replace GitHub release assets controls the feed and can replay an
older correctly signed Mac build newer than the installed version. The version
comparison is not rollback protection. Recommend ed25519-signed feed files with
an explicit rollback policy as follow-up; this change does not implement them.

Downloads and installation require attached native confirmation in main. Quitting
alone never installs: automatic install on quit is disabled to preserve the guard.
Restart waits for active work and the existing before-quit coordinated shutdown.
A failed Squirrel attempt requires relaunch before another installation request,
preventing accumulation of native handlers. Prereleases such as 1.2.3-rc.1 are
excluded by the stable version regex and handled as no update, not a generic error. Restart requests hand off
to Squirrel; signature or installation failures can still occur after download.
Checks default on, unlike the default-off AI-CLI check: owner review is required.
Checks begin after onboarding and skip offline periods. Manual checks have a short
cooldown; automatic checks retain a ten-minute interval. Last checked records success.

Metadata uses github.com/ava-apple/vstudy-pro/releases/latest/download/latest-mac.yml
(or latest.yml for signed Windows). Payload names are fixed relative versioned ZIP
or EXE names. GitHub redirects can contact release-assets.githubusercontent.com,
objects.githubusercontent.com and github-releases.githubusercontent.com. No API,
account data or staging header is sent. electron-updater still writes .updaterId
locally; the provider strips that identifier from requests.

Release assembly checks metadata against payload hashes and sizes. app-update.yml
is inside packaged resources, absent from staged release assets, so its assertion
remains in packaged distribution smoke.

Real acceptance requires two signed published releases and verification of download,
Squirrel failure, coordinated shutdown, restart, retained data, and opt-out. Windows
publisher verification and NSIS replacement require a real signed Windows build.
