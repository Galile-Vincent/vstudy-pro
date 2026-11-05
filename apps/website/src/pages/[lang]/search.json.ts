/** A static search index per locale. Search never leaves the browser. */
import { guides, getGuide } from '../../data/docs';
import { languages, type Language } from '../../data/ui';
import { path } from '../../config';
export function getStaticPaths() { return languages.map(language => ({params:{lang:language},props:{language}})); }
export function GET({ props }: { props: { language: Language } }) {
  const entries = guides.flatMap(item => {
    const guide = getGuide(item.slug,props.language);
    return guide.sections.map(section => ({
      title:guide.title, heading:section.title,
      text:[guide.description,...section.paragraphs,...section.steps ?? []].join(' '),
      url:path(`${props.language}/docs/${guide.slug}/#${section.id}`),
    }));
  });
  return Response.json(entries);
}
