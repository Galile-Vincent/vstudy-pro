/** Encodes captioned, deterministic clips from real Electron acceptance screenshots. No external encoder. */
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const profile = await mkdtemp(join(tmpdir(), 'vstudy-onboarding-media-'));
const evidence = resolve('../../docs/evidence/onboarding');
const output = resolve('resources/onboarding');
const copy = JSON.parse(await readFile('src/shared/locales/en/onboarding.json', 'utf8'));
const clips = {
  school: [
    ['en-school-school-picker.png', copy.school_caption_1],
    ['en-school-school-result.png', copy.record_confirm],
    ['en-school-due-work.png', copy.due_caption_2],
    ['en-school-first-task.png', copy.agent_caption_1],
  ],
  documents: [
    ['en-sample-selection.png', copy.selection_caption_1],
    ['en-sample-chat-answer.png', copy.selection_caption_2],
    ['en-sample-history-search.png', copy.history_caption_2],
  ],
};
let app;
try {
  await mkdir(output, { recursive: true });
  app = await electron.launch({ args: [resolve('.'), `--user-data-dir=${profile}`], env: { ...process.env, ELECTRON_RUN_AS_NODE: '', VSTUDY_LOCALE: 'en' } });
  const page = await app.firstWindow();
  for (const language of ['en', 'zh-Hant', 'ja']) {
    const catalog = JSON.parse(await readFile(`src/shared/locales/${language}/onboarding.json`, 'utf8'));
    for (const [name, keys] of Object.entries({ school: ['school_caption_1', 'record_confirm', 'due_caption_2', 'agent_caption_1'], documents: ['selection_caption_1', 'selection_caption_2', 'history_caption_2'] })) {
      const captions = keys.map((key, index) => `00:00:${String(index * 5).padStart(2, '0')}.000 --> 00:00:${String((index + 1) * 5).padStart(2, '0')}.000\n${catalog[key]}\n`).join('\n');
      await writeFile(join(output, `${name}.${language}.vtt`), `WEBVTT\n\n${captions}`);
    }
  }
  for (const [name, frames] of Object.entries(clips)) {
    const images = await Promise.all(frames.map(async ([file, caption]) => ({ data: Array.from(await readFile(join(evidence, file))), caption })));
    const bytes = await page.evaluate(async images => {
      const canvas = window.document.createElement('canvas'); canvas.width = 960; canvas.height = 830;
      const context = canvas.getContext('2d');
      const stream = canvas.captureStream(0), track = stream.getVideoTracks()[0];
      const recorder = new window.MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 450000 });
      const chunks = [];
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      const finished = new Promise((resolve, reject) => { recorder.onstop = resolve; recorder.onerror = reject; });
      recorder.start();
      for (const image of images) {
        const bitmap = await window.createImageBitmap(new window.Blob([new Uint8Array(image.data)], { type: 'image/png' }));
        context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, 0, 0, 960, 720); bitmap.close();
        context.fillStyle = '#202020'; context.font = '18px system-ui';
        const words = image.caption.split(' '); let line = '', y = 750;
        for (const word of words) {
          if (context.measureText(`${line} ${word}`).width > 910) { context.fillText(line, 24, y); y += 25; line = word; }
          else line = line ? `${line} ${word}` : word;
        }
        context.fillText(line, 24, y); track.requestFrame();
        await new Promise(resolve => window.setTimeout(resolve, 5000));
      }
      recorder.stop(); await finished; track.stop();
      return Array.from(new Uint8Array(await new window.Blob(chunks).arrayBuffer()));
    }, images);
    const path = join(output, `${name}.webm`); await writeFile(path, Buffer.from(bytes));
    assert.ok((await stat(path)).size < 4 * 1024 * 1024, 'each clip stays below 4 MiB');
    console.log(`${name}: ${bytes.length} bytes`);
  }
} finally { await app?.close(); await rm(profile, { recursive: true, force: true }); }
