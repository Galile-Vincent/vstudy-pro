/** Exercise the shipped PTY capability through the real preload contract in an isolated smoke profile. @packageDocumentation */
import { dialog, type BrowserWindow } from 'electron';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cliActionPlanSchema, cliActionSessionSchema } from '../../shared/ai-cli';

export async function runSetupPackagedSmoke(window: BrowserWindow, root: string) {
  const invoke = (channel: string, request: unknown) => window.webContents.executeJavaScript(`window.desktop.invoke(${JSON.stringify(channel)},${JSON.stringify(request)})`);
  let sessionId: string | undefined;
  const nativeConfirmation = dialog.showMessageBox;
  try {
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
    await invoke('ai-cli:setPreferences', { updateChecks: false, autoUpdateWhenIdle: false, advancedShell: true });
    const plan = cliActionPlanSchema.parse(await invoke('ai-cli:preview', { actionId: 'advanced-shell' }));
    if (!plan.available) throw new Error('Packaged PTY preview unavailable');
    const session = cliActionSessionSchema.parse(await invoke('ai-cli:run', { actionId: plan.actionId, token: plan.token }));
    sessionId = session.id;
    const input = process.platform === 'win32' ? "[Console]::WriteLine('VSTUDY_' + 'PTY_OK')\r" : "printf 'VSTUDY_%s\\n' 'PTY_OK'\r";
    await invoke('ai-cli:input', { id: sessionId, data: input });
    let output = '';
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const snapshot = cliActionSessionSchema.parse(await invoke('ai-cli:read', { id: sessionId }));
      output = snapshot.output;
      if (/(?:^|\r?\n)VSTUDY_PTY_OK\r?\n/.test(output)) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!/(?:^|\r?\n)VSTUDY_PTY_OK\r?\n/.test(output)) throw new Error('Packaged PTY produced no command result');
    await invoke('ai-cli:close', { id: sessionId });
    sessionId = undefined;
    const preferences = await invoke('ai-cli:setPreferences', { updateChecks: false, autoUpdateWhenIdle: false, advancedShell: false });
    await window.webContents.executeJavaScript("window.dispatchEvent(new CustomEvent('vstudy:ai-cli-setup'))");
    await new Promise(resolve => setTimeout(resolve, 350));
    await writeFile(join(root, 'ai-cli-packaged.png'), (await window.webContents.capturePage()).toPNG());
    await writeFile(join(root, 'smoke-result.json'), JSON.stringify({ ok: true, packagedPty: true, nativeCommandAnswered: true, closed: true, preferences }));
  } catch {
    await writeFile(join(root, 'smoke-result.json'), JSON.stringify({ ok: false, packagedPty: true, reason: 'Packaged PTY action failed' }));
  } finally {
    dialog.showMessageBox = nativeConfirmation;
    if (sessionId) await invoke('ai-cli:close', { id: sessionId }).catch(() => {});
  }
}
