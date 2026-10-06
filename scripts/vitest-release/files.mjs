import { constants } from 'node:fs';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

export class ReleaseError extends Error {
  constructor(message, options) { super(message, options); this.name = 'ReleaseError'; }
}
export function requireValue(condition, message) {
  if (!condition) throw new ReleaseError(message);
}
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const digestPattern = /^[a-f0-9]{64}$/;
export const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
export const budgets = {
  checker: { count: 10_000, file: 2_097_152, total: 67_108_864 },
  helper: { count: 10_000, file: 2_097_152, total: 67_108_864 },
  toolchain: { count: 50_000, file: 268_435_456, total: 1_073_741_824 },
};
export function relativeName(value) {
  requireValue(typeof value === 'string' && value.length > 0 && value.length <= 4096 &&
    !value.includes('\\') && !value.includes('\0') && !path.posix.isAbsolute(value) &&
    value.split('/').every((part) => part !== '' && part !== '.' && part !== '..'),
  'Invalid relative inventory path');
  return value;
}
export async function realDirectory(root) {
  requireValue(path.isAbsolute(root), 'Roots must be absolute paths');
  requireValue((await fs.lstat(root)).isDirectory(), 'Root must be a real directory');
  requireValue(await fs.realpath(root) === root, 'Root must not traverse symlinks');
  return root;
}
export function sameStat(a, b) {
  return ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'mode'].every((key) => a[key] === b[key]);
}
export async function openedDirectory(filename) {
  const before = await fs.lstat(filename, { bigint: true });
  const handle = await fs.open(filename, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    requireValue(before.isDirectory() && sameStat(before, await handle.stat({ bigint: true })), 'Directory changed before opening');
    // Linux procfs anchors descendants to the held directory inode, even when
    // its old pathname is replaced with a symlink. Darwin has no builtin openat
    // equivalent here; only explicitly non-production candidate mode uses paths.
    return { handle, location: process.platform === 'linux' ? `/proc/self/fd/${handle.fd}` : filename };
  } catch (error) { await handle.close(); throw error; }
}
export async function hashFile(filename, limit) {
  const before = await fs.lstat(filename, { bigint: true });
  requireValue(before.isFile() && before.size <= BigInt(limit), 'Unsupported file or file budget exceeded');
  const handle = await fs.open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    requireValue(sameStat(before, await handle.stat({ bigint: true })), 'File changed before reading');
    const digest = createHash('sha256');
    let size = 0;
    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      size += chunk.length;
      requireValue(size <= limit, 'File grew beyond its budget');
      digest.update(chunk);
    }
    requireValue(sameStat(before, await handle.stat({ bigint: true })) &&
      sameStat(before, await fs.lstat(filename, { bigint: true })), 'File changed while reading');
    return { sha256: digest.digest('hex'), size, executable: Boolean(before.mode & 0o111n) };
  } finally { await handle.close(); }
}
export async function inventory(root, budget, excluded = []) {
  await realDirectory(root);
  const leaves = [];
  let total = 0;
  let entries = 0;
  async function walk(directory, prefix = '', depth = 0) {
    const held = await openedDirectory(directory);
    try {
    requireValue(depth <= 64, 'Directory depth exceeded');
    for (const name of (await fs.readdir(held.location)).sort()) {
      const relative = relativeName(prefix ? `${prefix}/${name}` : name);
      if (excluded.includes(relative)) continue;
      requireValue(++entries <= budget.count * 4, 'Directory entry budget exceeded');
      const filename = path.join(held.location, name);
      const stat = await fs.lstat(filename);
      if (stat.isDirectory()) { await walk(filename, relative, depth + 1); continue; }
      requireValue(leaves.length < budget.count, 'Leaf count exceeded');
      if (stat.isSymbolicLink()) {
        const target = await fs.readlink(filename);
        requireValue(target.length > 0 && !path.isAbsolute(target) && !target.includes('\\') &&
          !target.includes('\0'), 'Unsupported symlink target');
        const resolved = await fs.realpath(filename);
        requireValue(resolved.startsWith(`${root}${path.sep}`), 'Escaping symlink');
        requireValue(await fs.readlink(filename) === target, 'Symlink changed while reading');
        leaves.push({ path: relative, type: 'symlink', target });
      } else {
        const file = await hashFile(filename, budget.file);
        total += file.size;
        requireValue(total <= budget.total, 'Aggregate file budget exceeded');
        leaves.push({ path: relative, type: 'file', ...file });
      }
    }
    } finally { await held.handle.close(); }
  }
  await walk(root);
  return leaves.sort((a, b) => a.path.localeCompare(b.path, 'en'));
}
export function compareInventory(actual, expected) {
  requireValue(actual.length === expected.length, 'Complete inventory mismatch');
  for (let index = 0; index < actual.length; index++) {
    const observed = actual[index];
    const pinned = expected[index];
    requireValue(Object.keys(observed).length === Object.keys(pinned).length &&
      Object.keys(observed).every((key) => observed[key] === pinned[key]), 'Complete inventory mismatch');
  }
}
export function consumerFiles(files) {
  return files.map(({ path: name, type, sha256: hash, target }) =>
    type === 'file' ? { path: name, type, sha256: hash } : { path: name, type, target });
}
export async function copyInventory(source, destination, files) {
  await fs.mkdir(destination);
  for (const file of files) {
    const output = path.join(destination, file.path);
    await fs.mkdir(path.dirname(output), { recursive: true });
    let directory = await openedDirectory(source);
    try {
      const parts = file.path.split('/');
      for (const part of parts.slice(0, -1)) {
        const next = await openedDirectory(path.join(directory.location, part));
        await directory.handle.close();
        directory = next;
      }
      const input = path.join(directory.location, parts.at(-1));
      if (file.type === 'symlink') {
        requireValue(await fs.readlink(input) === file.target, 'Source link changed during copy');
        await fs.symlink(file.target, output);
      } else {
        const handle = await fs.open(input, constants.O_RDONLY | constants.O_NOFOLLOW);
        let writer;
        try {
          const before = await handle.stat({ bigint: true });
          requireValue(before.isFile() && before.size === BigInt(file.size), 'Source file changed during copy');
          writer = await fs.open(output, 'wx', 0o600);
          let copied = 0;
          for await (const part of handle.createReadStream({ autoClose: false })) {
            copied += part.length;
            requireValue(copied <= file.size, 'Source file grew during copy');
            await writer.writeFile(part);
          }
          requireValue(sameStat(before, await handle.stat({ bigint: true })), 'Source file changed during copy');
        } finally { await writer?.close(); await handle.close(); }
        await fs.chmod(output, file.executable ? 0o555 : 0o444);
      }
    } finally { await directory.handle.close(); }
  }
}
export async function sealDirectories(root) {
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (entry.isDirectory()) await sealDirectories(path.join(root, entry.name));
  }
  await fs.chmod(root, 0o555);
}
export async function verifyReadOnly(root, remaining = { entries: 200_000 }) {
  const stat = await fs.lstat(root);
  if (stat.isSymbolicLink()) return;
  requireValue((stat.mode & 0o222) === 0, 'Release remains writable');
  if (stat.isDirectory()) {
    for (const name of await fs.readdir(root)) {
      requireValue(--remaining.entries >= 0, 'Read-only layout entry budget exceeded');
      await verifyReadOnly(path.join(root, name), remaining);
    }
  }
}
