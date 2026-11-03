import subprocess,tempfile,os,time,socket,json,pathlib,signal
binary=str(pathlib.Path(__file__).resolve().parents[1]/'release/mac-arm64/VStudy Pro.app/Contents/MacOS/VStudy Pro')
results=[]
for kind in ['run-as-node','inspect']:
 with tempfile.TemporaryDirectory(prefix='vstudy-fuse-probe-') as root:
  marker=pathlib.Path(root)/'NODE_EXECUTED'
  port=19379
  args=[binary,'--user-data-dir='+root]
  env={key:os.environ[key] for key in ['PATH','HOME','TMPDIR','LANG','USER','LOGNAME'] if key in os.environ}
  if kind=='run-as-node':
   env['ELECTRON_RUN_AS_NODE']='1'
   args+=['-e',f'require("fs").writeFileSync({json.dumps(str(marker))},"bad")']
  else:args+=['--inspect=127.0.0.1:'+str(port)]
  logpath='/tmp/vstudy-probe-'+kind+'.log'
  with open(logpath,'w') as log:
   p=subprocess.Popen(args,env=env,stdout=log,stderr=log,start_new_session=True)
   opened=False
   for _ in range(40):
    if kind=='inspect':
     try:
      with socket.create_connection(('127.0.0.1',port),timeout=.1):opened=True
     except OSError:pass
    time.sleep(.1)
   alive=p.poll() is None
   results.append({'probe':kind,'nodeMarker':marker.exists(),'inspectorOpened':opened,'appAliveAfter4s':alive,'exit':p.poll(),'log':logpath,'loadError':'Failed to load URL' in pathlib.Path(logpath).read_text()})
   if alive:
    os.killpg(p.pid,signal.SIGTERM)
    try:p.wait(timeout=5)
    except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait()
pathlib.Path('/tmp/vstudy-binary-probes.json').write_text(json.dumps(results,indent=2))
print(json.dumps(results,indent=2))
if any(r['nodeMarker'] or r['inspectorOpened'] or r['loadError'] or not r['appAliveAfter4s'] for r in results):raise SystemExit(1)
