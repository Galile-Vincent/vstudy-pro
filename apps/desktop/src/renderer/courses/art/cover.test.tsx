// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { createMockMoodleApi } from '../../dev-mock';
import { CourseCover, CourseProgress, courseArt } from './cover';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT = true;
describe('Course artwork',()=>{
  it('keeps the same course and term stable while varying the course family',()=>{
    const first = courseArt('course-a','1151');
    expect(courseArt('course-a','1151')).toEqual(first);
    expect(courseArt('course-a','1152')).not.toEqual(first);
    expect(new Set(Array.from({length:8},(_,index)=>JSON.stringify(courseArt(`course-${index}`,'1151')))).size).toBe(8);
    expect(Number(first.style['--art-hue-gap' as keyof typeof first.style])).toBeGreaterThanOrEqual(40);
    expect(Number(first.style['--art-hue-gap' as keyof typeof first.style])).toBeLessThanOrEqual(90);
    expect(Object.values(first.style).join(' ')).toMatch(/var\(--chart-\d\)/);
  });
  it('retains generated artwork and a readable code when the remote cover fails',async()=>{
    const course = (await createMockMoodleApi().overview()).courses[0]!;
    course.imageUrl = 'https://moodle.example.edu/missing.jpg';
    const host = document.createElement('div'), root = createRoot(host);
    try {
      await act(async()=>root.render(<CourseCover course={course} deadline={{label:"Due tomorrow",urgent:true}}/>));
      await act(async()=>host.querySelector('img')!.dispatchEvent(new Event('error')));
      expect(host.querySelector('img')).toBeNull();
      expect(host.querySelector('.moodle-cover-due')?.textContent).toBe('Due tomorrow');
      expect(host.querySelector('.moodle-cover progress')).not.toBeNull();
      expect(host.querySelector('.moodle-art-pattern')).not.toBeNull();
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
});
