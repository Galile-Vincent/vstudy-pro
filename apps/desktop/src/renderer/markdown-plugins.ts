import { useEffect, useState } from 'react';
import type { PluggableList } from 'unified';
export function useMarkdownPlugins(source: string) {
  const math = /\$|\\\[|\\\(/.test(source);
  const code = /```|~~~/.test(source);
  const [plugins,setPlugins] = useState<{remark:PluggableList;rehype:PluggableList}>({remark:[],rehype:[]});
  useEffect(() => {
    let active=true;
    void Promise.all([math ? import('./math-plugins') : null, code ? import('rehype-highlight') : null]).then(([m,c]) => {
      if(active) setPlugins({remark:m ? [m.remarkMath] : [],rehype:[...(m ? [m.rehypeKatex] : []),...(c ? [[c.default,{detect:false}]] as PluggableList : [])]});
    });
    return () => {active=false;};
  },[math,code]);
  return plugins;
}
