import { useTranslation } from "react-i18next";
import { tr } from '../shared/i18n';
import { useAuiState, type SourceMessagePartComponent, type ToolCallMessagePartComponent } from '@assistant-ui/react';
import { lazy, Suspense } from 'react';
import { documentCitationSchema, type DocumentCitation } from '../shared';
import { presentationSchema } from '../shared/presentation';
import { Sources } from './components/assistant-ui/elements/sources.aui';
import { Citation } from './components/assistant-ui/elements/inline-citation';
import { ToolFallback } from './components/assistant-ui/elements/tool-fallback.aui';
const DocumentPresentation = lazy(() => import('./document-presentation')); 

export function jumpToCitation(citation: DocumentCitation) {
  window.dispatchEvent(new CustomEvent('vstudy:document-citation', {detail:citation}));
}
export const DocumentSource: SourceMessagePartComponent = props => {
  useTranslation();
  const citation = documentCitationSchema.safeParse(props.providerMetadata?.vstudy);
  if (!citation.success) return <Sources {...props} />;
  return <button type="button" className="document-source" aria-label={tr('common:goto',{title:props.title})} onClick={() => jumpToCitation(citation.data)}><Sources {...props} /></button>;
};
export function DocumentCitationLink({ id, children }: {id:string;children:React.ReactNode}) {
  useTranslation();
  const raw = useAuiState(s => s.message.metadata.custom.citations);
  const citations = documentCitationSchema.array().safeParse(raw);
  const index = citations.success ? citations.data.findIndex(c => c.id === id) : -1;
  const citation = citations.success ? citations.data[index] : undefined;
  return citation ? <Citation data-slot="document-citation" index={index} source={{title:citation.title,snippet:citation.quote}} onClick={() => jumpToCitation(citation)} /> : <span>{children}</span>;
}
export const DocumentTool: ToolCallMessagePartComponent = props => {
  useTranslation();
  const result = presentationSchema.safeParse(props.args);
  if (props.toolName !== 'present' || props.isError || !props.result || !result.success) return <ToolFallback {...props} />;
  return <Suspense fallback={<span role="status">{tr('common:loading_table')}</span>}><DocumentPresentation presentation={result.data} /></Suspense>;
};
