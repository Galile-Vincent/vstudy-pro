# Windows bridge host

`windows-pipe.ps1` runs through the system Windows PowerShell executable with
`-NoProfile`, a scrubbed environment, and a process-local execution policy. It
requires Windows PowerShell 5.1 and the included .NET Framework on supported
Windows installations. It compiles its fixed C# source in memory. It does not
change the machine execution policy or require elevation.

The host creates the local named pipe with a protected DACL that grants access
only to the current Windows user SID. It explicitly denies Network SID access
and uses `PIPE_REJECT_REMOTE_CLIENTS`. The first instance also requires
`FILE_FLAG_FIRST_PIPE_INSTANCE`, so startup fails if another process owns the
name. It checks the kernel's owner and access rules after creation. Each client
SID is checked through impersonation before bytes reach the JSON frame parser.

The parent passes `vstudy-<32 hex>` derived from the current SID. The helper
returns `ready:<SID>:<base64 SDDL>`, followed by `open:<32 hex connection ID>`,
`data:<ID>:<base64 bytes>`, and `close:<ID>` on stdout. Parent stdin accepts
`<ID>:<base64 bytes>` or `<ID>:-` to disconnect. IDs are helper-generated.
Messages between the local client and the helper remain the MCP stream's four-byte
big-endian length plus bounded UTF-8 JSON. The helper does not interpret JSON.

Chunks are limited to 64 KiB. There are at most 31 connected peers plus one
listener. Per-peer output queues, idle timers, and the main-process request
limits bound stalled clients. EOF on parent stdin stops the helper and closes
all pipe handles. No pipe data belongs in stderr or diagnostic logs.

The Windows-only `src/main/platform/windows-pipe.test.ts` runs the actual helper,
checks its ACL descriptor, performs a same-user round-trip, and verifies that a
second host cannot take the same name. A second local user requires a provisioned
account and credentials that the normal CI test does not have. Inspecting the
protected DACL is evidence of its rules, not a claim of testing another user's
logon. Administrators and code running as the same user remain outside this
isolation boundary.

[Microsoft's named pipe security reference](https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipe-security-and-access-rights)
describes why a default named-pipe DACL is too broad. The implementation never
uses a default DACL or a permissive Node `net.listen` server.
