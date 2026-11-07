// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { builtinThemes } from '../../../shared/themes';
import { DocumentArt } from '../../shell/document-art';
import { describe, expect, it } from 'vitest';
import { courseArt } from './cover';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT = true;
describe('Course artwork',()=>{
  it('keeps the same course and term stable while varying the course family',()=>{
    const first = courseArt('course-a','1151');
    expect(courseArt('course-a','1151')).toEqual(first);
    expect(courseArt('course-a','1152')).not.toEqual(first);
    expect(new Set(Array.from({length:8},(_,index)=>JSON.stringify(courseArt(`course-${index}`,'1151')))).size).toBe(8);
    expect(Number(first.style['--art-hue-gap' as keyof typeof first.style])).toBeGreaterThanOrEqual(30);
    expect(Number(first.style['--art-hue-gap' as keyof typeof first.style])).toBeLessThanOrEqual(50);
    expect(Object.values(first.style).join(' ')).toMatch(/var\(--chart-\d\)/);
  });
  const contexts = builtinThemes.flatMap(theme => (['light','dark'] as const).map(scheme => ({theme:theme.id, scheme})));
  it.each(contexts)('never renders decorative patterns for 500 ids in $theme / $scheme', async ({theme,scheme}) => {
    const originalTheme = document.documentElement.dataset.theme;
    const originalScheme = document.documentElement.dataset.scheme;
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.scheme = scheme;
    const forbidden = /<(?:img|svg|canvas|picture|image|pattern|filter)\b|(?:pattern|hatch|stripe|grid|ring|grain|noise|orbit|contour)|url\(/i;
    try {
      for (let index=0; index<500; index++) {
        const id = `course-${index}-${Math.imul(index + 1, 2654435761) >>> 0}`;
        for (const term of [null,'1142','1151','1152']) {
          const art = courseArt(id,term);
          expect(JSON.stringify(art)).not.toMatch(forbidden);
        }
        expect(renderToStaticMarkup(<DocumentArt id={id}/>)).not.toMatch(forbidden);
      }
    } finally {
      if (originalTheme === undefined) delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = originalTheme;
      if (originalScheme === undefined) delete document.documentElement.dataset.scheme;
      else document.documentElement.dataset.scheme = originalScheme;
    }
  });
  it('ships only broad fields and one quiet hero curve without pattern rules', () => {
    const css = readFileSync(resolve('src/renderer/shell/soft-art.css'),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
    expect(css).not.toMatch(/(?:repeating-|conic-gradient|url\(|stroke|filter|border\s*:|box-shadow|data-(?:pattern|motif))/i);
    expect(css.match(/radial-gradient\(/g)).toHaveLength(2);
    expect(css).toContain('var(--surface) 6%');
    expect(css).toContain('.art-reader-cover.soft-art::before { display:none; }');
  });

});
