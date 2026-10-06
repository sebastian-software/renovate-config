#!/usr/bin/env node
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { prepareNative } from './vitest-native/prepare.mjs';
import { transformPnpm, ORIGINAL_PNPM_BUNDLE } from './vitest-native/transform.mjs';
import { mapGeneratedHead } from './vitest-native/collector.mjs';
import { sealDirectories } from './vitest-release/files.mjs';

const {values}=parseArgs({options:{'pnpm-archive':{type:'string'},'pnpm-root':{type:'string'},
  'renovate-root':{type:'string'},'child-node':{type:'string'},output:{type:'string'}}});
for(const key of ['pnpm-archive','pnpm-root','renovate-root','child-node'])assert(values[key],`Missing --${key}`);
const root=values.output??await fs.mkdtemp(path.join(tmpdir(),'vitest-native-'));
if(values.output)await fs.mkdir(root);
const repository=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const original=await fs.readFile(path.join(values['pnpm-root'],'dist/pnpm.mjs'));
assert.equal(createHash('sha256').update(original).digest('hex'),ORIGINAL_PNPM_BUNDLE);
assert.throws(()=>transformPnpm(Buffer.concat([original,Buffer.from('\n')])),/Unsupported original/);
const derived=transformPnpm(original);
assert.notDeepEqual(derived,original);
const receipts=path.join(root,'receipts');await fs.mkdir(receipts);
const stock=path.join(root,'stock');await fs.cp(values['pnpm-root'],stock,{recursive:true,verbatimSymlinks:true});
async function seal(root) {
  for(const entry of await fs.readdir(root,{withFileTypes:true})) {
    const absolute=path.join(root,entry.name);
    if(entry.isDirectory())await seal(absolute);
    else if(!entry.isSymbolicLink()){const mode=(await fs.stat(absolute)).mode;await fs.chmod(absolute,mode&0o111?0o555:0o444);}
  }
  await fs.chmod(root,0o555);
}
await seal(stock);
const preparation=await prepareNative({archive:values['pnpm-archive'],pnpmRoot:stock,output:path.join(root,'instrumentation'),
  receiptDirectory:receipts,context:{worker:'controlled-source-test',wrapperInvocation:'controlled-source-test',
    containerId:null,imageId:null,imageDigest:null}});
await fs.writeFile(path.join(root,'preparation.json'),JSON.stringify(preparation,null,2)+'\n');
if(process.platform!=='linux') {
  process.stdout.write(JSON.stringify({state:'UNSUPPORTED_LOCAL_PLATFORM',sourceTransformAndAuthenticPreparation:true,
    linuxProcessProof:false,output:root})+'\n');
  process.exit(0);
}
const execute=promisify(execFile);
const {stdout:sourceHead}=await execute('/usr/bin/git',['-C',repository,'rev-parse','HEAD']);
const {stdout:common}=await execute('/usr/bin/git',['-C',repository,'rev-parse','--path-format=absolute','--git-common-dir']);
const loader=path.join(root,'instrumentation/loader.mjs');
const childNode=await fs.realpath(values['child-node']);
const bin=path.join(root,'bin');await fs.mkdir(bin);await fs.symlink(childNode,path.join(bin,'node'));await fs.symlink(path.join(stock,'bin/pnpm.mjs'),path.join(bin,'pnpm'));await fs.chmod(bin,0o555);
const expectedChildHash=createHash('sha256').update(await fs.readFile(childNode)).digest('hex');
assert.notEqual(childNode,await fs.realpath(process.execPath),'Real differing parent/child binaries required');
async function workspace(name,hooks=false) {
  const directory=path.join(root,name);await fs.mkdir(directory);
  await execute('/usr/bin/git',['init','-q',directory]);
  await fs.mkdir(path.join(directory,'.git/objects/info'),{recursive:true});
  await fs.writeFile(path.join(directory,'.git/objects/info/alternates'),path.join(common.trim(),'objects')+'\n');
  await fs.writeFile(path.join(directory,'.git/HEAD'),sourceHead.trim()+'\n');
  await fs.writeFile(path.join(directory,'package.json'),JSON.stringify({name:'native-observation-fixture',version:'1.0.0',
    packageManager:'pnpm@11.17.0',scripts:{preinstall:'node -e "require(\'fs\').writeFileSync(\'script-executed\',\'bad\')"'}})+'\n');
  if(hooks)await fs.writeFile(path.join(directory,'.pnpmfile.mjs'),"import fs from 'node:fs'; fs.writeFileSync('hook-executed','bad'); export default {hooks:{readPackage:p=>p}};\n");
  return directory;
}
function run(directory,observed=true,{dedupe=false,timeout=60000,killAfterDispatch=false}={}) {
  return fs.readdir(receipts).then(names=>new Promise((resolve,reject)=>{
    const before=new Set(names);
    const child=spawn(process.execPath,[path.join(repository,'scripts/test-vitest-native-runner.mjs'),
      '--root',directory,'--renovate',values['renovate-root'],'--node',childNode,'--pnpm',path.join(stock,'bin/pnpm.mjs'),
      '--bin',bin,'--profile-sha256',preparation.profileSha256,...dedupe?['--dedupe']:[]],
      {env:{...process.env,NODE_OPTIONS:observed?`--import=${loader}`:'',VITEST_NATIVE_PROFILE_SHA256:preparation.profileSha256},
        detached:true,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='';
    child.stdout.on('data',part=>{stdout+=part;if(stdout.length>1048576)child.kill('SIGKILL');});
    child.stderr.on('data',part=>{stderr+=part;if(stderr.length>1048576)child.kill('SIGKILL');});
    let monitor,monitorBusy=false,monitorStopped=false;
    if(killAfterDispatch)monitor=setInterval(async()=>{
      if(monitorBusy||monitorStopped)return;
      monitorBusy=true;
      try{for(const filename of await fs.readdir(receipts)){
        if(monitorStopped)break;
        if(!filename.endsWith('.json')||before.has(filename))continue;
        const receipt=JSON.parse(await fs.readFile(path.join(receipts,filename),'utf8'));
        const dispatch=receipt.events.find(event=>event.state==='dispatch');
        if(receipt.state!=='dispatch'||receipt.nativeExit!==null||!dispatch||!Number.isSafeInteger(dispatch.pid)||dispatch.pid<=0)continue;
        // This controlled fixture stalls inside its owned native process. Check
        // exact parent/group ownership; no liveness poll supplies runtime proof.
        const stat=await fs.readFile(`/proc/${dispatch.pid}/stat`,'utf8');
        const fields=stat.slice(stat.lastIndexOf(')')+2).trim().split(/\s+/);
        if(Number(fields[1])!==child.pid||Number(fields[2])!==dispatch.pid)continue;
        if(monitorStopped||child.exitCode!==null||child.signalCode!==null)break;
        monitorStopped=true;clearInterval(monitor);
        process.kill(-dispatch.pid,'SIGKILL');break;
      }}catch{}finally{monitorBusy=false;}
    },10);
    const timer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},timeout);
    child.once('error',error=>{monitorStopped=true;clearTimeout(timer);clearInterval(monitor);reject(error);});child.once('close',(code,signal)=>{monitorStopped=true;clearTimeout(timer);clearInterval(monitor);resolve({code,signal,stdout,stderr});});
  }));
}
const baseline=await workspace('baseline'),observed=await workspace('observed',true);
const first=await run(baseline,false);assert.equal(first.code,0,first.stderr);
const second=await run(observed);assert.equal(second.code,0,second.stderr);
assert.equal(await fs.readFile(path.join(baseline,'pnpm-lock.yaml'),'utf8'),await fs.readFile(path.join(observed,'pnpm-lock.yaml'),'utf8'));
await assert.rejects(fs.lstat(path.join(observed,'script-executed')),{code:'ENOENT'});
await assert.rejects(fs.lstat(path.join(observed,'hook-executed')),{code:'ENOENT'});
let all=await Promise.all((await fs.readdir(receipts)).filter(name=>name.endsWith('.json')).map(async name=>JSON.parse(await fs.readFile(path.join(receipts,name),'utf8'))));
assert.equal(all.length,1);
assert.equal(all[0].state,'completed');assert.equal(all[0].inputHead,sourceHead.trim());
const dispatch=all[0].events.find(event=>event.state==='dispatch');
assert.equal(dispatch.interpreter.path,childNode);assert.equal(dispatch.interpreter.sha256,expectedChildHash);
assert.notEqual(dispatch.interpreter.version,process.versions.node);assert.equal(all[0].parentInterpreter.version,process.versions.node);assert.notEqual(dispatch.interpreter.sha256,all[0].parentInterpreter.sha256);
assert.equal(all[0].generatedPrHead,null);
const mapped=mapGeneratedHead(all[0],{repository:'fixture/native',branch:'renovate/observation',inputHead:sourceHead.trim(),generatedPrHead:sourceHead.trim()});
assert.equal(mapped.generatedPrHead,sourceHead.trim());
assert.throws(()=>mapGeneratedHead(all[0],{repository:'wrong/native',branch:'renovate/observation',inputHead:sourceHead.trim(),generatedPrHead:sourceHead.trim()}),/Uncorrelated/);
const concurrent=await Promise.all([workspace('concurrent-a'),workspace('concurrent-b')]);
for(const result of await Promise.all(concurrent.map(directory=>run(directory))))assert.equal(result.code,0,result.stderr);
all=await Promise.all((await fs.readdir(receipts)).filter(name=>name.endsWith('.json')).map(async name=>JSON.parse(await fs.readFile(path.join(receipts,name),'utf8'))));
assert.equal(all.length,3);assert.equal(new Set(all.map(receipt=>receipt.invocation)).size,3);
for(const receipt of all)assert.equal(receipt.state,'completed');
const unsafe=await workspace('unsafe-dedupe',true);
const unsafeResult=await run(unsafe,true,{dedupe:true});assert.equal(unsafeResult.code,0,unsafeResult.stderr);
all=await Promise.all((await fs.readdir(receipts)).filter(name=>name.endsWith('.json')).map(async name=>JSON.parse(await fs.readFile(path.join(receipts,name),'utf8'))));
assert(all.some(receipt=>receipt.state==='unsupported'&&receipt.events.some(event=>event.reason==='non-data-only-lifecycle')),
  'Unchanged native dedupe with executable hook must never produce accepted evidence');
const stalled=createServer((_request,_response)=>{});await new Promise(resolve=>stalled.listen(0,'127.0.0.1',resolve));
const partial=await workspace('partial');
const partialManifest=JSON.parse(await fs.readFile(path.join(partial,'package.json'),'utf8'));partialManifest.dependencies={'native-stall-fixture':'1.0.0'};
await fs.writeFile(path.join(partial,'package.json'),JSON.stringify(partialManifest));
await fs.writeFile(path.join(partial,'.npmrc'),`registry=http://127.0.0.1:${stalled.address().port}/\nfetch-retries=0\nfetch-timeout=60000\n`);
const partialBefore=new Set(await fs.readdir(receipts));
const partialResult=await run(partial,true,{killAfterDispatch:true});stalled.closeAllConnections();await new Promise(resolve=>stalled.close(resolve));
assert.notEqual(partialResult.code,0);
const partialNames=(await fs.readdir(receipts)).filter(name=>name.endsWith('.json')&&!partialBefore.has(name));assert.equal(partialNames.length,1);
const partialReceipt=JSON.parse(await fs.readFile(path.join(receipts,partialNames[0]),'utf8'));
assert.equal(partialReceipt.state,'incomplete');assert.equal(partialReceipt.nativeSignal,'SIGKILL');assert.equal(partialReceipt.completed,false);
const delegationBase=await workspace('delegation-baseline'),delegationObserved=await workspace('delegation-observed');
for(const directory of [delegationBase,delegationObserved]){const manifest=JSON.parse(await fs.readFile(path.join(directory,'package.json'),'utf8'));manifest.packageManager='pnpm@11.20.0';await fs.writeFile(path.join(directory,'package.json'),JSON.stringify(manifest));}
const delegatedBefore=new Set(await fs.readdir(receipts));
const delegatedBaseline=await run(delegationBase,false,{timeout:120000}),delegatedObserved=await run(delegationObserved,true,{timeout:120000});
assert.equal(delegatedBaseline.code,0,delegatedBaseline.stderr);assert.equal(delegatedObserved.code,0,delegatedObserved.stderr);
assert.equal(await fs.readFile(path.join(delegationBase,'pnpm-lock.yaml'),'utf8'),await fs.readFile(path.join(delegationObserved,'pnpm-lock.yaml'),'utf8'));
const delegatedNames=(await fs.readdir(receipts)).filter(name=>name.endsWith('.json')&&!delegatedBefore.has(name));assert.equal(delegatedNames.length,1);
const delegatedReceipt=JSON.parse(await fs.readFile(path.join(receipts,delegatedNames[0]),'utf8'));
assert.equal(delegatedReceipt.completed,false);assert.equal(delegatedReceipt.state,'unsupported');assert(delegatedReceipt.events.some(event=>event.reason==='unowned-delegation'));assert.equal(delegatedReceipt.events.filter(event=>event.state==='dispatch').length,0);

const context=await fs.readFile(path.join(root,'instrumentation/profile.json'),'utf8');
assert(!context.includes('NODE_OPTIONS'));
await fs.writeFile(path.join(root,'summary.json'),JSON.stringify({state:'PASSED',platform:'linux',
  actualParentNode:process.versions.node,actualChildNode:dispatch.interpreter,originalDerivedLockAndOutcomeEquivalent:true,
  supportedInstallLifecycleEvidence:true,completeInstallUpdateDedupeCoverage:false,concurrentDistinctInvocations:true,unsafeDedupeUnsupported:true,
  partialRunNotSuccessful:true,productionEligible:false,nativeDelegationNotBootstrapSuccess:true,remaining:'Linux process evidence must run at the reviewed containing candidate revision; dedupe executable hooks remain unsupported' },null,2)+'\n');
process.stdout.write(JSON.stringify({state:'PASSED',linuxProcessProof:true,output:root,productionEligible:false})+'\n');
