# Local storage maintenance

`atomic.ts` publishes complete flushed files. Small synchronous configuration stores use the matching synchronous helper. `reconcile.ts` removes recognized incomplete imports, conversions, and downloads during startup.

`backup.ts` snapshots SQLite, inventories contained library files, validates portable backups, and publishes a restore before SQLite opens. `zip.ts` streams the app's restricted ZIP32 format with CRC32 and SHA-256 validation. It accepts no arbitrary extraction paths or compressed ZIP entries.

`maintenance.ts` drains accepted IPC and rejects new requests while background writers settle. `service.ts` reports physical usage, clears refetchable Moodle cache, clears generated conversions while preserving originals, and runs integrity checks on a snapshot in a worker. `ipc/storage.ts` owns native dialogs and confirmations.

Run `pnpm exec vitest run src/main/storage --pool=forks --maxWorkers=2` from `apps/desktop`. `e2e/storage.mjs` checks the built Electron UI and a real restore across restart. It refuses to launch while another Electron test instance exists.

See [the storage reference](../../../../../../docs/STORAGE.md) for the inventory, format, migration contract, and remaining limits.
