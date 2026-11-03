import { useOptionalNavigation } from "./shell";
import { PrivacySettings } from "./privacy-settings";
import { Onboarding } from './onboarding/onboarding';
import { useTranslation } from "react-i18next";
import { LanguageSettings } from './language-settings';
import { tr } from '../shared/i18n';
import { UsageSettings } from "./usage/settings";
import { useEffect, useRef, useState } from "react";
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
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    void desktop.invoke('settings:get',{}).then(s => setStructuredTables(s.enableGenerativeUI)).catch(() => {});
    return () => { if (previous?.isConnected) previous.focus(); else document.getElementById('shell-content')?.focus(); };
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-label={tr("common:settings")}
      className={`settings-dialog ${tab === "usage" ? "usage-dashboard-dialog" : ""}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-title">
        <h2>{tab === "privacy" ? tr("settings:privacy") : tab === "usage" ? tr("common:usage") : tr("common:providers_api_keys")}</h2>
        <button onClick={onClose} aria-label={tr('common:close_settings')}>
          ×
        </button>
      </div>
      <LanguageSettings />
      <button onClick={() => setGuide(true)}>{tr("onboarding:replay")}</button>
      <button id="welcome-settings-entry" onClick={() => { navigation?.navigate("welcome"); onClose(); }}>{tr("welcome:entry")}</button>
      {guide && <Onboarding onComplete={() => setGuide(false)}/>}
      <div className="settings-tabs" role="tablist" aria-label={tr('common:settings')}><button role="tab" aria-selected={tab === "providers"} onClick={() => setTab("providers")}>{tr('common:providers')}</button><button role="tab" aria-selected={tab === "usage"} onClick={() => setTab("usage")}>{tr('common:usage')}</button><button role="tab" aria-selected={tab === "privacy"} onClick={() => setTab("privacy")}>{tr("settings:privacy")}</button></div>
      {tab === "privacy" ? <PrivacySettings /> : tab === "usage" ? <UsageSettings /> : <>
      <p className="muted">
        {tr('common:keys_are_saved_securely_in_the_desktop_app_and_never_read_back')}</p>
      <label className="generative-setting"><input type="checkbox" checked={structuredTables} onChange={e => { const enabled=e.target.checked; setStructuredTables(enabled); void desktop.invoke('settings:get',{}).then(s => desktop.invoke('settings:set',{...s,enableGenerativeUI:enabled})).catch(() => {setStructuredTables(!enabled);setFeatureError(tr('common:could_not_save_structured_table_setting'));}); }} />{tr('common:read_only_structured_tables_api_providers_only')}</label>
      <p className="muted">{tr('common:optional_table_presentations_off_by_default_cli_tools_remain_disabled')}</p>
      {featureError && <p role="alert">{featureError}</p>}
      {providers.map((provider) => (
        <ProviderRow
          key={provider.config.id}
          provider={provider}
          onRefresh={onRefresh}
        />
      ))}
      </>}
    </dialog>
  );
}
