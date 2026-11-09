import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

export const rules = ['shadow', 'radius', 'color', 'backdrop', 'surface-class'];
export function inspect(source, css = true) {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const counts = Object.fromEntries(rules.map((rule) => [rule, 0]));
  const token = (value) => /^var\(--[\w-]+\)$/.test(value.trim());
  const property = (names, check, rule) => {
    const end = css ? String.raw`([^;\n}]+)` : String.raw`(?:"([^"]*)"|'([^']*)'|([^,;\n}]+))`;
    const pattern = new RegExp(
      String.raw`(?:^|[\s{;,])(?:"(?:${names})"|'(?:${names})'|(?:${names}))\s*:\s*${end}`,
      'g',
    );
    for (const match of text.matchAll(pattern)) {
      const value = (match[1] ?? match[2] ?? match[3])
        .trim()
        .replace(/\s*!important\s*$/i, '')
        .trim();
      if (!check(value)) counts[rule]++;
    }
  };
  property(
    'box-shadow|boxShadow',
    (value) =>
      token(value) ||
      value === 'none' ||
      /^0 0 0 \d+(?:\.\d+)?px (?:var\(--[\w-]+\)|currentColor)$/.test(value),
    'shadow',
  );
  property(
    'border-radius|borderRadius|border-(?:start|end)-(?:start|end)-radius|border-(?:top|bottom)-(?:left|right)-radius|border(?:Top|Bottom)(?:Left|Right)Radius',
    (value) => {
      const lengths = value
        .replace(/calc\([^)]*var\(--r-[\w-]+\)[^)]*\)/g, '')
        .replace(/var\(--r-[\w-]+\)/g, '')
        .match(/-?(?:\d*\.)?\d+(?:px|rem|em|%|vw|vh|vmin|vmax|cm|mm|in|pt|pc|ex|ch)?/g) ?? [];
      return lengths.every((length) => Number.parseFloat(length) === 0);
    },
    'radius',
  );
  const namedColors =
    /\b(?:aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blanchedalmond|blue|blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|darkblue|darkcyan|darkgoldenrod|darkgray|darkgreen|darkgrey|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dimgrey|dodgerblue|firebrick|floralwhite|forestgreen|fuchsia|gainsboro|ghostwhite|gold|goldenrod|gray|green|greenyellow|grey|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgray|lightgreen|lightgrey|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|lime|limegreen|linen|magenta|maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|navy|oldlace|olive|olivedrab|orange|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|silver|skyblue|slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|teal|thistle|tomato|turquoise|violet|wheat|white|whitesmoke|yellow|yellowgreen)\b/gi;
  const countColors = (value) => {
    const colors = value
      .replace(/url\([^)]*\)/gi, '')
      .replace(/var\([^)]*\)/g, '');
    counts.color +=
      (colors.match(/#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/gi) ?? []).length +
      (colors.match(namedColors) ?? []).length;
    return true;
  };
  property(
    'color|background[\\w-]*|border[\\w-]*|outline[\\w-]*|(?:-webkit-)?text-fill-color|WebkitTextFillColor|fill|stroke|box-shadow|boxShadow|text-shadow|textShadow|caret-color|caretColor|accent-color|accentColor',
    countColors,
    'color',
  );
  for (const match of text.matchAll(/(?:bg|text|border|shadow|outline|fill|stroke)-\[([^\]]+)\]/g))
    countColors(match[1]);
  if (!css) {
    for (const match of text.matchAll(/\b(?:fill|stroke)\s*=\s*(?:\{\s*)?(?:"([^"]*)"|'([^']*)')/g))
      countColors(match[1] ?? match[2]);
  }
  property(
    '(?:-webkit-)?backdrop-filter|backdropFilter',
    (value) => token(value) || value === 'none',
    'backdrop',
  );
  if (css) {
    for (const match of text.matchAll(/([^{}]+)\{/g))
      counts['surface-class'] += [
        ...match[1].matchAll(/\.[\w-]+-(?:card|panel|tile)(?![\w-])/g),
      ].length;
  } else {
    counts.radius += [...text.matchAll(/rounded-\[((?:\d*\.)?\d+)(?:px|rem|em)?\]/g)]
      .filter((match) => Number(match[1]) !== 0).length;
    counts.shadow += [...text.matchAll(/shadow-\[(?!var\(--)[^\]]+\]/g)].length;
    counts.backdrop += [...text.matchAll(/backdrop-(?:blur|filter)-\[(?!var\(--)[^\]]+\]/g)].length;
  }
  return counts;
}
export function regressions(current, baseline) {
  return Object.entries(current).flatMap(([file, counts]) =>
    rules
      .filter((rule) => counts[rule] > (baseline[file]?.[rule] ?? 0))
      .map((rule) => `${file}: ${rule} ${baseline[file]?.[rule] ?? 0} → ${counts[rule]}`),
  );
}
export async function collect(root) {
  const result = {};
  async function walk(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const path = resolve(directory, entry.name);
      const file = relative(root, path).replaceAll('\\', '/');
      if (
        /^components\/(?:ui|assistant-ui)(?:\/|$)/.test(file) ||
        /(?:^|\/)(?:tokens|themes)(?:\.|\/)/.test(file)
      )
        continue;
      if (entry.isDirectory()) await walk(path);
      else if (/\.(css|tsx)$/.test(file)) {
        const counts = inspect(await readFile(path, 'utf8'), file.endsWith('.css'));
        if (Object.values(counts).some(Boolean)) result[file] = counts;
      }
    }
  }
  await walk(root);
  return result;
}
export async function run({
  root = resolve(import.meta.dirname, '../src/renderer'),
  baselinePath = resolve(import.meta.dirname, 'ui-lint.baseline.json'),
  update = false,
} = {}) {
  const current = await collect(root);
  let baseline;
  try {
    baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT' || !update) throw error;
    baseline = current;
  }
  const failures = regressions(current, baseline);
  if (failures.length) {
    console.error(failures.join('\n'));
    return 1;
  }
  if (update) await writeFile(baselinePath, JSON.stringify(current, null, 2) + '\n');
  const totals = Object.fromEntries(
    rules.map((rule) => [
      rule,
      Object.values(current).reduce((sum, counts) => sum + counts[rule], 0),
    ]),
  );
  console.log(
    `UI ratchet passed: ${JSON.stringify(totals)}. Reduce the baseline with --update-baseline after removing violations.`,
  );
  return 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  process.exitCode = await run({ update: process.argv.includes('--update-baseline') });
