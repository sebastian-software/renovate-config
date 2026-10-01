#!/usr/bin/env node
// Pinned Renovate API integration; this does not create or validate hosted PRs.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { values } = parseArgs({ options: {
  'renovate-root': { type: 'string' },
  'pnpm-cli': { type: 'string' },
  output: { type: 'string' },
  'require-security': { type: 'boolean', default: false },
} });
assert(values['renovate-root'] && values['pnpm-cli'],
  'Supply --renovate-root for renovate@44.127.1 and --pnpm-cli for pnpm@11.20.0; run with Node 24.');
assert.match(process.version, /^v24\./, 'Use the Node 24 runtime used by CI.');
const renovateRoot = resolve(values['renovate-root']);
const pnpmCli = resolve(values['pnpm-cli']);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = join(repoRoot, 'tests/fixtures/vitest-lockstep');
const load = (path) => import(pathToFileURL(join(renovateRoot, 'dist', path)).href);
assert.equal(JSON.parse(await readFile(join(renovateRoot, 'package.json'), 'utf8')).version, '44.127.1');
const toolVersion = spawnSync(process.execPath, [pnpmCli, '--version'], { encoding: 'utf8', timeout: 10000 });
assert.equal(toolVersion.status, 0, toolVersion.stderr);
assert.equal(toolVersion.stdout.trim(), '11.20.0');

const { init: initLogger, levels } = await load('logger/index.js');
await initLogger();
levels('stdout', 'warn');
const { getConfig } = await load('config/defaults.js');
const { resolveConfigPresets } = await load('config/presets/index.js');
const { mergeChildConfig } = await load('config/utils.js');
const { GlobalConfig } = await load('config/global.js');
const { init: initMemory } = await load('util/cache/memory/index.js');
const { setCustomEnv } = await load('util/env.js');
const { parseSingleYaml } = await load('util/yaml.js');
const { applyPackageRules } = await load('util/package-rules/index.js');
const { extractPackageJson } = await load('modules/manager/npm/extract/common/package-file.js');
const { normalizeDepNames } = await load('workers/repository/extract/manager-files.js');
const { lookupUpdates } = await load('workers/repository/process/lookup/index.js');
const { branchifyUpgrades } = await load('workers/repository/updates/branchify.js');
const { updateDependency } = await load('modules/manager/npm/update/dependency/index.js');
const { generateLockFile } = await load('modules/manager/npm/post-update/pnpm.js');
const { detectVulnerabilityAlerts } = await load('workers/repository/init/vulnerability.js');
const { default: platformApis } = await load('modules/platform/api.js');
const { setPlatformApi } = await load('modules/platform/index.js');

const metadata = JSON.parse(await readFile(join(fixture, 'registry-metadata.json'), 'utf8'));
const advisory = JSON.parse(await readFile(join(fixture, 'advisory.json'), 'utf8'));
const seed = await readFile(join(fixture, 'package.json'), 'utf8');
const seedManifest = JSON.parse(seed);
const rawPreset = JSON.parse(await readFile(join(repoRoot, 'default.json'), 'utf8'));
const output = values.output ? resolve(values.output) : await mkdtemp(join(tmpdir(), 'vitest-lockstep-'));
if (values.output) await mkdir(output);
const bin = join(output, 'bin');
await mkdir(bin);
await symlink(pnpmCli, join(bin, 'pnpm'));
await symlink(process.execPath, join(bin, 'node'));
setCustomEnv({ PATH: bin + ':' + process.env.PATH });
await writeFile(join(output, 'proposed-default.json'), JSON.stringify(rawPreset, null, 2) + '\n');

async function resolvePreset(preset) {
  const { config } = await resolveConfigPresets(structuredClone(preset));
  return mergeChildConfig(mergeChildConfig(getConfig(), config), {
    semanticCommits: 'enabled', repository: 'fixture/vitest-lockstep',
    baseBranch: 'main', errors: [], warnings: [], repoIsOnboarded: true,
  });
}

const normalConfig = await resolvePreset(rawPreset);
const guard = rawPreset.packageRules.find((r) => r.groupName === 'vitest monorepo');
assert(guard, 'An explicit Vitest group must exist.');
assert.deepEqual(guard.matchManagers, ['npm']);
const expectedNames = ['vitest', '@vitest/coverage-v8', '@vitest/coverage-istanbul',
  '@vitest/ui', '@vitest/browser', '@vitest/browser-playwright',
  '@vitest/browser-preview', '@vitest/browser-webdriverio'];
assert.deepEqual([...guard.matchPackageNames].sort(), [...expectedNames].sort());
for (const name of expectedNames) {
  const input = { ...normalConfig, manager: 'npm', datasource: 'npm', depType: 'devDependencies',
    packageName: name, depName: name, currentValue: '4.1.10', currentVersion: '4.1.10' };
  const patch = await applyPackageRules({ ...input, updateType: 'patch' }, 'fixture-policy');
  const major = await applyPackageRules({ ...input, updateType: 'major' }, 'fixture-policy');
  assert.equal(patch.automerge, true);
  assert.equal(major.automerge, false);
  assert.equal(patch.semanticCommitType, 'fix');
  assert.equal(major.separateMajorMinor, true);
  assert.equal(patch.minimumReleaseAge, '1 day');
}
for (const name of ['@vitest/eslint-plugin', '@vitest/unrelated']) {
  const result = await applyPackageRules({ ...getConfig(), packageRules: [guard], manager: 'npm',
    datasource: 'npm', packageName: name, depName: name, updateType: 'patch' }, 'fixture-name-guard');
  assert.equal(result.groupName, null, name + ' must remain outside the explicit group.');
}

function summarizeBranch(branch) {
  return { branchName: branch.branchName, automerge: branch.automerge,
    dependencyDashboardApproval: branch.dependencyDashboardApproval,
    minimumReleaseAge: branch.minimumReleaseAge, commitMessage: branch.commitMessage,
    isVulnerabilityAlert: Boolean(branch.isVulnerabilityAlert),
    upgrades: branch.upgrades.map((u) => ({ depName: u.depName, newValue: u.newValue,
      newVersion: u.newVersion, updateType: u.updateType, pendingChecks: Boolean(u.pendingChecks),
      isVulnerabilityAlert: Boolean(u.isVulnerabilityAlert) })) };
}

async function runCase(mode) {
  initMemory();
  const security = mode !== 'regular';
  const workspace = join(output, mode);
  await mkdir(workspace);
  for (const file of ['package.json', 'pnpm-lock.yaml', '.npmrc']) await cp(join(fixture, file), join(workspace, file));
  GlobalConfig.set({ localDir: workspace, cacheDir: join(output, 'cache'), binarySource: 'global',
    allowScripts: false, executionTimeout: 3, internalHostAccess: 'allow' });
  // Only the lookup boundary is replayed. Native pnpm uses real package tarballs
  // and the committed seed lockfile, with scripts and pnpmfile execution disabled.
  const packuments = {};
  for (const depName of Object.keys(seedManifest.devDependencies)) {
    const entries = Object.values(metadata).filter((m) => m.name === depName && (security || m.version !== '5.0.3'));
    const versions = Object.fromEntries(entries.map((m) => [m.version, m]));
    const time = Object.fromEntries(entries.map((m) => [m.version,
      new Date(Date.now() - (security && m.version !== '4.1.10' ? 3600e3 : 7 * 86400e3)).toISOString()]));
    packuments[depName] = { name: depName, versions, time,
      'dist-tags': { latest: entries.at(-1).version }, repository: entries[0].repository };
  }
  await writeFile(join(workspace, 'registry-input.json'), JSON.stringify(packuments, null, 2) + '\n');
  const server = createServer((req, res) => {
    const body = packuments[decodeURIComponent(req.url.slice(1))];
    res.writeHead(body ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body ?? { error: 'fixture-package-not-found' }));
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const registry = `http://127.0.0.1:${server.address().port}`;
  try {
    let config = await resolvePreset(rawPreset);
    config.dependencyDashboardApproval = security;
    if (security) {
      if (mode === 'security-group') config.vulnerabilityAlerts = { ...config.vulnerabilityAlerts, groupName: 'vitest monorepo' };
      // Contract-faithful platform alert input; actual Renovate initialization
      // derives the advised-package rule. No upgrade arrays are fabricated.
      platformApis.set('local', { ...platformApis.get('local'), getVulnerabilityAlerts: async () => [advisory] });
      setPlatformApi('local');
      config = await detectVulnerabilityAlerts(config);
      const alertRules = config.packageRules.filter((r) => r.isVulnerabilityAlert);
      assert.equal(alertRules.length, 1);
      assert.deepEqual(alertRules[0].matchPackageNames, ['vitest']);
      await writeFile(join(workspace, 'advisory-rules.json'), JSON.stringify(alertRules, null, 2) + '\n');
    }
    const extracted = extractPackageJson(JSON.parse(seed), 'package.json');
    for (const dep of extracted.deps) normalizeDepNames(dep);
    const deps = [];
    for (const dep of extracted.deps.filter((d) => d.depType === 'devDependencies')) {
      let depConfig = mergeChildConfig(config, { ...dep, manager: 'npm', packageFile: 'package.json',
        lockedVersion: dep.currentValue, registryUrls: [registry] });
      depConfig = await applyPackageRules(depConfig, 'fixture-pre-lookup');
      const updates = (await lookupUpdates(depConfig)).unwrapOrThrow();
      assert.equal(updates.warnings.length, 0, dep.depName + ' lookup warnings');
      deps.push({ ...dep, lockedVersion: dep.currentValue, ...updates });
    }
    const packageFile = { ...extracted, packageFile: 'package.json',
      managerData: { ...extracted.managerData, pnpmLockFile: 'pnpm-lock.yaml' }, deps };
    const packageFiles = { npm: [packageFile] };
    const { branches } = await branchifyUpgrades(config, packageFiles);
    const branch = security ? branches.find((b) => b.isVulnerabilityAlert) : branches[0];
    assert(branch, 'The intended generated branch must exist.');
    if (!security) {
      assert.equal(branches.length, 1);
      assert.deepEqual(branch.upgrades.map((u) => u.depName).sort(), ['@vitest/coverage-v8', 'vitest']);
      assert.equal(branch.automerge, true);
      assert.match(branch.commitMessage, /^fix\(deps\):/);
    } else {
      const vitest = branch.upgrades.find((u) => u.depName === 'vitest');
      assert.equal(vitest.newVersion, '4.1.11', 'Security must select lowest-fixed, not newer 5.0.3.');
      assert.equal(vitest.pendingChecks, undefined, 'The advised update must bypass the release-age barrier.');
      assert.equal(branch.minimumReleaseAge, null);
      assert.equal(branch.dependencyDashboardApproval, false);
      const coverage = deps.find((d) => d.depName === '@vitest/coverage-v8');
      assert.equal(coverage.updates[0].pendingChecks, true, 'The unadvised companion must actually exercise the ordinary age barrier.');
    }
    await writeFile(join(workspace, 'branches.json'), JSON.stringify(branches.map(summarizeBranch), null, 2) + '\n');
    let contents = seed;
    for (const upgrade of branch.upgrades) {
      contents = updateDependency({ fileContent: contents, packageFile: 'package.json', upgrade });
      assert(contents, 'Renovate must generate the manifest update.');
    }
    const manifest = JSON.parse(contents);
    assert.deepEqual(Object.keys(manifest.devDependencies), Object.keys(seedManifest.devDependencies), 'Absent optional companions must not be added.');
    for (const name of ['@vitest/eslint-plugin', 'is-number']) assert.equal(manifest.devDependencies[name], seedManifest.devDependencies[name]);
    await writeFile(join(workspace, 'package.json'), contents);
    const generated = await generateLockFile('.', {}, { ...branch,
      constraints: { pnpm: '11.20.0', node: process.versions.node } }, branch.upgrades);
    assert(!generated.error, generated.stdout || generated.stderr || 'Native lock generation failed.');
    const lock = parseSingleYaml(generated.lockFile);
    const importer = lock.importers['.'].devDependencies;
    assert.deepEqual(Object.keys(importer).sort(), Object.keys(seedManifest.devDependencies).sort());
    for (const [name, version] of Object.entries(manifest.devDependencies)) {
      assert.equal(importer[name].specifier, version);
      assert(importer[name].version.startsWith(version), name + ' importer resolution must match its declaration.');
    }
    const frozen = spawnSync(process.execPath, [pnpmCli, 'install', '--frozen-lockfile', '--ignore-scripts', '--ignore-pnpmfile',
      '--store-dir', join(output, 'frozen-store')], { cwd: workspace, encoding: 'utf8', timeout: 180000 });
    await writeFile(join(workspace, 'frozen-install.log'), (frozen.stdout ?? '') + (frozen.stderr ?? ''));
    assert.equal(frozen.status, 0, frozen.error?.message || frozen.stderr || frozen.stdout);
    const aligned = manifest.devDependencies.vitest === '4.1.11' && manifest.devDependencies['@vitest/coverage-v8'] === '4.1.11';
    if (aligned) {
      assert.equal(lock.packages['@vitest/coverage-v8@4.1.11'].peerDependencies.vitest, '4.1.11');
      assert(importer['@vitest/coverage-v8'].version.includes('vitest@4.1.11'), 'Coverage peer must resolve to the generated Vitest version.');
    }
    const files = ['package.json', 'pnpm-lock.yaml'].filter((file) => file === 'package.json'
      ? contents !== seed : generated.lockFile !== undefined);
    const result = { mode, branchName: branch.branchName, files, frozenInstallExit: frozen.status,
      vitest: manifest.devDependencies.vitest, coverage: manifest.devDependencies['@vitest/coverage-v8'],
      aligned, state: aligned ? 'PASSED' : 'FAILED: advisory-only companion mismatch' };
    await writeFile(join(workspace, 'result.json'), JSON.stringify(result, null, 2) + '\n');
    if (!security) assert(aligned, 'Regular manifests and lockfile must align at 4.1.11.');
    console.log(`${mode}: ${result.state}; frozen-lockfile=${frozen.status}`);
    return result;
  } finally { await new Promise((done) => server.close(done)); }
}

const results = [];
for (const mode of values['require-security'] ? ['regular', 'security-default', 'security-group'] : ['regular']) results.push(await runCase(mode));
const summary = { renovate: '44.127.1', renovateSourceCommit: 'f3ec5e6b5166b327833f63a531179d89fd8fc9db',
  node: process.versions.node, pnpm: '11.20.0', results,
  securityAcceptance: values['require-security'] ? (results.every((r) => r.aligned) ? 'PASSED' : 'FAILED') : 'NOT RUN',
  boundary: 'Real Renovate config/extraction/alert/lookup/branchification/update APIs and native pnpm artifacts; no hosted PR or deployed worker failure/status proof.' };
await writeFile(join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log('Artifacts: ' + output);
if (results.some((r) => !r.aligned)) process.exitCode = 1;
