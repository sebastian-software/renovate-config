// Test-only complete original distributions and immutable containing-source fixtures.
// No archive is executed, no documentary event claims Linux worker execution.
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const bytes = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
export const pins = {
  yaml: '4ef6c54cf559b8a207b7b518378230805a1c84af239b14960e8c67c7d59de5d3',
  semver: 'd85045d4300d7d57c891336b95df532e73f34c22ffcd222452b6d08b9d127d5d',
  pnpm: '644eb5079654e87dae59a07e62d7f098162b9ce58f06077328b5ddefca1c8541',
  'darwin-arm64': 'e1a97e14c99c803e96c7339403282ea05a499c32f8d83defe9ef5ec66f979ed1',
  'linux-x64': '783130984963db7ba9cbd01089eaf2c2efb055c7c1693c943174b967b3050cb8',
};
export const stockNames = ['scripts/vitest-release.mjs', 'scripts/vitest-release/package.mjs',
  'scripts/vitest-release/files.mjs', 'scripts/vitest-release/archive.mjs'].sort();
export const sourceNames = ['vitest-peer-alignment', 'vitest-lockstep'].flatMap(name =>
  [`scripts/${name}.mjs`, `scripts/${name}/package.json`, `scripts/${name}/pnpm-lock.yaml`]).sort();
export const components = ['checker', 'helper', 'toolchain', 'observation'];
export async function writeJson(filename, value) {
  await fs.writeFile(filename, bytes(value), { mode: 0o444 });
  return hash(bytes(value));
}
// Independent physical inventory oracle: real types, real bytes and real modes.
export async function leaves(root, prefix = '') {
  const result = [];
  for (const name of await fs.readdir(path.join(root, prefix))) {
    const relative = prefix ? `${prefix}/${name}` : name;
    const absolute = path.join(root, relative), stat = await fs.lstat(absolute);
    if (stat.isDirectory()) result.push(...await leaves(root, relative));
    else if (stat.isSymbolicLink()) result.push({ path: relative, type: 'symlink', target: await fs.readlink(absolute) });
    else {
      assert(stat.isFile()); const content = await fs.readFile(absolute);
      result.push({ path: relative, type: 'file', sha256: hash(content), size: content.length, executable: Boolean(stat.mode & 0o111) });
    }
  }
  return result.sort((a,b) => a.path.localeCompare(b.path, 'en'));
}
export const consumer = inventory => inventory.map(({path: name,type,sha256,target}) =>
  type === 'file' ? {path:name,type,sha256} : {path:name,type,target});
export async function seal(root) {
  for (const name of await fs.readdir(root)) {
    const file = path.join(root, name), stat = await fs.lstat(file);
    if (stat.isDirectory()) await seal(file);
    else if (stat.isFile()) await fs.chmod(file, stat.mode & 0o111 ? 0o555 : 0o444);
  }
  await fs.chmod(root, 0o555);
}
export async function replace(filename, content) {
  await fs.chmod(filename, 0o644); await fs.writeFile(filename, content); await fs.chmod(filename, 0o444);
}
export function fixtureGit(sourceRoot, ...args) {
  return execFileSync('/usr/bin/git', ['-c','core.hooksPath=/dev/null','-c','commit.gpgSign=false', ...args], {
    cwd: sourceRoot, encoding: 'utf8', stdio:['ignore','pipe','pipe'], env: {
      PATH:'/usr/bin:/bin',GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1',GIT_NO_REPLACE_OBJECTS:'1',
      GIT_AUTHOR_NAME:'Source fixture',GIT_COMMITTER_NAME:'Source fixture',
      GIT_AUTHOR_EMAIL:'source-fixture@example.invalid',GIT_COMMITTER_EMAIL:'source-fixture@example.invalid',
      GIT_AUTHOR_DATE:'2026-10-07T00:00:00Z',GIT_COMMITTER_DATE:'2026-10-07T00:00:00Z',
    },
  }).trim();
}
export async function createStockFixture(values) {
  assert(values.archives, 'Missing --archives with complete independently pinned originals');
  const platform = values.platform ?? `${process.platform}-${process.arch}`;
  assert(['darwin-arm64','linux-x64'].includes(platform), 'Unsupported exact fixture platform');
  if (values['require-linux']) {
    assert.equal(process.platform, 'linux', 'Production directory traversal cannot pass on Darwin');
    assert.equal(typeof process.getuid, 'function');
    assert.notEqual(process.getuid(), 0, 'Linux source fixtures must execute unprivileged');
  }
  const repository = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const root = await fs.realpath(await fs.mkdtemp(path.join(tmpdir(),'q1-production-fixture-')));
  const sourceRoot = path.join(root,'source'); await fs.mkdir(sourceRoot);
  const nativeNames = ['scripts/vitest-native-prepare.mjs',
    ...(await fs.readdir(path.join(repository,'scripts/vitest-native'))).filter(name=>name.endsWith('.mjs')).map(name=>`scripts/vitest-native/${name}`),
    'scripts/vitest-release/archive.mjs','scripts/vitest-release/files.mjs'].sort();
  const issuerNames = [...new Set([...nativeNames,...stockNames,'scripts/vitest-native-authority.mjs'])].sort();
  // Fixed Q2a test-owned closure; never an arbitrary module/command selector.
  const workerNames = values.workerFixture ? ['scripts/test-vitest-native-worker.mjs',
    'scripts/test-vitest-native-runner.mjs', 'scripts/vitest-native-worker/contract.mjs',
    'scripts/vitest-native-worker/inputs.mjs', 'scripts/vitest-native-worker/collection.mjs'] : [];
  const allNames = [...new Set([...sourceNames,...issuerNames,...workerNames])].sort();
  const implementation = {};
  for (const name of allNames) {
    const original = path.join(repository,name), content = await fs.readFile(original), stat = await fs.stat(original);
    const target = path.join(sourceRoot,name); await fs.mkdir(path.dirname(target),{recursive:true});
    await fs.writeFile(target,content,{mode:stat.mode&0o111?0o755:0o644});
    implementation[name] = {path:name,type:'file',sha256:hash(content),size:content.length,executable:Boolean(stat.mode&0o111)};
  }
  fixtureGit(sourceRoot,'init','--quiet'); fixtureGit(sourceRoot,'add','--','scripts');
  fixtureGit(sourceRoot,'commit','--quiet','--no-verify','-m','Test-only complete containing Q1 source');
  const revision=fixtureGit(sourceRoot,'rev-parse','HEAD');
  assert.equal(fixtureGit(sourceRoot,'cat-file','-t',revision),'commit');
  assert.equal(fixtureGit(sourceRoot,'status','--porcelain'),'');
  const artifactRoot=await fs.realpath(values.archives);
  const definitions = [
    ['yaml','2.9.1','yaml-2.9.1.tgz','package'], ['semver','7.8.5','semver-7.8.5.tgz','package'],
    ['pnpm','11.17.0','pnpm-11.17.0.tgz','package'],
    ['node','24.18.0',`node-v24.18.0-${platform}.tar.gz`,`node-v24.18.0-${platform}`],
  ];
  const artifacts=[], extracted={};
  for (const [name,version,filename,prefix] of definitions) {
    const archive=path.join(artifactRoot,filename), pin=pins[name==='node'?platform:name];
    assert.equal(hash(await fs.readFile(archive)),pin,`Authentic complete ${name} archive differs from independent original pin`);
    const directory=path.join(root,`original-${name}`);await fs.mkdir(directory);
    execFileSync('/usr/bin/tar',['-xzf',archive,'-C',directory],{stdio:['ignore','pipe','pipe']});
    const originalRoot=path.join(directory,prefix);assert((await fs.stat(originalRoot)).isDirectory());
    extracted[name]={root:originalRoot,prefix,files:await leaves(originalRoot),archive};
    artifacts.push({id:name,name,version,origin:name==='node'?`https://nodejs.org/dist/v${version}/${filename}`:
      `https://registry.npmjs.org/${name}/-/${filename}`,path:filename,sha256:pin,memberPrefix:prefix});
  }
  const layouts=path.join(root,'layouts');await fs.mkdir(layouts);
  const inventories={checker:[],helper:[],toolchain:[]};
  for(const [component,entry] of [['checker','vitest-peer-alignment'],['helper','vitest-lockstep']]) {
    const target=path.join(layouts,component);await fs.mkdir(target);
    for(const name of sourceNames.filter(name=>name.startsWith(`scripts/${entry}`))) {
      const file=implementation[name];await fs.mkdir(path.dirname(path.join(target,name)),{recursive:true});
      await fs.copyFile(path.join(sourceRoot,name),path.join(target,name));
      await fs.chmod(path.join(target,name),file.executable?0o755:0o644);
      inventories[component].push({...file,artifact:'git',member:name});
    }
    for(const dependency of ['semver','yaml']) {
      const prefix=`scripts/${entry}/node_modules/${dependency}`;
      await fs.cp(extracted[dependency].root,path.join(target,prefix),{recursive:true,verbatimSymlinks:true});
      inventories[component].push(...extracted[dependency].files.map(file=>({...file,path:`${prefix}/${file.path}`,
        artifact:dependency,member:`package/${file.path}`})));
    }
  }
  const toolchain=path.join(layouts,'toolchain');await fs.mkdir(toolchain);
  for(const name of ['node','pnpm']) {
    await fs.cp(extracted[name].root,path.join(toolchain,name),{recursive:true,verbatimSymlinks:true});
    inventories.toolchain.push(...extracted[name].files.map(file=>({...file,path:`${name}/${file.path}`,
      artifact:name,member:`${extracted[name].prefix}/${file.path}`})));
  }
  const preparation={schemaVersion:1,trustScope:'source-fixture',sourceRevision:revision,
    sourceOrigin:`https://github.com/sebastian-software/renovate-config/commit/${revision}`,
    attestationOrigin:'https://source-fixture.invalid/stock/immutable',artifacts,components:inventories,
    toolchain:{nodeVersion:'24.18.0',pnpmVersion:'11.17.0',platform,nodeEntry:'node/bin/node',pnpmEntry:'pnpm/bin/pnpm.mjs',pnpmPackage:'pnpm/package.json'},
    packager:{revision,files:stockNames.map(name=>implementation[name])}};
  const provenance=path.join(root,'stock-preparation.json'),provenancePin=await writeJson(provenance,preparation);
  const sourceInventory=Object.fromEntries(sourceNames.map(name=>[name,implementation[name].sha256]));
  const selectionDocument={schemaVersion:1,trustScope:'source-fixture',provenanceSha256:provenancePin,verifierRevision:revision,
    verifierFiles:Object.fromEntries(stockNames.map(name=>[name,implementation[name].sha256])),sourceInventory,
    publicationAttestation:{trustScope:'source-fixture',provenanceSha256:provenancePin,sourceRevision:revision,
      verifierRevision:revision,sourceInventorySha256:hash(bytes(sourceInventory)),immutableOrigin:preparation.attestationOrigin}};
  const selection=path.join(root,'stock-selection.json'),selectionPin=await writeJson(selection,selectionDocument);
  const module=await import(pathToFileURL(path.join(sourceRoot,'scripts/vitest-release/package.mjs')));
  const options={provenance,'provenance-sha256':provenancePin,selection,'selection-sha256':selectionPin,
    'source-root':sourceRoot,'artifact-root':artifactRoot,'checker-root':path.join(layouts,'checker'),
    'helper-root':path.join(layouts,'helper'),'toolchain-root':toolchain,output:path.join(root,'stock'),sourceFixture:true};
  const built=await module.packageRelease('build',options); assert.equal(built.productionEligible,false);
  const receiptBytes=await fs.readFile(path.join(options.output,'release.json')),receipt=JSON.parse(receiptBytes);
  assert.equal(receipt.productionEligible,false);assert.equal(receipt.trustScope,'source-fixture');
  assert.equal(receipt.packager.revision,revision);
  assert.equal(receipt.directoryAncestry,process.platform==='linux'?'held-directory-fd':'fixture-unverified-pathname');
  selectionDocument.releaseSha256=hash(receiptBytes);const finalSelection=path.join(root,'stock-final-selection.json');
  const finalSelectionPin=await writeJson(finalSelection,selectionDocument);
  const selectedOptions={...options,selection:finalSelection,'selection-sha256':finalSelectionPin};
  await module.packageRelease('finalize',selectedOptions); await module.packageRelease('verify',selectedOptions);
  assert.deepEqual(await fs.readFile(path.join(options.output,'release.json')),receiptBytes);
  return {root,sourceRoot,revision,implementation,nativeNames,issuerNames,extracted,artifactRoot,preparation,provenancePin,
    selectionDocument,finalSelectionPin,options:selectedOptions,module,receipt,receiptBytes};
}

export async function verifyDelegationSource(archive, originalRoot) {
  const archiveBytes=await fs.readFile(archive);
  assert.equal(hash(archiveBytes),'644eb5079654e87dae59a07e62d7f098162b9ce58f06077328b5ddefca1c8541');
  const bundle=execFileSync('/usr/bin/tar',['-xOf',archive,'package/dist/pnpm.mjs'],{maxBuffer:32_000_000});
  const originalBundleSha256='228451e6383cf4df0700fc19b37aba1a25e6540e62fbca70ca2d76b719a4d883';
  assert.equal(hash(bundle),originalBundleSha256);
  if(originalRoot)assert.deepEqual(bundle,await fs.readFile(path.join(originalRoot,'dist/pnpm.mjs')));
  const source=bundle.toString('utf8'),anchors=[
    ['functionOffset','async function switchCliVersion(config2, context) {'],
    ['directReturnOffset','  if (!persistLockfile && pm2.version === packageManager.version)\n    return;'],
    ['resolvedReturnOffset','  if (pmVersion === packageManager.version) {\n    await storeToUse?.ctrl.close();\n    return;\n  }'],
    ['spawnOffset','  const { status, signal, error } = import_cross_spawn4.default.sync(pnpmBinPath, process.argv.slice(2), {'],
    ['functionEndOffset','\nvar import_cross_spawn4, import_semver66, VersionSwitchFail;'],
    ['dispatchOffset','    let result2 = pnpmCmds[cmd ?? "help"]('],
  ];
  const offsets=anchors.map(([key,anchor])=>{assert.equal(source.split(anchor).length,2);return [key,Buffer.byteLength(source.slice(0,source.indexOf(anchor)))];});
  assert(offsets.every((entry,index)=>index===0||offsets[index-1][1]<entry[1]),'Both original same-version returns must precede authentic switch-child spawn');
  return {originalBundleSha256,...Object.fromEntries(offsets)};
}
