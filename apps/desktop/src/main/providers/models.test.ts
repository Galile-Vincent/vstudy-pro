/**
 * Regression coverage for providers models.
 * Owned by main/providers.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
import { expect, it } from 'vitest';
import codex from './fixtures/codex-models.json';
import claude from './fixtures/claude-models.json';
import { claudeModels, codexModels, discoverModels, validateOptions } from './models';
import { cliArgs, findCli } from './cli';
it('retains visible discovered models and exact per-model effort values', () => {
  const models = codexModels(codex);
  expect(models.map(m => m.id)).toEqual(['gpt-6.1-sol','gpt-6-astra','gpt-6.1-terra','gpt-6-sol','gpt-6-luna','gpt-5.6-sol','gpt-5.6-terra','gpt-5.6-luna']);
  expect(models.find(m => m.id === 'gpt-6.1-sol')?.options?.[0]?.values.map(v => v.id)).toContain('ultra');
  expect(models.find(m => m.id === 'gpt-6-luna')?.options?.[0]?.values.map(v => v.id)).not.toContain('ultra');
  expect(claudeModels(claude).find(m => m.id === 'opus')?.options?.map(o => o.id)).toEqual(['effort','fastMode']);
  expect(claudeModels(claude).find(m => m.id === 'claude-haiku-4-5-20251001')?.options?.some(o => o.id === 'effort')).toBe(false);
});
it('rejects unknown option IDs and values', () => {
  const model = codexModels(codex)[0];
  expect(() => validateOptions(model, { reasoningEffort: 'ultra', serviceTier: 'priority' })).not.toThrow();
  for (const value of [{ effort: 'high' }, { reasoningEffort: 'invented' }]) expect(() => validateOptions(model, value)).toThrow('Unsupported model option');
  expect(() => validateOptions(undefined, { effort: 'high' })).toThrow();
});
it('constructs literal argv without interpolating CLI syntax', () => {
  expect(cliArgs('codex','gpt-6.1-sol',{ reasoningEffort: 'ultra', serviceTier: 'priority' })).toEqual(['exec','--json','--sandbox','read-only','--ephemeral','--skip-git-repo-check','--ignore-user-config','--ignore-rules','--model','gpt-6.1-sol','-c','model_reasoning_effort="ultra"','-c','service_tier="priority"','-']);
  expect(cliArgs('claude','opus',{ effort: 'max', fastMode: true })).toEqual(['-p','--safe-mode','--output-format','stream-json','--include-partial-messages','--verbose','--tools','','--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--setting-sources','','--no-session-persistence','--model','opus','--effort','max','--settings','{"fastMode":true}']);
});
it.skipIf(!await findCli('codex'))('discovers the installed Codex catalog', async () => {
  const models = await discoverModels('codex');
  expect(models.some(m => m.id === 'gpt-6.1-sol')).toBe(true);
  expect(models.every(m => !m.name.includes('static fallback'))).toBe(true);
}, 15000);
