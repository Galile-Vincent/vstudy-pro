import { expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WarmWorker } from "../../../resources/converter/warm-worker";

it("reuses a worker, recovers after job errors, and restarts after a crash", async () => {
  const directory = await mkdtemp(join(tmpdir(), "vstudy-worker-test-"));
  const script = join(directory, "worker.py");
  await writeFile(script, `import json, os, sys
print(json.dumps({'ready': True}), flush=True)
for line in sys.stdin:
 request = json.loads(line)
 source = request['source']
 if source == 'crash': os._exit(1)
 if source == 'error':
  print(json.dumps({'error': 'bad', 'code': 'PDF_TIME_LIMIT'}), flush=True)
 else:
  print(json.dumps({'progress': str(os.getpid())}), flush=True)
  print(json.dumps({'done': True}), flush=True)
`);
  const worker = new WarmWorker("python3", script, directory);
  try {
    const pids: string[] = [];
    await worker.run("one", "", "", pid => pids.push(pid));
    await expect(worker.run("error", "", "")).rejects.toThrow("too large or complex");
    await worker.run("two", "", "", pid => pids.push(pid));
    expect(pids[0]).toBe(pids[1]);
    await expect(worker.run("crash", "", "")).rejects.toThrow("stopped");
    await worker.run("three", "", "", pid => pids.push(pid));
    expect(pids[2]).not.toBe(pids[0]);
  } finally { worker.stop(); await rm(directory, { recursive: true, force: true }); }
});
