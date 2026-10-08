// Bounded offline issuance. The outside owner selects every byte pin before
// invocation. This validates retained future evidence; it runs no worker/tool.
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authenticateImplementation, budgets, consumerFiles, digestPattern, hashFile,
  inventory, jsonBytes, readPinnedJson, relativeName, requireValue, sha256, verifyReadOnly } from '../vitest-release/files.mjs';
import { packageRelease } from '../vitest-release/package.mjs';
import { validateAuthority, aliasDigest } from './runtime.mjs';
import { EMPTY_SHA256 } from './data-only.mjs';
import { transformPnpm, delegationSourceFacts, ORIGINAL_PNPM_ARCHIVE, ORIGINAL_PNPM_BUNDLE } from './transform.mjs';

const categories=['install','update','dedupe'];
export const lifecycleScenarios=['readonly','data-only','concurrency','delegation','term','int','kill','partial',
  'tamper','redirection','replacement','script-suppression','hook-suppression','preload-suppression'];
const components=['checker','helper','toolchain','observation'];
const proofFiles={compatibility:'linux-compatibility.json',lifecycle:'data-only-lifecycle.json',
  publication:'publication.json',inventories:'inventories.json',image:'image.json',aliases:'aliases.json'};
function canonical(value) {
  if(Array.isArray(value)) return value.map(canonical);
  if(value && typeof value==='object') return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
}
function same(a,b,message) { requireValue(JSON.stringify(canonical(a))===JSON.stringify(canonical(b)),message); }
function binding(document,selection,profile) {
  requireValue(document.schemaVersion===1 && document.qualificationContractRevision===2 && document.trustScope===selection.trustScope &&
    document.sourceRevision===selection.transformRevision && document.profileSha256===selection.profileSha256 &&
    document.originalArchiveSha256===profile.originalArchiveSha256 &&
    document.originalBundleSha256===profile.originalBundleSha256 &&
    document.derivedBundleSha256===profile.derivedBundleSha256 &&
    document.imageId===selection.imageId && document.imageDigest===selection.imageDigest,
    'Evidence does not bind unchanged profile/source/image');
}
async function readEvidence(options,selection,name) {
  return readPinnedJson(path.join(options.evidenceRoot,proofFiles[name]),selection[`${name}Sha256`],
    ['compatibility','lifecycle'].includes(name)?65_536:16_777_216);
}
async function retainedEvent(options,selection,reference,profile,used) {
  relativeName(reference.path);
  requireValue(digestPattern.test(reference.sha256)&&selection.rawEvidence[reference.path]===reference.sha256,
    'Retained event absent from outside selected byte closure');
  used.add(reference.path);
  const {document:event}=await readPinnedJson(path.join(options.evidenceRoot,reference.path),reference.sha256,65_536);
  binding(event,selection,profile);
  return event;
}
function challengeObservation(scenario,event,raw,profile) {
  const observed=event.observed;
  requireValue(observed&&typeof observed==='object','Missing measured challenge outcome');
  // Generic data-only measures one executable-input class; named suppression scenarios require their specific operations.
  const operation={readonly:'write',tamper:'write',redirection:'redirect',replacement:'replace',
    'script-suppression':'script','hook-suppression':'hook','preload-suppression':'preload'}[scenario];
  if(operation)requireValue(observed.operation===operation,'Challenge operation does not match scenario');
  if(['readonly','tamper','redirection','replacement'].includes(scenario)) {
    requireValue(['write','replace','redirect'].includes(observed.operation)&&['EACCES','EPERM','EROFS'].includes(observed.errorCode)&&
      digestPattern.test(observed.beforeSha256)&&observed.beforeSha256===observed.afterSha256&&
      observed.targetInventorySha256===raw.mounts.find(mount=>mount.component==='observation').inventorySha256,
      'Tamper/redirection/replacement containment is not measured');
  } else if(['data-only','script-suppression','hook-suppression','preload-suppression'].includes(scenario)) {
    requireValue(['script','hook','preload','configuration'].includes(observed.operation)&&
      digestPattern.test(observed.attemptedSha256)&&observed.executions===0&&observed.guardSha256===EMPTY_SHA256,
      'Executable input suppression is not measured');
  } else if(scenario==='concurrency') {
    requireValue(Array.isArray(observed.invocationIds)&&observed.invocationIds.length>=2&&observed.invocationIds.length<=16&&
      new Set(observed.invocationIds).size===observed.invocationIds.length&&observed.invocationIds.includes(raw.invocationId)&&
      Array.isArray(observed.receiptPaths)&&new Set(observed.receiptPaths).size===observed.invocationIds.length&&
      observed.receiptPaths.length===observed.invocationIds.length, 'Concurrent receipt isolation is incomplete');
    same([...observed.completedInvocationIds].sort(),[...observed.invocationIds].sort(),'Concurrent completion mismatch');
    for(const name of observed.receiptPaths)relativeName(name);
  } else if(['term','int','kill'].includes(scenario)) {
    const [signal,code]={term:['SIGTERM',143],int:['SIGINT',130],kill:['SIGKILL',137]}[scenario];
    requireValue(observed.signal===signal&&raw.outcome.signal===signal&&raw.outcome.exitCode===code&&
      observed.descendantsRemaining===0&&observed.receiptEligible===false,'Signal or descendant cleanup evidence incomplete');
  } else if(scenario==='partial') {
    requireValue(observed.terminalState==='partial'&&observed.receiptEligible===false&&observed.descendantsRemaining===0&&
      observed.completedNativeCommands===0,'Partial invocation incorrectly qualified');
  }
}
// Delegation is an expected-negative qualification case, not a successful
// native receipt. All measurements remain outside-selected retained bytes.
function nativeOutcome(value) {
  return value && Number.isInteger(value.exitCode) && value.exitCode >= 0 && value.exitCode <= 255 &&
    (value.signal === null || ['SIGTERM','SIGINT','SIGKILL'].includes(value.signal));
}
async function measuredPhase(options, selection, raw, profile, used, phase) {
  const reference = raw[phase];
  requireValue(reference && reference.invocationId === raw.invocationId && Number.isSafeInteger(reference.sequence) &&
    reference.sequence >= 0 && digestPattern.test(reference.recordSha256) &&
    reference.record?.sha256 === reference.recordSha256, 'Missing bounded retained delegation phase');
  const event = await retainedEvent(options, selection, reference.record, profile, used);
  requireValue(event.invocationId === raw.invocationId && event.phase === phase && event.scenario === raw.scenario &&
    event.sequence === reference.sequence && event.observed && typeof event.observed === 'object' &&
    event.observed.nativePid === raw.nativePid, 'Delegation phase process/identity correlation mismatch');
  return event.observed;
}
// A descendants summary cannot establish a child's native terminal outcome.
// Correlate it with separately retained, outside-selected child event bytes.
async function childTerminal(options, selection, raw, profile, used, child) {
  const reference = child.terminal;
  requireValue(reference && Object.keys(reference).sort().join(',') === 'invocationId,record,recordSha256,sequence' &&
    reference.invocationId === child.invocationId && Number.isSafeInteger(reference.sequence) &&
    reference.sequence >= 0 && digestPattern.test(reference.recordSha256) &&
    reference.record && Object.keys(reference.record).sort().join(',') === 'path,sha256' &&
    reference.record.sha256 === reference.recordSha256, 'Missing bounded retained child terminal');
  const event = await retainedEvent(options, selection, reference.record, profile, used);
  requireValue(event.invocationId === child.invocationId && event.phase === 'childTerminal' &&
    event.scenario === raw.scenario && event.sequence === reference.sequence,
    'Retained child terminal invocation/phase mismatch');
  const observed = event.observed;
  requireValue(observed && Object.keys(observed).sort().join(',') ===
    'childInvocationId,cliEligible,cliSha256,completed,identityUnchanged,independentlyObserved,interpreter,launchSequence,outcome,parentInvocationId,parentPid,pid' &&
    observed.independentlyObserved === true && observed.childInvocationId === child.invocationId &&
    observed.parentInvocationId === raw.invocationId && observed.pid === child.pid &&
    observed.parentPid === raw.nativePid && observed.parentPid === child.parentPid &&
    Number.isSafeInteger(observed.launchSequence) && raw.rejection.sequence < observed.launchSequence &&
    observed.launchSequence < event.sequence && event.sequence <= raw.nativeTerminal.sequence &&
    event.sequence < raw.descendants.sequence && observed.cliSha256 === child.cliSha256 &&
    observed.cliEligible === false && observed.completed === true && observed.identityUnchanged === true &&
    nativeOutcome(observed.outcome), 'Independent child terminal identity/outcome/order mismatch');
  same(observed.interpreter, child.interpreter, 'Retained child terminal held interpreter mismatch');
  same(observed.outcome, child.outcome, 'Retained child terminal outcome differs from descendants summary');
}
async function delegationAccounting(options, selection, raw, profile, used, terminal, absence) {
  requireValue(Number.isSafeInteger(raw.nativePid) && raw.nativePid > 1, 'Actual native process identity required');
  const descendants = await measuredPhase(options, selection, raw, profile, used, 'descendants');
  const cleanup = await measuredPhase(options, selection, raw, profile, used, 'cleanup');
  requireValue(terminal.sequence < raw.descendants.sequence && raw.descendants.sequence < raw.cleanup.sequence &&
    descendants.independentlyObserved === true && descendants.observationStartSequence === raw.launch.sequence &&
    descendants.observationEndSequence === terminal.sequence && descendants.unobservedChildren === 0 &&
    Array.isArray(descendants.children) && descendants.children.length <= 16,
    'Independent whole-lifecycle descendant accounting is incomplete');
  const children = descendants.children;
  requireValue(new Set(children.map(child => child.pid)).size === children.length &&
    new Set(children.map(child => child.invocationId)).size === children.length, 'Duplicate observed child identity');
  requireValue(new Set(children.map(child => child.terminal?.sequence)).size === children.length &&
    new Set(children.map(child => child.terminal?.record?.path)).size === children.length,
    'Duplicate retained child terminal reference/order');
  for (const child of children) {
    requireValue(child && Object.keys(child).sort().join(',') ===
      'cliEligible,cliSha256,completed,identityUnchanged,interpreter,invocationId,outcome,parentInvocationId,parentPid,pid,terminal' &&
      typeof child.invocationId === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(child.invocationId) &&
      child.invocationId !== raw.invocationId && child.parentInvocationId === raw.invocationId &&
      Number.isSafeInteger(child.pid) && child.pid > 1 && child.pid !== raw.nativePid && child.parentPid === raw.nativePid &&
      child.completed === true && child.identityUnchanged === true && nativeOutcome(child.outcome) &&
      child.interpreter?.identitySource === '/proc/self/exe' &&
      child.cliEligible === false && child.cliSha256 === raw.challenge?.attemptedCliSha256 &&
      child.cliSha256 !== profile.derivedBundleSha256, 'Unowned/replaced/incomplete or uncorrelated child evidence');
    same(child.interpreter, raw.interpreter, 'Observed child interpreter differs from held interpreter');
    await childTerminal(options, selection, raw, profile, used, child);
  }
  requireValue(cleanup.independentlyObserved === true && cleanup.descendantsRemaining === 0 &&
    Array.isArray(cleanup.completedInvocationIds) && cleanup.completedInvocationIds.length === children.length &&
    new Set(cleanup.completedInvocationIds).size === children.length, 'Independent descendant cleanup missing');
  same([...cleanup.completedInvocationIds].sort(), children.map(child => child.invocationId).sort(),
    'Cleanup does not account for every observed child');
  if (absence) {
    requireValue(children.length === 0, 'Same-version switch-child absence contradicted by observed children');
    const observed = await measuredPhase(options, selection, raw, profile, used, 'delegationAbsence');
    requireValue(raw.completion.sequence < raw.delegationAbsence.sequence && raw.delegationAbsence.sequence < raw.descendants.sequence &&
      observed.requestedVersion === '11.17.0' && observed.resolvedVersion === '11.17.0' &&
      observed.switchCliChildren === 0 && observed.observationStartSequence === raw.launch.sequence &&
      observed.observationEndSequence === raw.completion.sequence &&
      observed.sourceFlowSha256 === sha256(jsonBytes(profile.delegationSource)),
      'Same-version absence lacks full-lifecycle/source-bound measurements');
  }
}
async function delegationRejection(options, selection, raw, profile, used) {
  requireValue(raw.state === 'unsupported' && raw.receiptEligible === false && raw.caseVerdict === 'expected-negative' &&
    !('dispatch' in raw) && !('completion' in raw) && !('childInvocationId' in raw) &&
    raw.challenge?.kind === 'delegation' && raw.challenge.result === 'expected-negative' &&
    digestPattern.test(raw.challenge.inputSha256) && digestPattern.test(raw.challenge.attemptedCliSha256) &&
    raw.challenge.attemptedCliSha256 !== profile.derivedBundleSha256 &&
    raw.challenge.attemptedCliSha256 !== profile.originalBundleSha256,
    'Delegation rejection cannot invent normal phases or qualify native execution');
  const rejected = await measuredPhase(options, selection, raw, profile, used, 'rejection');
  const terminal = await measuredPhase(options, selection, raw, profile, used, 'nativeTerminal');
  requireValue(raw.launch.sequence < raw.rejection.sequence && raw.rejection.sequence < raw.nativeTerminal.sequence &&
    rejected.state === 'unsupported' && rejected.reason === 'unowned-delegation' &&
    rejected.interpreterSha256 === raw.interpreter.sha256 && rejected.bundleSha256 === raw.bundleSha256 &&
    terminal.independentlyObserved === true && terminal.interpreterSha256 === raw.interpreter.sha256 &&
    terminal.bundleSha256 === raw.bundleSha256 && terminal.exitCode === raw.outcome.exitCode &&
    terminal.signal === raw.outcome.signal && terminal.lockSha256 === raw.lockSha256,
    'Authentic rejection and independent native terminal correlation are required');
  await delegationAccounting(options, selection, raw, profile, used, raw.nativeTerminal, false);
}
// Every raw record is selected outside the PR too. A summary boolean or a
// SHA-shaped self-selected receipt cannot replace its measured launch,
// dispatch, completion, interpreter, mounts and suppression observations.
async function rawEvidence(options,selection,reference,profile,category,used,scenario=null) {
  relativeName(reference.path);
  requireValue(digestPattern.test(reference.sha256) && selection.rawEvidence[reference.path]===reference.sha256,
    'Raw evidence is absent from independent selection');
  used.add(reference.path);
  const {document:raw}=await readPinnedJson(path.join(options.evidenceRoot,reference.path),reference.sha256,65_536);
  binding(raw,selection,profile);
  requireValue(raw.platform==='linux' && raw.category===category && raw.scenario===scenario &&
    typeof raw.invocationId==='string' && /^[A-Za-z0-9._-]{1,128}$/.test(raw.invocationId), 'Missing raw invocation identity');
  const negative = scenario === 'delegation';
  requireValue(negative ? raw.evidenceVariant === 'delegation-rejection' : !('evidenceVariant' in raw),
    'Unknown or incompatible raw evidence variant');
  const phases = negative ? ['launch'] : ['launch','dispatch','completion'];
  for(const phase of phases) {
    const phaseRecord=raw[phase];
    requireValue(phaseRecord && phaseRecord.invocationId===raw.invocationId && Number.isSafeInteger(phaseRecord.sequence) &&
      phaseRecord.sequence>=0 && digestPattern.test(phaseRecord.recordSha256) &&
      phaseRecord.record?.sha256===phaseRecord.recordSha256,'Phase digest does not bind retained event bytes');
    const event=await retainedEvent(options,selection,phaseRecord.record,profile,used);
    requireValue(event.invocationId===raw.invocationId&&event.phase===phase&&event.sequence===phaseRecord.sequence&&
      (!(negative || scenario==='delegation-same-version') || event.scenario===raw.scenario),
      'Retained phase identity/order mismatch');
    const observed=event.observed;
    requireValue(observed&&typeof observed==='object','Missing raw measured phase observation');
    if(negative || scenario==='delegation-same-version') requireValue(observed.nativePid===raw.nativePid,
      'Delegation normal phase native PID mismatch');
    if(phase==='launch') {
      requireValue(observed.parentInterpreterSha256===raw.parentInterpreter.sha256&&
        observed.mountInventorySha256===sha256(jsonBytes(raw.mounts)),'Launch interpreter/mount measurement mismatch');
      if(negative || scenario === 'delegation-same-version') requireValue(observed.nativePid===raw.nativePid &&
        observed.interpreterSha256===raw.interpreter.sha256 && observed.bundleSha256===raw.bundleSha256,
        'Delegation launch process/runtime identity mismatch');
    }
    if(phase==='dispatch') requireValue(observed.interpreterSha256===raw.interpreter.sha256&&
      observed.bundleSha256===raw.bundleSha256&&observed.dataOnlyGuardSha256===EMPTY_SHA256,'Dispatch measured identity mismatch');
    if(phase==='completion') requireValue(observed.exitCode===raw.outcome.exitCode&&observed.signal===raw.outcome.signal&&
      observed.lockSha256===raw.lockSha256&&observed.descendantsRemaining===0,'Completion outcome/lock/cleanup mismatch');
  }
  if(!negative) requireValue(raw.launch.sequence<raw.dispatch.sequence && raw.dispatch.sequence<raw.completion.sequence,
    'Raw lifecycle ordering incomplete');
  requireValue(raw.interpreter && digestPattern.test(raw.interpreter.sha256) &&
    /^\d+\.\d+\.\d+$/.test(raw.interpreter.version) && /^\/[A-Za-z0-9/._-]+$/.test(raw.interpreter.path) &&
    raw.interpreter.identitySource==='/proc/self/exe' && raw.parentInterpreter &&
    /^\d+\.\d+\.\d+$/.test(raw.parentInterpreter.version) && /^\/[A-Za-z0-9/._-]+$/.test(raw.parentInterpreter.path) &&
    raw.parentInterpreter.identitySource==='/proc/self/exe' && digestPattern.test(raw.parentInterpreter.sha256) &&
    raw.parentInterpreter.sha256!==raw.interpreter.sha256, 'Actual different interpreter identities required');
  requireValue(Array.isArray(raw.mounts) && raw.mounts.length===components.length &&
    new Set(raw.mounts.map(mount=>mount.component)).size===components.length &&
    raw.mounts.every(mount=>components.includes(mount.component) && mount.options==='ro' &&
      digestPattern.test(mount.inventorySha256) && mount.inventorySha256===selection.componentInventorySha256[mount.component]),
    'Missing complete measured read-only runtime mounts');
  requireValue(raw.suppression && ['scripts','hooks','preload','configuration'].every(kind=>
    raw.suppression[kind]?.attemptedSha256 && digestPattern.test(raw.suppression[kind].attemptedSha256) &&
    raw.suppression[kind].executions===0 && raw.suppression[kind].guardSha256===EMPTY_SHA256),
    'Whole-lifecycle data-only observations required');
  requireValue(raw.lock && digestPattern.test(raw.lock.sha256) && raw.lock.sha256===raw.lockSha256 &&
    selection.rawEvidence[raw.lock.path]===raw.lock.sha256, 'Independently selected concrete lock bytes required');
  relativeName(raw.lock.path); used.add(raw.lock.path);
  const lockIdentity=await hashFile(path.join(options.evidenceRoot,raw.lock.path),2_097_152);
  requireValue(lockIdentity.sha256===raw.lock.sha256,'Selected lock bytes changed');
  const lockBytes=await fs.readFile(path.join(options.evidenceRoot,raw.lock.path));
  requireValue(sha256(lockBytes)===raw.lock.sha256,'Lock bytes changed while reading');
  requireValue(digestPattern.test(raw.lockSha256) && raw.outcome &&
    Number.isInteger(raw.outcome.exitCode) && raw.outcome.exitCode>=0 && raw.outcome.exitCode<=255 &&
    (raw.outcome.signal===null||['SIGTERM','SIGINT','SIGKILL'].includes(raw.outcome.signal)), 'Missing native lock/outcome');
  if(scenario && !negative && scenario!=='delegation-same-version') requireValue(raw.challenge && raw.challenge.kind===scenario &&
    digestPattern.test(raw.challenge.inputSha256) && digestPattern.test(raw.challenge.observedSha256) &&
    raw.challenge.result==='contained' && Array.isArray(raw.challenge.events) && raw.challenge.events.length>=2 &&
    raw.challenge.events.length<=64 && raw.challenge.events.every(event=>
      Number.isInteger(event.sequence)&&event.sequence>=0&&digestPattern.test(event.sha256)), 'Missing raw negative/lifecycle challenge');
  if(scenario && !negative && scenario!=='delegation-same-version') for(const reference of raw.challenge.events) {
    const event=await retainedEvent(options,selection,reference,profile,used);
    requireValue(event.invocationId===raw.invocationId&&event.scenario===scenario&&event.sequence===reference.sequence,
      'Retained challenge identity mismatch');
    challengeObservation(scenario,event,raw,profile);
  }
  if(negative) await delegationRejection(options,selection,raw,profile,used);
  if(scenario==='delegation-same-version') await delegationAccounting(options,selection,raw,profile,used,raw.completion,true);
  return {...raw,lockBytes};
}

export async function reconstructAuthority(options,{sourceFixture=false}={}) {
  const {document:selection}=await readPinnedJson(options.selection,options.selectionSha256);
  requireValue(selection.schemaVersion===1 && selection.qualificationContractRevision===2 && ['release-owner','source-fixture'].includes(selection.trustScope) &&
    (selection.trustScope!=='source-fixture'||sourceFixture) && selection.rawEvidence &&
    Object.keys(selection.rawEvidence).length>=categories.length*(2+lifecycleScenarios.length) &&
    Object.keys(selection.rawEvidence).length<=1000, 'Independent bounded authority selection required');
  const expectedEvidence=Object.fromEntries([
    ...Object.entries(selection.rawEvidence),
    ...Object.entries(proofFiles).map(([name,filename])=>[filename,selection[`${name}Sha256`]])]);
  requireValue(Object.keys(expectedEvidence).length===Object.keys(selection.rawEvidence).length+6 &&
    Object.entries(expectedEvidence).every(([name,pin])=>relativeName(name)&&digestPattern.test(pin)),
    'Reserved/invalid retained evidence leaf');
  const physicalEvidence=await inventory(options.evidenceRoot,{count:1006,file:16_777_216,total:67_108_864});
  requireValue(physicalEvidence.length===Object.keys(expectedEvidence).length && physicalEvidence.every(file=>
    file.type==='file'&&expectedEvidence[file.path]===file.sha256), 'Complete physical evidence closure differs from independent selection');
  const {document:preparation}=await readPinnedJson(options.provenance,selection.preparationSha256);
  const {document:profile}=await readPinnedJson(options.profile,selection.profileSha256);
  requireValue(preparation.qualificationContractRevision===2 && profile.qualificationContractRevision===2 && profile.productionEligible===false && profile.provenanceClass==='authenticated-preparation' &&
    profile.trustScope===selection.trustScope && preparation.trustScope===selection.trustScope &&
    profile.sourceRevision===selection.sourceRevision && preparation.sourceRevision===selection.sourceRevision &&
    profile.transformRevision===selection.transformRevision && preparation.transform.revision===selection.transformRevision &&
    profile.preparationSha256===selection.preparationSha256, 'Profile must be frozen by selected preparation before proof');
  same(profile.containingTransform,preparation.transform,'Containing transform mismatch');
  const executingRoot=fileURLToPath(new URL('../../',import.meta.url)).replace(/\/$/,'');
  const nativeNames=['scripts/vitest-native-prepare.mjs',
    ...(await fs.readdir(fileURLToPath(new URL('./',import.meta.url)))).filter(name=>name.endsWith('.mjs')).map(name=>`scripts/vitest-native/${name}`),
    'scripts/vitest-release/archive.mjs','scripts/vitest-release/files.mjs'].sort();
  await authenticateImplementation(options.sourceRoot,executingRoot,preparation.transform,nativeNames);
  await authenticateImplementation(options.sourceRoot,executingRoot,selection.issuer,
    [...nativeNames,'scripts/vitest-native-authority.mjs','scripts/vitest-release.mjs','scripts/vitest-release/package.mjs'].sort());
  requireValue(selection.issuer.revision===selection.transformRevision, 'Uncontained authority issuer');
  requireValue(profile.receiptDirectory==='/opt/renovate-native-receipts' &&
    profile.contextFile==='/opt/renovate-native-context/context.json','Unsupported deployed profile paths');
  same(profile.dataOnlyProfile,{path:'empty-pnpmfile.mjs',sha256:EMPTY_SHA256,
    configPrecedence:'pnpm-11.17-env-after-workspace',configDependencies:'absent'},'Data-only profile mismatch');
  // Authenticate complete original stock artifacts and source with the same
  // outside selection contract, rather than trusting a prepared inventory.
  requireValue(selection.stock && digestPattern.test(selection.stock.provenanceSha256) &&
    digestPattern.test(selection.stock.selectionSha256) && digestPattern.test(selection.stock.releaseSha256), 'Original stock selection required');
  await packageRelease('verify',{provenance:options.stockProvenance,'provenance-sha256':selection.stock.provenanceSha256,
    selection:options.stockSelection,'selection-sha256':selection.stock.selectionSha256,'artifact-root':options.artifactRoot,
    'source-root':options.sourceRoot,output:options.stockRoot,sourceFixture});
  requireValue((await hashFile(path.join(options.stockRoot,'release.json'),16_777_216)).sha256===selection.stock.releaseSha256,
    'Outside stock receipt mismatch');
  const evidence={};
  for(const name of Object.keys(proofFiles)) evidence[name]=await readEvidence(options,selection,name);
  const used=new Set();
  const {document:compatibility}=evidence.compatibility;
  const {document:lifecycle}=evidence.lifecycle;
  binding(compatibility,selection,profile); binding(lifecycle,selection,profile);
  requireValue(compatibility.platform==='linux' && compatibility.completeInstallUpdateDedupeCoverage===true &&
    compatibility.originalDerivedLockAndOutcomeEquivalent===true && lifecycle.dataOnlyWholeLifecycle===true &&
    lifecycle.completeInstallUpdateDedupeCoverage===true && lifecycle.emptyPnpmfileSha256===EMPTY_SHA256,
    'Incomplete Linux qualification');
  requireValue(Array.isArray(compatibility.commands)&&compatibility.commands.length===3,
    'Install/update/dedupe evidence required');
  for(const category of categories) {
    const command=compatibility.commands.filter(command=>command.category===category);
    requireValue(command.length===1,'Duplicate or missing compatibility category');
    const original=await rawEvidence(options,selection,command[0].original,profile,category,used);
    const derived=await rawEvidence(options,selection,command[0].derived,profile,category,used);
    requireValue(original.runtimeIdentity==='original'&&derived.runtimeIdentity==='derived'&&
      original.bundleSha256===profile.originalBundleSha256&&derived.bundleSha256===profile.derivedBundleSha256,
      'Original and derived identity mismatch');
    requireValue(original.lockSha256===derived.lockSha256&&original.lockBytes.equals(derived.lockBytes),'Original/derived lock divergence');
    same(original.outcome,derived.outcome,'Original/derived outcome divergence');
  }
  requireValue(Array.isArray(lifecycle.cases)&&lifecycle.cases.length===categories.length*lifecycleScenarios.length,
    'Complete bounded whole-lifecycle cases required');
  for(const category of categories) for(const scenario of lifecycleScenarios) {
    const cases=lifecycle.cases.filter(item=>item.category===category&&item.scenario===scenario);
    requireValue(cases.length===1,'Missing or duplicate whole-lifecycle case');
    const lifecycleRaw=await rawEvidence(options,selection,cases[0].evidence,profile,category,used,scenario);
    requireValue(lifecycleRaw.runtimeIdentity==='derived'&&lifecycleRaw.bundleSha256===profile.derivedBundleSha256,
      'Whole-lifecycle evidence does not measure the frozen derived runtime');
    if(scenario==='delegation') {
      const sameVersion=await rawEvidence(options,selection,cases[0].sameVersion,profile,category,used,'delegation-same-version');
      requireValue(sameVersion.runtimeIdentity==='derived' && sameVersion.bundleSha256===profile.derivedBundleSha256 &&
        sameVersion.invocationId!==lifecycleRaw.invocationId, 'Distinct frozen same-version lifecycle observation required');
    }
  }
  requireValue(used.size===Object.keys(selection.rawEvidence).length && [...used].every(name=>selection.rawEvidence[name]),
    'Unexpected or missing raw evidence inventory leaf');
  const {document:inventories}=evidence.inventories;
  binding(inventories,selection,profile);
  requireValue(Object.keys(inventories.components??{}).sort().join(',')===components.sort().join(','), 'Exactly four complete components required');
  for(const component of components) {
    const root=options.componentRoots[component];
    const actual=consumerFiles(await inventory(root,budgets[component]??budgets.toolchain));
    same(actual,inventories.components[component],'Selected complete component inventory differs');
    requireValue(sha256(jsonBytes(actual))===selection.componentInventorySha256[component], 'Outside component inventory pin mismatch');
    await verifyReadOnly(root);
    if(component!=='observation') {
      const stock=consumerFiles(await inventory(path.join(options.stockRoot,component),budgets[component]));
      same(actual,stock,'Authority components differ from authenticated original stock');
    }
  }
  requireValue(inventories.components.observation.some(file=>file.path==='profile.json'&&file.sha256===selection.profileSha256),
    'Frozen profile absent from observation inventory');
  const {document:stockPreparation}=await readPinnedJson(options.stockProvenance,selection.stock.provenanceSha256);
  requireValue(stockPreparation.sourceRevision===selection.sourceRevision,'Original checker/helper source revision mismatch');
  const pnpmPackage=stockPreparation.toolchain.pnpmPackage;
  const pnpmPrefix=path.posix.dirname(pnpmPackage);
  const originalInventory=inventories.components.toolchain.filter(file=>file.path.startsWith(pnpmPrefix+'/'))
    .map(file=>({...file,path:file.path.slice(pnpmPrefix.length+1)}));
  same(originalInventory,profile.pnpmFiles,'Frozen full original pnpm inventory mismatch');
  // The selected CLI entry is the original bootstrap. Observation transforms
  // its authenticated dist bundle while retaining that bootstrap contract.
  const originalBytes=await fs.readFile(path.join(options.stockRoot,'toolchain',pnpmPrefix,'dist/pnpm.mjs'));
  same(profile.delegationSource,delegationSourceFacts(originalBytes),'Frozen authenticated delegation source facts differ');
  const derivedBytes=transformPnpm(originalBytes);
  requireValue(profile.originalArchiveSha256===ORIGINAL_PNPM_ARCHIVE && profile.originalBundleSha256===ORIGINAL_PNPM_BUNDLE &&
    sha256(derivedBytes)===profile.derivedBundleSha256,'Frozen original/derived transform mismatch');
  same(profile.derivedFiles,profile.pnpmFiles.map(file=>file.path==='dist/pnpm.mjs'?{...file,sha256:sha256(derivedBytes)}:file),
    'Complete derived pnpm inventory mismatch');
  requireValue(inventories.components.observation.some(file=>file.path==='derived-pnpm.mjs'&&file.sha256===sha256(derivedBytes)),
    'Authenticated derived runtime missing');
  requireValue(Array.isArray(profile.instrumentationFiles)&&profile.instrumentationFiles.length===8&&
    new Set(profile.instrumentationFiles.map(file=>file.path)).size===8 &&
    ['transform.mjs','identity.mjs','probe.mjs','collector.mjs','loader.mjs','runtime.mjs','data-only.mjs','empty-pnpmfile.mjs']
      .every(name=>profile.instrumentationFiles.some(file=>file.path===name)), 'Complete selected instrumentation closure required');
  same(profile.transformFiles,profile.instrumentationFiles,'Frozen instrumentation inventory mismatch');
  requireValue(inventories.components.observation.length===10,'Unexpected observation leaf');
  for(const file of profile.instrumentationFiles) {
    const selected=preparation.transform.files.find(leaf=>leaf.path===`scripts/vitest-native/${file.path}`);
    requireValue(file.path==='empty-pnpmfile.mjs'?file.sha256===EMPTY_SHA256:selected?.sha256===file.sha256,
      'Instrumentation is not selected containing implementation');
    requireValue(inventories.components.observation.some(leaf=>leaf.path===file.path&&leaf.sha256===file.sha256),
      'Complete observation instrumentation missing');
  }
  const {document:image}=evidence.image, {document:aliases}=evidence.aliases, {document:publication}=evidence.publication;
  binding(image,selection,profile); binding(aliases,selection,profile); binding(publication,selection,profile);
  requireValue(image.immutableImageId===selection.imageId&&image.immutableImageDigest===selection.imageDigest&&
    image.componentInventorySha256,
    'Immutable measured image selection mismatch');
  same(image.componentInventorySha256,selection.componentInventorySha256,'Image complete inventory mismatch');
  requireValue(Array.isArray(aliases.nativeAliases)&&aliases.nativeAliases.length===2&&Array.isArray(image.nativeAliases)&&image.nativeAliases.length===2,
    'Exactly two independently measured image aliases required');
  same(aliases.nativeAliases,image.nativeAliases,'Selected aliases differ from measured original image');
  for(const alias of aliases.nativeAliases) requireValue(alias.sha256===alias.originalImageSha256&&
    alias.sha256===aliasDigest(alias,inventories.components.toolchain), 'Aliases differ from authenticated original toolchain');
  requireValue(publication.preparationSha256===selection.preparationSha256 && publication.compatibilitySha256===selection.compatibilitySha256 &&
    publication.lifecycleSha256===selection.lifecycleSha256 && publication.inventoriesSha256===selection.inventoriesSha256 &&
    publication.imageSha256===selection.imageSha256 && publication.aliasesSha256===selection.aliasesSha256 &&
    publication.issuerRevision===selection.issuer.revision && publication.rawEvidenceSha256===sha256(jsonBytes(selection.rawEvidence)),
    'Independent publication attestation chain incomplete');
  const origin=new URL(publication.immutableOrigin);
  requireValue(origin.protocol==='https:'&&!origin.username&&!origin.password&&!origin.search&&!origin.hash,
    'Invalid selected publication locator');
  const authority={schemaVersion:1,qualificationContractRevision:2,trustScope:selection.trustScope,productionEligible:selection.trustScope==='release-owner',
    sourceRevision:selection.sourceRevision,transformRevision:selection.transformRevision,
    originalArchiveSha256:profile.originalArchiveSha256,originalBundleSha256:profile.originalBundleSha256,
    derivedBundleSha256:profile.derivedBundleSha256,profileSha256:selection.profileSha256,
    imageId:selection.imageId,imageDigest:selection.imageDigest,attestationOrigin:publication.immutableOrigin,
    linuxCompatibilitySha256:selection.compatibilitySha256,dataOnlyLifecycleSha256:selection.lifecycleSha256,
    components:inventories.components,nativeAliases:aliases.nativeAliases};
  validateAuthority(authority,{sourceFixture});
  return {authority,bytes:jsonBytes(authority),compatibility:evidence.compatibility.bytes,lifecycle:evidence.lifecycle.bytes};
}
export async function issueAuthority(options,settings={}) {
  const reconstructed=await reconstructAuthority(options,settings);
  // Issuance emits only a new receipt. It cannot rewrite any qualified input.
  requireValue(path.isAbsolute(options.output),'Absolute new authority file required');
  await fs.writeFile(options.output,reconstructed.bytes,{flag:'wx',mode:0o444});
  return {authoritySha256:sha256(reconstructed.bytes),productionEligible:reconstructed.authority.productionEligible};
}
export async function verifyIssuedAuthority(options,settings={}) {
  const expected=await reconstructAuthority(options,settings);
  const {bytes}=await readPinnedJson(options.authority,options.authoritySha256,8_388_608);
  requireValue(bytes.equals(expected.bytes),'Issued authority does not reconstruct from outside selection');
  return {verified:true,authoritySha256:sha256(bytes),productionEligible:expected.authority.productionEligible};
}
