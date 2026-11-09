/** Deterministic main boundary for setup component tests; never launches a real executable. */
import type { CliActionId, CliActionSession, CliFailure, CliPreferences, CliToolState } from '../../shared/ai-cli';

export function cliFixture() {
  const tools: CliToolState[] = ['claude', 'codex', 'agy'].map(provider => ({
    provider: provider as CliToolState['provider'], consented: false, version: null, path: null, managed: false,
    manualInstallRequired: false, manualUpdateRequired: false,
    latestVersion: null, releaseNotesUrl: null, checkedAt: null, previousVersion: null, appliesToNewChats: false,
    tested: false, status: 'not-installed', error: null,
  }));
  let preferences: CliPreferences = { updateChecks: false, autoUpdateWhenIdle: false, advancedShell: false };
  const calls: { channel: string; payload: Record<string, unknown> }[] = [];
  let current: CliActionSession;
  let held = false;
  let failure: CliFailure | null = null;
  let compatible = true;
  let output = 'Your tool answered. Ready to study.';
  const invoke = async (channel: string, payload: Record<string, unknown>) => {
    calls.push({ channel, payload });
    switch (channel) {
      case 'ai-cli:list': return structuredClone(tools);
      case 'ai-cli:consent': tools.find(tool => tool.provider === payload.provider)!.consented = Boolean(payload.enabled); return { ok: true };
      case 'ai-cli:preferences': return preferences;
      case 'ai-cli:setPreferences': preferences = payload as CliPreferences; return preferences;
      case 'ai-cli:checkUpdates': return structuredClone(tools);
      case 'ai-cli:preview': return { actionId: payload.actionId, token: '11111111-1111-4111-8111-111111111111', command: String(payload.actionId).startsWith('install') ? 'Download, verify SHA-256, stage official release' : `${payload.actionId} --main-owned`, cwd: '/main/owned/folder', available: compatible || !String(payload.actionId).startsWith('update'), reason: compatible ? null : 'wrong-version', expiresAt: Date.now() + 60000 };
      case 'ai-cli:run': {
        current = { id: crypto.randomUUID(), actionId: payload.actionId as CliActionId, phase: 'running', output: '', truncated: false, exitCode: null, error: null };
        const running = tools.find(item => item.provider === current.actionId.split('-').at(-1));
        const status = { install: 'installing', login: 'signing-in' }[current.actionId.split('-')[0]!];
        if (running && status) Object.assign(running, { status, error: null });
        return { ...current };
      }
      case 'ai-cli:read': {
        if (held) return { ...current };
        current = { ...current, phase: failure ? 'failed' : 'succeeded', output, error: failure, exitCode: failure ? 1 : 0 };
        const provider = current.actionId.split('-').at(-1);
        const tool = tools.find(item => item.provider === provider);
        if (tool && !failure) {
          if (current.actionId.startsWith('install-')) Object.assign(tool, { version: '1.0.0', managed: true, status: 'installed-not-signed-in' });
          if (current.actionId.startsWith('login-')) tool.status = 'ready';
          if (current.actionId.startsWith('test-')) { tool.status = 'ready'; tool.tested = true; }
          if (current.actionId.startsWith('update-')) Object.assign(tool, { previousVersion: tool.version, version: tool.latestVersion, status: 'ready', appliesToNewChats: true });
          if (current.actionId.startsWith('rollback-')) Object.assign(tool, { version: tool.previousVersion, previousVersion: null, status: 'ready', appliesToNewChats: true });
        }
        return { ...current };
      }
      case 'ai-cli:close': {
        if (current?.id === payload.id && current.phase === 'running') {
          current = { ...current, phase: 'cancelled', error: 'cancelled', exitCode: -1 };
          const tool = tools.find(item => item.provider === current.actionId.split('-').at(-1));
          if (tool) Object.assign(tool, { status: 'error', error: { code: 'cancelled', hint: 'cancelled', action: current.actionId.split('-')[0] } });
        }
        return { ok: true };
      }
      default: return { ok: true };
    }
  };
  return { tools, calls, invoke, hold: (value: boolean) => { held = value; }, fail: (value: CliFailure | null) => { failure = value; }, compatible: (value: boolean) => { compatible = value; }, output: (value: string) => { output = value; } };
}
