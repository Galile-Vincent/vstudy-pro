import { _electron as electron } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const directory = await mkdtemp(join(tmpdir(), "vstudy-library-e2e-"));
const evidence = "/tmp/vstudy-library";
await mkdir(evidence, { recursive: true });
const screenshots = [];
let app;
const round = process.env.LIBRARY_ROUND ?? "1";
try {
  app = await electron.launch({
    args: [resolve("."), `--user-data-dir=${directory}`],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "",
      VSTUDY_LOCALE: "en",
      VSTUDY_FAKE_PROVIDER: "1",
    },
  });
  const page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.evaluate(async () => {
    const s = await window.desktop.invoke("settings:get", {});
    await window.desktop.invoke("settings:set", {
      ...s,
      onboardingCompleted: true,
    });
  });
  await page.reload();
  await page
    .locator(".shell-sidebar nav")
    .first()
    .getByRole("button", { name: "Library", exact: true })
    .click();
  await page.getByRole("heading", { name: "Library", exact: true }).waitFor();
  await page
    .getByRole("heading", { name: "Your reading starts here" })
    .waitFor();
  const shot = async (state) => {
    const path = `${evidence}/round${round}-${state}.png`;
    await page.screenshot({ path, animations: "disabled" });
    screenshots.push(path);
  };
  await shot("empty");
  const call = async (channel, request) => {
    if (channel === 'documents:importPaths') {
      const rows=[];
      for (const path of request.paths) {
        await app.evaluate(({dialog}, path) => {dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},path);
        const document=await page.evaluate(request=>window.desktop.invoke('documents:import',request),{folderId:request.folderId??null});
        rows.push({ok:!!document,document});
      }
      return rows;
    }
    return page.evaluate(({channel,request})=>window.desktop.invoke(channel,request),{channel,request});
  };
  for (const language of ["en", "ja"]) {
    await page.evaluate(async (language) => {
      const settings = await window.desktop.invoke("settings:get", {});
      await window.desktop.invoke("settings:set", { ...settings, language });
    }, language);
    await page.reload();
    await page.locator(".library-empty").waitFor();
    for (const width of [720, 900, 1200])
      for (const colorScheme of ["light", "dark"]) {
        await app.evaluate(
          ({ BrowserWindow }, width) =>
            BrowserWindow.getAllWindows()[0].setSize(width, 800),
          width,
        );
        await page.emulateMedia({ colorScheme });
        await shot(`${language}-${width}-${colorScheme}-empty-library`);
      }
  }
  await page.evaluate(async () => {
    const s = await window.desktop.invoke("settings:get", {});
    await window.desktop.invoke("settings:set", { ...s, language: "en" });
  });
  await page.reload();
  await page.locator(".library-empty").waitFor();
  await page.getByRole("button", { name: "New folder", exact: true }).click();
  await page.getByRole("dialog").getByRole("textbox").fill("Study");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  const folder = (await call("library:tree", {})).find(
    (f) => f.name === "Study",
  );
  await page
    .getByRole("button", { name: "Folder options: Study", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "New subfolder", exact: true })
    .click();
  await page.getByRole("dialog").last().getByRole("textbox").fill("Languages");
  await page
    .getByRole("dialog")
    .last()
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  const nested = (await call("library:tree", {})).find(
    (f) => f.name === "Languages",
  );
  await call("library:folders:update", { folderId: folder.id, pinned: true });
  const ids = [];
  for (const [index, content] of [
    "Science and understanding. 資料の通信と学習。",
    "A second lesson about 資料 and 通信。",
    "Another idea for study.",
  ].entries()) {
    const path = join(directory, `Lesson ${index}.md`);
    await writeFile(path, `# Lesson ${index}\n\n${content}`);
    const result = await call("documents:importPaths", {
      paths: [path],
      folderId: null,
    });
    assert.equal(result[0].ok, true);
    ids.push(result[0].document.id);
  }
  await page.evaluate(() =>
    window.dispatchEvent(new window.Event("library-changed")),
  );
  await page.getByRole("button", { name: "Lesson 0", exact: true }).waitFor();
  for (const text of ["Science", "資料", "通信"]) {
    await page
      .getByRole("textbox", { name: "Search your documents" })
      .fill(text);
    await page.waitForFunction(
      () =>
        window.document
          .querySelector(".library-live")
          ?.textContent?.startsWith("0") === false,
    );
    await page.locator(".search-snippet mark").first().waitFor();
    assert.ok(await page.locator(".library-document[role=listitem]").count());
  }
  await page.getByRole("textbox", { name: "Search your documents" }).fill("");
  await page.getByRole("button", { name: "Lesson 2", exact: true }).waitFor();
  await page.locator(".library-document[role=listitem]").first().click();
  await page.keyboard.press("Meta+a");
  assert.equal(
    await page.locator(".library-document[role=listitem][data-selected=true]").count(),
    3,
  );
  await shot("selection");
  await page
    .locator(".bulk-bar")
    .getByRole("button", { name: "Move to…" })
    .press("Enter");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Languages", exact: true })
    .press("Enter");
  let docs = await call("library:documents:list", {
    folderId: nested.id,
    sort: "manual",
    direction: "asc",
    limit: 50,
  });
  assert.equal(docs.items.length, 3);
  await page
    .getByRole("treeitem", { name: "Study", exact: true })
    .getByRole("button")
    .first()
    .click();
  await page
    .getByRole("treeitem", { name: "Languages", exact: true })
    .getByRole("button")
    .nth(1)
    .click();
  await page.locator(".library-document[role=listitem]").first().waitFor();
  const before = (
    await call("library:documents:list", {
      folderId: nested.id,
      sort: "manual",
      direction: "asc",
      limit: 50,
    })
  ).items.map((i) => i.document.id);
  await page.locator(".library-document[role=listitem]").first().press("Meta+Alt+ArrowDown");
  await page.waitForFunction(
    async ({ folderId, first }) =>
      (
        await window.desktop.invoke("library:documents:list", {
          folderId,
          sort: "manual",
          direction: "asc",
          limit: 50,
        })
      ).items[0].document.id !== first,
    { folderId: nested.id, first: before[0] },
  );
  await page
    .getByRole("button", { name: "Lesson 0", exact: true })
    .locator("..")
    .locator("..")
    .locator("..")
    .dragTo(page.getByRole("treeitem", { name: "Study", exact: true }));
  await page.waitForFunction(
    async ({ id, folderId }) =>
      (
        await window.desktop.invoke("library:documents:list", {
          folderId,
          sort: "manual",
          direction: "asc",
          limit: 50,
        })
      ).items.some((i) => i.document.id === id),
    { id: ids[0], folderId: folder.id },
  );
  // A drag-over snapshot records the destination treatment.

  const dt = await page.evaluateHandle((id) => {
    const transfer = new window.DataTransfer();
    transfer.setData("application/vstudy-documents", JSON.stringify([id]));
    return transfer;
  }, ids[0]);
  const parent = page.getByRole("treeitem", { name: "Study", exact: true });
  await parent.dispatchEvent("dragover", { dataTransfer: dt });
  await shot("drag-folder");
  await parent.dispatchEvent("drop", { dataTransfer: dt });
  await page
    .getByRole("treeitem", { name: "Study", exact: true })
    .getByRole("button")
    .nth(1)
    .click();
  await page.getByRole("button", { name: "Lesson 0", exact: true }).waitFor();
  const row = page.locator(".library-document[role=listitem]").first();
  await row.click({ button: "right" });
  await page.getByRole("menu").waitFor().catch(async e => { await page.screenshot({path:"/tmp/vstudy-design1/menu-failure.png"}); console.log(await page.locator("body").innerText()); throw e; });
  await shot("context-menu");
  await page
    .getByRole("menu")
    .getByRole("menuitem", { name: "Pin", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await row.focus();
  await page.keyboard.press("Space");
  await page
    .locator(".bulk-bar")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await page.locator('.library-view').getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "Lesson 0", exact: true }).waitFor();
  await app.evaluate(
    ({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    },
    join(directory, "export.md"),
  );
  await call("library:exportMarkdown", { documentId: ids[0] });
  assert.match(
    await readFile(join(directory, "export.md"), "utf8"),
    /Lesson 0/,
  );
  await page.evaluate(
    ({ folderId }) => {
      window.localStorage.setItem(
        "vstudy-route",
        JSON.stringify({
          view: "library",
          query: { folderId, subfolders: true },
          title: "Study",
        }),
      );
    },
    { folderId: folder.id },
  );
  await page.reload();
  // Matrix includes both forms, active filters, context menu, selection and folder drop.
  for (const lang of ["en", "ja"]) {
    const catalog = JSON.parse(
      await readFile(`src/shared/locales/${lang}/library.json`, "utf8"),
    );
    await page.evaluate(async (lang) => {
      const settings = await window.desktop.invoke("settings:get", {});
      await window.desktop.invoke("settings:set", {
        ...settings,
        language: lang,
      });
    }, lang);
    await page.reload();
    await page.getByRole("heading", { name: "Study", exact: true }).waitFor();
    for (const width of [720, 900, 1200])
      for (const colorScheme of ["light", "dark"]) {
        await app.evaluate(
          ({ BrowserWindow }, width) =>
            BrowserWindow.getAllWindows()[0].setSize(width, 800),
          width,
        );
        await page.emulateMedia({ colorScheme });
        await shot(`${lang}-${width}-${colorScheme}-populated`);
        await page.getByTestId("library-filters").click();
        await page.locator('.filter-panel').getByRole('combobox',{name:catalog.status,exact:true}).click();
        await page.getByRole('option',{name:catalog.ready,exact:true}).click();
        await page.getByTestId("library-filters").click();
        if (lang === 'en' && width === 720 && colorScheme === 'light') {
          await page.getByRole('button',{name:catalog.saveFilter,exact:true}).click();
          await page.getByRole('dialog').getByRole('textbox').fill('Ready study');
          await page.getByRole('dialog').getByRole('button',{name:catalog.save,exact:true}).click();
          await page.getByRole('button',{name:'Ready study',exact:true}).waitFor();
          const saved=await call('library:savedFilters:list',{});
          assert.equal(JSON.parse(saved.find(f=>f.name==='Ready study').queryJson).status,'ready');
        }
        await shot(`${lang}-${width}-${colorScheme}-filters`);
        const axe = await new AxeBuilder({ page })
          .setLegacyMode()
          .include(".app-shell")
          .analyze();
        assert.deepEqual(
          axe.violations
            .filter((v) => ["serious", "critical"].includes(v.impact))
            .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
          [],
        );
        await page
          .getByRole("button", { name: catalog.clearFilters, exact: true })
          .click();
        await page
          .getByRole("button", { name: catalog.viewToggle, exact: true })
          .click();
        await shot(`${lang}-${width}-${colorScheme}-grid`);
        await page
          .getByRole("button", { name: catalog.viewToggle, exact: true })
          .click();
        const currentRow = page.locator(".library-document[role=listitem]").first();
        await currentRow.click({ position: { x: 4, y: 4 } });
        await shot(`${lang}-${width}-${colorScheme}-selection`);
        await page.keyboard.press("Escape");
        await currentRow.click({ button: "right" });
        await shot(`${lang}-${width}-${colorScheme}-context-menu`);
        await page.keyboard.press('Escape');
        const target = page.getByRole("treeitem", {
          name: "Study",
          exact: true,
        });
        const transfer = await page.evaluateHandle((id) => {
          const dt = new window.DataTransfer();
          dt.setData("application/vstudy-documents", JSON.stringify([id]));
          return dt;
        }, ids[0]);
        await target.dispatchEvent("dragover", { dataTransfer: transfer });
        await shot(`${lang}-${width}-${colorScheme}-drag-folder`);
        await target.dispatchEvent("dragleave");
        await page
          .getByRole("textbox", { name: catalog.search, exact: true })
          .fill("no-matching-document-999");
        await page
          .getByRole("heading", { name: catalog.empty_search.replace("{{query}}","no-matching-document-999"), exact: true })
          .waitFor();
        await shot(`${lang}-${width}-${colorScheme}-empty`);
        await page
          .getByRole("button", { name: catalog.clearSearch, exact: true })
          .click();
        await page.locator(".library-document[role=listitem]").first().waitFor();
        assert.equal(
          await page
            .locator("body")
            .evaluate((e) => e.scrollWidth <= window.innerWidth),
          true,
        );
      }
  }
  await page.reload();
  await page.getByRole("heading", { name: "Study", exact: true }).waitFor();
  assert.deepEqual(errors, []);
  await writeFile(
    `${evidence}/round${round}.json`,
    JSON.stringify({ screenshots, errors }, null, 2),
  );
  console.log(
    `Library e2e passed: ${screenshots.length} screenshots, en/zh-Hant/ja search, move, pin, delete/undo, export, reload, axe.`,
  );
} catch (error) {
  if (app)
    await (
      await app.firstWindow()
    ).screenshot({ path: `${evidence}/failure.png` });
  throw error;
} finally {
  await app?.close();
  await rm(directory, { recursive: true, force: true });
}
