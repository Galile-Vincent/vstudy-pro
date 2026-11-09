/** Theme authoring edits hex tokens only. Dialog cancellation restores persisted appearance. */
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { ZodError } from 'zod';
import { type Settings } from '../../shared';
import { builtinThemes, contrastFailures, importTheme, tokenNames, type ThemePack, type ColorScheme } from '../../shared/themes';
import { tr } from '../../shared/i18n';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { ThemePreview } from './theme-preview';
import { applyAppearance, applyTheme } from './apply-appearance';

function themeError(error: unknown): string {
  if (error instanceof SyntaxError) return tr('themes:invalid_json');
  if (error instanceof ZodError) {
    if (error.issues.some(issue => issue.code === 'unrecognized_keys')) return tr('themes:unknown_field');
    if (error.issues.some(issue => issue.path[0] === 'id')) return tr('themes:invalid_id');
    if (error.issues.some(issue => issue.path[0] === 'name')) return tr('themes:invalid_name');
    return tr('themes:invalid');
  }
  const code = error instanceof Error ? error.message : '';
  return tr(code === 'THEME_RESERVED_ID' ? 'themes:reserved_id' :
    code === 'THEME_TOO_LARGE' ? 'themes:too_large' :
    code === 'THEME_LIMIT' ? 'themes:limit' : 'themes:save_failed');
}

type ThemeActions = { onClose: () => void; onSave: (theme: ThemePack) => Promise<Settings | undefined> };

export function ThemeEditor({theme,settings,onClose,onSave}: ThemeActions & { theme: ThemePack; settings: Settings }) {
  const restore = useRef(settings);
  const [draft,setDraft] = useState(theme);
  const [scheme,setScheme] = useState<ColorScheme>('light');
  const [error,setError] = useState('');
  const errorId = useId();
  const [saving,setSaving] = useState(false);
  useEffect(() => {
    applyTheme({...settings,colorScheme:scheme},draft);
    return () => applyAppearance(restore.current);
  }, [draft,scheme,settings]);
  const controlTheme=builtinThemes.find(t=>t.id===settings.themeId) ?? builtinThemes[0]!;
  const controlStyle=Object.fromEntries(Object.entries(controlTheme[scheme]).map(([key,value])=>[`--${key==='sidebar'?'sidebar-surface':key}`,value])) as CSSProperties;
  const warnings = (['light','dark'] as const).flatMap(s => contrastFailures(draft[s]).map(w => `${tr(`themes:${s}`)} ${w}`));
  const save = async () => {
    setSaving(true);
    try {
      const parsed=importTheme(JSON.stringify(draft));
      const saved = await onSave(parsed);
      if (saved) {restore.current=saved;onClose();} else setError(tr('themes:save_failed'));
    } catch (error) { setError(themeError(error)); }
    finally { setSaving(false); }
  };
  return <Dialog open onOpenChange={open => {if (!open) onClose();}}><DialogContent className="theme-editor" style={controlStyle}>
    <DialogTitle>{tr('themes:editor')}</DialogTitle><DialogDescription>{tr('themes:editor_hint')}</DialogDescription>
    <label className="theme-field">{tr('themes:name')}<input aria-invalid={!!error} aria-describedby={error ? errorId : undefined} value={draft.name} maxLength={60} onChange={e => setDraft({...draft,name:e.target.value})}/></label>
    <div className="theme-editor-schemes">{(['light','dark'] as const).map(s => <button type="button" key={s} aria-pressed={scheme===s} onClick={() => setScheme(s)}>{tr(`themes:${s}`)}</button>)}</div>
    <ThemePreview theme={draft} scheme={scheme}/>
    <div className="theme-color-fields">{tokenNames.map(key => <label key={key}><span>{tr(`themes:token_${key}`)}</span><input type="color" aria-label={tr(`themes:token_${key}`)} value={draft[scheme][key]}
      onChange={e => setDraft({...draft,[scheme]:{...draft[scheme],[key]:e.target.value},orbs:{...draft.orbs,[scheme]:[key==='surface'?e.target.value:draft[scheme].surface,key==='accent-color'?e.target.value:draft[scheme]['accent-color']]}})}/><code>{draft[scheme][key]}</code></label>)}</div>
    <div className="theme-contrast-result" role="status"><p>{tr(warnings.length ? 'themes:contrast_warning' : 'themes:contrast_pass',{count:warnings.length})}</p>
      {warnings.length > 0 && <details><summary>{tr('themes:details')}</summary><ul>{warnings.map(w => <li key={w}>{w}</li>)}</ul></details>}</div>
    {error && <p id={errorId} role="alert">{error}</p>}
    <footer><button type="button" onClick={onClose}>{tr('common:cancel')}</button><button type="button" className="primary" disabled={saving || !draft.name.trim()} onClick={() => void save()}>{tr('themes:save')}</button></footer>
  </DialogContent></Dialog>;
}

export function ThemeTransfer({theme,onClose,onSave,existing=[]}: ThemeActions & { theme: ThemePack | 'import'; existing?: ThemePack[] }) {
  const exporting=theme !== 'import';
  const [overwrite,setOverwrite] = useState<ThemePack>();
  const limited = existing.length >= 30;
  const [json,setJson] = useState(exporting ? JSON.stringify(theme,null,2) : '');
  const [error,setError] = useState('');
  const errorId = useId();
  const [message,setMessage] = useState('');
  const [saving,setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      const parsed = importTheme(json);
      if (existing.some(t => t.id === parsed.id)) {setOverwrite(parsed);return;}
      if (limited) {setError(tr('themes:limit'));return;}
      if (await onSave(parsed)) onClose(); else setError(tr('themes:save_failed'));
    }
    catch (error) { setError(themeError(error)); }
    finally { setSaving(false); }
  };
  return <Dialog open onOpenChange={open => {if (!open) onClose();}}><DialogContent className="theme-transfer">
    <DialogTitle>{tr(exporting?'themes:export':'themes:add')}</DialogTitle><DialogDescription>{tr('themes:json_hint')}</DialogDescription>
    {!exporting && <label className="theme-field">{tr('themes:choose_file')}<input type="file" accept=".json,application/json" onChange={e => {
      const file=e.target.files?.[0]; if (!file) return;
      if (file.size>32768) {setError(tr('themes:too_large')); return;}
      void file.text().then(value => {setJson(value);setError('');}).catch(() => setError(tr('themes:read_failed')));
    }}/></label>}
    <label className="theme-field">{tr('themes:json')}<textarea aria-invalid={!!error} aria-describedby={error ? errorId : undefined} aria-label={tr('themes:json')} value={json} readOnly={exporting} maxLength={32768} rows={14} onChange={e => {setJson(e.target.value);setError('');}}/></label>
    {limited && <p role="status">{tr('themes:limit')}</p>}
    {overwrite && <Dialog open onOpenChange={open => {if (!open) setOverwrite(undefined);}}>
      <DialogContent><DialogTitle>{tr('themes:overwrite',{name:overwrite.name})}</DialogTitle>
        <DialogDescription>{tr('themes:overwrite_copy')}</DialogDescription>
        <Button variant="secondary" onClick={() => setOverwrite(undefined)}>{tr('common:cancel')}</Button>
        <Button onClick={() => void (async () => {
          try {if (await onSave(overwrite)) onClose();else setError(tr('themes:save_failed'));}
          catch {setError(tr('themes:save_failed'));}
          setOverwrite(undefined);
        })()}>{tr('themes:save')}</Button>
      </DialogContent>
    </Dialog>}
    {error && <p id={errorId} role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <footer><button type="button" onClick={onClose}>{tr('common:cancel')}</button>{exporting ? <>
      <button type="button" onClick={() => {void navigator.clipboard.writeText(json).then(() => setMessage(tr('themes:copied'))).catch(() => setError(tr('themes:copy_hint')));}}>{tr('themes:copy')}</button>
      <button type="button" onClick={() => {
        const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));
        const a=document.createElement('a');a.href=url;a.download=`${theme.id}.json`;a.click();setTimeout(() => URL.revokeObjectURL(url),1000);
      }}>{tr('themes:download')}</button>
    </> : <button type="button" className="primary" disabled={saving || limited || !json.trim()} onClick={() => void save()}>{tr('themes:import')}</button>}</footer>
  </DialogContent></Dialog>;
}
