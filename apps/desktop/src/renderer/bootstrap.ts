import { tr } from '../shared/i18n';
import { reportRendererError } from './renderer-errors';

export function showBootstrapError(reload = () => window.location.reload()) {
  const root = document.getElementById('root') ?? document.body.appendChild(document.createElement('main'));
  const alert = document.createElement('section');
  alert.setAttribute('role', 'alert');
  const message = document.createElement('p');
  message.textContent = tr('common:surface_render_error');
  const button = document.createElement('button');
  button.textContent = tr('common:reload_application');
  button.onclick = reload;
  alert.append(message, button);
  root.replaceChildren(alert);
  document.documentElement.dataset.appearanceReady = 'true';
}

export async function bootstrap(initialize: () => Promise<void>, render: () => void, reload?: () => void) {
  try { await initialize(); render(); }
  catch (error) { reportRendererError(error, 'bootstrap'); showBootstrapError(reload); }
  finally { document.documentElement.dataset.appearanceReady = 'true'; }
}
