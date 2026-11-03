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
    "/tmp/vstudy-library-bench/bench.sqlite",
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
      await page.locator("article[role=row]").count(),
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
