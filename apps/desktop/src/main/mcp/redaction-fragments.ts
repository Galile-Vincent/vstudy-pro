/** Scrub known secrets across document-order string leaves before field truncation. @packageDocumentation */
const hidden = '[redacted]';
const maxLeaves = 512;
const maxChars = 128_000;
const maxWindow = 16;
const maxForms = 512;
const maxFormChars = 4096;
type Leaf = {text:string; replace:()=>void};

/** Limits drop the entire field set so truncation cannot expose an unchecked secret fragment. */
export function redactFragments(input:unknown, forms:readonly string[]):unknown {
  if (forms.length > maxForms || forms.some(form => form.length > maxFormChars)) return hidden;
  const leaves:Leaf[] = [];
  let chars = 0;
  let nodes = 0;
  let exceeded = false;
  const copy = (value:unknown, depth:number, replace:(value:unknown)=>void):void => {
    if (++nodes > 1200 || depth > 8) { exceeded = true; return; }
    if (typeof value === 'string') {
      chars += value.length;
      if (chars > maxChars || leaves.length >= maxLeaves) { exceeded = true; return; }
      leaves.push({text:value, replace:()=>replace(hidden)});
      replace(value);
    } else if (Array.isArray(value)) {
      const result:unknown[] = [];
      replace(result);
      if (value.length > 1200) { exceeded = true; return; }
      for (let i = 0; i < value.length && !exceeded; i++) copy(value[i], depth+1, item => {result[i] = item;});
    } else if (value !== null && typeof value === 'object') {
      const result:Record<string,unknown> = {};
      replace(result);
      for (const key in value) {
        if (!Object.hasOwn(value, key)) continue;
        copy(Reflect.get(value, key), depth+1, item => {Object.defineProperty(result, key, {value:item, enumerable:true, configurable:true});});
        if (exceeded) break;
      }
    } else replace(value);
  };
  let result:unknown;
  copy(input, 0, value => {result = value;});
  if (exceeded) return hidden;
  const affected = new Set<number>();
  for (const mode of ['joined', 'separated', 'compact'] as const) {
    let source = '';
    const ranges = leaves.map(leaf => {
      if (mode === 'separated' && source.length) source += ' ';
      const start = source.length;
      source += mode === 'compact' ? leaf.text.replace(/\s/gu, '') : leaf.text;
      return {start, end:source.length};
    });
    let hits = 0;
    for (const form of forms) {
      let offset = 0;
      while ((offset = source.indexOf(form, offset)) !== -1) {
        if (++hits > 1200) return hidden;
        const end = offset + form.length;
        const indices = ranges.flatMap((range, index) => range.start < end && range.end > offset ? [index] : []);
        if (indices.length && indices.at(-1)! - indices[0]! >= maxWindow) return hidden;
        for (const index of indices) affected.add(index);
        offset = end;
      }
    }
  }
  for (const index of affected) leaves[index]!.replace();
  return result;
}
