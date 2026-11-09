import { useTranslation } from 'react-i18next';
import { tr } from '../../shared/i18n';
import { BetaBadge } from './beta-badge';
import './app-version.css';

export function AppVersion() {
  useTranslation();
  return <p className="app-version"><span>{tr('settings:app_version', { version: __APP_VERSION__ })}</span> <BetaBadge/></p>;
}
