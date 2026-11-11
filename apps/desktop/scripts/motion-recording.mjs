/** Records the real app with motion on: Home, Courses, a course and its tabs, Settings, row hovers. Usage: MOTION_OUT=<dir> node scripts/motion-recording.mjs */
import { mkdtemp, readdir, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { launchMarketing, viewport } from './marketing-session.mjs';

const out = resolve(process.env.MOTION_OUT ?? '.');
const desktop = resolve(import.meta.dirname,'..');
const directory = await mkdtemp(join(tmpdir(),'vstudy-motion-'));
const videos = join(directory,'video');
const session = await launchMarketing({desktop,directory,scale:1,launch:{recordVideo:{dir:videos,size:viewport}}});
const { page, go, fixture } = session;
try {
  await session.applyAppearance(process.env.MOTION_THEME ?? 'vstudy',process.env.MOTION_MODE ?? 'light');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await go({view:'home'},'.home-page');
  await wait(1500);
  for (const row of (await page.locator('.home-page .ui-row-target').all()).slice(0,4)) { await row.hover({timeout:3000}).catch(()=>{}); await wait(350); }
  await page.locator('.shell-sidebar').getByText('Courses',{exact:true}).click();
  await page.locator('.moodle-course-card').first().waitFor();
  await wait(1200);
  for (const row of (await page.locator('.moodle-course-card').all()).slice(0,4)) { await row.hover({timeout:3000}).catch(()=>{}); await wait(300); }
  await page.locator('.moodle-course-card').first().getByRole('link').first().click().catch(()=>go({view:'courses',courseId:fixture.details[0].course.id},'.moodle-module'));
  await page.locator('.moodle-module').first().waitFor();
  await wait(1200);
  for (const name of ['Deadlines','Announcements','Content']) { await page.getByRole('tab',{name,exact:true}).first().click(); await wait(900); }
  await page.evaluate(()=>window.dispatchEvent(new window.CustomEvent('vstudy:open-settings',{detail:{tab:'appearance'}})));
  await page.locator('.settings-dialog').waitFor();
  await wait(1200);
  for (const card of await page.locator('.appearance-layout .scheme-card').all()) { await card.hover({timeout:3000}).catch(()=>{}); await wait(400); }
  await page.keyboard.press('Escape');
  await wait(1000);
} catch (error) {
  await page.screenshot({path:join(out,'motion-failure.png')});
  throw error;
} finally {
  await session.close();
  const [file] = await readdir(videos);
  await rename(join(videos,file),join(out,'motion.webm'));
  await rm(directory,{recursive:true,force:true});
}
