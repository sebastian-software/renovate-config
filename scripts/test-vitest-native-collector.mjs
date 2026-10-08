#!/usr/bin/env node
// Controlled real processes exercise collection only; this is not Linux/pnpm proof.
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fsNative from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { nativeExeca, recordGeneratedHead } from './vitest-native/collector.mjs';
const root=await fs.realpath(await fs.mkdtemp(path.join(tmpdir(),'native-collector-')));
const base={qualificationContractRevision:2,transformRevision:null,provenanceClass:'controlled-source-test',context:{worker:'test',wrapperInvocation:'test',containerId:null,imageId:null,imageDigest:null}};
const producer=`const fs=require('node:fs');const channel=JSON.parse(process.env.VITEST_NATIVE_CHANNEL);const send=e=>fs.writeSync(3,JSON.stringify({schemaVersion:1,qualificationContractRevision:2,...channel,pid:process.pid,...e})+'\\n');const interpreter={path:process.execPath,sha256:'a'.repeat(64),version:process.versions.node};send({state:'bootstrap',interpreter,pnpm:{path:'/owned/pnpm/bin/pnpm.mjs',sha256:'b'.repeat(64),version:'11.17.0',originalBundleSha256:'c'.repeat(64),derivedBundleSha256:'d'.repeat(64),transformRevision:null}});send({state:'dispatch',category:'install',interpreter});`;
// The test adapter preserves a real process/FD channel but substitutes an owned
// empty preload. Native integration is tested separately with real Renovate/pnpm.
const empty=path.join(root,'empty.mjs');await fs.writeFile(empty,'export {};\n');
async function run(name,tail,{alter,holdFailure=false,options={},profile=base,producerSource=producer}={}) {
  const directory=path.join(root,name);await fs.mkdir(directory);
  const opts={cwd:process.cwd(),env:{...process.env,VITEST_NATIVE_TAG:JSON.stringify({repository:'fixture/native',branch:'test'}),NODE_OPTIONS:''},stdin:'pipe',stdout:'pipe',stderr:'pipe',...options};
  let received;const execute=(cmd,args,actual)=>{received=actual;return spawn(cmd,args,actual);};
  const actualProfile={...profile,receiptDirectory:directory};
  const originalOpen=fsNative.openSync;
  if(holdFailure){fsNative.openSync=function(filename,...args){if(filename==='/proc/self/exe')throw Error('Controlled held-interpreter failure');return originalOpen.call(this,filename,...args);};syncBuiltinESMExports();}
  let child;try{child=nativeExeca(actualProfile,empty,execute,process.execPath,['-e',producerSource+tail],opts);}
  finally{if(holdFailure){fsNative.openSync=originalOpen;syncBuiltinESMExports();}}
  let stderr='';child.stdout?.resume();child.stderr?.on('data',part=>{stderr+=part;});
  if(alter)try{await alter(directory,child);}catch(error){const ended=once(child,'close');child.kill('SIGKILL');await ended;throw error;}
  const [code,signal]=await once(child,'close');await new Promise(resolve=>setImmediate(resolve));
  const names=(await fs.readdir(directory).catch(()=>[])).filter(name=>name.endsWith('.json'));
  return {code,signal,stderr,received,opts,profile:actualProfile,directory,receipts:await Promise.all(names.map(async name=>JSON.parse(await fs.readFile(path.join(directory,name),'utf8'))))};
}
const complete=await run('complete',"send({state:'process-exit',dispatched:true,exitCode:0,interpreterUnchanged:true});");
assert.equal(complete.code,0,complete.stderr);assert.equal(complete.receipts[0].state,process.platform==='linux'?'completed':'unsupported');
assert.equal(complete.receipts[0].completed,process.platform==='linux');
assert.equal(complete.receipts[0].qualificationContractRevision,2);
for(const marker of [undefined,1,999]) {
  const actual={...base,qualificationContractRevision:marker};
  const declined=await run(`incompatible-profile-${String(marker)}`,"process.exitCode=7;",{profile:actual,producerSource:''});
  assert.equal(declined.code,7);
  assert.equal(declined.receipts.length,0,'Incompatible profile must preserve native outcome without manufacturing a new receipt');
}
for(const [name,tail,code,signal] of [
  ['delegation-rejected',"send({state:'unsupported',reason:'unowned-delegation'});process.exitCode=7;",7,null],
  ['delegation-signal',"send({state:'unsupported',reason:'unowned-delegation'});process.kill(process.pid,'SIGTERM');",null,'SIGTERM'],
  ['observer-budget',"fs.writeSync(3,'x'.repeat(65537));process.exitCode=9;",9,null],
  ['mixed-event-revision',"fs.writeSync(3,JSON.stringify({schemaVersion:1,qualificationContractRevision:1,...channel,pid:process.pid,state:'unsupported',reason:'unowned-delegation'})+'\\n');process.exitCode=11;",11,null],
]) {
  const bootstrapOnly=producer.slice(0,producer.indexOf("send({state:'dispatch'"));
  const native=await run(name,tail,{producerSource:name.startsWith('delegation-')?bootstrapOnly:producer});
  assert.equal(native.code,code);assert.equal(native.signal,signal);
  assert.equal(native.receipts[0].nativeExit,code);assert.equal(native.receipts[0].nativeSignal,signal);
  assert.equal(native.receipts[0].completed,false);assert.equal(native.receipts[0].productionEligible,false);
  assert.equal(native.receipts[0].state,'unsupported');
  assert.equal(native.receipts[0].events.filter(event=>event.state==='process-exit').length,0);
  if(name.startsWith('delegation-'))assert.equal(native.receipts[0].events.filter(event=>event.state==='dispatch').length,0);
}
const generated='e'.repeat(40),config={repository:'fixture/native',branchName:'test'};
await recordGeneratedHead(complete.profile,config,{sourceBranch:'wrong',sha:generated},{getBranchCommit:async()=>generated});
let mapped=JSON.parse(await fs.readFile(path.join(complete.directory,complete.receipts[0].invocation+'.json'),'utf8'));
assert.equal(mapped.generatedPrHead,null);
await recordGeneratedHead(complete.profile,config,{sourceBranch:'test',sha:'f'.repeat(40)},{getBranchCommit:async()=>generated});
mapped=JSON.parse(await fs.readFile(path.join(complete.directory,complete.receipts[0].invocation+'.json'),'utf8'));
assert.equal(mapped.generatedPrHead,null);
await recordGeneratedHead(complete.profile,config,{sourceBranch:'test',sha:generated},{getBranchCommit:async()=>generated});
mapped=JSON.parse(await fs.readFile(path.join(complete.directory,complete.receipts[0].invocation+'.json'),'utf8'));
assert.equal(mapped.generatedPrHead,process.platform==='linux'?generated:null);assert.equal(mapped.inputHead,complete.receipts[0].inputHead);
await recordGeneratedHead(complete.profile,config,{sourceBranch:'test',sha:generated},{getBranchCommit:async()=>{throw Error('mapping unavailable');}});
assert.equal(complete.code,0);
const failure=await run('write-failure',"setTimeout(()=>{send({state:'process-exit',dispatched:true,exitCode:7,interpreterUnchanged:true});process.exitCode=7},150);",{alter:async directory=>{
  // Replace the directory after launch; no privileged permission assumption.
  await fs.rename(directory,directory+'-saved');await fs.writeFile(directory,'not a receipt directory');
}});
assert.equal(failure.code,7);assert.equal(failure.receipts.length,0);
const redirection=await run('redirection',"send({state:'dispatch',category:'install',interpreter:{...interpreter,secret:'must-never-persist'}});send({state:'process-exit',dispatched:true,exitCode:0,interpreterUnchanged:true});");
assert.equal(redirection.code,0);assert.equal(redirection.receipts[0].state,'unsupported');assert(!JSON.stringify(redirection.receipts).includes('must-never-persist'));
const partial=await run('partial',"setInterval(()=>{},1000);",{alter:async(directory,child)=>{
  const deadline=Date.now()+5000;let seen=false;
  while(Date.now()<deadline){const files=await fs.readdir(directory);for(const file of files.filter(name=>name.endsWith('.json'))){const receipt=JSON.parse(await fs.readFile(path.join(directory,file),'utf8'));if(receipt.events.some(event=>event.state==='dispatch'))seen=true;}if(seen)break;await new Promise(resolve=>setTimeout(resolve,10));}
  assert(seen,'Actual persisted dispatch must precede partial termination');child.kill('SIGKILL');
}});
assert.equal(partial.signal,'SIGKILL');assert.equal(partial.receipts[0].state,process.platform==='linux'?'incomplete':'unsupported');assert.equal(partial.receipts[0].completed,false);
let called=0,original;const opts={stdio:'inherit',env:{VITEST_NATIVE_TAG:'{}'}};
const token={native:true};assert.equal(nativeExeca(base,empty,(_c,_a,o)=>{called++;original=o;return token;},'native',[],opts),token);assert.equal(called,1);assert.equal(original,opts);
const broken={...base,get receiptDirectory(){throw Error('collector setup failure');}};
assert.equal(nativeExeca(broken,empty,(_c,_a,o)=>{assert.equal(o,opts);return token;},'native',[],opts),token);
const genuine={env:{VITEST_NATIVE_TAG:'{}',NODE_OPTIONS:'--require=/untrusted/preload.cjs'}};
assert.equal(nativeExeca({...base,receiptDirectory:root},empty,(_c,_a,o)=>{assert.equal(o,genuine);return token;},'native',[],genuine),token);
const unavailable=await run('held-interpreter-failure',"send({state:'process-exit',dispatched:true,exitCode:7,interpreterUnchanged:true});process.exitCode=7;",{holdFailure:true});
assert.equal(unavailable.code,7);assert.equal(unavailable.receipts[0].parentInterpreter,null);assert.equal(unavailable.receipts[0].completed,false);assert.equal(unavailable.receipts[0].state,'unsupported');
await recordGeneratedHead(unavailable.profile,config,{sourceBranch:'test',sha:generated},{getBranchCommit:async()=>generated});
const unavailableMapped=JSON.parse(await fs.readFile(path.join(unavailable.directory,unavailable.receipts[0].invocation+'.json'),'utf8'));assert.equal(unavailableMapped.generatedPrHead,null);
process.stdout.write(JSON.stringify({state:'PASSED',scope:'controlled-collector-real-processes',cases:19,heldInterpreterFaultDiscriminated:process.platform==='linux',darwinNeverCompletes:process.platform!=='linux',linuxPnpmProof:false,output:root})+'\n');
