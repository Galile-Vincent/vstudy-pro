import patterns from './fixtures/claude-t3-patterns.json';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type { Model } from '../../shared/domain';
import { cliEnvironment, findCli } from './cli';
export const option = (id: string, label: string, values: string[], initial = values[0] ?? '') => ({ id, label, values: values.map(id => ({ id, label: id })), default: initial });
const codexCatalog = z.object({ models: z.array(z.object({ slug: z.string(), display_name: z.string().optional(), default_reasoning_level: z.string().optional(), supported_reasoning_levels: z.array(z.object({ effort: z.string() })).optional(), service_tiers: z.array(z.object({ id: z.string() })).optional() })) });
export function codexModels(input: unknown): Model[] {
  return codexCatalog.parse(input).models.map(m => ({ id: m.slug, name: m.display_name ?? m.slug, options: [
    ...(m.supported_reasoning_levels?.length ? [option('reasoningEffort', 'Effort', m.supported_reasoning_levels.map(e => e.effort), m.default_reasoning_level)] : []),
    ...(m.service_tiers?.length ? [option('serviceTier', 'Service tier', ['default', ...m.service_tiers.map(t => t.id)], 'default')] : []),
  ] }));
}
const claudeCatalog = z.array(z.object({ value: z.string(), resolvedModel: z.string().optional(), displayName: z.string(), supportedEffortLevels: z.array(z.string()).optional(), supportsFastMode: z.boolean().optional(), supportsThinkingOff: z.boolean().optional() }));
export function claudeModels(input: unknown): Model[] {
  return claudeCatalog.parse(input).flatMap(m => {
    const options = [
      ...(m.supportedEffortLevels?.length ? [option('effort', 'Effort', [...m.supportedEffortLevels, ...((patterns as Record<string,string[]>)[m.resolvedModel ?? m.value] ?? [])], m.supportedEffortLevels.includes('high') ? 'high' : m.supportedEffortLevels[0])] : []),
      ...(m.supportsFastMode ? [option('fastMode', 'Fast mode', ['false', 'true'], 'false')] : []),
      ...(m.supportsThinkingOff ? [option('thinking', 'Thinking', ['enabled', 'disabled'], 'enabled')] : []),
    ];
    for (const o of options) for (const v of o.values) if (v.id === 'ultrathink' || v.id === 'ultracode') v.label += ' (T3 pattern)';
    return [...new Set([m.value, m.resolvedModel ?? m.value])].map(id => ({ id, name: id === m.value ? m.displayName : id, options }));
  }).filter((m, i, all) => all.findIndex(x => x.id === m.id) === i);
}
function capture(binary: string, args: string[], input = '', initialize = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd: homedir(), env: cliEnvironment(), shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Model discovery timed out')); }, 8000);
    child.on('error', reject); child.stderr.resume(); child.stdin.on('error', () => {});
    child.stdout.on('data', data => {
      out += String(data);
      if (out.length > 4_000_000) { child.kill(); reject(new Error('Catalog too large')); }
      if (initialize && out.includes('"control_response"')) {
        try { const line = out.split('\n').find(l => l.includes('"control_response"')); const models = JSON.parse(line!).response.response.models; resolve(JSON.stringify(models)); child.kill(); } catch { /* Wait for the complete JSON line. */ }
      }
    });
    child.once('close', code => { clearTimeout(timer); if (code === 0) resolve(out); else reject(new Error('Model discovery failed')); });
    child.stdin.end(input);
  });
}
export async function discoverModels(kind: 'claude' | 'codex'): Promise<Model[]> {
  const binary = await findCli(kind);
  if (binary) try {
    if (kind === 'codex') return codexModels(JSON.parse(await capture(binary, ['debug', 'models'])));
    return claudeModels(JSON.parse(await capture(binary, ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--tools', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--setting-sources', '', '--no-session-persistence'], JSON.stringify({ type: 'control_request', request_id: 'models', request: { subtype: 'initialize' } }) + '\n', true)));
  } catch { /* Older CLIs may not expose a catalog. */ }
  if (kind === 'codex') try { return codexModels(JSON.parse(await readFile(join(homedir(), '.codex/models_cache.json'), 'utf8'))).map(m => ({ ...m, name: `${m.name} (cached)` })); } catch { /* Cache is optional. */ }
  return (kind === 'claude' ? ['default', 'opus', 'sonnet', 'haiku'] : ['default']).map(id => ({ id, name: `${id} (static fallback)` }));
}
export function validateOptions(model: Model | undefined, values: Record<string, string | boolean> = {}) {
  for (const [id, value] of Object.entries(values)) {
    const declared = model?.options?.find(o => o.id === id);
    if (!declared?.values.some(v => v.id === String(value))) throw new Error(`Unsupported model option: ${id}`);
  }
}
