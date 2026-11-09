import { FormField } from '../components/ui/form-field';
import { Button } from '../components/ui/button';
import { Select } from "../components/select";
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload } from 'lucide-react';
import type { Document } from '../../shared';
import type { z } from 'zod';
import type { folderSchema } from '../../shared/library';
import { tr } from '../../shared/i18n';
import { useOptionalNavigation } from '../shell';
import { desktop } from '../bridge';
import { errorText, statusText } from '../status';
export function UploadCard({ folders = [], onImported, showSample = true, showOpen = true }: { showOpen?: boolean; showSample?: boolean; folders?: z.infer<typeof folderSchema>[]; onImported?: (document: Document) => void }) {
  useTranslation();
  const navigation = useOptionalNavigation();
  const [imported, setImported] = useState<Document>();
  const [folderId, setFolderId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const lock = useRef(false);
  const owned = useRef(new Set<string>());
  useEffect(() => desktop.onDocumentProgress?.(event => { if (lock.current || owned.current.has(event.documentId)) setMessage(event.code ? statusText({code:event.code,params:event.params ?? {}}) : tr('home:converting')); }), []);
  const upload = async (paths?: string[], sample = false) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage(tr('home:importing'));
    try {
      const results = paths ? await desktop.invoke('documents:importPaths', { paths, folderId: folders.find(f => f.id === folderId)?.id ?? null }) : null;
      const documents = results ? results.flatMap(r => r.ok ? [r.document] : []) : [await (sample ? desktop.invoke('documents:importSample', {
        language: document.documentElement.lang.startsWith('ja') ? 'ja'
          : document.documentElement.lang.startsWith('zh') ? 'zh-Hant' : 'en',
      }) : desktop.invoke('documents:import', {
        folderId: folders.find(f => f.id === folderId)?.id ?? null,
      }))].filter((d): d is Document => !!d);
      const failed = results?.find(r => !r.ok);
      if (failed && !failed.ok) setError(errorText(new Error(failed.error)));
      if (folderId && documents.length) await desktop.invoke('library:documents:move', { documentIds: documents.map(d => d.id), folderId: folders.find(f => f.id === folderId)!.id });
      documents.forEach(d => { owned.current.add(d.id); setImported(d); onImported?.(d); });
      setMessage(documents.length ? tr('home:imported') : '');
      window.dispatchEvent(new Event('activity-updated')); window.dispatchEvent(new Event('library-changed'));
    } catch (error) { setError(errorText(error)); setMessage(''); }
    finally { setBusy(false); lock.current = false; }
  };
  return <div className="home-upload" onDragOver={e => { e.preventDefault(); e.stopPropagation(); }} onDrop={e => {
    e.preventDefault(); e.stopPropagation();
    if (lock.current) return;
    const paths = Array.from(e.dataTransfer.files, file => desktop.getPathForFile?.(file) ?? '');
    if (paths.length && paths.every(Boolean)) void upload(paths); else setError(tr('home:drop_error'));
  }}>
    <Upload aria-hidden="true"/><p>{tr('home:upload_hint')}</p>
    <p>{tr('onboarding:file_help')}</p>
    {!!folders.length && <FormField label={tr('home:destination')}>
      {control => <Select {...control} aria-label={tr('home:destination')}
        value={folderId} onChange={e => setFolderId(e.target.value)} disabled={busy}>
        <option value="">{tr('library:unfiled')}</option>
        {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
      </Select>}
    </FormField>}
    <Button variant="outline" className="primary" disabled={busy} onClick={() => void upload()}>{tr('home:choose_file')}</Button>
    {showSample && <Button variant="outline" className="ghost" disabled={busy} onClick={() => void upload(undefined, true)}>{tr('onboarding:sample')}</Button>}

    {showOpen && imported && navigation && <Button variant="outline" onClick={() => navigation.navigate({ view: 'workspace', documentId: imported.id })}>{tr('home:open_imported', { title: imported.title })}</Button>}
    {busy && <progress aria-label={tr('home:importing')}/>}{message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </div>;
}
