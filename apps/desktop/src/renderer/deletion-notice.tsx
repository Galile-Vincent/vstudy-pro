import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { desktop } from './bridge';

export function DeletionNotice() {
  const [pending, setPending] = useState(false);
  const { t } = useTranslation();
  useEffect(() => {
    let active = true;
    void desktop.invoke('settings:deletionStatus', {}).then(result => {
      if (active) setPending(result.pending);
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  return pending ? <p role="status">{t('settings:delete_pending')}</p> : null;
}
