import { useAuiState } from '@assistant-ui/react';
import { MarkdownText as VendorMarkdown } from './components/assistant-ui/elements/markdown-text';
import { useMarkdownPlugins } from './markdown-plugins';
import { contentLanguage } from '../shared/content-language';
import { documentCitationSchema } from '../shared';
import { DocumentCitationLink } from './document-elements';
import { externalUrlSchema } from '../shared/ipc';
import { desktop } from './bridge';
import { schema } from './markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
const components = {
 a: ({href,children}: React.ComponentProps<'a'>) => href?.startsWith('#vstudy-cite-') ? <DocumentCitationLink id={href.slice(13)}>{children}</DocumentCitationLink> : <a href={href} onClick={event=>{event.preventDefault();if(href)void desktop.invoke('shell:openExternal',{url:href});}}>{children}</a>,
 pre: ({children,...props}: React.ComponentProps<'pre'>) => <pre {...props} tabIndex={0}>{children}</pre>,
};
export function MarkdownText() {
 const text = useAuiState(s=>s.message.content.filter(p=>p.type==='text').map(p=>p.text).join(''));
 const raw = useAuiState(s=>s.message.metadata.custom.citations);
 const refs = documentCitationSchema.array().safeParse(raw).data??[];
 const plugins = useMarkdownPlugins(text);
 return <VendorMarkdown components={components} markdownProps={{remarkPlugins:[remarkGfm,...plugins.remark],rehypePlugins:[[rehypeSanitize,schema],...plugins.rehype],skipHtml:true,smooth:false,containerProps:{lang:contentLanguage(text)},preprocess:value=>value.replace(/\[\[cite:(s\d+)\]\]/g,(marker,id:string)=>refs.some(c=>c.id===id)?`[source](#vstudy-cite-${id})`:marker),urlTransform:url=>/^#vstudy-cite-s\d+$/.test(url)||externalUrlSchema.safeParse(url).success?url:''}}/>;
}
