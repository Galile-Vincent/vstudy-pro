import {_electron as electron} from 'playwright';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';

const directory = await mkdtemp(join(tmpdir(),'vstudy-cards-'));
const evidence = resolve('../../docs/screenshots/moodle-cards');
const report = [];
let app;
try {
  await mkdir(evidence,{recursive:true});
  app = await electron.launch({args:[resolve('.'),`--user-data-dir=${directory}`],env:{...process.env,ELECTRON_RUN_AS_NODE:'',VSTUDY_LOCALE:'en',VSTUDY_FAKE_PROVIDER:'1'}});
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror',error => errors.push(error.message));
  await page.evaluate(() => window.localStorage.setItem('vstudy-route',JSON.stringify({view:'courses'})));
  await page.reload();
  await page.locator('.moodle-course-card').first().waitFor();
  await page.emulateMedia({reducedMotion:'reduce'});
  for (const width of [1440,1000,760]) {
    await app.evaluate(({BrowserWindow},width) => BrowserWindow.getAllWindows()[0].setContentSize(width,1000),width);
    for (const theme of ['light','dark']) {
      await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});
      for (const tab of ['Current','Past','All']) {
        await page.getByRole('tab',{name:new RegExp(`^${tab}`)}).click();
        const expected = tab === 'Current' ? 11 : tab === 'Past' ? 36 : 47;
        await page.waitForFunction(expected => window.document.querySelectorAll('.moodle-course-card').length === expected,expected);
        const sizes = await page.locator('.moodle-course-card').evaluateAll(cards => cards.map(card => {
          const rect = card.getBoundingClientRect();
          const child = selector => {const r=card.querySelector(selector).getBoundingClientRect();return {top:r.top-rect.top,height:r.height};};
          return {height:rect.height,title:child('h3'),cover:child('.moodle-cover'),teacher:child('.moodle-identity-line'),footer:child('footer')};
        }));
        for (const size of sizes) assert.deepEqual(size,sizes[0]);
        const dueHeights = await page.locator('.moodle-due-card').evaluateAll(cards => cards.map(card => card.getBoundingClientRect().height));
        assert.equal(new Set(dueHeights).size,1);
        assert.equal(dueHeights[0],sizes[0].height);
        await page.locator('.moodle-grid-heading').evaluate(element => element.scrollIntoView({block:'start'}));
        await page.evaluate(async () => {window.document.activeElement?.blur();await new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));});
        await page.screenshot({path:join(evidence,`${tab.toLowerCase()}-${theme}-${width}.png`),fullPage:true});
        if (tab === 'Current') {
          await page.locator('.moodle-due-section').evaluate(element => element.scrollIntoView({block:'start'}));
          await page.screenshot({path:join(evidence,`due-${theme}-${width}.png`)});
        }
        report.push({width,theme,tab,count:sizes.length,geometry:sizes[0]});
      }
    }
  }
  await page.locator('.moodle-course-card').getByRole('button',{name:/^Military Education of National Defense/}).click();
  await page.locator('.moodle-hero h1').waitFor();
  assert.equal(await page.locator('.moodle-hero h1').innerText(),'Military Education of National Defense - Defense Mobilization');
  assert.equal(await page.locator('.moodle-hero .moodle-identity-line').first().innerText(),'WANG HAO-CHENG');
  for (const theme of ['light','dark']) {
    await page.emulateMedia({colorScheme:theme});
    await page.locator('.moodle-page').evaluate(element => {element.scrollTop=0;});
    await page.screenshot({path:join(evidence,`hero-${theme}-760.png`)});
    await page.locator('.moodle-page').evaluate(element => {element.scrollTop=element.scrollHeight;});
    await page.evaluate(async () => {await new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));});
    const clear = await page.evaluate(() => {
      const last = window.document.querySelector('.moodle-week:last-child').getBoundingClientRect();
      const chat = window.document.querySelector('.moodle-chat-button').getBoundingClientRect();
      return last.bottom < chat.top;
    });
    assert.equal(clear,true);
    await page.screenshot({path:join(evidence,`last-row-${theme}-760.png`)});
  }
  assert.deepEqual(errors,[]);
  await writeFile(join(evidence,'geometry.json'),JSON.stringify(report,null,2)+'\n');
  console.log(`PASS ${report.length} Electron captures. All 47 fixture courses have matching cover, title, teacher and footer geometry.`);
} finally {
  await app?.close();
  await rm(directory,{recursive:true,force:true});
}
