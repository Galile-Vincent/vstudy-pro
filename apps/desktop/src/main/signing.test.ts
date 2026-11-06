/**
 * Regression coverage for signing.
 * Owned by main.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
import {expect,it} from 'vitest';
import {spawnSync} from 'node:child_process';
it('fails before building when a signing identity is missing', () => {
 const result=spawnSync(process.execPath,['scripts/package-signed.mjs'],{env:{},encoding:'utf8'});
 expect(result.status).toBe(1);
 if (process.platform === 'darwin') expect(result.stderr).toBe('Developer ID identity missing: set CSC_NAME (installed Developer ID Application certificate) or CSC_LINK and CSC_KEY_PASSWORD.\n');
 else expect(result.stderr).toContain('Signing credentials are required by package:signed');
});
