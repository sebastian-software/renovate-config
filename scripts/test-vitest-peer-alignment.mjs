#!/usr/bin/env node
// Offline independent checker contracts; no consumer PR or required-status proof.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { chmod, cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkAlignment, discoverMetadata, LIMITS } from './vitest-peer-alignment.mjs';

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const fixture = join(repo, 'tests/fixtures/vitest-peer-alignment');
const artifact = await mkdtemp(join(tmpdir(), 'vitest-peer-alignment-'));
const runtimeRequire = createRequire(join(repo, 'scripts/vitest-peer-alignment/package.json'));
const YAML = runtimeRequire('yaml');
const hash = (value) => createHash('sha256').update(value).digest('hex');
// Fixture-only revision label for schema/receipt assertions. This does not claim
// the checker existed at this base commit or bind a production immutable release;
// the trusted release owner selects and authenticates the reviewed revision later.
const config = { checkerRevision: '5be155a4eb1f4422f1866b805337cfd9b51f84d7', policyRevision: 'fixture-policy-v1' };
const paths = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml',
  'packages/create-paratix/package.json', 'packages/paratix/package.json', 'website/package.json'];
const provenance = JSON.parse(await readFile(join(fixture, 'paratix/provenance.json'), 'utf8'));
const metadataBytes = await readFile(join(fixture, 'registry-metadata.json'));
assert.equal(hash(metadataBytes), provenance.registryAcquisition.sha256);
const tree = JSON.parse(await readFile(join(fixture, 'paratix/tree.json'), 'utf8'));
const files = await Promise.all(paths.map(async (path) => ({
  path, content: await readFile(join(fixture, 'paratix', path), 'utf8'),
})));
const baseline = { schemaVersion: 1,
  identity: { repository: 'fixture/paratix', pullRequest: 37, head: tree.head },
  tree, files, metadata: JSON.parse(metadataBytes.toString('utf8')) };
const serialized = JSON.stringify(baseline);
const results = [];
async function fixtureDigest(root) {
  const entries = [];
  async function walk(dir, prefix = '') {
    for (const name of (await readdir(dir)).sort()) {
      const path = join(dir, name), local = prefix + name;
      const stat = await import('node:fs/promises').then((fs) => fs.stat(path));
      if (stat.isDirectory()) await walk(path, local + '/');
      else entries.push([local, hash(await readFile(path))]);
    }
  }
  await walk(root); return hash(JSON.stringify(entries));
}
const fixtureBefore = await fixtureDigest(fixture);
async function test(name, action) {
  const started = performance.now();
  try {
    const evidence = await action();
    assert.equal(JSON.stringify(baseline), serialized, 'Checker must not mutate input bytes or metadata');
    assert.equal(await fixtureDigest(fixture), fixtureBefore, 'Offline fixture bytes changed');
    results.push({ name, state: 'PASSED', durationMs: Math.round(performance.now() - started), ...evidence });
    console.log(name + ': PASSED');
  } catch (error) {
    results.push({ name, state: 'FAILED', durationMs: Math.round(performance.now() - started),
      diagnostic: String(error.message).slice(0, 2000) });
    console.log(name + ': FAILED: ' + String(error.message).slice(0, 500));
  }
}
await test('complete real topology and bounded discovery', async () => {
  const lock = YAML.parse(files.find((file) => file.path === 'pnpm-lock.yaml').content);
  assert.equal(tree.entries.length, 511);
  assert.equal(Object.keys(lock.importers).length, 4);
  assert.equal(Object.keys(lock.packages).length, 1104);
  assert.equal(Object.keys(lock.snapshots).length, 1112);
  assert.equal(Buffer.byteLength(files.find((file) => file.path === 'pnpm-lock.yaml').content), 368288);
  assert(lock.snapshots['@vitest/expect@3.2.4']);
  assert.equal(Object.keys(lock.snapshots).filter((key) => key.startsWith('vitest@4.1.11(')).length, 2);
  assert.equal(lock.importers['.'].devDependencies['@typescript/native'].specifier, 'npm:typescript@^7.0.2');
  assert(Buffer.byteLength(serialized) < LIMITS.requestBytes);
  assert(metadataBytes.length < LIMITS.metadataBytes);
  const request = structuredClone(baseline); delete request.metadata;
  const output = await discoverMetadata(request, config);
  await writeFile(join(artifact, 'discovery.json'), JSON.stringify(output, null, 2));
  assert.equal(output.operation, 'discover'); assert.equal(output.verdict, 'metadata-required');
  assert.equal(output.coordinates.length, 1104);
  assert.deepEqual(output.stats, { importers: 4, snapshots: 1112, metadataPackages: 1104 });
  assert.equal(output.metadataHash, null);
  return { requestBytes: Buffer.byteLength(serialized), metadataBytes: metadataBytes.length,
    discoveryInputHash: output.inputHash, stats: output.stats };
});
await test('complete real historical and contextual peer alignment', async () => {
  const output = await checkAlignment(baseline, config);
  await writeFile(join(artifact, 'real-alignment.json'), JSON.stringify(output, null, 2));
  assert.equal(output.verdict, 'aligned', JSON.stringify(output.diagnostics));
  assert.equal(output.operation, 'check');
  assert.equal(output.stats.importers, 4); assert.equal(output.stats.snapshots, 1112);
  assert(output.stats.familySnapshots >= 16);
  assert.equal(output.diagnostics.length, 0);
  const discovery = JSON.parse(await readFile(join(artifact, 'discovery.json'), 'utf8'));
  assert.equal(output.inputHash, discovery.inputHash);
  for (const key of ['checkerSha256', 'runtimeSha256', 'inputHash', 'metadataHash']) assert.match(output[key], /^[a-f0-9]{64}$/);
  return { stats: output.stats, inputHash: output.inputHash, metadataHash: output.metadataHash };
});
function replaceFile(input, path, content) {
  const file = input.files.find((file) => file.path === path);
  assert(file, 'Variant must preserve an owned file');
  file.content = content;
  const bytes = Buffer.from(content);
  const entry = input.tree.entries.find((entry) => entry.path === path);
  entry.size = bytes.length;
  entry.sha = createHash('sha1').update(Buffer.concat([Buffer.from('blob ' + bytes.length + '\0'), bytes])).digest('hex');
}
function remapReferences(value, mappings, prefix) {
  if (typeof value === 'string') {
    for (const [before, after] of mappings) {
      value = value.replaceAll(before, after).replaceAll(before.slice(prefix.length), after.slice(prefix.length));
    }
    return value;
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) value[key] = remapReferences(value[key], mappings, prefix);
  }
  return value;
}
function undeclaredPeerAlias() {
  const input = structuredClone(baseline);
  const lock = YAML.parse(input.files.find((file) => file.path === 'pnpm-lock.yaml').content);
  const mappings = new Map();
  for (const key of Object.keys(lock.snapshots).filter((key) => key.startsWith('@vitest/mocker@4.1.11('))) {
    const changed = key.replace('(vite@', '(different-vite@');
    mappings.set(key, changed);
    lock.snapshots[changed] = lock.snapshots[key]; delete lock.snapshots[key];
    const vite = lock.snapshots[changed].optionalDependencies.vite;
    lock.snapshots[changed].optionalDependencies.vite = 'different-vite@' + vite;
    lock.snapshots['different-vite@' + vite] = structuredClone(lock.snapshots['vite@' + vite]);
  }
  remapReferences(lock, mappings, '@vitest/mocker@');
  lock.packages['different-vite@8.1.5'] = structuredClone(lock.packages['vite@8.1.5']);
  // Modeled independent registry package: only the added differently named
  // provider is synthetic. Original published mocker peer obligations remain.
  const unrelated = structuredClone(input.metadata.packages.find((info) => info.name === 'vite' && info.version === '8.1.5'));
  unrelated.name = 'different-vite'; input.metadata.packages.push(unrelated);
  replaceFile(input, 'pnpm-lock.yaml', YAML.stringify(lock));
  return input;
}
await test('undeclared same-version differently named peer cannot satisfy Vite', async () => {
  const input = undeclaredPeerAlias();
  const output = await checkAlignment(input, config);
  await writeFile(join(artifact, 'undeclared-peer-alias.json'), JSON.stringify(output, null, 2));
  assert.notEqual(output.verdict, 'aligned',
    'A version-compatible peer must retain its published name unless an actual alias declaration authorizes replacement');
  assert(output.diagnostics.length > 0);
  return { verdict: output.verdict, diagnostics: output.diagnostics };
});

function editLock(input, change) {
  const lock = YAML.parse(input.files.find((file) => file.path === 'pnpm-lock.yaml').content);
  change(lock); replaceFile(input, 'pnpm-lock.yaml', YAML.stringify(lock)); return lock;
}
function editManifest(input, owner, change) {
  const path = owner === '.' ? 'package.json' : owner + '/package.json';
  const manifest = JSON.parse(input.files.find((file) => file.path === path).content);
  change(manifest); replaceFile(input, path, JSON.stringify(manifest, null, 2) + '\n');
}
async function negative(name, change, expectedCode) {
  await test(name, async () => {
    const input = structuredClone(baseline);
    const raw = await change(input);
    const output = await checkAlignment(raw ?? input, config);
    await writeFile(join(artifact, name.replaceAll(/[^a-z0-9]+/gi, '-') + '.json'), JSON.stringify(output, null, 2));
    assert.notEqual(output.verdict, 'aligned', 'Unsafe input was accepted');
    assert(output.diagnostics.length > 0 && output.diagnostics.length <= LIMITS.diagnostics);
    assert(output.diagnostics.every((diagnostic) => diagnostic.message.length > 0 &&
      diagnostic.message.length <= LIMITS.diagnosticChars && (!diagnostic.path || diagnostic.path.length <= 256)));
    if (expectedCode) assert.match(output.diagnostics[0].code, expectedCode);
    return { verdict: output.verdict, diagnostics: output.diagnostics };
  });
}
await test('caret tilde exact declarations retain compatible actual resolutions', async () => {
  const input = structuredClone(baseline);
  editManifest(input, 'packages/create-paratix', (manifest) => { manifest.devDependencies.vitest = '~4.1.11'; });
  editManifest(input, 'packages/paratix', (manifest) => { manifest.devDependencies.vitest = '4.1.11'; });
  editLock(input, (lock) => {
    lock.importers['packages/create-paratix'].devDependencies.vitest.specifier = '~4.1.11';
    lock.importers['packages/paratix'].devDependencies.vitest.specifier = '4.1.11';
  });
  const output = await checkAlignment(input, config); assert.equal(output.verdict, 'aligned', JSON.stringify(output.diagnostics));
  return { stats: output.stats };
});
await test('absent optional companions and independent eslint identity remain valid', async () => {
  const lock = YAML.parse(baseline.files.find((file) => file.path === 'pnpm-lock.yaml').content);
  assert.equal(Object.keys(lock.snapshots).filter((key) => /^@vitest\/(?:browser|ui)@/.test(key)).length, 0);
  assert(lock.packages['@vitest/eslint-plugin@1.6.24']);
  assert.equal(baseline.metadata.packages.find((info) => info.name === '@vitest/eslint-plugin').peerDependencies.vitest, '*');
  const output = await checkAlignment(baseline, config); assert.equal(output.verdict, 'aligned');
  return { stats: output.stats };
});
const previousBytes = await readFile(join(fixture, 'previous-version-metadata.json'));
const previous = JSON.parse(previousBytes.toString('utf8'));
function mismatch() {
  const input = structuredClone(baseline);
  input.metadata.packages.push(...structuredClone(previous.packages));
  editManifest(input, 'packages/paratix', (manifest) => { manifest.devDependencies['@vitest/coverage-v8'] = '4.1.10'; });
  editLock(input, (lock) => {
    const coverage = previous.packages.find((info) => info.name === '@vitest/coverage-v8');
    const oldKey = '@vitest/coverage-v8@4.1.11(vitest@4.1.11)';
    const oldSnapshot = structuredClone(lock.snapshots[oldKey]);
    oldSnapshot.dependencies['@vitest/utils'] = '4.1.10';
    const keyChanges = new Map();
    for (const section of ['packages', 'snapshots']) {
      const changed = {};
      for (const [key, value] of Object.entries(lock[section])) {
        const next = key.replaceAll('@vitest/coverage-v8@4.1.11', '@vitest/coverage-v8@4.1.10');
        changed[next] = value;
        if (key.startsWith('vitest@4.1.11(')) keyChanges.set(key, next);
      }
      lock[section] = changed;
    }
    remapReferences(lock, keyChanges, 'vitest@');
    remapReferences(oldSnapshot, keyChanges, 'vitest@');
    for (const importer of Object.values(lock.importers)) {
      if (importer.devDependencies?.['@vitest/coverage-v8']) {
        importer.devDependencies['@vitest/coverage-v8'] = { specifier: '4.1.10', version: '4.1.10(vitest@4.1.11)' };
      }
    }
    for (const snapshot of Object.values(lock.snapshots)) {
      for (const section of ['dependencies', 'optionalDependencies']) {
        if (snapshot[section]?.['@vitest/coverage-v8']) snapshot[section]['@vitest/coverage-v8'] = '4.1.10(vitest@4.1.11)';
      }
    }
    lock.snapshots['@vitest/coverage-v8@4.1.10(vitest@4.1.11)'] = oldSnapshot;
    lock.packages['@vitest/coverage-v8@4.1.10'] = { resolution: { integrity: coverage.dist.integrity },
      peerDependencies: coverage.peerDependencies, peerDependenciesMeta: coverage.peerDependenciesMeta };
    for (const name of ['@vitest/utils', '@vitest/pretty-format']) {
      const info = previous.packages.find((info) => info.name === name);
      lock.packages[name + '@4.1.10'] = { resolution: { integrity: info.dist.integrity } };
      lock.snapshots[name + '@4.1.10'] = structuredClone(lock.snapshots[name + '@4.1.11']);
      if (name === '@vitest/utils') lock.snapshots[name + '@4.1.10'].dependencies['@vitest/pretty-format'] = '4.1.10';
    }
  });
  return input;
}
await test('original coherent Vitest4.1.11 coverage4.1.10 mismatch fails', async () => {
  const input = mismatch();
  const lock = YAML.parse(input.files.find((file) => file.path === 'pnpm-lock.yaml').content);
  assert.equal(lock.importers['packages/paratix'].devDependencies['@vitest/coverage-v8'].specifier, '4.1.10');
  assert.equal(lock.packages['@vitest/coverage-v8@4.1.10'].peerDependencies.vitest, '4.1.10');
  assert(lock.snapshots['@vitest/utils@4.1.10']);
  const output = await checkAlignment(input, config);
  await writeFile(join(artifact, 'original-mismatch.json'), JSON.stringify(output, null, 2));
  assert.notEqual(output.verdict, 'aligned'); assert.match(output.diagnostics[0].code, /PEER_MISMATCH/);
  return { verdict: output.verdict, diagnostics: output.diagnostics };
});
await negative('manifest importer disagreement', (input) => {
  editManifest(input, 'packages/paratix', (manifest) => { manifest.devDependencies.vitest = '^4.1.12'; });
}, /MANIFEST_LOCK_MISMATCH/);
await negative('manifest ownership cannot omit importer dependencies', (input) => {
  editManifest(input, 'packages/paratix', (manifest) => { delete manifest.devDependencies.vitest; });
}, /IMPORTER_OWNERSHIP/);
await negative('forged peer fields cannot override published requirements', (input) => {
  editLock(input, (lock) => { lock.packages['@vitest/coverage-v8@4.1.11'].peerDependencies.vitest = '4.1.10'; });
}, /FORGED_PEER_METADATA/);
await negative('relevant package integrity must match independent registry', (input) => {
  editLock(input, (lock) => { lock.packages['vitest@4.1.11'].resolution.integrity = 'sha512-' + Buffer.alloc(64, 7).toString('base64'); });
}, /INTEGRITY_MISMATCH/);
await negative('wrong full nested peer with correct alternatives still reachable', (input) => {
  editLock(input, (lock) => {
    const key = Object.keys(lock.snapshots).find((key) => key.startsWith('vitest@4.1.11(') && key.includes('esbuild@0.27.4'));
    const changed = key.replace('jiti@2.7.0', 'jiti@2.7.1');
    lock.snapshots[changed] = lock.snapshots[key]; delete lock.snapshots[key];
    remapReferences(lock, new Map([[key, changed]]), 'vitest@');
    assert(lock.packages['jiti@2.7.0']); assert(lock.snapshots['jiti@2.7.0']);
  });
}, /PEER_CONTEXT_MISMATCH/);
await negative('missing required family snapshot', (input) => {
  editLock(input, (lock) => { delete lock.snapshots['@vitest/utils@4.1.11']; });
}, /MISSING_SNAPSHOT/);
await negative('missing discovered workspace on lock-only input', (input) => {
  input.files = input.files.filter((file) => file.path !== 'packages/create-paratix/package.json');
}, /INCOMPLETE_INPUT/);
await negative('truncated exact tree inventory', (input) => { input.tree.complete = false; }, /INCOMPLETE_TREE/);
await negative('tree head must equal captured identity', (input) => { input.tree.head = '0'.repeat(40); }, /INCOMPLETE_TREE/);
await negative('blob bytes must equal authenticated tree input', (input) => { input.files[0].content += ' '; }, /INPUT_HASH_MISMATCH/);
await negative('missing trusted metadata envelope', (input) => { delete input.metadata; }, /INVALID_INPUT/);
await negative('missing relevant published metadata', (input) => {
  input.metadata.packages = input.metadata.packages.filter((info) => info.name !== 'vitest');
}, /INCOMPLETE_METADATA/);
await negative('missing unrelated metadata cannot hide a reverse peer', (input) => {
  input.metadata.packages = input.metadata.packages.filter((info) => info.name !== 'ssh2');
}, /INCOMPLETE_METADATA/);
await negative('unauthenticated metadata is non-success', (input) => { input.metadata.authenticated = false; }, /UNTRUSTED_METADATA/);
await negative('PR metadata URL cannot redirect acquisition policy', (input) => { input.metadata.source = 'https://invalid.example'; }, /UNTRUSTED_METADATA/);
await negative('workspace directory symlink cannot hide a manifest', (input) => {
  input.tree.entries.push({ path: 'packages/hidden', mode: '120000', sha: '0'.repeat(40), size: 10 });
}, /UNSUPPORTED_WORKSPACE/);
await negative('workspace submodule cannot hide a manifest', (input) => {
  input.tree.entries.push({ path: 'packages/hidden', mode: '160000', sha: '0'.repeat(40), size: 0 });
}, /UNSUPPORTED_WORKSPACE/);
await negative('catalog ownership is unsupported', (input) => {
  replaceFile(input, 'pnpm-workspace.yaml', input.files.find((file) => file.path === 'pnpm-workspace.yaml').content + 'catalog:\n  vitest: 4.1.11\n');
}, /UNSUPPORTED_INPUT/);
await negative('executable pnpm ownership is unsupported and never executed', (input) => {
  input.tree.entries.push({ path: '.pnpmfile.cjs', mode: '100644', sha: '0'.repeat(40), size: 100 });
}, /UNSUPPORTED_OWNERSHIP/);
await negative('repository path traversal is rejected', (input) => { input.tree.entries[0].path = '../escape'; }, /INVALID_PATH/);
await negative('duplicate JSON members are ambiguous', (input) => {
  replaceFile(input, 'package.json', '{"packageManager":"pnpm@11.17.0","packageManager":"pnpm@11.17.0"}');
}, /AMBIGUOUS_INPUT/);
await negative('duplicate YAML members are ambiguous', (input) => {
  replaceFile(input, 'pnpm-workspace.yaml', 'packages: ["packages/*"]\npackages: ["website"]\n');
}, /INVALID_YAML/);
await negative('YAML aliases are rejected before expansion', (input) => {
  replaceFile(input, 'pnpm-workspace.yaml', 'packages: &paths ["packages/*", "website"]\ncopy: *paths\n');
}, /UNSUPPORTED_YAML/);
await negative('JSON parser depth is bounded', (input) => {
  const manifest = JSON.parse(input.files[0].content); let value = {};
  for (let i = 0; i < LIMITS.dataDepth + 4; i++) value = { child: value };
  manifest.deep = value; replaceFile(input, 'package.json', JSON.stringify(manifest));
}, /RESOURCE_LIMIT/);
await negative('YAML parser depth is bounded', (input) => {
  replaceFile(input, 'pnpm-workspace.yaml', 'packages: ["packages/*", "website"]\ndeep: ' + '['.repeat(70) + '0' + ']'.repeat(70) + '\n');
}, /RESOURCE_LIMIT/);
await negative('malformed optional flag is rejected', (input) => {
  editLock(input, (lock) => { lock.packages['vitest@4.1.11'].peerDependenciesMeta.jsdom.optional = 'true'; });
}, /INVALID_METADATA/);
await negative('removing optional true flag is not false normalization', (input) => {
  editLock(input, (lock) => { delete lock.packages['vitest@4.1.11'].peerDependenciesMeta.jsdom; });
}, /FORGED_PEER_METADATA/);
function familyAlias() {
  const input = structuredClone(baseline);
  editManifest(input, 'packages/create-paratix', (manifest) => { manifest.devDependencies.vitest = 'npm:fake-vitest@4.1.11'; });
  editLock(input, (lock) => {
    const entry = lock.importers['packages/create-paratix'].devDependencies.vitest;
    lock.snapshots['fake-vitest@' + entry.version] = structuredClone(lock.snapshots['vitest@' + entry.version]);
    lock.packages['fake-vitest@4.1.11'] = structuredClone(lock.packages['vitest@4.1.11']);
    entry.specifier = 'npm:fake-vitest@4.1.11'; entry.version = 'fake-vitest@' + entry.version;
  });
  const fake = structuredClone(input.metadata.packages.find((info) => info.name === 'vitest'));
  fake.name = 'fake-vitest'; input.metadata.packages.push(fake); return input;
}
await test('family manifest alias cannot erase installed Vitest identity', async () => {
  const output = await checkAlignment(familyAlias(), config);
  await writeFile(join(artifact, 'family-alias.json'), JSON.stringify(output, null, 2));
  assert.notEqual(output.verdict, 'aligned', 'A PR-editable family alias must not erase strict Vitest identity');
  return { verdict: output.verdict, diagnostics: output.diagnostics };
});

// These additional published documents are deliberately modeled trusted fixtures;
// every original real package and its pinned public-registry document is retained.
function reversePeer({ optional = false, absent = false, requiredVersion = '4.1.11', erase = false } = {}) {
  const input = structuredClone(baseline), name = 'fixture-required-peer';
  const info = { name, version: '1.0.0',
    dist: structuredClone(input.metadata.packages.find((info) => info.name === 'semver').dist),
    peerDependencies: { vitest: requiredVersion },
    ...(optional ? { peerDependenciesMeta: { vitest: { optional: true } } } : {}) };
  input.metadata.packages.push(info);
  // No direct importer Vitest binding: hidden-peer discovery must inspect the
  // independent metadata rather than fail earlier at an importer binding.
  const owner = 'website';
  editManifest(input, owner, (manifest) => { manifest.devDependencies[name] = '1.0.0'; });
  editLock(input, (lock) => {
    const version = absent || erase ? '1.0.0' : '1.0.0(vitest@4.1.11)';
    const vitest = lock.importers['packages/create-paratix'].devDependencies.vitest.version;
    lock.importers[owner].devDependencies[name] = { specifier: '1.0.0', version };
    lock.packages[name + '@1.0.0'] = { resolution: { integrity: info.dist.integrity },
      ...(!erase ? { peerDependencies: info.peerDependencies } : {}),
      ...(optional ? { peerDependenciesMeta: info.peerDependenciesMeta } : {}) };
    lock.snapshots[name + '@' + version] = absent || erase ? {} : { dependencies: { vitest } };
  });
  return input;
}
await test('modeled nonfamily exact required Vitest peer resolves compatibly', async () => {
  const output = await checkAlignment(reversePeer(), config);
  assert.equal(output.verdict, 'aligned', JSON.stringify(output.diagnostics)); return { stats: output.stats };
});
await test('erasing BOTH nonfamily lock peer fields and context cannot hide required peer', async () => {
  const input = reversePeer({ erase: true });
  const lock = YAML.parse(input.files.find((file) => file.path === 'pnpm-lock.yaml').content);
  assert.equal(lock.packages['fixture-required-peer@1.0.0'].peerDependencies, undefined);
  assert.deepEqual(lock.snapshots['fixture-required-peer@1.0.0'], {});
  assert.equal(input.metadata.packages.at(-1).peerDependencies.vitest, '4.1.11');
  const output = await checkAlignment(input, config);
  await writeFile(join(artifact, 'erased-reverse-peer.json'), JSON.stringify(output, null, 2));
  assert.notEqual(output.verdict, 'aligned');
  assert.equal(output.diagnostics[0].code, 'MISSING_REQUIRED_PEER');
  return { verdict: output.verdict, diagnostics: output.diagnostics };
});
await test('modeled optional exact peer may be absent', async () => {
  const output = await checkAlignment(reversePeer({ optional: true, absent: true, requiredVersion: '4.1.10' }), config);
  assert.equal(output.verdict, 'aligned', JSON.stringify(output.diagnostics)); return { stats: output.stats };
});
await test('modeled optional peer present at wrong exact version fails', async () => {
  const output = await checkAlignment(reversePeer({ optional: true, requiredVersion: '4.1.10' }), config);
  assert.notEqual(output.verdict, 'aligned'); assert.match(output.diagnostics[0].code, /PEER_MISMATCH/);
  return { verdict: output.verdict, diagnostics: output.diagnostics };
});
function ownedPeerAlias(aliasOwner = 'website', wrongContext = false) {
  const input = structuredClone(baseline), owner = 'website', wrapper = 'fixture-mocker-consumer';
  const wrapperInfo = { name: wrapper, version: '1.0.0',
    dist: structuredClone(input.metadata.packages.find((info) => info.name === 'semver').dist),
    dependencies: { '@vitest/mocker': '4.1.11' } };
  input.metadata.packages.push(wrapperInfo);
  editLock(input, (lock) => {
    const key = Object.keys(lock.snapshots).find((key) => key.startsWith('@vitest/mocker@4.1.11(') && key.includes('esbuild@0.27.4'));
    assert(key);
    const changed = key.replace('(vite@', '(different-vite@');
    const vite = lock.snapshots[key].optionalDependencies.vite;
    let provider = 'different-vite@' + vite;
    // Keep all original contexts. A modeled wrapper independently reaches a
    // second real mocker resolution with the explicitly provided aliased peer.
    lock.snapshots[changed] = structuredClone(lock.snapshots[key]);
    lock.snapshots[changed].optionalDependencies.vite = provider;
    lock.snapshots[provider] = structuredClone(lock.snapshots['vite@' + vite]);
    lock.packages['different-vite@8.1.5'] = structuredClone(lock.packages['vite@8.1.5']);
    lock.packages[wrapper + '@1.0.0'] = { resolution: { integrity: wrapperInfo.dist.integrity } };
    lock.snapshots[wrapper + '@1.0.0'] = { dependencies: { '@vitest/mocker': changed.slice('@vitest/mocker@'.length) } };
    lock.importers[owner].devDependencies[wrapper] = { specifier: '1.0.0', version: '1.0.0' };
    if (wrongContext) {
      const other = Object.keys(lock.snapshots).find((key) => key.startsWith('vite@8.1.5(') && key.includes('esbuild@0.28.1'));
      assert(other); provider = 'different-' + other;
      lock.snapshots[provider] = structuredClone(lock.snapshots[other]);
    }
    lock.importers[aliasOwner].devDependencies.vite = { specifier: 'npm:different-vite@8.1.5', version: provider };
  });
  editManifest(input, owner, (manifest) => { manifest.devDependencies[wrapper] = '1.0.0'; });
  editManifest(input, aliasOwner, (manifest) => { manifest.devDependencies.vite = 'npm:different-vite@8.1.5'; });
  const info = structuredClone(input.metadata.packages.find((info) => info.name === 'vite' && info.version === '8.1.5'));
  info.name = 'different-vite'; input.metadata.packages.push(info); return input;
}
await test('native explicit nonfamily alias with reaching importer exact context is valid', async () => {
  const output = await checkAlignment(ownedPeerAlias(), config);
  await writeFile(join(artifact, 'owned-peer-alias.json'), JSON.stringify(output, null, 2));
  assert.equal(output.verdict, 'aligned', JSON.stringify(output.diagnostics)); return { stats: output.stats };
});
await test('alias in unrelated workspace cannot authorize contextual peer substitution', async () => {
  const output = await checkAlignment(ownedPeerAlias('packages/create-paratix'), config);
  assert.notEqual(output.verdict, 'aligned'); assert.match(output.diagnostics[0].code, /PEER_MISMATCH/);
  return { verdict: output.verdict, diagnostics: output.diagnostics };
});
await test('reaching importer alias with other provider context cannot authorize substitution', async () => {
  const output = await checkAlignment(ownedPeerAlias('website', true), config);
  assert.notEqual(output.verdict, 'aligned'); assert.match(output.diagnostics[0].code, /PEER_MISMATCH/);
  return { verdict: output.verdict, diagnostics: output.diagnostics };
});
for (const mode of ['missing', 'denied']) {
  await test(mode + ' mutating helper does not prevent independent mismatch rejection', async () => {
    const helper = join(artifact, mode + '-helper');
    if (mode === 'denied') {
      await writeFile(helper, '#!/bin/sh\nexit 0\n'); await chmod(helper, 0);
    }
    const attempt = spawnSync(helper, [], { encoding: 'utf8' });
    assert.equal(attempt.error?.code, mode === 'missing' ? 'ENOENT' : 'EACCES');
    const input = mismatch(), before = JSON.stringify(input);
    const output = await checkAlignment(input, config);
    assert.notEqual(output.verdict, 'aligned'); assert.match(output.diagnostics[0].code, /PEER_MISMATCH/);
    assert.equal(JSON.stringify(input), before, 'Failed helper and checker must preserve unsafe bytes');
    await writeFile(join(artifact, mode + '-helper-result.json'), JSON.stringify(output, null, 2));
    return { helperError: attempt.error.code, verdict: output.verdict, diagnostics: output.diagnostics };
  });
}
await test('native aligned repository data succeeds with helper absent', async () => {
  const attempt = spawnSync(join(artifact, 'absent-native-helper'), [], { encoding: 'utf8' });
  assert.equal(attempt.error?.code, 'ENOENT');
  const output = await checkAlignment(baseline, config); assert.equal(output.verdict, 'aligned');
  return { helperError: attempt.error.code, stats: output.stats };
});

await negative('repository file count limit is fixed', (input) => {
  input.files = Array.from({ length: LIMITS.files + 1 }, () => ({ path: 'package.json', content: '' }));
}, /RESOURCE_LIMIT/);
await negative('repository file byte limit is fixed', (input) => {
  replaceFile(input, 'package.json', ' '.repeat(LIMITS.fileBytes + 1));
}, /RESOURCE_LIMIT/);
await negative('exact tree entry count limit is fixed', (input) => {
  input.tree.entries = Array.from({ length: LIMITS.treeEntries + 1 }, (_, i) =>
    ({ path: 'fixture-' + i, mode: '100644', sha: 'a'.repeat(40), size: 0 }));
}, /INCOMPLETE_TREE/);
await negative('request byte limit is fixed before parsing', () => ' '.repeat(LIMITS.requestBytes + 1), /RESOURCE_LIMIT/);
await negative('JSON data node limit is fixed', (input) => { input.excess = Array(LIMITS.dataNodes).fill(0); }, /RESOURCE_LIMIT/);
await negative('metadata package count limit is fixed', (input) => {
  input.metadata.packages = Array.from({ length: LIMITS.metadataPackages + 1 }, () => ({ name: 'fixture' }));
}, /RESOURCE_LIMIT/);
await negative('metadata envelope has closed field ownership', (input) => {
  input.metadata.padding = 'x'.repeat(LIMITS.metadataBytes);
}, /UNSUPPORTED_INPUT/);
await negative('metadata document volume cannot exceed bounded envelope', (input) => {
  input.metadata.packages[0].padding = 'x'.repeat(LIMITS.metadataBytes);
}, /RESOURCE_LIMIT/);
await negative('lock graph node count limit is fixed', (input) => {
  editLock(input, (lock) => {
    lock.packages = Object.fromEntries(Array.from({ length: LIMITS.lockNodes + 1 }, (_, i) => ['fixture-' + i + '@1.0.0', {}]));
  });
}, /RESOURCE_LIMIT/);
await negative('duplicate published coordinates are ambiguous', (input) => {
  input.metadata.packages.push(structuredClone(input.metadata.packages[0]));
}, /AMBIGUOUS_METADATA/);
for (const kind of ['depth', 'tokens']) {
  await negative('peer context ' + kind + ' limit is fixed', (input) => {
    editLock(input, (lock) => {
      const suffix = kind === 'depth' ? '(fixture@1.0.0'.repeat(LIMITS.contextDepth + 1) + ')'.repeat(LIMITS.contextDepth + 1) :
        Array.from({ length: LIMITS.contextTokens + 1 }, (_, i) => '(fixture-' + i + '@1.0.0)').join('');
      lock.importers['packages/create-paratix'].devDependencies.vitest.version = '4.1.11' + suffix;
    });
  }, /UNSUPPORTED_RESOLUTION/);
}
await test('diagnostics truncate long input-derived package contexts', async () => {
  const input = structuredClone(baseline);
  editLock(input, (lock) => {
    lock.importers['packages/create-paratix'].devDependencies.vitest.version = '4.1.11' +
      Array.from({ length: 30 }, (_, i) => '(fixture-long-peer-' + i + '@1.0.0)').join('');
  });
  const output = await checkAlignment(input, config);
  assert.equal(output.diagnostics.length, 1); assert.equal(output.diagnostics[0].code, 'MISSING_SNAPSHOT');
  assert.equal(output.diagnostics[0].message.length, LIMITS.diagnosticChars);
  return { verdict: output.verdict, diagnosticChars: output.diagnostics[0].message.length };
});
await negative('unpaired UTF8 surrogate is rejected', () => '"' + '\ud800' + '"', /INVALID_UTF8/);
await negative('malformed JSON cannot yield alignment', () => '{', /INVALID_JSON/);
await negative('unsupported schema cannot yield alignment', (input) => { input.schemaVersion = 2; }, /UNSUPPORTED_SCHEMA/);
await negative('invalid exact head cannot yield alignment', (input) => { input.identity.head = 'main'; }, /INVALID_IDENTITY/);
for (const field of ['checkerRevision', 'policyRevision', 'runtime', 'executable', 'registry', 'timeout']) {
  await negative('PR cannot select trusted ' + field, (input) => { input[field] = 'untrusted'; }, /UNSUPPORTED_INPUT/);
}
await test('trusted configuration has closed independent ownership', async () => {
  for (const supplied of [{}, { ...config, runtime: '/tmp/untrusted' }, { ...config, checkerRevision: 'main' }]) {
    const output = await checkAlignment(baseline, supplied);
    assert.notEqual(output.verdict, 'aligned'); assert.match(output.diagnostics[0].code, /INVALID_CONFIGURATION|UNSUPPORTED_INPUT/);
  }
});
await test('CLI rejects malformed UTF8 with bounded JSON and nonzero exit', async () => {
  const output = spawnSync(process.execPath, [join(repo, 'scripts/vitest-peer-alignment.mjs'),
    '--checker-revision', config.checkerRevision, '--policy-revision', config.policyRevision],
  { input: Buffer.from([0xff]), encoding: 'utf8', timeout: 15000 });
  assert.equal(output.status, 1); assert.equal(output.stderr, '');
  const result = JSON.parse(output.stdout); assert.equal(result.diagnostics[0].code, 'INVALID_UTF8');
  assert(output.stdout.length < 2048); return { status: output.status, diagnostic: result.diagnostics[0] };
});
for (const scenario of ['success', 'redirect', 'non200', 'wrong-name', 'wrong-version', 'invalid-utf8',
  'malformed-json', 'duplicate-json', 'oversized', 'aggregate', 'request-error', 'response-error',
  'duplicate-coordinates', 'request-url', 'invalid-coordinate', 'request-count', 'timeout']) {
  await test('fixed registry offline boundary ' + scenario, async () => {
    const child = spawnSync(process.execPath, [join(fixture, 'registry-transport-stub.mjs'),
      join(repo, 'scripts/vitest-peer-alignment.mjs'), scenario], { encoding: 'utf8', timeout: 15000 });
    assert.equal(child.status, 0, child.stderr); assert.equal(child.stderr, '');
    const result = JSON.parse(child.stdout);
    await writeFile(join(artifact, 'registry-' + scenario + '.json'), JSON.stringify(result, null, 2));
    assert(result.metrics.maxActive <= 4);
    for (const request of result.metrics.requests) {
      assert.match(request.url, /^https:\/\/registry\.npmjs\.org\/(?:%40vitest%2Fmodeled-package|fixture-package-\d+)\/1\.0\.0$/);
      assert.deepEqual(request.options, { headers: { accept: 'application/json' } });
    }
    if (scenario === 'success') {
      assert.equal(result.state, 'fulfilled'); assert.equal(result.metrics.maxActive, 4);
      assert.equal(result.envelope.packages.length, 12);
      assert.equal(result.envelope.source, 'https://registry.npmjs.org');
      const doc = result.envelope.packages[0];
      assert.deepEqual(Object.keys(doc).sort(), ['dependencies', 'dist', 'name', 'optionalDependencies',
        'peerDependencies', 'peerDependenciesMeta', 'version'].sort());
      assert.deepEqual(doc.dist, { integrity: 'sha512-' + 'A'.repeat(86) + '==' });
    } else {
      assert.equal(result.state, 'rejected');
      const codes = { redirect: 'METADATA_UNAVAILABLE', non200: 'METADATA_UNAVAILABLE',
        'wrong-name': 'INVALID_METADATA', 'wrong-version': 'INVALID_METADATA', 'invalid-utf8': 'INVALID_UTF8',
        'malformed-json': 'INVALID_JSON', 'duplicate-json': 'AMBIGUOUS_INPUT', oversized: 'RESOURCE_LIMIT',
        aggregate: 'RESOURCE_LIMIT', 'request-error': 'METADATA_UNAVAILABLE', 'response-error': 'METADATA_UNAVAILABLE',
        'duplicate-coordinates': 'AMBIGUOUS_METADATA', 'request-url': 'UNSUPPORTED_INPUT',
        'invalid-coordinate': 'INVALID_METADATA', 'request-count': 'RESOURCE_LIMIT', timeout: 'METADATA_TIMEOUT' };
      assert.equal(result.code, codes[scenario]);
      if (['duplicate-coordinates', 'request-url', 'invalid-coordinate', 'request-count'].includes(scenario)) assert.equal(result.metrics.requests.length, 0);
      else if (scenario !== 'response-error') assert(result.metrics.destroyed >= 1, 'Owned acquisition cancels active requests');
      if (scenario === 'timeout') assert(result.durationMs >= LIMITS.timeoutMs && result.durationMs < 14000);
    }
    assert.equal(result.metrics.active, 0, 'All offline connections are closed');
    return { acquisitionState: result.state, code: result.code, maxActive: result.metrics.maxActive,
      requests: result.metrics.requests.length, durationMs: Math.round(result.durationMs) };
  });
}

// Copy the complete already prepared owned runtime. This is portable after the
// same exact frozen install in CI; no host module or incidental store is used.
const source = join(repo, 'scripts/vitest-peer-alignment.mjs');
const originalSourceHash = hash(await readFile(source));
const runtimeRoot = join(repo, 'scripts/vitest-peer-alignment');
async function release(name) {
  const root = await realpath(await mkdtemp(join(artifact, name + '-')));
  const entry = join(root, 'vitest-peer-alignment.mjs'), runtime = join(root, 'vitest-peer-alignment');
  await cp(source, entry); await cp(runtimeRoot, runtime, { recursive: true, verbatimSymlinks: true });
  return { root, entry, runtime };
}
function canonicalHashData(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalHashData).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.keys(value).sort().map((key) =>
    JSON.stringify(key) + ':' + canonicalHashData(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
async function inspectRelease(owned) {
  const manifestBytes = await readFile(join(owned.runtime, 'package.json'));
  const lockBytes = await readFile(join(owned.runtime, 'pnpm-lock.yaml'));
  const ownRequire = createRequire(join(owned.runtime, 'package.json'));
  const modules = [];
  for (const [name, version] of [['semver', '7.8.5'], ['yaml', '2.9.1']]) {
    const entry = await realpath(ownRequire.resolve(name));
    const packagePath = await realpath(ownRequire.resolve(name + '/package.json'));
    for (const path of [entry, packagePath]) {
      const local = relative(owned.runtime, path); assert(local && !local.startsWith('../') && !local.startsWith('/'));
    }
    const bytes = await readFile(packagePath), installed = JSON.parse(bytes);
    assert.equal(installed.name, name); assert.equal(installed.version, version);
    assert.equal(Object.keys(installed.dependencies ?? {}).length, 0);
    assert.equal(Object.keys(installed.optionalDependencies ?? {}).length, 0);
    modules.push({ name, version, entrySha256: hash(await readFile(entry)), manifestSha256: hash(bytes) });
  }
  return { modules, runtimeSha256: hash(canonicalHashData({
    manifestSha256: hash(manifestBytes), lockSha256: hash(lockBytes), modules })) };
}
function invokeRelease(owned, input = baseline, { mode = 'check', permissions = 'read-only', extra = [], configArgs = true } = {}) {
  const flags = permissions === 'none' ? [] : ['--permission', '--disable-warning=SecurityWarning',
    '--allow-fs-read=' + (permissions === 'deny-runtime' ? owned.entry : permissions === 'deny-entry' ? owned.runtime : owned.root),
    ...(permissions === 'deny-worker' ? [] : ['--allow-worker'])];
  const args = [...flags, owned.entry,
    ...(configArgs ? ['--checker-revision', config.checkerRevision, '--policy-revision', config.policyRevision, '--mode', mode] : []), ...extra];
  const before = performance.now();
  const child = spawnSync(process.execPath, args, { input: typeof input === 'string' || Buffer.isBuffer(input) ? input : JSON.stringify(input),
    encoding: 'utf8', timeout: 16000, env: { PATH: dirname(process.execPath), HOME: owned.root }, cwd: owned.root });
  assert.equal(child.error, undefined, child.error?.message);
  let output; if (child.stdout.trim()) output = JSON.parse(child.stdout);
  return { child, output, elapsedMs: performance.now() - before, command: [process.execPath, ...args] };
}
const completeRelease = await release('complete-owned-release');
await test('actual complete owned release resolves exact modules and hash basis', async () => {
  const proof = await inspectRelease(completeRelease);
  const before = await fixtureDigest(completeRelease.root);
  const { child, output, command } = invokeRelease(completeRelease);
  assert.equal(child.status, 0, child.stderr); assert.equal(child.stderr, '');
  assert.equal(output.verdict, 'aligned'); assert.deepEqual(output.identity, baseline.identity);
  assert.equal(output.checkerRevision, config.checkerRevision); assert.equal(output.policyRevision, config.policyRevision);
  assert.equal(output.checkerSha256, originalSourceHash); assert.equal(output.runtimeSha256, proof.runtimeSha256);
  assert.equal(await fixtureDigest(completeRelease.root), before, 'Read-only release bytes changed');
  await writeFile(join(artifact, 'immutable-release.json'), JSON.stringify({ output, command, proof, release: completeRelease }, null, 2));
  return { release: completeRelease.root, modules: proof.modules, runtimeSha256: proof.runtimeSha256 };
});
await test('actual read-only CLI discovers bounded metadata without alignment verdict', async () => {
  const input = structuredClone(baseline); delete input.metadata;
  const { child, output } = invokeRelease(completeRelease, input, { mode: 'discover' });
  assert.equal(child.status, 0, child.stderr); assert.equal(output.verdict, 'metadata-required');
  assert.equal(output.operation, 'discover'); assert.equal(output.coordinates.length, 1104);
  const receipt = JSON.parse(await readFile(join(artifact, 'immutable-release.json'), 'utf8'));
  assert.equal(output.inputHash, receipt.output.inputHash); assert.equal(output.metadataHash, null);
});
await test('actual read-only CLI check exits nonzero for independent mismatch', async () => {
  const { child, output } = invokeRelease(completeRelease, mismatch());
  assert.equal(child.status, 1); assert.notEqual(output.verdict, 'aligned');
  assert.match(output.diagnostics[0].code, /PEER_MISMATCH/);
});
await test('actual read-only CLI cannot accept missing trusted revisions or mode', async () => {
  for (const options of [{ configArgs: false }, { mode: 'install' }, { extra: ['--runtime', '/tmp/PR-runtime'] }]) {
    const { child, output } = invokeRelease(completeRelease, '', options);
    assert.equal(child.status, 1); assert.notEqual(output.verdict, 'aligned'); assert.equal(output.diagnostics.length, 1);
  }
});
await test('read-only permissions prohibit writes child execution and repository steering', async () => {
  const input = structuredClone(baseline), consumer = join(artifact, 'readonly-consumer');
  await mkdir(consumer); const marker = join(consumer, 'must-not-exist');
  editManifest(input, '.', (manifest) => {
    manifest.scripts = { preinstall: 'node -e "require(\'node:fs\').writeFileSync(\'' + marker + '\',\'executed\')"',
      test: 'node malicious.mjs' };
  });
  const npmrc = 'registry=https://untrusted.invalid\nnode-options=--import=malicious.mjs\n';
  input.tree.entries.push({ path: '.npmrc', mode: '100644', size: Buffer.byteLength(npmrc),
    sha: createHash('sha1').update(Buffer.from('blob ' + Buffer.byteLength(npmrc) + '\0' + npmrc)).digest('hex') });
  for (const file of input.files) {
    const path = join(consumer, file.path); await mkdir(dirname(path), { recursive: true }); await writeFile(path, file.content);
  }
  await writeFile(join(consumer, '.npmrc'), npmrc);
  await writeFile(join(consumer, 'malicious.mjs'), 'throw new Error("Repository code must never execute");\n');
  const before = await fixtureDigest(consumer), releaseBefore = await fixtureDigest(completeRelease.root), serializedInput = JSON.stringify(input);
  const { child, output } = invokeRelease(completeRelease, input);
  assert.equal(child.status, 0, child.stderr); assert.equal(output.verdict, 'aligned');
  assert.equal(JSON.stringify(input), serializedInput); assert.equal(await fixtureDigest(consumer), before);
  assert.equal(await fixtureDigest(completeRelease.root), releaseBefore);
  await assert.rejects(readFile(marker), { code: 'ENOENT' });
  // Confirm the process permissions used by the proof independently deny both
  // writes and child execution; production checking needs neither capability.
  const probe = spawnSync(process.execPath, ['--permission', '--eval',
    'for (const run of [()=>require("node:fs").writeFileSync(process.argv[1],"x"),()=>require("node:child_process").spawnSync(process.execPath,[])]) {try{run();process.exit(7)}catch(e){if(e.code!=="ERR_ACCESS_DENIED")throw e}}',
  marker], { encoding: 'utf8', env: {}, input: '', timeout: 5000 });
  assert.equal(probe.status, 0, probe.stderr);
});
for (const scenario of ['missing-runtime', 'missing-manifest', 'missing-lock', 'missing-semver', 'missing-yaml',
  'wrong-manifest-pin', 'wrong-installed-version', 'extra-required-closure', 'extra-optional-closure',
  'incomplete-lock-closure', 'wrong-lock-pin', 'runtime-escape', 'manifest-alias', 'module-escape',
  'ancestor-fallback', 'denied-worker', 'denied-runtime', 'denied-manifest']) {
  await test('owned release rejects ' + scenario, async () => {
    const owned = await release(scenario), runtime = owned.runtime;
    const ownRequire = createRequire(join(runtime, 'package.json'));
    const modulePackage = ownRequire.resolve('semver/package.json');
    let permissions = 'read-only', restore;
    if (scenario === 'missing-runtime') await rm(runtime, { recursive: true });
    if (scenario === 'missing-manifest') await rm(join(runtime, 'package.json'));
    if (scenario === 'missing-lock') await rm(join(runtime, 'pnpm-lock.yaml'));
    if (scenario === 'missing-semver' || scenario === 'missing-yaml') await rm(join(runtime, 'node_modules', scenario.slice(8)));
    if (scenario === 'wrong-manifest-pin') {
      const path = join(runtime, 'package.json'), manifest = JSON.parse(await readFile(path));
      manifest.dependencies.yaml = '^2.9.1'; await writeFile(path, JSON.stringify(manifest));
    }
    if (['wrong-installed-version', 'extra-required-closure', 'extra-optional-closure'].includes(scenario)) {
      const manifest = JSON.parse(await readFile(modulePackage));
      if (scenario === 'wrong-installed-version') manifest.version = '7.8.4';
      else manifest[scenario === 'extra-required-closure' ? 'dependencies' : 'optionalDependencies'] = { undeclared: '1.0.0' };
      await writeFile(modulePackage, JSON.stringify(manifest));
    }
    if (scenario === 'incomplete-lock-closure' || scenario === 'wrong-lock-pin') {
      const path = join(runtime, 'pnpm-lock.yaml'), lock = YAML.parse(await readFile(path, 'utf8'));
      if (scenario === 'incomplete-lock-closure') delete lock.snapshots['semver@7.8.5'];
      else lock.importers['.'].dependencies.semver.version = '7.8.4';
      await writeFile(path, YAML.stringify(lock));
    }
    if (scenario === 'runtime-escape') {
      const outside = join(artifact, 'escape-' + Date.now()); await cp(runtime, outside, { recursive: true, verbatimSymlinks: true });
      await rm(runtime, { recursive: true }); await symlink(outside, runtime);
    }
    if (scenario === 'manifest-alias') {
      const path = join(runtime, 'package.json'), alias = join(runtime, 'other-manifest.json');
      await cp(path, alias); await rm(path); await symlink(alias, path);
    }
    if (scenario === 'module-escape' || scenario === 'ancestor-fallback') {
      const outside = join(owned.root, 'node_modules/semver'); await mkdir(dirname(outside), { recursive: true });
      await cp(await realpath(dirname(modulePackage)), outside, { recursive: true });
      const link = join(runtime, 'node_modules/semver'); await rm(link);
      if (scenario === 'module-escape') await symlink(outside, link);
    }
    if (scenario === 'denied-worker' || scenario === 'denied-runtime') permissions = scenario.replace('denied-', 'deny-');
    if (scenario === 'denied-manifest') { restore = join(runtime, 'package.json'); await chmod(restore, 0); }
    const { child, output } = invokeRelease(owned, baseline, { permissions });
    if (restore) await chmod(restore, 0o644);
    assert.equal(child.status, 1, child.stderr); assert.equal(child.stderr, ''); assert.notEqual(output.verdict, 'aligned');
    assert.equal(output.diagnostics[0].code, 'UNAVAILABLE_RUNTIME'); assert(child.stdout.length < 2048);
    await writeFile(join(artifact, 'layout-' + scenario + '.json'), JSON.stringify(output, null, 2));
    return { verdict: output.verdict, code: output.diagnostics[0].code };
  });
}
for (const scenario of ['missing-entry', 'denied-entry', 'permission-denied-entry']) {
  await test('native process rejects ' + scenario + ' before any alignment output', async () => {
    const owned = await release(scenario);
    if (scenario === 'missing-entry') await rm(owned.entry);
    if (scenario === 'denied-entry') await chmod(owned.entry, 0);
    let child, output;
    if (scenario === 'permission-denied-entry') {
      child = spawnSync(process.execPath, ['--permission', '--allow-fs-read=' + owned.runtime,
        '--input-type=module', '--eval', 'await import(' + JSON.stringify('file://' + owned.entry) + ')'],
      { input: '', encoding: 'utf8', timeout: 5000, env: {} });
      assert.equal(child.error, undefined);
    } else ({ child, output } = invokeRelease(owned, '', { permissions: 'read-only' }));
    if (scenario === 'denied-entry') await chmod(owned.entry, 0o644);
    assert.notEqual(child.status, 0); assert.equal(output, undefined);
    assert(child.stderr.length < 10000); return { status: child.status, outputAbsent: true };
  });
}
await test('owned Worker retains inherited no-write filesystem permission', async () => {
  const owned = await release('trusted-worker-permission-probe'), sentinel = join(owned.root, 'must-not-write');
  const text = await readFile(owned.entry, 'utf8');
  const before = 'pureValidation(workerData.raw, workerData.config, workerData.operation).then((result) => parentPort.postMessage(result));';
  assert(text.includes(before));
  // The trusted copy probes the capability inside the actual owned Worker.
  // It is never a repository script and is not the authenticated release proof.
  const probe = 'try { await (await import("node:fs/promises")).writeFile(' + JSON.stringify(sentinel) +
    ', "unexpected write"); parentPort.postMessage({verdict:"unexpected-write"}); } catch(error) {' +
    'parentPort.postMessage({verdict:"permission-denied",code:error.code}); }';
  await writeFile(owned.entry, text.replace(before, probe));
  const { child, output } = invokeRelease(owned);
  assert.equal(child.status, 1); assert.equal(output.verdict, 'permission-denied'); assert.equal(output.code, 'ERR_ACCESS_DENIED');
  await assert.rejects(readFile(sentinel), { code: 'ENOENT' });
  return { permissionCode: output.code, sentinelAbsent: true };
});
await test('owned Worker deadline terminates synchronous parser work', async () => {
  const owned = await release('trusted-parser-fault');
  const ownRequire = createRequire(join(owned.runtime, 'package.json'));
  const entry = await realpath(ownRequire.resolve('yaml'));
  // Deliberately corrupt only the isolated trusted test copy, not source, a PR
  // file, or the authenticated positive release. Runtime version stays exact.
  await writeFile(entry, await readFile(entry, 'utf8') + '\nexports.parseDocument = () => { for (;;) {} };\n');
  const { child, output, elapsedMs } = invokeRelease(owned);
  assert.equal(child.status, 1); assert.equal(child.stderr, ''); assert.equal(output.diagnostics[0].code, 'CHECKER_TIMEOUT');
  assert(elapsedMs >= LIMITS.timeoutMs && elapsedMs < 15000, 'Owned deadline must complete before outer harness kill');
  return { elapsedMs: Math.round(elapsedMs), diagnostic: output.diagnostics[0] };
});
await test('owned Worker exit produces bounded non-success output', async () => {
  const owned = await release('trusted-worker-exit-fault');
  const text = await readFile(owned.entry, 'utf8');
  assert(text.includes('if (!isMainThread) {'));
  await writeFile(owned.entry, text.replace('if (!isMainThread) {', 'if (!isMainThread) { process.exit(7);'));
  const { child, output } = invokeRelease(owned);
  assert.equal(child.status, 1); assert.equal(output.diagnostics[0].code, 'CHECKER_FAILURE'); assert(child.stdout.length < 2048);
});
await test('owned stdin deadline bounds an incomplete native caller', async () => {
  const started = performance.now();
  const child = spawn(process.execPath, ['--permission', '--disable-warning=SecurityWarning',
    '--allow-fs-read=' + completeRelease.root, '--allow-worker', completeRelease.entry,
    '--checker-revision', config.checkerRevision, '--policy-revision', config.policyRevision],
  { stdio: ['pipe', 'pipe', 'pipe'], env: {}, cwd: completeRelease.root });
  let stdout = '', stderr = '';
  child.stdout.on('data', (bytes) => { stdout += bytes; }); child.stderr.on('data', (bytes) => { stderr += bytes; });
  child.stdin.write('{');
  const status = await new Promise((done, reject) => {
    const outer = setTimeout(() => { child.kill(); reject(new Error('Owned stdin deadline did not finish')); }, 15000);
    child.once('error', (error) => { clearTimeout(outer); reject(error); });
    child.once('exit', (code) => { clearTimeout(outer); done(code); });
  });
  child.stdin.destroy(); const output = JSON.parse(stdout), elapsedMs = performance.now() - started;
  assert.equal(status, 1); assert.equal(stderr, ''); assert.equal(output.diagnostics[0].code, 'INPUT_TIMEOUT');
  assert(elapsedMs >= LIMITS.timeoutMs && elapsedMs < 15000); return { elapsedMs: Math.round(elapsedMs), status };
});

await mkdir(artifact, { recursive: true });

// Published ancestor contracts in this small review model are synthetic. All
// original graph nodes and metadata remain present in each substitution case.
function modeledAncestorInput(substitution) {
  const integrity = 'sha512-' + Buffer.alloc(64, 1).toString('base64');
  const manifest = { packageManager: 'pnpm@11.17.0', dependencies: { ancestor: '1.0.0', vitest: '4.1.11' } };
  const docs = [
    { name: 'ancestor', version: '1.0.0', dependencies: { consumer: '1.0.0' } },
    { name: 'consumer', version: '1.0.0', peerDependencies: { vitest: '4.1.10' } },
    { name: 'consumer', version: '2.0.0', peerDependencies: { vitest: '4.1.10' } },
    { name: 'innocent', version: '1.0.0' },
    { name: 'vitest', version: '4.1.11' },
  ].map((doc) => ({ ...doc, dist: { integrity } }));
  const lock = { lockfileVersion: '9.0', importers: { '.': { dependencies: {
    ancestor: { specifier: '1.0.0', version: '1.0.0' }, vitest: { specifier: '4.1.11', version: '4.1.11' },
  } } }, packages: Object.fromEntries(docs.map((doc) => [doc.name + '@' + doc.version,
    { resolution: { integrity }, ...(doc.peerDependencies ? { peerDependencies: doc.peerDependencies } : {}) }])),
  snapshots: {
    'ancestor@1.0.0': { dependencies: { consumer: substitution === 'name' ? 'innocent@1.0.0'
      : substitution === 'version' ? '2.0.0(vitest@4.1.11)' : '1.0.0(vitest@4.1.11)' } },
    'consumer@1.0.0(vitest@4.1.11)': { dependencies: { vitest: '4.1.11' } },
    'consumer@2.0.0(vitest@4.1.11)': { dependencies: { vitest: '4.1.11' } },
    'innocent@1.0.0': {}, 'vitest@4.1.11': {},
  } };
  const head = 'a'.repeat(40);
  const modelFiles = [{ path: 'package.json', content: JSON.stringify(manifest) },
    { path: 'pnpm-lock.yaml', content: YAML.stringify(lock) }];
  return { schemaVersion: 1, identity: { repository: 'fixture/modeled-ancestor', pullRequest: 37, head },
    tree: { complete: true, head, entries: modelFiles.map((file) => {
      const bytes = Buffer.from(file.content);
      return { path: file.path, mode: '100644', size: bytes.length,
        sha: createHash('sha1').update(Buffer.concat([Buffer.from('blob ' + bytes.length + '\0'), bytes])).digest('hex') };
    }) }, files: modelFiles, metadata: { schemaVersion: 1, source: 'https://registry.npmjs.org',
      authenticated: true, policy: 'public-npm-v1', packages: docs } };
}
for (const [substitution, code] of [['control', 'PEER_MISMATCH'], ['name', 'DEPENDENCY_MISMATCH'],
  ['version', 'DEPENDENCY_MISMATCH']]) {
  await test('modeled required ancestor ' + substitution + ' retains published reachability', async () => {
    const input = modeledAncestorInput(substitution), before = JSON.stringify(input);
    const output = await checkAlignment(input, config);
    await writeFile(join(artifact, 'modeled-ancestor-' + substitution + '.json'), JSON.stringify(output, null, 2));
    assert.notEqual(output.verdict, 'aligned');
    assert.equal(output.diagnostics[0].code, code, JSON.stringify(output.diagnostics));
    assert.equal(JSON.stringify(input), before);
    return { verdict: output.verdict, diagnostics: output.diagnostics };
  });
}


await test('modeled independent Vitest 3 and 4 runtimes retain authentic complete contracts', async () => {
  const bytes = await readFile(join(fixture, 'modeled-independent-runtimes.json'));
  const model = JSON.parse(bytes.toString('utf8'));
  assert.equal(model.kind, 'modeled-independent-runtime-overlay');
  assert.equal(model.baseSourceCommit, provenance.sourceCommit);
  assert.equal(model.nodes.length, 48);
  const input = structuredClone(baseline), manifestPath = model.owner + '/package.json';
  const content = JSON.stringify(model.manifest, null, 2) + '\n', manifestBytes = Buffer.from(content);
  input.files.push({ path: manifestPath, content });
  input.tree.entries.push({ path: manifestPath, mode: '100644', size: manifestBytes.length,
    sha: createHash('sha1').update(Buffer.concat([Buffer.from('blob ' + manifestBytes.length + '\0'), manifestBytes])).digest('hex') });
  // A deterministic fixture head labels this synthetic complete tree; it is not
  // an authenticated source commit and the caller assertion is test-owned.
  input.identity.head = input.tree.head = createHash('sha1').update(bytes).digest('hex');
  const byCoordinate = new Map(model.nodes.map((node) => [node.coordinate, node]));
  function snapshotKey(coordinate) {
    const node = byCoordinate.get(coordinate);
    return coordinate + Object.values(node.peers).sort().map((peer) => '(' + snapshotKey(peer) + ')').join('');
  }
  editLock(input, (lock) => {
    lock.importers[model.owner] = { devDependencies: { vitest: { specifier: '3.2.4', version: snapshotKey(model.runtime).slice('vitest@'.length) } } };
    for (const node of model.nodes) {
      const doc = node.doc, key = snapshotKey(node.coordinate);
      if (!lock.packages[node.coordinate]) lock.packages[node.coordinate] = {
        resolution: { integrity: doc.dist.integrity },
        ...(doc.peerDependencies ? { peerDependencies: doc.peerDependencies } : {}),
        ...(doc.peerDependenciesMeta ? { peerDependenciesMeta: doc.peerDependenciesMeta } : {}),
      };
      if (!lock.snapshots[key]) lock.snapshots[key] = { dependencies: Object.fromEntries(
        Object.entries({ ...node.edges, ...node.peers }).map(([name, target]) => [name,
          snapshotKey(target).startsWith(name + '@') ? snapshotKey(target).slice(name.length + 1) : snapshotKey(target)])) };
      const existing = input.metadata.packages.find((info) => info.name === doc.name && info.version === doc.version);
      if (existing) assert.deepEqual(existing, doc, 'Shared published document must stay authentic');
      else input.metadata.packages.push(doc);
    }
  });
  const before = JSON.stringify(input), output = await checkAlignment(input, config);
  await writeFile(join(artifact, 'modeled-independent-runtimes-input.json'), JSON.stringify(input));
  await writeFile(join(artifact, 'modeled-independent-runtimes.json'), JSON.stringify(output, null, 2));
  assert.equal(output.verdict, 'aligned', JSON.stringify(output.diagnostics));
  assert.equal(output.stats.importers, 5);
  assert.equal(JSON.stringify(input), before);
  const lock = YAML.parse(input.files.find((file) => file.path === 'pnpm-lock.yaml').content);
  assert(lock.snapshots['vitest@3.2.4']);
  assert.equal(Object.keys(lock.snapshots).filter((key) => key.startsWith('vitest@4.1.11(')).length, 2);
  assert.equal(lock.importers[model.owner].devDependencies.vitest.specifier, '3.2.4');
  assert.equal(lock.importers['packages/paratix'].devDependencies.vitest.specifier, '^4.1.11');
  return { verdict: output.verdict, stats: output.stats, modeledFixtureSha256: hash(bytes),
    additionalPublishedCoordinates: model.provenance.additionalAcquisition.coordinates };
});

const summary = { schemaVersion: 1, sourceCommit: provenance.sourceCommit, fixtureHead: provenance.fixtureHead,
  node: process.versions.node, artifact, results, passed: results.filter((result) => result.state === 'PASSED').length,
  failed: results.filter((result) => result.state === 'FAILED').length,
  boundary: 'Offline trusted fixture/checker source proof only; deployment and consumer enforcement pending.' };
await writeFile(join(artifact, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log('Artifacts: ' + artifact);
if (summary.failed) process.exitCode = 1;
