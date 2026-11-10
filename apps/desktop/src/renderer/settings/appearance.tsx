/** Appearance settings compose complete theme packs with independent reading preferences. */
import { errorText } from '../status';
import { useTrailingCommit } from './use-trailing-commit';
import { track } from '../analytics';
import { useEffect, useRef, useState } from 'react';
import { Copy, Pencil, Plus, Check, Trash2 } from 'lucide-react';
import { type Settings } from '../../shared';
import { builtinThemes, resolveTheme, type ThemePack } from '../../shared/themes';
import { tr } from '../../shared/i18n';
import { desktop } from '../bridge';
import { Card, Section, SettingRow, SegmentedControl, SegmentedControlItem } from '../components/ui';
import { Select } from '../components/select';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { applyAppearance } from './apply-appearance';
import { ThemeEditor, ThemeTransfer } from './theme-editor';
import './appearance.css';
import { ThemePreview } from './theme-preview';

export function AppearanceSection() {
  const commits = useTrailingCommit();
  const [settings, setSettings] = useState<Settings>();
  const sliderSaved = useRef<Partial<Record<'contrast' | 'glassOpacity',number>>>({});
  const pending = useRef<Promise<void>>(Promise.resolve());
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<ThemePack>();
  const [message, setMessage] = useState('');
  const schemeRef = useRef<HTMLButtonElement>(null);
  const focusAfterDelete = useRef(false);
  useEffect(() => {
    if (!deleting && focusAfterDelete.current) {
      focusAfterDelete.current = false;
      schemeRef.current?.focus();
    }
  }, [deleting]);
  const [editor, setEditor] = useState<ThemePack>();
  const [transfer, setTransfer] = useState<ThemePack | 'import'>();
  useEffect(() => {
    void desktop.invoke('settings:get', {}).then(value => {setSettings(value);sliderSaved.current={contrast:value.contrast,glassOpacity:value.glassOpacity};}).catch(() => setError(tr('errors:generic')));
  }, []);

  const update = (patch: Partial<Settings>) => {
    setMessage('');
    const operation = pending.current.then(async () => {
      try {
        const latest = await desktop.invoke('settings:get', {});
        const next = await desktop.invoke('settings:set', { ...latest, ...patch });
        applyAppearance(next, true);
        if (patch.colorScheme && patch.colorScheme !== latest.colorScheme) track('theme_changed', {theme:next.colorScheme});
        setSettings(next);
        setError('');
        return next;
      } catch (error) { setError(errorText(error)); return undefined; }
    });
    pending.current = operation.then(() => undefined);
    return operation;
  };
  const saveTheme = async (theme: ThemePack, select = true) => {
    const latest = await desktop.invoke('settings:get', {});
    if (latest.customThemes.length >= 30 && !latest.customThemes.some(t => t.id === theme.id)) {
      throw new Error('THEME_LIMIT');
    }
    return update({ ...(select ? {themeId: theme.id} : {}),
      customThemes: [...latest.customThemes.filter(t => t.id !== theme.id), theme] });
  };
  const toggles = (field: 'uiScale' | 'density' | 'readerSize', values: readonly (string | number)[]) => (
    <SegmentedControl type="single" aria-label={tr(`settings:${field}`)} value={String(settings?.[field] ?? '')}
      onValueChange={value => { if (value) void update({[field]:field === 'uiScale' ? Number(value) : value}); }}
    >
      {values.map(value => <SegmentedControlItem key={value} value={String(value)}>
        {field === 'uiScale' ? `${value}%` : tr(`settings:${value}`)}
      </SegmentedControlItem>)}
    </SegmentedControl>
  );
  if (!settings) return error ? <p role="alert">{error}</p> : <p role="status">{tr('themes:loading')}</p>;
  const theme = resolveTheme(settings);
  const packs = [...builtinThemes,...settings.customThemes];
  const commitSlider = (field: 'contrast' | 'glassOpacity', value: number) => {
    if (sliderSaved.current[field] === value) return;
    const previous = sliderSaved.current[field] ?? settings[field];
    sliderSaved.current[field] = value;
    void update({[field]:value}).then(saved => {if (!saved) sliderSaved.current[field] = previous;});
  };
  const slider = (field: 'contrast' | 'glassOpacity') => <SettingRow htmlFor={`appearance-${field}`} key={field} label={tr(`themes:${field}`)} description={tr(`themes:${field}_hint`)}>
    <label className="theme-slider"><output>{settings[field]}%</output><input id={`appearance-${field}`} type="range" min={field === 'contrast' ? 100 : 50} max={field === 'contrast' ? 150 : 100} step="1"
      aria-label={tr(`themes:${field}`)} aria-valuetext={`${settings[field]}%`} value={settings[field]} onChange={e => { const value=Number(e.target.value); const next={...settings,[field]:value}; setSettings(next); applyAppearance(next, false); commits.schedule(field,()=>commitSlider(field,value)); }}
      onPointerUp={e => commitSlider(field,Number(e.currentTarget.value))} onKeyDown={e => {if (e.key === 'Enter' || e.key === 'Escape') commits.flush(field);}} onBlur={e => commitSlider(field,Number(e.currentTarget.value))}/></label>
  </SettingRow>;
  return <div className="appearance-layout">
    <Section level={3} title={tr('themes:scheme')}>
      <div className="scheme-grid">
        {(['system','light','dark'] as const).map(scheme => <button type="button" key={scheme} className="scheme-card" ref={scheme === 'system' ? schemeRef : undefined}
          aria-pressed={settings.colorScheme === scheme} onClick={() => void update({colorScheme:scheme})}>
          <ThemePreview theme={theme} scheme={scheme}/>
          <span className="scheme-card-label">{tr(`themes:${scheme}`)}<span className="scheme-card-check" aria-hidden="true">{settings.colorScheme === scheme && <Check/>}</span></span>
        </button>)}
      </div>
    </Section>
    <Card variant="flat" className="gap-[var(--space-4)] p-[var(--space-4)]">
      <SettingRow label={tr('themes:cardTransparency')} description={tr('themes:cardTransparency_hint')}>
        <SegmentedControl type="single" aria-label={tr('themes:cardTransparency')} value={settings.cardTransparency}
          onValueChange={value => { if (value) void update({cardTransparency:value as Settings['cardTransparency']}); }}
        >
          {(['solid','soft','glass'] as const).map(value => <SegmentedControlItem key={value} value={value}>{tr(`themes:card_${value}`)}</SegmentedControlItem>)}
        </SegmentedControl>
      </SettingRow>
      {slider('contrast')}
    </Card>
    <Section level={3} title={tr('settings:text_reading')}><Card variant="flat" className="gap-[var(--space-4)] p-[var(--space-4)]">
      {(['uiScale','density','readerFont','readerSize'] as const).map(field => <SettingRow {...(field === 'readerFont' ? {htmlFor:'appearance-reader-font'} : {})} key={field} label={tr(`settings:${field}`)}>
        {field === 'readerFont' ? <Select id="appearance-reader-font" aria-label={tr('settings:readerFont')} value={settings.readerFont} onChange={e => void update({readerFont:e.target.value as Settings['readerFont']})}>
          {['system','serif','mono'].map(v => <option key={v} value={v}>{tr(`settings:${v}`)}</option>)}
        </Select> : field === 'uiScale' ? toggles(field,[100,125,150,200]) : field === 'density' ? toggles(field,['comfortable','compact']) : toggles(field,['s','m','l','xl'])}
      </SettingRow>)}
      <div className="appearance-preview"><h3>{tr('settings:sampleTitle')}</h3><p className="preview-reader">{tr('settings:sampleReader')}<br/>{tr('settings:sampleCjk')}</p><p className="preview-chat">{tr('settings:sampleChat')}</p><span className="preview-selected">{tr('themes:selection')}</span></div>
    </Card></Section>
    <Section level={3} title={tr('themes:themes')}>
      <div className="themes-grid">
        {packs.map(pack => <div className="theme-card" key={pack.id} data-selected={settings.themeId === pack.id}>
          <button type="button" className="theme-select" aria-pressed={settings.themeId === pack.id} onClick={() => void update({themeId:pack.id})}>
            <span className="theme-orbs" aria-hidden="true">{(['light','dark'] as const).map(s => <span key={s} className="theme-orb" style={{background:pack.orbs[s][1]}}/>)}</span>
            <span className="theme-name">{builtinThemes.some(t => t.id === pack.id) ? tr(`themes:name_${pack.id}`) : pack.name}</span>
            {settings.themeId === pack.id && <Check className="theme-check" aria-hidden="true"/>}
          </button>
          <div className="theme-card-tools">
            {settings.customThemes.some(t => t.id === pack.id) && <button type="button" aria-label={tr('themes:delete_named',{name:pack.name})} onClick={() => {setError('');setMessage('');setDeleting(pack);}}><Trash2/></button>}
            {settings.customThemes.some(t => t.id === pack.id) && <button type="button" aria-label={tr('themes:edit_named',{name:pack.name})} onClick={() => setEditor(pack)}><Pencil/></button>}
            <button type="button" aria-label={tr('themes:export_named',{name:pack.name})} onClick={() => setTransfer({...pack,id:`custom-${crypto.randomUUID()}`})}><Copy/></button>
          </div>
        </div>)}
      </div>
    </Section>
    <details className="settings-disclosure">
      <summary>{tr('settings:advanced')}</summary>
      <div className="settings-disclosure-body">
        <Card variant="flat" className="gap-[var(--space-4)] p-[var(--space-4)]">
          {slider('glassOpacity')}
          <SettingRow label={tr('themes:custom')} description={tr('themes:custom_hint')}>
            <Button size="sm" variant="secondary" disabled={settings.customThemes.length >= 30} onClick={() => setEditor({...theme, id:`custom-${crypto.randomUUID()}`,name:tr('themes:untitled')})}><Pencil/>{tr('themes:create')}</Button>
            <Button size="sm" variant="secondary" disabled={settings.customThemes.length >= 30} onClick={() => setTransfer('import')}><Plus/>{tr('themes:add')}</Button>
          </SettingRow>
        </Card>
      </div>
    </details>
    {settings.customThemes.length >= 30 && <p role="status">{tr('themes:limit')}</p>}
    {message && <p role="status">{message}</p>}
    {deleting && <Dialog open onOpenChange={open => {if (!open) setDeleting(undefined);}}>
      <DialogContent><DialogTitle>{tr('themes:delete_named',{name:deleting.name})}</DialogTitle>
        <DialogDescription>{tr('themes:delete_copy',{name:deleting.name})}</DialogDescription>
        {error && <p role="alert">{error}</p>}
        <Button variant="secondary" onClick={() => {setError('');setDeleting(undefined);}}>{tr('common:cancel')}</Button>
        <Button variant="destructive" onClick={() => void (async () => {
          const active = settings.themeId === deleting.id;
          const saved = await update({customThemes:settings.customThemes.filter(t => t.id !== deleting.id),
            ...(active ? {themeId:'vstudy'} : {})});
          if (saved) {focusAfterDelete.current=true;setDeleting(undefined);if (active) setMessage(tr('themes:deleted_default'));}
        })()}>{tr('common:delete')}</Button>
      </DialogContent>
    </Dialog>}
    {error && !deleting && <p role="alert">{error}</p>}
    {editor && <ThemeEditor theme={editor} settings={settings} onClose={() => setEditor(undefined)} onSave={saveTheme}/>}
    {transfer && <ThemeTransfer theme={transfer} existing={settings.customThemes} onClose={() => setTransfer(undefined)} onSave={theme => saveTheme(theme, false)}/>}
  </div>;
}
