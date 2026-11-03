import { performance } from "node:perf_hooks";
import { _electron as electron } from "playwright";
import { mkdtemp, copyFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
const directory = await mkdtemp(join(tmpdir(), "vstudy-library-perf-"));
let app;
try {
  await copyFile(
    process.env.VSTUDY_BENCH_DB ?? "/tmp/vstudy-library-bench/bench.sqlite",
    join(directory, "vstudy.sqlite"),
  );
  app = await electron.launch({
    args: [resolve("."), `--user-data-dir=${directory}`],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "",
      VSTUDY_FAKE_PROVIDER: "1",
      VSTUDY_LOCALE: "en",
    },
  });
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false),
  );
  await page.evaluate(async () => {
    window.localStorage.setItem(
      "vstudy-route",
      JSON.stringify({ view: "library" }),
    );
    const s = await window.desktop.invoke("settings:get", {});
    await window.desktop.invoke("settings:set", {
      ...s,
      onboardingCompleted: true,
    });
  });
  await page.reload();
  await page.locator(".library-results").waitFor();
  const start = performance.now();
  const frames = [];
  let maxRendered = 0;
  for (let n = 1; n <= 100; n++) {
    await page.waitForFunction(
      (n) =>
        Number(
          window.document
            .querySelector(".library-live")
            ?.textContent?.match(/[\d,]+/)?.[0]
            .replaceAll(",", ""),
        ) >=
        n * 50,
      n,
    );
    maxRendered = Math.max(
      maxRendered,
      await page.locator(".library-document[role=listitem]").count(),
    );
    const frame = await page.evaluate(async () => {
      const scroller = window.document.querySelector(".library-results");
      const t = window.performance.now();
      scroller.scrollTop = scroller.scrollHeight;
      await new Promise((resolve) =>
        window.requestAnimationFrame(() =>
          window.requestAnimationFrame(resolve),
        ),
      );
      return window.performance.now() - t;
    });
    frames.push(frame);
  }
  frames.sort((a, b) => a - b);
  const scrollingFrames = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const scroller = window.document.querySelector(".library-results");
        const frames = [];
        let previous = 0,
          n = 0;
        const tick = (time) => {
          if (previous) frames.push(time - previous);
          previous = time;
          scroller.scrollTop =
            ((scroller.scrollHeight - scroller.clientHeight) * (n % 60)) / 60;
          if (++n < 180) window.requestAnimationFrame(tick);
          else resolve(frames.sort((a, b) => a - b));
        };
        window.requestAnimationFrame(tick);
      }),
  );
  const evidence = {
    frameP50: scrollingFrames[89],
    frameP95: scrollingFrames[170],
    frameMax: scrollingFrames.at(-1),
    documents: 5000,
    pages: 100,
    maxRendered,
    scrollDurationMs: performance.now() - start,
    twoFrameP50: frames[50],
    twoFrameP95: frames[95],
    twoFrameMax: frames[99],
  };
  assert.ok(
    evidence.frameP95 < 34,
    "scroll frames stay within two 60Hz refreshes",
  );
  assert.ok(maxRendered < 30, `only visible rows mounted: ${maxRendered}`);
  assert.ok(
    evidence.twoFrameP95 < 100,
    `frame responsiveness: ${evidence.twoFrameP95}`,
  );
  await page.evaluate(()=>{window.localStorage.setItem('library-grid','true');});await page.reload();await page.locator('.library-results').waitFor();
  await page.locator('.library-results').press('Meta+a');
  await page.waitForFunction(()=>window.document.querySelector('.library-live')?.textContent?.replaceAll(',','').includes('5000'));
  const gridFrames=await page.evaluate(async()=>{
    const scroller=window.document.querySelector('.library-results'),frames=[];let previous=performance.now();
    for(let i=0;i<180;i++){await new Promise(window.requestAnimationFrame);const now=performance.now();frames.push(now-previous);previous=now;scroller.scrollTop+=40;}
    return frames.sort((a,b)=>a-b);
  });
  const gridMounted=await page.locator('.library-document').count();
  Object.assign(evidence,{gridFrameP50:gridFrames[90],gridFrameP95:gridFrames[170],gridFrameMax:gridFrames.at(-1),gridMounted});
  assert.ok(gridMounted<60,`grid mounts bounded visible cards: ${gridMounted}`);
  const metadata=[];
  for(let n=0;n<10;n++) {
    metadata.push(await page.evaluate(()=>new Promise(resolve=>{
      const timeout=window.setTimeout(()=>{observer.disconnect();resolve(-1);},3000);
      const start=performance.now(),observer=new MutationObserver(()=>{
        if(window.document.querySelector('.reading-pane .eyebrow')?.textContent==='study.md') {
          window.clearTimeout(timeout);observer.disconnect();window.requestAnimationFrame(()=>resolve(performance.now()-start));
        }
      });observer.observe(window.document.getElementById('shell-content'),{subtree:true,childList:true,characterData:true});
      window.document.querySelector('.library-document').dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    })));
    console.log('metadataPaintMs',metadata.at(-1));
    if(metadata.at(-1)<0) break;
    await page.locator('.app-header').getByRole('button',{name:'Library',exact:true}).click();await page.locator('.library-document').first().waitFor();
  }
  const validMetadata=metadata.filter(value=>value>=0).sort((a,b)=>a-b);Object.assign(evidence,{metadataPaintSamples:validMetadata.length,metadataPaintTimeouts:metadata.length-validMetadata.length,metadataPaintP50:validMetadata[Math.floor(validMetadata.length/2)],metadataPaintMax:validMetadata.at(-1)});
  await mkdir("/tmp/vstudy-library", { recursive: true });
  await writeFile(
    "/tmp/vstudy-library/performance.json",
    JSON.stringify(evidence, null, 2),
  );
  console.log(evidence);
} finally {
  await app?.close();
  await rm(directory, { recursive: true, force: true });
}
