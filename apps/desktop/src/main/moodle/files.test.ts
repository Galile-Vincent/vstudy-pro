/**
 * Regression coverage for moodle files.
 * Owned by main/moodle.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
import { expect, it, vi } from 'vitest';
import { authenticatedFileUrl, moodleImage, sanitizeMoodleFilename } from './files';
it.each(['week?1*.pdf','a<b>c|d".pdf','CON.pdf','nul.txt','COM1.pdf','LPT9.pdf','..hidden.pdf','name.pdf. ','a'.repeat(300)+'.pdf','課'.repeat(150)+'.pdf'])('makes a portable bounded staging filename for %s',name => {
  const safe = sanitizeMoodleFilename(name);
  expect(safe).not.toMatch(/[?*<>|"/\\:]/);
  expect(safe).not.toMatch(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i);
  expect(safe).not.toMatch(/^[.]|[. ]$/);
  expect(Buffer.byteLength(safe)).toBeLessThanOrEqual(120);
  expect(safe).toMatch(/\.(pdf|txt)$/);
});
it('keeps a typical Windows staging path under MAX_PATH',() => {
  const root = 'C:\\Users\\'+'u'.repeat(40)+'\\AppData\\Local\\Temp';
  const filename = sanitizeMoodleFilename('a'.repeat(300)+'.pdf');
  expect(`${root}\\.download-ABCDEF\\${filename}`.length+1).toBeLessThanOrEqual(260);
});
it.each([
 ['https://school.example/moodle/pluginfile.php/1/a.pdf','https://school.example/moodle/webservice/pluginfile.php/1/a.pdf?token=secret'],
 ['https://school.example/moodle/pluginfile.php?file=%2F1%2Fa.pdf&token=old#top','https://school.example/moodle/webservice/pluginfile.php?file=%2F1%2Fa.pdf&token=secret'],
 ['https://school.example/moodle/webservice/pluginfile.php/1/a.pdf?forcedownload=1','https://school.example/moodle/webservice/pluginfile.php/1/a.pdf?forcedownload=1&token=secret'],
])('rewrites Moodle file URL %s', (source,expected) => expect(authenticatedFileUrl(source,'https://school.example/moodle','secret')).toBe(expected));
it.each(['https://evil.example/pluginfile.php/1/a.pdf','https://school.example/pluginfile.php/1/a.pdf','https://school.example/moodle/pluginfile.php.evil/1/a.pdf'])('rejects files outside the site endpoint %s',source => expect(() => authenticatedFileUrl(source,'https://school.example/moodle','secret')).toThrow());
it('returns authenticated course images as data without exposing token URLs',async () => {
  const request = vi.fn<typeof fetch>(async () => new Response(new Uint8Array([137,80,78,71]),{headers:{'content-type':'image/png'}}));
  expect(await moodleImage('https://school.example/moodle/pluginfile.php/1/cover.png','https://school.example/moodle','image-secret',request)).toBe('data:image/png;base64,iVBORw==');
  expect(request.mock.calls.map(call => String(call[0]))).toEqual(['https://school.example/moodle/webservice/pluginfile.php/1/cover.png?token=image-secret']);
  expect(request.mock.calls[0]?.[1]?.redirect).toBe('error');
});
it('rejects SVG, oversized images, and foreign image origins',async () => {
  expect(await moodleImage('https://school.example/svg','https://school.example',undefined,async () => new Response('<svg/>',{headers:{'content-type':'image/svg+xml'}}))).toBe(null);
  expect(await moodleImage('https://school.example/large','https://school.example',undefined,async () => new Response(new Uint8Array(2*1024*1024+1),{headers:{'content-type':'image/png'}}))).toBe(null);
  expect(await moodleImage('https://evil.example/cover.png','https://school.example','secret',async () => {throw new Error('must not request');})).toBe(null);
});

it('expires cached course images after five minutes',async () => {
  vi.useFakeTimers();
  try {
    const request=vi.fn<typeof fetch>(async () => new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/png'}}));
    const source='https://ilearning.cycu.edu.tw/pluginfile.php/ttl-test/image.png';
    const {moodleImage}=await import('./files');
    expect(await moodleImage(source,'https://ilearning.cycu.edu.tw','ttl-token',request)).toContain('data:image/png;base64,');
    await moodleImage(source,'https://ilearning.cycu.edu.tw','ttl-token',request);
    expect(request).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5*60_000+1);
    await moodleImage(source,'https://ilearning.cycu.edu.tw','ttl-token',request);
    expect(request).toHaveBeenCalledTimes(2);
  } finally {vi.useRealTimers();}
});
