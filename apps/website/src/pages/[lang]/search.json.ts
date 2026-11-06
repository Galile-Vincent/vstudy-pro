/** A static search index per locale. Search never leaves the browser. */
import { guides, getGuide } from '../../data/docs';
import { getLegal, legalSlugs } from '../../data/legal';
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
  const legal = legalSlugs.flatMap(slug => {
    const { doc } = getLegal(slug,props.language);
    return doc.sections.map(section => ({
      title:doc.title, heading:section.title,
      text:[doc.description,...section.blocks.flatMap(block => block.type === 'p' || block.type === 'h3' ? [block.text] : block.type === 'table' ? [block.caption,...block.rows.flat()] : block.items)].join(' ').replace(/\[\[|\]\]|\*\*|`|\{\{|\}\}|\]\([^)\s]*\)|\[/g,''),
      url:path(`${props.language}/${slug}/#${section.id}`),
    }));
  });
  return Response.json([...entries,...legal]);
}
