#!/usr/bin/env node
// Complete stock production FORMAT; all trust is explicitly test-only and ineligible.
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { createStockFixture, hash, bytes, replace, fixtureGit } from './test-vitest-production-fixture.mjs';
const {values}=parseArgs({options:{archives:{type:'string'},platform:{type:'string'},'require-linux':{type:'boolean'},'stage-module':{type:'string'}}});
const fixture=await createStockFixture(values);
const {root,options,module,receipt,receiptBytes,revision,preparation,selectionDocument}=fixture;
const candidatePreparation=structuredClone(preparation);
delete candidatePreparation.packager;delete candidatePreparation.trustScope;candidatePreparation.attestationOrigin=null;
const candidateProvenance=path.join(root,'candidate-preparation.json');await fs.writeFile(candidateProvenance,bytes(candidatePreparation));
const candidateOptions={...options,candidate:true,provenance:candidateProvenance,'provenance-sha256':hash(bytes(candidatePreparation)),output:path.join(root,'candidate-stock')};
const candidateBuilt=await module.packageRelease('build',candidateOptions);assert.equal(candidateBuilt.productionEligible,false);
const candidateReceipt=JSON.parse(await fs.readFile(path.join(candidateOptions.output,'release.json')));
assert.equal(candidateReceipt.productionEligible,false);assert.equal(candidateReceipt.packager.revision,null);
assert.equal(candidateReceipt.provenanceClass,'unpublished-candidate');assert.equal(candidateReceipt.attestationOrigin,null);
await module.packageRelease('verify',candidateOptions);
const passed=['complete authentic stock build/finalize/separate verify with same immutable receipt'];
passed.push('legacy candidate retains false eligibility/null pending packager/attestation');
async function rejects(label, changes, pattern) {
  await assert.rejects(module.packageRelease('verify',{...options,...changes}),pattern);passed.push(label);
}
await rejects('wrong independent preparation pin',{'provenance-sha256':'0'.repeat(64)},/pin mismatch/);
await rejects('missing independent selection pin',{'selection-sha256':undefined},/pin required/);
await rejects('wrong independent selection pin',{'selection-sha256':'0'.repeat(64)},/pin mismatch/);
await rejects('fixture cannot authorize normal producer',{sourceFixture:false},/Fixture|Production/);
const cliOptions=['provenance','provenance-sha256','selection','selection-sha256','source-root','artifact-root','output']
  .flatMap(name=>[`--${name}`,options[name]]);
const liveCli=spawnSync(process.execPath,[path.join(fixture.sourceRoot,'scripts/vitest-release.mjs'),'verify',...cliOptions],{encoding:'utf8'});
assert.equal(liveCli.status,1);assert.notEqual(liveCli.stderr,'');passed.push('normal stock CLI cannot accept fixture authority');
const cli=execFileSync(process.execPath,[path.join(fixture.sourceRoot,'scripts/vitest-release.mjs'),'--help'],{encoding:'utf8'});
assert(!cli.includes('--source-fixture'));
async function selectedMutation(label, mutate, pattern) {
  const changed=structuredClone(selectionDocument);mutate(changed);
  const filename=path.join(root,`selection-${passed.length}.json`);await fs.writeFile(filename,bytes(changed));
  await rejects(label,{selection:filename,'selection-sha256':hash(bytes(changed))},pattern);
}
await selectedMutation('missing independently selected publication attestation',s=>delete s.publicationAttestation,/attestation/);
await selectedMutation('publication attestation wrong immutable source pin',s=>s.publicationAttestation.sourceRevision='0'.repeat(40),/attestation/);
await selectedMutation('missing trust marker',s=>delete s.trustScope,/selection/);
await selectedMutation('arbitrary trust marker',s=>s.trustScope='anything',/selection/);
await selectedMutation('outside finalized receipt pin mismatch',s=>s.releaseSha256='0'.repeat(64),/receipt/);
// Build selects initial provenance; noncandidate finalize and separate verify
// require the outside owner's final immutable receipt selection, even when the
// locally reconstructed bytes happen to be unchanged.
for(const mode of ['finalize','verify']) for(const [label,value] of [['missing',undefined],['null',null],['malformed','not-a-sha256']]) {
  const changed=structuredClone(selectionDocument);
  if(value===undefined)delete changed.releaseSha256;else changed.releaseSha256=value;
  const filename=path.join(root,`${mode}-${label}-final-pin.json`);await fs.writeFile(filename,bytes(changed));
  await assert.rejects(module.packageRelease(mode,{...options,selection:filename,'selection-sha256':hash(bytes(changed))}),
    /receipt|pin/i,`${mode} must reject ${label} independently selected final receipt pin`);
  passed.push(`${mode} ${label} final receipt pin rejected`);
}

// Attack can repin candidate preparation and matching candidate selection inputs;
// the already selected outside anchor remains fixed and rejects the whole rewrite.
const changedPreparation=structuredClone(preparation);changedPreparation.packager.revision='0'.repeat(40);
const tamperedProvenance=path.join(root,'repinned-preparation.json');await fs.writeFile(tamperedProvenance,bytes(changedPreparation));
const tamperedSelection=structuredClone(selectionDocument);tamperedSelection.provenanceSha256=hash(bytes(changedPreparation));
const tamperedSelectedPath=path.join(root,'repinned-selection.json');await fs.writeFile(tamperedSelectedPath,bytes(tamperedSelection));
await rejects('self-consistent candidate repins cannot replace fixed outside selection',{
  provenance:tamperedProvenance,'provenance-sha256':hash(bytes(changedPreparation)),selection:tamperedSelectedPath},/pin mismatch/);
const implementation=path.join(fixture.sourceRoot,'scripts/vitest-release/package.mjs');
const originalImplementation=await fs.readFile(implementation),originalMode=(await fs.stat(implementation)).mode;
try {await fs.appendFile(implementation,'\n// changed after selection\n');await rejects('changed containing implementation bytes',{},/implementation differs/);}finally{await fs.writeFile(implementation,originalImplementation);}
try {await fs.chmod(implementation,originalMode&0o111?0o644:0o755);await rejects('changed containing implementation mode',{},/implementation differs/);}finally{await fs.chmod(implementation,originalMode&0o777);}
const tree=fixtureGit(fixture.sourceRoot,'rev-parse','HEAD^{tree}');
const uncontained=structuredClone(preparation);uncontained.packager.revision=tree;
const treeProvenance=path.join(root,'tree-preparation.json');await fs.writeFile(treeProvenance,bytes(uncontained));
const treeSelected=structuredClone(selectionDocument);treeSelected.provenanceSha256=hash(bytes(uncontained));treeSelected.verifierRevision=tree;
Object.assign(treeSelected.publicationAttestation,{provenanceSha256:treeSelected.provenanceSha256,verifierRevision:tree});
const treeSelection=path.join(root,'tree-selection.json');await fs.writeFile(treeSelection,bytes(treeSelected));
await rejects('Git tree cannot masquerade as containing commit',{provenance:treeProvenance,'provenance-sha256':hash(bytes(uncontained)),selection:treeSelection,'selection-sha256':hash(bytes(treeSelected))},/actual Git commit/);
// Selected source identity is independent of the valid containing packager.
// Git show/ls-tree can read these six exact source files from a tree, but the
// sourceRevision contract requires an actual commit before any layout access.
const sourceTreePreparation=structuredClone(preparation);sourceTreePreparation.sourceRevision=tree;
sourceTreePreparation.sourceOrigin=`https://github.com/sebastian-software/renovate-config/commit/${tree}`;
assert.equal(sourceTreePreparation.packager.revision,revision);
assert.equal(fixtureGit(fixture.sourceRoot,'cat-file','-t',tree),'tree');
const sourceTreeProvenance=path.join(root,'source-tree-preparation.json');await fs.writeFile(sourceTreeProvenance,bytes(sourceTreePreparation));
const sourceTreeSelection=structuredClone(selectionDocument);
sourceTreeSelection.provenanceSha256=hash(bytes(sourceTreePreparation));
delete sourceTreeSelection.releaseSha256; // Build legitimately selects initial authority before an emitted receipt.
Object.assign(sourceTreeSelection.publicationAttestation,{provenanceSha256:sourceTreeSelection.provenanceSha256,sourceRevision:tree});
const sourceTreeSelectedPath=path.join(root,'source-tree-selection.json');await fs.writeFile(sourceTreeSelectedPath,bytes(sourceTreeSelection));
await assert.rejects(module.packageRelease('build',{...options,provenance:sourceTreeProvenance,
  'provenance-sha256':sourceTreeSelection.provenanceSha256,selection:sourceTreeSelectedPath,
  'selection-sha256':hash(bytes(sourceTreeSelection)),output:path.join(root,'source-tree-build-must-not-exist')}),
  /actual Git commit/,'Selected sourceRevision tree must reject before build/layout');
passed.push('selected sourceRevision tree rejected before build/layout');

const selectedFile=path.join(options.output,'helper/scripts/vitest-lockstep.mjs'),original=await fs.readFile(selectedFile),parent=path.dirname(selectedFile);
try{await replace(selectedFile,Buffer.concat([original,Buffer.from('\n')]));await rejects('altered physical output leaf',{},/inventory/);}finally{await replace(selectedFile,original);}
try{await fs.chmod(parent,0o755);await fs.rename(selectedFile,selectedFile+'.missing');await rejects('missing physical output leaf',{},/inventory/);}finally{await fs.rename(selectedFile+'.missing',selectedFile);await fs.chmod(parent,0o555);}
try{await fs.chmod(parent,0o755);await fs.writeFile(path.join(parent,'extra'),Buffer.from('extra'));await rejects('extra physical output leaf',{},/inventory/);}finally{await fs.unlink(path.join(parent,'extra'));await fs.chmod(parent,0o555);}
try{await fs.chmod(parent,0o755);await fs.rename(selectedFile,selectedFile+'.saved');await fs.symlink(implementation,selectedFile);await rejects('escaping symlink output leaf',{},/Escaping|symlink/);}finally{await fs.unlink(selectedFile);await fs.rename(selectedFile+'.saved',selectedFile);await fs.chmod(parent,0o555);}
const relabeled={...receipt,productionEligible:true};try{await replace(path.join(options.output,'release.json'),bytes(relabeled));await rejects('relabeled false receipt cannot gain eligibility',{},/receipt changed/);}finally{await replace(path.join(options.output,'release.json'),receiptBytes);}
assert.deepEqual(await fs.readFile(path.join(options.output,'release.json')),receiptBytes);
if(values['stage-module']) {
  const script=`import importlib.util,json,sys\nspec=importlib.util.spec_from_file_location('stage',sys.argv[1]);stage=importlib.util.module_from_spec(spec);spec.loader.exec_module(stage)\ns=json.load(open(sys.argv[2]));r=json.load(open(sys.argv[3]))\ns.update(enabled=False,sourcePreparationOnly=True,selectedPublishedRecensorTag='v9.8.7',selectedPublishedRecensorCommit='a'*40,recensorSourceFiles={p:'2'*64 for p in ['src/alignment/config.ts','src/isolation/config.ts','src/isolation/executorMain.ts','src/isolation/brokerMain.ts','src/isolation/native/bootstrap-guard.c']},coordinatorNodeSha256='d'*64,runtimeSha256='e'*64,repositories=['sebastian-software/paratix'],policyRevision='fixture-only')\ns['publicationAttestation'].update(repository='https://github.com/sebastian-software/recensor',tag='v9.8.7',commit='a'*40)\nassert stage.selection_fields(s,source_fixture=True)==s\nassert stage.release_fields(r,s,source_fixture=True)==r\nfor call in [lambda:stage.selection_fields(s),lambda:stage.release_fields(r,s)]:\n try:call()\n except AssertionError:pass\n else:raise AssertionError('Fixture reached live stage validators')\nchanged=dict(r);changed['productionEligible']=True
reselected=dict(s);reselected['releaseSha256']=__import__('hashlib').sha256((json.dumps(changed,indent=2)+'\\n').encode()).hexdigest()
try:stage.release_fields(changed,reselected,source_fixture=True)
except AssertionError:pass
else:raise AssertionError('True-eligible source fixture reached actual stage pure seam')
try:stage.release_fields(changed,reselected)
except AssertionError:pass
else:raise AssertionError('Relabeled fixture reached normal stage path')
print('actual-stager-pure-fixture-roundtrip PASSED')\n`;
  const result=execFileSync('python3',['-B','-c',script,path.resolve(values['stage-module']),options.selection,path.join(options.output,'release.json')],{encoding:'utf8'});
  assert(result.includes('PASSED'));passed.push('actual selection_fields/release_fields fixture roundtrip; normal paths reject');
}
await module.packageRelease('verify',options);
await fs.writeFile(path.join(root,'fixture-summary.json'),bytes({revision,receiptSha256:hash(receiptBytes),selectionSha256:options['selection-sha256'],results:passed}));
console.log(JSON.stringify({state:'PASSED',scope:'full-stock-production-format-source-fixture',cases:passed.length,results:passed,root,revision,
  receiptSha256:hash(receiptBytes),productionEligible:false,linuxProcessProof:false,productionProof:false,
  executingUid:process.getuid?.()??null,productionDirectoryAncestry:process.platform==='linux'?'PASSED':'UNSUPPORTED_LOCAL_PLATFORM'}));
