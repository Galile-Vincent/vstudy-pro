import { useTranslation } from 'react-i18next';
import { tr } from '../../shared/i18n';
import { Button } from '@astryxdesign/core';

export function LoadError({message,retry}:{message:string;retry:()=>void}) {
  useTranslation();
  return <div role="alert"><p>{message}</p><Button label={tr('common:retry')} onClick={retry} /></div>;
}
