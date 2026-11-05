import { _electron as electron } from "playwright";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
const directory = await mkdtemp(join(tmpdir(), "vstudy-course-agent-"));
const evidence = resolve("../../docs/screenshots/moodle-agent");
const accountId = "00000000-0000-4000-8000-000000000001";
const courseId = "00000000-0000-4000-8000-000000000002";
const deadlineId = "00000000-0000-4000-8000-000000000003";
const fileId = "00000000-0000-4000-8000-000000000004";
const dueAt = new Date(Date.now() + 3 * 86400000).toISOString();
let app;
const launch = () =>
  electron.launch({
    args: [resolve("."), `--user-data-dir=${directory}`],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "",
      VSTUDY_LOCALE: "en",
      VSTUDY_FAKE_PROVIDER: "1",
    },
  });
try {
  await mkdir(evidence, { recursive: true });
  app = await launch();
  let page = await app.firstWindow();
  await page.waitForFunction(() => !!window.desktop?.invoke);
  const document = await page.evaluate(async () => {
    await window.desktop.invoke("providers:configure", {
      kind: "api",
      id: "anthropic-api",
      enabled: true,
    });
    const settings = await window.desktop.invoke("settings:get", {});
    await window.desktop.invoke("settings:set", {
      ...settings,
      welcomeSeen: true,
      onboardingCompleted: true,
      lastProviderId: "anthropic-api",
      lastModelId: "fake",
      language: "en",
    });
    return window.desktop.invoke("documents:importSample", { language: "en" });
  });
  await page.waitForFunction(
    async (id) =>
      (await window.desktop.invoke("documents:get", { documentId: id }))
        ?.status === "ready",
    document.id,
    { timeout: 20000 },
  );
  const path = await app.evaluate(({ app }) => app.getPath("userData"));
  await app.close();
  app = undefined;
  const db = new DatabaseSync(join(path, "vstudy.sqlite"));
  const account = {
    id: accountId,
    siteUrl: "https://ilearning.cycu.edu.tw",
    siteName: "CYCU",
    remoteUserId: 1,
    displayName: "Test student",
    status: "connected",
    syncedAt: new Date().toISOString(),
  };
  const course = {
    id: courseId,
    accountId,
    remoteId: 1,
    fullName: "Physics lab",
    shortName: "PHY",
    imageUrl: null,
    progress: 20,
    startAt: null,
    endAt: null,
    favourite: false,
  };
  const deadline = {
    id: deadlineId,
    courseId,
    title: "Lab report",
    kind: "assignment",
    dueAt,
    url: null,
    submitted: false,
  };
  const file = {
    id: fileId,
    courseId,
    section: "Week 1",
    module: "Resource",
    name: "Lab notes.md",
    mime: "text/markdown",
    size: 100,
    modifiedAt: null,
    documentId: document.id,
  };
  db.prepare("INSERT INTO moodle_accounts VALUES (?,?,?,?)").run(
    accountId,
    account.siteUrl,
    1,
    JSON.stringify(account),
  );
  db.prepare("INSERT INTO moodle_courses VALUES (?,?,?)").run(
    courseId,
    accountId,
    JSON.stringify(course),
  );
  db.prepare("INSERT INTO moodle_deadlines VALUES (?,?,?)").run(
    deadlineId,
    courseId,
    JSON.stringify(deadline),
  );
  db.prepare("INSERT INTO moodle_files VALUES (?,?,?,?,?)").run(
    fileId,
    courseId,
    "https://example.com/lab.md",
    JSON.stringify(file),
    document.id,
  );
  db.close();
  app = await launch();
  page = await app.firstWindow();
  await page.waitForFunction(() => !!window.desktop?.invoke);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1440, 1100),
  );
  await page.evaluate(() =>
    window.localStorage.setItem(
      "vstudy-route",
      JSON.stringify({ view: "courses" }),
    ),
  );
  await page.reload();
  await page.locator(".moodle-course-card").first().click();
  await page.getByRole("button", { name: "Course assistant", exact: true }).click();
  await page.locator(".moodle-agent .aui-composer-input").waitFor();
  await page
    .getByRole("button", {
      name: "Explain what I need to prepare",
      exact: true,
    })
    .click();
  await page.locator(".moodle-proposal").waitFor();
  assert.equal(
    (
      await page.evaluate(
        (id) => window.desktop.invoke("moodle:course", { courseId: id }),
        courseId,
      )
    ).reminders.length,
    0,
  );
  assert.equal(
    await page
      .locator(".moodle-course-chat")
      .innerText()
      .then((s) => s.includes("vstudy-action")),
    false,
  );
  await page.locator(".moodle-proposal").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: join(evidence, "proposal.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Approve action", exact: true })
    .click();
  await page.getByText("Action completed.", { exact: true }).waitFor();
  const detail = await page.evaluate(
    (id) => window.desktop.invoke("moodle:course", { courseId: id }),
    courseId,
  );
  assert.equal(detail.reminders.length, 1);
  assert.equal(detail.reminders[0].createdBy, "agent");
  assert.equal(detail.reminders[0].deadlineId, deadlineId);
  assert.equal(
    detail.reminders[0].remindAt,
    new Date(Date.parse(dueAt) - 3600000).toISOString(),
  );
  await page.screenshot({
    path: join(evidence, "approved.png"),
    fullPage: true,
  });
  const conversations = await page.evaluate(
    (id) =>
      window.desktop.invoke("conversations:list", {
        scope: "course",
        courseId: id,
      }),
    courseId,
  );
  assert.equal(conversations.length, 1);
  const messages = await page.evaluate(
    (id) => window.desktop.invoke("messages:list", { conversationId: id }),
    conversations[0].id,
  );
  assert.equal(
    messages.at(-1).parts[0].text,
    "Review your course materials before the next deadline.",
  );
  assert.equal(messages.at(-1).parts[0].proposals[0].type, "create-reminder");
  await page.evaluate(
    (id) =>
      window.desktop.invoke("conversations:create", {
        documentId: id,
        providerId: "anthropic-api",
        modelId: "fake",
      }),
    document.id,
  );
  await page.getByRole("tab", { name: "Files", exact: true }).click();
  await page.locator(".moodle-file-row").first().click();
  await page.locator(".aui-composer-input").waitFor();
  await page.getByTestId("document-markdown").waitFor();
  await page.locator(".chat-pane .composer-note").waitFor();
  await page.locator(".aui-composer-input").fill("Explain this document.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page
    .locator("[data-role=assistant]")
    .filter({ hasText: "bold" })
    .waitFor();
  const docs = await page.evaluate(
    (id) => window.desktop.invoke("conversations:list", { documentId: id }),
    document.id,
  );
  assert.equal(docs.length, 1);
  assert.equal(docs[0].documentId, document.id);
  await page.waitForFunction(
    () => !window.document.querySelector(".aui-composer-cancel"),
  );
  await page.screenshot({
    path: join(evidence, "file-document-chat.png"),
    fullPage: true,
  });
  await writeFile(
    join(evidence, "verification.txt"),
    "PASS. Real Electron with fake provider. Course action stripped, proposed, approved, saved with agent provenance. Course conversation and proposals persisted. Moodle-linked file opened and chatted as a document.\n",
  );
  console.log("PASS course action approval and Moodle document chat");
} catch (error) {
  if (app) {
    const page = await app.firstWindow();
    console.log(await page.locator("body").innerText());
    await page.screenshot({ path: join(evidence, "failure.png") });
  }
  throw error;
} finally {
  await app?.close();
  await rm(directory, { recursive: true, force: true });
}
