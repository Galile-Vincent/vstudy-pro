import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { seedArtCourses } from './fixtures/art-courses.mjs';

const evidence = resolve('../../docs/evidence/navigation/swipe');
const scratch = '/private/tmp/claude-501/-Users-vincent-vstudy-pro/c4e4dad1-3aa9-4721-a360-58e4c6702853/scratchpad';
await mkdir(scratch, { recursive: true }); await mkdir(evidence, { recursive: true });
const backKey = process.platform === 'darwin' ? 'Meta+BracketLeft' : 'Alt+ArrowLeft';
const forwardKey = process.platform === 'darwin' ? 'Meta+BracketRight' : 'Alt+ArrowRight';
const profile = await mkdtemp(join(scratch, 'swipe-profile-'));
const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== 'ELECTRON_RENDERER_URL'));
const results = { checks: [], errors: [], frames: [] };
let app;
try {
  app = await electron.launch({ args: [resolve('.'), `--user-data-dir=${profile}`], env: { ...environment, ELECTRON_RUN_AS_NODE: '', VSTUDY_FAKE_PROVIDER: '1', VSTUDY_LOCALE: 'en' } });
  const page = await app.firstWindow();
  page.on('pageerror', error => results.errors.push(error.message));
  assert.equal(await app.evaluate(({ app }) => app.getPath('userData')), profile);
  results.versions = await app.evaluate(() => process.versions);
  await page.addInitScript(() => {
    window.__swipeCosts = []; window.__swipeLayoutReads = 0; window.__swipeCallbacks = []; window.__swipeActiveCosts = [];
    let inWheel = false;
    const original = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (name, callback, options) {
      if (name === 'wheel' && this === window && typeof callback === 'function' && options?.capture && options?.passive) {
        window.__swipeCallbacks.push(callback.name);
        const wrapped = event => {
          const tracking = document.querySelector('.history-swipe-viewport')?.dataset.tracking === 'true';
          inWheel = true; const started = performance.now();
          try { return callback.call(this, event); }
          finally { const duration = performance.now() - started; window.__swipeCosts.push(duration); if (tracking) window.__swipeActiveCosts.push(duration); inWheel = false; }
        };
        return original.call(this, name, wrapped, options);
      }
      return original.call(this, name, callback, options);
    };
    const rect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (...args) { if (inWheel) window.__swipeLayoutReads++; return rect.apply(this, args); };
    const style = window.getComputedStyle;
    window.getComputedStyle = function (...args) { if (inWheel) window.__swipeLayoutReads++; return style.apply(this, args); };
  });
  await page.evaluate(async () => {
    const settings = await window.desktop.invoke('settings:get', {});
    await window.desktop.invoke('settings:set', { ...settings, language: 'en', colorScheme: 'light', onboardingCompleted: true, welcomeSeen: true });
    await window.desktop.invoke('analytics:setConsent', { enabled: false });
    localStorage.setItem('vstudy-route', JSON.stringify({ view: 'home', connectSchool: true, aiParse: true }));
    localStorage.setItem('vstudy-onboarding-v1', JSON.stringify({ version: 1, step: 'start', goal: 'documents', status: 'completed', done: ['setup'], dismissed: ['courses', 'home', 'library'] }));
  });
  await seedArtCourses(app);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.reload(); await page.locator('.app-shell[data-view=home]').waitFor();
  await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.setContentSize(1280, 800); win.focus(); });
  await app.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0].webContents;
    const listeners = contents.listeners('input-event');
    contents.removeAllListeners('input-event');
    contents.on('input-event', (event, input) => {
      if (['gestureScrollBegin', 'gestureScrollEnd', 'gestureFlingStart'].includes(input.type) && !event.swipeTestBoundary) return;
      for (const listener of listeners) listener(event, input);
    });
  });
  const check = name => { results.checks.push(name); console.log(`PASS ${name}`); };
  const view = () => page.locator('.app-shell').getAttribute('data-view');
  const waitView = name => page.locator(`.app-shell[data-view=${name}]`).waitFor();
  const sidebar = name => page.locator('.shell-sidebar').getByRole('button', { name, exact: true });
  const navigate = async (name, expected) => { await sidebar(name).click(); await waitView(expected); await page.waitForTimeout(340); };
  const boundary = phase => app.evaluate(({ BrowserWindow }, phase) => BrowserWindow.getAllWindows()[0].webContents.emit('input-event', { swipeTestBoundary: true }, { type: phase }), phase);
  const settle = async () => { await boundary('gestureScrollEnd'); await page.waitForTimeout(350); };
  const swipe = async (deltas, target = page.locator('#shell-content')) => {
    const box = await target.boundingBox(); assert.ok(box);
    await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 160));
    await boundary('gestureScrollBegin');
    for (const delta of deltas) { await page.mouse.wheel(delta, 0); await page.waitForTimeout(20); }
    await settle();
  };
  await swipe([-50, -45, -40]); assert.equal(await view(), 'home');
  assert.equal(await page.locator('.history-swipe-viewport').getAttribute('data-tracking'), 'false'); check('first history entry has no indicator or navigation');
  await navigate('Library', 'library'); await navigate('Courses', 'courses'); await navigate('History', 'history');
  await swipe([-45, -55, -40]); assert.equal(await view(), 'courses'); check('right swipe goes Back through real visits');
  await swipe([45, 55, 40]); assert.equal(await view(), 'history'); check('left swipe goes Forward');
  await swipe([-20, -25, -20]); assert.equal(await view(), 'history'); check('short swipe cancels');
  await swipe([50, 45, 40]); assert.equal(await view(), 'history'); check('last history entry cannot go Forward');
  await swipe([-45, -55, -40]); await waitView('courses');
  const due = page.locator('.moodle-due-list'); await due.waitFor();
  const nativeDueScroller = await due.evaluate(node => node.scrollWidth > node.clientWidth && ['auto', 'scroll'].includes(getComputedStyle(node).overflowX));
  results.dueSoonLayout = nativeDueScroller ? 'native horizontal scroller' : 'current Courses redesign is a vertical list; test gives the existing Due soon list horizontal overflow';
  if (!nativeDueScroller) await due.evaluate(node => {
    node.dataset.swipeFixture = 'true';
    node.style.cssText += ';display:flex;overflow-x:auto;width:100%;gap:16px;';
    for (const child of node.children) child.style.cssText += ';min-width:240px;flex-shrink:0;';
  });
  await due.evaluate(node => { node.scrollLeft = 80; });
  const beforeScroll = await due.evaluate(node => node.scrollLeft);
  await swipe([40, 50, 45], due);
  assert.equal(await view(), 'courses'); assert.ok(await due.evaluate(node => node.scrollLeft) > beforeScroll); check('Due soon horizontal overflow scrolls without navigating');
  if (!nativeDueScroller) await due.evaluate(node => { node.removeAttribute('style'); for (const child of node.children) child.removeAttribute('style'); });
  await page.evaluate(() => window.dispatchEvent(new Event('vstudy:open-settings')));
  await page.locator('.settings-dialog').waitFor(); await swipe([-50, -50, -50], page.locator('.settings-dialog'));
  assert.equal(await view(), 'courses'); check('real Settings dialog blocks navigation');
  await page.keyboard.press('Escape'); await page.locator('.settings-dialog').waitFor({ state: 'detached' });
  const textbox = await page.evaluate(() => { const node = document.createElement('textarea'); node.id = 'swipe-editable-fixture'; node.style.cssText = 'position:fixed;left:500px;top:200px;width:200px;height:100px;z-index:90'; document.body.append(node); node.focus(); return node.id; });
  await swipe([-50, -50, -50], page.locator(`#${textbox}`)); assert.equal(await view(), 'courses');
  await page.keyboard.press(backKey); assert.equal(await view(), 'courses');
  await page.locator(`#${textbox}`).evaluate(node => node.remove()); check('focused composer or text field blocks swipes begun inside it and history keys');
  await page.locator('#shell-content').focus(); await page.keyboard.press(backKey); await waitView('library'); await page.waitForTimeout(350);
  await page.keyboard.press(forwardKey); await waitView('courses'); await page.waitForTimeout(350); check('platform history shortcuts navigate');
  await page.keyboard.press('Alt+ArrowLeft'); await waitView('library'); await page.waitForTimeout(350);
  await page.keyboard.press('Alt+ArrowRight'); await waitView('courses'); await page.waitForTimeout(350); check('Alt+Left and Alt+Right route through the same actions');
  await page.locator('#shell-content').dispatchEvent('mouseup', { button: 3 }); await waitView('library'); await page.waitForTimeout(350);
  await page.locator('#shell-content').dispatchEvent('mouseup', { button: 4 }); await waitView('courses'); await page.waitForTimeout(350); check('mouse buttons 3 and 4 navigate');
  await app.evaluate(({ app, BrowserWindow }) => { app.focus({ steal: true }); const win = BrowserWindow.getAllWindows()[0]; win.focus(); win.webContents.focus(); });
  await page.waitForFunction(() => document.hasFocus());
  await page.locator('#shell-content').focus();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].emit('app-command', {}, 'browser-backward')); await waitView('library'); await page.waitForTimeout(350);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].emit('app-command', {}, 'browser-forward')); await waitView('courses'); await page.waitForTimeout(350); check('native app-command routes Back and Forward through guarded keyboard input');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].emit('swipe', {}, 'right')); await page.waitForTimeout(350); assert.equal(await view(), 'courses'); check('three-finger system swipe is ignored');
  await swipe([-65, -70]); await waitView('library');
  for (const delta of [-60, -55, -50]) await page.mouse.wheel(delta, 0);
  await page.waitForTimeout(350); assert.equal(await view(), 'library'); check('post-release momentum never navigates a second time');
  await page.keyboard.press(forwardKey); await waitView('courses'); await page.waitForTimeout(350);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  results.reducedMotion = await page.evaluate(mac => {
    const original = document.startViewTransition.bind(document); window.__transitionCalls = 0;
    document.startViewTransition = (...args) => { window.__transitionCalls++; return original(...args); };
    document.getElementById('shell-content').focus();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: mac ? '[' : 'ArrowLeft', code: mac ? 'BracketLeft' : 'ArrowLeft', metaKey: mac, altKey: !mac, bubbles: true }));
    return { view: document.querySelector('.app-shell').dataset.view, calls: window.__transitionCalls, direction: document.documentElement.dataset.historyDirection ?? null };
  }, process.platform === 'darwin');
  assert.deepEqual(results.reducedMotion, { view: 'library', calls: 0, direction: null }); check('reduced motion applies route synchronously without calling View Transitions');
  await page.waitForTimeout(350); await page.emulateMedia({ reducedMotion: 'no-preference' });
  await navigate('Courses', 'courses');
  await page.evaluate(() => {
    const start = document.startViewTransition.bind(document);
    document.startViewTransition = (...args) => {
      const transition = start(...args);
      void transition.ready.then(() => {
        window.__historyAnimations = document.getAnimations().filter(animation => ['history-page-in', 'history-page-out'].includes(animation.animationName)).map(animation => ({ name: animation.animationName, duration: animation.effect.getTiming().duration, keyframes: animation.effect.getKeyframes() }));
      });
      return transition;
    };
    window.desktop.onTrackpadScrollBegin(() => { window.__swipeIsDragging = true; });
    window.desktop.onTrackpadScrollEnd(() => { window.__swipeIsDragging = false; });
  });
  const cdp = await page.context().newCDPSession(page);
  let capturing = false;
  const framePackets = [];
  cdp.on('Page.screencastFrame', event => {
    void cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId });
    if (!capturing) return;
    framePackets.push({ data: event.data, timestamp: event.metadata.timestamp });
  });
  const box = await page.locator('#shell-content').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 180);
  await boundary('gestureScrollBegin');
  for (const [index, delta] of [-18, -25, -30, -24, -28, -17].entries()) {
    await page.mouse.wheel(delta, 0); await page.waitForTimeout(45);
    if (index === 0 || index === 2) await page.screenshot({ path: join(evidence, index === 0 ? 'indicator-early.png' : 'indicator-mid.png') });
  }
  await page.screenshot({ path: join(evidence, 'indicator-armed.png') });
  assert.equal(await page.locator('.history-swipe-viewport').getAttribute('data-armed'), 'true');
  capturing = true; await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
  await boundary('gestureScrollEnd'); await waitView('library'); await page.waitForTimeout(450);
  capturing = false; await cdp.send('Page.stopScreencast');
  for (const file of await readdir(evidence)) if (/^back-\d+\.png$/.test(file)) await rm(join(evidence, file));
  const count = Math.min(12, framePackets.length);
  for (let index = 0; index < count; index++) {
    const sourceIndex = Math.round(index * (framePackets.length - 1) / (count - 1));
    const packet = framePackets[sourceIndex], filename = `back-${String(index).padStart(2, '0')}.png`;
    results.frames.push({ filename, timestamp: packet.timestamp, sourceIndex });
    await writeFile(join(evidence, filename), Buffer.from(packet.data, 'base64'));
  }
  results.motion = await page.evaluate(() => window.__historyAnimations);
  assert.deepEqual(results.motion.map(animation => animation.name).sort(), ['history-page-in', 'history-page-out']);
  assert.ok(results.motion.every(animation => animation.duration === 240));
  assert.ok(results.frames.length >= 10, `captured ${results.frames.length} frames`); check('live indicator and directional transition captured as at least 10 frames');
  await page.screenshot({ path: join(evidence, 'settled-library.png') });
  results.performanceRuns = [];
  for (let run = 0; run < 5; run++) {
    await page.evaluate(() => {
      window.__frameTimes = []; window.__measureFrames = true;
      const frame = time => { window.__frameTimes.push({ time, dragging: window.__swipeIsDragging }); if (window.__measureFrames) window.__frameRequest = requestAnimationFrame(frame); };
      window.__frameRequest = requestAnimationFrame(frame); window.__costStart = window.__swipeCosts.length;
    });
    await swipe([25, 30, 35, 40]); assert.equal(await view(), 'courses');
    await swipe([-25, -30, -35, -40]); assert.equal(await view(), 'library');
    results.performanceRuns.push(await page.evaluate(() => {
      window.__measureFrames = false; cancelAnimationFrame(window.__frameRequest);
      const frameSamples = window.__frameTimes.slice(1).map((frame, i) => ({ gap: frame.time - window.__frameTimes[i].time, dragging: frame.dragging && window.__frameTimes[i].dragging }));
      const frames = frameSamples.map(frame => frame.gap);
      const dragFrames = frameSamples.filter(frame => frame.dragging).map(frame => frame.gap);
      const costs = window.__swipeCosts.slice(window.__costStart).sort((a, b) => a - b);
      return { events: costs.length, p95HandlerMs: costs[Math.floor(costs.length * .95)], maxFrameGapMs: Math.max(...frames), maxDragFrameGapMs: Math.max(...dragFrames), frameCount: frames.length, framesOver25Ms: frames.filter(time => time > 25).length };
    }));
  }
  check('five untraced swipe round trips preserve routes and record handler and frame timing');
  const parentEvents = await page.evaluate(() => window.__swipeCosts.length);
  results.guest = await app.evaluate(async ({ BrowserWindow, WebContentsView }) => {
    const win = BrowserWindow.getAllWindows()[0];
    const guest = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    win.contentView.addChildView(guest); guest.setBounds({ x: 400, y: 100, width: 500, height: 400 });
    try {
      await guest.webContents.loadURL('data:text/html,<body style="width:2000px">Isolated Moodle pane input test</body>');
      await guest.webContents.executeJavaScript('window.wheelCount=0;window.addEventListener("wheel",()=>window.wheelCount++)');
      guest.webContents.focus();
      guest.webContents.emit('input-event', {}, { type: 'gestureScrollBegin' });
      for (const deltaX of [-45, -55, -40]) guest.webContents.sendInputEvent({ type: 'mouseWheel', x: 100, y: 100, deltaX, deltaY: 0 });
      guest.webContents.emit('input-event', {}, { type: 'gestureScrollEnd' });
      await new Promise(resolve => setTimeout(resolve, 200));
      return { wheels: await guest.webContents.executeJavaScript('window.wheelCount'), parentFocused: win.webContents.isFocused() };
    } finally { win.contentView.removeChildView(guest); guest.webContents.close(); win.webContents.focus(); }
  });
  assert.ok(results.guest.wheels > 0); assert.equal(await page.evaluate(() => window.__swipeCosts.length), parentEvents); assert.equal(await view(), 'library');
  check('real WebContentsView receives wheel input without parent wheel delivery or route navigation');
  await page.evaluate(async () => { await window.desktop.invoke('documents:importSample', { language: 'en' }); window.dispatchEvent(new Event('library-updated')); });
  await navigate('Home', 'home'); await navigate('Library', 'library');
  await page.locator('.library-document').first().focus(); await page.keyboard.press('Enter'); await waitView('workspace');
  const documentRoute = await page.evaluate(() => JSON.parse(localStorage.getItem('vstudy-route')));
  await navigate('Courses', 'courses'); await swipe([-45, -55, -40]); await waitView('workspace');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('vstudy-route')).documentId), documentRoute.documentId);
  await swipe([45, 55, 40]); await waitView('courses'); check('document visits restore the document ID and preserve the forward visit');

  results.handler = await page.evaluate(() => {
    const samples = window.__swipeCosts, sorted = [...samples].sort((a, b) => a - b);
    return { registrations: window.__swipeCallbacks, count: samples.length, meanMs: samples.reduce((a, b) => a + b, 0) / samples.length, p95Ms: sorted[Math.floor(sorted.length * .95)], maxMs: Math.max(...samples), layoutReads: window.__swipeLayoutReads, activeCount: window.__swipeActiveCosts.length, activeP95Ms: [...window.__swipeActiveCosts].sort((a,b)=>a-b)[Math.floor(window.__swipeActiveCosts.length*.95)], samples };
  });
  assert.ok(results.handler.count > 40); assert.equal(results.handler.layoutReads, 0); assert.ok(results.handler.p95Ms < 4); check('real wheel listener p95 below 4ms with no geometry or computed-style reads');
  assert.deepEqual(results.errors, []); check('renderer has no page errors');
} catch (error) {
  results.failure = error.stack; console.error(error);
  process.exitCode = 1;
} finally {
  await writeFile(join(evidence, 'results.json'), JSON.stringify(results, null, 2));
  await app?.close(); await rm(profile, { recursive: true, force: true });
}
