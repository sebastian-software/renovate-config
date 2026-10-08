import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { archiveMembers } from '../vitest-release/archive.mjs';
import { readPinnedJson, inventory, compareInventory, budgets, hashFile, sha256,
  realDirectory, requireValue, sameStat, verifyReadOnly } from '../vitest-release/files.mjs';
import { ORIGINAL_PNPM_ARCHIVE, ORIGINAL_PNPM_BUNDLE, transformPnpm } from '../vitest-native/transform.mjs';
import { originalLocations } from './original-observer-source.mjs';
import { exact } from './original-observer-contract.mjs';

export const observerSourceFiles = [
  'scripts/test-vitest-native-original-observer.mjs',
  ...['original-observer', 'original-observer-contract', 'original-observer-source',
    'original-observer-inputs', 'original-observer-protocol', 'original-observer-process']
    .map(name => `scripts/vitest-native-worker/${name}.mjs`),
  ...['prepare', 'transform', 'identity', 'probe', 'collector', 'loader', 'runtime', 'data-only']
    .map(name => `scripts/vitest-native/${name}.mjs`),
  'scripts/vitest-release/archive.mjs', 'scripts/vitest-release/files.mjs',
].sort();
export const observerRoot = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');
export function observerPath(value) {
  requireValue(typeof value === 'string' && /^\/[A-Za-z0-9/._-]{1,1023}$/.test(value) &&
    path.normalize(value) === value && !value.endsWith('/'), 'Invalid canonical observer path');
  return value;
}
export async function controllerInventory() {
  return Promise.all(observerSourceFiles.map(async name => ({ path: name,
    sha256: (await hashFile(path.join(observerRoot, name), 2_097_152)).sha256 })));
}
export async function preflightOriginalObserver(inputFile, inputPin, output) {
  observerPath(inputFile); observerPath(output);
  const { document: input } = await readPinnedJson(inputFile, inputPin, 65_536);
  requireValue(!((await fs.lstat(inputFile)).mode & 0o222), 'Observer input must be read-only');
  exact(input, ['schemaVersion', 'qualificationContractRevision', 'evidenceScope', 'node', 'pnpm', 'controllerFiles', 'fixtureRecipe']);
  requireValue(input.schemaVersion === 1 && input.qualificationContractRevision === 2 && input.evidenceScope === 'source-fixture' &&
    ['empty-v1', 'offline-miss-v1'].includes(input.fixtureRecipe), 'Unsupported bounded observer input');
  exact(input.node, ['path', 'sha256', 'version', 'v8', 'archive']); exact(input.pnpm, ['archive', 'root']);
  requireValue(input.node.version === '24.18.0' && process.versions.node === input.node.version &&
    input.node.v8 === process.versions.v8 && typeof input.node.v8 === 'string' &&
    /^[0-9A-Za-z._-]{1,64}$/.test(input.node.v8), 'Unsupported pinned Node/V8 runtime');
  observerPath(input.node.path); observerPath(input.pnpm.archive); observerPath(input.pnpm.root);
  requireValue(await fs.realpath(input.node.path) === input.node.path && await fs.realpath(process.execPath) === input.node.path,
    'Controller does not execute the selected Node');
  const nodeIdentity = await hashFile(input.node.path, budgets.toolchain.file);
  requireValue(nodeIdentity.executable && nodeIdentity.sha256 === input.node.sha256, 'Selected Node bytes differ');
  if (input.node.archive === null) {
    requireValue(process.platform === 'darwin' && process.arch === 'arm64' &&
      nodeIdentity.sha256 === 'ee6fb0e015284d83a91e8ec5213f43a157f8a392b58555301682892ba928c04a',
    'Missing independently authenticated Node artifact');
  } else {
    observerPath(input.node.archive);
    const platform = `${process.platform}-${process.arch}`;
    const pins = { 'darwin-arm64': 'e1a97e14c99c803e96c7339403282ea05a499c32f8d83defe9ef5ec66f979ed1',
      'linux-x64': '783130984963db7ba9cbd01089eaf2c2efb055c7c1693c943174b967b3050cb8' };
    requireValue(pins[platform], 'Unsupported exact Node platform');
    const members = await archiveMembers(input.node.archive, pins[platform]);
    requireValue(members.get(`node-v24.18.0-${platform}/bin/node`)?.sha256 === nodeIdentity.sha256,
      'Selected executable differs from authenticated Node archive');
  }
  requireValue(Array.isArray(input.controllerFiles) && input.controllerFiles.length === observerSourceFiles.length,
    'Incomplete observer controller closure');
  for (const [index, leaf] of input.controllerFiles.entries()) {
    exact(leaf, ['path', 'sha256']);
    requireValue(leaf.path === observerSourceFiles[index], 'Unknown/reordered controller closure');
    const filename = path.join(observerRoot, leaf.path);
    requireValue(await fs.realpath(filename) === filename && (await hashFile(filename, 2_097_152)).sha256 === leaf.sha256,
      'Selected observer controller source changed');
  }
  await realDirectory(input.pnpm.root);
  requireValue(await fs.realpath(input.pnpm.archive) === input.pnpm.archive, 'Archive ancestry traverses links');
  const members = await archiveMembers(input.pnpm.archive, ORIGINAL_PNPM_ARCHIVE);
  const expected = [...members].filter(([, item]) => item.type !== 'directory').map(([name, item]) => {
    requireValue(name.startsWith('package/'), 'Unknown original pnpm archive prefix');
    return item.type === 'symlink' ? { path: name.slice(8), type: 'symlink', target: item.target } : { path: name.slice(8), ...item };
  }).sort((a, b) => a.path.localeCompare(b.path, 'en'));
  compareInventory(await inventory(input.pnpm.root, budgets.toolchain), expected);
  await verifyReadOnly(input.pnpm.root);
  const script = path.join(input.pnpm.root, 'dist/pnpm.mjs'); const bytes = await fs.readFile(script);
  requireValue(sha256(bytes) === ORIGINAL_PNPM_BUNDLE, 'Unknown original script');
  const locations = Object.fromEntries(['install', 'update', 'dedupe'].map(category => [category, originalLocations(bytes, category)]));
  const parent = path.dirname(output); await realDirectory(parent);
  requireValue(!(await fs.lstat(parent)).isSymbolicLink(), 'Output parent is a link');
  for (const protectedPath of [inputFile, input.node.path, input.pnpm.root, input.pnpm.archive, observerRoot]) {
    requireValue(output !== protectedPath && !output.startsWith(`${protectedPath}/`) && !protectedPath.startsWith(`${output}/`),
      'Output overlaps protected observer inputs');
  }
  try { await fs.lstat(output); throw new Error('Observer output already exists'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const held = [];
  for (const filename of [input.node.path, script, input.pnpm.archive]) {
    const handle = await fs.open(filename, 'r'); held.push({ filename, handle, stat: await handle.stat({ bigint: true }) });
  }
  async function unchanged() {
    for (const leaf of held) requireValue(sameStat(leaf.stat, await leaf.handle.stat({ bigint: true })) &&
      sameStat(leaf.stat, await fs.lstat(leaf.filename, { bigint: true })), 'Observer held identity replaced');
    requireValue((await hashFile(input.node.path, budgets.toolchain.file)).sha256 === nodeIdentity.sha256,
      'Observer executable changed');
    compareInventory(await inventory(input.pnpm.root, budgets.toolchain), expected);
    for (const leaf of input.controllerFiles) requireValue((await hashFile(path.join(observerRoot, leaf.path), 2_097_152)).sha256 === leaf.sha256,
      'Observer controller changed during execution');
  }
  return { input, output, script, locations, originalBytes: bytes,
    derivedBundleSha256: sha256(transformPnpm(bytes)), nodeIdentity,
    unchanged, async close() { await Promise.all(held.map(leaf => leaf.handle.close())); } };
}
