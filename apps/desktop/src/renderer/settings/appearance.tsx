/** Appearance settings compose complete theme packs with independent reading preferences. */
import { DocumentSettings } from './documents';
import { track } from '../analytics';
import { useEffect, useRef, useState } from 'react';
import { Copy, Pencil, Plus, Check } from 'lucide-react';
import { type Settings } from '../../shared';
import { builtinThemes, resolveTheme, type ThemePack } from '../../shared/themes';
import { tr } from '../../shared/i18n';
import { desktop } from '../bridge';
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group';
import { Select } from '../components/select';
import { Button } from '../components/ui/button';
import { SettingsGroup, SettingsRow } from './layout';
import { applyAppearance } from './apply-appearance';
import { ThemeEditor, ThemeTransfer } from './theme-editor';
import './appearance.css';
import { ThemePreview } from './theme-preview';

export function AppearanceSection() {
  const [settings, setSettings] = useState<Settings>();
  const pending = useRef<Promise<void>>(Promise.resolve());
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<ThemePack>();
  const [transfer, setTransfer] = useState<ThemePack | 'import'>();
  useEffect(() => {
    void desktop.invoke('settings:get', {}).then(setSettings).catch(() => setError(tr('errors:generic')));
  }, []);

  const update = (patch: Partial<Settings>) => {
    const operation = pending.current.then(async () => {
      try {
        const latest = await desktop.invoke('settings:get', {});
        const next = await desktop.invoke('settings:set', { ...latest, ...patch });
        applyAppearance(next, true);
        if (patch.colorScheme && patch.colorScheme !== latest.colorScheme) track('theme_changed', {theme:next.colorScheme});
        setSettings(next);
        setError('');
        return next;
      } catch { setError(tr('errors:generic')); return undefined; }
    });
    pending.current = operation.then(() => undefined);
    return operation;
  };
  const saveTheme = async (theme: ThemePack) => {
    const latest = await desktop.invoke('settings:get', {});
    return update({ themeId: theme.id, customThemes: [...latest.customThemes.filter(t => t.id !== theme.id), theme] });
  };
  const toggles = (field: 'uiScale' | 'density' | 'readerSize', values: readonly (string | number)[]) => (
    <ToggleGroup type="single" size="sm" aria-label={tr(`settings:${field}`)} value={String(settings?.[field] ?? '')}
      onValueChange={value => { if (value) void update({[field]:field === 'uiScale' ? Number(value) : value}); }}>
      {values.map(v => <ToggleGroupItem key={v} value={String(v)} aria-label={field === 'uiScale' ? `${v}%` : tr(`settings:${v}`)}>
        {field === 'uiScale' ? `${v}%` : tr(`settings:${v}`)}
      </ToggleGroupItem>)}
    </ToggleGroup>
  );
  if (!settings) return error ? <p role="alert">{error}</p> : <p role="status">{tr('themes:loading')}</p>;
  const theme = resolveTheme(settings);
  const packs = [...builtinThemes,...settings.customThemes];
  const slider = (field: 'contrast' | 'glassOpacity') => <SettingsRow key={field} label={tr(`themes:${field}`)} description={tr(`themes:${field}_hint`)}>
    <label className="theme-slider"><output>{settings[field]}%</output><input type="range" min={field === 'contrast' ? 100 : 50} max={field === 'contrast' ? 150 : 100} step="1"
      aria-label={tr(`themes:${field}`)} value={settings[field]} onChange={e => { const value=Number(e.target.value); const next={...settings,[field]:value}; setSettings(next); applyAppearance(next, false); }}
      onPointerUp={e => void update({[field]:Number(e.currentTarget.value)})} onKeyUp={e => void update({[field]:Number(e.currentTarget.value)})} onBlur={e => void update({[field]:Number(e.currentTarget.value)})}/></label>
  </SettingsRow>;
  return <div className="appearance-layout">
    <section className="settings-group" aria-labelledby="color-scheme-label">
      <h3 id="color-scheme-label">{tr('themes:scheme')}</h3>
      <div className="scheme-grid">
        {(['system','light','dark'] as const).map(scheme => <button type="button" key={scheme} className="scheme-card"
          aria-pressed={settings.colorScheme === scheme} onClick={() => void update({colorScheme:scheme})}>
          <ThemePreview theme={theme} scheme={scheme}/>
          <span className="scheme-card-label">{tr(`themes:${scheme}`)}<span className="scheme-card-check" aria-hidden="true">{settings.colorScheme === scheme && <Check/>}</span></span>
        </button>)}
      </div>
    </section>
    <SettingsGroup>
      <SettingsRow label={tr('themes:cardTransparency')} description={tr('themes:cardTransparency_hint')}>
        <ToggleGroup type="single" size="sm" aria-label={tr('themes:cardTransparency')} value={settings.cardTransparency}
          onValueChange={value => { if (value) void update({cardTransparency:value as Settings['cardTransparency']}); }}>
          {(['solid','soft','glass'] as const).map(value => <ToggleGroupItem key={value} value={value} aria-label={tr(`themes:card_${value}`)}>{tr(`themes:card_${value}`)}</ToggleGroupItem>)}
        </ToggleGroup>
      </SettingsRow>
    </SettingsGroup>
    <SettingsGroup title={tr('library:documents')}>
      <DocumentSettings />
    </SettingsGroup>
    <SettingsGroup title={tr('settings:text_reading')}>
      {(['uiScale','density','readerFont','readerSize'] as const).map(field => <SettingsRow key={field} label={tr(`settings:${field}`)}>
        {field === 'readerFont' ? <Select aria-label={tr('settings:readerFont')} value={settings.readerFont} onChange={e => void update({readerFont:e.target.value as Settings['readerFont']})}>
          {['system','serif','mono'].map(v => <option key={v} value={v}>{tr(`settings:${v}`)}</option>)}
        </Select> : field === 'uiScale' ? toggles(field,[100,125,150,200]) : field === 'density' ? toggles(field,['comfortable','compact']) : toggles(field,['s','m','l','xl'])}
      </SettingsRow>)}
      <div className="appearance-preview"><h3>{tr('settings:sampleTitle')}</h3><p className="preview-reader">{tr('settings:sampleReader')}<br/>{tr('settings:sampleCjk')}</p><p className="preview-chat">{tr('settings:sampleChat')}</p><span className="preview-selected">{tr('themes:selection')}</span></div>
    </SettingsGroup>
    <section className="settings-group" aria-labelledby="themes-label">
      <h3 id="themes-label">{tr('themes:themes')}</h3>
      <div className="themes-grid">
        {packs.map(pack => <div className="theme-card" key={pack.id} data-selected={settings.themeId === pack.id}>
          <button type="button" className="theme-select" aria-pressed={settings.themeId === pack.id} onClick={() => void update({themeId:pack.id})}>
            <span className="theme-orbs" aria-hidden="true">{(['light','dark'] as const).map(s => <span key={s} className="theme-orb" style={{background:pack.orbs[s][1]}}/>)}</span>
            <span className="theme-name">{builtinThemes.some(t => t.id === pack.id) ? tr(`themes:name_${pack.id}`) : pack.name}</span>
            {settings.themeId === pack.id && <Check className="theme-check" aria-hidden="true"/>}
          </button>
          <div className="theme-card-tools">
            {settings.customThemes.some(t => t.id === pack.id) && <button type="button" aria-label={tr('themes:edit_named',{name:pack.name})} onClick={() => setEditor(pack)}><Pencil/></button>}
            <button type="button" aria-label={tr('themes:export_named',{name:pack.name})} onClick={() => setTransfer({...pack,id:`custom-${crypto.randomUUID()}`})}><Copy/></button>
          </div>
        </div>)}
      </div>
    </section>
    <details className="settings-disclosure">
      <summary>{tr('settings:advanced')}</summary>
      <div className="settings-disclosure-body">
        <SettingsGroup>
          {slider('contrast')}
          {slider('glassOpacity')}
          <SettingsRow label={tr('themes:custom')} description={tr('themes:custom_hint')}>
            <Button size="sm" variant="secondary" onClick={() => setEditor({...theme, id:`custom-${crypto.randomUUID()}`,name:tr('themes:untitled')})}><Pencil/>{tr('themes:create')}</Button>
            <Button size="sm" variant="secondary" onClick={() => setTransfer('import')}><Plus/>{tr('themes:add')}</Button>
          </SettingsRow>
        </SettingsGroup>
      </div>
    </details>
    {error && <p role="alert">{error}</p>}
    {editor && <ThemeEditor theme={editor} settings={settings} onClose={() => setEditor(undefined)} onSave={saveTheme}/>}
    {transfer && <ThemeTransfer theme={transfer} onClose={() => setTransfer(undefined)} onSave={saveTheme}/>}
  </div>;
}
