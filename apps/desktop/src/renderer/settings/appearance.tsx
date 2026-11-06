/** Appearance settings compose complete theme packs with independent reading preferences. */
import { useEffect, useRef, useState } from 'react';
import { Copy, Pencil, Plus, Check } from 'lucide-react';
import { type Settings } from '../../shared';
import { builtinThemes, resolveTheme, type ThemePack } from '../../shared/themes';
import { tr } from '../../shared/i18n';
import { desktop } from '../bridge';
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group';
import { Select } from '../components/select';
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
  const toggles = (field: 'uiScale' | 'density' | 'readerSize' | 'material', values: readonly (string | number)[]) => (
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
  return <div className="appearance-layout">
    <section aria-labelledby="color-scheme-label">
      <h3 id="color-scheme-label">{tr('themes:scheme')}</h3>
      <div className="scheme-grid">
        {(['system','light','dark'] as const).map(scheme => <button type="button" key={scheme} className="scheme-card"
          aria-pressed={settings.colorScheme === scheme} onClick={() => void update({colorScheme:scheme})}>
          <ThemePreview theme={theme} scheme={scheme}/><span>{tr(`themes:${scheme}`)}</span>
        </button>)}
      </div>
    </section>
    <section aria-labelledby="themes-label">
      <div className="theme-heading"><h3 id="themes-label">{tr('themes:themes')}</h3><div>
        <button type="button" onClick={() => setEditor({...theme, id:`custom-${crypto.randomUUID()}`,name:tr('themes:untitled')})}><Pencil/>{tr('themes:create')}</button>
        <button type="button" onClick={() => setTransfer('import')}><Plus/>{tr('themes:add')}</button>
      </div></div>
      <div className="themes-grid">
        {packs.map(pack => <div className="theme-card" key={pack.id} data-selected={settings.themeId === pack.id}>
          <button type="button" className="theme-select" aria-pressed={settings.themeId === pack.id} onClick={() => void update({themeId:pack.id})}>
            <span className="theme-orbs" aria-hidden="true">{(['light','dark'] as const).map(s => <span key={s} className="theme-orb"
              style={{background:`radial-gradient(circle at 28% 20%, ${pack.orbs[s][0]}, ${pack.orbs[s][1]} 85%)`}}/>)}</span>
            <span className="theme-name">{builtinThemes.some(t => t.id === pack.id) ? tr(`themes:name_${pack.id}`) : pack.name}{settings.themeId === pack.id && <Check aria-hidden="true"/>}</span>
          </button>
          <div className="theme-card-tools">
            {settings.customThemes.some(t => t.id === pack.id) && <button type="button" aria-label={tr('themes:edit_named',{name:pack.name})} onClick={() => setEditor(pack)}><Pencil/></button>}
            <button type="button" aria-label={tr('themes:export_named',{name:pack.name})} onClick={() => setTransfer({...pack,id:`custom-${crypto.randomUUID()}`})}><Copy/></button>
          </div>
        </div>)}
      </div>
    </section>
    <SettingsGroup title={tr('themes:interface')}>
      {(['contrast','glassOpacity'] as const).map(field => <SettingsRow key={field} label={tr(`themes:${field}`)} description={tr(`themes:${field}_hint`)}>
        <label className="theme-slider"><output>{settings[field]}%</output><input type="range" min={field === 'contrast' ? 100 : 50} max={field === 'contrast' ? 150 : 100} step="1"
          aria-label={tr(`themes:${field}`)} value={settings[field]} onChange={e => { const value=Number(e.target.value); const next={...settings,[field]:value}; setSettings(next); applyAppearance(next, true); }}
          onPointerUp={e => void update({[field]:Number(e.currentTarget.value)})} onKeyUp={e => void update({[field]:Number(e.currentTarget.value)})} onBlur={e => void update({[field]:Number(e.currentTarget.value)})}/></label>
      </SettingsRow>)}
      {(['uiScale','density','readerFont','readerSize','material'] as const).map(field => <SettingsRow key={field} label={tr(`settings:${field}`)}>
        {field === 'readerFont' ? <Select aria-label={tr('settings:readerFont')} value={settings.readerFont} onChange={e => void update({readerFont:e.target.value as Settings['readerFont']})}>
          {['system','serif','mono'].map(v => <option key={v} value={v}>{tr(`settings:${v}`)}</option>)}
        </Select> : field === 'uiScale' ? toggles(field,[100,125,150,200]) : field === 'density' ? toggles(field,['comfortable','compact']) : field === 'readerSize' ? toggles(field,['s','m','l','xl']) : toggles(field,['glass','solid'])}
      </SettingsRow>)}
    </SettingsGroup>
    <div className="appearance-preview"><h3>{tr('settings:sampleTitle')}</h3><p className="preview-reader">{tr('settings:sampleReader')}<br/>{tr('settings:sampleCjk')}</p><p className="preview-chat">{tr('settings:sampleChat')}</p><span className="preview-selected">{tr('themes:selection')}</span></div>
    {error && <p role="alert">{error}</p>}
    {editor && <ThemeEditor theme={editor} settings={settings} onClose={() => setEditor(undefined)} onSave={saveTheme}/>}
    {transfer && <ThemeTransfer theme={transfer} onClose={() => setTransfer(undefined)} onSave={saveTheme}/>}
  </div>;
}
