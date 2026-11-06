/**
 * Main stores resolved-scope assumptions as plain strings (generate.ts and scope.ts), and old artifacts keep that text.
 * The renderer turns the known ones into locale keys here; anything else is internal and is not shown.
 */
export type AssumptionView = { key: 'asked_fallback' | 'assumption_sources_omitted' | 'assumption_excerpt_limited' | 'assumption_undated_units'; documentId?: string; unitIds?: string[] };
export function describeAssumption(raw: string): AssumptionView | null {
  if (/^based on when you asked$/i.test(raw)) return { key: 'asked_fallback' };
  if (raw === 'Some sources omitted due to excerpt budget') return { key: 'assumption_sources_omitted' };
  const limited = /^Source excerpt limited to first \d+ bytes: (.+)$/.exec(raw);
  if (limited) return { key: 'assumption_excerpt_limited', documentId: limited[1]! };
  const undated = /^Undated units based on when you asked: (.*)$/.exec(raw);
  if (undated) return { key: 'assumption_undated_units', unitIds: undated[1]!.split(', ').filter(Boolean) };
  return null;
}
