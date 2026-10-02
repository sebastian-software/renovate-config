#!/usr/bin/env node
// Local pinned API/process contracts only; no production helper or fleet proof.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { values } = parseArgs({ options: { 'runtime-profile': { type: 'string' }, 'renovate-root': { type: 'string' }, 'pnpm-cli': { type: 'string' }, output: { type: 'string' }, 'timeout-proof-only': { type: 'boolean', default: false } } });
const profileName = values['runtime-profile'] ?? 'reference44';
const profiles = {
  reference44: { renovate: '44.127.1', node: '24.21.0', pnpm: '11.20.0', source: 'f3ec5e6b5166b327833f63a531179d89fd8fc9db' },
  'candidate43-consumer11': { renovate: '43.288.0', node: '24.18.0', pnpm: '11.17.0' },
};
const profile = profiles[profileName];
assert(profile, 'Unsupported --runtime-profile: ' + profileName);
assert(values['renovate-root'] && values['pnpm-cli'], 'Supply pinned --renovate-root and --pnpm-cli.');
assert.equal(process.versions.node, profile.node);
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = join(repo, 'tests/fixtures/vitest-worker-contract');
const renovateRoot = resolve(values['renovate-root']);
const pnpmCli = resolve(values['pnpm-cli']);
const output = values.output ? resolve(values.output) : await mkdtemp(join(tmpdir(), 'vitest-worker-contract-'));
if (values.output) await mkdir(output);
console.log('Artifacts: ' + output);
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const save = async (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n');
const load = (path) => import(pathToFileURL(join(renovateRoot, 'dist', path)).href);
assert.equal((await json(join(renovateRoot, 'package.json'))).version, profile.renovate);
async function run(command, args, options = {}) {
  assert(['darwin', 'linux'].includes(process.platform), 'Owned process groups require macOS or Linux.');
  const { timeoutMs = 180000, allowTimeout = false, ...spawnOptions } = options;
  return new Promise((done, reject) => {
    // Own this POSIX group; descendants inherit it. Never signal other groups.
    const child = spawn(command, args, { ...spawnOptions, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', timedOut = false, closed = false, hardKilled = false, settled = false;
    let closeCode = null, closeSignal = null, killTimer, reapTimer;
    const killGroup = (signal) => {
      if (!Number.isInteger(child.pid) || child.pid <= 0) return;
      try { process.kill(-child.pid, signal); } catch (e) { if (e.code !== 'ESRCH') throw e; }
    };
    const finish = (cleanupTimedOut = false, error) => {
      if (settled) return;
      settled = true; clearTimeout(timer); clearTimeout(killTimer); clearTimeout(reapTimer);
      const result = { code: closeCode, signal: closeSignal, stdout, stderr, timedOut, cleanupTimedOut, pid: child.pid };
      if (error) reject(error);
      else if (cleanupTimedOut || (timedOut && !allowTimeout)) reject(Object.assign(new Error('Owned command timeout/cleanup failure'), { code: 'LOCAL_COMMAND_TIMEOUT', result }));
      else done(result);
    };
    child.stdout.on('data', (s) => { stdout += s; }); child.stderr.on('data', (s) => { stderr += s; });
    const timer = setTimeout(() => {
      timedOut = true;
      try { killGroup('SIGTERM'); } catch (e) { finish(false, e); return; }
      // Even if the leader closes early, kill any remaining owned descendants.
      killTimer = setTimeout(() => {
        try { killGroup('SIGKILL'); } catch (e) { finish(false, e); return; }
        hardKilled = true;
        if (closed) { finish(); return; }
        reapTimer = setTimeout(() => {
          child.stdout.destroy(); child.stderr.destroy(); child.unref();
          finish(true);
        }, 1000);
      }, 200);
    }, timeoutMs);
    child.on('error', (e) => finish(false, e));
    child.on('close', (code, signal) => {
      closed = true; closeCode = code; closeSignal = signal;
      if (!timedOut || hardKilled) finish();
    });
  });
}
async function proveOwnedTimeout() {
  const workspace = join(output, 'owned-timeout'); await mkdir(workspace);
  const started = Date.now();
  const result = await run(process.execPath, [join(fixture, 'process-tree-stub.mjs')], { cwd: workspace, timeoutMs: 2000, allowTimeout: true });
  assert.equal(result.timedOut, true); assert.equal(result.cleanupTimedOut, false);
  assert(Date.now() - started < 3500, 'Timeout cleanup must be bounded.');
  const pids = await json(join(workspace, 'owned-pids.json'));
  assert.equal(result.pid, pids.parent);
  try {
    for (const pid of [pids.parent, pids.grandchild]) {
      let alive = true;
      const deadline = Date.now() + 1000;
      while (alive && Date.now() < deadline) {
        try { process.kill(pid, 0); } catch (e) { assert.equal(e.code, 'ESRCH'); alive = false; }
        if (alive) await new Promise((done) => setTimeout(done, 20));
      }
      assert.equal(alive, false, 'An owned fixture process survived its deadline: ' + pid);
    }
    await assert.rejects(readFile(join(workspace, 'late-marker.txt')), { code: 'ENOENT' });
  } finally {
    // On failed proof, clean up only the exact fixture PIDs, never process names.
    for (const pid of [pids.parent, pids.grandchild]) try { process.kill(pid, 'SIGKILL'); } catch (e) { if (e.code !== 'ESRCH') throw e; }
  }
  await save(join(workspace, 'result.json'), { ...result, elapsedMs: Date.now() - started, pids, delayedMarkerAbsent: true, boundary: 'Owned POSIX process group with inherited pipes; no unrelated process selection.' });
  console.log('owned-process-timeout: PASSED');
}
await proveOwnedTimeout();
if (values['timeout-proof-only']) process.exit(0);
const pnpmVersion = await run(process.execPath, [pnpmCli, '--version']);
assert.equal(pnpmVersion.code, 0); assert.equal(pnpmVersion.stdout.trim(), profile.pnpm);
const { init: initLogger, levels } = await load('logger/index.js'); await initLogger(); levels('stdout', 'warn');
const { GlobalConfig } = await load('config/global.js');
const { setCustomEnv } = await load('util/env.js');
const { resolveConfigPresets } = await load('config/presets/index.js');
const { mergeChildConfig } = await load('config/utils.js');
const { getConfig } = await load('config/defaults.js');
const { applyPackageRules } = await load('util/package-rules/index.js');
const { extractPackageJson } = await load('modules/manager/npm/extract/common/package-file.js');
const managerFiles = await load('workers/repository/extract/manager-files.js');
// 43.288.0 keeps extraction massageDepNames and process/fetch lookup name
// preparation private. Mirror those exact operations at this direct API seam;
// reference 44 retains its native exported normalization.
const normalizeDepNames = profileName === 'candidate43-consumer11'
  ? (dep) => {
    if (dep.packageName && !dep.depName) dep.depName = dep.packageName;
    if (typeof dep.depName === 'string') dep.depName = dep.depName.trim();
    dep.packageName ??= dep.depName;
  }
  : managerFiles.normalizeDepNames;
assert.equal(typeof normalizeDepNames, 'function');
const { initRepo, syncGit } = await load('util/git/index.js');
const { default: executePostUpgradeCommands } = await load('workers/repository/update/branch/execute-post-upgrade-commands.js');
const pin = await json(join(fixture, 'worker-policy.json'));
for (const [name, hash] of Object.entries(pin.localPresetSha256)) assert.equal(createHash('sha256').update(await readFile(join(repo, name))).digest('hex'), hash, name + ': refresh the pinned contract snapshot after a reviewed policy change.');
const rawDefault = await json(join(repo, 'default.json'));
const standards = await json(join(repo, 'standards.json'));
const internal = (await resolveConfigPresets(pin.sanitizedConfig)).config;
const localDefault = (await resolveConfigPresets(rawDefault)).config;
const policy = mergeChildConfig(mergeChildConfig(internal, localDefault), standards);
const policyPath = join(output, 'local-policy.json'); await save(policyPath, policy);
const config = mergeChildConfig(getConfig(), policy);
const deps = extractPackageJson(await json(join(repo, 'tests/fixtures/vitest-lockstep/package.json')), 'package.json').deps;
const observed = [];
for (const dep of deps) {
  normalizeDepNames(dep);
  const applied = await applyPackageRules(mergeChildConfig(config, { ...dep, manager: 'npm', updateType: 'patch', packageFile: 'package.json' }), 'worker-contract');
  observed.push({ name: dep.depName, minimumReleaseAge: applied.minimumReleaseAge, dependencyDashboardApproval: applied.dependencyDashboardApproval });
}
assert(observed.every((d) => d.minimumReleaseAge === '3 days' && d.dependencyDashboardApproval === true));
const standardsDep = await applyPackageRules(mergeChildConfig(config, { datasource: 'custom.sebastian-software-standards', depName: 'standards', packageName: 'standards', updateType: 'minor' }), 'worker-contract-standards');
assert.deepEqual(standardsDep.postUpgradeTasks, standards.packageRules[0].postUpgradeTasks);
assert.equal(standardsDep.minimumReleaseAge, '0'); assert.equal(standardsDep.dependencyDashboardApproval, false);
await save(join(output, 'policy-observations.json'), { pin, ordinary: observed, standardsTasks: standardsDep.postUpgradeTasks, standardsTasksExecuted: false });

console.log('Generating real regular/advisory pipeline branches...');
const pipeline = join(output, 'pipeline');
const baseline = await run(process.execPath, [join(repo, 'scripts/test-vitest-lockstep.mjs'), '--renovate-root', renovateRoot,
  '--pnpm-cli', pnpmCli, '--runtime-profile', profileName, '--output', pipeline, '--policy-input', policyPath, '--require-security'], { cwd: repo });
await writeFile(join(output, 'pipeline.log'), baseline.stdout + baseline.stderr);
assert.equal(baseline.code, 1, baseline.stdout + baseline.stderr);
assert.equal(baseline.signal, null, baseline.stdout + baseline.stderr);
const baselineSummary = await json(join(pipeline, 'summary.json')).catch((error) => {
  throw new Error('Native pipeline failed before producing mismatch evidence: ' + baseline.stdout + baseline.stderr, { cause: error });
});
assert.equal(baselineSummary.results[0].state, 'PASSED');
assert.equal(baselineSummary.securityAcceptance, 'FAILED');
for (const result of baselineSummary.results.slice(1)) {
  assert.equal(result.state, 'FAILED: advisory-only companion mismatch'); assert.equal(result.vitest, '4.1.11'); assert.equal(result.coverage, '4.1.10');
}
const regular = await json(join(pipeline, 'regular/hook-input.json'));
const advised = await json(join(pipeline, 'security-default/hook-input.json'));
assert.equal(regular.upgrades.length, 2);
assert.equal(regular.dependencyDashboardApproval, true); assert.equal(regular.minimumReleaseAge, '3 days');
assert.equal(advised.upgrades.find((u) => u.depName === 'vitest').newVersion, '4.1.11');
assert.equal(advised.upgrades.find((u) => u.depName === 'vitest').isVulnerabilityAlert, true);
assert.equal(advised.minimumReleaseAge, null); assert.equal(advised.dependencyDashboardApproval, false);
const bin = join(output, 'bin'); await mkdir(bin); await symlink(process.execPath, join(bin, 'node'));
setCustomEnv({ PATH: bin + ':' + process.env.PATH });
const projected = (b) => b.upgrades.map((u) => ({ depName: u.depName, packageFile: u.packageFile, newVersion: u.newVersion, isVulnerabilityAlert: Boolean(u.isVulnerabilityAlert) }));
const hookResults = [];
async function hookCase(name, branch, { denied = false, fail = false, noChanges = false, template = '{{{toJSON upgrades}}}', expectError = false } = {}) {
  const workspace = join(output, name); await mkdir(workspace);
  const origin = join(output, name + '-origin'); await mkdir(origin);
  await cp(join(repo, 'tests/fixtures/vitest-lockstep/package.json'), join(origin, 'package.json'));
  await cp(join(fixture, 'post-upgrade-stub.mjs'), join(origin, 'post-upgrade-stub.mjs'));
  // Fixture-only Git history; never touch the delivery checkout index/history.
  for (const args of [['init', '-q', '-b', 'main'], ['add', '.'], ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Local fixture seed']]) {
    const git = await run('git', args, { cwd: origin }); assert.equal(git.code, 0, git.stderr);
  }
  GlobalConfig.set({ localDir: workspace, cacheDir: join(workspace, 'cache'), binarySource: 'global', allowScripts: true,
    allowedCommands: denied ? [] : ['^node post-upgrade-stub\\.mjs' + (fail ? ' --fail' : '') + '$'],
    allowShellExecutorForPostUpgradeCommands: false, executionTimeout: 1 });
  await initRepo({ url: origin, repository: 'fixture/worker-contract', baseBranch: 'main', defaultBranch: 'main' });
  await syncGit();
  const manifest = await readFile(join(pipeline, name === 'hook-advisory' ? 'security-default' : 'regular', 'package.json'), 'utf8');
  const tasks = { executionMode: 'branch', commands: ['node post-upgrade-stub.mjs' + (fail ? ' --fail' : '')], dataFileTemplate: template, fileFilters: ['stub-*.json', 'stub-marker.txt'] };
  const changed = noChanges ? [] : [{ type: 'addition', path: 'package.json', contents: manifest }];
  const result = await executePostUpgradeCommands({ ...structuredClone(branch), postUpgradeTasks: tasks, updatedPackageFiles: changed, updatedArtifacts: [] });
  let marker = ''; try { marker = await readFile(join(workspace, 'stub-marker.txt'), 'utf8'); } catch (e) { assert.equal(e.code, 'ENOENT'); }
  if (noChanges) { assert.equal(result, null); assert.equal(marker, ''); }
  else if (denied) { assert.equal(marker, ''); assert(result.artifactErrors.some((e) => /allowed list/.test(e.stderr))); }
  else {
    assert.equal(marker, 'executed\n', name + ': branch must execute exactly once');
    if (fail) assert(result.artifactErrors.some((e) => e.stderr.includes('intentional-test-child-failure')), 'Expected the deliberate child failure, not arbitrary execution failure.');
    else if (expectError) assert(result.artifactErrors.length > 0);
    else {
      assert.deepEqual(result.artifactErrors, []);
      const data = await json(join(workspace, 'stub-data.json'));
      assert.deepEqual(data, projected(branch));
      assert(result.updatedArtifacts.some((a) => a.path === 'stub-data.json'));
    }
  }
  const summary = { name, executions: marker ? marker.trim().split('\n').length : 0, skipped: result === null, artifactErrors: result?.artifactErrors ?? [], boundary: 'Test stub transport/probe validation only; no production helper/status enforcement.' };
  await save(join(workspace, 'result.json'), summary); hookResults.push(summary);
  console.log(name + ': PASSED');
}
await hookCase('hook-no-changes', regular, { noChanges: true });
await hookCase('hook-allowed-two-upgrades', regular);
await hookCase('hook-advisory', advised);
await hookCase('hook-denied', regular, { denied: true });
await hookCase('hook-failed-child', regular, { fail: true });
await hookCase('hook-malformed-json', regular, { template: '{', expectError: true });
await hookCase('hook-invalid-target', regular, { template: '[{"depName":"vitest","packageFile":"package.json","newVersion":"invalid"}]', expectError: true });
await hookCase('hook-invalid-path', regular, { template: '[{"depName":"vitest","packageFile":"../outside.json","newVersion":"4.1.11"}]', expectError: true });

// Each installer owns its metadata/cache/store/lock context. Upstream package
// bytes/integrity are unchanged; only selected packument times are modeled.
const metadata = await json(join(repo, 'tests/fixtures/vitest-lockstep/registry-metadata.json'));
const names = ['vitest', '@vitest/coverage-v8', 'is-number'];
const targets = Object.fromEntries(names.map((name) => [name, Object.values(metadata).find((m) => m.name === name && m.version === (name === 'is-number' ? '7.0.0' : '4.1.11'))]));
assert(names.every((name) => targets[name]?.dist?.integrity), 'Every modeled release must have pinned real registry metadata and integrity.');
const installerResults = [];
async function installerCase(name, dependencies, excludes, { conflict = false } = {}) {
  const workspace = join(output, name); await mkdir(workspace);
  const clock = Date.now(), requests = [];
  const server = createServer(async (req, res) => {
    try {
      const packageName = decodeURIComponent(req.url.slice(1));
      requests.push({ path: req.url, packageName, observedAt: new Date().toISOString() });
      if (targets[packageName]) {
        const m = targets[packageName];
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ name: packageName, versions: { [m.version]: m }, 'dist-tags': { latest: m.version },
          time: { created: new Date(clock - 30 * 86400e3).toISOString(), modified: new Date(clock - 3600e3).toISOString(), [m.version]: new Date(clock - 3600e3).toISOString() } }));
      } else {
        const upstream = await fetch('https://registry.npmjs.org/' + encodeURIComponent(packageName), { signal: AbortSignal.timeout(30000) });
        res.statusCode = upstream.status; res.setHeader('Content-Type', 'application/json'); res.end(await upstream.text());
      }
    } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: e.message })); }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const registry = `http://127.0.0.1:${server.address().port}/`;
  await save(join(workspace, 'package.json'), { name: 'local-worker-contract', private: true, version: '1.0.0', dependencies });
  await writeFile(join(workspace, 'pnpm-workspace.yaml'), 'minimumReleaseAge: 1440\nautoInstallPeers: false\nstrictPeerDependencies: false\nminimumReleaseAgeExclude: ' + JSON.stringify(excludes) + '\n');
  await writeFile(join(workspace, '.npmrc'), 'registry=' + registry + '\n' + (conflict ? 'minimum-release-age=2880\n' : ''));
  const userconfig = join(workspace, 'user.npmrc'), globalconfig = join(workspace, 'global.npmrc');
  await writeFile(userconfig, ''); await writeFile(globalconfig, '');
  const env = { PATH: dirname(process.execPath) + ':' + process.env.PATH, CI: 'true', NPM_CONFIG_USERCONFIG: userconfig, NPM_CONFIG_GLOBALCONFIG: globalconfig, XDG_CACHE_HOME: join(workspace, 'xdg-cache'), XDG_CONFIG_HOME: join(workspace, 'xdg-config') };
  try {
    const args = [pnpmCli, 'install', '--ignore-scripts', '--ignore-pnpmfile', '--store-dir', join(workspace, 'store'), '--cache-dir', join(workspace, 'metadata-cache'), '--config.manage-package-manager-versions=false'];
    if (conflict) args.push('--config.minimum-release-age=30');
    await save(join(workspace, 'registry-input.json'), { clock: new Date(clock).toISOString(), modeledTargetTime: new Date(clock - 3600e3).toISOString(), targets, dependencies, exactExceptions: excludes, args, conflictingAgeMinutes: conflict ? { workspace: 1440, npmrc: 2880, cli: 30 } : null });
    const result = await run(process.execPath, args, { cwd: workspace, env });
    await writeFile(join(workspace, 'install.log'), result.stdout + result.stderr);
    for (const dep of Object.keys(dependencies)) assert(requests.some((r) => r.packageName === dep), name + ': target metadata was not observed');
    assert(Date.now() - clock < 180000, 'Case clock bound exceeded.');
    const success = (excludes.length > 0 || conflict) && !dependencies['is-number'];
    if (success) {
      assert.equal(result.code, 0, result.stdout + result.stderr);
      for (const [dep, version] of Object.entries(dependencies)) assert.equal((await json(join(workspace, 'node_modules', dep, 'package.json'))).version, version);
    } else { assert.notEqual(result.code, 0); assert.match(result.stdout + result.stderr, /ERR_PNPM_NO_MATURE_MATCHING_VERSION/, 'Rejection must be the exact native cooldown error.');
      assert.match(result.stdout + result.stderr, /minimumReleaseAge cutoff/);
      for (const [dep, version] of Object.entries(dependencies)) assert((result.stdout + result.stderr).includes(dep + '@' + version + ' was published at ' + new Date(clock - 3600e3).toISOString()), 'Cooldown error must identify the served target/time.');
      assert.doesNotMatch(result.stdout + result.stderr, /ECONNREFUSED|ETIMEDOUT|ERR_PNPM_FETCH_404|ERR_PNPM_FETCH_500/); }
    const summary = { name, exit: result.code, dependencies, exactExceptions: excludes, registry, clock: new Date(clock).toISOString(), modeledAgeMinutes: 60, conflictingAgeMinutes: conflict ? { workspace: 1440, npmrc: 2880, cli: 30 } : null, requests, scope: 'Synthetic native-installer metadata model; real immutable package tarballs; no fleet/publication-age claim.' };
    await save(join(workspace, 'result.json'), summary); installerResults.push(summary); console.log(name + ': PASSED');
  } finally { await new Promise((done) => server.close(done)); }
}
await installerCase('installer-baseline', { vitest: '4.1.11' }, []);
await installerCase('installer-exact-scoped', { vitest: '4.1.11', '@vitest/coverage-v8': '4.1.11' }, ['vitest@4.1.11', '@vitest/coverage-v8@4.1.11']);
await installerCase('installer-unrelated', { 'is-number': '7.0.0' }, ['vitest@4.1.11', '@vitest/coverage-v8@4.1.11']);
await installerCase('installer-config-precedence', { vitest: '4.1.11', '@vitest/coverage-v8': '4.1.11' }, [], { conflict: true });
await save(join(output, 'summary.json'), { runtimeProfile: profileName, reference: { renovate: profile.renovate, source: profile.source ?? null, node: process.versions.node, pnpm: profile.pnpm, renovateRoot, pnpmCli, nodePath: process.execPath, renovatePackageSha256: createHash('sha256').update(await readFile(join(renovateRoot, 'package.json'))).digest('hex') },
  localContracts: 'PASSED', hookResults, installerResults, nativeSecurityAcceptance: 'FAILED: companion mismatch retained', fullSecurityAlignment: 'NOT PROVEN', fleetProvenance: 'PENDING', requiredStatusEnforcement: 'PENDING' });
console.log('Local contracts: PASSED; full security alignment NOT PROVEN; fleet PENDING.');
