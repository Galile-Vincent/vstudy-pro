/** Edit one owned entry while preserving unrelated configuration text and rejecting ambiguity. @packageDocumentation */
import { applyEdits, getNodeValue, modify, parseTree, type Node, type ParseError } from 'jsonc-parser';
import { parse as parseToml } from 'smol-toml';
import { isDeepStrictEqual } from 'node:util';
import { LocalFileError } from './files';
import type { ClientConfig } from './client-config';

const begin = '# vstudy-mcp managed entry begin';
const end = '# vstudy-mcp managed entry end';
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

function withoutEmptyServerTable(root: Record<string, unknown>, key: string): Record<string, unknown> {
  const normalized = {...root};
  if (object(normalized[key]) && !Object.keys(normalized[key]).length) delete normalized[key];
  return normalized;
}

function uniqueKeys(node: Node): void {
  if (node.type === 'object') {
    const seen = new Set<string>();
    for (const property of node.children ?? []) {
      const key = property.children?.[0]?.value;
      if (seen.has(key)) throw new LocalFileError('Duplicate configuration keys are ambiguous. Resolve them before installing.');
      seen.add(key);
    }
  }
  for (const child of node.children ?? []) uniqueKeys(child);
}

export function parseConfig(text: string, format: 'json' | 'jsonc' | 'toml'): Record<string, unknown> {
  try {
    if (format === 'toml') return parseToml(text);
    const errors: ParseError[] = [];
    const tree = parseTree(text, errors, { allowTrailingComma: format === 'jsonc', disallowComments: format !== 'jsonc' });
    if (errors.length || !tree) throw new Error('Invalid JSON.');
    uniqueKeys(tree);
    const root: unknown = getNodeValue(tree);
    if (!object(root)) throw new Error('Not an object.');
    return root;
  } catch { throw new LocalFileError('Configuration is invalid or ambiguous. No files were changed.'); }
}

export function editConfig(before: string | undefined, config: ClientConfig, uninstall: boolean): { text: string; changed: boolean } {
  const source = before ?? (config.format === 'toml' ? '' : '{}\n');
  const root = parseConfig(source, config.format);
  const key = config.format === 'toml' ? 'mcp_servers' : 'mcpServers';
  if (Object.hasOwn(root, key) && !object(root[key])) throw new LocalFileError('The MCP server map must be an object. No files were changed.');
  const servers = (root[key] ?? {}) as Record<string, unknown>;
  const exists = Object.hasOwn(servers, 'vstudy');
  if (exists && !isDeepStrictEqual(servers.vstudy, config.entry, { skipPrototype: true })) {
    throw new LocalFileError('A conflicting vstudy entry exists. Resolve it manually. No private configuration was printed or changed.');
  }
  if ((!uninstall && exists) || (uninstall && !exists)) return { text: source, changed: false };
  if (config.format !== 'toml') {
    const text = applyEdits(source, modify(source, [key, 'vstudy'], uninstall ? undefined : config.entry,
      { formattingOptions: { insertSpaces: true, tabSize: 2, eol: '\n' } }));
    return { text, changed: true };
  }
  if (!uninstall) {
    const block = [begin, '[mcp_servers.vstudy]', ...Object.entries(config.entry).map(([key, value]) => `${key} = ${JSON.stringify(value)}`), end, ''].join('\n');
    const text = source + (source.endsWith('\n') || !source ? '' : '\n') + block;
    const next = parseConfig(text, 'toml');
    const expected = { ...root, mcp_servers: { ...servers, vstudy: config.entry } };
    if (!isDeepStrictEqual(next, expected, { skipPrototype: true })) throw new LocalFileError('The TOML layout cannot be edited safely. No files were changed.');
    return { text, changed: true };
  }
  const start = source.indexOf(begin);
  const finish = source.indexOf(end);
  if (start < 0 || finish < start || source.indexOf(begin, start + begin.length) !== -1
    || source.indexOf(end, finish + end.length) !== -1
    || (start > 0 && source[start - 1] !== '\n') || (source[finish + end.length] && source[finish + end.length] !== '\n')) {
    throw new LocalFileError('The vstudy TOML entry is not an unchanged managed block. No files were changed.');
  }
  const text = source.slice(0, start) + source.slice(finish + end.length + (source[finish + end.length] === '\n' ? 1 : 0));
  const after = parseConfig(text, 'toml');
  const rest = { ...servers };
  delete rest.vstudy;
  const remaining = {...root, [key]: rest};
  if (!isDeepStrictEqual(withoutEmptyServerTable(after, key), withoutEmptyServerTable(remaining, key), { skipPrototype: true })) throw new LocalFileError('The managed block includes unrelated settings. No files were changed.');
  return { text, changed: true };
}
