import { createLowlight } from 'lowlight';
import type { LanguageFn } from 'highlight.js';
import type { Element, Root } from 'hast';
const modules = import.meta.glob<{default:LanguageFn}>(['../../node_modules/highlight.js/lib/languages/*.js','!**/*.js.js']);
const aliases: Record<string,string> = {js:'javascript',ts:'typescript',py:'python',sh:'bash',html:'xml',md:'markdown',yml:'yaml',cs:'csharp',c:'c',cpp:'cpp',rb:'ruby',rs:'rust'};
export async function highlightPlugin(languages:string[]) {
  const lowlight=createLowlight();
  await Promise.all(languages.map(async name => {
    const canonical=aliases[name] ?? name;
    const load=modules[`../../node_modules/highlight.js/lib/languages/${canonical}.js`];
    if(load) lowlight.register(name,(await load()).default);
  }));
  return () => (tree:Root) => {
    const visit=(node:Root | Element) => {
      if(node.type==='element' && node.tagName==='code') {
        const classes=Array.isArray(node.properties.className) ? node.properties.className : [];
        const language=classes.map(String).find(value=>value.startsWith('language-'))?.slice(9);
        if(language && lowlight.registered(language) && node.children.every(child=>child.type==='text')) {
          node.children=lowlight.highlight(language,node.children.map(child=>child.type==='text' ? child.value : '').join('')).children.filter(child=>child.type==='element' || child.type==='text');
          node.properties.className=[...classes,'hljs'];
        }
      }
      for(const child of node.children) if(child.type==='element') visit(child);
    };
    visit(tree);
  };
}
