import { Badge } from '@astryxdesign/core';
import { useTranslation } from 'react-i18next';
import { tr } from '../../shared/i18n';
import { RELEASE_CHANNEL } from '../../shared/release';

export function BetaBadge() {
  useTranslation();
  return <Badge className="beta-badge" label={tr(`library:${RELEASE_CHANNEL}`)} />;
}
