import { Button, Collapsible, Card, Dialog, DialogHeader, IconButton, Switch, Tab, TabList } from '@astryxdesign/core';
import { Panel } from './components/panel';
import { SettingRow } from './components/ui';
import { useOverlayFocusReturn } from './components/use-overlay-focus-return';
import { UpdateSettings } from './settings/updates';
import { AppVersion } from './components/app-version';
import { aiCliSetupEvent } from './ai-cli/entry';
import { openAiCliSetup } from './ai-cli/entry';
import { DocumentSettings } from './settings/documents';
import { StorageSettings } from "./settings/storage";
import { AiSetupGuide } from './ai-setup';
import { SlidersHorizontal, Palette, KeyRound, BarChart3, Shield, HardDrive, Bot, X } from 'lucide-react';
import { AgentsSettings } from './settings/agents';
import { AppearanceSection } from './settings/appearance';
import './settings/settings.css';
import { track } from './analytics';
import { useOptionalNavigation } from './shell';
import { PrivacySettings } from './privacy-settings';
import { Onboarding } from './onboarding/onboarding';
import { useTranslation } from 'react-i18next';
import { LanguageSettings } from './language-settings';
import { tr } from '../shared/i18n';
import { UsageSettings } from './usage/settings';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
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
  const [open, setOpen] = useState(true);
  useOverlayFocusReturn(open);
  const completed = useRef(false);
  const requestClose = useCallback(() => setOpen(false), []);
  const closeOwner = useRef(onClose);
  closeOwner.current = onClose;
  const finishClose = useCallback(() => {
    if (completed.current) return;
    completed.current = true;
    closeOwner.current();
  }, []);
  useEffect(() => {
    if (open) return;
    const timer = setTimeout(finishClose, 160);
    return () => clearTimeout(timer);
  }, [open, finishClose]);
  const [guide, setGuide] = useState(false);
  const [structuredTables, setStructuredTables] = useState(false);
  const [featureError, setFeatureError] = useState('');
  const [tab, setTab] = useState(initialTab);
  const panelBase = useId();
  const tabsHost = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    tabsHost.current?.querySelector<HTMLElement>('[role=tab][aria-selected=true]')?.scrollIntoView?.({block:'nearest',inline:'nearest'});
  }, [tab]);
  useEffect(() => {
    const section = ({providers:'ai',agents:'ai',general:'general',privacy:'privacy',appearance:'appearance',storage:'storage',usage:'usage',moodle:'moodle'} as const)[tab as 'general' | 'providers' | 'agents' | 'privacy' | 'appearance' | 'storage' | 'usage' | 'moodle'];
    if (section) track('settings_opened', {settings_section:section});
  }, [tab]);
  useEffect(() => { track('screen_viewed', {screen_name:'settings'}); }, []);

  useEffect(() => {
    void desktop
      .invoke('settings:get', {})
      .then((s) => setStructuredTables(s.enableGenerativeUI))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handoff = requestClose;
    window.addEventListener(aiCliSetupEvent, handoff);
    return () => window.removeEventListener(aiCliSetupEvent, handoff);
  }, [requestClose]);

  const sections = [
    ['general', SlidersHorizontal], ['appearance', Palette], ['providers', KeyRound], ['agents', Bot],
    ['usage', BarChart3], ['storage', HardDrive], ['privacy', Shield],
  ] as const;
  const sectionTitle = (id: string) => tr(id === 'agents' ? 'agents:title' : id === 'storage' ? 'storage:title' : `settings:${id}`);

  return (
    <Dialog
      isOpen={open}
      onOpenChange={(next) => {
        if (!next) requestClose();
      }}
      width={960}
      maxHeight="calc(100dvh - var(--spacing-8))"
      className="settings-dialog"
    >
      <DialogHeader title={tr('common:settings')}
        endContent={<IconButton label={tr('common:close_settings')} icon={<X size={16} />} variant="ghost" onClick={requestClose} />} />
      {guide && <Onboarding onComplete={() => setGuide(false)} onOpenPrivacy={() => setTab('privacy')} />}
      <div className="settings-body">
        <div ref={tabsHost} className="settings-tabs">
          <TabList role="tablist" aria-label={tr('common:settings')} value={tab} onChange={setTab} hasDivider>
            {sections.map(([id, Icon]) => (
              <Tab key={id} value={id} label={sectionTitle(id)} icon={<Icon size={16} />} panelId={`${panelBase}-${id}`} />
            ))}
          </TabList>
        </div>
        {sections.map(([id]) => (
          <div hidden={tab !== id} id={`${panelBase}-${id}`} key={id} role="tabpanel" aria-label={sectionTitle(id)} className="settings-pane">
            <div className="settings-pane-inner">
              <header className="settings-section-header">
                <h2>{sectionTitle(id)}</h2>
              </header>
              {tab === id &&
                (id === 'general' ? (
                  <>
                    <Panel title={tr('settings:languages')}><div className="settings-stack settings-general-rows">
                      <LanguageSettings />
                    </div></Panel>
                    <UpdateSettings />
                    <Panel title={tr('settings:welcome')}><div className="settings-stack settings-general-rows">
                      <SettingRow label={tr('settings:welcomeGuide')} description={tr('settings:welcome_guide_hint')}>
                        <Button size="sm" variant="secondary" label={tr('settings:show')} onClick={() => setGuide(true)} />
                      </SettingRow>
                      <SettingRow label={tr('settings:aboutApp')} description={tr('settings:about_hint')}>
                        <Button
                          size="sm"
                          variant="secondary"
                          label={tr('settings:open')}
                          id="welcome-settings-entry"
                          onClick={() => {
                            navigation?.navigate('welcome');
                            requestClose();
                          }}
                        />
                      </SettingRow>
                    </div></Panel>
                    <Panel title={tr('library:documents')}><div className="settings-stack settings-general-rows">
                      <DocumentSettings />
                    </div></Panel>
                    <AppVersion/>
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
                    <Panel title={tr('ai-cli:tools')}><div className="settings-ai-tools">
                      <div className="settings-ai-connect"><span>{tr('ai-cli:summary_unconnected')}</span><Button label={tr('ai-cli:title')} variant="primary" size="sm" onClick={() => openAiCliSetup()} /></div>
                      <div className="settings-ai-note muted"><p>{tr('novice:privacy_lead')}</p><p>{tr('novice:privacy')}</p></div>
                      <div className="settings-ai-guide"><Collapsible trigger={tr('novice:setup_title')}>
                        <AiSetupGuide onClose={requestClose} leadingSteps={[tr('novice:step_access'), tr('novice:step_key')]} />
                      </Collapsible></div>
                    </div></Panel>
                    <Panel title={tr('settings:api_keys')}><div className="settings-stack settings-provider-rows">
                      {providers.filter(provider => provider.config.kind === 'api').map(provider => (
                        <ProviderRow settingsView key={provider.config.id} provider={provider} onRefresh={onRefresh} />
                      ))}
                    </div></Panel>

                    <Card padding={4} className="settings-stack">
                      <SettingRow
                        label={tr('common:read_only_structured_tables_api_providers_only')}
                        description={tr('common:optional_table_presentations_off_by_default_cli_tools_remain_disabled')}
                      >
                        <Switch
                          label={tr('common:read_only_structured_tables_api_providers_only')}
                          isLabelHidden
                          value={structuredTables}
                          onChange={(enabled) => {
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
                      </SettingRow>
                      {featureError && <p role="alert">{featureError}</p>}
                    </Card>
                    <Panel title={tr('common:providers')}><div className="settings-stack settings-provider-rows">
                      {providers.filter(provider => provider.config.kind !== 'api').map((provider) => (
                        <ProviderRow
                          settingsView
                          key={provider.config.id}
                          provider={provider}
                          onRefresh={onRefresh}
                        />
                      ))}
                    </div></Panel>
                  </>
                ))}
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
