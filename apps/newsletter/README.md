# VStudy newsletter Worker

Independent optional product-update registration service. No PostHog dependency,
analytics calls, installation IDs, accounts, or Electron secrets. Desktop and website
integration is future work. Runtime dependency: Zod; HTTP calls use native fetch.

## Owner must provide

1. A Cloudflare account with Workers and D1 access and an owner authorized to deploy.
2. A Resend account, a verified sending domain (including required DNS records),
   and a sending API key restricted as narrowly as the provider allows.
3. A sender address on that domain (`FROM_EMAIL`), a public HTTPS Worker origin
   (`PUBLIC_BASE_URL`, origin only, no path/query), and an exact comma-separated list
   of allowed web origins (`ALLOWED_ORIGINS`, or an empty string for native-only).
   Never allow `*` or opaque `null` origins. Native Electron calls should originate
   from its trusted main process without Origin, not a renderer with Origin: null.
4. A cryptographically random secret of at least 32 bytes for
   `UNSUBSCRIBE_SIGNING_SECRET` (for example, generate locally with `openssl rand -hex 32`).
5. A privacy/support contact and access/backup retention policy. Restrict D1,
   Resend and Cloudflare dashboard access to newsletter operators. Arrange provider
   data erasure requests and confirm backup/log retention before production.
6. Match the unchecked onboarding checkbox wording to `consentText` in `src/email.ts`
   and disclose the newsletter policy before submitting. Receipt versions are
   `newsletter-policy-2026-11-06` and `newsletter-consent-v1`; update versions when
   the policy or wording changes.

## Deployment (owner only; not executed during implementation)

From repository root: `pnpm install --frozen-lockfile`, then `cd apps/newsletter`.

1. Authenticate Wrangler with the owner's Cloudflare account (`pnpm exec wrangler login`).
2. Run `pnpm exec wrangler d1 create vstudy-newsletter`. Replace the all-zero
   `database_id` placeholder in `wrangler.toml` with the returned D1 ID.
3. Run `pnpm exec wrangler d1 migrations apply vstudy-newsletter --remote`.
4. Set each value through the secret prompt, never in source, shell arguments,
   desktop bundles, or committed files:

   ```sh
   pnpm exec wrangler secret put RESEND_API_KEY
   pnpm exec wrangler secret put UNSUBSCRIBE_SIGNING_SECRET
   pnpm exec wrangler secret put FROM_EMAIL
   pnpm exec wrangler secret put PUBLIC_BASE_URL
   pnpm exec wrangler secret put ALLOWED_ORIGINS
   ```

5. Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, then `pnpm deploy`.
   Configure the public Worker/custom domain to match PUBLIC_BASE_URL. Confirm
   the 15-minute cron trigger is enabled. Do not enable D1 read replication
   without reviewing the read-after-write check used to dispatch confirmation.
6. With a controlled mailbox, verify production delivery, DKIM/SPF/DMARC and
   List-Unsubscribe headers, confirmation/expiry, erasure, cron, CORS and abuse
   controls. Check Cloudflare and Resend access/log settings for sensitive data.

Values are not committed. `.dev.vars` and local Wrangler state are ignored; use
mock values only for local development. `pnpm types` regenerates the D1 binding
interface from wrangler.toml; secrets are typed separately and checked at runtime.

## API and client contract

`src/contract.ts` contains strict Zod request/response schemas and inferred types.
Future desktop code may import `@vstudy/newsletter/contract` (or copy the file);
no Worker, D1 or secret code is exported through that entry point.

- `POST /v1/subscribe`: application/json with `{email, locale, source:'onboarding',
  consent:true, app_version}`. Locales: en, ja, zh-Hant. Unknown fields are rejected;
  addresses are trimmed and lowercased. Valid input inserts pending subscriber and
  consent receipt atomically, then attempts one Resend confirmation email.
  Duplicate email never modifies consent, resends, or reactivates an opt-out.
  Every subscribe POST admitted by CORS returns identical `202 {"status":"accepted"}`,
  including malformed/oversized input, throttling, missing trusted IP and failures.
  A disallowed Origin returns 403 independently of the email.
- `GET /v1/confirm?token=...`: purpose-bound HMAC SHA-256 token, expires in 48h.
  Only unexpired pending records become active. Replay cannot reactivate an opt-out.
- `GET /v1/unsubscribe?token=...`: idempotent withdrawal; pending or active becomes
  unsubscribed. `POST` accepts `application/x-www-form-urlencoded` with exactly
  `List-Unsubscribe=One-Click` for RFC 8058. Confirmation mail contains both
  List-Unsubscribe headers and a visible unsubscribe link.
- `POST /v1/delete`: application/json `{ "token": "<deletion token from email>" }`.
  Deletes subscriber and cascades consent receipt. Repeated valid requests succeed.
  Tokens have distinct purposes; an unsubscribe token cannot authorize erasure.
  To use the emailed deletion token, POST it to PUBLIC_BASE_URL/v1/delete with a
  JSON HTTP client. There is no browser deletion form in this package.

Confirmation links contain random UUIDs, purpose and expiry, never addresses.
Unsubscribe and deletion tokens last 365 days. Possession authorizes that action;
keep emails private. Tampering, expiry and wrong-purpose tokens fail with 400.
A valid token for an already removed record returns success without disclosing
record existence. Responses are no-store and no-referrer. No cookies are used.

## Retention and privacy

- Pending records and receipts are eligible for erasure after **48h**; confirmation
  is blocked immediately at expiry. Cron runs every 15 minutes, so physical erasure
  can lag by that interval or longer if the scheduler fails.
- Active email and original consent receipt remain until unsubscribe or erasure.
  There is no automatic active-subscriber expiry. Do not use pending/unsubscribed
  records for campaigns; any future sender must select only `state = 'active'`.
- Unsubscribe stops eligibility immediately and retains the record/receipt for
  **30 days** to suppress repeated signup during that period; cron then erases it.
  Explicit erasure deletes both immediately from live D1. Old links cannot affect
  a fresh signup, which has a new random ID. No permanent suppression list remains.
- Rate limiting allows 5 valid signup attempts per trusted CF-Connecting-IP in
  each fixed **15-minute** window. D1 stores only an HMAC salted by the secret,
  window and purpose, a capped counter, and expiry. No raw IP, user agent, or
  installation ID is saved. Expired buckets are removed by cron. Requests missing
  the edge IP fail closed. Do not put an untrusted proxy in front of the Worker.
- Only fixed error classes are logged; exceptions/provider bodies are discarded.
  Automatic Worker observability is deliberately disabled to avoid bearer URLs
  in invocation logs/traces. Never attach PostHog, request capture middleware or
  raw access logging to this service. Cloudflare still processes incoming IPs,
  and Resend necessarily processes recipients and email contents.
- Erasure covers live D1 only, not provider mail logs, delivered mail, D1 Time
  Travel/backups, or external exports. Owner must manage those separately under
  their retention policy. Database operators can read emails and consent receipts.

## Verification and known limits

`pnpm test` runs Vitest against in-memory SQLite (`node:sqlite`) with actual migration
SQL, foreign keys, atomic batch transactions and parameterized statements, wrapped
in a small D1-compatible surface. Every Resend fetch is mocked. Requires Node >=24.15.
`pnpm typecheck` uses Cloudflare platform types and generated binding declarations.
`pnpm lint` and root `pnpm knip` cover package integration.

Implementation verification: 25 Vitest tests passed; newsletter typecheck/lint,
MCP/desktop lint, root knip, and git diff whitespace checks passed. Root scripts
now include newsletter. Full root lint/typecheck/test chains were not executed:
website Astro checks and desktop locale-generation steps can write into the
explicitly excluded apps. Neither desktop nor website source was changed.

Not verified against real Cloudflare D1/Workers/scheduled execution or Resend:
no credentials, deployment, real mail, or real provider API calls were used.
The SQLite adapter does not simulate Cloudflare networking, quotas, concurrency,
provider failures or replication. Production smoke tests remain the owner's task.

This is a small signup service, not a campaign sender, contacts sync, durable email
queue, bounce/complaint webhook processor or retry system. Delivery failures leave
pending records until expiry; duplicates deliberately do not resend, so retry is
possible after cleanup (at most about 48h15m under healthy cron). Requests can race
with erasure/unsubscribe while a confirmation send is already in flight; withdrawal
still blocks subsequent activation, but cannot recall an email already dispatched.
Expired deletion links need owner-assisted erasure (use the support contact);
rotate the signing secret only with awareness that existing emailed links break.
A future campaign sender must mint fresh action links and include unsubscribe headers.

CORS is browser policy, not authentication: arbitrary native callers can submit
signups. JSON-only bodies block simple browser form signup, but malicious clients
and distributed IPs can still abuse the public endpoint. Shared-IP users share the
quota; fixed windows allow boundary bursts. A global budget, WAF/rate rules,
Turnstile or email-domain abuse control may be needed at scale. Lowercasing the
whole email intentionally merges rare case-sensitive local parts. GET unsubscribe
can be triggered by mail scanners; GET confirmation can likewise be followed by
scanners, so double opt-in is not proof of human interaction. No timing-equalization
claim is made for duplicate vs new signup beyond the identical response.

References: [D1 binding/batch API](https://developers.cloudflare.com/d1/worker-api/d1-database/),
[Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/),
[Resend send-email API](https://resend.com/docs/api-reference/emails/send-email).
