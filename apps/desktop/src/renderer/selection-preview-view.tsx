import { useTranslation } from 'react-i18next';
import { tr } from '../shared/i18n';
import type { Selection } from '../shared';
import { plainSelection } from './selection-preview';
export function SelectionPreview({ selection }: { selection: Selection }) {
  useTranslation();
  const plain = plainSelection(selection.text.replace(/^#{1,6} .*\n?/, ''));
  return <details className="selection-preview"><summary><strong>{selection.headingPath.join(' › ') || tr('common:selected_passage')}</strong><span>{plain.slice(0,160)}{plain.length>160 ? '…' : ''}</span></summary><div>{plain}</div></details>;
}
