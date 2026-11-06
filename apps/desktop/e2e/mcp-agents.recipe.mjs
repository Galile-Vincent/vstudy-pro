/** Renderer assertions for the parent's single Electron session. This module never launches an app. */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

/** Open the real Agents tab and capture it after the shared poller loads. Use an English fixture profile. */
export async function captureAgentsSettings(page, directory, name = 'settings') {
  await page.evaluate(() => window.dispatchEvent(new window.CustomEvent('vstudy:open-settings', { detail: { tab: 'agents' } })));
  const settings = page.getByTestId('agents-settings');
  await settings.waitFor();
  await page.waitForFunction(() => !window.document.querySelector('[data-testid=agents-settings]')?.textContent.includes('Loading agent connections'));
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: join(directory, `${name}.png`) });
  assert.equal(await page.getByRole('tab', { name: 'Agents', exact: true }).getAttribute('aria-selected'), 'true');
}

/** Call after the SDK client begins pairing. Compare the actual pending ID and code before any approval. */
export async function verifyAgentPairing(page, pairing, accountIds) {
  const dialog = page.getByTestId('agent-consent');
  await dialog.waitFor();
  assert.equal(await dialog.getAttribute('data-request-id'), pairing.id);
  assert.equal(await page.getByTestId('agent-pairing-code').textContent(), pairing.code);
  assert.equal(await dialog.getByRole('button', { name: 'Pair with selected access', exact: true }).isDisabled(), true);
  const checks = await dialog.getByRole('checkbox').all();
  for (const check of checks) {
    const label = await check.evaluate(node => node.closest('label')?.textContent ?? '');
    if (label.includes('read:grades') || label.includes('write:') || accountIds.some(id => label.includes(id))) {
      assert.equal(await check.getAttribute('aria-checked'), 'false');
    }
  }
  assert.match(await dialog.textContent(), /self-reported/);
  assert.equal(await dialog.locator('script,img,a,iframe').count(), 0);
}

/** Call after the SDK client proposes a write. The parent decides whether to approve, deny, or await expiry. */
export async function verifyAgentProposal(page, proposal) {
  const dialog = page.getByTestId('agent-consent');
  await dialog.waitFor();
  assert.equal(await dialog.getAttribute('data-request-id'), proposal.id);
  assert.equal(await dialog.getAttribute('data-request-kind'), 'proposal');
  assert.equal(await dialog.locator('.agents-consent-body pre').textContent(), JSON.stringify(proposal.payload, null, 2));
  assert.ok((await dialog.textContent()).includes(proposal.target));
  assert.equal(await dialog.locator('script,img,a,iframe').count(), 0);
  assert.equal(await dialog.getByRole('button', { name: 'Deny', exact: true }).evaluate(node => node === window.document.activeElement), true);
}

/** Capture Home and Workspace while the parent's fixture holds a call open. */
export async function captureLiveAgent(page, directory, name = 'live') {
  await page.getByTestId('agent-status').waitFor({ state: 'visible' });
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: join(directory, `${name}.png`) });
}
