import { spawnSync } from 'node:child_process';
if (!process.env.CSC_NAME && !process.env.CSC_LINK) {
  console.error('Developer ID identity missing: set CSC_NAME (installed Developer ID Application certificate) or CSC_LINK and CSC_KEY_PASSWORD.');
  process.exit(1);
}
if (!(process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER) && !(process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID)) {
  console.error('Notarization credentials missing: set APPLE_API_KEY, APPLE_API_KEY_ID and APPLE_API_ISSUER, or APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD and APPLE_TEAM_ID.');
  process.exit(1);
}
const result = spawnSync('pnpm', ['package'], {stdio:'inherit', env:{...process.env,CSC_IDENTITY_AUTO_DISCOVERY:'true',CSC_FOR_PULL_REQUEST:'false',CSC_IDENTITY_VALIDATION:'true'}});
process.exit(result.status ?? 1);
