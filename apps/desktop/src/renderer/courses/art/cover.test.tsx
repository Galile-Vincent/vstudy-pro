// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { builtinThemes } from '../../../shared/themes';
import { DocumentArt } from '../../shell/document-art';
import { describe, expect, it } from 'vitest';
import { createMockMoodleApi } from '../../dev-mock';
import { CourseArtwork, CourseCover, CourseProgress, courseArt } from './cover';

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
  it('uses only generated fields even when the course provides a cover image',async()=>{
    const course = (await createMockMoodleApi().overview()).courses[0]!;
    course.imageUrl = 'https://moodle.example.edu/missing.jpg';
    const host = document.createElement('div'), root = createRoot(host);
    try {
      await act(async()=>root.render(<CourseCover course={course} deadline={{label:"Due tomorrow",urgent:true}}/>));
      expect(host.querySelector('img')).toBeNull();
      expect(host.querySelector('.moodle-cover-due')?.textContent).toBe('Due tomorrow');
      expect(host.querySelector('.moodle-cover progress')).not.toBeNull();
      expect(host.querySelector('.soft-art')).not.toBeNull();
      expect(host.querySelector('.moodle-art-pattern,.moodle-art-grain')).toBeNull();
      expect(host.querySelector('.moodle-course-code')?.textContent).toContain(course.identity.code);
      expect(host.querySelector('.moodle-artwork')?.getAttribute('aria-hidden')).toBe('true');
    } finally {await act(async()=>root.unmount());}
  });
  it('omits unknown progress and exposes rounded server completion',async()=>{
    const course = (await createMockMoodleApi().overview()).courses[0]!;
    const host = document.createElement('div'), root = createRoot(host);
    try {
      course.progress = null;
      await act(async()=>root.render(<CourseProgress course={course}/>));
      expect(host.querySelector('progress')).toBeNull();
      course.progress = 64.4;
      await act(async()=>root.render(<CourseProgress course={course}/>));
      expect(host.querySelector('progress')?.value).toBe(64);
      expect(host.querySelector('progress')?.getAttribute('aria-label')).toBe('64% complete');
    } finally {await act(async()=>root.unmount());}
  });
  const contexts = builtinThemes.flatMap(theme => (['light','dark'] as const).map(scheme => ({theme:theme.id, scheme})));
  it.each(contexts)('never renders decorative patterns for 500 ids in $theme / $scheme', async ({theme,scheme}) => {
    const originalTheme = document.documentElement.dataset.theme;
    const originalScheme = document.documentElement.dataset.scheme;
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.scheme = scheme;
    const course = (await createMockMoodleApi().overview()).courses[0]!;
    const imageUrl = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"><pattern id="hatch"><path d="M0 0L10 10"/></pattern></svg>';
    const forbidden = /<(?:img|svg|canvas|picture|image|pattern|filter)\b|(?:pattern|hatch|stripe|grid|ring|grain|noise|orbit|contour)|url\(/i;
    try {
      for (let index=0; index<500; index++) {
        const id = `course-${index}-${Math.imul(index + 1, 2654435761) >>> 0}`;
        for (const term of [null,'1142','1151','1152']) {
          const candidate = {...course,id,imageUrl,identity:{...course.identity,term}};
          const art = courseArt(id,term);
          expect(JSON.stringify(art)).not.toMatch(forbidden);
          const markup = renderToStaticMarkup(<CourseArtwork course={candidate}/>);
          expect(markup).not.toMatch(forbidden);
          expect(Array.from(markup.matchAll(/<([a-z][\w-]*)\b/g),match=>match[1])).toEqual(['div','span']);
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
    expect(css).toContain('.moodle-cover .soft-art::before,.art-reader-cover.soft-art::before { display:none; }');
  });

});
