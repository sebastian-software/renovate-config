#!/usr/bin/env node
// Trusted source only: never install, execute, or fetch repository content.
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { get as httpsGet } from 'node:https';
import { parseArgs } from 'node:util';

/** Fixed v1 budgets: byte counts, data counts and millisecond deadlines.
 * Repository data cannot override these limits; preparation happens separately.
 */
export const LIMITS = Object.freeze({
  requestBytes: 32 * 1024 * 1024, treeEntries: 10000, files: 256,
  fileBytes: 2 * 1024 * 1024, metadataPackages: 4096,
  metadataBytes: 16 * 1024 * 1024, responseBytes: 1024 * 1024,
  dataDepth: 64, dataNodes: 300000, contextDepth: 16,
  contextTokens: 256, lockNodes: 20000, diagnostics: 1,
  diagnosticChars: 512, timeoutMs: 10000,
});
/** Public npm acquisition policy tag, selected and authenticated by the caller. */
export const REGISTRY_POLICY = 'public-npm-v1';
const REGISTRY = 'https://registry.npmjs.org';
const sourcePath = fileURLToPath(import.meta.url);
const hash = (value, algorithm = 'sha256') => createHash(algorithm).update(value).digest('hex');
const sections = ['dependencies', 'devDependencies', 'optionalDependencies'];
const family = (name) => name === 'vitest' || name.startsWith('@vitest/');
const oid = (value) => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const token = (value) => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
const packageName = (value) => typeof value === 'string' && value.length <= 214 &&
  /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(value);
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
class ValidationError extends Error {
  constructor(code, message, path, verdict = 'error') {
    super(message); this.code = code; this.path = path; this.verdict = verdict;
  }
}
function requireThat(condition, code, message, path, verdict) {
  if (!condition) throw new ValidationError(code, message, path, verdict);
}
function keys(value, allowed, label) {
  requireThat(record(value), 'INVALID_INPUT', label + ' must be an object');
  requireThat(Object.keys(value).every((key) => allowed.includes(key)), 'UNSUPPORTED_INPUT', 'Unsupported ' + label + ' field');
}
function textBytes(value, label) {
  requireThat(typeof value === 'string', 'INVALID_INPUT', label + ' must be text');
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      requireThat(i + 1 < value.length && value.charCodeAt(i + 1) >= 0xdc00 &&
        value.charCodeAt(i + 1) <= 0xdfff, 'INVALID_UTF8', label + ' contains an unpaired surrogate');
      i++;
    } else requireThat(code < 0xdc00 || code > 0xdfff, 'INVALID_UTF8', label + ' contains an unpaired surrogate');
  }
  return Buffer.from(value, 'utf8');
}
function boundedData(value, label) {
  const pending = [[value, 0]]; let count = 0;
  while (pending.length) {
    const [node, depth] = pending.pop();
    requireThat(++count <= LIMITS.dataNodes && depth <= LIMITS.dataDepth,
      'RESOURCE_LIMIT', label + ' exceeds data complexity limits');
    if (node && typeof node === 'object') {
      for (const [key, child] of Object.entries(node)) {
        requireThat(key !== '__proto__' && key !== 'constructor' && key !== 'prototype',
          'AMBIGUOUS_INPUT', label + ' contains an unsupported object key');
        pending.push([child, depth + 1]);
      }
    }
  }
}
// JSON.parse accepts duplicate members. Reject them before parsing manifests or
// the envelope so a second consumer cannot interpret different ownership.
function parseJson(text, label) {
  const stack = []; let tokens = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      const start = i++;
      while (i < text.length && text[i] !== '"') { if (text[i] === '\\') i++; i++; }
      const current = stack.at(-1);
      if (current?.object && current.key) {
        let name;
        try { name = JSON.parse(text.slice(start, i + 1)); } catch { throw new ValidationError('INVALID_JSON', 'Malformed ' + label); }
        requireThat(!current.names.has(name), 'AMBIGUOUS_INPUT', 'Duplicate JSON member in ' + label);
        current.names.add(name); current.key = false;
      }
    } else if (c === '{' || c === '[') {
      stack.push({ object: c === '{', key: true, names: new Set() });
      requireThat(stack.length <= LIMITS.dataDepth && ++tokens <= LIMITS.dataNodes,
        'RESOURCE_LIMIT', label + ' exceeds JSON complexity limits');
    } else if (c === '}' || c === ']') stack.pop();
    else if (c === ',' && stack.at(-1)?.object) stack.at(-1).key = true;
  }
  let result;
  try { result = JSON.parse(text); } catch { throw new ValidationError('INVALID_JSON', 'Malformed ' + label); }
  boundedData(result, label); return result;
}
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (record(value)) return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
function safePath(value) {
  requireThat(typeof value === 'string' && value.length > 0 && value.length <= 256 &&
    !value.includes('\\') && !value.startsWith('/') && !/[\u0000-\u001f\u007f]/.test(value) &&
    value.split('/').every((part) => part && part !== '.' && part !== '..'),
    'INVALID_PATH', 'Repository path is not a bounded relative path');
  return value;
}
function configuration(value) {
  keys(value, ['checkerRevision', 'policyRevision'], 'trusted configuration');
  requireThat(oid(value.checkerRevision) && token(value.policyRevision),
    'INVALID_CONFIGURATION', 'Trusted checker and policy revisions are required');
  return value;
}
function resultBase(config = {}) {
  return { schemaVersion: 1, operation: 'check', identity: null, checkerRevision: oid(config?.checkerRevision) ? config.checkerRevision : null,
    policyRevision: token(config?.policyRevision) ? config.policyRevision : null, checkerSha256: null, runtimeSha256: null,
    inputHash: null, metadataHash: null, verdict: 'error', diagnostics: [], stats: null };
}
function failure(error, result) {
  const known = error instanceof ValidationError;
  return { ...result, verdict: known ? error.verdict : 'error', diagnostics: [{
    code: known ? error.code : 'CHECKER_FAILURE',
    message: (known ? error.message : 'Checker runtime or validation failed').slice(0, LIMITS.diagnosticChars),
    ...(known && error.path ? { path: String(error.path).slice(0, 256) } : {}),
  }] };
}
async function runtime() {
  requireThat(/^24\./.test(process.versions.node), 'UNAVAILABLE_RUNTIME', 'Checker requires Node 24');
  const distribution = await realpath(dirname(sourcePath));
  const owned = join(distribution, 'vitest-peer-alignment');
  let root;
  try { root = await realpath(owned); } catch { throw new ValidationError('UNAVAILABLE_RUNTIME', 'Isolated checker runtime is unavailable'); }
  requireThat(root === owned, 'UNAVAILABLE_RUNTIME', 'Checker runtime escapes immutable layout');
  const manifestPath = join(root, 'package.json'), lockPath = join(root, 'pnpm-lock.yaml');
  requireThat(await realpath(manifestPath) === manifestPath && await realpath(lockPath) === lockPath,
    'UNAVAILABLE_RUNTIME', 'Runtime manifest or lock is aliased');
  const manifestBytes = await readFile(manifestPath), lockBytes = await readFile(lockPath);
  const manifest = parseJson(manifestBytes.toString('utf8'), 'runtime manifest');
  requireThat(canonical(manifest.dependencies) === canonical({ semver: '7.8.5', yaml: '2.9.1' }),
    'UNAVAILABLE_RUNTIME', 'Runtime dependencies must use reviewed exact pins');
  const ownedRequire = createRequire(manifestPath); const modules = []; const loaded = {};
  for (const name of ['semver', 'yaml']) {
    let entry, packagePath;
    try {
      entry = await realpath(ownedRequire.resolve(name));
      packagePath = await realpath(ownedRequire.resolve(name + '/package.json'));
    } catch { throw new ValidationError('UNAVAILABLE_RUNTIME', 'Missing isolated runtime dependency: ' + name); }
    const contained = (path) => { const rel = relative(root, path); return rel && !rel.startsWith('../') && !rel.startsWith('/') && rel !== '..'; };
    requireThat(contained(entry) && contained(packagePath), 'UNAVAILABLE_RUNTIME', 'Runtime module resolution escapes isolated layout');
    const bytes = await readFile(packagePath), installed = parseJson(bytes.toString('utf8'), 'dependency manifest');
    requireThat(installed.name === name && installed.version === manifest.dependencies[name] &&
      Object.keys(installed.dependencies ?? {}).length === 0 &&
      Object.keys(installed.optionalDependencies ?? {}).length === 0,
      'UNAVAILABLE_RUNTIME', 'Runtime version or dependency closure differs from reviewed pins');
    modules.push({ name, version: installed.version, entrySha256: hash(await readFile(entry)), manifestSha256: hash(bytes) });
    loaded[name] = ownedRequire(name);
  }
  // Hash basis is explicitly manifest/lock plus resolved module entry and package
  // manifest bytes. The trusted release owner separately authenticates all files.
  const runtimeSha256 = hash(canonical({ manifestSha256: hash(manifestBytes), lockSha256: hash(lockBytes), modules }));
  const runtimeLock = parseYaml(lockBytes.toString('utf8'), 'runtime lock', loaded.yaml);
  requireThat(runtimeLock.lockfileVersion === '9.0' && Object.keys(runtimeLock.packages ?? {}).length === 2 &&
    Object.keys(runtimeLock.snapshots ?? {}).length === 2 &&
    Object.keys(runtimeLock.importers ?? {}).length === 1, 'UNAVAILABLE_RUNTIME', 'Runtime lock closure is incomplete');
  for (const [name, version] of Object.entries(manifest.dependencies)) {
    const selected = runtimeLock.importers['.']?.dependencies?.[name];
    requireThat(selected?.specifier === version && selected?.version === version &&
      runtimeLock.packages[name + '@' + version]?.resolution?.integrity &&
      runtimeLock.snapshots[name + '@' + version], 'UNAVAILABLE_RUNTIME', 'Runtime lock does not bind exact dependency');
  }
  return { YAML: loaded.yaml, semver: loaded.semver, runtimeSha256 };
}
function parseYaml(text, label, YAML) {
  let doc;
  try { doc = YAML.parseDocument(text, { strict: true, uniqueKeys: true, stringKeys: true }); }
  catch { throw new ValidationError('INVALID_YAML', 'Malformed ' + label); }
  requireThat(doc.errors.length === 0, 'INVALID_YAML', 'Malformed or ambiguous ' + label);
  let count = 0;
  YAML.visit(doc, (_, node, path) => {
    requireThat(++count <= LIMITS.dataNodes && path.length <= LIMITS.dataDepth,
      'RESOURCE_LIMIT', label + ' exceeds YAML complexity limits');
    requireThat(!YAML.isAlias(node), 'UNSUPPORTED_YAML', label + ' contains an alias');
  });
  let value;
  try { value = doc.toJS({ maxAliasCount: 0 }); } catch { throw new ValidationError('INVALID_YAML', 'Unsupported ' + label); }
  boundedData(value, label); return value;
}
function identity(value) {
  keys(value, ['repository', 'pullRequest', 'head'], 'identity');
  requireThat(typeof value.repository === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value.repository) &&
    value.repository.length <= 200 && Number.isSafeInteger(value.pullRequest) && value.pullRequest > 0 &&
    oid(value.head), 'INVALID_IDENTITY', 'Repository, PR and exact head identity are required');
}
function workspacePattern(value) {
  safePath(value);
  requireThat(!value.includes('!') && value.split('/').every((part) => part === '*' || !/[*?{}[\]]/.test(part)),
    'UNSUPPORTED_WORKSPACE', 'Only literal workspace paths and single-segment stars are supported');
  return value.split('/');
}
function matches(path, pattern) {
  const pieces = path.split('/');
  return pieces.length === pattern.length && pieces.every((piece, i) => pattern[i] === '*' || pattern[i] === piece);
}
function filesAndOwnership(input, YAML) {
  keys(input.tree, ['complete', 'head', 'entries'], 'tree');
  requireThat(input.tree.complete === true && input.tree.head === input.identity.head &&
    Array.isArray(input.tree.entries) && input.tree.entries.length <= LIMITS.treeEntries,
    'INCOMPLETE_TREE', 'Complete exact-head tree inventory is required');
  const tree = new Map();
  for (const entry of input.tree.entries) {
    keys(entry, ['path', 'mode', 'sha', 'size'], 'tree entry');
    safePath(entry.path);
    requireThat(!tree.has(entry.path), 'AMBIGUOUS_TREE', 'Duplicate tree path', entry.path);
    requireThat(['100644', '100755', '120000', '160000'].includes(entry.mode) && oid(entry.sha) &&
      Number.isSafeInteger(entry.size) && entry.size >= 0, 'INVALID_TREE', 'Invalid exact-tree entry', entry.path);
    tree.set(entry.path, entry);
  }
  for (const path of tree.keys()) {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) requireThat(!tree.has(parts.slice(0, i).join('/')),
      'AMBIGUOUS_TREE', 'Tree path traverses a blob or link', path);
  }
  requireThat(Array.isArray(input.files) && input.files.length <= LIMITS.files,
    'RESOURCE_LIMIT', 'Repository file set exceeds its limit');
  const files = new Map();
  for (const file of input.files) {
    keys(file, ['path', 'content'], 'repository file'); safePath(file.path);
    requireThat(!files.has(file.path), 'AMBIGUOUS_INPUT', 'Duplicate repository file', file.path);
    const entry = tree.get(file.path), bytes = textBytes(file.content, file.path);
    requireThat(bytes.length <= LIMITS.fileBytes, 'RESOURCE_LIMIT', 'Repository file exceeds byte limit', file.path);
    requireThat(entry && ['100644', '100755'].includes(entry.mode), 'INCOMPLETE_TREE', 'File is not an exact-tree regular blob', file.path);
    const gitHash = hash(Buffer.concat([Buffer.from('blob ' + bytes.length + '\0'), bytes]), 'sha1');
    requireThat(entry.size === bytes.length && entry.sha === gitHash, 'INPUT_HASH_MISMATCH', 'Repository bytes differ from exact-tree blob', file.path);
    files.set(file.path, file.content);
  }
  const required = new Set(['package.json', 'pnpm-lock.yaml']);
  if (tree.has('pnpm-workspace.yaml')) required.add('pnpm-workspace.yaml');
  for (const path of required) requireThat(files.has(path), 'INCOMPLETE_INPUT', 'Missing required repository file', path);
  const root = parseJson(files.get('package.json'), 'root manifest');
  requireThat(record(root) && /^pnpm@11\.(17|20)\.0$/.test(root.packageManager ?? ''),
    'UNSUPPORTED_MANAGER', 'Supported exact pnpm 11 packageManager declaration is required', 'package.json');
  let patterns = [];
  if (required.has('pnpm-workspace.yaml')) {
    const workspace = parseYaml(files.get('pnpm-workspace.yaml'), 'workspace definition', YAML);
    keys(workspace, ['packages', 'allowBuilds'], 'workspace definition');
    requireThat(Array.isArray(workspace.packages) && workspace.packages.length <= 32,
      'UNSUPPORTED_WORKSPACE', 'Bounded data-only workspace patterns are required');
    patterns = workspace.packages.map(workspacePattern);
    if (workspace.allowBuilds !== undefined) requireThat(record(workspace.allowBuilds) &&
      Object.entries(workspace.allowBuilds).every(([name, allowed]) => packageName(name) && typeof allowed === 'boolean'),
      'UNSUPPORTED_WORKSPACE', 'allowBuilds must be data-only package booleans');
  }
  const manifests = new Map([['.', root]]);
  for (const [path, entry] of tree) {
    requireThat(!['120000', '160000'].includes(entry.mode) ||
      !patterns.some((pattern) => matches(path, pattern)), 'UNSUPPORTED_WORKSPACE',
      'Workspace directory is a symlink or submodule', path);
    if (path === 'package.json' || !path.endsWith('/package.json')) continue;
    const owner = path.slice(0, -'/package.json'.length);
    if (!patterns.some((pattern) => matches(owner, pattern))) continue;
    requireThat(entry.mode === '100644' || entry.mode === '100755', 'UNSUPPORTED_WORKSPACE', 'Workspace manifest is a link', path);
    required.add(path);
    requireThat(files.has(path), 'INCOMPLETE_INPUT', 'Missing discovered workspace manifest', path);
    manifests.set(owner, parseJson(files.get(path), 'workspace manifest'));
  }
  requireThat(files.size === required.size && [...files.keys()].every((path) => required.has(path)),
    'UNSUPPORTED_INPUT', 'Only discovered manifests, workspace definition and lock bytes are accepted');
  for (const [owner, manifest] of manifests) {
    const path = owner === '.' ? 'package.json' : owner + '/package.json';
    requireThat(record(manifest), 'INVALID_MANIFEST', 'Manifest must be an object', path);
    for (const section of sections) requireThat(manifest[section] === undefined || record(manifest[section]),
      'INVALID_MANIFEST', 'Dependency declarations must be objects', path);
    requireThat(!manifest.workspaces && !manifest.devEngines?.packageManager &&
      !manifest.pnpm?.overrides && !manifest.pnpm?.patchedDependencies &&
      !manifest.pnpm?.packageExtensions && !manifest.pnpm?.configDependencies &&
      !Object.keys(manifest.peerDependencies ?? {}).some(family),
      'UNSUPPORTED_OWNERSHIP', 'Unsupported manifest override, workspace or family peer ownership', path);
  }
  for (const path of tree.keys()) requireThat(!/(^|\/)\.pnpmfile\.(?:cjs|js|mjs)$/.test(path),
    'UNSUPPORTED_OWNERSHIP', 'Executable pnpm ownership is unsupported', path);
  return { files, manifests, lock: parseYaml(files.get('pnpm-lock.yaml'), 'repository lock', YAML) };
}
function references(semver) {
  function parse(value, declaredName, depth = 0, budget = { count: 0 }) {
    requireThat(typeof value === 'string' && value.length <= 16384 &&
      depth <= LIMITS.contextDepth && ++budget.count <= LIMITS.contextTokens,
      'UNSUPPORTED_RESOLUTION', 'Resolution or peer context exceeds supported bounds');
    let open = value.indexOf('(');
    const base = open === -1 ? value : value.slice(0, open);
    let name = declaredName, version = base;
    if (!semver.valid(base)) {
      const at = base.indexOf('@', base.startsWith('@') ? 1 : 0);
      requireThat(at > 0, 'UNSUPPORTED_RESOLUTION', 'Non-registry or linked resolution is unsupported');
      name = base.slice(0, at); version = base.slice(at + 1);
    }
    requireThat(packageName(name) && semver.valid(version) === version,
      'UNSUPPORTED_RESOLUTION', 'Exact registry name and version are required');
    const children = []; const names = new Set();
    while (open !== -1 && open < value.length) {
      requireThat(value[open] === '(', 'INVALID_CONTEXT', 'Malformed peer context');
      let nesting = 1, end = open + 1;
      while (end < value.length && nesting) {
        if (value[end] === '(') nesting++;
        if (value[end] === ')') nesting--;
        end++;
      }
      requireThat(nesting === 0, 'INVALID_CONTEXT', 'Unclosed peer context');
      const child = parse(value.slice(open + 1, end - 1), undefined, depth + 1, budget);
      requireThat(!names.has(child.name), 'AMBIGUOUS_CONTEXT', 'Duplicate peer context name');
      names.add(child.name); children.push(child);
      requireThat(end === value.length || value[end] === '(', 'INVALID_CONTEXT', 'Trailing peer context data');
      open = end === value.length ? -1 : end;
    }
    return { name, version, children, key: name + '@' + version + (value.includes('(') ? value.slice(value.indexOf('(')) : '') };
  }
  function declaration(name, value) {
    requireThat(packageName(name) && typeof value === 'string' && value.length <= 1024,
      'UNSUPPORTED_SPECIFIER', 'Bounded dependency name and range are required');
    let target = name, range = value;
    if (value.startsWith('npm:')) {
      const alias = value.slice(4), at = alias.indexOf('@', alias.startsWith('@') ? 1 : 0);
      requireThat(at > 0, 'UNSUPPORTED_SPECIFIER', 'npm alias requires explicit package and range');
      target = alias.slice(0, at); range = alias.slice(at + 1);
    }
    requireThat(packageName(target) && semver.validRange(range) !== null,
      'UNSUPPORTED_SPECIFIER', 'Unsupported catalog, link, URL or dependency range');
    requireThat(!family(name) || target === name, 'FAMILY_IDENTITY_MISMATCH',
      'Vitest-family declarations must retain their actual published package identity',
      undefined, 'not-aligned');
    return { name: target, range };
  }
  return { parse, declaration };
}
function registryMetadata(envelope, semver) {
  keys(envelope, ['schemaVersion', 'source', 'authenticated', 'policy', 'packages'], 'metadata envelope');
  requireThat(envelope.schemaVersion === 1 && envelope.source === REGISTRY &&
    envelope.authenticated === true && envelope.policy === REGISTRY_POLICY,
    'UNTRUSTED_METADATA', 'Trusted fixed-endpoint registry metadata is required');
  requireThat(Array.isArray(envelope.packages) && envelope.packages.length <= LIMITS.metadataPackages &&
    Buffer.byteLength(canonical(envelope)) <= LIMITS.metadataBytes,
    'RESOURCE_LIMIT', 'Registry metadata exceeds volume limits');
  const metadata = new Map();
  for (const info of envelope.packages) {
    requireThat(record(info) && packageName(info.name) && semver.valid(info.version) === info.version &&
      record(info.dist) && typeof info.dist.integrity === 'string' &&
      /^sha512-[A-Za-z0-9+/]{86}==$/.test(info.dist.integrity),
      'INVALID_METADATA', 'Published name, version and SHA512 integrity are required');
    const key = info.name + '@' + info.version;
    requireThat(!metadata.has(key), 'AMBIGUOUS_METADATA', 'Duplicate published version metadata');
    for (const group of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      requireThat(info[group] === undefined || record(info[group]), 'INVALID_METADATA', 'Published dependency declarations must be objects');
      for (const [name, value] of Object.entries(info[group] ?? {})) requireThat(packageName(name) &&
        typeof value === 'string' && value.length <= 1024, 'INVALID_METADATA', 'Invalid published dependency declaration');
    }
    requireThat(info.peerDependenciesMeta === undefined || record(info.peerDependenciesMeta),
      'INVALID_METADATA', 'Published optional-peer metadata must be an object');
    for (const [name, value] of Object.entries(info.peerDependenciesMeta ?? {})) requireThat(packageName(name) &&
      record(value) && Object.keys(value).every((key) => key === 'optional') &&
      (value.optional === undefined || typeof value.optional === 'boolean'),
      'INVALID_METADATA', 'Invalid published optional-peer flag');
    metadata.set(key, info);
  }
  return metadata;
}
function optionalPeers(value) {
  requireThat(value === undefined || record(value), 'INVALID_METADATA',
    'Optional-peer flags must be an object');
  const optional = {};
  for (const [name, flags] of Object.entries(value ?? {})) {
    requireThat(packageName(name) && record(flags) &&
      Object.keys(flags).every((field) => field === 'optional') &&
      (flags.optional === undefined || typeof flags.optional === 'boolean'),
      'INVALID_METADATA', 'Malformed optional-peer flag');
    if (flags.optional === true) optional[name] = { optional: true };
  }
  // pnpm omits optional:false in package records. Both omission and false
  // require the peer; only true changes whether absence is compatible.
  return optional;
}
function graph(lock, manifests, semver) {
  requireThat(record(lock) && lock.lockfileVersion === '9.0' && record(lock.importers) &&
    record(lock.packages) && record(lock.snapshots), 'UNSUPPORTED_LOCK', 'Complete pnpm v9 packages, snapshots and importers are required');
  requireThat(!lock.overrides && !lock.patchedDependencies && !lock.catalogs,
    'UNSUPPORTED_OWNERSHIP', 'Lock override, patch or catalog ownership is unsupported');
  requireThat(Object.keys(lock.packages).length <= LIMITS.lockNodes &&
    Object.keys(lock.snapshots).length <= LIMITS.lockNodes,
    'RESOURCE_LIMIT', 'Lock graph exceeds node limits');
  requireThat(canonical(Object.keys(lock.importers).sort()) === canonical([...manifests.keys()].sort()),
    'IMPORTER_OWNERSHIP', 'Lock importers differ from exact-tree workspace manifests', 'pnpm-lock.yaml');
  const { parse, declaration } = references(semver);
  const nodes = new Map(), bases = new Map();
  for (const [key, value] of Object.entries(lock.packages)) {
    const ref = parse(key);
    requireThat(ref.children.length === 0 && record(value), 'UNSUPPORTED_LOCK', 'Invalid package record', 'pnpm-lock.yaml');
    bases.set(ref.name + '@' + ref.version, value);
  }
  for (const [key, value] of Object.entries(lock.snapshots)) {
    const ref = parse(key);
    requireThat(record(value), 'UNSUPPORTED_LOCK', 'Snapshot must be an object', 'pnpm-lock.yaml');
    nodes.set(key, { ...ref, snapshot: value });
  }
  const selected = (value, name) => {
    const ref = parse(value, name), node = nodes.get(ref.key);
    requireThat(node, 'MISSING_SNAPSHOT', 'Missing required resolved snapshot: ' + ref.key, 'pnpm-lock.yaml');
    return node;
  };
  const queue = [], importerSelections = new Map(), importerAliases = new Map();
  for (const [owner, manifest] of manifests) {
    const importer = lock.importers[owner], path = owner === '.' ? 'package.json' : owner + '/package.json';
    const selections = new Map(); importerSelections.set(owner, selections);
    const aliases = new Map(); importerAliases.set(owner, aliases);
    requireThat(record(importer), 'IMPORTER_OWNERSHIP', 'Missing importer', path);
    for (const section of sections) {
      const declared = manifest[section] ?? {}, locked = importer[section] ?? {};
      requireThat(record(locked) && canonical(Object.keys(declared).sort()) === canonical(Object.keys(locked).sort()),
        'IMPORTER_OWNERSHIP', 'Manifest and importer dependency ownership differs', path, 'not-aligned');
      for (const [name, specifier] of Object.entries(declared)) {
        const entry = locked[name];
        requireThat(record(entry) && entry.specifier === specifier,
          'MANIFEST_LOCK_MISMATCH', 'Manifest and importer specifier differ: ' + name, path, 'not-aligned');
        const spec = declaration(name, specifier), node = selected(entry.version, name);
        requireThat(node.name === spec.name && semver.satisfies(node.version, spec.range),
          'MANIFEST_LOCK_MISMATCH', 'Resolved package does not satisfy manifest: ' + name, path, 'not-aligned');
        requireThat(!selections.has(name) || selections.get(name).key === node.key,
          'AMBIGUOUS_OWNERSHIP', 'Manifest sections resolve one dependency differently', path);
        selections.set(name, node);
        if (specifier.startsWith('npm:') && spec.name !== name) {
          aliases.set(name, { name: spec.name, range: spec.range, key: node.key });
        }
        queue.push(node);
      }
    }
  }
  const reached = new Map();
  while (queue.length) {
    const node = queue.pop();
    if (reached.has(node.key)) continue;
    reached.set(node.key, node);
    requireThat(bases.has(node.name + '@' + node.version), 'MISSING_PACKAGE',
      'Missing resolved package record: ' + node.key, 'pnpm-lock.yaml');
    const edges = new Map();
    for (const group of ['dependencies', 'optionalDependencies']) {
      requireThat(node.snapshot[group] === undefined || record(node.snapshot[group]),
        'UNSUPPORTED_LOCK', 'Snapshot dependency edges must be objects', 'pnpm-lock.yaml');
      for (const [name, value] of Object.entries(node.snapshot[group] ?? {})) {
        requireThat(!edges.has(name), 'AMBIGUOUS_OWNERSHIP', 'Dependency appears in multiple snapshot sections', 'pnpm-lock.yaml');
        const target = selected(value, name); edges.set(name, target); queue.push(target);
      }
    }
    node.edges = edges;
  }
  for (const node of nodes.values()) requireThat(!family(node.name) || reached.has(node.key),
    'UNREACHABLE_FAMILY', 'Family snapshot is disconnected from every importer: ' + node.key, 'pnpm-lock.yaml');
  const owners = new Map();
  for (const [owner, selections] of importerSelections) {
    const pending = [...selections.values()], seen = new Set();
    while (pending.length) {
      const node = pending.pop();
      if (seen.has(node.key)) continue;
      seen.add(node.key);
      if (!owners.has(node.key)) owners.set(node.key, new Set());
      owners.get(node.key).add(owner);
      pending.push(...node.edges.values());
    }
  }
  return { nodes: reached, bases, declaration, importerSelections, importerAliases, owners };
}
function coordinates(nodes) {
  return [...new Map([...nodes.values()].map((node) =>
    [node.name + '@' + node.version, { name: node.name, version: node.version }])).values()]
    .sort((a, b) => (a.name + '@' + a.version).localeCompare(b.name + '@' + b.version, 'en'));
}
function verifyGraph(prepared, manifests, metadata, semver) {
  const { nodes, bases, declaration } = prepared;
  function authorizedAlias(node, name, target) {
    // A published package can explicitly own a renamed dependency itself.
    const owned = node.info.optionalDependencies?.[name] ?? node.info.dependencies?.[name];
    if (typeof owned === 'string' && owned.startsWith('npm:')) {
      const alias = declaration(name, owned);
      if (alias.name === target.name && semver.satisfies(target.version, alias.range)) return true;
    }
    // Otherwise the alias must be provided by an importer that actually reaches
    // this resolved consumer, selecting this exact contextual provider. An alias
    // declared in an unrelated workspace never authorizes another consumer.
    for (const owner of prepared.owners.get(node.key) ?? []) {
      const alias = prepared.importerAliases.get(owner)?.get(name);
      if (alias?.name === target.name && alias.key === target.key &&
        semver.satisfies(target.version, alias.range)) return true;
    }
    return false;
  }
  for (const node of nodes.values()) {
    node.info = metadata.get(node.name + '@' + node.version);
    requireThat(node.info, 'INCOMPLETE_METADATA',
      'Missing trusted published metadata: ' + node.name + '@' + node.version);
  }
  for (const [owner, selections] of prepared.importerSelections) {
    for (const node of selections.values()) {
      for (const [name, range] of Object.entries(node.info.peerDependencies ?? {})) {
        const available = selections.get(name);
        if (!available || !family(name) && !family(node.name)) continue;
        const bound = node.edges.get(name), spec = declaration(name, range);
        requireThat(bound && bound.name === available.name && bound.version === available.version &&
          semver.satisfies(available.version, spec.range), 'IMPORTER_PEER_MISMATCH',
          'Installed importer peer differs from actual binding: ' + node.name + ' -> ' + name,
          owner === '.' ? 'package.json' : owner + '/package.json', 'not-aligned');
      }
    }
  }
  function contextMatches(partial, actual) {
    return partial.name === actual.name && partial.version === actual.version &&
      (partial.children.length === 0 || partial.children.length === actual.children.length &&
        partial.children.every((child) => actual.children.some((candidate) => contextMatches(child, candidate))));
  }
  function contextualTargets(node, peer) {
    const direct = [...node.edges.values()].filter((edge) => edge.name === peer.name);
    if (direct.length) return direct.filter((target) => contextMatches(peer, target));
    const pending = [...node.edges.values()], seen = new Set(), found = [];
    while (pending.length) {
      const target = pending.pop();
      if (seen.has(target.key)) continue;
      seen.add(target.key);
      if (contextMatches(peer, target)) found.push(target);
      pending.push(...target.edges.values());
    }
    return found;
  }
  const relevant = new Set();
  const pending = [];
  for (const node of nodes.values()) {
    const reverseFamily = ['dependencies', 'optionalDependencies', 'peerDependencies'].some((field) =>
      Object.keys(node.info[field] ?? {}).some(family));
    if (family(node.name) || reverseFamily) pending.push(node);
  }
  // Peer contexts nested under the family also carry actual version obligations.
  // Follow the real edge context rather than choosing one global Vitest version.
  while (pending.length) {
    const node = pending.pop();
    if (relevant.has(node.key)) continue;
    relevant.add(node.key);
    for (const peer of node.children) {
      const targets = contextualTargets(node, peer);
      requireThat(targets.length > 0, 'PEER_CONTEXT_MISMATCH',
        'Full nested peer context differs from resolved graph: ' + node.key + ' -> ' + peer.name,
        'pnpm-lock.yaml', 'not-aligned');
      pending.push(...targets);
    }
  }
  for (const node of nodes.values()) {
    const info = node.info, base = bases.get(node.name + '@' + node.version);
    const scoped = relevant.has(node.key);
    if (scoped) requireThat(base.resolution?.integrity === info.dist.integrity &&
      !base.resolution?.tarball && !base.resolution?.repo && !base.resolution?.directory,
      'INTEGRITY_MISMATCH', 'Relevant lock integrity differs from published package: ' + node.key,
      'pnpm-lock.yaml', 'not-aligned');
    const required = { ...(info.dependencies ?? {}), ...(info.optionalDependencies ?? {}) };
    for (const [name, range] of Object.entries(required)) {
      const target = node.edges.get(name), optional = Object.hasOwn(info.optionalDependencies ?? {}, name);
      if (!target && optional) continue;
      // The authoritative complete graph is necessary for coverage: deleting an
      // ancestor edge must not hide a package that requires a Vitest peer.
      requireThat(target, 'INCOMPLETE_GRAPH', 'Missing published required dependency: ' + node.key + ' -> ' + name,
        'pnpm-lock.yaml');
      // Every installed published dependency binds graph reachability, including
      // unrelated ancestors. Otherwise a substituted coordinate can hide peers.
      const spec = declaration(name, range);
      requireThat(target.name === spec.name && semver.satisfies(target.version, spec.range),
        'DEPENDENCY_MISMATCH', 'Resolved dependency violates published range: ' + node.key + ' -> ' + name,
        'pnpm-lock.yaml', 'not-aligned');
    }
    for (const [name, range] of Object.entries(info.peerDependencies ?? {})) {
      if (!scoped && !family(name)) continue;
      const target = node.edges.get(name), optional = info.peerDependenciesMeta?.[name]?.optional === true;
      if (!target && optional) continue;
      requireThat(target, 'MISSING_REQUIRED_PEER', 'Missing published required peer: ' + node.key + ' -> ' + name,
        'pnpm-lock.yaml', 'not-aligned');
      const spec = declaration(name, range);
      requireThat((target.name === spec.name || authorizedAlias(node, name, target)) &&
        semver.satisfies(target.version, spec.range),
        'PEER_MISMATCH', 'Resolved peer violates published range: ' + node.key + ' -> ' + name,
        'pnpm-lock.yaml', 'not-aligned');
      requireThat(node.children.some((peer) => contextMatches(peer, target)),
        'PEER_CONTEXT_MISMATCH', 'Resolved peer is absent from snapshot context: ' + node.key + ' -> ' + name,
        'pnpm-lock.yaml', 'not-aligned');
    }
    for (const [name, target] of node.edges) {
      if (scoped || family(name) || family(target.name)) requireThat(Object.hasOwn(required, name) ||
        Object.hasOwn(info.peerDependencies ?? {}, name), 'UNPUBLISHED_EDGE',
        'Snapshot contains an undeclared relevant edge: ' + node.key + ' -> ' + name, 'pnpm-lock.yaml', 'not-aligned');
    }
    if (scoped) {
      for (const field of ['peerDependencies', 'peerDependenciesMeta']) {
        const actual = field === 'peerDependenciesMeta' ? optionalPeers(base[field]) : base[field] ?? {};
        const published = field === 'peerDependenciesMeta' ? optionalPeers(info[field]) : info[field] ?? {};
        requireThat(canonical(actual) === canonical(published),
          'FORGED_PEER_METADATA', 'Relevant lock peer declarations differ from published metadata: ' + node.name,
          'pnpm-lock.yaml', 'not-aligned');
      }
    }
  }
  return { importers: manifests.size, snapshots: nodes.size, relevantSnapshots: relevant.size,
    familySnapshots: [...nodes.values()].filter((node) => family(node.name)).length,
    metadataPackages: metadata.size };
}
async function pureValidation(raw, config, operation = 'check') {
  const output = resultBase(config);
  output.operation = operation;
  try {
    output.checkerSha256 = hash(await readFile(sourcePath));
    let loaded;
    try { loaded = await runtime(); } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new ValidationError('UNAVAILABLE_RUNTIME', 'Isolated checker runtime cannot be loaded');
    }
    const { YAML, semver, runtimeSha256 } = loaded; output.runtimeSha256 = runtimeSha256;
    const input = parseJson(raw, 'checker request');
    keys(input, ['schemaVersion', 'identity', 'tree', 'files', 'metadata'], 'checker request');
    requireThat(input.schemaVersion === 1, 'UNSUPPORTED_SCHEMA', 'Checker request schemaVersion must equal 1');
    identity(input.identity); output.identity = input.identity;
    output.inputHash = hash(canonical({ schemaVersion: input.schemaVersion, identity: input.identity,
      tree: input.tree, files: input.files }));
    if (input.metadata !== undefined) output.metadataHash = hash(canonical(input.metadata));
    const { manifests, lock } = filesAndOwnership(input, YAML);
    const prepared = graph(lock, manifests, semver);
    if (operation === 'discover') {
      output.coordinates = coordinates(prepared.nodes);
      output.stats = { importers: manifests.size, snapshots: prepared.nodes.size,
        metadataPackages: output.coordinates.length };
      output.verdict = 'metadata-required'; return output;
    }
    const metadata = registryMetadata(input.metadata, semver);
    output.stats = verifyGraph(prepared, manifests, metadata, semver);
    output.verdict = 'aligned'; return output;
  } catch (error) { return failure(error, output); }
}
// Configuration is supplied separately by the trusted owner. Repository JSON
// cannot select checker revision, runtime, executable, registry or timeout.
async function runOwned(input, trustedConfig, operation) {
  let config, raw;
  const output = resultBase(trustedConfig);
  output.operation = operation;
  try {
    config = configuration(trustedConfig);
    raw = typeof input === 'string' ? input : JSON.stringify(input);
    requireThat(textBytes(raw, 'checker request').length <= LIMITS.requestBytes,
      'RESOURCE_LIMIT', 'Checker request exceeds byte limit');
  } catch (error) { return failure(error, output); }
  return new Promise((done) => {
    let settled = false, timer;
    let worker;
    try {
      // Keep the trusted interpreter owner's default CLI permission inheritance.
      // Repository data never supplies Worker flags or the process environment.
      worker = new Worker(new URL(import.meta.url), {
        workerData: { raw, config, operation },
        resourceLimits: { maxOldGenerationSizeMb: 192, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 },
      });
    } catch { done(failure(new ValidationError('UNAVAILABLE_RUNTIME', 'Owned worker cannot be started'), output)); return; }
    const finish = async (result) => {
      if (settled) return; settled = true; clearTimeout(timer);
      await worker.terminate(); done(result);
    };
    timer = setTimeout(() => finish(failure(new ValidationError('CHECKER_TIMEOUT',
      'Checker exceeded the owned validation deadline'), output)), LIMITS.timeoutMs);
    worker.once('message', (result) => finish(result));
    worker.once('error', () => finish(failure(new ValidationError('CHECKER_FAILURE',
      'Owned validation worker failed'), output)));
    worker.once('exit', () => {
      if (!settled) finish(failure(new ValidationError('CHECKER_FAILURE', 'Owned validation worker exited without a verdict'), output));
    });
  });
}
/**
 * Resolve a v1 alignment result without writes, installs, network or PR execution.
 * Pass raw JSON text to keep untrusted parsing inside the bounded owned Worker.
 * Object inputs are for trusted assembly: serialization runs in the caller.
 *
 * The caller authenticates the complete exact-head tree/files and independent
 * metadata for every reachable coordinate. authenticated:true asserts that
 * provenance; the field and matching blob hashes do not establish it themselves.
 * trustedConfig carries externally selected checkerRevision and policyRevision,
 * never values copied from PR data. The release owner binds that revision label
 * and checkerSha256 to the reviewed complete immutable source/runtime layout.
 * runtimeSha256 covers manifest/lock, resolved entries and package manifests;
 * it does not authenticate every module source file. Interpreter flags and
 * environment belong to the trusted owner and permissions inherit in the Worker.
 *
 * Validation/runtime failures resolve bounded error or not-aligned JSON.
 * Only verdict:aligned authorizes a successful check result. Operational flags,
 * input/output schemas and release preparation belong to the checker runbook.
 */
export const checkAlignment = (input, trustedConfig) => runOwned(input, trustedConfig, 'check');
/**
 * Resolve all reachable name/version coordinates after the same bounded exact
 * tree, file, manifest and lock ownership checks as checkAlignment. Metadata may
 * be omitted. The caller uses the coordinates with independent trusted metadata
 * acquisition/cache; discovery never provides an alignment success verdict.
 * Successful discovery returns operation:discover and verdict:metadata-required.
 * inputHash binds schema/identity/tree/files, with sorted object keys and array
 * order preserved, so final checking can retain the same discovery receipt.
 * metadataHash separately binds the supplied canonical metadata envelope.
 */
export const discoverMetadata = (input, trustedConfig) => runOwned(input, trustedConfig, 'discover');
// Acquisition is intentionally separate from validation. Only this fixed public
// registry policy is supported; URLs/configuration from PR files are never read.
/**
 * Acquire projected published version documents separately from pure validation.
 * Requests contain only bounded exact name/version coordinates. The owned client
 * selects fixed public npm HTTPS endpoints; PR URLs, .npmrc, credentials and
 * executable settings do not select transport. The caller owns authenticated TLS
 * configuration/cache and provenance, and never lets PR data mint that authority.
 *
 * Return the public-npm-v1 metadata envelope with dependency/peer/optional flags
 * and integrity. Reject transport, identity, parsing or resource failures; cancel
 * active requests on failure. Concurrency and response/batch deadlines are fixed.
 * The projection is acquisition evidence, not an aligned compatibility verdict.
 */
export async function acquireRegistryMetadata(requests) {
  requireThat(Array.isArray(requests) && requests.length <= LIMITS.metadataPackages,
    'RESOURCE_LIMIT', 'Metadata request set exceeds limit');
  const seen = new Set();
  for (const request of requests) {
    keys(request, ['name', 'version'], 'metadata request');
    requireThat(packageName(request.name) && typeof request.version === 'string' &&
      /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(request.version),
      'INVALID_METADATA', 'Exact public registry name/version is required');
    const key = request.name + '@' + request.version;
    requireThat(!seen.has(key), 'AMBIGUOUS_METADATA', 'Duplicate metadata request'); seen.add(key);
  }
  const packages = new Array(requests.length), active = new Set();
  let next = 0, total = 0, stopped = false, firstError;
  const stop = (error) => {
    if (!firstError) firstError = error;
    stopped = true;
    for (const request of active) request.destroy();
  };
  const deadline = setTimeout(() => stop(new ValidationError('METADATA_TIMEOUT',
    'Metadata batch exceeded the owned acquisition deadline')), 120000);
  async function acquire(request) {
    const url = REGISTRY + '/' + encodeURIComponent(request.name) + '/' + encodeURIComponent(request.version);
    const bytes = await new Promise((done, reject) => {
      let body = Buffer.alloc(0), finished = false, timer;
      const complete = (error, value) => {
        if (finished) return; finished = true; clearTimeout(timer); active.delete(req);
        if (error) reject(error); else done(value);
      };
      const req = httpsGet(url, { headers: { accept: 'application/json' } }, (response) => {
        if (response.statusCode !== 200) {
          response.destroy(); req.destroy();
          complete(new ValidationError('METADATA_UNAVAILABLE', 'Fixed registry returned non-success or redirect')); return;
        }
        response.on('data', (chunk) => {
          if (body.length + chunk.length > LIMITS.responseBytes || total + chunk.length > LIMITS.metadataBytes) {
            response.destroy(); req.destroy(); complete(new ValidationError('RESOURCE_LIMIT', 'Registry response exceeds byte limit')); return;
          }
          total += chunk.length; body = Buffer.concat([body, chunk]);
        });
        response.once('error', () => complete(new ValidationError('METADATA_UNAVAILABLE', 'Registry response failed')));
        response.once('end', () => complete(null, body));
      });
      active.add(req);
      timer = setTimeout(() => {
        req.destroy(); complete(new ValidationError('METADATA_TIMEOUT', 'Registry metadata deadline exceeded'));
      }, LIMITS.timeoutMs);
      req.once('error', () => complete(new ValidationError('METADATA_UNAVAILABLE', 'Fixed registry request failed')));
      req.once('close', () => {
        if (!finished) complete(new ValidationError('METADATA_UNAVAILABLE', 'Registry request closed before complete response'));
      });
    });
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { throw new ValidationError('INVALID_UTF8', 'Registry metadata is not UTF-8'); }
    const info = parseJson(text, 'registry response');
    requireThat(info.name === request.name && info.version === request.version,
      'INVALID_METADATA', 'Registry response identity differs from requested version');
    const document = { name: info.name, version: info.version, dist: { integrity: info.dist?.integrity } };
    for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies', 'peerDependenciesMeta']) {
      if (info[field] !== undefined) document[field] = info[field];
    }
    return document;
  }
  async function consume() {
    while (!stopped && next < requests.length) {
      const i = next++;
      try { packages[i] = await acquire(requests[i]); } catch (error) { stop(error); }
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(4, requests.length) }, consume));
    if (firstError) throw firstError;
    const envelope = { schemaVersion: 1, source: REGISTRY, authenticated: true, policy: REGISTRY_POLICY, packages };
    requireThat(Buffer.byteLength(canonical(envelope)) <= LIMITS.metadataBytes,
      'RESOURCE_LIMIT', 'Projected metadata exceeds byte limit');
    return envelope;
  } finally { clearTimeout(deadline); for (const request of active) request.destroy(); }
}
async function stdinBytes() {
  return new Promise((done, reject) => {
    let body = Buffer.alloc(0);
    const finish = (error) => {
      clearTimeout(timer); process.stdin.removeAllListeners('data');
      process.stdin.removeAllListeners('end'); process.stdin.removeAllListeners('error');
      process.stdin.pause(); if (error) reject(error); else done(body);
    };
    const timer = setTimeout(() => finish(new ValidationError('INPUT_TIMEOUT', 'Input deadline exceeded')), LIMITS.timeoutMs);
    process.stdin.on('data', (chunk) => {
      if (body.length + chunk.length > LIMITS.requestBytes) finish(new ValidationError('RESOURCE_LIMIT', 'Checker request exceeds byte limit'));
      else body = Buffer.concat([body, chunk]);
    });
    process.stdin.once('end', () => finish());
    process.stdin.once('error', () => finish(new ValidationError('INVALID_INPUT', 'Cannot read request bytes')));
  });
}
// The runbook owns the operational CLI reference. Trusted flags select revisions
// and check/discover mode; stdin carries repository data, never interpreter flags.
async function cli() {
  let config; let output;
  try {
    const { values } = parseArgs({ options: {
      'checker-revision': { type: 'string' }, 'policy-revision': { type: 'string' },
      mode: { type: 'string', default: 'check' },
    }, strict: true });
    requireThat(['check', 'discover'].includes(values.mode), 'INVALID_CONFIGURATION', 'Unsupported trusted mode');
    config = configuration({ checkerRevision: values['checker-revision'], policyRevision: values['policy-revision'] });
    const bytes = await stdinBytes();
    let raw;
    try { raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { throw new ValidationError('INVALID_UTF8', 'Checker request is not UTF-8'); }
    output = await runOwned(raw, config, values.mode);
  } catch (error) { output = failure(error, resultBase(config)); }
  process.stdout.write(JSON.stringify(output) + '\n');
  process.exitCode = output.verdict === 'aligned' || output.operation === 'discover' &&
    output.verdict === 'metadata-required' ? 0 : 1;
}
if (!isMainThread) {
  pureValidation(workerData.raw, workerData.config, workerData.operation).then((result) => parentPort.postMessage(result));
} else if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await cli();
}
