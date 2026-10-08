#!/usr/bin/env node
// Opt-in authentic local source collection; all worker/container/image values are source doubles.
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createStockFixture, hash, bytes, leaves, consumer, seal, fixtureGit, writeJson } from './test-vitest-production-fixture.mjs';
const { values } = parseArgs({ options: { archives: { type: 'string' }, 'native-archive': { type: 'string' },
  'native-archive-sha256': { type: 'string' }, 'renovate-modules': { type: 'string' }, 'wrapper-root': { type: 'string' } } });
for (const name of ['archives', 'native-archive', 'native-archive-sha256', 'renovate-modules', 'wrapper-root']) assert(values[name], `Missing --${name}`);
const platform = `${process.platform}-${process.arch}`;
assert.equal(platform, 'darwin-arm64', 'This local auxiliary capsule requires the independently selected Darwin source runtime');
assert.equal(values['native-archive-sha256'], 'bed7eea5325e1108f32ce5228ddd6a5f0f08a499ee42aa7442aea583702f6057');
assert.equal(hash(await fs.readFile(values['native-archive'])), values['native-archive-sha256']);
// Fixed test-owned source closure; independent from issuer/harness oracle constants.
const harnessNames = ['scripts/test-vitest-native-worker.mjs', 'scripts/test-vitest-native-runner.mjs',
  'scripts/vitest-native-worker/contract.mjs', 'scripts/vitest-native-worker/inputs.mjs', 'scripts/vitest-native-worker/collection.mjs',
  'scripts/vitest-release.mjs', 'scripts/vitest-release/files.mjs', 'scripts/vitest-release/archive.mjs', 'scripts/vitest-release/package.mjs',
  'scripts/vitest-native/prepare.mjs', 'scripts/vitest-native/loader.mjs', 'scripts/vitest-native/collector.mjs', 'scripts/vitest-native/probe.mjs',
  'scripts/vitest-native/identity.mjs', 'scripts/vitest-native/data-only.mjs', 'scripts/vitest-native/runtime.mjs', 'scripts/vitest-native/transform.mjs'].sort();
const wrapperNames = ['runner-common.sh.j2', 'run.sh.j2', 'renovate-targeted.sh.j2', 'native-observation.sh.j2']
  .map(name => `roles/services/renovate/templates/${name}`).concat(['roles/services/renovate/tests/fixtures/runner_fixture.py',
    'roles/services/renovate/tests/fixtures/native_worker_fixture.py']).sort();
const archiveRoot = await fs.mkdtemp('/private/tmp/q2a-worker-archives-');
for (const name of ['yaml-2.9.1.tgz', 'semver-7.8.5.tgz', 'pnpm-11.17.0.tgz', `node-v24.18.0-${platform}.tar.gz`])
  await fs.copyFile(path.join(values.archives, name), path.join(archiveRoot, name));
await seal(archiveRoot);
const fixture = await createStockFixture({ archives: archiveRoot, workerFixture: true });
const { root, sourceRoot, revision, implementation } = fixture;
const output = path.join(root, 'collection');
const preparation = { schemaVersion: 1, qualificationContractRevision: 2, trustScope: 'source-fixture', sourceRevision: revision,
  sourceOrigin: `https://github.com/sebastian-software/renovate-config/commit/${revision}`,
  transform: { revision, files: fixture.nativeNames.map(name => implementation[name]) },
  original: { name: 'pnpm', version: '11.17.0', origin: 'https://registry.npmjs.org/pnpm/-/pnpm-11.17.0.tgz',
    archiveSha256: '644eb5079654e87dae59a07e62d7f098162b9ce58f06077328b5ddefca1c8541',
    bundleSha256: '228451e6383cf4df0700fc19b37aba1a25e6540e62fbca70ca2d76b719a4d883' } };
const preparationPath = path.join(root, 'native-preparation.json'); const preparationPin = await writeJson(preparationPath, preparation);
const observation = path.join(root, 'observation');
const { prepareNative } = await import(pathToFileURL(path.join(sourceRoot, 'scripts/vitest-native/prepare.mjs')));
const prepared = await prepareNative({ archive: fixture.extracted.pnpm.archive, pnpmRoot: fixture.extracted.pnpm.root,
  output: observation, receiptDirectory: path.join(output, 'native-receipts'), contextFile: path.join(output, 'context/context.json'),
  context: null, provenance: preparationPath, provenanceSha256: preparationPin, sourceRoot });
const profilePath = path.join(observation, 'profile.json');
const profileBefore = await fs.readFile(profilePath); assert.equal(hash(profileBefore), prepared.profileSha256);
const derivedRoot = path.join(root, 'derived-pnpm');
await fs.cp(fixture.extracted.pnpm.root, derivedRoot, { recursive: true, verbatimSymlinks: true });
await fs.writeFile(path.join(derivedRoot, 'dist/pnpm.mjs'), await fs.readFile(path.join(observation, 'derived-pnpm.mjs')));
await seal(derivedRoot);
const nativeArchive = path.join(root, 'node-native.tar.gz'); await fs.copyFile(values['native-archive'], nativeArchive); await fs.chmod(nativeArchive, 0o444);
const nativeParent = path.join(root, 'native-distribution'); await fs.mkdir(nativeParent);
execFileSync('/usr/bin/tar', ['-xzf', nativeArchive, '-C', nativeParent]);
const nativeRoot = path.join(nativeParent, `node-v24.21.0-${platform}`); await seal(nativeRoot);
const wrapperRoot = path.join(root, 'wrapper-source'); await fs.mkdir(wrapperRoot);
for (const name of wrapperNames) {
  const target = path.join(wrapperRoot, name); await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(path.join(values['wrapper-root'], name), target);
}
fixtureGit(wrapperRoot, 'init', '--quiet'); fixtureGit(wrapperRoot, 'add', '--', 'roles');
fixtureGit(wrapperRoot, 'commit', '--quiet', '--no-verify', '-m', 'Test-only fixed Q2a wrapper source');
const wrapperRevision = fixtureGit(wrapperRoot, 'rev-parse', 'HEAD');
const wrapperLeaves = await leaves(wrapperRoot);
const wrapperBinding = { revision: wrapperRevision, files: wrapperNames.map(name => wrapperLeaves.find(leaf => leaf.path === name)) };
const renovate = path.join(root, 'renovate-modules');
await fs.cp(values['renovate-modules'], renovate, { recursive: true, verbatimSymlinks: true }); await seal(renovate);
const workspace = path.join(root, 'workspace'); await fs.mkdir(workspace);
await writeJson(path.join(workspace, 'package.json'), { name: 'native-worker-fixture', version: '1.0.0', packageManager: 'pnpm@11.17.0',
  dependencies: { 'native-fixture': '1.0.1' }, scripts: { preinstall: `node -e "require('fs').writeFileSync('script-executed','bad')"` } });
await fs.writeFile(path.join(workspace, 'pnpm-workspace.yaml'), 'pnpmfile: .pnpmfile.cjs\nglobalPnpmfile: .pnpmfile.cjs\nignoreScripts: false\n');
await fs.writeFile(path.join(workspace, '.pnpmfile.mjs'), "import fs from 'node:fs'; fs.writeFileSync('hook-executed','bad'); export const hooks={readPackage:p=>p};\n");
await fs.writeFile(path.join(workspace, '.pnpmfile.cjs'), "require('node:fs').writeFileSync('hook-executed','bad'); module.exports={hooks:{readPackage:p=>p}};\n"); await seal(workspace);
const registry = path.join(root, 'registry'); await fs.mkdir(registry);
for (const version of ['1.0.0', '1.0.1']) {
  const directory = path.join(root, `registry-build-${version}`); await fs.mkdir(path.join(directory, 'package'), { recursive: true });
  await writeJson(path.join(directory, 'package/package.json'), { name: 'native-fixture', version });
  execFileSync('/usr/bin/tar', ['--format=ustar', '-czf', path.join(registry, `native-fixture-${version}.tgz`), '-C', directory, 'package']);
}
await seal(registry);
const pythonRoot = path.join(root, 'aux-python'); const site = path.join(pythonRoot, 'lib/python3.14/site-packages');
await fs.mkdir(site, { recursive: true }); await fs.mkdir(path.join(pythonRoot, 'bin'));
const base = '/opt/homebrew/Cellar/python@3.14/3.14.8/Frameworks/Python.framework/Versions/3.14/bin/python3.14';
const approvedSite = '/opt/homebrew/Cellar/ansible/14.4.0_1/libexec/lib/python3.14/site-packages';
for (const name of ['jinja2', 'yaml', 'markupsafe', 'jinja2-3.1.6.dist-info', 'pyyaml-6.0.3.dist-info', 'markupsafe-3.0.3.dist-info'])
  await fs.cp(path.join(approvedSite, name), path.join(site, name), { recursive: true, filter: file => !file.includes('/__pycache__') && !file.endsWith('.pyc') });
await fs.symlink(base, path.join(pythonRoot, 'bin/python'));
await fs.writeFile(path.join(pythonRoot, 'pyvenv.cfg'), `home = ${path.dirname(base)}\ninclude-system-site-packages = false\nversion = 3.14.8\n`);
await seal(pythonRoot);
async function selectedInventory(name, directory) {
  const inventoryFile = path.join(root, `${name}-inventory.json`);
  return { root: directory, inventoryFile, inventorySha256: await writeJson(inventoryFile, consumer(await leaves(directory))) };
}
const pythonInventory = await selectedInventory('python', pythonRoot);
const components = {};
for (const name of ['checker', 'helper', 'toolchain', 'observation']) components[name] = await selectedInventory(name,
  name === 'observation' ? observation : path.join(fixture.options.output, name));
const planPath = path.join(root, 'context-plan.json');
const planPin = await writeJson(planPath, { schemaVersion: 1, qualificationContractRevision: 2, evidenceScope: 'source-fixture', contextFile: path.join(output, 'context/context.json'), worker: 'github-org' });
const input = { schemaVersion: 1, qualificationContractRevision: 2, evidenceScope: 'source-fixture', tuple: { renovate: '43.288.0', node: '24.18.0', pnpm: '11.17.0' },
  source: { root: sourceRoot, binding: { revision, files: harnessNames.map(name => implementation[name]) } },
  stock: { root: fixture.options.output, provenanceFile: fixture.options.provenance, provenanceSha256: fixture.provenancePin,
    selectionFile: fixture.options.selection, selectionSha256: fixture.finalSelectionPin, artifactRoot: archiveRoot },
  preparation: { path: preparationPath, sha256: preparationPin }, profile: { path: profilePath, sha256: prepared.profileSha256 },
  contextPlan: { path: planPath, sha256: planPin }, originalRoot: path.join(fixture.options.output, 'toolchain/pnpm'), derivedRoot,
  nativeNode: { root: nativeRoot, archive: nativeArchive, archiveSha256: values['native-archive-sha256'], platform, version: '24.21.0' },
  components, renovate: await selectedInventory('renovate', renovate), workspace: await selectedInventory('workspace', workspace),
  registry: await selectedInventory('registry', registry), wrapper: { root: wrapperRoot, binding: wrapperBinding,
    python: { ...pythonInventory, baseExecutable: base, sha256: '7ebde552773a4045532637b114d645a313e045ac07b26f5e520bf039f1e34063',
      metadataSha256: hash(await fs.readFile(path.join(pythonRoot, 'pyvenv.cfg'))) } } };
await seal(sourceRoot); await seal(wrapperRoot);
const inputFile = path.join(root, 'input.json'); const inputPin = await writeJson(inputFile, input);
const { preflight } = await import(pathToFileURL(path.join(sourceRoot, 'scripts/vitest-native-worker/inputs.mjs')));
await preflight(inputFile, inputPin, output);
const results = ['authentic fixed complete selected inputs accepted before launch'];
async function rejected(label, change, pattern) {
  const candidate = structuredClone(input); await change(candidate);
  const file = path.join(root, `negative-${results.length}.json`); const pin = await writeJson(file, candidate);
  await assert.rejects(preflight(file, pin, output), pattern, label);
  await assert.rejects(fs.stat(output), { code: 'ENOENT' }); results.push(label);
}
for (const marker of [undefined, 1, 999, null, '2', true])
  await rejected(`incompatible input qualification revision ${String(marker)}`, value => {
    if (marker === undefined) delete value.qualificationContractRevision;
    else value.qualificationContractRevision = marker;
  }, /shape|fixture|revision/);
await rejected('wrong tuple before commands', value => { value.tuple.node = '24.21.0'; }, /tuple/);
await rejected('unknown command selector', value => { value.command = '/usr/bin/true'; }, /shape/);
await rejected('unsafe wrapper path before render', value => { value.wrapper.root += "';touch unsafe"; }, /path/);
await rejected('wrong outside profile pin', value => { value.profile.sha256 = '0'.repeat(64); }, /pin|digest/);
// Profile attacks are independently pinned new documents, never edits/re-pins to the frozen measured profile.
async function profileAttack(label, mutate, pattern) {
  await rejected(label, async value => {
    const doc = JSON.parse(profileBefore); mutate(doc);
    const attacked = path.join(root, `attack-observation-${results.length}`);
    await fs.cp(observation, attacked, { recursive: true });
    value.profile.path = path.join(attacked, 'profile.json'); await fs.chmod(value.profile.path, 0o644);
    value.profile.sha256 = await writeJson(value.profile.path, doc); await seal(attacked);
    value.components.observation = await selectedInventory(`attack-observation-${results.length}`, attacked);
  }, pattern);
}
for (const marker of [undefined, 1, 999, null, '2', true])
  await profileAttack(`mixed profile qualification revision ${String(marker)}`, doc => {
    if (marker === undefined) delete doc.qualificationContractRevision;
    else doc.qualificationContractRevision = marker;
  }, /profile|preparation/);
for (const marker of [undefined, 1, 999])
  await rejected(`mixed context plan qualification revision ${String(marker)}`, async value => {
    const document = JSON.parse(await fs.readFile(planPath));
    if (marker === undefined) delete document.qualificationContractRevision;
    else document.qualificationContractRevision = marker;
    const file = path.join(root, `negative-context-plan-${String(marker)}.json`);
    value.contextPlan = { path: file, sha256: await writeJson(file, document) };
  }, /shape|context.*plan/i);
await profileAttack('production eligibility promotion rejected', doc => { doc.productionEligible = true; }, /profile|preparation/);
await profileAttack('omitted loader closure rejected', doc => { doc.instrumentationFiles = doc.instrumentationFiles.filter(leaf => leaf.path !== 'loader.mjs'); }, /instrumentation/);
await profileAttack('self-pinned seam declaration rejected', doc => { doc.renovateSeams.manager.sha256 = '0'.repeat(64); }, /seam/);
await profileAttack('modified data-only flags rejected', doc => { doc.dataOnlyProfile.configDependencies = 'allowed'; }, /Data-only/);
await profileAttack('changed containing transform rejected', doc => { doc.containingTransform.revision = '0'.repeat(40); }, /transform/);
await profileAttack('re-pinned foreign loader digest rejected', doc => {
  doc.instrumentationFiles.find(leaf => leaf.path === 'loader.mjs').sha256 = '0'.repeat(64);
  doc.transformFiles = doc.instrumentationFiles;
}, /instrumentation|implementation/);
await rejected('extra readonly observation leaf rejected', async value => {
  const attacked = path.join(root, 'attack-extra-observation'); await fs.cp(observation, attacked, { recursive: true });
  await fs.chmod(attacked, 0o755); await fs.writeFile(path.join(attacked, 'extra.mjs'), 'export {};\n'); await seal(attacked);
  value.profile.path = path.join(attacked, 'profile.json');
  value.components.observation = await selectedInventory('attack-extra-observation', attacked);
}, /observation closure/);
await rejected('auxiliary executable startup file rejected', async value => {
  const attacked = path.join(root, 'attack-aux-python'); await fs.cp(pythonRoot, attacked, { recursive: true, verbatimSymlinks: true });
  await fs.chmod(path.join(attacked, 'lib/python3.14/site-packages'), 0o755);
  await fs.writeFile(path.join(attacked, 'lib/python3.14/site-packages/evil.pth'), 'import os\n'); await seal(attacked);
  value.wrapper.python = { ...value.wrapper.python, ...await selectedInventory('attack-python', attacked) };
}, /auxiliary startup/);

// Direct source directory mutation is restricted to the owned capsule and restored before collection.
await fs.chmod(path.join(sourceRoot, 'scripts/vitest-native-worker'), 0o755);
await assert.rejects(preflight(inputFile, inputPin, output), /writable|frozen/);
await fs.chmod(path.join(sourceRoot, 'scripts/vitest-native-worker'), 0o555); results.push('writable source containing directory rejected');
const pythonSmoke = spawnSync(path.join(pythonRoot, 'bin/python'), ['-B', '-I', '-c', 'import jinja2,yaml,markupsafe; print("isolated dependency imports")'],
  { encoding: 'utf8', env: { PATH: '/usr/bin:/bin' }, timeout: 10_000 });
assert.equal(pythonSmoke.status, 0, pythonSmoke.stderr); results.push('fixed isolated auxiliary dependencies import');
await writeJson(path.join(root, 'test-ready.json'), { evidenceScope: 'source-fixture', inputFile, inputPin, output, results });
const driver = path.join(sourceRoot, 'scripts/test-vitest-native-worker.mjs');
const run = spawnSync(process.execPath, [driver, '--input', inputFile, '--input-sha256', inputPin, '--output', output, '--source-fixture'],
  { encoding: 'utf8', timeout: 910_000, maxBuffer: 65_536, env: { PATH: '/usr/bin:/bin', HOME: root, LANG: 'C', TZ: 'UTC' } });
assert.ifError(run.error); assert.equal(run.signal, null); assert.equal(run.status, 1, `Incomplete source qualification must exit nonzero: ${run.stderr}`);
await writeJson(path.join(root, 'driver-result.json'), { exitCode: run.status, signal: run.signal, stdout: run.stdout, stderr: run.stderr });
const summary = JSON.parse(await fs.readFile(path.join(output, 'qualification-summary.json')));
assert.equal(summary.qualificationContractRevision, 2);
const launchPath=path.join(output,'context/launch.json'),launchBytes=await fs.readFile(launchPath);
const launchDocument=JSON.parse(launchBytes);
assert.equal(launchDocument.qualificationContractRevision,2);
const previousContextPin=process.env.VITEST_NATIVE_CONTEXT_SHA256;
process.env.VITEST_NATIVE_CONTEXT_SHA256=launchDocument.contextSha256;
try {
  await preflight(inputFile,inputPin,output,{contextReady:true});
  for(const marker of [undefined,1,999]) {
    const changed={...launchDocument,qualificationContractRevision:marker};
    if(marker===undefined)delete changed.qualificationContractRevision;
    await fs.chmod(launchPath,0o644);await fs.writeFile(launchPath,bytes(changed));await fs.chmod(launchPath,0o444);
    await assert.rejects(preflight(inputFile,inputPin,output,{contextReady:true}),/shape|context handoff/i);
    await fs.chmod(launchPath,0o644);await fs.writeFile(launchPath,launchBytes);await fs.chmod(launchPath,0o444);
  }
} finally {
  await fs.chmod(launchPath,0o644);await fs.writeFile(launchPath,launchBytes);await fs.chmod(launchPath,0o444);
  if(previousContextPin===undefined)delete process.env.VITEST_NATIVE_CONTEXT_SHA256;else process.env.VITEST_NATIVE_CONTEXT_SHA256=previousContextPin;
}
results.push('missing/legacy/unknown context plan and post-CID launch revisions rejected without source promotion');
assert.equal(summary.completeness, false); assert.equal(summary.productionEligible, false); assert.equal(summary.cases.length, 48);
assert.equal(summary.missingSlots.length, 48); assert(!summary.cases.some(record => record.state === 'PASSED'));
assert.equal(summary.actualWorkerNamespaceObserved, false); assert.equal(summary.actualImageObserved, false);
assert.equal(summary.sourceWrapperOutcome.exitCode, 0);
for (const name of ['linux-compatibility.json', 'data-only-lifecycle.json']) await assert.rejects(fs.stat(path.join(output, name)), { code: 'ENOENT' });
assert.deepEqual(await fs.readFile(profilePath), profileBefore, 'Frozen profile changed during observations');
const support = JSON.parse(await fs.readFile(path.join(output, 'raw/supporting-source-collection.json')));
assert.equal(support.linuxProcessProof, false); assert.equal(support.productionEligible, false); assert.equal(support.registryExceeded, false);
assert.equal(support.supportingInvocations.length, 12, 'Expected six baselines, four warmups and two concurrent source runs');
assert(support.supportingInvocations.every(record => record.managerOutcome.exitCode === 0 && record.managerOutcome.signal === null &&
  record.observerFailure === null && record.markerExecutions.length === 0));
const receiptSets = [];
for (const invocation of support.supportingInvocations) {
  const receipts = [];
  for (const reference of invocation.references) {
    const content = await fs.readFile(path.join(output, reference.path)); assert.equal(hash(content), reference.sha256);
    if (reference.path.endsWith('.lock')) assert(content.includes(Buffer.from("lockfileVersion: '9.0'")));
    if (/^raw\/.+-[a-f0-9]{32}\.json$/.test(reference.path)) receipts.push(JSON.parse(content));
  }
  if (invocation.runtimeIdentity === 'derived') {
    assert.equal(receipts.length, 1, `Missing authentic native receipt for ${invocation.name}`);
    assert.equal(receipts[0].qualificationContractRevision,2);
    assert(receipts[0].events.every(event=>event.qualificationContractRevision===2));
    assert.equal(receipts[0].nativeExit,invocation.managerOutcome.exitCode);
    assert.equal(receipts[0].nativeSignal,invocation.managerOutcome.signal);
  }
  else assert.equal(receipts.length, 0, 'Stock original acquired invented instrumented phases');
  if (invocation.name.startsWith('concurrency-')) receiptSets.push(receipts.map(record => record.invocation));
}
assert.equal(receiptSets.length, 2); assert.equal(new Set(receiptSets.flat()).size, 2, 'Concurrent native receipt attribution overlaps');
const wrapperSummary = JSON.parse(await fs.readFile(path.join(output, 'wrapper-source-summary.json')));
assert.equal(wrapperSummary.sourceWrapperExit, 0); assert.equal(wrapperSummary.actualImageObserved, false);
assert.equal(wrapperSummary.actualWorkerNamespaceObserved, false); assert(wrapperSummary.receipts.length > 0);
for (const reference of wrapperSummary.receipts) assert.equal(hash(await fs.readFile(path.join(output, reference.path))), reference.sha256);
results.push('actual manager-util-exec-execa collection retains authentic native/lock/outcome bytes through owned source wrapper');
console.log(JSON.stringify({ state: 'PASSED', evidenceScope: 'source-collection', root, results, completeness: false,
  productionEligible: false, nativeWorkerLaunched: false, linuxProcessProof: false }));
