/** Rewrite recognized course and module hyperlinks to the SDK's stable VStudy resource URIs. @packageDocumentation */
import { decodeHtmlEntities } from '../../shared/html';
import type { BackendContext } from './backend-context';

export const courseReference = (account:string, courseId:string) => `vstudy://accounts/${account}/courses/${courseId}`;
export const moduleReference = (account:string, courseId:string, moduleId:string) => `${courseReference(account, courseId)}/modules/${moduleId}`;
export const fileReference = (account:string, fileId:string) => `vstudy://accounts/${account}/files/${fileId}`;

export function rewriteReferences(context:BackendContext, courseId:string, value:string): string {
  const detail = context.course(courseId);
  const account = context.account();
  const links = new Map<string, string>();
  links.set(`${account.siteUrl}/course/view.php?id=${detail.course.remoteId}`, courseReference(account.id, courseId));
  for (const section of detail.sections.filter(row => row.accessible)) for (const module of section.modules.filter(row => row.accessible)) {
    if (module.url) links.set(module.url, moduleReference(account.id, courseId, module.id));
  }
  const resolve = (href:string): string | undefined => {
    try {
      const target = new URL(decodeHtmlEntities(href), account.siteUrl + '/');
      target.hash = '';
      if (target.origin !== new URL(account.siteUrl).origin) return undefined;
      for (const [url, reference] of links) {
        const known = new URL(url);
        if (target.origin === known.origin && target.pathname === known.pathname && target.searchParams.get('id') === known.searchParams.get('id')) return reference;
      }
    } catch { return undefined; }
    return undefined;
  };
  return value.replace(/<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a\s*>/gi, (_tag, quoted:string | undefined, single:string | undefined, unquoted:string | undefined, label:string) => {
    const reference = resolve(quoted ?? single ?? unquoted ?? '');
    return reference ? `${label} [${reference}]` : label;
  }).replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (_tag, label:string, href:string) => {
    const reference = resolve(href);
    return reference ? `${label} [${reference}]` : label;
  });
}
