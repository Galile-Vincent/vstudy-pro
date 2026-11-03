import { Select } from "./components/select";
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Settings } from '../shared';
import { i18n, tr } from '../shared/i18n';
import { desktop } from './bridge';
import { saveLanguage } from './i18n';
export function LanguageSettings() {
  useTranslation();
  const [settings,setSettings] = useState<Settings>();
  const [error,setError] = useState('');
  useEffect(() => {void desktop.invoke('settings:get',{}).then(setSettings).catch(() => setError(tr('errors:generic')));},[]);
  const update = async (field: 'language' | 'replyLanguage', value: string) => {
    try {
      if(value === 'en-XA' && import.meta.env.DEV) { await i18n.changeLanguage(value); document.documentElement.lang=value; return; }
      setSettings(await saveLanguage(field,value as Settings['language'])); setError('');
    } catch { setError(tr('errors:generic')); }
  };
  return <section className="language-settings">
    {(['language','replyLanguage'] as const).map(field => <label key={field}>{tr(field === 'language' ? 'common:language' : 'common:reply_language')}
      <Select data-testid={field} value={field === 'language' && i18n.language === 'en-XA' ? 'en-XA' : settings?.[field] ?? 'auto'} disabled={!settings} onChange={e => void update(field,e.target.value)}>
        <option value="auto">{tr(field === 'language' ? 'common:auto' : 'common:reply_auto')}</option>
        <option value="en" lang="en">English</option><option value="zh-Hant" lang="zh-Hant">繁體中文</option><option value="ja" lang="ja">日本語</option>
        {field === 'language' && import.meta.env.DEV && <option value="en-XA">{tr('common:pseudo')}</option>}
      </Select></label>)}
    <button type="button" onClick={() => void desktop.invoke("settings:deleteAllData", {}).catch(() => setError(tr("errors:generic")))}>{tr("common:delete_all_data")}</button>
    <p className="muted">{tr('common:reply_note')}</p>{error && <p role="alert">{error}</p>}
  </section>;
}
