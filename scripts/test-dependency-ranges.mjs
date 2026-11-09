#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { values } = parseArgs({ options: { 'renovate-root': { type: 'string' } } });
assert(values['renovate-root'], 'Supply --renovate-root for the installed Renovate runtime.');
const root = resolve(values['renovate-root']);
const load = (path) => import(pathToFileURL(resolve(root, 'dist', path)).href);
const { init, levels } = await load('logger/index.js');
await init();
levels('stdout', 'warn');
const { getConfig } = await load('config/defaults.js');
const { resolveConfigPresets } = await load('config/presets/index.js');
const { mergeChildConfig } = await load('config/utils.js');
const { applyPackageRules } = await load('util/package-rules/index.js');
const { resolveRangeStrategy } = await load('workers/repository/process/lookup/range-strategy.js');
const { generateUpdate } = await load('workers/repository/process/lookup/generate.js');
const { extractPackageFile } = await load('modules/manager/github-actions/extract.js');
const { GlobalConfig } = await load('config/global.js');
GlobalConfig.set({ localDir: fileURLToPath(new URL('../', import.meta.url)) });
const preset = JSON.parse(await readFile(new URL('../default.json', import.meta.url), 'utf8'));
const resolved = await resolveConfigPresets(preset);
const config = mergeChildConfig(getConfig(), resolved.config);

for (const [manager, depType, currentValue, currentVersion, next, outside, expected] of [
  ['cargo', 'dependencies', '1.0.0', '1.0.0', '1.1.0', '2.0.0', '2.0.0'],
  ['cargo', 'dev-dependencies', '0.4.13', '0.4.13', '0.4.14', '0.5.0', '0.5.0'],
  ['npm', 'dependencies', '^1.0.0', '1.0.0', '1.1.0', '2.0.0', '^2.0.0'],
  ['npm', 'devDependencies', '~1.0.0', '1.0.0', '1.0.1', '1.1.0', '~1.1.0'],
]) {
  const dep = await applyPackageRules({ ...config, manager, depType, datasource: manager,
    packageName: 'example', depName: 'example', currentValue, lockedVersion: currentVersion }, 'range-policy');
  const strategy = resolveRangeStrategy(dep);
  const { api } = await load(`modules/versioning/${manager}/index.js`);
  const update = (version) => generateUpdate(dep, currentValue, api, strategy,
    currentVersion, 'latest', { version }, [currentVersion, next, outside]);
  const compatible = await update(next);
  assert.equal(compatible.newVersion, next);
  assert.equal(compatible.newValue, currentValue);
  assert.equal(compatible.isLockfileUpdate, true, `${manager} ${depType}: compatible release updates the lockfile`);
  const incompatible = await update(outside);
  assert.equal(incompatible.newValue, expected);
  assert.notEqual(incompatible.updateType, 'pin');
}

const peer = await applyPackageRules({ ...config, manager: 'npm', depType: 'peerDependencies',
  depName: 'example', packageName: 'example', currentValue: '^1.0.0 || ^2.0.0' }, 'peer-policy');
assert.equal(resolveRangeStrategy(peer), 'widen');

// Exercise real extraction: setup-node uses github-releases/actions/node-versions,
// rather than the node-version datasource used by some other actions.
const workflow = await extractPackageFile(`jobs:
  test:
    steps:
      - uses: actions/setup-node@v6
        with:
          node-version: '24'
`, '.github/workflows/test.yml', {});
assert(workflow?.deps.length);
for (const extracted of workflow.deps) {
  const dep = await applyPackageRules({ ...config, ...extracted, manager: 'github-actions' }, 'ci-policy');
  if (extracted.depName === 'node') assert.equal(dep.rangeStrategy, 'pin');
  else assert.equal(dep.pinDigests, true);
}
assert(workflow.deps.some((dep) => dep.depName === 'node'));
const rust = await applyPackageRules({ ...config, manager: 'rust-toolchain',
  depName: 'rust', packageName: 'rust', currentValue: 'stable' }, 'toolchain-policy');
assert.equal(rust.rangeStrategy, 'pin');
console.log('Dependency ranges, lockfile updates, peer widening and build-input pins: PASSED');
