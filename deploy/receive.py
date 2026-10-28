#!/usr/bin/python3
"""Forced SSH command. Runs as suishouji-deploy, never as root."""
import os,re,pathlib,sys,tarfile,tempfile,subprocess,json,time,urllib.request,fcntl,shutil
ROOT=pathlib.Path('/opt/wall/deploy')
command=os.environ.get('SSH_ORIGINAL_COMMAND','')
match=re.fullmatch(r'deploy ([a-f0-9]{40})',command)
if not match:raise SystemExit('Only deploy <commit SHA> is permitted')
sha=match[1]
lock=(ROOT/'deploy.lock').open('a')
fcntl.flock(lock,fcntl.LOCK_EX)
release=ROOT/'releases'/sha
if release.exists():raise SystemExit('Release already exists; deploy a new commit')
with tempfile.TemporaryFile() as archive:
    total=0
    while True:
        chunk=sys.stdin.buffer.read(65536)
        if not chunk:break
        total+=len(chunk)
        if total>50*1024*1024:raise SystemExit('Archive too large')
        archive.write(chunk)
    archive.seek(0)
    with tarfile.open(fileobj=archive,mode='r:gz') as package:
        members=package.getmembers()
        size=0
        for member in members:
            name=pathlib.PurePosixPath(member.name)
            if name.is_absolute() or '..' in name.parts or not(member.isfile() or member.isdir()):raise SystemExit('Unsafe archive entry')
            if any(p in ['.git','data','.env','node_modules'] for p in name.parts):raise SystemExit('Runtime data cannot be deployed')
            size+=member.size
            if size>100*1024*1024:raise SystemExit('Unpacked archive too large')
        release.mkdir(mode=0o755,parents=True)
        for member in members:
            target=release/member.name
            if member.isdir():target.mkdir(parents=True,exist_ok=True);continue
            target.parent.mkdir(parents=True,exist_ok=True)
            with package.extractfile(member) as src,target.open('wb') as dst:shutil.copyfileobj(src,dst)
            target.chmod(0o644)
for source in ['server.mjs','admin-service.mjs','admin-setup.mjs']:
    subprocess.run(['/usr/local/bin/node','--check',str(release/source)],check=True)
tests=sorted(str(p) for p in (release/'tests').glob('*.test.mjs'))
assert tests,'Missing tests'
subprocess.run(['/usr/local/bin/node','--test',*tests],cwd=release,check=True,timeout=120)
(release/'public/__deployment.json').write_text(json.dumps({'commit':sha})+'\n')
current=ROOT/'current'
previous=current.resolve() if current.exists() else None
temporary=ROOT/'current.next'
temporary.unlink(missing_ok=True)
temporary.symlink_to(release,target_is_directory=True)
os.replace(temporary,current)
def restart():subprocess.run(['sudo','-n','/bin/systemctl','restart','wall.service'],check=True,timeout=30)
def healthy():
    for attempt in range(30):
        try:
            with urllib.request.urlopen('http://127.0.0.1:8080/__deployment.json?check='+sha,timeout=3) as r:version=json.load(r)
            with urllib.request.urlopen('http://127.0.0.1:8080/api/topic',timeout=3) as r:topic=json.load(r)
            if version.get('commit')==sha and topic.get('topic'):return True
        except Exception:pass
        time.sleep(1)
    return False
try:
    restart()
    if not healthy():raise RuntimeError('Health check failed')
except Exception:
    if previous:
        temporary.symlink_to(previous,target_is_directory=True);os.replace(temporary,current);restart()
        print('DEPLOY_ROLLED_BACK',flush=True)
    raise
print('DEPLOY_OK '+sha,flush=True)
