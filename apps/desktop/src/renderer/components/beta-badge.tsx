import { useTranslation } from 'react-i18next';
import { tr } from '../../shared/i18n';
import { RELEASE_CHANNEL } from '../../shared/release';
import './beta-badge.css';

export function BetaBadge() {
  useTranslation();
  return <span className="beta-badge">{tr(`library:${RELEASE_CHANNEL}`)}</span>;
}
