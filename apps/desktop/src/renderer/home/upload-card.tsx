import { Select } from "../components/select";
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload } from 'lucide-react';
import type { Document } from '../../shared';
import type { z } from 'zod';
import type { folderSchema } from '../../shared/library';
import { tr } from '../../shared/i18n';
import { desktop } from '../bridge';
import { statusText } from '../status';
export function UploadCard({ folders = [], onImported, showSample = true }: { showSample?: boolean; folders?: z.infer<typeof folderSchema>[]; onImported?: (document: Document) => void }) {
  useTranslation();
  const [folderId, setFolderId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const lock = useRef(false);
  const owned = useRef(new Set<string>());
  useEffect(() => desktop.onDocumentProgress?.(event => { if (lock.current || owned.current.has(event.documentId)) setMessage(event.code ? statusText({code:event.code,params:event.params ?? {}}) : tr('home:converting')); }), []);
  const upload = async (paths?: string[]) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage(tr('home:importing'));
    try {
      const results = paths ? await desktop.invoke('documents:importPaths', { paths }) : null;
      const documents = results ? results.flatMap(r => r.ok ? [r.document] : []) : [await desktop.invoke('documents:import', {})].filter((d): d is Document => !!d);
      if (results?.some(r => !r.ok)) setError(tr('errors:conversion_failed'));
      if (folderId && documents.length) await desktop.invoke('library:documents:move', { documentIds: documents.map(d => d.id), folderId: folders.find(f => f.id === folderId)!.id });
      documents.forEach(d => { owned.current.add(d.id); onImported?.(d); });
      setMessage(documents.length ? tr('home:imported', { count: documents.length }) : '');
      window.dispatchEvent(new Event('activity-updated'));
    } catch { setError(tr('errors:generic')); setMessage(''); }
    finally { setBusy(false); lock.current = false; }
  };
  return <div className="home-upload" onDragOver={e => { e.preventDefault(); e.stopPropagation(); }} onDrop={e => {
    e.preventDefault(); e.stopPropagation();
    const paths = Array.from(e.dataTransfer.files, file => desktop.getPathForFile?.(file) ?? '');
    if (paths.length && paths.every(Boolean)) void upload(paths); else setError(tr('home:drop_error'));
  }}>
    <Upload aria-hidden="true"/><p>{tr('home:upload_hint')}</p>
    <label>{tr('home:destination')}<Select value={folderId} onChange={e => setFolderId(e.target.value)} disabled={busy}><option value="">{tr('library:unfiled')}</option>{folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</Select></label>
    <button className="primary" disabled={busy} onClick={() => void upload()}>{tr('home:choose_file')}</button>
    {showSample && <button className="ghost" disabled={busy} onClick={() => { setBusy(true); void desktop.invoke('documents:importSample', {language:document.documentElement.lang.startsWith('ja') ? 'ja' : document.documentElement.lang.startsWith('zh') ? 'zh-Hant' : 'en'}).then(d => { onImported?.(d); window.dispatchEvent(new Event('activity-updated')); }).catch(() => setError(tr('errors:generic'))).finally(() => setBusy(false)); }}>{tr('onboarding:sample')}</button>}

    {busy && <progress aria-label={tr('home:importing')}/>}{message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </div>;
}
