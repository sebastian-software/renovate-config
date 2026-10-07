import * as fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { archiveMembers } from './archive.mjs';
import {
  authenticateImplementation, readPinnedJson, budgets, compareInventory, consumerFiles, copyInventory, digestPattern, hashFile,
  inventory, jsonBytes, realDirectory, relativeName, requireValue, sealDirectories, sha256, verifyReadOnly,
} from './files.mjs';

const runFile = promisify(execFile);
const sourcePaths = (name) => [
  `scripts/${name}.mjs`, `scripts/${name}/package.json`, `scripts/${name}/pnpm-lock.yaml`,
];
const entries = { checker: 'vitest-peer-alignment', helper: 'vitest-lockstep' };
const manifests = { checker: 'alignment-release.json', helper: 'helper-release.json', toolchain: 'toolchain-release.json' };
const ownFiles = ['../vitest-release.mjs', './package.mjs', './files.mjs', './archive.mjs'];

function keys(value, expected) {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === [...expected].sort().join(','), 'Unsupported provenance shape');
}
function immutableOrigin(value) {
  requireValue(typeof value === 'string' && value.length <= 4096, 'Invalid provenance origin');
  const url = new URL(value);
  requireValue(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash,
    'Provenance requires an HTTPS origin without credentials or query parameters');
}
function inventoryRecord(record) {
  relativeName(record.path);
  if (record.type === 'file') {
    keys(record, ['path', 'type', 'sha256', 'size', 'executable', 'artifact', 'member']);
    requireValue(digestPattern.test(record.sha256) && Number.isSafeInteger(record.size) && record.size >= 0 &&
      typeof record.executable === 'boolean', 'Invalid file provenance');
  } else {
    keys(record, ['path', 'type', 'target', 'artifact', 'member']);
    requireValue(record.type === 'symlink' && typeof record.target === 'string', 'Invalid link provenance');
  }
  requireValue(typeof record.artifact === 'string', 'Missing artifact authority');
  relativeName(record.member);
  const { artifact, member, ...leaf } = record;
  return leaf;
}

async function readAuthority(options) {
  requireValue(options.candidate || process.platform === 'linux' || options.sourceFixture===true, 'Production packaging requires held-directory Linux procfs traversal');
  requireValue(digestPattern.test(options['provenance-sha256']), 'An independent provenance SHA256 pin is required');
  const identity = await hashFile(options.provenance, 16_777_216);
  requireValue(identity.sha256 === options['provenance-sha256'], 'Provenance pin mismatch');
  const bytes = await fs.readFile(options.provenance);
  requireValue(sha256(bytes) === identity.sha256, 'Provenance changed while reading');
  const document = JSON.parse(bytes.toString('utf8'));
  keys(document, ['schemaVersion', 'sourceRevision', 'sourceOrigin', 'attestationOrigin', 'artifacts', 'components', 'toolchain',
    ...(!options.candidate ? ['packager','trustScope'] : [])]);
  let selection=null;
  if (!options.candidate) {
    requireValue(['release-owner','source-fixture'].includes(document.trustScope), 'Explicit preparation trust scope required');
    requireValue(document.trustScope!=='source-fixture'||options.sourceFixture===true, 'Fixture cannot authorize production packaging');
    requireValue(process.platform==='linux'||document.trustScope==='source-fixture', 'Production packaging requires held-directory Linux procfs traversal');
    selection=(await readPinnedJson(options.selection,options['selection-sha256'])).document;
    requireValue(selection.schemaVersion===1 && selection.trustScope===document.trustScope &&
      selection.provenanceSha256===identity.sha256 && selection.verifierRevision===document.packager?.revision,
      'Outside selection differs from preparation');
    const attestation=selection.publicationAttestation;
    requireValue(attestation && attestation.trustScope===document.trustScope &&
      attestation.provenanceSha256===identity.sha256 && attestation.sourceRevision===document.sourceRevision &&
      attestation.verifierRevision===document.packager.revision &&
      attestation.immutableOrigin===document.attestationOrigin &&
      attestation.sourceInventorySha256===sha256(jsonBytes(selection.sourceInventory)), 'Publication attestation does not bind selected bytes');
    const executingRoot=fileURLToPath(new URL('../../',import.meta.url)).replace(/\/$/,'');
    await authenticateImplementation(options['source-root'],executingRoot,document.packager,
      ['scripts/vitest-release.mjs','scripts/vitest-release/package.mjs','scripts/vitest-release/files.mjs','scripts/vitest-release/archive.mjs']);
    requireValue(JSON.stringify(Object.fromEntries(document.packager.files.map(file=>[file.path,file.sha256]).sort()))===
      JSON.stringify(Object.fromEntries(Object.entries(selection.verifierFiles??{}).sort())), 'Outside selected verifier closure mismatch');
  }
  requireValue(document.schemaVersion === 1 && /^[a-f0-9]{40}$/.test(document.sourceRevision), 'Invalid selected source revision');
  immutableOrigin(document.sourceOrigin);
  requireValue(document.sourceOrigin === `https://github.com/sebastian-software/renovate-config/commit/${document.sourceRevision}`,
    'Unsupported source owner');
  if (options.candidate) requireValue(document.attestationOrigin === null, 'Candidate preparation must not claim a published attestation');
  else immutableOrigin(document.attestationOrigin);
  keys(document.components, ['checker', 'helper', 'toolchain']);
  keys(document.toolchain, ['nodeVersion', 'pnpmVersion', 'platform', 'nodeEntry', 'pnpmEntry', 'pnpmPackage']);
  const toolchain = document.toolchain;
  requireValue(['24.18.0/11.17.0', '24.21.0/11.20.0'].includes(`${toolchain.nodeVersion}/${toolchain.pnpmVersion}`) &&
    /^(linux|darwin)-(x64|arm64)$/.test(toolchain.platform), 'Unsupported owned toolchain tuple');
  for (const key of ['nodeEntry', 'pnpmEntry', 'pnpmPackage']) relativeName(toolchain[key]);
  requireValue(Array.isArray(document.artifacts) && document.artifacts.length > 0 && document.artifacts.length <= 16,
    'Invalid artifact set');
  const artifactRoot = await realDirectory(options['artifact-root']);
  const artifacts = new Map();
  for (const artifact of document.artifacts) {
    keys(artifact, ['id', 'name', 'version', 'origin', 'path', 'sha256', 'memberPrefix']);
    requireValue(/^[a-z0-9-]+$/.test(artifact.id) && artifact.id !== 'git' && !artifacts.has(artifact.id), 'Duplicate artifact authority');
    requireValue(digestPattern.test(artifact.sha256), 'Invalid archive pin');
    relativeName(artifact.path);
    relativeName(artifact.memberPrefix);
    immutableOrigin(artifact.origin);
    if (['yaml', 'semver', 'pnpm'].includes(artifact.name)) {
      const version = artifact.name === 'yaml' ? '2.9.1' : artifact.name === 'semver' ? '7.8.5' : toolchain.pnpmVersion;
      requireValue(artifact.version === version && artifact.memberPrefix === 'package' &&
        artifact.origin === `https://registry.npmjs.org/${artifact.name}/-/${artifact.name}-${version}.tgz`,
      'Unsupported npm artifact origin/version');
    } else {
      requireValue(artifact.name === 'node' && artifact.version === toolchain.nodeVersion &&
        artifact.memberPrefix === `node-v${toolchain.nodeVersion}-${toolchain.platform}` &&
        artifact.origin === `https://nodejs.org/dist/v${toolchain.nodeVersion}/${artifact.memberPrefix}.tar.gz`,
      'Unsupported Node artifact origin/version');
    }
    const archive = path.join(artifactRoot, artifact.path);
    requireValue(await fs.realpath(archive) === archive, 'Archive path traverses symlinks');
    const members = await archiveMembers(archive, artifact.sha256);
    requireValue([...members.keys()].every((name) => name === artifact.memberPrefix || name.startsWith(`${artifact.memberPrefix}/`)),
      'Archive contains members outside its authenticated package');
    artifacts.set(artifact.id, { ...artifact, members });
  }
  const gitRoot = await realDirectory(options['source-root']);
  if (!options.candidate) {
    const { stdout: objectType } = await runFile('/usr/bin/git', ['--no-pager', '--no-replace-objects', '-C', gitRoot,
      'cat-file', '-t', document.sourceRevision], { encoding: 'utf8', maxBuffer: 4096,
      env: { PATH: '/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' } });
    requireValue(objectType.trim() === 'commit', 'Selected source revision must identify an actual Git commit');
  }
  const source = new Map();
  for (const name of Object.values(entries)) {
    for (const filename of sourcePaths(name)) {
      const { stdout } = await runFile('/usr/bin/git', ['--no-pager', '--no-replace-objects', '-C', gitRoot,
        'show', `${document.sourceRevision}:${filename}`], {
        encoding: 'buffer', maxBuffer: 2_097_152,
        env: { PATH: '/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' },
      });
      const { stdout: tree } = await runFile('/usr/bin/git', ['--no-pager', '--no-replace-objects', '-C', gitRoot,
        'ls-tree', document.sourceRevision, '--', filename], { encoding: 'utf8', maxBuffer: 4096,
        env: { PATH: '/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1' } });
      requireValue(/^100(644|755) blob [a-f0-9]{40}\t/.test(tree), 'Unsupported selected Git source mode');
      const executable = tree.startsWith('100755 ');
      const sourceFile = path.join(gitRoot, filename);
      requireValue(await fs.realpath(sourceFile) === sourceFile, 'Selected source path traverses symlinks');
      const actual = await hashFile(sourceFile, 2_097_152);
      requireValue(actual.sha256 === sha256(stdout) && actual.executable === executable, 'Source working bytes/mode differ from selected Git revision');
      source.set(filename, { type: 'file', sha256: sha256(stdout), size: stdout.length, executable });
    }
  }
  if (selection) {
    requireValue(selection.sourceInventory && Object.keys(selection.sourceInventory).length===source.size &&
      [...source].every(([name,leaf])=>selection.sourceInventory[name]===leaf.sha256), 'Outside selected source inventory mismatch');
  }
  const expected = {};
  for (const component of Object.keys(budgets)) {
    const records = document.components[component];
    requireValue(Array.isArray(records) && records.length > 0 && records.length <= budgets[component].count,
      'Invalid component inventory');
    const names = new Set();
    const used = new Map();
    expected[component] = records.map((record) => {
      const leaf = inventoryRecord(record);
      requireValue(!names.has(record.path) && record.path !== manifests[component], 'Duplicate or reserved inventory path');
      names.add(record.path);
      if (record.artifact === 'git') {
        requireValue(component !== 'toolchain' && sourcePaths(entries[component]).includes(record.path) &&
          record.member === record.path && leaf.type === 'file', 'Unsupported source mapping');
        const original = source.get(record.member);
        requireValue(leaf.sha256 === original.sha256 && leaf.size === original.size && leaf.executable === original.executable,
          'Source provenance differs from selected Git bytes/mode');
      } else {
        const artifact = artifacts.get(record.artifact);
        const member = artifact?.members.get(record.member);
        requireValue(member && member.type !== 'directory', 'Missing archive member authority');
        const authenticated = member.type === 'symlink'
          ? { type: member.type, target: member.target }
          : { type: member.type, sha256: member.sha256, size: member.size, executable: member.executable };
        const { path: unused, ...observed } = leaf;
        requireValue(Object.keys(authenticated).every((key) => observed[key] === authenticated[key]),
          'Prepared leaf differs from authenticated archive member');
        if (!used.has(record.artifact)) used.set(record.artifact, new Set());
        requireValue(!used.get(record.artifact).has(record.member), 'Duplicate member mapping');
        used.get(record.artifact).add(record.member);
      }
      return leaf;
    }).sort((a, b) => a.path.localeCompare(b.path, 'en'));
    for (const [id, members] of used) {
      const all = [...artifacts.get(id).members].filter(([, member]) => member.type !== 'directory').map(([name]) => name);
      requireValue(all.length === members.size && all.every((name) => members.has(name)), 'Incomplete original package closure');
    }
    if (component !== 'toolchain') {
      requireValue(sourcePaths(entries[component]).every((name) => names.has(name)), 'Missing source entry/manifest/lock');
      const runtime = JSON.parse(await fs.readFile(path.join(gitRoot, `scripts/${entries[component]}/package.json`), 'utf8'));
      requireValue(Object.keys(runtime.dependencies ?? {}).sort().join(',') === 'semver,yaml' &&
        Object.keys(runtime.optionalDependencies ?? {}).length === 0 &&
        runtime.dependencies?.yaml === '2.9.1' && runtime.dependencies?.semver === '7.8.5' &&
        runtime.engines?.node === '>=24 <25', 'Unsupported runtime source contract');
      const dependencyNames = [...used.keys()].map((id) => artifacts.get(id).name).sort();
      requireValue(dependencyNames.join(',') === 'semver,yaml', 'Checker/helper dependency closure mismatch');
    } else {
      requireValue([toolchain.nodeEntry, toolchain.pnpmEntry, toolchain.pnpmPackage].every((name) => names.has(name)),
        'Missing native toolchain entry');
      requireValue([...used.keys()].map((id) => artifacts.get(id).name).sort().join(',') === 'node,pnpm',
        'Toolchain artifact closure mismatch');
      for (const [id] of used) {
        const artifact = artifacts.get(id);
        const entry = artifact.name === 'node' ? toolchain.nodeEntry : toolchain.pnpmEntry;
        const record = records.find((value) => value.path === entry);
        requireValue(record?.artifact === id && record.type === 'file' &&
          (artifact.name !== 'node' || (record.member === `${artifact.memberPrefix}/bin/node` && record.executable)),
          'Toolchain entry mapping mismatch');
      }
    }
  }
  requireValue(new Set(document.artifacts.map((artifact) => artifact.name)).size === 4 && document.artifacts.length === 4,
    'Expected exactly the owned Node, pnpm, semver and yaml archives');
  return { document, expected, pin: identity.sha256, candidate: options.candidate === true, selection, eligible:!options.candidate && document.trustScope==='release-owner' };
}

async function verifyToolchain(root, contract) {
  const packageFile = path.join(root, contract.pnpmPackage);
  const manifest = JSON.parse(await fs.readFile(packageFile, 'utf8'));
  requireValue(manifest.name === 'pnpm' && manifest.version === contract.pnpmVersion &&
    Object.keys(manifest.dependencies ?? {}).length === 0 && Object.keys(manifest.optionalDependencies ?? {}).length === 0,
    'Unsupported pnpm package dependency closure');
  const entry = path.posix.normalize(path.posix.join(path.posix.dirname(contract.pnpmPackage), manifest.bin?.pnpm ?? ''));
  requireValue(entry === contract.pnpmEntry, 'pnpm CLI entry differs from published package contract');
}

async function documents(authority) {
  const result = {};
  for (const component of Object.keys(budgets)) {
    const value = { schemaVersion: 1, entry: component === 'toolchain' ? authority.document.toolchain.pnpmEntry
      : `scripts/${entries[component]}.mjs`, files: consumerFiles(authority.expected[component]) };
    if (component !== 'checker') {
      value.sourceRevision = authority.document.sourceRevision;
      value.provenanceSha256 = authority.pin;
      if (component === 'toolchain') { value.identity = 'original'; value.tuple = authority.document.toolchain; }
    }
    result[component] = jsonBytes(value);
  }
  const packager = [];
  for (const name of ownFiles) {
    const filename = fileURLToPath(new URL(name, import.meta.url));
    const { sha256: hash } = await hashFile(filename, 2_097_152);
    const relative = name.startsWith('../') ? 'scripts/vitest-release.mjs' : `scripts/vitest-release/${name.slice(2)}`;
    packager.push({ path: relative, sha256: hash });
  }
  result.release = jsonBytes({ schemaVersion: 1, sourceRevision: authority.document.sourceRevision,
    sourceOrigin: authority.document.sourceOrigin, provenanceSha256: authority.pin,
    attestationOrigin: authority.document.attestationOrigin, productionEligible: authority.eligible,
    ...(!authority.candidate?{trustScope:authority.document.trustScope}:{}),
    provenanceClass: authority.candidate ? 'unpublished-candidate' : 'independently-pinned-attestation',
    directoryAncestry: process.platform === 'linux' ? 'held-directory-fd' :
      authority.candidate?'candidate-unverified-pathname':'fixture-unverified-pathname',
    originals: authority.document.artifacts, derived: [],
    packager: authority.candidate?{ revision: null, state: 'pending-reviewed-commit', files: packager }:
      {revision:authority.document.packager.revision,files:packager},
    inventories: Object.fromEntries(Object.keys(budgets).map((name) => [name,
      { path: `${name}/${manifests[name]}`, sha256: sha256(result[name]) }])) });
  return result;
}

async function verifyLayout(root, authority, expectedDocuments) {
  if (authority.selection?.releaseSha256) requireValue(authority.selection.releaseSha256===sha256(expectedDocuments.release),
    'Outside selected finalized release receipt differs');
  await realDirectory(root);
  requireValue((await fs.readdir(root)).sort().join(',') === 'checker,helper,release.json,toolchain', 'Unexpected bundle layout');
  for (const component of Object.keys(budgets)) {
    const directory = path.join(root, component);
    compareInventory(await inventory(directory, budgets[component], [manifests[component]]), authority.expected[component]);
    const actual = await hashFile(path.join(directory, manifests[component]), 16_777_216);
    requireValue(actual.sha256 === sha256(expectedDocuments[component]), 'Release inventory changed');
  }
  requireValue((await hashFile(path.join(root, 'release.json'), 16_777_216)).sha256 === sha256(expectedDocuments.release),
    'Release receipt changed');
  await verifyToolchain(path.join(root, 'toolchain'), authority.document.toolchain);
}

export async function packageRelease(mode, options) {
  const authority = await readAuthority(options);
  const expectedDocuments = await documents(authority);
  requireValue(path.isAbsolute(options.output), 'Output must be absolute');
  if (mode === 'verify' || mode === 'finalize') {
    if (!authority.candidate) requireValue(typeof authority.selection.releaseSha256 === 'string' &&
      digestPattern.test(authority.selection.releaseSha256), 'Final verification requires independently selected receipt pin releaseSha256');
    await verifyLayout(options.output, authority, expectedDocuments);
    await verifyReadOnly(options.output);
    return { verified: true, productionEligible: authority.eligible, sourceRevision: authority.document.sourceRevision, provenanceSha256: authority.pin };
  }
  await realDirectory(path.dirname(options.output));
  try { await fs.lstat(options.output); throw new Error('Output already exists'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const component of Object.keys(budgets)) {
    compareInventory(await inventory(options[`${component}-root`], budgets[component]), authority.expected[component]);
  }
  const staging = await fs.mkdtemp(path.join(path.dirname(options.output), '.vitest-release-'));
  try {
    for (const component of Object.keys(budgets)) {
      const destination = path.join(staging, component);
      await copyInventory(options[`${component}-root`], destination, authority.expected[component]);
      compareInventory(await inventory(options[`${component}-root`], budgets[component]), authority.expected[component]);
      await fs.writeFile(path.join(destination, manifests[component]), expectedDocuments[component], { flag: 'wx', mode: 0o444 });
    }
    await fs.writeFile(path.join(staging, 'release.json'), expectedDocuments.release, { flag: 'wx', mode: 0o444 });
    await verifyLayout(staging, authority, expectedDocuments);
    // mkdir is the exclusive publication reservation. Node rename may replace an
    // existing empty directory, so never rename the staging root onto the target.
    // The receipt is published last; partial copies cannot pass verification.
    await fs.mkdir(options.output);
    for (const component of Object.keys(budgets)) {
      await fs.rename(path.join(staging, component), path.join(options.output, component));
    }
    await fs.rename(path.join(staging, 'release.json'), path.join(options.output, 'release.json'));
    await sealDirectories(options.output);
    await verifyReadOnly(options.output);
    await fs.rmdir(staging);
  } catch (error) {
    // This exclusive temporary directory is the only location the packager may remove.
    await fs.rm(staging, { recursive: true, force: true });
    throw error;
  }
  return { packaged: true, productionEligible: authority.eligible, sourceRevision: authority.document.sourceRevision, provenanceSha256: authority.pin };
}
