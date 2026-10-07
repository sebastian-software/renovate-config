#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import promises from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';
import { syncBuiltinESMExports } from 'node:module';
import { archiveMembers } from './vitest-release/archive.mjs';
import { budgets, copyInventory, inventory, sha256 } from './vitest-release/files.mjs';
const root=await promises.realpath(await promises.mkdtemp(path.join(tmpdir(),'release-trust-')));
function archive(contents) {
  const header=Buffer.alloc(512);header.write('package/file');header.write('0000644\0',100);header.write('0000000\0',108);header.write('0000000\0',116);
  header.write(contents.length.toString(8).padStart(11,'0')+'\0',124);header.write('00000000000\0',136);header.fill(32,148,156);header[156]=48;header.write('ustar\0',257);header.write('00',263);
  header.write(header.reduce((sum,byte)=>sum+byte,0).toString(8).padStart(6,'0')+'\0 ',148);
  return gzipSync(Buffer.concat([header,contents,Buffer.alloc((512-contents.length%512)%512),Buffer.alloc(1024)]));
}
const pinned=archive(Buffer.from('trusted-original')),replacement=archive(Buffer.from('untrusted-replacement'));
const filename=path.join(root,'input.tgz');await promises.writeFile(filename,pinned);
const originalOpen=promises.open;let switched=false;
promises.open=async(...args)=>{
  const handle=await originalOpen(...args);
  if(args[0]===filename){const original=handle.createReadStream.bind(handle);handle.createReadStream=(...options)=>{
    // Change pathname only after the reader has retained its original inode.
    fs.renameSync(filename,filename+'.held');fs.writeFileSync(filename,replacement);switched=true;
    const stream=original(...options);return stream;
  };}
  return handle;
};syncBuiltinESMExports();
try{await assert.rejects(archiveMembers(filename,sha256(pinned)),/Opened archive changed while reading/);assert(switched);}
finally{promises.open=originalOpen;syncBuiltinESMExports();await promises.unlink(filename);await promises.rename(filename+'.held',filename);}
await assert.rejects(archiveMembers(filename,sha256(replacement)),/digest mismatch/);
const source=path.join(root,'source'),outside=path.join(root,'outside');await promises.mkdir(source);await promises.mkdir(outside);
await promises.writeFile(path.join(source,'file'),'owned');await promises.writeFile(path.join(outside,'file'),'outside');
const expected=await inventory(source,budgets.checker);
let ancestry='UNSUPPORTED_LOCAL_PLATFORM';
if(process.platform==='linux') {
  const originalRead=promises.readdir;let moved=false;
  promises.readdir=async(...args)=>{const result=await originalRead(...args);if(!moved&&String(args[0]).startsWith('/proc/self/fd/')){
    moved=true;await promises.rename(source,source+'.held');await promises.symlink(outside,source);
  }return result;};syncBuiltinESMExports();
  try{const observed=await inventory(source,budgets.checker);assert.deepEqual(observed,expected);assert(moved);}
  finally{promises.readdir=originalRead;syncBuiltinESMExports();await promises.unlink(source);await promises.rename(source+'.held',source);}
  const actualOpen=promises.open;let copyMoved=false;
  promises.open=async(...args)=>{const handle=await actualOpen(...args);if(!copyMoved&&String(args[0]).startsWith('/proc/self/fd/')&&String(args[0]).endsWith('/file')){copyMoved=true;await promises.rename(source,source+'.held');await promises.symlink(outside,source);}return handle;};syncBuiltinESMExports();
  try{const output=path.join(root,'copy');await copyInventory(source,output,expected);assert.equal(await promises.readFile(path.join(output,'file'),'utf8'),'owned');assert(copyMoved);}
  finally{promises.open=actualOpen;syncBuiltinESMExports();await promises.unlink(source);await promises.rename(source+'.held',source);}
  ancestry='PASSED';
}
process.stdout.write(JSON.stringify({state:'PASSED',archiveHeldFdDigest:true,directoryAncestry:ancestry,productionProof:false,output:root})+'\n');
