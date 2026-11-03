import { Checkbox } from './components/checkbox';
import { Dialog, DialogContent, DialogTitle } from './components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs';
import { Button } from './components/ui/button';
import { useOptionalNavigation } from "./shell";
import { PrivacySettings } from "./privacy-settings";
import { Onboarding } from './onboarding/onboarding';
import { useTranslation } from "react-i18next";
import { LanguageSettings } from './language-settings';
import { tr } from '../shared/i18n';
import { UsageSettings } from "./usage/settings";
import { useEffect, useState } from "react";
import { desktop } from "./bridge";
import { type Providers } from './provider-metadata';
import { ProviderRow } from './provider-row';
export { providerName, type Providers } from './provider-metadata';
export { ProviderRow } from './provider-row';
export function ProviderSettings({
  providers,
  onClose,
  onRefresh,
  initialTab = "providers",
}: {
  providers: Providers;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  initialTab?: string;
}) {
  useTranslation();
  const navigation = useOptionalNavigation();
  const [guide, setGuide] = useState(false);
  const [structuredTables, setStructuredTables] = useState(false);
  const [featureError,setFeatureError] = useState('');
  const [tab,setTab] = useState(initialTab);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;

    void desktop.invoke('settings:get',{}).then(s => setStructuredTables(s.enableGenerativeUI)).catch(() => {});
    return () => { if (previous?.isConnected) previous.focus(); else document.getElementById('shell-content')?.focus(); };
  }, []);
  return (
    <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent aria-labelledby={undefined} aria-describedby={undefined} showCloseButton={false} aria-label={tr('common:settings')} className={`settings-dialog ${tab === 'usage' ? 'usage-dashboard-dialog' : ''}`}>
      <div className="dialog-title">
        <DialogTitle>{tab === "privacy" ? tr("settings:privacy") : tab === "usage" ? tr("common:usage") : tr("common:providers_api_keys")}</DialogTitle>
        <Button variant="outline" onClick={onClose} aria-label={tr('common:close_settings')}>
          ×
        </Button>
      </div>
      <LanguageSettings />
      <Button variant="outline" onClick={() => setGuide(true)}>{tr("onboarding:replay")}</Button>
      <Button variant="outline" id="welcome-settings-entry" onClick={() => { navigation?.navigate("welcome"); onClose(); }}>{tr("welcome:entry")}</Button>
      {guide && <Onboarding onComplete={() => setGuide(false)}/>}
      <Tabs value={tab} onValueChange={setTab}><TabsList className="settings-tabs" aria-label={tr('common:settings')}><TabsTrigger value="providers">{tr('common:providers')}</TabsTrigger><TabsTrigger value="usage">{tr('common:usage')}</TabsTrigger><TabsTrigger value="privacy">{tr('settings:privacy')}</TabsTrigger></TabsList><TabsContent forceMount value={tab}>
      {tab === "privacy" ? <PrivacySettings /> : tab === "usage" ? <UsageSettings /> : <>
      <p className="muted">
        {tr('common:keys_are_saved_securely_in_the_desktop_app_and_never_read_back')}</p>
      <label className="generative-setting"><Checkbox checked={structuredTables} onChange={e => { const enabled=e.target.checked; setStructuredTables(enabled); void desktop.invoke('settings:get',{}).then(s => desktop.invoke('settings:set',{...s,enableGenerativeUI:enabled})).catch(() => {setStructuredTables(!enabled);setFeatureError(tr('common:could_not_save_structured_table_setting'));}); }} />{tr('common:read_only_structured_tables_api_providers_only')}</label>
      <p className="muted">{tr('common:optional_table_presentations_off_by_default_cli_tools_remain_disabled')}</p>
      {featureError && <p role="alert">{featureError}</p>}
      {providers.map((provider) => (
        <ProviderRow
          key={provider.config.id}
          provider={provider}
          onRefresh={onRefresh}
        />
      ))}
      </>}</TabsContent>{["providers","usage","privacy"].filter(id=>id!==tab).map(id=><TabsContent forceMount hidden value={id} key={id}/>)}</Tabs>
    </DialogContent></Dialog>
  );
}
