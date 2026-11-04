import { useEffect, useState } from 'react';
import type { PluggableList } from 'unified';
export function useMarkdownPlugins(source: string) {
  const math = /\$|\\\[|\\\(/.test(source);
  const languages = [...new Set([...source.matchAll(/^[ \t]*(?:```|~~~)([a-z0-9+#-]+)/gim)].map(match=>match[1]!.toLowerCase()))].sort().join(',');
  const [plugins,setPlugins] = useState<{remark:PluggableList;rehype:PluggableList}>({remark:[],rehype:[]});
  useEffect(() => {
    let active=true;
    void Promise.all([math ? import('./math-plugins') : null, languages ? import('./highlight-plugin').then(module=>module.highlightPlugin(languages.split(','))) : null]).then(([m,c]) => {
      if(active) setPlugins({remark:m ? [m.remarkMath] : [],rehype:[...(m ? [m.rehypeKatex] : []),...(c ? [c] : [])]});
    });
    return () => {active=false;};
  },[math,languages]);
  return plugins;
}
