# Native platform boundaries

`paths.ts` separates native containment from portable archive names. Native checks
use Windows drive, UNC, and case rules when appropriate. Portable names reject
Windows device names and ambiguous archive entries even when imported on Mac.
Filesystem boundaries still resolve real paths and reject unsafe links.

`process.ts` owns fixed executable search directories, Windows system tools,
converter interpreter selection, and process termination. Provider processes do
not inherit arbitrary PATH entries or start through shell wrappers. Only Mac wraps
conversion with `sandbox-exec`. Windows ARM64 uses Windows 11 x64 emulation for
the converter's supported dependency wheels.

`windows-pipe.test.ts` executes the real packaged PowerShell pipe host on Windows.
It checks a protected current-SID ACL, network-client denial, byte round-trips,
exclusive name ownership, and connection-limit survival. Other systems skip this
kernel test. A second local user's rejection needs a separate ordinary account;
an administrator can bypass ordinary account isolation and is outside this claim.

Browser chrome, platform keyboard labels, and native menus use the shared
platform helper. Mac vibrancy remains guarded in `main/theme.ts`. Windows saved
keys use Electron's DPAPI backend with the existing explicit lazy unlock flow.
