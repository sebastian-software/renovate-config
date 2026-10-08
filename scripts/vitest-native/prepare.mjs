import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { archiveMembers } from '../vitest-release/archive.mjs';
import { authenticateImplementation, readPinnedJson, requireValue, budgets, compareInventory, consumerFiles, inventory, jsonBytes, realDirectory, sealDirectories, sha256 } from '../vitest-release/files.mjs';
import { EMPTY_PNPMFILE, EMPTY_SHA256 } from './data-only.mjs';
import { digest, ORIGINAL_PNPM_ARCHIVE, ORIGINAL_PNPM_BUNDLE, transformPnpm } from './transform.mjs';

const owned=['transform.mjs','identity.mjs','probe.mjs','collector.mjs','loader.mjs','runtime.mjs','data-only.mjs'];
export const RENOVATE_SEAMS={
  manager:{path:'/dist/modules/manager/npm/post-update/pnpm.js',sha256:'fc5ee0f3be6568b35a6478aed55b71869d74adfac7f955a011fe8618a4a89401'},
  common:{path:'/dist/util/exec/common.js',sha256:'5a863ea709d9b934f780cddcabb6ed10985c69dc6bdc26226f4a2b35d67ea587'},
  branch:{path:'/dist/workers/repository/update/branch/index.js',sha256:'998ac391a3441ebe2e2c6d583875190179c8d1578121d555b219943b7ad1da44'},
};
// Preparation freezes authenticated containing implementation and original/derived
// inventories before qualification. Legacy unselected calls remain candidates.
export async function prepareNative({archive,pnpmRoot,output,receiptDirectory,context,contextFile=null,provenance=null,provenanceSha256=null,sourceRoot=null}) {
  requireValue(path.isAbsolute(output),'Absolute new preparation output required');
  await realDirectory(path.dirname(output));
  let selected=null;
  if (provenance || provenanceSha256 || sourceRoot) {
    selected=(await readPinnedJson(provenance,provenanceSha256)).document;
    requireValue(selected.schemaVersion===1 && ['release-owner','source-fixture'].includes(selected.trustScope) &&
      /^[a-f0-9]{40}$/.test(selected.sourceRevision) &&
      selected.sourceOrigin===`https://github.com/sebastian-software/renovate-config/commit/${selected.sourceRevision}` &&
      /^[a-f0-9]{40}$/.test(selected.transform?.revision), 'Unsupported native preparation selection');
    const originalSelection={name:'pnpm',version:'11.17.0',
      origin:'https://registry.npmjs.org/pnpm/-/pnpm-11.17.0.tgz',archiveSha256:ORIGINAL_PNPM_ARCHIVE,bundleSha256:ORIGINAL_PNPM_BUNDLE};
    requireValue(selected.original && Object.keys(selected.original).sort().join(',')===Object.keys(originalSelection).sort().join(',') &&
      Object.entries(originalSelection).every(([key,value])=>selected.original[key]===value), 'Unsupported original distribution selection');
    const executingRoot=fileURLToPath(new URL('../../',import.meta.url)).replace(/\/$/,'');
    const names=['scripts/vitest-native-prepare.mjs',
      ...(await fs.readdir(fileURLToPath(new URL('./',import.meta.url)))).filter(name=>name.endsWith('.mjs'))
        .map(name=>`scripts/vitest-native/${name}`),
      'scripts/vitest-release/archive.mjs','scripts/vitest-release/files.mjs'].sort();
    await authenticateImplementation(sourceRoot,executingRoot,selected.transform,names);
    await authenticateImplementation(sourceRoot,sourceRoot,{revision:selected.sourceRevision,files:[]},[]);
  }
  const members=await archiveMembers(archive,ORIGINAL_PNPM_ARCHIVE);
  const expected=[...members].filter(([,member])=>member.type!=='directory').map(([name,member])=>
    member.type==='symlink'?{path:name.slice(8),type:'symlink',target:member.target}:{path:name.slice(8),...member})
    .sort((a,b)=>a.path.localeCompare(b.path,'en'));
  const actual=await inventory(pnpmRoot,budgets.toolchain);
  compareInventory(actual,expected);
  const original=await fs.readFile(path.join(pnpmRoot,'dist/pnpm.mjs'));
  const derived=transformPnpm(original);
  await fs.mkdir(output);
  const files=[];
  for(const name of owned) {
    const bytes=await fs.readFile(fileURLToPath(new URL(name,import.meta.url)));
    if(selected) requireValue(selected.transform.files.find(file=>file.path===`scripts/vitest-native/${name}`)?.sha256===sha256(bytes),
      'Selected instrumentation changed before preparation');
    await fs.writeFile(path.join(output,name),bytes,{flag:'wx',mode:0o444});
    files.push({path:name,sha256:sha256(bytes)});
  }
  await fs.writeFile(path.join(output,'empty-pnpmfile.mjs'),EMPTY_PNPMFILE,{flag:'wx',mode:0o444});
  files.push({path:'empty-pnpmfile.mjs',sha256:EMPTY_SHA256});
  await fs.writeFile(path.join(output,'derived-pnpm.mjs'),derived,{flag:'wx',mode:0o444});
  const derivedFiles=consumerFiles(expected).map(file=>file.path==='dist/pnpm.mjs'?{...file,sha256:digest(derived)}:file);
  const profile={schemaVersion:1,provenanceClass:selected?'authenticated-preparation':'unpublished-candidate',productionEligible:false,
    originalArchiveSha256:ORIGINAL_PNPM_ARCHIVE,originalBundleSha256:ORIGINAL_PNPM_BUNDLE,
    derivedBundleSha256:digest(derived),transformRevision:selected?.transform.revision??null,transformFiles:files,
    ...(selected?{sourceRevision:selected.sourceRevision,trustScope:selected.trustScope,preparationSha256:provenanceSha256,
      containingTransform:selected.transform}:{}),
    pnpmVersion:'11.17.0',pnpmFiles:consumerFiles(expected),derivedFiles,instrumentationFiles:files,
    dataOnlyProfile:{path:'empty-pnpmfile.mjs',sha256:EMPTY_SHA256,configPrecedence:'pnpm-11.17-env-after-workspace',configDependencies:'absent'},
    renovateSeams:RENOVATE_SEAMS,receiptDirectory,context,contextFile};
  const bytes=jsonBytes(profile);
  await fs.writeFile(path.join(output,'profile.json'),bytes,{flag:'wx',mode:0o444});
  await sealDirectories(output);
  return {profileSha256:sha256(bytes),originalArchiveSha256:ORIGINAL_PNPM_ARCHIVE,originalBundleSha256:ORIGINAL_PNPM_BUNDLE,
    derivedBundleSha256:digest(derived),originalLeaves:expected.length,derivedLeaves:derivedFiles.length,
    transformRevision:selected?.transform.revision??null,productionEligible:false};
}
