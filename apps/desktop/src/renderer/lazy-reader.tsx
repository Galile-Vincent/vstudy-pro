import { lazy, Suspense, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { tr } from '../shared/i18n';
const Reader=lazy(()=>import('./markdown').then(module=>({default:module.DocumentMarkdown})));
export function DocumentMarkdown(props: ComponentProps<typeof import('./markdown').DocumentMarkdown>) {
  useTranslation();
  return <Suspense fallback={<p role="status">{tr('common:loading_document')}</p>}><Reader {...props}/></Suspense>;
}
