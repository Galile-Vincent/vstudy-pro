import { useEffect, useState } from 'react';
import type { PluggableList } from 'unified';

type MarkdownPlugins = { remark: PluggableList; rehype: PluggableList };
const emptyPlugins: MarkdownPlugins = { remark: [], rehype: [] };
const samePlugins = (left: PluggableList, right: PluggableList) =>
  left.length === right.length && left.every((plugin, index) => plugin === right[index]);

export function useMarkdownPlugins(source: string) {
  const math = /\$|\\\[|\\\(/.test(source);
  const languages = [...new Set([...source.matchAll(/^[ \t]*(?:```|~~~)([a-z0-9+#-]+)/gim)].map(match => match[1]!.toLowerCase()))].sort().join(',');
  const [plugins, setPlugins] = useState<MarkdownPlugins>(emptyPlugins);
  useEffect(() => {
    if (!math && !languages) {
      setPlugins(current => current.remark.length || current.rehype.length ? emptyPlugins : current);
      return;
    }
    let active = true;
    void Promise.all([
      math ? import('./math-plugins') : null,
      languages ? import('./highlight-plugin').then(module => module.highlightPlugin(languages.split(','))) : null,
    ]).then(([m, c]) => {
      if (!active) return;
      const next = { remark: m ? [m.remarkMath] : [], rehype: [...(m ? [m.rehypeKatex] : []), ...(c ? [c] : [])] };
      setPlugins(current => samePlugins(current.remark, next.remark) && samePlugins(current.rehype, next.rehype) ? current : next);
    });
    return () => { active = false; };
  }, [math, languages]);
  return plugins;
}
