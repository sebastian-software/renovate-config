import { constants } from 'node:fs';
import * as fs from 'node:fs/promises';
import { createGunzip } from 'node:zlib';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import path from 'node:path';
import { requireValue, relativeName, sameStat } from './files.mjs';

const MAX_BYTES = 1_073_741_824;
const textDecoder = new TextDecoder('utf-8', { fatal: true });
function text(buffer) { return textDecoder.decode(buffer).replace(/\0.*$/s, ''); }
function octal(buffer) {
  const value = text(buffer).trim();
  requireValue(/^[0-7]*$/.test(value), 'Unsupported tar numeric encoding');
  const number = value === '' ? 0 : Number.parseInt(value, 8);
  requireValue(Number.isSafeInteger(number) && number >= 0, 'Invalid tar number');
  return number;
}
function paxFields(buffer) {
  let offset = 0;
  const fields = {};
  while (offset < buffer.length) {
    const space = buffer.indexOf(32, offset);
    requireValue(space > offset, 'Invalid PAX length');
    const lengthText = buffer.subarray(offset, space).toString('ascii');
    requireValue(/^[1-9][0-9]*$/.test(lengthText), 'Invalid PAX length');
    const end = offset + Number(lengthText);
    requireValue(end <= buffer.length && end > space + 1 && buffer[end - 1] === 10, 'Invalid PAX record');
    const record = textDecoder.decode(buffer.subarray(space + 1, end - 1));
    const equals = record.indexOf('=');
    requireValue(equals > 0, 'Invalid PAX field');
    const key = record.slice(0, equals);
    requireValue(['path', 'linkpath', 'mtime', 'atime', 'ctime', 'uid', 'gid', 'uname', 'gname'].includes(key),
      'Unsupported PAX directive');
    requireValue(!Object.hasOwn(fields, key), 'Duplicate PAX field');
    fields[key] = record.slice(equals + 1);
    offset = end;
  }
  return fields;
}

// Read members without extracting or executing anything. Only supported stock tar layouts
// are accepted; a digest of an archive never substitutes for this byte correspondence.
export async function archiveMembers(filename, expectedDigest) {
  const named = await fs.lstat(filename, { bigint: true });
  const handle = await fs.open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  let original;
  try {
    original = await handle.stat({ bigint: true });
    requireValue(original.isFile() && original.size <= 268_435_456n && sameStat(named, original), 'Unsupported archive identity');
  } catch (error) { await handle.close(); throw error; }
  const source = handle.createReadStream({ autoClose: false });
  const compressedDigest = createHash('sha256');
  let compressedBytes = 0;
  const authenticate = new Transform({ transform(part, encoding, callback) {
    compressedBytes += part.length;
    if (compressedBytes > 268_435_456) { callback(new Error('Archive compressed budget exceeded')); return; }
    compressedDigest.update(part);
    callback(null, part);
  } });
  const gunzip = createGunzip();
  const completion = pipeline(source, authenticate, gunzip).then(() => null, (error) => error);
  const iterator = gunzip[Symbol.asyncIterator]();
  let chunk = Buffer.alloc(0);
  let offset = 0;
  let consumed = 0;
  async function consume(size, visit) {
    requireValue(Number.isSafeInteger(size) && size >= 0 && consumed + size <= MAX_BYTES, 'Archive byte budget exceeded');
    while (size > 0) {
      if (offset === chunk.length) {
        const next = await iterator.next();
        requireValue(!next.done, 'Truncated tar archive');
        chunk = next.value;
        offset = 0;
      }
      const count = Math.min(size, chunk.length - offset);
      visit?.(chunk.subarray(offset, offset + count));
      offset += count;
      consumed += count;
      size -= count;
    }
  }
  async function bytes(size) {
    const result = Buffer.alloc(size);
    let written = 0;
    await consume(size, (part) => { part.copy(result, written); written += part.length; });
    return result;
  }
  const members = new Map();
  let pending = {};
  try {
    while (true) {
      const header = await bytes(512);
      if (header.every((byte) => byte === 0)) {
        requireValue((await bytes(512)).every((byte) => byte === 0), 'Missing tar end marker');
        requireValue(Object.keys(pending).length === 0, 'Unused tar extension');
        // Drain gzip so CRC/truncation and non-zero trailing members cannot go unnoticed.
        while (true) {
          requireValue(chunk.subarray(offset).every((byte) => byte === 0), 'Non-zero tar trailing bytes');
          consumed += chunk.length - offset;
          requireValue(consumed <= MAX_BYTES, 'Archive byte budget exceeded');
          const next = await iterator.next();
          if (next.done) break;
          chunk = next.value;
          offset = 0;
        }
        break;
      }
      const checksum = header.reduce((sum, value, index) => sum + (index >= 148 && index < 156 ? 32 : value), 0);
      requireValue(checksum === octal(header.subarray(148, 156)), 'Tar checksum mismatch');
      const size = octal(header.subarray(124, 136));
      const type = String.fromCharCode(header[156] || 48);
      requireValue(size <= 268_435_456, 'Archive member budget exceeded');
      if (['x', 'L', 'K'].includes(type)) {
        requireValue(size <= 1_048_576, 'Tar extension budget exceeded');
        const extension = await bytes(size);
        if (type === 'x') pending = { ...pending, ...paxFields(extension) };
        else pending[type === 'L' ? 'path' : 'linkpath'] = text(extension);
      } else {
        const prefix = text(header.subarray(345, 500));
        let name = pending.path ?? `${prefix ? `${prefix}/` : ''}${text(header.subarray(0, 100))}`;
        if (type === '5') name = name.replace(/\/$/, '');
        relativeName(name);
        requireValue(members.size < 50_000 && !members.has(name), 'Duplicate member or archive count exceeded');
        const mode = octal(header.subarray(100, 108));
        if (type === '0') {
          const digest = createHash('sha256');
          await consume(size, (part) => digest.update(part));
          members.set(name, { type: 'file', sha256: digest.digest('hex'), size, executable: Boolean(mode & 0o111) });
        } else if (type === '5') {
          requireValue(size === 0, 'Directory with payload');
          members.set(name, { type: 'directory' });
        } else if (type === '1' || type === '2') {
          requireValue(size === 0, 'Link with payload');
          const target = pending.linkpath ?? text(header.subarray(157, 257));
          requireValue(target && !path.posix.isAbsolute(target) && !target.includes('\\') && !target.includes('\0'),
            'Unsupported archive link');
          const resolved = type === '1' ? target : path.posix.normalize(path.posix.join(path.posix.dirname(name), target));
          relativeName(resolved);
          members.set(name, { type: type === '1' ? 'hardlink' : 'symlink', target, resolved });
        } else throw new Error('Unsupported tar member type');
        pending = {};
      }
      await consume((512 - size % 512) % 512);
    }
    const failure = await completion;
    if (failure) throw failure;
    requireValue(compressedDigest.digest('hex') === expectedDigest, 'Original archive digest mismatch');
    requireValue(sameStat(original, await handle.stat({ bigint: true })), 'Opened archive changed while reading');
    for (const [name, member] of members) {
      if (member.type === 'hardlink') {
        const target = members.get(member.resolved);
        requireValue(target?.type === 'file', 'Unsupported hardlink chain or missing target');
        members.set(name, { ...target });
      } else if (member.type === 'symlink') requireValue(members.has(member.resolved), 'Missing archive link target');
    }
    return members;
  } finally {
    source.destroy();
    gunzip.destroy();
    await completion;
    await handle.close();
  }
}
