#!/usr/bin/env node
// Actual advisory branch hook plus native pnpm state assertions; no hosted proof.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
const { values } = parseArgs({ options: { 'runtime-profile': { type: 'string', default: 'reference44' }, 'renovate-root': { type: 'string' }, 'pnpm-cli': { type: 'string' }, output: { type: 'string' } } });
const profiles = { reference44: { node: '24.21.0', renovate: '44.127.1', pnpm: '11.20.0' }, 'candidate43-consumer11': { node: '24.18.0', renovate: '43.288.0', pnpm: '11.17.0' } };
const profile = profiles[values['runtime-profile']]; assert(profile); assert.equal(process.versions.node, profile.node);
assert(values['renovate-root'] && values['pnpm-cli']);
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..'), fixture = join(repo, 'tests/fixtures/vitest-helper');
const helper = join(repo, 'scripts/vitest-lockstep.mjs'), cli = resolve(values['pnpm-cli']), renovate = resolve(values['renovate-root']);
const load = (p) => import(pathToFileURL(join(renovate, 'dist', p)).href);
const requireRuntime = createRequire(join(repo, 'scripts/vitest-lockstep/package.json'));
const YAML = requireRuntime('yaml'), semver = requireRuntime('semver');
const { runHelper } = await import(pathToFileURL(helper));
const json = async (p) => JSON.parse(await readFile(p, 'utf8'));
const save = (p, value) => writeFile(p, JSON.stringify(value, null, 2) + '\n');
assert.equal((await json(join(renovate, 'package.json'))).version, profile.renovate);
const output = values.output ? resolve(values.output) : await mkdtemp(join(tmpdir(), 'vitest-helper-')); if (values.output) await mkdir(output);
console.log('Artifacts: ' + output);
// Keep the modeled registry independent of trusted user auth routing. Native
// pnpm11 global `_auth` registry routes override workspace registries.
const configHome = join(output, 'xdg-config'); await mkdir(configHome);
const userConfig = join(output, 'empty-user.npmrc'); await writeFile(userConfig, '');
const globalConfig = join(output, 'empty-global.npmrc'); await writeFile(globalConfig, '');
for (const key of Object.keys(process.env)) if (/^(?:npm|pnpm)_config_/i.test(key)) delete process.env[key];
process.env.XDG_CONFIG_HOME = configHome; process.env.NPM_CONFIG_USERCONFIG = userConfig; process.env.NPM_CONFIG_GLOBALCONFIG = globalConfig;
const results = [];
async function run(command, args, cwd, name, env = {}) {
  const result = await new Promise((done, reject) => {
    const child = spawn(command, args, { cwd, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PATH: dirname(process.execPath) + ':' + process.env.PATH, CI: 'true', ...env } });
    let stdout = '', stderr = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, 'SIGKILL'); } catch (e) { if (e.code !== 'ESRCH') reject(e); } }, 180000);
    child.stdout.on('data', (s) => { stdout += s; }); child.stderr.on('data', (s) => { stderr += s; });
    child.on('error', reject); child.on('close', (code, signal) => { clearTimeout(timer); done({ code, signal, stdout, stderr, timedOut }); });
  });
  await writeFile(join(output, name + '.log'), result.stdout + result.stderr); assert.equal(result.timedOut, false, name + ' timed out'); return result;
}
const pnpm = (args, cwd, name) => run(process.execPath, [cli, ...args, '--pm-on-fail=ignore', '--config.runtime-on-fail=ignore', '--config.ignore-scripts=true', '--config.ignore-pnpmfile=true'], cwd, name);
const pipeline = join(output, 'pipeline');
const native = await run(process.execPath, [join(repo, 'scripts/test-vitest-lockstep.mjs'), '--runtime-profile', values['runtime-profile'], '--renovate-root', renovate, '--pnpm-cli', cli, '--require-security', '--output', pipeline], repo, 'native-security');
assert.equal(native.code, 1, native.stdout + native.stderr);
const nativeSummary = await json(join(pipeline, 'summary.json')); assert.equal(nativeSummary.results[0].state, 'PASSED');
for (const result of nativeSummary.results.slice(1)) { assert.equal(result.state, 'FAILED: advisory-only companion mismatch'); assert.equal(result.vitest, '4.1.11'); assert.equal(result.coverage, '4.1.10'); }
const branch = await json(join(pipeline, 'security-default/hook-input.json'));
const advised = branch.upgrades.find((u) => u.depName === 'vitest'); assert.equal(advised.newVersion, '4.1.11'); assert.equal(advised.isVulnerabilityAlert, true);
const { init: initLogger, levels } = await load('logger/index.js'); await initLogger(); levels('stdout', 'warn');
const { GlobalConfig } = await load('config/global.js'), { setCustomEnv } = await load('util/env.js');
const { initRepo, syncGit } = await load('util/git/index.js');
const { default: executePostUpgradeCommands } = await load('workers/repository/update/branch/execute-post-upgrade-commands.js');
const bin = join(output, 'bin'); await mkdir(bin); await symlink(process.execPath, join(bin, 'node'));
setCustomEnv({ PATH: bin + ':' + process.env.PATH });
async function hookCase(name, denied = false, missing = false) {
  const origin = join(output, name + '-origin'), workspace = join(output, name); await mkdir(origin); await mkdir(workspace);
  for (const file of ['package.json', 'pnpm-lock.yaml', '.npmrc']) await cp(join(pipeline, 'security-default', file), join(origin, file));
  const wrapper = `import { appendFile } from 'node:fs/promises';\nimport { runHelper } from ${JSON.stringify(pathToFileURL(missing ? helper + '.missing' : helper).href)};\nawait appendFile('helper-executions.txt', 'executed\\n');\nconst result = await runHelper({env:{...process.env,VITEST_LOCKSTEP_PNPM_CLI:${JSON.stringify(cli)}}});\nconsole.log(JSON.stringify(result));\n`;
  await writeFile(join(origin, 'helper-wrapper.mjs'), wrapper);
  for (const args of [['init', '-q', '-b', 'main'], ['add', '.'], ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Helper fixture seed']]) { const g = await run('git', args, origin, name + '-git'); assert.equal(g.code, 0, g.stderr); }
  GlobalConfig.set({ localDir: workspace, cacheDir: join(workspace, 'cache'), binarySource: 'global', allowScripts: false, allowedCommands: denied ? [] : ['^node helper-wrapper\\.mjs$'], allowShellExecutorForPostUpgradeCommands: false, executionTimeout: 3 });
  await initRepo({ url: origin, repository: 'fixture/helper', baseBranch: 'main', defaultBranch: 'main' }); await syncGit();
  const result = await executePostUpgradeCommands({ ...structuredClone(branch), postUpgradeTasks: { executionMode: 'branch', commands: ['node helper-wrapper.mjs'], dataFileTemplate: '{{{toJSON upgrades}}}', fileFilters: ['**/package.json', 'pnpm-lock.yaml'] }, updatedPackageFiles: [{ type: 'addition', path: 'package.json', contents: await readFile(join(origin, 'package.json'), 'utf8') }], updatedArtifacts: [] });
  let executions = ''; try { executions = await readFile(join(workspace, 'helper-executions.txt'), 'utf8'); } catch (e) { assert.equal(e.code, 'ENOENT'); }
  if (denied || missing) { assert.equal(executions, ''); assert(result.artifactErrors.length > 0); }
  else { assert.equal(executions, 'executed\n'); assert.deepEqual(result.artifactErrors, []); const m = await json(join(workspace, 'package.json')); assert.equal(m.devDependencies.vitest, '4.1.11'); assert.equal(m.devDependencies['@vitest/coverage-v8'], '4.1.11'); const lock = YAML.parse(await readFile(join(workspace, 'pnpm-lock.yaml'), 'utf8')); assert.equal(lock.importers['.'].devDependencies['@vitest/coverage-v8'].version.split('(')[0], '4.1.11'); assert(lock.importers['.'].devDependencies['@vitest/coverage-v8'].version.includes('vitest@4.1.11')); const frozen = await pnpm(['install', '--frozen-lockfile'], workspace, name + '-frozen'); assert.equal(frozen.code, 0, frozen.stdout + frozen.stderr); }
  results.push({ name, executions: executions ? 1 : 0, artifactErrors: result.artifactErrors, state: 'PASSED' }); console.log(name + ': PASSED');
}
await hookCase('actual-advisory-helper'); await hookCase('denied-helper', true); await hookCase('missing-helper', false, true);
const metadata = await json(join(fixture, 'target-metadata.json'));
const originalMetadata = await json(join(repo, 'tests/fixtures/vitest-lockstep/registry-metadata.json'));
const youngControl = await json(join(fixture, 'young-control-metadata.json'));
const clock = Date.now(); const requests = []; const packuments = new Map(); let holdMetadata = false;
const server = createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(req.url.slice(1)); requests.push(name);
    await save(join(output, 'registry-requests.json'), requests);
    if (holdMetadata) return;
    const pinned = metadata[name] ?? (name === 'is-number' ? Object.values(originalMetadata).find((m) => m.name === name) : name === 'is-odd' ? youngControl : null);
    if (pinned) {
      const entries = Object.values(originalMetadata).filter((m) => m.name === name); entries.push(pinned);
      if (!packuments.has(name)) { const response = await fetch('https://registry.npmjs.org/' + encodeURIComponent(name), { signal: AbortSignal.timeout(30000) }); assert(response.ok); packuments.set(name, await response.json()); }
      const upstream = packuments.get(name);
      const versions = { ...upstream.versions, ...Object.fromEntries(entries.map((m) => [m.version, m])) };
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ name, versions, 'dist-tags': { latest: name === 'vitest' ? '5.0.3' : pinned.version }, time: { ...upstream.time, [pinned.version]: new Date(clock - 3600e3).toISOString(), '4.1.10': new Date(clock - 30 * 86400e3).toISOString() } }));
    } else { const upstream = await fetch('https://registry.npmjs.org/' + encodeURIComponent(name), { signal: AbortSignal.timeout(30000) }); res.statusCode = upstream.status; res.setHeader('Content-Type', 'application/json'); res.end(await upstream.text()); }
  } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: e.message })); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const registry = 'http://127.0.0.1:' + server.address().port + '/';
const env = { RENOVATE_POST_UPGRADE_COMMAND_DATA_FILE: join(output, 'upgrades.json'), VITEST_LOCKSTEP_PNPM_CLI: cli };
await save(env.RENOVATE_POST_UPGRADE_COMMAND_DATA_FILE, [{ ...advised, packageFile: 'packages/a/package.json' }]);
const seed = join(output, 'multi-seed'); await cp(fixture, seed, { recursive: true });
const rootManifest = await json(join(seed, 'package.json')); rootManifest.packageManager = 'pnpm@' + profile.pnpm; await save(join(seed, 'package.json'), rootManifest);
const paths = ['package.json', 'packages/a/package.json', 'packages/b/package.json', 'packages/c/package.json', 'pnpm-lock.yaml', '.npmrc', 'pnpm-workspace.yaml'];
try {
  const declarations = {};
  for (const importer of ['packages/a', 'packages/b']) { const m = await json(join(seed, importer, 'package.json')); declarations[importer] = structuredClone(m); for (const name of ['vitest', '@vitest/coverage-v8']) m.devDependencies[name] = '4.1.10'; await save(join(seed, importer, 'package.json'), m); }
  // Build the old installed graph natively with its ordinary age policy. No
  // committed seed lock exists and no unrelated young release is exempted.
  const workspaceConfig = YAML.parseDocument(await readFile(join(seed, 'pnpm-workspace.yaml'), 'utf8'));
  workspaceConfig.setIn(['registries', 'default'], registry); workspaceConfig.set('pmOnFail', 'download');
  await writeFile(join(seed, 'pnpm-workspace.yaml'), String(workspaceConfig));
  await writeFile(join(seed, '.npmrc'), 'registry=' + registry + '\n');
  const initial = await pnpm(['install', '--lockfile-only'], seed, 'multi-native-seed'); assert.equal(initial.code, 0, initial.stdout + initial.stderr);
  const doc = YAML.parseDocument(await readFile(join(seed, 'pnpm-lock.yaml'), 'utf8'));
  for (const [importer, manifest] of Object.entries(declarations)) { await save(join(seed, importer, 'package.json'), manifest); for (const [name, specifier] of Object.entries(manifest.devDependencies)) doc.setIn(['importers', importer, 'devDependencies', name, 'specifier'], specifier); }
  await writeFile(join(seed, 'pnpm-lock.yaml'), String(doc));
  const multi = join(output, 'multi-positive'); await cp(seed, multi, { recursive: true });
  const before = YAML.parse(await readFile(join(multi, 'pnpm-lock.yaml'), 'utf8'));
  const helperRequestStart = requests.length;
  const success = await runHelper({ root: multi, env, fault: async (phase, { stage }) => { if (phase === 'before-metadata') {
    const effective = await pnpm(['config', 'get', 'registries', '--json'], stage, 'actual-stage-registry'); assert.equal(effective.code, 0);
    assert.equal(JSON.parse(effective.stdout).default, registry);
    await save(join(output, 'actual-helper-query-boundary.json'), { stage, node: process.execPath, cli, registry,
      argv: ['view', 'vitest@4.1.11', '--json', '--loglevel=error', '--pm-on-fail=ignore', '--config.runtime-on-fail=ignore', '--config.ignore-scripts=true', '--config.ignore-pnpmfile=true'], configurationScope: 'Hermetic fixture; production native precedence preserved' });
  } } });
  for (const name of Object.keys(metadata)) assert(requests.slice(helperRequestStart).includes(name), 'Actual native selected metadata must use modeled registry: ' + name);
  assert.equal(success.pnpm, profile.pnpm); assert.equal(success.node, process.execPath); assert.equal(success.target, '4.1.11');
  assert(semver.satisfies('5.0.3', declarations['packages/a'].devDependencies.vitest), 'Newer candidate must be admitted by preserved expressive range');
  const after = YAML.parse(await readFile(join(multi, 'pnpm-lock.yaml'), 'utf8'));
  assert.equal(after.importers['packages/c'].devDependencies['@vitest/eslint-plugin'].specifier, before.importers['packages/c'].devDependencies['@vitest/eslint-plugin'].specifier);
  assert.equal(after.importers['packages/c'].devDependencies['@vitest/eslint-plugin'].version.split('(')[0], '1.6.27');
  for (const [key, value] of Object.entries(before.packages).filter(([key]) => key.startsWith('@vitest/eslint-plugin@') || key.startsWith('is-number@'))) assert.deepEqual(after.packages[key], value, 'Excluded package identity/integrity changed');
  assert.deepEqual(after.snapshots['is-number@7.0.0'], before.snapshots['is-number@7.0.0']);
  const eslintSnapshot = Object.entries(after.snapshots).find(([key]) => key.startsWith('@vitest/eslint-plugin@1.6.27('));
  assert(eslintSnapshot[0].includes('vitest@4.1.11')); assert.equal((eslintSnapshot[1].dependencies?.vitest ?? eslintSnapshot[1].optionalDependencies?.vitest).split('(')[0], '4.1.11');
  for (const importer of ['packages/a', 'packages/b']) {
    const manifest = await json(join(multi, importer, 'package.json'));
    assert.equal(manifest.devDependencies.vitest, declarations[importer].devDependencies.vitest);
    assert.equal(manifest.devDependencies['@vitest/coverage-v8'], importer.endsWith('/a') ? '~4.1.10' : '4.1.11');
    for (const name of ['vitest', '@vitest/coverage-v8']) assert.equal(after.importers[importer].devDependencies[name].version.split('(')[0], '4.1.11');
    assert(after.importers[importer].devDependencies['@vitest/coverage-v8'].version.includes('vitest@4.1.11'));
    for (const name of ['@vitest/eslint-plugin', 'is-number']) if (before.importers[importer].devDependencies[name]) assert.deepEqual(after.importers[importer].devDependencies[name], before.importers[importer].devDependencies[name]);
  }
  for (const [name, info] of Object.entries(metadata)) { assert.equal(success.targets[name], info.version); assert(after.packages[name + '@' + info.version]); for (const key of Object.keys(after.packages).filter((k) => k.startsWith(name + '@'))) assert.equal(key, name + '@4.1.11'); }
  for (const optional of ['@vitest/ui', '@vitest/browser', '@vitest/browser-playwright', '@vitest/browser-preview', '@vitest/browser-webdriverio', '@vitest/coverage-istanbul']) assert(!Object.keys(after.packages).some((key) => key.startsWith(optional + '@')), 'Absent optional companion added');
  const bytes = Object.fromEntries(await Promise.all(paths.map(async (p) => [p, await readFile(join(multi, p))])));
  const repeat = await runHelper({ root: multi, env }); assert.deepEqual(repeat.changedFiles, []); for (const p of paths) assert((await readFile(join(multi, p))).equals(bytes[p]), 'Idempotence bytes drift: ' + p);
  results.push({ name: 'multi-importer-ranges-internals-young-scoped-identity-idempotence', state: 'PASSED', result: success, metadataSha256: createHash('sha256').update(await readFile(join(fixture, 'target-metadata.json'))).digest('hex'), requests }); console.log('multi-positive: PASSED');
  async function negative(name, mutate, pattern, fault) {
    const workspace = join(output, name); await cp(seed, workspace, { recursive: true }); const input = { ...env }; await mutate(workspace, input);
    const originals = Object.fromEntries(await Promise.all(paths.map(async (p) => [p, await readFile(join(workspace, p))])));
    await assert.rejects(runHelper({ root: workspace, env: input, fault }), pattern);
    for (const p of paths) assert((await readFile(join(workspace, p))).equals(originals[p]), name + ': original bytes changed');
    results.push({ name, state: 'PASSED' }); console.log(name + ': PASSED');
  }
  await negative('missing-data', async (_, e) => { delete e.RENOVATE_POST_UPGRADE_COMMAND_DATA_FILE; }, /Missing Renovate data/);
  await negative('malformed-data', async (_, e) => { e.RENOVATE_POST_UPGRADE_COMMAND_DATA_FILE = join(output, 'malformed.json'); await writeFile(e.RENOVATE_POST_UPGRADE_COMMAND_DATA_FILE, '{'); }, /JSON/);
  await negative('missing-tool', async (_, e) => { e.VITEST_LOCKSTEP_PNPM_CLI = join(output, 'missing-cli'); }, /ENOENT/);
  await negative('escaping-path', async (_, e) => { e.RENOVATE_POST_UPGRADE_COMMAND_DATA_FILE = join(output, 'escaping.json'); await save(e.RENOVATE_POST_UPGRADE_COMMAND_DATA_FILE, [{ ...advised, packageFile: '../outside.json' }]); }, /Escaping packageFile/);
  await negative('conflicting-targets', async (_, e) => { e.RENOVATE_POST_UPGRADE_COMMAND_DATA_FILE = join(output, 'conflicting.json'); await save(e.RENOVATE_POST_UPGRADE_COMMAND_DATA_FILE, [{ ...advised, packageFile: 'packages/a/package.json' }, { ...advised, packageFile: 'packages/b/package.json', newVersion: '5.0.3' }]); }, /Conflicting resolved targets/);
  await negative('unsupported-manager', async (w) => { const m = await json(join(w, 'package.json')); m.packageManager = 'pnpm@12.6.0'; await save(join(w, 'package.json'), m); }, /Unsupported declared package manager/);
  await negative('catalog-ownership', async (w) => { await writeFile(join(w, 'pnpm-workspace.yaml'), await readFile(join(w, 'pnpm-workspace.yaml'), 'utf8') + 'catalog:\n  vitest: 4.1.10\n'); }, /Unsupported workspace ownership/);
  await negative('peer-ownership', async (w) => { const m = await json(join(w, 'packages/a/package.json')); m.peerDependencies = { vitest: '4.1.10' }; await save(join(w, 'packages/a/package.json'), m); }, /Unsupported affected manifest peer ownership/);
  await negative('runtime-download', async (w) => { const m = await json(join(w, 'package.json')); m.devEngines = { runtime: { name: 'node', version: '26.10.0', onFail: 'download' } }; await save(join(w, 'package.json'), m); }, /Unsupported runtime ownership/);
  await negative('config-dependencies', async (w) => { await writeFile(join(w, 'pnpm-workspace.yaml'), await readFile(join(w, 'pnpm-workspace.yaml'), 'utf8') + 'configDependencies:\n  malicious: 1.0.0\n'); }, /Unsupported workspace ownership/);
  const globalYaml = join(configHome, 'pnpm/config.yaml'); await mkdir(dirname(globalYaml), { recursive: true });
  try { await negative('global-config-dependencies', async () => { await writeFile(globalYaml, 'configDependencies:\n  malicious: 1.0.0\n'); }, /Unsupported global executable installer configuration/); }
  finally { await rm(globalYaml, { force: true }); }
  await negative('unavailable-companion', async (_, e) => { e.RENOVATE_POST_UPGRADE_COMMAND_DATA_FILE = join(output, 'unavailable.json'); await save(e.RENOVATE_POST_UPGRADE_COMMAND_DATA_FILE, [{ ...advised, packageFile: 'packages/a/package.json', newVersion: '4.1.999' }]); }, /Native pnpm failed|Unavailable/);
  await negative('failed-install', async () => {}, /intentional native install failure/, async (phase) => { if (phase === 'before-install') throw new Error('intentional native install failure'); });
  await negative('partial-publication', async () => {}, /intentional after first write/, async (phase, state) => { if (phase === 'after-write' && state.count === 1) throw new Error('intentional after first write'); });
  // Failure to recover is explicit and keeps the inspected partial artifact.
  const recovery = join(output, 'recovery-failure'); await cp(seed, recovery, { recursive: true });
  await assert.rejects(runHelper({ root: recovery, env, fault: async (phase, state) => { if (phase === 'after-write' && state.count === 1) throw new Error('publish failure'); if (phase === 'before-recovery') throw new Error('intentional recovery denial'); } }), /Explicit recovery failure/);
  assert.equal((await json(join(recovery, 'packages/b/package.json'))).devDependencies['@vitest/coverage-v8'], '4.1.11', 'Recovery denial must retain an actual earlier publication');
  results.push({ name: 'explicit-recovery-failure', state: 'PASSED', retainedPath: recovery });
  const hookDisabled = join(output, 'repository-hooks-disabled'); await cp(seed, hookDisabled, { recursive: true });
  const marker = join(output, 'unexpected-pnpmfile-execution');
  const pnpmfile = join(output, 'hostile-pnpmfile.cjs'); await writeFile(pnpmfile, `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'executed'); module.exports={};`);
  const hookConfig = YAML.parseDocument(await readFile(join(hookDisabled, 'pnpm-workspace.yaml'), 'utf8')); hookConfig.set('pnpmfile', pnpmfile);
  await writeFile(join(hookDisabled, 'pnpm-workspace.yaml'), String(hookConfig));
  await runHelper({ root: hookDisabled, env }); await assert.rejects(readFile(marker), { code: 'ENOENT' });
  results.push({ name: 'all-native-metadata-install-hooks-disabled', state: 'PASSED' });
  const drift = join(output, 'prepublish-drift'); await cp(seed, drift, { recursive: true });
  const external = Buffer.from((await readFile(join(drift, '.npmrc'), 'utf8')) + '# concurrent edit\n');
  await assert.rejects(runHelper({ root: drift, env, fault: async (phase) => { if (phase === 'before-publish') await writeFile(join(drift, '.npmrc'), external); } }), /Concurrent input modification/);
  assert((await readFile(join(drift, '.npmrc'))).equals(external)); assert.deepEqual(await json(join(drift, 'packages/b/package.json')), await json(join(seed, 'packages/b/package.json')));
  results.push({ name: 'prepublish-drift-preserved', state: 'PASSED' });
  const concurrent = join(output, 'publication-external-edit'); await cp(seed, concurrent, { recursive: true }); let externalName, externalBytes;
  await assert.rejects(runHelper({ root: concurrent, env, fault: async (phase, state) => { if (phase === 'after-write' && state.count === 1) { externalName = state.name; externalBytes = Buffer.from((await readFile(join(concurrent, state.name), 'utf8')) + ' \n'); await writeFile(join(concurrent, state.name), externalBytes); } } }), /Explicit recovery failure/);
  assert((await readFile(join(concurrent, externalName))).equals(externalBytes)); results.push({ name: 'publication-external-edit-manual-recovery-preserved', state: 'PASSED', retainedPath: concurrent });
  const timeout = join(output, 'owned-native-timeout'); await cp(seed, timeout, { recursive: true }); let timeoutStart;
  try { await assert.rejects(runHelper({ root: timeout, env, timeoutMs: 2000, fault: async (phase) => { if (phase === 'before-install') { holdMetadata = true; timeoutStart = Date.now(); } } }), /Owned pnpm command timed out/); }
  finally { holdMetadata = false; server.closeAllConnections(); }
  assert(timeoutStart && Date.now() - timeoutStart < 4000, 'Owned native timeout cleanup must be bounded');
  for (const p of paths) assert((await readFile(join(timeout, p))).equals(await readFile(join(seed, p)))); results.push({ name: 'owned-native-timeout-original-bytes', state: 'PASSED' });
  // New unrelated young dependency remains rejected even when inherited
  // is-number exclusion and all exact selected family exceptions are active.
  await negative('unrelated-young', async (w) => { const m = await json(join(w, 'packages/a/package.json')); m.devDependencies['is-odd'] = '3.0.1'; await save(join(w, 'packages/a/package.json'), m); }, /ERR_PNPM_(?:NO_MATURE_MATCHING_VERSION|MINIMUM_RELEASE_AGE_VIOLATION)/);
  const distribution = join(output, 'isolated-layout'); await mkdir(distribution); await cp(helper, join(distribution, 'vitest-lockstep.mjs')); await mkdir(join(distribution, 'vitest-lockstep'));
  for (const file of ['package.json', 'pnpm-lock.yaml']) await cp(join(repo, 'scripts/vitest-lockstep', file), join(distribution, 'vitest-lockstep', file));
  const isolatedInstall = await pnpm(['install', '--frozen-lockfile', '--offline'], join(distribution, 'vitest-lockstep'), 'isolated-runtime-install'); assert.equal(isolatedInstall.code, 0, isolatedInstall.stdout + isolatedInstall.stderr);
  const isolated = await run(process.execPath, [join(distribution, 'vitest-lockstep.mjs')], multi, 'isolated-layout', env); assert.equal(isolated.code, 0, isolated.stdout + isolated.stderr);
  const broken = join(output, 'broken-layout'); await mkdir(broken); await cp(helper, join(broken, 'vitest-lockstep.mjs')); await mkdir(join(broken, 'vitest-lockstep')); await cp(join(repo, 'scripts/vitest-lockstep/package.json'), join(broken, 'vitest-lockstep/package.json')); await symlink(join(distribution, 'vitest-lockstep/node_modules'), join(broken, 'node_modules'));
  const missingDependency = await run(process.execPath, [join(broken, 'vitest-lockstep.mjs')], multi, 'parent-fallback-rejected', env); assert.notEqual(missingDependency.code, 0); assert.match(missingDependency.stderr, /Runtime dependency escapes isolated distribution/);
  const escapedLayout = join(output, 'symlink-runtime-layout'); await mkdir(escapedLayout); await cp(helper, join(escapedLayout, 'vitest-lockstep.mjs')); await symlink(join(distribution, 'vitest-lockstep'), join(escapedLayout, 'vitest-lockstep'));
  const aliasDependency = await run(process.execPath, [join(escapedLayout, 'vitest-lockstep.mjs')], multi, 'runtime-directory-symlink-rejected', env); assert.notEqual(aliasDependency.code, 0); assert.match(aliasDependency.stderr, /Runtime directory escapes immutable distribution/);
  results.push({ name: 'isolated-exact-dependencies-parent-fallback-rejected', state: 'PASSED' });
} finally { await new Promise((done) => server.close(done)); }
await save(join(output, 'summary.json'), { runtimeProfile: values['runtime-profile'], profile, nativeSecurityAcceptance: 'FAILED: companion mismatch retained', helperLocalAcceptance: 'PASSED', results, fullSecurityAlignment: 'NOT PROVEN', fleetProvenance: 'PENDING', hostedCurrentHeadEnforcement: 'PENDING' });
console.log('Helper local acceptance: PASSED; fleet and hosted current-HEAD enforcement PENDING.');
