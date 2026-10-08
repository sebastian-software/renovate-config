// Fixed local source inputs. Outside selection precedes every command/observation.
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { archiveMembers } from '../vitest-release/archive.mjs';
import { packageRelease } from '../vitest-release/package.mjs';
import { authenticateImplementation, readPinnedJson, consumerFiles, inventory, budgets,
  requireValue, realDirectory, hashFile, verifyReadOnly, sha256, jsonBytes } from '../vitest-release/files.mjs';
import { ORIGINAL_PNPM_ARCHIVE, ORIGINAL_PNPM_BUNDLE, delegationSourceFacts, transformPnpm } from '../vitest-native/transform.mjs';
import { limits } from './contract.mjs';
import { EMPTY_SHA256 } from '../vitest-native/data-only.mjs';
import { RENOVATE_SEAMS } from '../vitest-native/prepare.mjs';
export const harnessNames = [
  'scripts/test-vitest-native-worker.mjs', 'scripts/test-vitest-native-runner.mjs',
  'scripts/vitest-native-worker/contract.mjs', 'scripts/vitest-native-worker/inputs.mjs',
  'scripts/vitest-native-worker/collection.mjs',
  'scripts/vitest-release.mjs', 'scripts/vitest-release/files.mjs', 'scripts/vitest-release/archive.mjs',
  'scripts/vitest-release/package.mjs', 'scripts/vitest-native/prepare.mjs',
  'scripts/vitest-native/loader.mjs', 'scripts/vitest-native/collector.mjs', 'scripts/vitest-native/probe.mjs',
  'scripts/vitest-native/identity.mjs', 'scripts/vitest-native/data-only.mjs',
  'scripts/vitest-native/runtime.mjs', 'scripts/vitest-native/transform.mjs',
].sort();
export const wrapperNames = ['runner-common.sh.j2', 'run.sh.j2', 'renovate-targeted.sh.j2',
  'native-observation.sh.j2'].map(name => `roles/services/renovate/templates/${name}`).concat([
  'roles/services/renovate/tests/fixtures/runner_fixture.py',
  'roles/services/renovate/tests/fixtures/native_worker_fixture.py',
]).sort();
const executingRoot = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');
const smallBudget = { count: limits.workspaceFiles, file: limits.leaf, total: limits.workspaceBytes };
const FIXED_AUXILIARY_BASE = '/opt/homebrew/Cellar/python@3.14/3.14.8/Frameworks/Python.framework/Versions/3.14/bin/python3.14';
export function safePath(value) {
  // Sole purpose-specific exception: this already selected existing base has @.
  // No user output/source/PATH component obtains a general quoting exception.
  if (value === FIXED_AUXILIARY_BASE) return value;
  requireValue(typeof value === 'string' && value.length <= 1_024 &&
    /^\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/.test(value) &&
    value.split('/').slice(1).every(part => part !== '.' && part !== '..'), 'Unsafe fixed launcher path');
  return value;
}
export function exact(value, keys, message = 'Unsupported fixed input shape') {
  requireValue(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === keys.toSorted().join(','), message);
}
const same = (a, b, message) => requireValue(JSON.stringify(a) === JSON.stringify(b), message);
const contains = (root, file) => file === root || file.startsWith(`${root}${path.sep}`);
async function readonlyFile(file, pin, limit = limits.input) {
  requireValue((await fs.lstat(file)).isFile() && !((await fs.lstat(file)).mode & 0o222), 'Selected input file is writable/unsupported');
  return readPinnedJson(file, pin, limit);
}
async function frozenOwnedPaths(root, names) {
  await realDirectory(root);
  for (const name of names) {
    let selected = path.join(root, name);
    while (selected === root || selected.startsWith(root + path.sep)) {
      const stat = await fs.lstat(selected);
      requireValue((stat.isFile() || stat.isDirectory()) && !(stat.mode & 0o222) &&
        await fs.realpath(selected) === selected, 'Owned source directory/leaf remains writable or escaping');
      if (selected === root) break;
      selected = path.dirname(selected);
    }
  }
}
async function selectedInventory(selected, budget) {
  exact(selected, ['root', 'inventoryFile', 'inventorySha256']);
  await realDirectory(selected.root); await verifyReadOnly(selected.root);
  const expected = (await readonlyFile(selected.inventoryFile, selected.inventorySha256, 16_777_216)).document;
  requireValue(Array.isArray(expected), 'Selected complete inventory required');
  const actual = consumerFiles(await inventory(selected.root, budget));
  same(actual, expected, 'Missing/extra/escaping/drifting complete inventory');
  return actual;
}
async function nodeDistribution(node) {
  exact(node, ['root', 'archive', 'archiveSha256', 'platform', 'version']);
  requireValue(node.version === '24.21.0' && node.platform === `${process.platform}-${process.arch}`, 'Unsupported differing interpreter tuple');
  requireValue(path.isAbsolute(node.archive) && await fs.realpath(node.archive) === node.archive &&
    !((await fs.lstat(node.archive)).mode & 0o222), 'Differing interpreter archive is writable/unowned');
  const members = await archiveMembers(node.archive, node.archiveSha256);
  const prefix = `node-v${node.version}-${node.platform}/`;
  requireValue([...members.keys()].every(name => name === prefix.slice(0, -1) || name.startsWith(prefix)), 'Extra interpreter archive member');
  const expected = [...members].filter(([, member]) => member.type !== 'directory').map(([name, member]) =>
    member.type === 'symlink' ? { path: name.slice(prefix.length), type: 'symlink', target: member.target } :
      { path: name.slice(prefix.length), ...member }).sort((a, b) => a.path.localeCompare(b.path, 'en'));
  await realDirectory(node.root); await verifyReadOnly(node.root);
  same(await inventory(node.root, budgets.toolchain), expected, 'Differing interpreter is not its complete selected original distribution');
  const binary = path.join(node.root, 'bin/node');
  requireValue(expected.some(file => file.path === 'bin/node' && file.type === 'file' && file.executable), 'Missing authentic interpreter entry');
  return binary;
}
export async function preflight(inputFile, inputPin, output, { contextReady = false, outputReady = contextReady } = {}) {
  safePath(inputFile); safePath(output);
  requireValue(path.isAbsolute(output) && output.length <= 1024, 'Absolute bounded new output root required');
  await realDirectory(path.dirname(output));
  if (!outputReady) {
    try { await fs.lstat(output); throw Error('Output root already exists'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  } else await realDirectory(output);
  const { document: input } = await readonlyFile(inputFile, inputPin);
  const paths = value => {
    if (typeof value === 'string' && value.startsWith('/')) safePath(value);
    else if (value && typeof value === 'object') for (const item of Object.values(value)) paths(item);
  };
  paths(input);
  exact(input, ['schemaVersion', 'qualificationContractRevision', 'evidenceScope', 'tuple', 'source', 'stock', 'preparation', 'profile', 'contextPlan',
    'originalRoot', 'derivedRoot', 'nativeNode', 'components', 'renovate', 'workspace', 'registry', 'wrapper']);
  requireValue(input.schemaVersion === 1 && input.qualificationContractRevision === 2 && input.evidenceScope === 'source-fixture', 'Only nondeployable source fixture inputs are supported');
  exact(input.tuple, ['renovate', 'node', 'pnpm']);
  same(input.tuple, { renovate: '43.288.0', node: '24.18.0', pnpm: '11.17.0' }, 'Wrong fixed native tuple');
  exact(input.source, ['root', 'binding']);
  await authenticateImplementation(input.source.root, executingRoot, input.source.binding, harnessNames);
  await frozenOwnedPaths(input.source.root, harnessNames);
  await frozenOwnedPaths(executingRoot, harnessNames);
  for (const name of harnessNames) {
    for (const root of new Set([input.source.root, executingRoot])) {
      requireValue(!((await fs.lstat(path.join(root, name))).mode & 0o222), 'Harness implementation is not frozen readonly');
    }
  }
  exact(input.stock, ['root', 'provenanceFile', 'provenanceSha256', 'selectionFile', 'selectionSha256', 'artifactRoot']);
  await readonlyFile(input.stock.provenanceFile, input.stock.provenanceSha256, 16_777_216);
  await readonlyFile(input.stock.selectionFile, input.stock.selectionSha256, 16_777_216);
  await realDirectory(input.stock.artifactRoot); await verifyReadOnly(input.stock.artifactRoot);
  const stockOptions = { output: input.stock.root, provenance: input.stock.provenanceFile,
    'provenance-sha256': input.stock.provenanceSha256, selection: input.stock.selectionFile,
    'selection-sha256': input.stock.selectionSha256, 'source-root': input.source.root,
    'artifact-root': input.stock.artifactRoot, sourceFixture: true };
  const stock = await packageRelease('verify', stockOptions);
  requireValue(stock.verified && stock.productionEligible === false, 'Fixed test stock receipt must remain source-fixture/ineligible');
  const provenance = (await readPinnedJson(input.stock.provenanceFile, input.stock.provenanceSha256)).document;
  requireValue(provenance.toolchain.nodeVersion === '24.18.0' && provenance.toolchain.pnpmVersion === '11.17.0' &&
    provenance.toolchain.platform === `${process.platform}-${process.arch}`, 'Wrong authenticated parent stock tuple');
  const parentNode = path.join(input.stock.root, 'toolchain', provenance.toolchain.nodeEntry);
  const nativeNode = await nodeDistribution(input.nativeNode);
  requireValue(process.versions.node === '24.18.0' && (await hashFile(process.execPath, budgets.toolchain.file)).sha256 ===
    (await hashFile(parentNode, budgets.toolchain.file)).sha256, 'Executing parent differs from selected authentic interpreter');
  requireValue((await hashFile(parentNode, budgets.toolchain.file)).sha256 !==
    (await hashFile(nativeNode, budgets.toolchain.file)).sha256, 'Authentic interpreters must differ');
  exact(input.preparation, ['path', 'sha256']); exact(input.profile, ['path', 'sha256']);
  const preparation = (await readonlyFile(input.preparation.path, input.preparation.sha256)).document;
  const profile = (await readonlyFile(input.profile.path, input.profile.sha256)).document;
  requireValue(preparation.qualificationContractRevision === 2 && profile.qualificationContractRevision === 2 && profile.schemaVersion === 1 && profile.provenanceClass === 'authenticated-preparation' &&
    profile.productionEligible === false && profile.trustScope === 'source-fixture' &&
    profile.preparationSha256 === input.preparation.sha256 && profile.originalArchiveSha256 === ORIGINAL_PNPM_ARCHIVE &&
    profile.originalBundleSha256 === ORIGINAL_PNPM_BUNDLE && profile.pnpmVersion === '11.17.0' &&
    profile.sourceRevision === preparation.sourceRevision && profile.transformRevision === preparation.transform?.revision,
    'Unselected/drifting native preparation/profile');
  exact(profile, ['schemaVersion', 'qualificationContractRevision', 'delegationSource', 'provenanceClass', 'productionEligible', 'originalArchiveSha256',
    'originalBundleSha256', 'derivedBundleSha256', 'transformRevision', 'transformFiles', 'sourceRevision',
    'trustScope', 'preparationSha256', 'containingTransform', 'pnpmVersion', 'pnpmFiles', 'derivedFiles',
    'instrumentationFiles', 'dataOnlyProfile', 'renovateSeams', 'receiptDirectory', 'context', 'contextFile']);
  same(profile.containingTransform, preparation.transform, 'Containing transform mismatch');
  same(profile.dataOnlyProfile, { path: 'empty-pnpmfile.mjs', sha256: EMPTY_SHA256,
    configPrecedence: 'pnpm-11.17-env-after-workspace', configDependencies: 'absent' }, 'Data-only profile mismatch');
  same(profile.renovateSeams, RENOVATE_SEAMS, 'Unselected Renovate seam contract');
  const names = ['scripts/vitest-native-prepare.mjs', ...(await fs.readdir(path.join(executingRoot, 'scripts/vitest-native')))
    .filter(name => name.endsWith('.mjs')).map(name => `scripts/vitest-native/${name}`),
  'scripts/vitest-release/archive.mjs', 'scripts/vitest-release/files.mjs'].sort();
  await authenticateImplementation(input.source.root, executingRoot, preparation.transform, names);
  await frozenOwnedPaths(input.source.root, names); await frozenOwnedPaths(executingRoot, names);
  for (const name of names) for (const root of new Set([input.source.root, executingRoot])) requireValue(
    !((await fs.lstat(path.join(root, name))).mode & 0o222), 'Native preparation implementation remains writable');
  requireValue(preparation.sourceOrigin === `https://github.com/sebastian-software/renovate-config/commit/${preparation.sourceRevision}` &&
    preparation.trustScope === 'source-fixture' && preparation.original?.archiveSha256 === ORIGINAL_PNPM_ARCHIVE &&
    preparation.original?.bundleSha256 === ORIGINAL_PNPM_BUNDLE, 'Untrusted native preparation selection');
  exact(input.components, ['checker', 'helper', 'toolchain', 'observation']);
  const componentInventories = {};
  for (const name of ['checker', 'helper', 'toolchain', 'observation']) {
    componentInventories[name] = await selectedInventory(input.components[name], budgets[name] ?? budgets.toolchain);
    if (name !== 'observation') requireValue(input.components[name].root === path.join(input.stock.root, name), 'Components differ from authenticated stock');
  }
  const observation = input.components.observation.root;
  requireValue(input.profile.path === path.join(observation, 'profile.json'), 'Profile outside observation component');
  await realDirectory(input.originalRoot); await realDirectory(input.derivedRoot);
  await verifyReadOnly(input.originalRoot); await verifyReadOnly(input.derivedRoot);
  requireValue(input.originalRoot === path.join(input.stock.root, 'toolchain', path.dirname(provenance.toolchain.pnpmPackage)), 'Original CLI differs from complete authenticated stock');
  same(consumerFiles(await inventory(input.originalRoot, budgets.toolchain)), profile.pnpmFiles, 'Complete original distribution mismatch');
  same(consumerFiles(await inventory(input.derivedRoot, budgets.toolchain)), profile.derivedFiles, 'Complete derived distribution mismatch');
  const original = await fs.readFile(path.join(input.originalRoot, 'dist/pnpm.mjs'));
  same(profile.delegationSource, delegationSourceFacts(original), 'Wrong authenticated delegation control flow');
  const derived = await fs.readFile(path.join(input.derivedRoot, 'dist/pnpm.mjs'));
  requireValue(sha256(original) === ORIGINAL_PNPM_BUNDLE && sha256(derived) === profile.derivedBundleSha256 &&
    sha256(transformPnpm(original)) === profile.derivedBundleSha256, 'Changed original/derived transform bytes');
  const instrumentationNames = ['transform.mjs', 'identity.mjs', 'probe.mjs', 'collector.mjs',
    'loader.mjs', 'runtime.mjs', 'data-only.mjs', 'empty-pnpmfile.mjs'];
  requireValue(Array.isArray(profile.instrumentationFiles) && profile.instrumentationFiles.length === 8 &&
    new Set(profile.instrumentationFiles.map(file => file.path)).size === 8 &&
    instrumentationNames.every(name => profile.instrumentationFiles.some(file => file.path === name)),
    'Complete selected instrumentation closure required');
  same(profile.transformFiles, profile.instrumentationFiles, 'Frozen instrumentation inventory mismatch');
  const expectedObservation = [{ path: 'profile.json', type: 'file', sha256: input.profile.sha256 },
    { path: 'derived-pnpm.mjs', type: 'file', sha256: profile.derivedBundleSha256 }];
  for (const leaf of profile.instrumentationFiles) {
    exact(leaf, ['path', 'sha256']);
    const selected = preparation.transform.files.find(file => file.path === `scripts/vitest-native/${leaf.path}`);
    requireValue(leaf.path === 'empty-pnpmfile.mjs' ? leaf.sha256 === EMPTY_SHA256 : selected?.sha256 === leaf.sha256,
      'Instrumentation differs from selected containing implementation');
    requireValue((await hashFile(path.join(observation, leaf.path), limits.leaf)).sha256 === leaf.sha256,
      'Changed frozen observation leaf');
    expectedObservation.push({ path: leaf.path, type: 'file', sha256: leaf.sha256 });
  }
  expectedObservation.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  same(componentInventories.observation, expectedObservation, 'Exact ten-leaf observation closure required');
  same(profile.derivedFiles, profile.pnpmFiles.map(file => file.path === 'dist/pnpm.mjs'
    ? { ...file, sha256: profile.derivedBundleSha256 } : file), 'Complete derived distribution differs from selected original');
  exact(input.contextPlan, ['path', 'sha256']);
  const plan = (await readonlyFile(input.contextPlan.path, input.contextPlan.sha256, 4_096)).document;
  exact(plan, ['schemaVersion', 'qualificationContractRevision', 'evidenceScope', 'contextFile', 'worker']);
  requireValue(plan.schemaVersion === 1 && plan.qualificationContractRevision === 2 && plan.evidenceScope === 'source-fixture' && plan.worker === 'github-org' &&
    plan.contextFile === path.join(output, 'context/context.json') && profile.contextFile === plan.contextFile &&
    profile.receiptDirectory === path.join(output, 'native-receipts'), 'Wrong fixed post-CID context/output plan');
  await selectedInventory(input.renovate, budgets.toolchain);
  const renovateRoot = await fs.realpath(path.join(input.renovate.root, 'renovate'));
  requireValue(contains(input.renovate.root, renovateRoot) &&
    JSON.parse(await fs.readFile(path.join(renovateRoot, 'package.json'))).version === '43.288.0', 'Wrong selected Renovate closure');
  for (const seam of Object.values(profile.renovateSeams)) {
    requireValue((await hashFile(path.join(renovateRoot, seam.path), limits.leaf)).sha256 === seam.sha256, 'Renovate native seam drift');
  }
  const workspace = await selectedInventory(input.workspace, smallBudget);
  requireValue(workspace.length > 0 && workspace.every(file => file.type === 'file' &&
    ['package.json', 'pnpm-workspace.yaml', '.pnpmfile.mjs', '.pnpmfile.cjs'].includes(file.path)), 'Unexpected executable workspace input');
  const manifest = JSON.parse(await fs.readFile(path.join(input.workspace.root, 'package.json')));
  exact(manifest, ['name', 'version', 'packageManager', 'dependencies', 'scripts']);
  exact(manifest.scripts, ['preinstall']);
  requireValue(manifest.version === '1.0.0' && manifest.scripts.preinstall ===
    `node -e "require('fs').writeFileSync('script-executed','bad')"`, 'Unowned workspace executable script');
  const controlledFiles = {
    'pnpm-workspace.yaml': 'pnpmfile: .pnpmfile.cjs\nglobalPnpmfile: .pnpmfile.cjs\nignoreScripts: false\n',
    '.pnpmfile.mjs': "import fs from 'node:fs'; fs.writeFileSync('hook-executed','bad'); export const hooks={readPackage:p=>p};\n",
    '.pnpmfile.cjs': "require('node:fs').writeFileSync('hook-executed','bad'); module.exports={hooks:{readPackage:p=>p}};\n",
  };
  for (const [name, bytes] of Object.entries(controlledFiles)) requireValue(
    await fs.readFile(path.join(input.workspace.root, name), 'utf8') === bytes, 'Unowned workspace configuration/hook input');
  requireValue(manifest.name === 'native-worker-fixture' && manifest.packageManager === 'pnpm@11.17.0' &&
    Object.keys(manifest.dependencies ?? {}).join(',') === 'native-fixture' && manifest.dependencies['native-fixture'] === '1.0.1', 'Wrong controlled workspace');
  const registry = await selectedInventory(input.registry, smallBudget);
  same(registry.map(file => file.path), ['native-fixture-1.0.0.tgz', 'native-fixture-1.0.1.tgz'], 'Wrong fixed local registry files');
  for (const leaf of registry) {
    requireValue(leaf.type === 'file', 'Registry archive cannot be a link');
    const members = await archiveMembers(path.join(input.registry.root, leaf.path), leaf.sha256);
    requireValue([...members].filter(([, member]) => member.type !== 'directory').length === 1 &&
      members.get('package/package.json')?.type === 'file', 'Registry fixture archive contains executable/extra leaves');
  }
  exact(input.wrapper, ['root', 'binding', 'python']);
  await authenticateImplementation(input.wrapper.root, input.wrapper.root, input.wrapper.binding, wrapperNames);
  await frozenOwnedPaths(input.wrapper.root, wrapperNames);
  for (const name of wrapperNames) requireValue(!((await fs.lstat(path.join(input.wrapper.root, name))).mode & 0o222),
    'Selected wrapper implementation remains writable');
  const python = input.wrapper.python;
  exact(python, ['root', 'baseExecutable', 'sha256', 'inventoryFile', 'inventorySha256', 'metadataSha256']);
  await realDirectory(python.root); await verifyReadOnly(python.root);
  const fixedBase = process.platform === 'darwin'
    ? FIXED_AUXILIARY_BASE
    : await fs.realpath('/usr/bin/python3');
  requireValue(python.baseExecutable === fixedBase && (await hashFile(fixedBase, budgets.toolchain.file)).sha256 === python.sha256,
    'Unselected auxiliary existing Python base');
  if (process.platform === 'darwin') requireValue(python.sha256 ===
    '7ebde552773a4045532637b114d645a313e045ac07b26f5e520bf039f1e34063', 'Unknown fixed auxiliary interpreter pin');
  const pythonExe = path.join(python.root, 'bin/python');
  requireValue((await fs.lstat(pythonExe)).isSymbolicLink() && await fs.readlink(pythonExe) === fixedBase &&
    await fs.realpath(pythonExe) === fixedBase, 'Only the fixed auxiliary interpreter alias is allowed');
  const expectedPython = (await readonlyFile(python.inventoryFile, python.inventorySha256, 16_777_216)).document;
  const actualPython = consumerFiles(await inventory(python.root, budgets.toolchain, ['bin/python']));
  const modulePath = /^lib\/python3\.[0-9]+\/site-packages\/((?:jinja2|yaml|markupsafe)(?:-[0-9.]+\.dist-info)?|pyyaml-[0-9.]+\.dist-info)\/(.+)$/;
  const approvedModules = process.platform === 'darwin'
    ? '/opt/homebrew/Cellar/ansible/14.4.0_1/libexec/lib/python3.14/site-packages' : '/usr/lib/python3/dist-packages';
  for (const leaf of actualPython) {
    if (leaf.path === 'pyvenv.cfg') continue;
    const match = modulePath.exec(leaf.path);
    requireValue(leaf.type === 'file' && match && !/(?:^|\/)(?:__pycache__|sitecustomize\.py|usercustomize\.py)(?:\/|$)/.test(leaf.path) &&
      !/\.(?:pth|pyc)$/.test(leaf.path), 'Unowned auxiliary startup/module leaf');
    requireValue((await hashFile(path.join(approvedModules, match[1], match[2]), budgets.toolchain.file)).sha256 === leaf.sha256,
      'Auxiliary capsule differs from fixed existing dependency bytes');
  }
  for (const name of ['jinja2', 'yaml', 'markupsafe']) requireValue(actualPython.some(leaf =>
    modulePath.exec(leaf.path)?.[1] === name && leaf.path.endsWith('/__init__.py')), 'Missing auxiliary dependency module');
  actualPython.push({ path: 'bin/python', type: 'symlink', target: fixedBase });
  actualPython.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  same(actualPython, expectedPython, 'Frozen auxiliary metadata/module closure differs');
  const metadata = await fs.readFile(path.join(python.root, 'pyvenv.cfg'), 'utf8');
  requireValue((await hashFile(path.join(python.root, 'pyvenv.cfg'), 4_096)).sha256 === python.metadataSha256 &&
    metadata === `home = ${path.dirname(fixedBase)}\ninclude-system-site-packages = false\n` +
      (process.platform === 'darwin' ? 'version = 3.14.8\n' : ''),
    'Auxiliary venv metadata is not the fixed isolated capsule');
  const protectedRoots = [input.source.root, input.stock.root, input.stock.artifactRoot, input.originalRoot, input.derivedRoot,
    input.nativeNode.root, input.renovate.root, input.workspace.root, input.registry.root, input.wrapper.root, observation, python.root];
  for (const root of protectedRoots) requireValue(!contains(root, output) && !contains(output, root), 'Protected inputs overlap raw output');
  for (const file of [inputFile, input.preparation.path, input.profile.path, input.contextPlan.path]) requireValue(!contains(output, file), 'Output overlaps protected selected input');
  let context = null;
  if (contextReady) {
    const launchFile = path.join(output, 'context/launch.json');
    const launchIdentity = await hashFile(launchFile, 4_096);
    const launch = (await readonlyFile(launchFile, launchIdentity.sha256, 4_096)).document;
    exact(launch, ['schemaVersion', 'qualificationContractRevision', 'evidenceScope', 'contextSha256']);
    requireValue(launch.schemaVersion === 1 && launch.qualificationContractRevision === 2 && launch.evidenceScope === 'source-fixture', 'No source context handoff');
    context = (await readonlyFile(plan.contextFile, process.env.VITEST_NATIVE_CONTEXT_SHA256, 4_096)).document;
    requireValue(process.env.VITEST_NATIVE_CONTEXT_SHA256 === launch.contextSha256, 'Context pin missing before loader/collection');
  }
  return { input, profile, observation, plan, parentNode, nativeNode, renovateRoot, context, executingRoot,
    inputFile, inputPin, output, pythonExe, componentInventories, binding: { qualificationContractRevision: 2, sourceRevision: profile.sourceRevision,
      transformRevision: profile.transformRevision, profileSha256: input.profile.sha256,
      originalArchiveSha256: profile.originalArchiveSha256, originalBundleSha256: profile.originalBundleSha256,
      derivedBundleSha256: profile.derivedBundleSha256 } };
}
