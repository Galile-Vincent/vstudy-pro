# Deletion round 3

Chromium allowlist: `CHROMIUM_HELD_ENTRIES` in delete-data.ts.
Local Electron profile listing inspected on this Mac (names only): Cache,
Code Cache, DIPS, DawnGraphiteCache, DawnWebGPUCache, GPUCache, Local Storage,
Network Persistent State, Preferences, Session Storage, Shared Dictionary,
Trust Tokens, Trust Tokens-journal, blob_storage.
Only Preferences from that listing is retained: Chromium rewrites it while running.
Other caches are removed eagerly; locked entries are retried at startup.
Network is retained for Chromium network service handles on Windows.
Local State and singleton/lock files protect the active Chromium instance.
The marker lives beside userData, contains no deletion path, and is never used
as a source of paths.

References:
- https://chromium.googlesource.com/chromium/src/+/HEAD/docs/user_data_dir.md
- https://github.com/chromium/chromium/blob/main/chrome/browser/prefs/README.md
- https://chromium.googlesource.com/chromium/src/+/HEAD/chrome/browser/process_singleton_posix.cc
- https://www.electronjs.org/docs/latest/api/session

Item 1: regression failed (backup survived), then passed with inverted coverage.
