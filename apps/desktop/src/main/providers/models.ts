/**
 * Discover model catalogs and validate requested options against the selected model.
 * Owned by main/providers.
 * Integrations are opt-in; subprocesses use argv arrays and release resources on cancellation.
 * @packageDocumentation
 */
import { recordEgress } from '../services/egress';
import claudeFallback from './fixtures/claude-models.json';
import codexFallback from './fixtures/codex-models.json';
import patterns from './fixtures/claude-t3-patterns.json';
import { ProcessScope } from '../../../resources/converter/process-scope';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type { Model } from '../../shared/domain';
import { cliEnvironment, findCli } from './cli-transport';
import { option } from './model-options';
export { option } from './model-options';
const codexCatalog = z.object({ models: z.array(z.object({ slug: z.string(), visibility: z.string().optional(), display_name: z.string().optional(), default_reasoning_level: z.string().optional(), supported_reasoning_levels: z.array(z.object({ effort: z.string() })).optional(), service_tiers: z.array(z.object({ id: z.string() })).optional() })) });
/** Normalize the Codex catalog into shared model and capability records. */
export function codexModels(input: unknown): Model[] {
  return codexCatalog.parse(input).models.filter(m => m.visibility !== 'hide').map(m => ({ id: m.slug, name: m.display_name ?? m.slug, options: [
    ...(m.supported_reasoning_levels?.length ? [option('reasoningEffort', 'Effort', m.supported_reasoning_levels.map(e => e.effort), m.default_reasoning_level)] : []),
    ...(m.service_tiers?.length ? [option('serviceTier', 'Service tier', ['default', ...m.service_tiers.map(t => t.id)], 'default')] : []),
  ] }));
}
const claudeCatalog = z.array(z.object({ value: z.string(), resolvedModel: z.string().optional(), displayName: z.string(), supportedEffortLevels: z.array(z.string()).optional(), supportsFastMode: z.boolean().optional(), supportsThinkingOff: z.boolean().optional() }));
/** Normalize the Claude catalog without assuming every model supports every option. */
export function claudeModels(input: unknown): Model[] {
  const catalog = claudeCatalog.parse(input);
  return catalog.map(m => {
    const options = [
      ...(m.supportedEffortLevels?.length ? [option('effort', 'Effort', [...m.supportedEffortLevels, ...((patterns as Record<string,string[]>)[m.resolvedModel ?? m.value] ?? [])], m.supportedEffortLevels.includes('high') ? 'high' : m.supportedEffortLevels[0])] : []),
      ...(m.supportsFastMode ? [option('fastMode', 'Fast mode', ['false', 'true'], 'false')] : []),
      ...(m.supportsThinkingOff ? [option('thinking', 'Thinking', ['enabled', 'disabled'], 'enabled')] : []),
    ];
    for (const o of options) for (const v of o.values) if (v.id === 'ultrathink' || v.id === 'ultracode') v.label += ' (T3 pattern)';
    const resolvedName = catalog.find(x => x.value !== 'default' && x.resolvedModel === m.resolvedModel)?.displayName ?? m.resolvedModel ?? 'recommended';
    return { id: m.value, resolvedId: m.resolvedModel ?? m.value,
      name: m.value === 'default' ? `Default · ${resolvedName}` : m.displayName, options };

  }).filter((m, i, all) => all.findIndex(x => x.id === m.id) === i);
}
const discovery = new Set<ProcessScope>();
let discoveryStopped = false;
/** Abort and await model-discovery subprocesses before application shutdown. */
export async function disposeDiscovery(): Promise<void> {
  discoveryStopped = true;
  await Promise.all([...discovery].map(scope => scope.dispose()));
}
/** Capture bounded subprocess output and terminate on timeout or cancellation. */
export async function capture(binary: string, args: string[], input = '', initialize = false, timeoutMs = 8000): Promise<string> {
  if (discoveryStopped) throw new Error('Model discovery closed');
  const scope = new ProcessScope();
  discovery.add(scope);
  const cwd = await mkdtemp(join(tmpdir(), 'vstudy-models-'));
  try { return await new Promise<string>((resolve, reject) => {
    recordEgress('cli_discovery', 'CLI managed service endpoints');
    const child = scope.spawn(binary, args, { cwd, env: cliEnvironment(), shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    const timer = setTimeout(() => reject(new Error('Model discovery timed out')), timeoutMs);
    child.on('error', reject); child.stderr!.resume(); child.stdin!.on('error', () => {});
    child.stdout!.on('data', data => {
      out += String(data);
      if (out.length > 4_000_000) reject(new Error('Catalog too large'));
      if (initialize && out.includes('"control_response"')) {
        try { const line = out.split('\n').find(l => l.includes('"control_response"')); const models = JSON.parse(line!).response.response.models; resolve(JSON.stringify(models)); } catch { /* Wait for the complete JSON line. */ }
      }
    });
    child.once('close', code => { clearTimeout(timer); if (code === 0) resolve(out); else reject(new Error('Model discovery failed')); });
    child.stdin!.end(input);
  }); } finally {
    await scope.dispose();
    discovery.delete(scope);
    await rm(cwd, {recursive:true,force:true});
  }
}
const catalogs = new Map<string, { expires: number; result: Promise<Model[]> }>();
/** Discover the opted-in provider catalog with bounded process lifetime. */
export function discoverModels(kind: 'claude' | 'codex'): Promise<Model[]> {
  const cached = catalogs.get(kind);
  if (cached && cached.expires > Date.now()) return cached.result;
  const result = readCatalog(kind);
  catalogs.set(kind, { expires: Date.now() + 60_000, result });
  return result;
}
async function readCatalog(kind: 'claude' | 'codex'): Promise<Model[]> {
  const binary = await findCli(kind);
  if (binary) try {
    if (kind === 'codex') return codexModels(JSON.parse(await capture(binary, ['debug', 'models'])));
    return claudeModels(JSON.parse(await capture(binary, ['-p', '--safe-mode', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--tools', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--setting-sources', '', '--no-session-persistence'], JSON.stringify({ type: 'control_request', request_id: 'models', request: { subtype: 'initialize' } }) + '\n', true)));
  } catch { /* Older CLIs may not expose a catalog. */ }
  if (kind === 'codex') try { return codexModels(JSON.parse(await readFile(join(homedir(), '.codex/models_cache.json'), 'utf8'))).map(m => ({ ...m, name: `${m.name} (cached)` })); } catch { /* Cache is optional. */ }
  return (kind === 'claude' ? claudeModels(claudeFallback) : codexModels(codexFallback)).map(m => ({ ...m, name: `${m.name} (static fallback)` }));
}
/** Reject requested options that the chosen model does not advertise. */
export function validateOptions(model: Model | undefined, values: Record<string, string | boolean> = {}) {
  for (const [id, value] of Object.entries(values)) {
    const declared = model?.options?.find(o => o.id === id);
    if (!declared?.values.some(v => v.id === String(value))) throw new Error(`Unsupported model option: ${id}`);
  }
}
