import { _electron as electron } from "playwright";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const directory = await mkdtemp(join(tmpdir(), "vstudy-smoke-"));
let app;
try {
  app = await electron.launch({
    ...(process.env.VSTUDY_EXECUTABLE
      ? { executablePath: process.env.VSTUDY_EXECUTABLE }
      : {}),
    args: [".", `--user-data-dir=${directory}`],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "" },
  });
  const page = await app.firstWindow();
  await page
    .getByTestId("bridge-status")
    .filter({ hasText: "Workspace connected" })
    .waitFor();
  const settings = await page.evaluate(() =>
    window.desktop.invoke("settings:get", {}),
  );
  if (settings.chatSide !== "left")
    throw new Error("Settings IPC round trip failed");
  const security = await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    const preferences = window.webContents.getLastWebPreferences();
    return {
      visible: window.isVisible(),
      contextIsolation: preferences.contextIsolation,
      sandbox: preferences.sandbox,
      nodeIntegration: preferences.nodeIntegration,
    };
  });
  if (
    !security.visible ||
    !security.contextIsolation ||
    !security.sandbox ||
    security.nodeIntegration
  )
    throw new Error(`Window security failed: ${JSON.stringify(security)}`);
  await page.evaluate(() =>
    window.desktop.invoke("settings:set", {
      chatSide: "right",
      lastProviderId: null,
      lastModelId: null,
    }),
  );
  await page.reload();
  await page
    .getByTestId("bridge-status")
    .filter({ hasText: "Workspace connected" })
    .waitFor();
  const persisted = await page.evaluate(() =>
    window.desktop.invoke("settings:get", {}),
  );
  if (persisted.chatSide !== "right")
    throw new Error("Settings did not persist");
  const exposed = await page.evaluate(() => ({
    methods: Object.keys(window.desktop).sort(),
    node: typeof window.require,
  }));
  if (
    exposed.node !== "undefined" ||
    exposed.methods.join(",") !== "getPathForFile,invoke,onChatEvent"
  )
    throw new Error("Unexpected bridge surface");
  console.log(
    JSON.stringify({
      result: "PASS",
      title: await page.title(),
      security,
      settings,
      persisted,
      exposed,
    }),
  );
} finally {
  await app?.close();
  await rm(directory, { recursive: true, force: true });
}
