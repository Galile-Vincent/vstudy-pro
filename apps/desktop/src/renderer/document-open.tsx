import { useEffect, useState } from 'react';
import { documentOpenMethodSchema, type DocumentOpenMethod, type Document } from '../shared/domain';
import { tr } from '../shared/i18n';
import { desktop } from './bridge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { Button } from './components/ui/button';
import './document-open.css';

export type DocumentAction = {kind: 'open'; method: DocumentOpenMethod} | {kind: 'download'} | {kind: 'save'};

export async function openDocument(documentId: Document['id'], read: () => void, method?: DocumentOpenMethod) {
  const selected = method ?? (await desktop.invoke('settings:get', {})).documentOpenMethod;
  if (selected === 'original') await desktop.invoke('library:openOriginal', {documentId});
  else read();
}

export async function performDocumentAction(documentId: Document['id'], read: () => void, action?: DocumentAction) {
  if (action?.kind === 'save') return 'saved';
  if (action?.kind === 'download') {
    const result = await desktop.invoke('library:exportOriginal', {documentId});
    return result.saved ? 'downloaded' : 'cancelled';
  }
  await openDocument(documentId, read, action?.method);
  return 'opened';
}

export type DocumentOutcome = Awaited<ReturnType<typeof performDocumentAction>>;

export function OpenMethodSelect({value, onChange, disabled = false}: {value: DocumentOpenMethod; onChange: (value: DocumentOpenMethod) => void; disabled?: boolean}) {
  const label = value === 'original' ? tr('library:openOriginal') : tr('library:openReader');
  return <Select value={value} disabled={disabled} onValueChange={next => onChange(documentOpenMethodSchema.parse(next))}>
    <SelectTrigger aria-label={tr('library:openMethod')}><SelectValue>{label}</SelectValue></SelectTrigger>
    <SelectContent>
      <SelectItem value="original">{tr('library:openOriginal')}</SelectItem>
      <SelectItem value="reader">{tr('library:openReader')}</SelectItem>
    </SelectContent>
  </Select>;
}

export function CourseFileActions({name, disabled, onAction}: {name: string; disabled: boolean; onAction: (action: DocumentAction) => Promise<DocumentOutcome | undefined>}) {
  const [method, setMethod] = useState<DocumentOpenMethod>('reader');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true;
    void desktop.invoke('settings:get', {}).then(settings => {if (active) {setMethod(settings.documentOpenMethod); setReady(true);}}).catch(() => {if (active) setError(tr('errors:generic'));});
    return () => {active = false;};
  }, []);
  const run = async (action: DocumentAction) => {
    setError(''); setNotice('');
    const result = await onAction(action);
    if (!result) setError(tr('errors:generic'));
    if (result === 'saved') setNotice(tr('library:savedToLibrary'));
    if (result === 'downloaded') setNotice(tr('library:downloadedCopy'));
  };
  return <div className="course-file-actions" role="group" aria-label={name}>
    <p>{name}</p>
    <div className="course-file-open-method"><span>{tr('library:openAs')}</span><OpenMethodSelect value={method} onChange={setMethod} disabled={disabled || !ready}/></div>
    <Button disabled={disabled || !ready} onClick={() => void run({kind:'open', method})}>{tr('library:open')}</Button>
    <Button variant="outline" disabled={disabled} onClick={() => void run({kind:'download'})}>{tr('library:downloadCopy')}</Button>
    <Button variant="outline" disabled={disabled} onClick={() => void run({kind:'save'})}>{tr('library:saveToLibrary')}</Button>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
  </div>;
}
