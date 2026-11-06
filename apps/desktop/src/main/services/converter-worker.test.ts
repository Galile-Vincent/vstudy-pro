/**
 * Regression coverage for services converter-worker.
 * Owned by main/services.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
import { expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WarmWorker } from "../../../resources/converter/warm-worker";

it("reuses a worker, recovers after job errors, and restarts after a crash", async () => {
  const directory = await mkdtemp(join(tmpdir(), "vstudy-worker-test-"));
  const script = join(directory, "worker.py");
  await writeFile(script, `import json, os, sys, time
print(json.dumps({'ready': True}), flush=True)
for line in sys.stdin:
 request = json.loads(line)
 source = request['source']
 if source == 'crash': os._exit(1)
 if source == 'hang': time.sleep(1000)
 if source == 'scan':
  print(json.dumps({'error': 'no text layer', 'code': 'NO_TEXT_LAYER'}), flush=True)
 elif source == 'error':
  print(json.dumps({'error': 'bad', 'code': 'PDF_TIME_LIMIT'}), flush=True)
 else:
  print(json.dumps({'progress': str(os.getpid())}), flush=True)
  print(json.dumps({'done': True}), flush=True)
`);
  const worker = new WarmWorker(process.platform === 'win32' ? 'python' : 'python3', script, directory);
  try {
    const pids: string[] = [];
    await worker.run("one", "", "", pid => pids.push(pid));
    await expect(worker.run("error", "", "")).rejects.toThrow("too large or complex");
    await expect(worker.run("scan", "", "")).rejects.toThrow("NO_TEXT_LAYER: OCR not supported");
    await worker.run("two", "", "", pid => pids.push(pid));
    expect(pids[0]).toBe(pids[1]);
    await expect(worker.run("crash", "", "")).rejects.toThrow("stopped");
    await worker.run("three", "", "", pid => pids.push(pid));
    expect(pids[2]).not.toBe(pids[0]);
    vi.useFakeTimers();
    const hung = worker.run("hang", "", "");
    const rejected = expect(hung).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(120_001);
    await rejected;
    vi.useRealTimers();
    await worker.run("after-timeout", "", "");
  } finally { vi.useRealTimers(); worker.stop(); await rm(directory, { recursive: true, force: true }); }
});

it.skipIf(process.platform === 'win32')('cancels bootstrap, reaps its process group and allows immediate venv removal', async () => {
  const { createConverter } = await import('../../../resources/converter');
  const { mkdir, readFile, chmod } = await import('node:fs/promises');
  const directory = await mkdtemp(join(tmpdir(), 'vstudy-bootstrap-stop-'));
  const bin = join(directory, 'bin');
  await mkdir(bin);
  const pidFile = join(directory, 'pids');
  const uv = join(bin, 'uv');
  await writeFile(join(directory, 'requirements.lock.txt'), 'fixture');
  await writeFile(uv, `#!/bin/sh
mkdir -p "$4"
${JSON.stringify(process.execPath)} -e 'require("fs").writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); process.on("SIGTERM",()=>{}); setInterval(()=>{},100)' &
wait
`);
  await chmod(uv, 0o700);
  const resolver = await import('../providers/trusted-executable');
  const resolveExecutable = vi.spyOn(resolver, 'resolveInstalledExecutable').mockImplementation(async name => name === 'uv' ? uv : null);
  const converter = createConverter({ userData: join(directory, 'data'), resources: directory, authorizeDownload: async () => true });
  const boot = converter.ensureReady();
  const rejected = expect(boot).rejects.toThrow();
  try {
    let pid = 0;
    for (let i=0;i<200;i++) { try { pid=Number(await readFile(pidFile,'utf8')); break; } catch { await new Promise(r=>setTimeout(r,10)); } }
    expect(pid).toBeGreaterThan(0);
    await converter.dispose();
    await rejected;
    await new Promise(r=>setTimeout(r,50));
    expect(() => process.kill(pid, 0)).toThrow();
    await rm(join(directory,'data','converter-venv'), {recursive:true,force:true});
    await expect(converter.ensureReady()).rejects.toThrow('Converter closed');
  } finally { await converter.dispose(); resolveExecutable.mockRestore(); vi.unstubAllEnvs(); await rm(directory,{recursive:true,force:true}); }
});

it.skipIf(process.platform === 'win32')('reaps descendants when an installer exits before its child',async()=>{
  const {ProcessScope}=await import('../../../resources/converter/process-scope');
  const scope=new ProcessScope();
  const script=`const child=require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},100)'],{stdio:'ignore'}); console.log(child.pid); child.unref();`;
  const child=scope.spawn(process.execPath,['-e',script],{stdio:['ignore','pipe','ignore']});
  let pid='';child.stdout!.on('data',chunk=>{pid+=String(chunk);});
  await new Promise<void>(resolve=>child.once('close',()=>resolve()));
  await scope.dispose();await new Promise(r=>setTimeout(r,50));
  expect(Number(pid)).toBeGreaterThan(0);expect(()=>process.kill(Number(pid),0)).toThrow();
});

it('denies native network access in the macOS converter sandbox', async () => {
  if (process.platform !== 'darwin') return;
  const directory = await mkdtemp(join(tmpdir(), 'vstudy-network-test-'));
  const script = join(directory, 'worker.py');
  await writeFile(script, `import json, socket, sys
print(json.dumps({'ready': True}), flush=True)
for line in sys.stdin:
 try:
  socket.create_connection(('127.0.0.1', 9), timeout=1)
  result='NETWORK_ALLOWED'
 except PermissionError:
  result='NETWORK_DENIED'
 print(json.dumps({'progress': result}), flush=True)
 print(json.dumps({'done': True}), flush=True)
`);
  const worker = new WarmWorker('python3', script, directory);
  try {
    const progress: string[] = [];
    await worker.run('probe', '', '', message => progress.push(message));
    expect(progress).toEqual(['NETWORK_DENIED']);
  } finally { worker.stop(); await rm(directory, { recursive: true, force: true }); }
});
it.skipIf(process.platform === 'win32')('sets kernel file/core limits before accepting converter jobs', async () => {
  const { spawnSync } = await import('node:child_process');
  const { resolve } = await import('node:path');
  const result = spawnSync('python3', ['-c', `import importlib.util, json, resource, sys
sys.path.insert(0, __import__('os').path.dirname(sys.argv[1]))
spec=importlib.util.spec_from_file_location('converter',sys.argv[1])
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
sys.argv=['convert.py','--warm-worker']
module.warm_worker=lambda: print(json.dumps([resource.getrlimit(resource.RLIMIT_NOFILE)[0],resource.getrlimit(resource.RLIMIT_FSIZE)[0],resource.getrlimit(resource.RLIMIT_CORE)[0]]))
module.main()
`, resolve('resources/converter/convert.py')], { encoding: 'utf8' });
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual([128, 64 * 1024 * 1024, 0]);
});
