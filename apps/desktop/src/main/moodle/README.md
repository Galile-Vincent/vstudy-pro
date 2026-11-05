# Moodle services

`schools.ts` is the bundled directory. `discovery.ts` checks a user-selected root and chooses an authentication plan from validated public configuration. `site-url.ts` owns URL normalization, root containment, public address checks, TLS, and the app-owned Moodle request inventory. `logos.ts` caches bounded same-origin raster logos under the app data namespace.

`auth.ts`, `client.ts`, `sso.ts`, and `callback.ts` own token acquisition, authenticated web services, isolated SSO, and signed callbacks. Tokens never leave main. `service.ts` connects verified identities, schedules sync, and exposes cached course state through `repository.ts`. The validated IPC contract lives in `shared/moodle.ts` and `shared/ipc.ts`.

See [Schools in the design document](../../../../../docs/moodle-design.md#schools) for directory evidence, login limits, cache policy, and privacy. Tests inject transports and never need a real school login.
