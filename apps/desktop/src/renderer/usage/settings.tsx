import { Panel } from '../components/panel';
import { SettingRow } from '../components/ui';
import { Button, NumberInput, TextArea } from '@astryxdesign/core';
import { useFormat } from '../i18n';
import { useTranslation } from 'react-i18next';
import { tr } from '../../shared/i18n';
import { useEffect, useState } from 'react';
import { priceSchema, type Settings, type IpcResponse } from '../../shared';
import { z } from 'zod';
import { desktop } from '../bridge';
import { UsageDashboard } from './dashboard';

const balanceNote = () =>
  tr(
    'common:no_provider_exposes_an_account_balance_for_api_keys_left_means_your_user_set_monthly_budget_or_token_cap_provider_rate_limits_are_separate_and_appear_only_when_reported',
  );

export function rateWindow(label: string, number: (n: number) => string): string {
  const minutes = /^(\d+) minute window$/.exec(label)?.[1];
  const value = minutes ? Number(minutes) : undefined;
  if (value === 10080 || /seven_day/.test(label)) return tr('usage:weekly_window');
  if (value !== undefined)
    return tr(value >= 1440 ? 'usage:day_window' : value >= 60 ? 'usage:hour_window' : 'usage:minute_window', {
      count: number(value >= 1440 ? value / 1440 : value >= 60 ? value / 60 : value),
    });
  return tr('usage:provider_window');
}

export function UsageSettings() {
  useTranslation();
  const format = useFormat();
  const [settings, setSettings] = useState<Settings>();
  const [limits, setLimits] = useState<IpcResponse<'usage:rateLimits'>>([]);
  const [documents, setDocuments] = useState<IpcResponse<'documents:list'>>([]);
  const [overrides, setOverrides] = useState('{}');
  const [status, setStatus] = useState('');

  useEffect(() => {
    let active = true;
    void Promise.all([
      desktop.invoke('settings:get', {}),
      desktop.invoke('usage:rateLimits', {}),
      desktop.invoke('documents:list', {}),
    ])
      .then(([s, l, d]) => {
        if (active) {
          setSettings(s);
          setOverrides(JSON.stringify(s.priceOverrides, null, 2));
          setLimits(l);
          setDocuments(d);
        }
      })
      .catch(() => {
        if (active) setStatus(tr('common:could_not_load_usage'));
      });
    return () => {
      active = false;
    };
  }, []);

  const save = async () => {
    if (!settings) return;
    let priceOverrides;
    try {
      priceOverrides = z.record(priceSchema).parse(JSON.parse(overrides));
    } catch {
      setStatus(tr('usage:invalid_prices'));
      return;
    }
    try {
      const latest = await desktop.invoke('settings:get', {});
      const saved = await desktop.invoke('settings:set', {
        ...latest,
        monthlyBudgetUsd: settings.monthlyBudgetUsd,
        monthlyTokenBudget: settings.monthlyTokenBudget,
        warnAtPercent: settings.warnAtPercent,
        priceOverrides,
      });
      setSettings(saved);
      setStatus(tr('common:usage_settings_saved'));
      window.dispatchEvent(new Event('usage-updated'));
    } catch {
      setStatus(tr('usage:save_failed'));
    }
  };

  return (
    <section className="usage-settings flex flex-col gap-[var(--space-6)]" aria-label={tr('common:usage_settings')}>
      <div className="settings-intro">
        <p>{tr('novice:usage_help')}</p>
        <p>{balanceNote()}</p>
      </div>
      <UsageDashboard documents={documents} />
      <div className="grid grid-cols-1 gap-[var(--space-6)] items-start">
        <Panel title={tr('common:provider_rate_limits')}>
          <div className="settings-stack settings-general-rows">
            <div>
              {!limits.length && (
                <p className="muted">
                  {tr(
                    'common:no_rate_limit_information_reported_yet_codex_cli_does_not_report_rate_limits_through_exec_its_account_probe_may_be_unavailable_claude_limits_appear_when_reported',
                  )}
                </p>
              )}
              {limits.map((l) => (
                <p key={l.providerId}>
                  {l.providerId}:{' '}
                  {l.rateLimit.usedPercent === undefined
                    ? ''
                    : tr('usage:percent_used', { percent: format.number(l.rateLimit.usedPercent) })}
                  {rateWindow(l.rateLimit.label, format.number)}
                  {l.rateLimit.remainingTokens !== undefined
                    ? tr('common:tokens_left', { count: format.number(l.rateLimit.remainingTokens) })
                    : ''}
                  {l.rateLimit.remainingRequests !== undefined
                    ? tr('common:requests_left', { count: format.number(l.rateLimit.remainingRequests) })
                    : ''}
                  {l.rateLimit.resetsAt
                    ? tr('common:resets', {
                        date: format.date(l.rateLimit.resetsAt, { dateStyle: 'medium', timeStyle: 'short' }),
                      })
                    : ''}
                  <small>
                    {' '}
                    {tr('common:reported')}
                    {format.date(l.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}
                  </small>
                </p>
              ))}
            </div>
          </div>
        </Panel>
        {settings && (
          <Panel title={tr('settings:budgets')}>
            <div className="settings-stack settings-general-rows">
              <p>{tr('usage:budget_help')}</p>
              <NumberInput
                id="usage-monthly_budget_usd"
                label={tr('common:monthly_budget_usd')}
                min={0.01}
                step={0.01}
                hasClear
                value={settings.monthlyBudgetUsd}
                onChange={(value) =>
                  setSettings({
                    ...settings,
                    monthlyBudgetUsd: value ?? undefined,
                  })
                }
              />
              <NumberInput
                id="usage-monthly_token_cap"
                label={tr('common:monthly_token_cap')}
                min={1}
                step={1}
                hasClear
                value={settings.monthlyTokenBudget}
                onChange={(value) =>
                  setSettings({
                    ...settings,
                    monthlyTokenBudget: value ?? undefined,
                  })
                }
              />
              <NumberInput
                id="usage-warn_at"
                label={tr('common:warn_at')}
                min={1}
                max={100}
                value={settings.warnAtPercent}
                onChange={(value) => setSettings({ ...settings, warnAtPercent: value })}
              />
            <details><summary>{tr('usage:advanced_prices')}</summary>
            <SettingRow stack htmlFor="usage-price_overrides_usd_per_1m_tokens" label={tr('common:price_overrides_usd_per_1m_tokens')}>
              <TextArea
                id="usage-price_overrides_usd_per_1m_tokens"
                label={tr('common:price_overrides_usd_per_1m_tokens')}
                isLabelHidden
                controlClassName="font-mono text-[length:var(--type-sm)]"
                rows={5}
                value={overrides}
                onChange={(val) => setOverrides(val)}
                hasSpellCheck={false}
              />
            </SettingRow>
            <p className="muted">
              {tr('common:json_keyed_by_exact_model_id_e_g')}
              {`{"my-model":{"input":2,"output":10,"cacheRead":0.1,"cacheWrite":2.5}}`}
              {tr(
                'common:standard_global_defaults_verified_nov_3_2026_estimates_exclude_taxes_tools_and_special_service_tiers_cache_writes_assume_5_minutes_cli_costs_are_api_equivalent_subscription_not_subscription_charges',
              )}
            </p>
            </details>
            <div className="flex flex-wrap justify-end gap-[var(--space-2)]">
              <Button
                variant="primary"
                size="sm"
                label={tr('common:save_usage_settings')}
                onClick={() => void save()}
              />
              <Button
                variant="secondary"
                size="sm"
                label={tr('common:export_csv')}
                onClick={() => {
                  void desktop
                    .invoke('usage:export', {})
                    .then((r) =>
                      setStatus(r.saved ? tr('common:csv_exported') : tr('common:export_canceled')),
                    )
                    .catch(() => setStatus(tr('common:export_failed')));
                }}
              />
            </div>
          </div>
        </Panel>
      )}
    </div>
      {status && <p role="status">{status}</p>}
    </section>
  );
}
