/** Plan packaging without reading credentials or granting release permissions. */
import { appendFileSync, readFileSync, accessSync } from 'node:fs';
import { releaseIntent, targets } from './release-contract.mjs';

const version = JSON.parse(readFileSync('apps/desktop/package.json', 'utf8')).version;
const intent = releaseIntent({
  event: process.env.GITHUB_EVENT_NAME, ref: process.env.GITHUB_REF ?? '',
  dryRun: process.env.RELEASE_DRY_RUN !== 'false', version,
});
if (intent.publish) accessSync(`docs/releases/${version}.md`);
for (const [key, value] of Object.entries({ ...intent, matrix: JSON.stringify({ include: targets }) })) {
  appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}
