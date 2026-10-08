// External release authority is supplied by the trusted deployment owner. An
// inventory's self hash is never a substitute for that independent authority.
import * as fs from 'node:fs';
import path from 'node:path';
import { EMPTY_SHA256 } from './data-only.mjs';
import { digest } from './transform.mjs';
import { verifyCli, hashFd } from './identity.mjs';

const hash = /^[a-f0-9]{64}$/;
const revision = /^[a-f0-9]{40}$/;
const fixedRoots = { checker: '/opt/renovate-native/checker', helper: '/opt/renovate-native/helper',
  toolchain: '/opt/renovate-native/toolchain', observation: '/opt/renovate-native/observation' };
function requireValue(condition) { if (!condition) throw Error('Unsupported native runtime authority'); }
function readPinned(filename, pin, limit) {
  requireValue(hash.test(pin));
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd);
    requireValue(stat.isFile() && stat.size <= limit && !(stat.mode & 0o222));
    const bytes = fs.readFileSync(fd);
    requireValue(bytes.length <= limit && digest(bytes) === pin && hashFd(fd) === pin);
    return JSON.parse(bytes);
  } finally { fs.closeSync(fd); }
}
export function readonlyMount(root, mountinfo) {
  const mounts = mountinfo.trim().split('\n').map(line => line.split(' '));
  const parent = mounts.filter(parts => root === parts[4] || root.startsWith(parts[4] + '/'))
    .sort((a, b) => b[4].length - a[4].length)[0];
  requireValue(parent && parent[5].split(',').includes('ro'));
  requireValue(mounts.filter(parts => parts[4].startsWith(root + '/'))
    .every(parts => parts[5].split(',').includes('ro')));
}
// pnpm alias identity is SHA256 of UTF-8 compact JSON sorted inventory tuples:
// [relativePath, type, sha256-or-relative-link-target]. ASCII is mandatory so
// Python host and JavaScript runtime use identical sorting/encoding.
export function aliasDigest(alias, toolchain) {
  const selected=toolchain.filter(file=>file.path===alias.source);
  if(alias.kind==='node') {
    requireValue(alias.digestKind==='sha256-file'&&selected.length===1&&selected[0].type==='file');
    return selected[0].sha256;
  }
  requireValue(alias.kind==='pnpm'&&alias.digestKind==='sha256-inventory-tuples-v1'&&selected.length===0);
  const files=toolchain.filter(file=>file.path.startsWith(alias.source+'/'));
  requireValue(files.length>0);
  const tuples=files.map(file=>[file.path.slice(alias.source.length+1),file.type,file.type==='file'?file.sha256:file.target]);
  requireValue(tuples.every(tuple=>tuple.every(value=>typeof value==='string'&&/^[\x20-\x7e]+$/.test(value))));
  tuples.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
  return digest(Buffer.from(JSON.stringify(tuples),'utf8'));
}
export function validateAuthority(authority,{sourceFixture=false}={}) {
  requireValue(authority.schemaVersion === 1 && authority.qualificationContractRevision === 2 && (authority.productionEligible === true && authority.trustScope==='release-owner' ||
      sourceFixture && authority.trustScope==='source-fixture' && authority.productionEligible===false) &&
    revision.test(authority.sourceRevision) && revision.test(authority.transformRevision) &&
    hash.test(authority.originalArchiveSha256) && hash.test(authority.originalBundleSha256) &&
    hash.test(authority.derivedBundleSha256) && hash.test(authority.profileSha256) &&
    /^sha256:[a-f0-9]{64}$/.test(authority.imageId) && /^sha256:[a-f0-9]{64}$/.test(authority.imageDigest) &&
    hash.test(authority.linuxCompatibilitySha256) && hash.test(authority.dataOnlyLifecycleSha256));
  const origin = new URL(authority.attestationOrigin);
  requireValue(origin.protocol === 'https:' && !origin.username && !origin.password && !origin.search && !origin.hash);
  requireValue(authority.attestationOrigin !== `https://github.com/sebastian-software/renovate-config/commit/${authority.transformRevision}`);
  requireValue(Object.keys(authority.components).sort().join(',') === 'checker,helper,observation,toolchain');
  for (const name of Object.keys(fixedRoots)) {
    const files = authority.components[name];
    requireValue(Array.isArray(files) && files.length > 0 && files.length <= 20000);
    requireValue(new Set(files.map(file => file.path)).size === files.length);
    for (const file of files) requireValue(typeof file.path === 'string' &&
      !path.isAbsolute(file.path) && file.path.split('/').every(part => part && part !== '.' && part !== '..') &&
      (file.type === 'file' ? hash.test(file.sha256) : file.type === 'symlink' && typeof file.target === 'string'));
  }
  requireValue(Array.isArray(authority.nativeAliases) && authority.nativeAliases.length === 2);
  for (const alias of authority.nativeAliases) requireValue(['node', 'pnpm'].includes(alias.kind) &&
    typeof alias.destination === 'string' && /^\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/.test(alias.destination) &&
    typeof alias.source === 'string' && !path.isAbsolute(alias.source) &&
    alias.source.split('/').every(part => part && part !== '.' && part !== '..') && hash.test(alias.sha256) &&
    alias.originalImageSha256 === alias.sha256 && aliasDigest(alias,authority.components.toolchain)===alias.sha256);
  requireValue(new Set(authority.nativeAliases.map(alias => alias.kind)).size === 2);
}
export function verifyRuntime(authorityFile, authorityPin, launchFile) {
  requireValue(process.platform === 'linux');
  const authority = readPinned(authorityFile, authorityPin, 8_388_608);
  requireValue(authority.trustScope==='release-owner');
  validateAuthority(authority);
  const compatibility=readPinned('/opt/renovate-native-authority/linux-compatibility.json',authority.linuxCompatibilitySha256,65536);
  const lifecycle=readPinned('/opt/renovate-native-authority/data-only-lifecycle.json',authority.dataOnlyLifecycleSha256,65536);
  const profile=readPinned('/opt/renovate-native/observation/profile.json',authority.profileSha256,16_777_216);
  requireValue(profile.qualificationContractRevision===2&&profile.trustScope==='release-owner'&&profile.productionEligible===false&&
    profile.provenanceClass==='authenticated-preparation'&&profile.sourceRevision===authority.sourceRevision&&
    profile.transformRevision===authority.transformRevision);
  requireValue(compatibility.qualificationContractRevision===2&&lifecycle.qualificationContractRevision===2&&compatibility.trustScope==='release-owner'&&lifecycle.trustScope==='release-owner'&&compatibility.profileSha256===authority.profileSha256&&lifecycle.profileSha256===authority.profileSha256&&
    lifecycle.emptyPnpmfileSha256===EMPTY_SHA256&&compatibility.platform==='linux'&&compatibility.sourceRevision===authority.transformRevision&&
    compatibility.originalArchiveSha256===authority.originalArchiveSha256&&
    compatibility.derivedBundleSha256===authority.derivedBundleSha256&&
    compatibility.originalDerivedLockAndOutcomeEquivalent===true&&
    compatibility.completeInstallUpdateDedupeCoverage===true&&lifecycle.sourceRevision===authority.transformRevision&&
    lifecycle.completeInstallUpdateDedupeCoverage===true&&lifecycle.dataOnlyWholeLifecycle===true);
    const mountinfo = fs.readFileSync('/proc/self/mountinfo', 'utf8');
  const held = [];
  try {
    readonlyMount('/opt/renovate-native-authority/authority.json', mountinfo);
    for (const [name, root] of Object.entries(fixedRoots)) {
      readonlyMount(root, mountinfo);
      held.push(verifyCli(root, authority.components[name]));
    }
    for (const [root, files] of [[`/opt/renovate/releases/vitest-${authority.sourceRevision}`,authority.components.helper],
      ['/opt/renovate/toolchains/candidate43-consumer11',authority.components.toolchain]]) {
      readonlyMount(root,mountinfo);held.push(verifyCli(root,files));
    }
    for (const alias of authority.nativeAliases) {
      readonlyMount(alias.destination, mountinfo);
      const source = path.join(fixedRoots.toolchain, alias.source);
      if (alias.kind === 'pnpm') held.push(verifyCli(alias.destination, authority.components.toolchain
        .filter(file => file.path.startsWith(alias.source + '/'))
        .map(file => ({...file, path:file.path.slice(alias.source.length + 1)}))));
      else {
        const fd = fs.openSync(alias.destination, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        held.push({close(){fs.closeSync(fd);}});
        requireValue(hashFd(fd) === alias.sha256 && digest(fs.readFileSync(source)) === alias.sha256);
      }
    }
    readonlyMount('/opt/renovate-native-context', mountinfo);
    // This separate host-owned launch document is written after create, before
    // start. Its context pin comes from the outside wrapper, never context.json.
    const stat = fs.lstatSync(launchFile);
    requireValue(stat.isFile() && !(stat.mode & 0o222) && stat.size <= 4096 &&
      fs.realpathSync(launchFile) === launchFile && path.dirname(launchFile) === '/opt/renovate-native-context');
    const launch = JSON.parse(fs.readFileSync(launchFile));
    requireValue(launch.schemaVersion === 1 && launch.authoritySha256 === authorityPin &&
      launch.profileSha256 === authority.profileSha256 && hash.test(launch.contextSha256));
    const context = readPinned('/opt/renovate-native-context/context.json', launch.contextSha256, 4096);
    requireValue(context.imageId === authority.imageId && context.imageDigest === authority.imageDigest);
    return {authority, contextSha256:launch.contextSha256, close(){for(const handle of held)handle.close();}};
  } catch (error) { for(const handle of held)handle.close(); throw error; }
}
