/** Shared consent fields render client-supplied values only as inert text. */
import { useEffect, useState } from 'react';
import { scopeSchema, type Scope, type AgentsState } from '../../shared/mcp';
import { tr } from '../../shared/i18n';
import { useFormat } from '../i18n';
import { Checkbox } from '../components/ui/checkbox';

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
      {scopeSchema.options.filter(scope => availableScopes.includes(scope)).map(scope => <label className="agents-choice" key={scope}>
        <Checkbox checked={scopes.includes(scope)} disabled={disabled} onCheckedChange={checked => onScopes(checked ? [...scopes, scope] : scopes.filter(value => value !== scope))} />
        <span>{tr(`agents:scope_${scope.replace(':', '_')}`)}<small><code>{scope}</code></small></span>
      </label>)}
      {!availableScopes.length && <p>{tr('agents:no_scopes')}</p>}
    </fieldset>
    <fieldset disabled={disabled}>
      <legend>{tr('agents:accounts')}</legend>
      {accounts.map(account => <label className="agents-choice" key={account.id}>
        <Checkbox checked={accountIds.includes(account.id)} disabled={disabled} onCheckedChange={checked => onAccounts(checked ? [...accountIds, account.id] : accountIds.filter(value => value !== account.id))} />
        <span>{account.school}<small>{account.user}</small><code>{account.id}</code></span>
      </label>)}
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
