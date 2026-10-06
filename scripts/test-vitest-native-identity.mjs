#!/usr/bin/env node
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { holdInterpreter } from './vitest-native/identity.mjs';
const {values}=parseArgs({options:{'child-node':{type:'string'},child:{type:'boolean'}}});
if(values.child){const held=holdInterpreter();process.stdout.write(JSON.stringify(held.identity)+'\n');process.stdin.once('data',()=>{
  process.stdout.write(JSON.stringify({unchanged:held.unchanged()})+'\n');process.exit(0);
});}else if(process.platform!=='linux'){process.stdout.write(JSON.stringify({state:'UNSUPPORTED_LOCAL_PLATFORM',linuxProcessProof:false})+'\n');}
else {
  assert(values['child-node']);const root=await fs.realpath(await fs.mkdtemp(path.join(tmpdir(),'native-identity-')));
  const original=await fs.readFile(values['child-node']),binary=path.join(root,'node');await fs.writeFile(binary,original,{mode:0o555});
  const child=spawn(binary,[fileURLToPath(import.meta.url),'--child'],{env:{PATH:'/usr/bin:/bin'},stdio:['pipe','pipe','pipe']});
  let buffered='';const nextLine=()=>new Promise(resolve=>{
    const receive=part=>{buffered+=part;const index=buffered.indexOf('\n');if(index>=0){child.stdout.off('data',receive);const line=buffered.slice(0,index);buffered=buffered.slice(index+1);resolve(JSON.parse(line));}};
    child.stdout.on('data',receive);
  });
  const first=await nextLine();assert.equal(first.path,binary);assert.equal(first.sha256,createHash('sha256').update(original).digest('hex'));
  await fs.rename(binary,binary+'.held');await fs.writeFile(binary,original,{mode:0o555});
  const recheck=nextLine();child.stdin.end('revalidate');assert.equal((await recheck).unchanged,false);
  const [code]=await once(child,'close');assert.equal(code,0);
  process.stdout.write(JSON.stringify({state:'PASSED',actualHeldExecutableReplacementDetected:true,linuxProcessProof:true,sourceFixtureOnly:true})+'\n');
}
