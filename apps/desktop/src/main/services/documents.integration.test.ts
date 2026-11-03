import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { cp, copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createConverter, runProcess, scrubbedEnvironment } from "../../../resources/converter";

const available = ["uv", "python3"].some((command) => spawnSync(command, ["--version"]).status === 0);
describe.skipIf(!available)("real MarkItDown conversion (requires uv or Python 3.10+; skipped when neither is installed)", () => {
  let directory: string;
  let executable: string;
  let converter: ReturnType<typeof createConverter>;
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "vstudy-converter-integration-"));
    const resources = join(directory, "resources");
    await mkdir(resources);
    const progress: string[] = [];
    const options = { userData: directory, resources, onProgress: (message: string) => { progress.push(message); } };
    converter = createConverter(options);
    await expect(converter.ensureReady()).rejects.toThrow();
    await copyFile(resolve("resources/converter/requirements.txt"), join(resources, "requirements.txt"));
    await copyFile(resolve("resources/converter/convert.py"), join(resources, "convert.py"));
    await cp(resolve("resources/converter/pdf_md"), join(resources, "pdf_md"), { recursive: true });
    const python = await converter.ensureReady();
    executable = python;
    expect(await converter.ensureReady()).toBe(python);
    expect(progress).toContain("Converter ready");
    progress.length = 0;
    expect(await createConverter(options).ensureReady()).toBe(python);
    expect(progress).toEqual([]);
  }, 900_000);
  afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });
  it.each(["docx", "pptx", "xlsx", "html", "pdf", "csv"])("converts a real %s fixture", async (extension) => {
    const output = join(directory, `result-${extension}.md`);
    const parser = await converter.convert(resolve(`test-fixtures/converter/sample.${extension}`), output);
    expect(parser).toBe(extension === "pdf" ? "pdf_md" : "markitdown");
    expect(await readFile(output, "utf8")).toContain("VStudy fixture");
  }, 120_000);
  it("externalizes large DOCX images and drops oversized images before the Markdown cap", async () => {
    for (const megabytes of [7, 10]) {
      const source = join(directory, `large-${megabytes}.docx`);
      await runProcess(executable, ["-c", `import sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as original, zipfile.ZipFile(sys.argv[2], 'w', zipfile.ZIP_DEFLATED) as target:
 for name in original.namelist():
  data = original.read(name)
  if name == 'word/media/image1.png': data += b'\\0' * (int(sys.argv[3]) * 1024 * 1024)
  target.writestr(name, data)
`, resolve("test-fixtures/converter/sample.docx"), source, String(megabytes)], directory);
      const output = join(directory, `large-${megabytes}.md`);
      await converter.convert(source, output);
      const markdown = await readFile(output, "utf8");
      expect(markdown).toContain("VStudy fixture");
      expect(markdown).not.toContain("data:");
      if (megabytes === 7) {
        const image = /\]\((image-[a-f0-9]+\.png)\)/.exec(markdown)![1]!;
        expect((await readFile(join(directory, image))).length).toBe(7340100);
      } else expect(markdown).toContain("(image omitted)");
    }
  }, 120_000);
  it("returns a JSON error and permits another conversion after failure", async () => {
    const invalid = join(directory, "invalid.pdf");
    const result = spawnSync(executable, [join(directory, "resources/convert.py"), invalid, join(directory, "invalid.md"), join(directory, "invalid.md")], { cwd: directory, env: scrubbedEnvironment(directory), encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(JSON.parse(result.stderr.trim())).toMatchObject({ error: "Conversion failed", type: "FileNotFoundError" });
    await expect(converter.convert(invalid, join(directory, "invalid.md"))).rejects.toThrow("Conversion failed (");
    await converter.convert(resolve("test-fixtures/converter/sample.pdf"), join(directory, "retried.md"));
    expect(await readFile(join(directory, "retried.md"), "utf8")).toContain("VStudy fixture");
  });
});

it("caps subprocess output, times out, and scrubs inherited secrets", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "vstudy-process-test-"));
  try {
    await expect(runProcess(process.execPath, ["-e", "setInterval(() => {}, 1000)"], cwd, 50)).rejects.toThrow("timed out");
    await expect(runProcess(process.execPath, ["-e", "process.stdout.write('x'.repeat(10000))"], cwd, 1000, 100)).rejects.toThrow("output exceeds");
    await expect(runProcess(process.execPath, ["-e", "process.stderr.write('certificate verify failed https://user:password@example.com/private /private/path sk-secret'); process.exit(1)"], cwd)).rejects.toThrow("certificate verify failed [URL] [path] [redacted]");
    process.env.VSTUDY_TEST_SECRET = "private";
    expect(scrubbedEnvironment(cwd)).not.toHaveProperty("VSTUDY_TEST_SECRET");
    await runProcess(process.execPath, ["-e", "if (process.env.VSTUDY_TEST_SECRET || require('node:fs').realpathSync(process.env.HOME) !== process.cwd()) process.exit(1)"], cwd);
  } finally { delete process.env.VSTUDY_TEST_SECRET; await rm(cwd, { recursive: true, force: true }); }
});


it("shows clean resource errors and reports PDF fallback progress", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "vstudy-pdf-errors-"));
  try {
    const progress: string[] = [];
    const script = `process.stderr.write(JSON.stringify({code:"PDF_FALLBACK",type:"Progress",error:"fallback"})+"\\n"); setTimeout(() => {process.stderr.write(JSON.stringify({code:"PDF_RESOURCE_LIMIT",type:"ResourceLimit",error:"memory"})); process.exit(1)}, 30)`;
    await expect(runProcess(process.execPath, ["-e", script], cwd, 1000, 10000, message => progress.push(message))).rejects.toThrow("This PDF is too large or complex to convert");
    expect(progress).toEqual(["PDF too complex or large for the built-in parser; trying fallback…"]);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
