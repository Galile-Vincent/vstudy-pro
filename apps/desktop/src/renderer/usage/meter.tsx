import { useTranslation } from 'react-i18next';
import { tr } from '../../shared/i18n';
import { useEffect, useState, useRef, type SyntheticEvent } from 'react';
import type { Conversation, Settings, UsageRecord, UsageSummary } from '../../shared';
import { desktop } from '../bridge';
import { money, compactTokens } from './chip';
import { budgetState } from './budget';

export function useUsage(conversationId: Conversation['id'], modelId?: string) {
  useTranslation();
  const [data, setData] = useState<{ settings: Settings; month: UsageSummary; records: UsageRecord[] }>();
  const [priceUnknown, setPriceUnknown] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void Promise.all([
        desktop.invoke('settings:get', {}),
        desktop.invoke('usage:summary', { period: 'month' }),
        desktop.invoke('usage:forConversation', { conversationId }),
        desktop.invoke('usage:estimate', { conversationId, userMessage: '.' }),
      ])
        .then(([settings, month, records, estimate]) => {
          if (active) {
            setData({ settings, month, records });
            setPriceUnknown(estimate.costUsd === undefined);
            setError('');
          }
        })
        .catch(() => {
          if (active) setError(tr('common:usage_unavailable'));
        });
    };
    refresh();
    window.addEventListener('usage-updated', refresh);
    return () => {
      active = false;
      window.removeEventListener('usage-updated', refresh);
    };
  }, [conversationId, modelId]);

  return { data, error, priceUnknown };
}

export function UsageButton({
  data,
  error,
  priceUnknown,
  onClick,
}: Omit<ReturnType<typeof useUsage>, 'priceUnknown'> & { priceUnknown?: boolean } & { onClick: () => void }) {
  useTranslation();
  const records = data?.records ?? [];
  const tokens = records.reduce((n, r) => n + r.inputTokens + r.outputTokens, 0);
  const known = records.filter((r) => r.costUsd !== undefined);
  const cost = known.reduce((n, r) => n + r.costUsd!, 0);
  const description = `${tr('usage:token_count', { count: tokens, formatted: compactTokens(tokens) })}${
    known.length ? ` · ${money(cost)}` : ''
  }${records.some((r) => r.aborted) ? tr('common:includes_aborted_turns') : ''}`;

  return (
    <button
      type="button"
      className="composer-usage"
      onClick={onClick}
      aria-label={tr('common:conversation_usage')}
      title={
        data
          ? `${tr('novice:usage_help')} ${tr('common:conversation_usage')} · ${description}${
              priceUnknown ? ` · ${tr('usage:current_price_unknown')}` : ''
            } · ${tr('common:view_usage_and_budget_settings')}`
          : tr('common:view_usage_and_budget_settings')
      }
    >
      {error ||
        (!data ? (
          tr('usage:usage_loading')
        ) : (
          <>
            <span className="usage-full">
              {tr('usage:token_count', { count: tokens, formatted: compactTokens(tokens) })}
              {known.length ? ` · ${money(cost)}` : ''}
            </span>
            <span className="usage-compact" aria-hidden>
              {compactTokens(tokens)}
            </span>
          </>
        ))}
    </button>
  );
}

export function UsageMeter({
  data,
  error,
  priceUnknown,
}: Omit<ReturnType<typeof useUsage>, 'priceUnknown'> & { priceUnknown?: boolean }) {
  useTranslation();
  if (!data) return error ? <small className="usage-meter">{error}</small> : null;
  const { settings, month } = data;
  const state = budgetState(settings, month);
  if (state.tone === 'normal') return null;

  return (
    <div className={`usage-meter ${state.tone}`}>
      {(settings.monthlyBudgetUsd || settings.monthlyTokenBudget) && (
        <>
          <span>
            {tr('common:month')}
            {money(month.costUsd ?? (month.calls ? undefined : 0))}
            {settings.monthlyBudgetUsd
              ? tr('usage:money_left', {
                  used: '',
                  budget: money(settings.monthlyBudgetUsd),
                  left: money(Math.max(0, settings.monthlyBudgetUsd - (month.costUsd ?? 0))),
                })
              : ''}
            {settings.monthlyTokenBudget
              ? tr('usage:token_left', {
                  used: compactTokens(state.tokens),
                  budget: compactTokens(settings.monthlyTokenBudget),
                  left: compactTokens(Math.max(0, settings.monthlyTokenBudget - state.tokens)),
                })
              : ''}
          </span>
          <progress
            aria-label={tr('common:monthly_budget_used')}
            value={Math.min(100, state.percent)}
            max={100}
          />
        </>
      )}
      {priceUnknown && <small>{tr('usage:current_price_unknown')}</small>}
    </div>
  );
}

export function useBudgetGuard(
  data: ReturnType<typeof useUsage>['data'],
  conversationId: Conversation['id'],
  draft: string,
) {
  useTranslation();
  const [warning, setWarning] = useState(false);
  const allow = useRef(false);
  const checking = useRef(false);
  const form = useRef<HTMLFormElement | null>(null);
  const [reason, setReason] = useState('');

  const pending = useRef<(() => void) | null>(null);

  const approve = () => {
    setWarning(false);
    const send = pending.current;
    pending.current = null;
    if (send) { send(); return; }
    allow.current = true;
    form.current?.requestSubmit();
  };

  const check = (userMessage: string) => {
    if (checking.current) return;
    checking.current = true;
    void Promise.all([
      desktop.invoke('usage:estimate', { conversationId, userMessage }),
      desktop.invoke('usage:summary', { period: 'month' }),
      desktop.invoke('settings:get', {}),
    ])
      .then(([next, month, settings]) => {
        const exceeds = budgetState(
          next.costUsd === undefined ? { ...settings, monthlyBudgetUsd: undefined } : settings,
          month,
          { tokens: next.inputTokens + next.outputTokens, costUsd: next.costUsd ?? 0 },
        ).exceeds;
        window.dispatchEvent(new CustomEvent('usage-price-unknown', { detail: next.costUsd === undefined }));
        if (next.costUsd === undefined && settings.monthlyBudgetUsd) {
          setReason(tr('usage:unpriced_budget'));
          setWarning(true);
        } else if (exceeds) {
          setReason(tr('common:the_next_request_may_exceed_your_monthly_budget'));
          setWarning(true);
        } else approve();
      })
      .catch(() => {
        setReason(tr('common:could_not_check_your_budget'));
        setWarning(true);
      })
      .finally(() => {
        checking.current = false;
      });
  };

  const noBudget = () => !!data && !data.settings.monthlyBudgetUsd && !data.settings.monthlyTokenBudget;

  const guard = (event: SyntheticEvent) => {
    if (allow.current) {
      allow.current = false;
      return;
    }
    if (noBudget()) return;
    event.preventDefault();
    event.stopPropagation();
    form.current =
      event.currentTarget instanceof HTMLFormElement
        ? event.currentTarget
        : (event.currentTarget as HTMLElement).closest('form');
    pending.current = null;
    check(draft);
  };

  /** Sends a message that is not in the composer through the same budget check as a typed one. */
  const guardSend = (userMessage: string, send: () => void) => {
    if (noBudget()) { send(); return; }
    pending.current = send;
    check(userMessage);
  };

  return { guard, guardSend, warning, reason, dismiss: () => { pending.current = null; setWarning(false); }, approve };
}

export function SubscriptionWindowMeter({ label, usedPercent }: { label: string; usedPercent: number }) {
  return <div className="subscription-window"><span>{label}<small>{Math.round(usedPercent)}%</small></span><progress aria-label={label} value={usedPercent} max={100} /></div>;
}
