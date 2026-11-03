import { _electron as electron } from "playwright";
import { Buffer } from "node:buffer";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const directory = await mkdtemp(join(tmpdir(), "vstudy-conversion-e2e-"));
const fixtures = join(directory, "fixtures");
const unsupported = join(directory, "unsupported.exe");
await writeFile(unsupported, "unsupported");
execFileSync("python3", ["test-fixtures/converter/generate.py", fixtures]);
let app, page;
try {
  app = await electron.launch({
    args: [resolve("."), `--user-data-dir=${join(directory, "user-data")}`],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "", VSTUDY_FAKE_PROVIDER: "1" },
  });
  page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.getByRole("heading", { name: "VStudy Pro" }).waitFor();
  for (const extension of ["docx", "xlsx", "pdf"]) {
    const path = join(fixtures, `sample.${extension}`);
    await app.evaluate(({ dialog }, { path, extension }) => {
      dialog.showOpenDialog = extension === "docx"
        ? async () => { throw new Error("File drop must not open a chooser"); }
        : async () => ({ canceled: false, filePaths: [path] });
    }, { path, extension });
    if (extension === "docx") {
      await page.evaluate(() => {
        const input = window.document.createElement("input");
        input.type = "file";
        input.multiple = true;
        input.id = "e2e-drop-file";
        input.hidden = true;
        window.document.body.append(input);
      });
      await page.locator("#e2e-drop-file").setInputFiles([unsupported, path]);
      await page.evaluate(() => {
        const input = window.document.querySelector("#e2e-drop-file");
        const dataTransfer = new window.DataTransfer();
        for (const file of input.files) dataTransfer.items.add(file);
        window.document.querySelector(".workspace").dispatchEvent(new window.DragEvent("drop", { bubbles: true, dataTransfer }));
        input.remove();
      });
    } else {
      await page.getByRole("button", { name: "＋ Import document", exact: true }).click();
    }
    await page.getByRole("region", { name: "Document", exact: true })
      .locator(".pane-toolbar .eyebrow").filter({ hasText: `sample.${extension}` }).waitFor();
    const viewer = page.getByTestId("document-markdown");
    await viewer.filter({ hasText: "VStudy fixture" }).waitFor({ timeout: 660_000 });
    const importedDocument = await page.evaluate(async (name) => {
      const documents = await window.desktop.invoke("documents:list", {});
      return documents.find((document) => document.sourceName === name);
    }, `sample.${extension}`);
    assert.equal(importedDocument.status, "ready", importedDocument.error ?? "Document must finish conversion");
    if (extension === "docx") {
      assert.ok((await page.locator(".notice").innerText()).includes("Unsupported document type"), "per-file import failure is reported while successful file opens");
      await viewer.locator("img").waitFor();
      await page.waitForFunction(() => {
        const image = window.document.querySelector('[data-testid="document-markdown"] img');
        return image?.complete && image.naturalWidth === 1;
      });
    }
    assert.equal(importedDocument.mime.includes(extension === "pdf" ? "pdf" : "officedocument"), true);
    const chatBox = await page.getByRole("region", { name: "Chat", exact: true }).boundingBox();
    const documentBox = await page.getByRole("region", { name: "Document", exact: true }).boundingBox();
    assert.ok(documentBox.x > chatBox.x, "Converted text appears in right pane");
    console.log(JSON.stringify({ extension, status: importedDocument.status, text: await viewer.innerText() }));
  }
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
  const imageFixture = join(fixtures, "images.md");
  await writeFile(imageFixture, `# Image rendering\n\n![embedded](data:image/png;base64,${png})\n\n![library](assets/pixel.png)`);
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, imageFixture);
  await page.getByRole("button", { name: "＋ Import document", exact: true }).click();
  await page.getByTestId("document-markdown").filter({ hasText: "Image rendering" }).waitFor();
  const imageDocument = await page.evaluate(async () =>
    (await window.desktop.invoke("documents:list", {})).find((document) => document.sourceName === "images.md"));
  const { mkdir } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  await mkdir(join(dirname(imageDocument.markdownPath), "assets"));
  await writeFile(join(dirname(imageDocument.markdownPath), "assets/pixel.png"), Buffer.from(png, "base64"));
  await page.reload();
  await page.locator(".document-item").filter({ hasText: "images.md" }).click();
  await page.waitForFunction(() => {
    const images = Array.from(window.document.querySelectorAll('[data-testid="document-markdown"] img'));
    return images.length === 2 && images.every((image) => image.complete && image.naturalWidth === 1);
  });
  console.log(JSON.stringify({ images: "PASS", dataUri: true, libraryProtocol: true, fileDrop: true }));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: "PASS", realConverter: true, formats: ["docx", "xlsx", "pdf"], consoleErrors: errors }));
} catch (error) {
  console.error(await page?.locator("body").innerText().catch(() => "Window unavailable"));
  throw error;
} finally {
  await app?.close();
  await rm(directory, { recursive: true, force: true });
}
