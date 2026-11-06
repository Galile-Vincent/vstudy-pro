/** Capture the real manual-install sheet through isolated packaged-smoke settings and IPC. @packageDocumentation */
import type { BrowserWindow } from 'electron';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { i18n } from '../../shared/i18n';
import { cliToolStateSchema } from '../../shared/ai-cli';
interface ManualCapture {
  language: string; scheme: string; theme: string; step: string; command: string;
  copyEnabled: boolean; copyVisible: boolean; horizontalOverflow: boolean; actionButtons: number; hasRunPreview: boolean; file: string;
}

export async function captureManualSetup(window: BrowserWindow, root: string) {
  const invoke = (channel: string, request: unknown) => window.webContents.executeJavaScript(`window.desktop.invoke(${JSON.stringify(channel)},${JSON.stringify(request)})`);
  const waitFor = async (condition: string) => {
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) {
      if (await window.webContents.executeJavaScript(condition)) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('Manual setup did not become ready');
  };
  const tools = await invoke('ai-cli:list', {});
  const agy = cliToolStateSchema.parse(tools.find((tool: { provider: string }) => tool.provider === 'agy'));
  if (agy.path !== null || agy.status !== 'not-installed' || !agy.manualInstallRequired) throw new Error('Manual setup needs an absent CLI in the isolated home');
  await invoke('ai-cli:consent', { provider: 'agy', enabled: true });
  window.setContentSize(1200, 900);
  const captures: ManualCapture[] = [];
  for (const language of ['en', 'zh-Hant', 'ja'] as const) for (const scheme of ['light', 'dark'] as const) {
    const settings = await invoke('settings:get', {});
    await invoke('settings:set', { ...settings, language, themeId: 'paper', colorScheme: scheme, uiScale: 100, onboardingCompleted: true, welcomeSeen: true });
    await new Promise<void>(resolve => { window.webContents.once('did-finish-load', () => resolve()); window.webContents.reload(); });
    await waitFor("Boolean(window.desktop && document.querySelector('.ai-cli-inventory-entry'))");
    await window.webContents.executeJavaScript("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    await window.webContents.executeJavaScript("window.dispatchEvent(new CustomEvent('vstudy:ai-cli-setup',{detail:{provider:'agy'}}))");
    const copy = String(i18n.getFixedT(language, 'ai-cli')('copy_command'));
    const reason = String(i18n.getFixedT(language, 'ai-cli')('manual_install_reason'));
    const step = String(i18n.getFixedT(language, 'ai-cli')('step_install'));
    await waitFor(`(() => {
      const manual=document.querySelector('.ai-cli-action-area details[open]');
      return document.documentElement.lang===${JSON.stringify(language)} && document.documentElement.dataset.scheme===${JSON.stringify(scheme)} && manual?.textContent.includes(${JSON.stringify(reason)}) && [...manual.querySelectorAll('button')].some(button=>button.textContent===${JSON.stringify(copy)});
    })()`);
    await window.webContents.executeJavaScript('document.fonts.ready.then(()=>true)');
    await new Promise(resolve => setTimeout(resolve, 350));
    const { bodyText, ...inspection }: Omit<ManualCapture, 'file'> & { bodyText: string } = await window.webContents.executeJavaScript(`(() => {
      const pane=document.querySelector('.ai-cli-action-area'), manual=pane.querySelector('details[open]'), button=manual.querySelector('button'), scroll=document.querySelector('.ai-cli-scroll');
      const box=button.getBoundingClientRect(), viewport=scroll.getBoundingClientRect();
      return {language:document.documentElement.lang,scheme:document.documentElement.dataset.scheme,theme:document.documentElement.dataset.theme,step:document.querySelector('.ai-cli-steps [aria-current=step] strong')?.textContent,command:manual.querySelector('code')?.textContent,copyEnabled:!button.disabled,copyVisible:box.top>=viewport.top && box.bottom<=viewport.bottom,horizontalOverflow:manual.scrollWidth>manual.clientWidth+1,actionButtons:pane.querySelectorAll('button').length,hasRunPreview:Boolean(pane.querySelector('#ai-cli-preview')),bodyText:document.querySelector('.ai-cli-sheet').innerText};
    })()`);
    const file = `manual-install-${language}-${scheme}.png`;
    await writeFile(join(root, file), (await window.webContents.capturePage()).toPNG());
    await writeFile(join(root, file.replace('.png', '.txt')), bodyText);
    if (inspection.step !== step || inspection.command !== 'curl -fsSL https://antigravity.google/cli/install.sh | bash' || !inspection.copyEnabled || !inspection.copyVisible || inspection.horizontalOverflow || inspection.actionButtons !== 1 || inspection.hasRunPreview) throw new Error('Manual setup layout or action policy failed');
    captures.push({ ...inspection, file });
  }
  await invoke('ai-cli:consent', { provider: 'agy', enabled: false });
  return captures;
}
