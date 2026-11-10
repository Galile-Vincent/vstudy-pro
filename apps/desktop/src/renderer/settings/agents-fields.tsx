/** Shared consent fields render client-supplied values only as inert text. */
import { useEffect, useState } from 'react';
import { scopeSchema, type Scope, type AgentsState } from '../../shared/mcp';
import { tr } from '../../shared/i18n';
import { useFormat } from '../i18n';
import { CheckboxInput } from '@astryxdesign/core';

type SelectionProps = {
  availableScopes: readonly Scope[];
  scopes: Scope[];
  accountIds: string[];
  accounts: AgentsState['accounts'];
  onScopes: (scopes: Scope[]) => void;
  onAccounts: (accounts: string[]) => void;
  disabled: boolean;
};

export function AgentSelection({ availableScopes, scopes, accountIds, accounts, onScopes, onAccounts, disabled }: SelectionProps) {
  return <div className="agents-selection">
    <fieldset disabled={disabled}>
      <legend>{tr('agents:scopes')}</legend>
      {scopeSchema.options.filter(scope => availableScopes.includes(scope)).map(scope => <div className="agents-choice" key={scope}>
        <CheckboxInput label={tr(`agents:scope_${scope.replace(':', '_')}`)} description={scope} value={scopes.includes(scope)} isDisabled={disabled} onChange={checked => onScopes(checked ? [...scopes, scope] : scopes.filter(value => value !== scope))} />
      </div>)}
      {!availableScopes.length && <p>{tr('agents:no_scopes')}</p>}
    </fieldset>
    <fieldset disabled={disabled}>
      <legend>{tr('agents:accounts')}</legend>
      {accounts.map(account => <div className="agents-choice" key={account.id}>
        <CheckboxInput label={account.school} description={`${account.user} · ${account.id}`} value={accountIds.includes(account.id)} isDisabled={disabled} onChange={checked => onAccounts(checked ? [...accountIds, account.id] : accountIds.filter(value => value !== account.id))} />
      </div>)}
      {!accounts.length && <p className="agents-muted">{tr('agents:no_accounts')}</p>}
    </fieldset>
    <p className="agents-muted">{tr('agents:selection_hint')}</p>
  </div>;
}

export function AgentDate({ value }: { value: string | null }) {
  const format = useFormat();
  return value ? <time dateTime={value}>{format.date(value, { dateStyle: 'medium', timeStyle: 'short' })}</time> : <span>{tr('agents:never')}</span>;
}

export function AgentAccount({ id, accounts }: { id: string | null; accounts: AgentsState['accounts'] }) {
  if (!id) return <span>{tr('agents:local_planner')}</span>;
  const account = accounts.find(account => account.id === id);
  return <span>{account ? `${account.school} · ${account.user}` : tr('agents:unavailable_account')}<small><code>{id}</code></small></span>;
}

export function useAgentDeadline(expiresAt: string) {
  const end = Date.parse(expiresAt);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (end > current) timer = setTimeout(tick, Math.min(1000, end - current));
    };
    tick();
    return () => clearTimeout(timer);
  }, [end]);
  return Math.max(0, Math.ceil((end - now) / 1000));
}
