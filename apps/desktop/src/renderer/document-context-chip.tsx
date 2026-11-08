import type { DocumentContextAttachment } from '../shared/domain';
import { tr } from '../shared/i18n';
import { contextLabel } from './document-context';
import './document-original.css';
export function DocumentContextChip({context,onRemove}:{context:DocumentContextAttachment;onRemove:()=>void}) {
  return <div className="document-context-chip"><img src={context.image} alt=""/><span>{contextLabel(context)}<br/>{tr(context.kind==='region'?'library:original.region':'library:original.page')}</span><button type="button" aria-label={tr('library:original.remove')} onClick={onRemove}>×</button></div>;
}
