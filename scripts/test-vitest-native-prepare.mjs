#!/usr/bin/env node
// Production-format source fixtures authenticate preparation, never qualification or deployment.
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';

const { values } = parseArgs({ options: {
  'pnpm-archive': { type: 'string' }, 'pnpm-root': { type: 'string' }, output: { type: 'string' },
} });
for (const key of ['pnpm-archive', 'pnpm-root']) assert(values[key], `Missing --${key}`);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
// Independent original distribution pins, not hashes selected by the implementation under test.
const originalArchiveSha256 = '644eb5079654e87dae59a07e62d7f098162b9ce58f06077328b5ddefca1c8541';
const originalBundleSha256 = '228451e6383cf4df0700fc19b37aba1a25e6540e62fbca70ca2d76b719a4d883';
const archive = await fs.realpath(values['pnpm-archive']);
const pnpmRoot = await fs.realpath(values['pnpm-root']);
assert.equal(sha256(await fs.readFile(archive)), originalArchiveSha256);
assert.equal(sha256(await fs.readFile(path.join(pnpmRoot, 'dist/pnpm.mjs'))), originalBundleSha256);
const root = values.output ? path.resolve(values.output) : await fs.mkdtemp(path.join(tmpdir(), 'native-prepare-'));
if (values.output) await fs.mkdir(root);
const fixtureRoot = await fs.realpath(root);
const repository = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourceRoot = path.join(fixtureRoot, 'selected-source');
await fs.mkdir(sourceRoot);
// Keep the executing implementation real and make its containing Git revision available
// without committing the developer's worktree or pretending this is a published release.
const implementationPaths = [
  'scripts/vitest-native-prepare.mjs',
  ...(await fs.readdir(path.join(repository, 'scripts/vitest-native'))).filter(name => name.endsWith('.mjs'))
    .map(name => `scripts/vitest-native/${name}`),
  'scripts/vitest-release/archive.mjs', 'scripts/vitest-release/files.mjs',
].sort();
const implementationFiles = [];
for (const name of implementationPaths) {
  const bytes = await fs.readFile(path.join(repository, name));
  const mode = (await fs.stat(path.join(repository, name))).mode & 0o111 ? 0o755 : 0o644;
  const output = path.join(sourceRoot, name);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, bytes, { flag: 'wx', mode });
  implementationFiles.push({ path: name, type: 'file', sha256: sha256(bytes), size: bytes.length, executable: Boolean(mode & 0o111) });
}
function git(...args) {
  return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgSign=false', ...args], {
    cwd: sourceRoot, encoding: 'utf8', env: {
      PATH: process.env.PATH, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 'Source fixture', GIT_COMMITTER_NAME: 'Source fixture',
      GIT_AUTHOR_EMAIL: 'source-fixture@example.invalid', GIT_COMMITTER_EMAIL: 'source-fixture@example.invalid',
      GIT_AUTHOR_DATE: '2026-10-07T00:00:00Z', GIT_COMMITTER_DATE: '2026-10-07T00:00:00Z',
    }, stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
git('init', '--quiet');
git('add', '--', 'scripts');
git('commit', '--quiet', '--no-verify', '-m', 'Test-only containing preparation source');
const revision = git('rev-parse', 'HEAD');
assert.match(revision, /^[a-f0-9]{40}$/);
assert.equal(git('status', '--porcelain'), '');
const { prepareNative } = await import(pathToFileURL(path.join(sourceRoot, 'scripts/vitest-native/prepare.mjs')));
const receiptDirectory = path.join(fixtureRoot, 'receipts');
await fs.mkdir(receiptDirectory);
const inputs = { archive, pnpmRoot, receiptDirectory, context: {
  worker: 'controlled-source', wrapperInvocation: 'controlled-source', containerId: null, imageId: null, imageDigest: null,
} };
async function readProfile(name, result) {
  const bytes = await fs.readFile(path.join(fixtureRoot, name, 'profile.json'));
  assert.equal(sha256(bytes), result.profileSha256, 'Preparation must freeze exactly the emitted profile bytes');
  return JSON.parse(bytes);
}
// Existing callers supply no provenance. Their candidate contract must remain intact.
const candidate = await prepareNative({ ...inputs, output: path.join(fixtureRoot, 'candidate') });
const candidateProfile = await readProfile('candidate', candidate);
assert.equal(candidate.productionEligible, false);
assert.equal(candidate.transformRevision, null);
assert.equal(candidateProfile.productionEligible, false);
assert.equal(candidateProfile.transformRevision, null);
assert.equal(candidateProfile.provenanceClass, 'unpublished-candidate');
process.stdout.write(JSON.stringify({ case: 'legacy-candidate', state: 'PASSED', productionEligible: false, transformRevision: null }) + '\n');

// Test-owned selection is pinned before calling preparation. Production ownership,
// qualification receipts and publication authentication are deliberately unavailable.
const preparation = {
  schemaVersion: 1, trustScope: 'source-fixture', sourceRevision: revision,
  sourceOrigin: `https://github.com/sebastian-software/renovate-config/commit/${revision}`,
  transform: { revision, files: implementationFiles },
  original: {
    name: 'pnpm', version: '11.17.0', origin: 'https://registry.npmjs.org/pnpm/-/pnpm-11.17.0.tgz',
    archiveSha256: originalArchiveSha256, bundleSha256: originalBundleSha256,
  },
};
const provenance = path.join(fixtureRoot, 'preparation.json');
const preparationBytes = jsonBytes(preparation);
await fs.writeFile(provenance, preparationBytes, { flag: 'wx', mode: 0o444 });
const provenanceSha256 = sha256(preparationBytes);
await fs.writeFile(path.join(fixtureRoot, 'selection.json'), jsonBytes({
  schemaVersion: 1, trustScope: 'source-fixture', provenanceSha256, sourceRevision: revision, transformRevision: revision,
}), { flag: 'wx', mode: 0o444 });
const selectedInputs = { ...inputs, provenance, provenanceSha256, sourceRoot };
const selected = await prepareNative({ ...selectedInputs, output: path.join(fixtureRoot, 'selected') });
process.stdout.write(JSON.stringify({ case: 'selected-containing-transform', actual: selected.transformRevision,
  expected: revision, provenanceSha256, output: fixtureRoot, linuxProcessProof: false, productionProof: false }) + '\n');
assert.equal(selected.transformRevision, revision,
  'Authenticated source-fixture preparation must freeze the selected containing transform revision before proof');
const profile = await readProfile('selected', selected);
assert.equal(profile.transformRevision, revision);
assert.equal(profile.sourceRevision, revision);
assert.equal(profile.trustScope, 'source-fixture', 'Test selection must retain its nondeployable scope');
assert.equal(profile.productionEligible, false, 'Source preparation cannot qualify or authorize deployment');
assert.equal(selected.productionEligible, false);
assert.equal(profile.originalArchiveSha256, originalArchiveSha256);
assert.equal(profile.originalBundleSha256, originalBundleSha256);
assert.equal(profile.derivedBundleSha256, sha256(await fs.readFile(path.join(fixtureRoot, 'selected/derived-pnpm.mjs'))));
assert.notEqual(profile.derivedBundleSha256, originalBundleSha256);
assert.deepEqual(profile.pnpmFiles.map(file => file.path), profile.derivedFiles.map(file => file.path));
assert.deepEqual(profile.pnpmFiles.filter(file => file.path !== 'dist/pnpm.mjs'),
  profile.derivedFiles.filter(file => file.path !== 'dist/pnpm.mjs'), 'Original and derived identities may differ only at the authenticated transform');
assert.equal(profile.pnpmFiles.find(file => file.path === 'dist/pnpm.mjs').sha256, originalBundleSha256);
assert.equal(profile.derivedFiles.find(file => file.path === 'dist/pnpm.mjs').sha256, profile.derivedBundleSha256);
assert.equal(profile.pnpmFiles.length, candidateProfile.pnpmFiles.length);

await assert.rejects(prepareNative({ ...selectedInputs, provenanceSha256: '0'.repeat(64), output: path.join(fixtureRoot, 'wrong-pin') }),
  'Preparation must reject a selection pin that does not authenticate the supplied bytes');
const transformedSource = path.join(sourceRoot, 'scripts/vitest-native/transform.mjs');
const originalSource = await fs.readFile(transformedSource);
try {
  await fs.appendFile(transformedSource, '\n// Changed after outside selection.\n');
  await assert.rejects(prepareNative({ ...selectedInputs, output: path.join(fixtureRoot, 'changed-source') }),
    'Containing commit and fixed preparation pin must reject changed implementation bytes');
} finally { await fs.writeFile(transformedSource, originalSource); }
assert.equal(sha256(await fs.readFile(provenance)), provenanceSha256);
process.stdout.write(JSON.stringify({ state: 'PASSED', scope: 'native-immutable-source-fixture-preparation',
  candidateRoundtrip: true, selectedContainingRevision: revision, fixedPinAndExecutingSourceTamperRejected: true,
  linuxProcessProof: false, productionProof: false, productionEligible: false, output: fixtureRoot }) + '\n');
