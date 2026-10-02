#!/usr/bin/env node
// Maintained source only. Hosted current-HEAD enforcement is an activation gate.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, mkdtemp, realpath, lstat, rm } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

// Anchor dependency resolution to the immutable helper layout, never cwd or
// Renovate's incidental dependency tree. Ship this entry plus this whole package.
const distribution = dirname(fileURLToPath(import.meta.url));
const runtime = await realpath(join(distribution, 'vitest-lockstep'));
assert.equal(runtime, join(await realpath(distribution), 'vitest-lockstep'), 'Runtime directory escapes immutable distribution');
const requireRuntime = createRequire(join(runtime, 'package.json'));
const runtimeManifest = JSON.parse(await readFile(join(runtime, 'package.json'), 'utf8'));
for (const name of ['yaml', 'semver']) {
  const entry = await realpath(requireRuntime.resolve(name));
  const manifestPath = await realpath(requireRuntime.resolve(name + '/package.json'));
  assert(!relative(runtime, entry).startsWith('..') && !relative(runtime, manifestPath).startsWith('..'), 'Runtime dependency escapes isolated distribution');
  assert.equal(JSON.parse(await readFile(manifestPath, 'utf8')).version, runtimeManifest.dependencies[name], 'Runtime dependency version mismatch');
}
const YAML = requireRuntime('yaml');
const semver = requireRuntime('semver');
const seeds = new Set(['vitest', '@vitest/coverage-v8', '@vitest/coverage-istanbul',
  '@vitest/ui', '@vitest/browser', '@vitest/browser-playwright',
  '@vitest/browser-preview', '@vitest/browser-webdriverio']);
const sections = ['dependencies', 'devDependencies', 'optionalDependencies'];
const supportedTools = new Set(['11.17.0', '11.20.0']);
const family = (name) => name === 'vitest' || name.startsWith('@vitest/') && name !== '@vitest/eslint-plugin';
const json = (text) => JSON.parse(text);
function yaml(text) {
  const doc = YAML.parseDocument(text);
  assert.equal(doc.errors.length, 0, 'Invalid or ambiguous YAML');
  return doc;
}
function lockName(key) {
  const at = key.indexOf('@', key.startsWith('@') ? 1 : 0);
  assert(at > 0, 'Unsupported pnpm package key');
  return key.slice(0, at);
}
function resolvedVersion(value) {
  assert.equal(typeof value, 'string', 'Unsupported linked/catalog resolution');
  const version = value.split('(')[0];
  assert.equal(semver.valid(version), version, 'Unsupported native resolution');
  return version;
}
async function ownedFile(root, name) {
  assert.equal(typeof name, 'string');
  assert(name && !isAbsolute(name) && !name.split(/[\\/]/).includes('..') && !name.includes('\\'), 'Escaping packageFile');
  const target = resolve(root, name);
  assert(!relative(root, target).startsWith('..'), 'Escaping packageFile');
  assert.equal(await realpath(target), target, 'Symlink/alias file is unsupported');
  assert((await lstat(target)).isFile(), 'Expected regular input file');
  return target;
}
async function command(node, cli, args, cwd, timeoutMs) {
  // Explicit Node and argument array; untrusted names/paths never become shell.
  return new Promise((done, reject) => {
    const child = spawn(node, [cli, ...args, '--pm-on-fail=ignore', '--config.runtime-on-fail=ignore', '--config.ignore-scripts=true', '--config.ignore-pnpmfile=true'], {
      cwd, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: dirname(node) + ':' + process.env.PATH, CI: 'true' },
    });
    let stdout = '', stderr = '', timedOut = false, closed = false, killTimer, reapTimer;
    const signal = (s) => { try { process.kill(-child.pid, s); } catch (e) { if (e.code !== 'ESRCH') throw e; } };
    const finish = (code, error) => {
      clearTimeout(timer); clearTimeout(killTimer); clearTimeout(reapTimer);
      if (error) reject(error);
      else if (timedOut) reject(new Error('Owned pnpm command timed out'));
      else if (code !== 0) reject(new Error('Native pnpm failed: ' + stderr + stdout));
      else done(stdout);
    };
    child.stdout.on('data', (s) => { stdout += s; });
    child.stderr.on('data', (s) => { stderr += s; });
    const timer = setTimeout(() => {
      timedOut = true; signal('SIGTERM');
      killTimer = setTimeout(() => {
        signal('SIGKILL');
        if (closed) finish(1);
        else reapTimer = setTimeout(() => {
          child.stdout.destroy(); child.stderr.destroy(); child.unref();
          finish(1, new Error('Owned pnpm timeout recovery: termination unconfirmed'));
        }, 1000);
      }, 200);
    }, timeoutMs);
    child.on('error', (error) => finish(1, error));
    child.on('close', (code) => { closed = true; if (!timedOut) finish(code); });
  });
}
function validateManager(manifest, version) {
  assert.equal(manifest.packageManager, 'pnpm@' + version, 'Unsupported declared package manager/version');
  assert(!manifest.devEngines?.packageManager, 'Ambiguous devEngines package manager ownership');
  assert(!manifest.devEngines?.runtime && !manifest.engines?.runtime, 'Unsupported runtime ownership');
  assert(!manifest.pnpm?.overrides && !manifest.pnpm?.patchedDependencies, 'Unsupported override/patch ownership');
  assert(!manifest.pnpm?.configDependencies && !manifest.pnpm?.usePacquet, 'Unsupported executable installer configuration');
}
function checkUnrelated(before, after, closure) {
  assert.deepEqual(after.settings, before.settings, 'Native lock settings changed');
  const context = (value, validate = false) => {
    for (const [name, target] of closure) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      value = value.replace(new RegExp('(\\(' + escaped + '@)([0-9]+\\.[0-9]+\\.[0-9]+)(?=[()])', 'g'), (_, prefix, version) => {
        if (validate) assert.equal(version, target, 'Excluded consumer references wrong selected family peer');
        return prefix + 'SELECTED';
      });
    }
    return value;
  };
  for (const [name, importer] of Object.entries(before.importers)) {
    const excluded = (value, validate) => Object.fromEntries(Object.entries(value ?? {}).filter(([dependency]) => !closure.has(dependency)).map(([name, entry]) => [name, { ...entry, version: context(entry.version, validate) }]));
    for (const section of sections) assert.deepEqual(excluded(after.importers[name]?.[section], true), excluded(importer[section], false), 'Unrelated importer resolution changed');
  }
  for (const section of ['packages', 'snapshots']) {
    const excluded = (entries, validate) => {
      const normalized = new Map();
      for (const [key, original] of Object.entries(entries ?? {}).filter(([key]) => !closure.has(lockName(key)))) {
      const value = structuredClone(original);
      // A peer consumer's edge must follow its existing resolved family version
      // into the new peer context. Its own identity, integrity and all unrelated
      // edges remain unchanged; this never upgrades an excluded package.
      for (const group of ['dependencies', 'optionalDependencies']) {
        for (const [name, version] of Object.entries(value[group] ?? {})) {
          if (closure.has(name)) {
            if (validate) assert.equal(resolvedVersion(version), closure.get(name), 'Excluded consumer family edge selected wrong target');
            value[group][name] = 'SELECTED' + context(version.slice(resolvedVersion(version).length), validate);
          } else value[group][name] = context(version, validate);
        }
      }
        const normalizedKey = context(key, validate);
        if (normalized.has(normalizedKey)) assert.deepEqual(normalized.get(normalizedKey), value, 'Unequal excluded peer-context collision');
        else normalized.set(normalizedKey, value);
      }
      return Object.fromEntries(normalized);
    };
    assert.deepEqual(excluded(after[section], true), excluded(before[section], false), 'Unrelated lock nodes changed: ' + section);
  }
}
function verifyLock(lock, manifests, targets, metadata) {
  for (const [importer, manifest] of manifests) {
    const native = lock.importers[importer];
    assert(native, 'Missing native importer');
    for (const section of sections) {
      const declarations = manifest[section] ?? {};
      assert.deepEqual(Object.keys(native[section] ?? {}).sort(), Object.keys(declarations).sort(), 'Importer dependency set changed');
      for (const [name, specifier] of Object.entries(declarations)) {
        const entry = native[section][name];
        assert.equal(entry.specifier, specifier, 'Importer specifier mismatch');
        if (targets.has(name)) {
          assert(semver.satisfies(targets.get(name), specifier), 'Manifest rejects selected target');
          assert.equal(resolvedVersion(entry.version), targets.get(name), 'Native resolution selected wrong target');
        }
      }
    }
  }
  for (const [key, snapshot] of Object.entries(lock.snapshots ?? {})) {
    const name = lockName(key);
    if (!targets.has(name)) continue;
    assert(key.startsWith(name + '@' + targets.get(name) + '(') || key === name + '@' + targets.get(name), 'Old or unexpected family snapshot remains');
    const info = metadata.get(name);
    for (const [peer, range] of Object.entries(info.peerDependencies ?? {})) {
      if (!targets.has(peer) || info.peerDependenciesMeta?.[peer]?.optional && !snapshot.dependencies?.[peer]) continue;
      assert.equal(semver.valid(range), range, 'Unsupported non-exact family peer');
      assert.equal(targets.get(peer), range, 'Published exact peer conflicts with selected target');
      assert.equal(resolvedVersion(snapshot.dependencies?.[peer]), range, 'Native peer context mismatch');
      assert(key.includes('(' + peer + '@' + range + ')') || key.includes('(' + peer + '@' + range + '('), 'Native snapshot exact peer suffix mismatch');
    }
  }
}

export async function runHelper({ root = process.cwd(), env = process.env, timeoutMs = 180000, fault = async () => {} } = {}) {
  assert.match(process.versions.node, /^24\./, 'Unsupported Node runtime');
  root = await realpath(root);
  assert(env.RENOVATE_POST_UPGRADE_COMMAND_DATA_FILE, 'Missing Renovate data file');
  assert(isAbsolute(env.RENOVATE_POST_UPGRADE_COMMAND_DATA_FILE), 'Data file must be absolute');
  const data = json(await readFile(env.RENOVATE_POST_UPGRADE_COMMAND_DATA_FILE, 'utf8'));
  assert(Array.isArray(data) && data.length > 0, 'Expected nonempty actual upgrades array');
  assert(isAbsolute(env.VITEST_LOCKSTEP_PNPM_CLI ?? ''), 'Missing absolute trusted pnpm CLI');
  const cli = await realpath(env.VITEST_LOCKSTEP_PNPM_CLI);
  const node = await realpath(process.execPath);
  const tool = json(await readFile(resolve(dirname(cli), '../package.json'), 'utf8'));
  assert.equal(tool.name, 'pnpm', 'Wrong trusted CLI package');
  assert(supportedTools.has(tool.version), 'Unsupported trusted pnpm version');
  const originals = new Map();
  const remember = async (name) => {
    const path = await ownedFile(root, name);
    const bytes = await readFile(path); originals.set(name, bytes); return bytes.toString();
  };
  const before = yaml(await remember('pnpm-lock.yaml')).toJS();
  assert.equal(String(before.lockfileVersion), '9.0', 'Unsupported native pnpm lock format');
  assert(before.importers && before.packages && before.snapshots, 'Incomplete native lock');
  const manifests = new Map();
  for (const importer of Object.keys(before.importers)) {
    const name = importer === '.' ? 'package.json' : importer + '/package.json';
    const manifest = json(await remember(name));
    if (importer === '.') validateManager(manifest, tool.version);
    else {
      assert(!manifest.packageManager || manifest.packageManager === 'pnpm@' + tool.version, 'Conflicting nested package manager');
      assert(!manifest.devEngines?.packageManager && !manifest.pnpm, 'Ambiguous nested installer config');
    }
    assert(!manifest.devEngines?.runtime && !manifest.engines?.runtime, 'Unsupported nested runtime ownership');
    assert(!Object.keys(manifest.peerDependencies ?? {}).some(family), 'Unsupported affected manifest peer ownership');
    manifests.set(importer, manifest);
  }
  for (const optional of ['pnpm-workspace.yaml', '.npmrc']) {
    try { await remember(optional); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  if (originals.has('pnpm-workspace.yaml')) {
    const workspace = yaml(originals.get('pnpm-workspace.yaml').toString()).toJS();
    assert(!workspace.catalog && !workspace.catalogs && !workspace.overrides && !workspace.patchedDependencies
      && !workspace.configDependencies && !workspace.usePacquet, 'Unsupported workspace ownership');
  }
  // These executable configuration features are outside the supported layout.
  // Inspect explicit ambient rc sources before invoking even a metadata command.
  for (const key of Object.keys(process.env)) assert(!/config.?dependencies|use.?pacquet/i.test(key), 'Unsupported ambient executable config');
  const rcFiles = [join(root, '.npmrc'), env.NPM_CONFIG_USERCONFIG, env.NPM_CONFIG_GLOBALCONFIG,
    join(homedir(), '.npmrc'), join(env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'pnpm/rc')].filter(Boolean);
  for (const path of rcFiles) {
    try { assert(!/^\s*(?:config[-_]?dependencies|use[-_]?pacquet)\s*[=\[]/mi.test(await readFile(path, 'utf8')), 'Unsupported executable rc config'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  const globalConfigDir = process.env.XDG_CONFIG_HOME ? join(process.env.XDG_CONFIG_HOME, 'pnpm')
    : process.platform === 'darwin' ? join(homedir(), 'Library/Preferences/pnpm') : join(homedir(), '.config/pnpm');
  try {
    const config = yaml(await readFile(join(globalConfigDir, 'config.yaml'), 'utf8')).toJS();
    assert(!config?.configDependencies && !config?.usePacquet, 'Unsupported global executable installer configuration');
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const reported = await command(node, cli, ['--version'], tmpdir(), timeoutMs);
  assert.equal(reported.trim(), tool.version, 'Executed pnpm identity mismatch');
  const targets = new Map(); let advisory = false;
  for (const upgrade of data) {
    assert(upgrade && typeof upgrade === 'object' && seeds.has(upgrade.depName), 'Unsupported upgrade family');
    assert.equal(semver.valid(upgrade.newVersion), upgrade.newVersion, 'Invalid resolved target');
    assert.equal(typeof upgrade.isVulnerabilityAlert, 'boolean', 'Missing advisory state');
    const path = await ownedFile(root, upgrade.packageFile);
    assert(originals.has(relative(root, path)), 'Unknown packageFile/importer ownership');
    const manifest = json(originals.get(relative(root, path)).toString());
    assert(sections.some((section) => Object.hasOwn(manifest[section] ?? {}, upgrade.depName)), 'Upgrade dependency is not installed');
    assert(!targets.has('vitest') || targets.get('vitest') === upgrade.newVersion, 'Conflicting resolved targets');
    targets.set('vitest', upgrade.newVersion);
    advisory ||= upgrade.isVulnerabilityAlert;
  }
  assert(advisory, 'No actual advisory upgrade');
  const target = targets.get('vitest');
  const installed = new Set(Object.keys(before.packages).map(lockName));
  assert(installed.has('vitest'), 'Vitest is not installed');
  for (const name of seeds) if (installed.has(name)) targets.set(name, target);
  const stage = await mkdtemp(join(tmpdir(), 'vitest-lockstep-stage-'));
  const touched = [];
  const published = new Map();
  try {
    for (const [name, bytes] of originals) { await mkdir(dirname(join(stage, name)), { recursive: true }); await writeFile(join(stage, name), bytes); }
    await fault('before-metadata', { root, stage });
    // Native configuration remains inherited. Only exact selected closures receive
    // invocation-scoped age exceptions; no consumer config is rewritten.
    const metadata = new Map();
    for (const [name, version] of targets) {
      const info = json(await command(node, cli, ['view', name + '@' + version, '--json', '--loglevel=error'], stage, timeoutMs));
      assert.equal(info.name, name); assert.equal(info.version, version); assert(info.dist?.integrity, 'Unavailable immutable release metadata');
      metadata.set(name, info);
      for (const obligations of [info.dependencies, info.optionalDependencies, info.peerDependencies]) {
        for (const [dependency, required] of Object.entries(obligations ?? {})) {
          if (!family(dependency) || !installed.has(dependency)) continue;
          assert.equal(semver.valid(required), required, 'Unsupported required family closure');
          assert(!targets.has(dependency) || targets.get(dependency) === required, 'Conflicting published closure target');
          targets.set(dependency, required);
        }
      }
      for (const [dependency, required] of Object.entries(info.dependencies ?? {})) {
        if (family(dependency)) assert(installed.has(dependency), 'Required closure is absent from installed graph');
      }
    }
    const finalManifests = new Map();
    for (const [importer, original] of manifests) {
      const manifest = structuredClone(original), exact = structuredClone(original);
      for (const section of sections) for (const [name, specifier] of Object.entries(original[section] ?? {})) {
        if (!targets.has(name)) continue;
        assert(semver.validRange(specifier), 'Unsupported catalog/alias/workspace declaration');
        const version = targets.get(name);
        manifest[section][name] = semver.satisfies(version, specifier) ? specifier
          : specifier.startsWith('^') ? '^' + version : specifier.startsWith('~') ? '~' + version : semver.valid(specifier) ? version
            : (() => { throw new Error('Unsupported incompatible declaration range'); })();
        exact[section][name] = version;
      }
      finalManifests.set(importer, manifest);
      await writeFile(join(stage, importer === '.' ? 'package.json' : importer + '/package.json'), JSON.stringify(exact, null, 2) + '\n');
    }
    const inherited = (await command(node, cli, ['config', 'get', 'minimumReleaseAgeExclude', '--json'], stage, timeoutMs)).trim();
    const inheritedExcludes = inherited ? json(inherited) : [];
    assert(Array.isArray(inheritedExcludes) && inheritedExcludes.every((entry) => typeof entry === 'string'), 'Unsupported inherited age exclusions');
    const age = [...new Set([...inheritedExcludes, ...[...targets].map(([name, version]) => name + '@' + version)])];
    const ageFlags = age.map((entry) => '--config.minimum-release-age-exclude=' + entry);
    const flags = ['--ignore-scripts', '--ignore-pnpmfile', '--store-dir', join(stage, '.store'), '--cache-dir', join(stage, '.cache'),
      ...ageFlags];
    const effectiveAge = json(await command(node, cli, ['config', 'get', 'minimumReleaseAgeExclude', '--json', ...ageFlags], stage, timeoutMs));
    assert.deepEqual(effectiveAge, age, 'Native invocation age exclusions differ from bounded merged set');
    await fault('before-install', { root, stage });
    await command(node, cli, ['install', '--lockfile-only', ...flags], stage, timeoutMs);
    const document = yaml(await readFile(join(stage, 'pnpm-lock.yaml'), 'utf8'));
    for (const [importer, manifest] of finalManifests) {
      for (const section of sections) for (const [name, specifier] of Object.entries(manifest[section] ?? {})) {
        if (targets.has(name)) document.setIn(['importers', importer, section, name, 'specifier'], specifier);
      }
      const name = importer === '.' ? 'package.json' : importer + '/package.json';
      // Preserve original bytes when declarations were already suitable.
      await writeFile(join(stage, name), JSON.stringify(manifest) === JSON.stringify(manifests.get(importer)) ? originals.get(name) : JSON.stringify(manifest, null, 2) + '\n');
    }
    await writeFile(join(stage, 'pnpm-lock.yaml'), String(document));
    const after = document.toJS();
    // pnpm's frozen supply-chain verification also evaluates newly generated
    // exact lock entries. Run it before comparing exclusions so a young
    // unrelated artifact is rejected by the native cooldown boundary itself.
    await command(node, cli, ['install', '--frozen-lockfile', ...flags], stage, timeoutMs);
    verifyLock(after, finalManifests, targets, metadata);
    checkUnrelated(before, after, targets);
    await fault('before-publish', { root, stage });
    const checkDrift = async () => {
      for (const [name, bytes] of originals) assert((await readFile(await ownedFile(root, name))).equals(published.get(name) ?? bytes), 'Concurrent input modification: ' + name);
    };
    await checkDrift();
    const outputs = [...manifests.keys()].map((importer) => importer === '.' ? 'package.json' : importer + '/package.json').concat('pnpm-lock.yaml');
    for (const name of outputs) {
      const bytes = await readFile(join(stage, name));
      if (bytes.equals(originals.get(name))) continue;
      await checkDrift();
      const path = await ownedFile(root, name);
      // Recheck every input before the first publication and this file just before
      // its write. A catchable failure rolls back only bytes this helper touched.
      assert((await readFile(path)).equals(originals.get(name)), 'Concurrent publication modification');
      touched.push(name); await writeFile(path, bytes); published.set(name, bytes);
      await fault('after-write', { root, stage, name, count: touched.length });
    }
    await checkDrift();
    return { target, targets: Object.fromEntries(targets), changedFiles: touched, pnpm: tool.version, pnpmCli: cli, node };
  } catch (error) {
    const failures = [];
    for (const name of touched.reverse()) {
      try {
        await fault('before-recovery', { root, stage, name });
        const path = await ownedFile(root, name);
        if (published.has(name)) assert((await readFile(path)).equals(published.get(name)), 'Externally changed publication; manual recovery required');
        await writeFile(path, originals.get(name));
      }
      catch (recovery) { failures.push(name + ': ' + recovery.message); }
    }
    if (failures.length) throw new Error('Explicit recovery failure: ' + failures.join('; '), { cause: error });
    throw error;
  } finally { await rm(stage, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await runHelper())); }
  catch (error) { console.error('vitest-lockstep: ' + error.message); process.exitCode = 1; }
}
