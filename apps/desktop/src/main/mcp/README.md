# Main MCP security and Unix bridge

This subsystem lets a global agent read granted accounts and propose actions through VStudy's existing session. School credentials stay in main. The fixed contracts are in `../../shared/mcp.ts`. Backend implementations, renderer IPC registration, and application lifecycle belong to the parent integration.

## Factories and exports

`engine.ts` exports `createMcpEngine(options): McpEngine`, `McpEngine`, and `McpEngineOptions`. The factory is synchronous and loads private state. `options` has these fields.

| Field | Type and behavior |
| --- | --- |
| `userData` | Existing app-owned directory. State lives in its `mcp` child. |
| `backend` | The fixed shared `McpBackend`. |
| `secretValues` | Optional `() => readonly string[]` of known school secrets. Called only in main at outward boundaries. Never send its return value to the renderer. |
| `onChange` | Optional `() => void` for state notifications and restoring the app for consent. |
| `now` | Optional millisecond clock for tests. |
| `limits` | Optional test overrides for `maxActive`, `maxPerGrant`, `spacingMs`, `jitterMs`, and `callTimeoutMs`. Production defaults are below. |

The engine methods are synchronous except `handleRequest`.

| Method | Arguments and return value |
| --- | --- |
| `state()` | Returns a fresh shared `AgentsState`, with no bearer or hash. |
| `setEnabled(enabled)` | A boolean. Returns `void`. |
| `revoke(grantId)` | A grant UUID. Returns `void`. |
| `editGrant(request)` | Exact `mcp:edit-grant` request. Returns `void`. Cancels pending calls for that grant. |
| `decidePairing(request)` | Exact `mcp:pair-decision` request. Returns `void`. Trusted renderer only. |
| `decideProposal(request)` | Exact `mcp:proposal-decision` request. Returns `void`. Trusted renderer only. |
| `handleRequest(request, connectionId)` | Shared `BridgeRequest` and bridge-generated connection identity. Returns `Promise<BridgeResponse>`. |
| `disconnect(connectionId)` | Cancels that connection's pairing and calls. Returns `void`. |
| `dispose()` | Idempotent cancellation. Returns `void`. Preserves saved enabled state and grants for restart. |

`bridge.ts` exports `createUnixBridge(options): Promise<UnixBridge>`, `UnixBridgeOptions`, and `UnixBridge`. The returned object has `socketPath: string` and idempotent `dispose(): Promise<void>`.

Required bridge options are `userData`, absolute `peerHelper`, `handleRequest`, and `onDisconnect`. `verifyPeer` is an optional verifier injection for tests. Optional bound overrides are `idleMs`, `requestTimeoutMs`, `maxConnections`, `maxPerConnection`, and `maxActive`. Always use the native verifier in production.

`errors.ts` exports `McpFailure`, `failureCode`, and `publicFailure`. Backends can throw `new McpFailure('UNSUPPORTED')` or their own error with a readonly `code: McpErrorCode`. The engine validates `error.code` with the shared `errorCodeSchema`. It preserves recognized codes and returns fixed application messages and hints. It never copies `error.message`, `error.hint`, stack traces, or school diagnostics. Unknown codes become `INTERNAL`. The backend owns Moodle-specific error mapping.

`capabilities.ts` exports `capabilityMatrix(functions: readonly string[] | undefined): Capability[]`. It derives required functions from the fixed tool registry. Unknown site functions fail closed for tools requiring remote functions. Cached-only tools remain available. The backend checks this matrix before performing remote operations.

## Main integration

```ts
import { createMcpEngine } from './mcp/engine';
import { createUnixBridge } from './mcp/bridge';

const engine = createMcpEngine({
	userData,
	backend,
	secretValues: () => knownSchoolSecretsInMain(),
	onChange: () => notifyAgentsStateChanged(),
});
const bridge = await createUnixBridge({
	userData,
	peerHelper: absolutePackagedHelperPath,
	handleRequest: (request, connectionId) => engine.handleRequest(request, connectionId),
	onDisconnect: connectionId => engine.disconnect(connectionId),
});
```

Register renderer methods only through the app's existing sender-validated, schema-validated IPC. Adapt successful `void` mutations to `{ok: true}` for the shared IPC acknowledgements. Consent must come from the trusted app main frame. No bridge approval method exists. During shutdown, call `engine.dispose()` and then await `bridge.dispose()` before closing backend storage.

Build the helper from the repository root with `node scripts/build-mcp-peer.mjs`. Its default output is `apps/desktop/resources/mcp-peer`. `--output /absolute/path` selects another output for tests or packaging. The parent must bundle this binary as an executable outside ASAR and pass its absolute path. The helper uses `getpeereid` on macOS and `SO_PEERCRED` on Linux. Node inherits the accepted, paused `Socket` as stdio FD 3. The helper does not read protocol bytes. Missing helpers or failed verification reject connections before parsing requests.

## Pairing and tool calls

`ping` is available while access is off. It returns `{version: MCP_PROTOCOL_VERSION, enabled}`. The master switch defaults off for a new state file.

`pair.begin` returns the shared `{pairingId, code, expiresAt}` shape immediately. The app shows the same random code and the self-reported client name. Pairing expires after two minutes. `pair.finish` returns a fixed `DENIED` error while consent is pending. The client can retry on the same connection after the student decides. Only that connection can finish. Successful finish consumes consent and returns `{grant, grantInfo}` once. Cross-connection finish and replay fail. Disconnect and switching off discard consent. Only requested scopes and explicitly selected existing accounts can be granted. The renderer should select shared `defaultScopes` initially and exclude grades and writes unless requested by the student.

Successful pairing creates a random 256-bit bearer with 30-day expiry. The app stores only its SHA-256 hash. Re-pairing the same client revokes its previous grant. Scope or account edits require trusted IPC and cancel that grant's pending work. Newly connected school accounts do not enter existing grants.

`tools.call` returns a shared `ToolResult`. Pairing, protocol, disabled, and lifecycle failures can instead be JSON-RPC errors with a fixed `data.code` and `data.hint`. The stdio adapter must handle both. Authenticated tool failures preserve recognized backend codes, including `SESSION_REQUIRED`, `UNSUPPORTED`, and `ACADEMIC_INTEGRITY`.

The engine validates registry arguments and scopes before preparation. Remote tools default to the only eligible account. Multiple eligible accounts require an explicit account. `list_accounts`, `get_planner`, and school-independent local writes can operate without selecting an account. The backend receives only the grant's account allowlist, never a grant, bearer, or client identity. Prepared account and provenance must agree and remain granted.

`search_content` requires both `read:content` and `read:files` because its results include converted file text. This extra policy supplements the fixed registry scope and runs at every authorization check, including before preparation and execution. Other content tools must omit file text, grades, submissions, and quiz grades unless their registry scope authorizes that data.

Every registry write waits for a fresh one-shot 60-second approval. The backend receives a deeply frozen copy of the exact arguments. Consent shows its complete payload, including submissions up to 20,000 characters. Writes whose payload would change under redaction fail with `INVALID_ARGUMENT`. This rejects embedded credentials, links, active markup, and oversized previews instead of approving hidden or truncated text. Targets use plain redacted labels and stable IDs remain in the payload.

Authorization runs again after preparation, after approval, immediately before execution, and before returning data. Revocation, edits, disconnect, switching off, timeout, and disposal prevent queued execution and discard subsequent results. The engine passes an AbortSignal to backend `execute(signal)`. The backend must check it between steps and pass it to scheduled Moodle requests. An operation already sent to Moodle cannot be undone by this engine. It is never automatically retried. A backend that never settles continues occupying a bounded execution slot.

The backend must enforce course and record ownership inside its allowlist, academic-integrity restrictions, supported functions, current target eligibility, and assignment submission rules. It must also rate-limit individual Moodle requests inside multi-request operations and retain the existing webview autologin policy. The engine cannot infer those rules from an opaque execution callback.

## Bounds and private state

Default limits are 16 active engine calls, four per grant, 16 pending pairings, 16 pending approvals, and four approvals per grant. Engine requests allow 30 starts per grant and 120 globally per minute. Starts have 150 ms spacing plus 0 to 100 ms jitter. Writes also wait for a spaced execution start after approval. Sync has a shared 60-second account cooldown. The whole engine call times out after 120 seconds.

The bridge allows 32 connections, four in-flight requests per connection, and 32 globally. Idle sockets close after 90 seconds. Individual bridge requests close their connection after 125 seconds. Duplicate in-flight request IDs close the connection. UTF-8 and shared JSON-RPC schemas are strict. Lengths use four-byte big-endian framing and cannot exceed 1 MiB. Protocol failures close the connection without echoing input. Responses obey the same size bound.

`mcp` is mode 0700. `bridge.sock`, `bridge.lock`, and `state.json` are mode 0600. Links and foreign-owned paths are rejected. Atomic state replacement flushes the file and its directory. State contains enabled status, grant metadata and hashes, and redacted activity. Activity retains at most 1000 entries for 30 days. Entries over 4096 serialized bytes replace their arguments with a fixed omission notice, so Unicode payloads cannot exceed the private state's read bound. No pending consent or execution callback survives restart.

A private PID lock prevents competing listener startup. A live listener or live lock owner is never replaced. A dead lock and refused stale socket can be reclaimed. Disposal checks path identity before explicit removal. Same-UID malicious software remains outside this isolation boundary, as documented in `docs/MCP_DESIGN.md`.

Results have fixed human summaries and the shared untrusted-data envelope. The sanitizer removes school URLs, credential-like fields, known secrets and their URL/base64 encodings, WS function values, long opaque secrets, active HTML, and images. Content becomes bounded plain text. Stable backend IDs remain usable. Result collections are capped at 50 items and individual strings at 8000 characters, within a 48,000-character text budget. The backend must paginate content before these safety caps to avoid losing readable data.

Backend pagination cursors never leave main. The engine returns `mcp:<UUID>` handles bound to grant, tool, account, and query. It retains at most 256 handles for 15 minutes. Handles do not survive restart. Resubmission translates a valid handle back to the backend cursor. Invalid or mismatched cursors fail with `INVALID_ARGUMENT`.

## Verification

Run `pnpm exec vitest run src/main/mcp --pool=forks --maxWorkers=2` from `apps/desktop`. The suite compiles the native helper into a temporary directory and tests real sockets without Electron. It covers UID verification through FD 3, injected wrong UID, missing helper, private permissions, malformed and fragmented frames, concurrency, stale listener recovery, restart, pairing connection binding and replay, scope denial, every write approval, cancellation, rate limits, redaction, and injection envelopes.

The implementation was also checked with desktop `pnpm typecheck`, `pnpm lint`, full `pnpm test --pool=forks --maxWorkers=2`, repository `pnpm security:check`, and `node --check scripts/build-mcp-peer.mjs`. The security audit has no unreviewed advisories. Its accepted baseline and the existing three allowlisted Electron external-link warnings remain unchanged.

Desktop IPC wiring, packaging the helper, stdio MCP integration, Electron acceptance, and live-school acceptance belong to the parent integration. These tests do not claim independent review or live-school acceptance.
