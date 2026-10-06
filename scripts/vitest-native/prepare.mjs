import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { archiveMembers } from '../vitest-release/archive.mjs';
import { budgets, compareInventory, consumerFiles, inventory, jsonBytes, sealDirectories, sha256 } from '../vitest-release/files.mjs';
import { digest, ORIGINAL_PNPM_ARCHIVE, ORIGINAL_PNPM_BUNDLE, transformPnpm } from './transform.mjs';

const owned=['transform.mjs','identity.mjs','probe.mjs','collector.mjs','loader.mjs'];
const seams={
  manager:{path:'/dist/modules/manager/npm/post-update/pnpm.js',sha256:'fc5ee0f3be6568b35a6478aed55b71869d74adfac7f955a011fe8618a4a89401'},
  common:{path:'/dist/util/exec/common.js',sha256:'5a863ea709d9b934f780cddcabb6ed10985c69dc6bdc26226f4a2b35d67ea587'},
};
// Candidate-only preparation. Publication of a reviewed containing transform
// revision and external full-layout pin is a later owned release step.
export async function prepareNative({archive,pnpmRoot,output,receiptDirectory,context,contextFile=null}) {
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
    await fs.writeFile(path.join(output,name),bytes,{flag:'wx',mode:0o444});
    files.push({path:name,sha256:sha256(bytes)});
  }
  await fs.writeFile(path.join(output,'derived-pnpm.mjs'),derived,{flag:'wx',mode:0o444});
  const derivedFiles=consumerFiles(expected).map(file=>file.path==='dist/pnpm.mjs'?{...file,sha256:digest(derived)}:file);
  const profile={schemaVersion:1,provenanceClass:'unpublished-candidate',productionEligible:false,
    originalArchiveSha256:ORIGINAL_PNPM_ARCHIVE,originalBundleSha256:ORIGINAL_PNPM_BUNDLE,
    derivedBundleSha256:digest(derived),transformRevision:null,transformFiles:files,
    pnpmVersion:'11.17.0',pnpmFiles:consumerFiles(expected),derivedFiles,instrumentationFiles:files,
    renovateSeams:seams,receiptDirectory,context,contextFile};
  const bytes=jsonBytes(profile);
  await fs.writeFile(path.join(output,'profile.json'),bytes,{flag:'wx',mode:0o444});
  await sealDirectories(output);
  return {profileSha256:sha256(bytes),originalArchiveSha256:ORIGINAL_PNPM_ARCHIVE,originalBundleSha256:ORIGINAL_PNPM_BUNDLE,
    derivedBundleSha256:digest(derived),originalLeaves:expected.length,derivedLeaves:derivedFiles.length,
    transformRevision:null,productionEligible:false};
}
