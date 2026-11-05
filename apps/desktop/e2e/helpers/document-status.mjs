/** Await actual IPC readiness. Playwright 1.56 treats an async waitForFunction predicate as truthy. */
import { setTimeout } from 'node:timers/promises';

export async function waitForDocumentStatus(page, documentId, status = 'ready') {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const document = await page.evaluate(documentId => window.desktop.invoke('documents:get', { documentId }), documentId);
    if (document?.status === status) return document;
    if (status === 'ready' && document?.status === 'failed') throw new Error(`Document conversion failed: ${document.error}`);
    await setTimeout(25);
  }
  throw new Error(`Document ${documentId} did not become ${status} within 15 seconds`);
}
