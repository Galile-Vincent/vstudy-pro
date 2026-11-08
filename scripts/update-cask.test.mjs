import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateCask } from './update-cask.mjs';

test('published checksum fixture updates version and hash and rejects absent or duplicate entries', () => {
  const source = '  version "0.3.0"\n  sha256 "old"';
  const hash = 'a'.repeat(64);
  const fixture = `${hash}  VStudy-Pro-0.4.0-mac-arm64.dmg\n`;
  assert.equal(updateCask(source, 'v0.4.0', fixture), `  version "0.4.0"\n  sha256 "${hash}"`);
  assert.throws(() => updateCask(source, '0.4.0', ''));
  assert.throws(() => updateCask(source, '0.4.0', fixture.repeat(2)));
});
