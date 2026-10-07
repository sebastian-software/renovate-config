#!/usr/bin/env node
// Documentary full evidence format only. These selected test records are not
// Linux worker measurements, publication evidence or deployable authority.
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createStockFixture, hash, bytes, leaves, consumer, seal, replace } from './test-vitest-production-fixture.mjs';
const {values}=parseArgs({options:{archives:{type:'string'},platform:{type:'string'},'require-linux':{type:'boolean'},'native-verifier':{type:'string'}}});
const fixture=await createStockFixture(values);
const {root,revision,implementation,nativeNames,issuerNames,sourceRoot}=fixture;
const {prepareNative}=await import(pathToFileURL(path.join(sourceRoot,'scripts/vitest-native/prepare.mjs')));
const {issueAuthority,verifyIssuedAuthority,reconstructAuthority}=await import(pathToFileURL(path.join(sourceRoot,'scripts/vitest-native/authority.mjs')));
const {validateAuthority,verifyRuntime,aliasDigest}=await import(pathToFileURL(path.join(sourceRoot,'scripts/vitest-native/runtime.mjs')));
// Scenario list is an independent acceptance oracle, not imported from issuer.
const scenarios=['readonly','data-only','concurrency','delegation','term','int','kill','partial','tamper','redirection','replacement','script-suppression','hook-suppression','preload-suppression'];
const categories=['install','update','dedupe'],components=['checker','helper','toolchain','observation'];
const emptyHash=hash(Buffer.from('export {};\n'));
const preparation={schemaVersion:1,trustScope:'source-fixture',sourceRevision:revision,
  sourceOrigin:`https://github.com/sebastian-software/renovate-config/commit/${revision}`,
  transform:{revision,files:nativeNames.map(name=>implementation[name])},
  original:{name:'pnpm',version:'11.17.0',origin:'https://registry.npmjs.org/pnpm/-/pnpm-11.17.0.tgz',
    archiveSha256:'644eb5079654e87dae59a07e62d7f098162b9ce58f06077328b5ddefca1c8541',
    bundleSha256:'228451e6383cf4df0700fc19b37aba1a25e6540e62fbca70ca2d76b719a4d883'}};
const provenance=path.join(root,'native-preparation.json');await fs.writeFile(provenance,bytes(preparation),{mode:0o444});
const preparationPin=hash(bytes(preparation));
const imageId=`sha256:${hash(Buffer.from('documentary-source-fixture-image-id'))}`;
const imageDigest=`sha256:${hash(Buffer.from('documentary-source-fixture-image-digest'))}`;
const observation=path.join(root,'observation');
const prepared=await prepareNative({archive:fixture.extracted.pnpm.archive,pnpmRoot:fixture.extracted.pnpm.root,
  output:observation,receiptDirectory:'/opt/renovate-native-receipts',contextFile:'/opt/renovate-native-context/context.json',
  context:{worker:'documentary-source-fixture',wrapperInvocation:'documentary-source-fixture',containerId:null,imageId,imageDigest},
  provenance,provenanceSha256:preparationPin,sourceRoot});
assert.equal(prepared.productionEligible,false);assert.equal(prepared.transformRevision,revision);
const profilePath=path.join(observation,'profile.json'),frozenProfile=await fs.readFile(profilePath),profile=JSON.parse(frozenProfile);
assert.equal(prepared.profileSha256,hash(frozenProfile));assert.equal(profile.productionEligible,false);
assert.equal((await fs.stat(profilePath)).mode&0o222,0);
const componentRoots={checker:path.join(fixture.options.output,'checker'),helper:path.join(fixture.options.output,'helper'),
  toolchain:path.join(fixture.options.output,'toolchain'),observation};
const inventories={};for(const component of components) inventories[component]=consumer(await leaves(componentRoots[component]));
const componentPins=Object.fromEntries(components.map(component=>[component,hash(bytes(inventories[component]))]));
const selection={schemaVersion:1,trustScope:'source-fixture',sourceRevision:revision,transformRevision:revision,imageId,imageDigest,
  preparationSha256:preparationPin,profileSha256:hash(frozenProfile),componentInventorySha256:componentPins,
  rawEvidence:{},stock:{provenanceSha256:fixture.provenancePin,selectionSha256:fixture.finalSelectionPin,releaseSha256:hash(fixture.receiptBytes)},
  issuer:{revision,files:issuerNames.map(name=>implementation[name])}};
const common={schemaVersion:1,trustScope:'source-fixture',sourceRevision:revision,profileSha256:selection.profileSha256,
  originalArchiveSha256:profile.originalArchiveSha256,originalBundleSha256:profile.originalBundleSha256,
  derivedBundleSha256:profile.derivedBundleSha256,imageId,imageDigest};
const evidenceRoot=path.join(root,'evidence');await fs.mkdir(evidenceRoot);await fs.mkdir(path.join(evidenceRoot,'raw'));
const documents=new Map();
async function retained(name,value) {
  const content=Buffer.isBuffer(value)?value:bytes(value);await fs.writeFile(path.join(evidenceRoot,name),content,{mode:0o444});
  documents.set(name,content);const pin=hash(content);selection.rawEvidence[name]=pin;return {path:name,sha256:pin};
}
const interpreter={identitySource:'/proc/self/exe',path:'/documentary-fixture/bin/effective-node',version:'24.21.0',sha256:hash(Buffer.from('documentary-fixture-effective-interpreter'))};
const parentInterpreter={identitySource:'/proc/self/exe',path:'/documentary-fixture/bin/parent-node',version:'24.18.0',sha256:hash(Buffer.from('documentary-fixture-parent-interpreter'))};
const mounts=components.map(component=>({component,options:'ro',inventorySha256:componentPins[component]}));
const suppression=Object.fromEntries(['scripts','hooks','preload','configuration'].map(kind=>[kind,{attemptedSha256:hash(Buffer.from(`documentary-${kind}-attempt`)),executions:0,guardSha256:emptyHash}]));
const records={};
function challengeObserved(scenario,raw) {
  if(['readonly','tamper','redirection','replacement'].includes(scenario)) return {operation:scenario==='replacement'?'replace':scenario==='redirection'?'redirect':'write',errorCode:'EROFS',beforeSha256:componentPins.observation,afterSha256:componentPins.observation,targetInventorySha256:componentPins.observation};
  if(['data-only','script-suppression','hook-suppression','preload-suppression'].includes(scenario)) return {operation:scenario==='hook-suppression'?'hook':scenario==='preload-suppression'?'preload':'script',attemptedSha256:hash(Buffer.from('documentary executable attempt')),executions:0,guardSha256:emptyHash};
  if(scenario==='concurrency') return {invocationIds:[raw.invocationId,`${raw.invocationId}-other`],receiptPaths:[`receipts/${raw.invocationId}.json`,`receipts/${raw.invocationId}-other.json`],completedInvocationIds:[raw.invocationId,`${raw.invocationId}-other`]};
  if(scenario==='delegation') return {parentInvocationId:raw.invocationId,childInvocationId:`${raw.invocationId}-child`,childInterpreterSha256:interpreter.sha256,effectiveCliSha256:profile.derivedBundleSha256,unobservedChildren:0};
  if(['term','int','kill'].includes(scenario)) return {signal:raw.outcome.signal,descendantsRemaining:0,receiptEligible:false};
  assert.equal(scenario,'partial');return {terminalState:'partial',receiptEligible:false,descendantsRemaining:0,completedNativeCommands:0};
}
async function rawRecord(category,identity,scenario=null) {
  const id=`${category}-${scenario??identity}`,bundleSha256=identity==='original'?profile.originalBundleSha256:profile.derivedBundleSha256;
  const lock=await retained(`raw/${id}.lock`,Buffer.from(`lockfileVersion: '9.0'\n# documentary source fixture ${category}\n`));
  const outcome=['term','int','kill'].includes(scenario)?({term:{exitCode:143,signal:'SIGTERM'},int:{exitCode:130,signal:'SIGINT'},kill:{exitCode:137,signal:'SIGKILL'}}[scenario]):{exitCode:0,signal:null};
  const raw={...common,platform:'linux',category,scenario,runtimeIdentity:identity,bundleSha256,invocationId:id,
    interpreter,parentInterpreter,mounts,suppression,lock,lockSha256:lock.sha256,outcome};
  for(const [phase,sequence,observed] of [
    ['launch',1,{parentInterpreterSha256:parentInterpreter.sha256,mountInventorySha256:hash(bytes(mounts))}],
    ['dispatch',2,{interpreterSha256:interpreter.sha256,bundleSha256,dataOnlyGuardSha256:emptyHash}],
    ['completion',3,{...outcome,lockSha256:lock.sha256,descendantsRemaining:0}],
  ]) {
    const reference=await retained(`raw/${id}-${phase}.json`,{...common,invocationId:id,phase,sequence,observed});
    raw[phase]={invocationId:id,sequence,recordSha256:reference.sha256,record:reference};
  }
  if(scenario) {
    const events=[];for(const sequence of [4,5]) events.push({...await retained(`raw/${id}-challenge-${sequence}.json`,{
      ...common,invocationId:id,scenario,sequence,observed:challengeObserved(scenario,raw)}),sequence});
    raw.challenge={kind:scenario,inputSha256:hash(Buffer.from(`documentary-${id}-input`)),observedSha256:hash(bytes(challengeObserved(scenario,raw))),result:'contained',events};
  }
  const ref=await retained(`raw/${id}.json`,raw);records[id]=raw;return ref;
}
const commands=[];for(const category of categories) commands.push({category,original:await rawRecord(category,'original'),derived:await rawRecord(category,'derived')});
const cases=[];for(const category of categories) for(const scenario of scenarios) cases.push({category,scenario,evidence:await rawRecord(category,'derived',scenario)});
const nativeAliases=[{kind:'node',digestKind:'sha256-file',source:'node/bin/node',destination:'/usr/local/bin/node'},
  {kind:'pnpm',digestKind:'sha256-inventory-tuples-v1',source:'pnpm',destination:'/usr/local/lib/pnpm'}].map(alias=>{
    const sha256=aliasDigest(alias,inventories.toolchain);return {...alias,sha256,originalImageSha256:sha256};});
const proofs={
  'linux-compatibility.json':{...common,platform:'linux',completeInstallUpdateDedupeCoverage:true,originalDerivedLockAndOutcomeEquivalent:true,commands},
  'data-only-lifecycle.json':{...common,completeInstallUpdateDedupeCoverage:true,dataOnlyWholeLifecycle:true,emptyPnpmfileSha256:emptyHash,cases},
  'inventories.json':{...common,components:inventories},
  'image.json':{...common,immutableImageId:imageId,immutableImageDigest:imageDigest,componentInventorySha256:componentPins,nativeAliases},
  'aliases.json':{...common,nativeAliases},
};
const proofKeys={'linux-compatibility.json':'compatibilitySha256','data-only-lifecycle.json':'lifecycleSha256','inventories.json':'inventoriesSha256','image.json':'imageSha256','aliases.json':'aliasesSha256','publication.json':'publicationSha256'};
for(const [name,document] of Object.entries(proofs)) {const content=bytes(document);await fs.writeFile(path.join(evidenceRoot,name),content,{mode:0o444});documents.set(name,content);selection[proofKeys[name]]=hash(content);}
const publication={...common,preparationSha256:preparationPin,compatibilitySha256:selection.compatibilitySha256,lifecycleSha256:selection.lifecycleSha256,
  inventoriesSha256:selection.inventoriesSha256,imageSha256:selection.imageSha256,aliasesSha256:selection.aliasesSha256,
  issuerRevision:revision,rawEvidenceSha256:hash(bytes(selection.rawEvidence)),immutableOrigin:'https://source-fixture.invalid/native/immutable'};
proofs['publication.json']=publication;documents.set('publication.json',bytes(publication));
await fs.writeFile(path.join(evidenceRoot,'publication.json'),bytes(publication),{mode:0o444});selection.publicationSha256=hash(bytes(publication));
const selectedPath=path.join(root,'native-selection.json'),selectedBytes=bytes(selection);await fs.writeFile(selectedPath,selectedBytes,{mode:0o444});
const settings={sourceFixture:true};
const options={selection:selectedPath,selectionSha256:hash(selectedBytes),provenance,profile:profilePath,sourceRoot,evidenceRoot,
  stockProvenance:fixture.options.provenance,stockSelection:fixture.options.selection,stockRoot:fixture.options.output,
  artifactRoot:fixture.artifactRoot,componentRoots,output:path.join(root,'authority.json')};
const issued=await issueAuthority(options,settings);assert.equal(issued.productionEligible,false);
const authorityBytes=await fs.readFile(options.output),authority=JSON.parse(authorityBytes);
assert.equal(authority.trustScope,'source-fixture');assert.equal(authority.productionEligible,false);
assert.deepEqual(Object.keys(authority.components).sort(),components.toSorted());assert.equal(authority.nativeAliases.length,2);
validateAuthority(authority,settings);
await verifyIssuedAuthority({...options,authority:options.output,authoritySha256:hash(authorityBytes)},settings);
assert.deepEqual((await reconstructAuthority(options,settings)).bytes,authorityBytes);
assert.deepEqual(await fs.readFile(profilePath),frozenProfile,'Issuance cannot patch qualified profile bytes');
assert.equal((await fs.stat(profilePath)).mode&0o222,0);
const passed=['complete source fixture issue/reconstruct/separate verify immutable authority','profile frozen before proofs unchanged after issue','all 3 compatibility categories + 42 lifecycle cases with every retained selected phase/challenge/lock','exact 4 original/observation components and 2 original-image aliases'];
await assert.rejects(issueAuthority({...options,output:path.join(root,'live-authority.json')}));passed.push('normal issuer rejects fixture trust');
const normalCli=spawnSync(process.execPath,[path.join(sourceRoot,'scripts/vitest-native-authority.mjs'),'issue',
  '--selection',options.selection,'--selection-sha256',options.selectionSha256,'--output',path.join(root,'cli-authority.json')],{encoding:'utf8'});
assert.equal(normalCli.status,1);assert.match(normalCli.stderr,/Native authority rejected/);
passed.push('normal deployment-capable issuer CLI rejects fixture scope');
assert.throws(()=>validateAuthority(authority));passed.push('normal runtime validation rejects fixture trust');
assert.throws(()=>verifyRuntime(options.output,hash(authorityBytes),path.join(root,'absent-launch')));passed.push('actual live runtime cannot select fixture');
for(const marker of [undefined,'anything']) assert.throws(()=>validateAuthority({...authority,trustScope:marker},settings));
assert.throws(()=>validateAuthority({...authority,productionEligible:true},settings));passed.push('missing/arbitrary scope and true relabel rejected');
async function rejects(label,changes={},pattern) {await assert.rejects(reconstructAuthority({...options,...changes},settings),pattern);passed.push(label);}
await rejects('wrong outside authority selection pin',{selectionSha256:'0'.repeat(64)},/pin mismatch/);
await rejects('missing outside authority selection pin',{selectionSha256:undefined},/pin required/);
async function repinnedSelection(label,mutate,pattern) {
  const changed=structuredClone(selection);mutate(changed);const file=path.join(root,'changed-selection.json');await fs.writeFile(file,bytes(changed));
  await rejects(label,{selection:file,selectionSha256:hash(bytes(changed))},pattern);
}
await repinnedSelection('wrong independently selected preparation pin',s=>s.preparationSha256='0'.repeat(64),/pin mismatch/);
await repinnedSelection('wrong independently selected frozen profile pin',s=>s.profileSha256='0'.repeat(64),/pin mismatch/);
await repinnedSelection('uncontained issuer revision',s=>s.issuer.revision='0'.repeat(40));
await repinnedSelection('incomplete issuer containing implementation closure',s=>s.issuer.files.pop(),/closure/);
// Fixed outside selection defeats complete candidate rehashing before semantic validation.
const repinned=structuredClone(selection);repinned.imageDigest=`sha256:${'0'.repeat(64)}`;
const repinnedPath=path.join(root,'self-repinned-selection.json');await fs.writeFile(repinnedPath,bytes(repinned));
await rejects('candidate self-consistent repin cannot replace fixed outside selection',{selection:repinnedPath},/pin mismatch/);
async function evidenceMutation(label,name,mutate,pattern) {
  const original=documents.get(name),changed=JSON.parse(original);mutate(changed);const content=bytes(changed);
  const changedSelection=structuredClone(selection);
  if(name.startsWith('raw/')) changedSelection.rawEvidence[name]=hash(content);else changedSelection[proofKeys[name]]=hash(content);
  await replace(path.join(evidenceRoot,name),content);
  const file=path.join(root,'changed-selection.json');await fs.writeFile(file,bytes(changedSelection));
  try{await rejects(label,{selection:file,selectionSha256:hash(bytes(changedSelection))},pattern);}finally{await replace(path.join(evidenceRoot,name),original);}
}
await evidenceMutation('missing compatibility category','linux-compatibility.json',p=>p.commands.pop(),/dedupe evidence/);
await evidenceMutation('incomplete whole lifecycle','data-only-lifecycle.json',p=>p.cases.pop(),/whole-lifecycle/);
await evidenceMutation('publication omitted selected evidence pin','publication.json',p=>delete p.compatibilitySha256,/attestation chain/);
await evidenceMutation('image identity mismatch','image.json',p=>p.immutableImageId=`sha256:${'0'.repeat(64)}`,/image selection/);
await evidenceMutation('original image alias mismatch','aliases.json',p=>p.nativeAliases[0].originalImageSha256='0'.repeat(64),/aliases/);
await evidenceMutation('unexpected third alias','aliases.json',p=>p.nativeAliases.push({...p.nativeAliases[0]}),/Exactly two/);
await evidenceMutation('proof changed frozen profile binding','linux-compatibility.json',p=>p.profileSha256='0'.repeat(64),/unchanged profile/);
await evidenceMutation('compatibility summary without concrete records','linux-compatibility.json',p=>p.commands=p.commands.map(c=>({category:c.category,original:{path:'raw/absent',sha256:'0'.repeat(64)},derived:c.derived})),/outside|independent/);
// Physical closure attacks do not alter the outside anchor.
const physical=path.join(evidenceRoot,'raw/install-original-launch.json'),physicalBytes=await fs.readFile(physical);
try{await fs.rename(physical,physical+'.saved');await rejects('missing selected physical leaf',{},/physical evidence closure/);}finally{await fs.rename(physical+'.saved',physical);}
try{await fs.writeFile(path.join(evidenceRoot,'extra'),Buffer.from('extra'));await rejects('extra unselected physical leaf',{},/physical evidence closure/);}finally{await fs.unlink(path.join(evidenceRoot,'extra'));}
try{await replace(physical,Buffer.concat([physicalBytes,Buffer.from(' ')]));await rejects('altered selected physical leaf',{},/physical evidence closure/);}finally{await replace(physical,physicalBytes);}
try{await fs.rename(physical,physical+'.saved');await fs.symlink(path.join(root,'authority.json'),physical);await rejects('escaping symlink selected leaf',{},/Escaping|symlink/);}finally{await fs.unlink(physical);await fs.rename(physical+'.saved',physical);}
try{await fs.rename(physical,physical+'.saved');await fs.symlink('install-derived-launch.json',physical);await rejects('internal symlink cannot substitute selected raw file',{},/physical evidence closure/);}finally{await fs.unlink(physical);await fs.rename(physical+'.saved',physical);}
try{const changed=structuredClone(profile);changed.productionEligible=true;await replace(profilePath,bytes(changed));await rejects('changed frozen profile cannot be requalified',{},/pin mismatch/);}finally{await replace(profilePath,frozenProfile);}
// Retained event mutation is fully candidate-rehashed (event, raw reference,
// summary, publication, selection), then semantic invariants must still reject.
async function semanticRawMutation(label,id,mutateRaw,mutateEvent,pattern,eventSelector='challenge-or-dispatch') {
  const changedSelection=structuredClone(selection),raw=structuredClone(records[id]),changedProofs=structuredClone(proofs);
  const saved=new Map();
  async function set(name,document) {saved.set(name,documents.get(name));const content=bytes(document);await replace(path.join(evidenceRoot,name),content);return hash(content);}
  if(mutateEvent) {
    const challengeEvent=eventSelector==='challenge-all'||eventSelector==='challenge-or-dispatch'&&Boolean(raw.challenge);
    const references=eventSelector==='challenge-all'?raw.challenge.events:
      [challengeEvent?raw.challenge.events[0]:raw.dispatch.record];
    for(const ref of references) {
      const event=JSON.parse(documents.get(ref.path));mutateEvent(event,raw);
      const pin=await set(ref.path,event);changedSelection.rawEvidence[ref.path]=pin;ref.sha256=pin;
      if(!challengeEvent)raw.dispatch.recordSha256=pin;
      if(eventSelector==='challenge-all')raw.challenge.observedSha256=hash(bytes(event.observed));
    }
  }
  mutateRaw?.(raw);
  // Keep measured launch bytes consistent for independently selected invalid
  // mount fixtures; fail on contradictory runtime proof rather than stale hash.
  if(JSON.stringify(raw.mounts)!==JSON.stringify(records[id].mounts)) {
    const ref=raw.launch.record,event=JSON.parse(documents.get(ref.path));event.observed.mountInventorySha256=hash(bytes(raw.mounts));
    const pin=await set(ref.path,event);changedSelection.rawEvidence[ref.path]=pin;ref.sha256=pin;raw.launch.recordSha256=pin;
  }
  const rawName=`raw/${id}.json`,rawPin=await set(rawName,raw);changedSelection.rawEvidence[rawName]=rawPin;
  for(const cmd of changedProofs['linux-compatibility.json'].commands) for(const identity of ['original','derived'])if(cmd[identity].path===rawName)cmd[identity].sha256=rawPin;
  for(const item of changedProofs['data-only-lifecycle.json'].cases)if(item.evidence.path===rawName)item.evidence.sha256=rawPin;
  for(const name of ['linux-compatibility.json','data-only-lifecycle.json'])changedSelection[proofKeys[name]]=await set(name,changedProofs[name]);
  Object.assign(changedProofs['publication.json'],{compatibilitySha256:changedSelection.compatibilitySha256,lifecycleSha256:changedSelection.lifecycleSha256,rawEvidenceSha256:hash(bytes(changedSelection.rawEvidence))});
  changedSelection.publicationSha256=await set('publication.json',changedProofs['publication.json']);
  const candidate=path.join(root,'candidate-rehashed-selection.json');await fs.writeFile(candidate,bytes(changedSelection));
  try{
    await rejects(`${label}; outside pin unchanged`,{selection:candidate},/pin mismatch/);
    await rejects(label,{selection:candidate,selectionSha256:hash(bytes(changedSelection))},pattern);
  }finally{for(const [name,content]of saved)await replace(path.join(evidenceRoot,name),content);}
}
await semanticRawMutation('actual interpreter equals parent','install-original',r=>r.interpreter={...r.parentInterpreter},null,/interpreter|Dispatch/);
await semanticRawMutation('unmeasured read-only mounts','install-original',r=>r.mounts[0].options='rw',null,/mount/);
await semanticRawMutation('scripts executed despite data-only summary','install-original',r=>r.suppression.scripts.executions=1,null,/data-only/);
for(const category of categories) for(const identity of ['original','derived']) {
  await semanticRawMutation(`${category} ${identity} identity mapped to wrong bundle`,`${category}-${identity}`,
    r=>r.runtimeIdentity=identity==='original'?'derived':'original',null,/identity mismatch/);
}
await semanticRawMutation('contradictory duplicate writable mount','install-original',
  r=>r.mounts.push({...r.mounts[0],options:'rw'}),null,/mount/);
await semanticRawMutation('retained dispatch event mismatch','install-original',null,e=>e.observed.bundleSha256='0'.repeat(64),/Dispatch/);
// Each category's lifecycle must measure the frozen derived runtime. Unlike
// a stale phase tamper, these malformed fixtures select actual matching retained
// dispatch bytes, raw references, lifecycle/publication and candidate pins.
// The unchanged outside anchor rejects first; separate invalid selection then
// must reach the lifecycle-specific derived-runtime rule itself.
for(const category of categories) {
  await semanticRawMutation(`${category} lifecycle original runtime identity`,`${category}-readonly`,
    r=>r.runtimeIdentity='original',null,/Whole-lifecycle evidence does not measure the frozen derived runtime/);
  await semanticRawMutation(`${category} lifecycle unrelated bundle with matching retained dispatch`,`${category}-readonly`,
    null,(event,raw)=>{
      raw.bundleSha256=hash(Buffer.from(`unrelated documentary lifecycle bundle ${category}`));
      assert.notEqual(raw.bundleSha256,profile.derivedBundleSha256);
      event.observed.bundleSha256=raw.bundleSha256;
    },/Whole-lifecycle evidence does not measure the frozen derived runtime/,'dispatch');
}

for(const scenario of scenarios) {
  await semanticRawMutation(`incomplete measured ${scenario} challenge`,`install-${scenario}`,null,e=>{
    if(['readonly','tamper','redirection','replacement'].includes(scenario))e.observed.afterSha256='0'.repeat(64);
    else if(['data-only','script-suppression','hook-suppression','preload-suppression'].includes(scenario))e.observed.executions=1;
    else if(scenario==='concurrency')e.observed.completedInvocationIds.pop();
    else if(scenario==='delegation')e.observed.unobservedChildren=1;
    else if(scenario==='partial')e.observed.receiptEligible=true;
    else e.observed.descendantsRemaining=1;
  },/containment|suppression|completion|interpreter|cleanup|Partial/);
}
// The scenario must measure its own operation. A script attempt cannot prove
// hook/preload suppression; generic write denial cannot prove redirect/replace.
// Rebind BOTH actual retained events, the raw observation digest, every summary
// and publication pin, then reject with the fixed anchor and separate selection.
for(const category of categories) for(const [scenario,wrongOperation] of [
  ['hook-suppression','script'],['preload-suppression','script'],['replacement','write'],['redirection','write'],
]) {
  await semanticRawMutation(`${category} ${scenario} substituted measured operation`,`${category}-${scenario}`,
    null,event=>event.observed.operation=wrongOperation,/scenario.*operation|operation.*scenario/i,'challenge-all');
}
// Actual Python consumer verifies the same immutable authority/components/proofs.
// Only UID/ancestor metadata is virtualized; all descriptors/inodes/bytes/modes
// and directory containment are real and every normal API rejects fixture scope.
if(values['native-verifier']) {
  const bundle=path.join(root,'consumer');await fs.mkdir(bundle);
  for(const component of components) await fs.cp(componentRoots[component],path.join(bundle,component),{recursive:true,verbatimSymlinks:true});
  await fs.writeFile(path.join(bundle,'authority.json'),authorityBytes,{mode:0o444});
  for(const name of ['linux-compatibility.json','data-only-lifecycle.json'])await fs.writeFile(path.join(bundle,name),documents.get(name),{mode:0o444});
  await seal(bundle);
  const py=`import importlib.util,pathlib,os,stat,json,sys\nspec=importlib.util.spec_from_file_location('guard',sys.argv[1]);g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)\nroot=pathlib.Path(sys.argv[2]);ancestors={(os.lstat(p).st_dev,os.lstat(p).st_ino) for p in root.parents}\nclass Stat:\n def __init__(self,r):\n  self.r=r;self.st_uid=0;self.st_mode=stat.S_IFMT(r.st_mode)|(0o755 if (r.st_dev,r.st_ino) in ancestors else (0o777 if stat.S_ISLNK(r.st_mode) else stat.S_IMODE(r.st_mode)))\n def __getattr__(self,n):return getattr(self.r,n)\nclass Metadata:\n def __getattr__(self,n):return getattr(os,n)\n def fstat(self,f):return Stat(os.fstat(f))\n def stat(self,*a,**k):return Stat(os.stat(*a,**k))\n def lstat(self,*a,**k):return Stat(os.lstat(*a,**k))\ng.os=Metadata()\na=json.load(open(root/'authority.json'));args=[str(root),sys.argv[3],a['profileSha256'],a['imageId'],a['imageDigest'],'node/bin/node','/usr/local/bin/node','pnpm','/usr/local/lib/pnpm']\nassert g.verify(args,source_fixture=True)==a\ntry:g.verify(args)\nexcept(ValueError,OSError,KeyError,TypeError):pass\nelse:raise AssertionError('Fixture reached normal Python verifier')\nselected=root/'authority.json';original=selected.read_bytes()
changed=dict(a);changed['productionEligible']=True
try:
 selected.chmod(0o644);selected.write_text(json.dumps(changed));selected.chmod(0o444)
 repinned=list(args);repinned[1]=__import__('hashlib').sha256(selected.read_bytes()).hexdigest()
 try:g.verify(repinned,source_fixture=True)
 except(ValueError,OSError,KeyError,TypeError):pass
 else:raise AssertionError('True-eligible source fixture reached actual native pure seam')
 try:g.verify(repinned)
 except(ValueError,OSError,KeyError,TypeError):pass
 else:raise AssertionError('Relabeled fixture reached normal native path')
finally:
 selected.chmod(0o644);selected.write_bytes(original);selected.chmod(0o444)
assert g.verify(args,source_fixture=True)==a
print('actual-native-consumer PASSED')\n`;
  assert(execFileSync('python3',['-B','-c',py,path.resolve(values['native-verifier']),bundle,hash(authorityBytes)],{encoding:'utf8'}).includes('PASSED'));
  passed.push('actual Python native verify fixture roundtrip; normal path rejects');
}
await verifyIssuedAuthority({...options,authority:options.output,authoritySha256:hash(authorityBytes)},settings);
assert.deepEqual(await fs.readFile(profilePath),frozenProfile);
await fs.writeFile(path.join(root,'fixture-summary.json'),bytes({revision,profileSha256:hash(frozenProfile),authoritySha256:hash(authorityBytes),selectionSha256:hash(selectedBytes),rawLeaves:Object.keys(selection.rawEvidence).length,results:passed}));
console.log(JSON.stringify({state:'PASSED',scope:'full-native-authority-production-format-source-fixture',root,revision,cases:passed.length,results:passed,
  authoritySha256:hash(authorityBytes),profileSha256:hash(frozenProfile),rawLeaves:Object.keys(selection.rawEvidence).length,
  completeDocumentaryCompatibilityCategories:3,completeDocumentaryLifecycleCases:42,productionEligible:false,linuxProcessProof:false,productionProof:false,
  executingUid:process.getuid?.()??null,productionDirectoryAncestry:process.platform==='linux'?'PASSED':'UNSUPPORTED_LOCAL_PLATFORM'}));
