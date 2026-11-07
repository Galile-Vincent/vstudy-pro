import claude from '../providers/fixtures/claude-models.json';
import codex from '../providers/fixtures/codex-models.json';
const known = new Set([...claude.flatMap(m => [m.value, m.resolvedModel]), ...codex.models.map(m => m.slug)]);
export function analyticsModel(provider: string, model: string | null): string | null {
  if (model === null) return null;
  if (provider === 'openai-compatible') return 'custom';
  if (known.has(model)) return model;
  if (['openai-api','codex-cli'].includes(provider) && /^(?:gpt-[456](?:\.\d)?(?:-(?:mini|nano|pro|turbo|sol|astra|terra|codex))?|gpt-4o(?:-mini)?|o[134](?:-mini)?)(?:-\d{4}-\d{2}-\d{2})?$/.test(model)) return model;
  if (['anthropic-api','claude-cli'].includes(provider) && /^claude-(?:sonnet|opus|haiku)-[345](?:[.-]\d)?(?:-\d{8})?$/.test(model)) return model;
  return 'custom';
}
