import { Button } from '@astryxdesign/core';
import { Toolbar } from '../components/ui';
import { Panel } from '../components/panel';
import type { ReactNode } from 'react';
import { FormField } from '../components/ui/form-field';
import { Select } from '../components/select';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Document } from '../../shared';
import type { z } from 'zod';
import type { folderSchema } from '../../shared/library';
import { tr, systemLanguage } from '../../shared/i18n';
import { useOptionalNavigation } from '../shell';
import { desktop } from '../bridge';
import { errorText, statusText } from '../status';
export function UploadCard({
  folders = [],
  onImported,
  showSample = true,
  showOpen = true,
  primary = true,
  title,
  footer,
}: {
  title?: string;
  footer?: ReactNode;
  showOpen?: boolean;
  primary?: boolean;
  showSample?: boolean;
  folders?: z.infer<typeof folderSchema>[];
  onImported?: (document: Document) => void;
}) {
  useTranslation();
  const navigation = useOptionalNavigation();
  const [imported, setImported] = useState<Document>();
  const [folderId, setFolderId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState(0);
  const [dropError, setDropError] = useState(false);
  const clearDropError = () => {
    if (dropError) { setError(''); setDropError(false); }
  };
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const lock = useRef(false);
  const owned = useRef(new Set<string>());
  useEffect(
    () =>
      desktop.onDocumentProgress?.((event) => {
        if (lock.current || owned.current.has(event.documentId))
          setMessage(event.code ? statusText({ code: event.code, params: event.params ?? {} }) : tr('home:converting'));
      }),
    []
  );
  const resetDrag = () => {
    dragDepth.current = 0;
    setDragging(false);
  };
  useEffect(() => {
    window.addEventListener('blur', resetDrag);
    window.addEventListener('dragend', resetDrag);
    return () => {
      window.removeEventListener('blur', resetDrag);
      window.removeEventListener('dragend', resetDrag);
    };
  }, []);
  const upload = async (paths?: string[], sample = false) => {
    clearDropError();
    if (lock.current) return;
    const destination = folders.find((folder) => folder.id === folderId)?.id ?? null;
    resetDrag();
    lock.current = true;
    setBusy(true);
    setError('');
    setMessage(tr('home:importing'));
    try {
      const results = paths
        ? await desktop.invoke('documents:importPaths', {
            paths,
            folderId: destination,
          })
        : null;
      const documents = results
        ? results.flatMap((r) => (r.ok ? [r.document] : []))
        : [
            await (sample
              ? desktop.invoke('documents:importSample', {
                  language: systemLanguage(document.documentElement.lang),
                })
              : desktop.invoke('documents:import', {
                  folderId: destination,
                })),
          ].filter((d): d is Document => !!d);
      const failed = results?.find((r) => !r.ok);
      if (failed && !failed.ok) setError(errorText(new Error(failed.error)));
      if (destination && documents.length)
        await desktop.invoke('library:documents:move', {
          documentIds: documents.map((d) => d.id),
          folderId: destination,
        });
      documents.forEach((d) => {
        owned.current.add(d.id);
        setImported(d);
        onImported?.(d);
      });
      setMessage(documents.length ? tr('home:imported') : '');
      window.dispatchEvent(new Event('activity-updated'));
      window.dispatchEvent(new Event('library-changed'));
    } catch (error) {
      setError(errorText(error));
      setMessage('');
    } finally {
      setBusy(false);
      lock.current = false;
    }
  };
  return (
    <div
      className="home-upload"
      data-dragging={dragging}
      onDragEnter={(e) => {
        clearDropError();
        if (busy || !e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        dragDepth.current++;
        setDragging(true);
      }}
      onDragLeave={() => {
        if (--dragDepth.current <= 0) resetDrag();
      }}
      onDragEnd={resetDrag}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        e.stopPropagation();
        resetDrag();
        setAnnouncement(value => value + 1);
        if (lock.current) {
          setMessage(tr('home:drop_busy'));
          return;
        }
        const paths = Array.from(e.dataTransfer.files, (file) => desktop.getPathForFile?.(file) ?? '');
        if (paths.length && paths.every(Boolean)) void upload(paths);
        else { setError(tr('home:drop_error')); setDropError(true); }
      }}
    >
      <Panel title={
        <span className="grid">
          <span className={dragging ? 'invisible [grid-area:1/1]' : '[grid-area:1/1]'}>{title ?? tr('home:upload')}</span>
          <span className={dragging ? '[grid-area:1/1]' : 'invisible [grid-area:1/1]'} aria-hidden={!dragging}>
            {tr('home:drop_to_import')}
          </span>
        </span>
      }>
        <div className="home-panel-body">
        <p>{tr('home:upload_hint')}</p>
        <p>{tr('onboarding:file_help')}</p>
        {!!folders.length && (
          <FormField label={tr('home:destination')}>
            {(control) => (
              <Select
                {...control}
                aria-label={tr('home:destination')}
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
                disabled={busy}
              >
                <option value="">{tr('library:unfiled')}</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        )}
        <div className="flex flex-col gap-[var(--space-2)]">
          <Toolbar
            className="gap-[var(--space-2)]"
            left={
              <>
                <Button variant={primary ? 'primary' : 'secondary'} label={tr('home:choose_file')} isDisabled={busy} onClick={() => void upload()} />
                {showSample && (
                  <Button variant="ghost" label={tr('onboarding:sample')} isDisabled={busy} onClick={() => void upload(undefined, true)} />
                )}
              </>
            }
          />
          <div role="status" className="upload-status flex flex-col gap-[var(--space-2)]">
            {busy && <progress aria-label={tr('home:importing')} />}
            <div key={announcement}>
              {error && <div role="alert">{error}</div>}
              {message && <div>{message}</div>}
            </div>
          </div>
        </div>
        {showOpen && imported && navigation && (
          <Button variant="secondary" label={tr('home:open_imported', { title: imported.title })} onClick={() => navigation.navigate({ view: 'workspace', documentId: imported.id })} />
        )}
        {footer}
        </div>
      </Panel>
    </div>
  );
}
