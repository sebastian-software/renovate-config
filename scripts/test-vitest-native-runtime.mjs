#!/usr/bin/env node
// Shape/mount negatives are source checks, not production provenance or Linux execution.
import assert from 'node:assert/strict';
import { validateAuthority, readonlyMount, verifyRuntime, aliasDigest } from './vitest-native/runtime.mjs';
import { transformRenovate, digest } from './vitest-native/transform.mjs';
import * as fs from 'node:fs';
const leaf={path:'owned',type:'file',sha256:'a'.repeat(64)};
const authority={schemaVersion:1,trustScope:'source-fixture',productionEligible:false,sourceRevision:'a'.repeat(40),transformRevision:'b'.repeat(40),
  originalArchiveSha256:'c'.repeat(64),originalBundleSha256:'d'.repeat(64),derivedBundleSha256:'e'.repeat(64),
  profileSha256:'f'.repeat(64),linuxCompatibilitySha256:'1'.repeat(64),dataOnlyLifecycleSha256:'2'.repeat(64),
  imageId:'sha256:'+'3'.repeat(64),imageDigest:'sha256:'+'4'.repeat(64),attestationOrigin:'https://example.invalid/immutable-authority.json',
  components:{checker:[leaf],helper:[leaf],toolchain:[{...leaf,path:'node/bin/node'},{...leaf,path:'pnpm/owned'}],observation:[leaf]},nativeAliases:[
    {kind:'node',digestKind:'sha256-file',source:'node/bin/node',destination:'/usr/local/bin/node',sha256:leaf.sha256,originalImageSha256:leaf.sha256},
    {kind:'pnpm',digestKind:'sha256-inventory-tuples-v1',source:'pnpm',destination:'/usr/local/lib/pnpm',sha256:leaf.sha256,originalImageSha256:leaf.sha256}]};
authority.nativeAliases[1].sha256=aliasDigest(authority.nativeAliases[1],authority.components.toolchain);
authority.nativeAliases[1].originalImageSha256=authority.nativeAliases[1].sha256;
validateAuthority(authority,{sourceFixture:true});
assert.throws(()=>validateAuthority(authority));
for(const trustScope of [undefined,'anything']) assert.throws(()=>validateAuthority({...authority,productionEligible:true,trustScope}));
for(const kind of ['node','pnpm'])assert.throws(()=>validateAuthority({...authority,nativeAliases:authority.nativeAliases.map(alias=>alias.kind===kind?{...alias,sha256:'0'.repeat(64),originalImageSha256:'0'.repeat(64)}:alias)},{sourceFixture:true}));
for(const key of ['transformRevision','profileSha256','attestationOrigin','linuxCompatibilitySha256','dataOnlyLifecycleSha256'])
  assert.throws(()=>validateAuthority({...authority,[key]:null},{sourceFixture:true}));
assert.throws(()=>validateAuthority({...authority,productionEligible:true},{sourceFixture:true}));
assert.throws(()=>validateAuthority({...authority,nativeAliases:[{...authority.nativeAliases[0],originalImageSha256:'b'.repeat(64)},authority.nativeAliases[1]]},{sourceFixture:true}));
assert.throws(()=>validateAuthority({...authority,components:{...authority.components,helper:[{...leaf,path:'../escape'}]}},{sourceFixture:true}));
const ro='1 0 0:1 / / rw - overlay overlay rw\n2 1 0:2 / /opt/owned ro - none none ro';
readonlyMount('/opt/owned',ro);
assert.throws(()=>readonlyMount('/opt/missing',ro));
assert.throws(()=>readonlyMount('/opt/owned',ro+'\n3 2 0:3 / /opt/owned/sub rw - none none rw'));
if(process.platform!=='linux')assert.throws(()=>verifyRuntime('/absent','a'.repeat(64),'/absent'));
if(process.argv[2]) {
  const bytes=fs.readFileSync(process.argv[2]);
  assert.equal(digest(bytes),'998ac391a3441ebe2e2c6d583875190179c8d1578121d555b219943b7ad1da44');
  const transformed=transformRenovate(bytes,'branch',digest(bytes));
  assert(transformed.toString().includes('.generatedHead(config, pr, scm)'));
  assert.throws(()=>transformRenovate(Buffer.concat([bytes,Buffer.from('\n')]),'branch',digest(bytes)));
}
process.stdout.write(JSON.stringify({state:'PASSED',scope:'external-runtime-authority-and-real-branch-transform',linuxProcessProof:false})+'\n');
