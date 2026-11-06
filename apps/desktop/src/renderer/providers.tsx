import { aiCliSetupEvent } from './ai-cli/entry';
import { AiCliInventory } from './ai-cli/inventory';
import { StorageSettings } from "./settings/storage";
import { AiSetupGuide } from './ai-setup';
import { Switch } from './components/ui/switch';
import { SlidersHorizontal, Palette, KeyRound, BarChart3, Shield, HardDrive, Bot, X } from 'lucide-react';
import { AgentsSettings } from './settings/agents';
import { SettingsGroup, SettingsRow } from './settings/layout';
import { AppearanceSection } from './settings/appearance';
import './settings/settings.css';
import { Dialog, DialogContent, DialogTitle } from './components/ui/dialog';
import { track } from './analytics';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs';
import { Button } from './components/ui/button';
import { useOptionalNavigation } from './shell';
import { PrivacySettings } from './privacy-settings';
import { Onboarding } from './onboarding/onboarding';
import { useTranslation } from 'react-i18next';
import { LanguageSettings } from './language-settings';
import { tr } from '../shared/i18n';
import { UsageSettings } from './usage/settings';
import { useEffect, useLayoutEffect, useState } from 'react';
import { desktop } from './bridge';
import { type Providers } from './provider-metadata';
import { ProviderRow } from './provider-row';

export { providerName, type Providers } from './provider-metadata';
export { ProviderRow } from './provider-row';

export function ProviderSettings({
  providers,
  onClose,
  onRefresh,
  initialTab = 'general',
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
  const [featureError, setFeatureError] = useState('');
  const [tab, setTab] = useState(initialTab);
  const [tabsList, setTabsList] = useState<HTMLDivElement | null>(null);
  const [orientation, setOrientation] = useState<'vertical' | 'horizontal'>('vertical');
  useLayoutEffect(() => {
    const list = tabsList;
    if (!list) return;
    const syncOrientation = () => setOrientation(getComputedStyle(list).flexDirection === 'row' ? 'horizontal' : 'vertical');
    syncOrientation();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(syncOrientation);
    observer.observe(list);
    return () => observer.disconnect();
  }, [tabsList]);
  useEffect(() => {
    const section = ({providers:'ai',agents:'ai',general:'general',privacy:'privacy',appearance:'appearance',storage:'storage',usage:'usage',moodle:'moodle'} as const)[tab as 'general' | 'providers' | 'agents' | 'privacy' | 'appearance' | 'storage' | 'usage' | 'moodle'];
    if (section) track('settings_opened', {settings_section:section});
  }, [tab]);
  useEffect(() => { track('screen_viewed', {screen_name:'settings'}); }, []);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;

    void desktop
      .invoke('settings:get', {})
      .then((s) => setStructuredTables(s.enableGenerativeUI))
      .catch(() => {});
    return () => {
      if (previous?.isConnected) previous.focus();
      else document.getElementById('shell-content')?.focus();
    };
  }, []);

  useEffect(() => {
    const handoff = () => onClose();
    window.addEventListener(aiCliSetupEvent, handoff);
    return () => window.removeEventListener(aiCliSetupEvent, handoff);
  }, [onClose]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent aria-describedby={undefined} showCloseButton={false} className="settings-dialog">
        <div className="settings-header">
          <DialogTitle>{tr('common:settings')}</DialogTitle>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={tr('common:close_settings')}>
            <X size={16} />
          </Button>
        </div>
        {guide && <Onboarding onComplete={() => setGuide(false)} />}
        <Tabs orientation={orientation} value={tab} onValueChange={setTab} className="settings-body">
          <TabsList ref={setTabsList} variant="line" className="settings-tabs" aria-label={tr('common:settings')}>
            {(
              [
                ['general', SlidersHorizontal],
                ['appearance', Palette],
                ['providers', KeyRound],
                ['agents', Bot],
                ['usage', BarChart3],
                ['storage', HardDrive],
                ['privacy', Shield],
              ] as const
            ).map(([id, Icon]) => (
              <TabsTrigger key={id} value={id}>
                <Icon size={16} />
                {tr(id === 'agents' ? 'agents:title' : id === 'storage' ? 'storage:title' : `settings:${id}`)}
              </TabsTrigger>
            ))}
          </TabsList>
          {['general', 'appearance', 'providers', 'agents', 'usage', 'storage', 'privacy'].map((id) => (
            <TabsContent forceMount hidden={tab !== id} value={id} key={id} className="settings-pane">
              <div className="settings-pane-inner">
                <header className="settings-section-header">
                  <h2>{tr(id === 'agents' ? 'agents:title' : id === 'storage' ? 'storage:title' : `settings:${id}`)}</h2>
                  {id === 'providers' && (
                    <p className="muted">
                      {tr('common:keys_are_saved_securely_in_the_desktop_app_and_never_read_back')}
                    </p>
                  )}
                </header>
                {tab === id &&
                  (id === 'general' ? (
                    <>
                      <SettingsGroup title={tr('settings:languages')}>
                        <LanguageSettings />
                      </SettingsGroup>
                      <SettingsGroup title={tr('settings:welcome')}>
                        <SettingsRow label={tr('settings:welcomeGuide')} description={tr('settings:welcome_guide_hint')}>
                          <Button size="sm" variant="secondary" onClick={() => setGuide(true)}>
                            {tr('settings:show')}
                          </Button>
                        </SettingsRow>
                        <SettingsRow label={tr('settings:aboutApp')} description={tr('settings:about_hint')}>
                          <Button
                            size="sm"
                            variant="secondary"
                            id="welcome-settings-entry"
                            onClick={() => {
                              navigation?.navigate('welcome');
                              onClose();
                            }}
                          >
                            {tr('settings:open')}
                          </Button>
                        </SettingsRow>
                      </SettingsGroup>
                    </>
                  ) : id === 'appearance' ? (
                    <AppearanceSection />
                  ) : id === 'agents' ? (
                    <AgentsSettings />
                  ) : id === 'storage' ? (
                    <StorageSettings />
                  ) : id === 'privacy' ? (
                    <PrivacySettings />
                  ) : id === 'usage' ? (
                    <UsageSettings />
                  ) : (
                    <>
                      <div className="settings-intro">
                        <p>{tr('novice:privacy')}</p>
                        <ol>
                          <li>{tr('novice:step_access')}</li>
                          <li>{tr('novice:step_key')}</li>
                        </ol>
                      </div>
                      <details className="settings-disclosure">
                        <summary>{tr('novice:setup_title')}</summary>
                        <div className="settings-disclosure-body"><AiSetupGuide onClose={onClose} /></div>
                      </details>
                      <AiCliInventory settings />
                      <SettingsGroup title={tr('settings:api_keys')}>
                        {providers.filter(provider => provider.config.kind === 'api').map(provider => (
                          <ProviderRow settingsView key={provider.config.id} provider={provider} onRefresh={onRefresh} />
                        ))}
                      </SettingsGroup>
                      <details className="settings-disclosure">
                      <summary>{tr('novice:advanced')}</summary>
                      <div className="settings-disclosure-body">
                      <p>{tr('novice:advanced_help')}</p>
                      <SettingsGroup>
                        <SettingsRow
                          label={tr('common:read_only_structured_tables_api_providers_only')}
                          description={tr('common:optional_table_presentations_off_by_default_cli_tools_remain_disabled')}
                        >
                          <Switch
                            aria-label={tr('common:read_only_structured_tables_api_providers_only')}
                            checked={structuredTables}
                            onCheckedChange={(enabled) => {
                              setStructuredTables(enabled);
                              void desktop
                                .invoke('settings:get', {})
                                .then((s) => desktop.invoke('settings:set', { ...s, enableGenerativeUI: enabled }))
                                .catch(() => {
                                  setStructuredTables(!enabled);
                                  setFeatureError(tr('common:could_not_save_structured_table_setting'));
                                });
                            }}
                          />
                        </SettingsRow>
                        {featureError && <p role="alert">{featureError}</p>}
                      </SettingsGroup>
                      <SettingsGroup title={tr('common:providers')}>
                        {providers.filter(provider => provider.config.kind !== 'api').map((provider) => (
                          <ProviderRow
                            settingsView
                            key={provider.config.id}
                            provider={provider}
                            onRefresh={onRefresh}
                          />
                        ))}
                      </SettingsGroup>
                      </div>
                      </details>
                    </>
                  ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
