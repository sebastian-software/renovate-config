#!/usr/bin/env node
// Actual selected Renovate manager/execa and pnpm archive; controlled registry
// is the sole package boundary. No real home, credentials or model/forge calls.
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import { prepareNative } from './vitest-native/prepare.mjs';
import { EMPTY_SHA256, EMPTY_PNPMFILE, effectiveDataOnly, holdEmptyHook } from './vitest-native/data-only.mjs';
const {values}=parseArgs({options:{'pnpm-archive':{type:'string'},'pnpm-root':{type:'string'},'renovate-root':{type:'string'},output:{type:'string'}}});
for(const key of ['pnpm-archive','pnpm-root','renovate-root'])assert(values[key],`Missing ${key}`);
const root=values.output??await fs.mkdtemp(path.join(tmpdir(),'native-data-only-'));
if(values.output)await fs.mkdir(root);
assert.equal(JSON.parse(await fs.readFile(path.join(values['renovate-root'],'package.json'),'utf8')).version,'43.288.0');
assert.equal(JSON.parse(await fs.readFile(path.join(values['pnpm-root'],'package.json'),'utf8')).version,'11.17.0');
const source=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
async function seal(directory){for(const entry of await fs.readdir(directory,{withFileTypes:true})){const filename=path.join(directory,entry.name);if(entry.isDirectory())await seal(filename);else if(!entry.isSymbolicLink())await fs.chmod(filename,(await fs.stat(filename)).mode&0o111?0o555:0o444);}await fs.chmod(directory,0o555);}
const stock=path.join(root,'stock');await fs.cp(await fs.realpath(values['pnpm-root']),stock,{recursive:true,verbatimSymlinks:true});await seal(stock);
const receipts=path.join(root,'receipts');await fs.mkdir(receipts);
const observation=path.join(root,'observation');
const prepared=await prepareNative({archive:values['pnpm-archive'],pnpmRoot:stock,output:observation,receiptDirectory:receipts,context:{worker:'controlled-source',wrapperInvocation:'controlled-source',containerId:null,imageId:null,imageDigest:null}});
const hook=path.join(observation,'empty-pnpmfile.mjs');
assert.equal(await fs.readFile(hook,'utf8'),EMPTY_PNPMFILE);
const config={ignoreScripts:true,pnpmfile:hook,globalPnpmfile:hook};
const context={hooks:Object.fromEntries(['readPackage','beforePacking','preResolution','afterAllResolved','filterLog','updateConfig'].map(key=>[key,[]])),finders:{}};
for(const category of ['install','update','dedupe'])assert(effectiveDataOnly(category,config,context,hook));
assert(!effectiveDataOnly('dedupe',{...config,configDependencies:{'pnpm-plugin-unowned':'1'}},context,hook));
assert(!effectiveDataOnly('dedupe',{...config,configDependencies:{}},context,hook));
assert(!effectiveDataOnly('dedupe',{...config,pnpmfile:'.pnpmfile.mjs'},context,hook));
assert(!effectiveDataOnly('dedupe',{...config,globalPnpmfile:'.pnpmfile.cjs'},context,hook));
assert(!effectiveDataOnly('dedupe',{...config,tryLoadDefaultPnpmfile:false},context,hook,false,true));
assert(effectiveDataOnly('dedupe',{...config,tryLoadDefaultPnpmfile:false},context,hook,true,true));
assert(!effectiveDataOnly('dedupe',{...config,tryLoadDefaultPnpmfile:false},{...context,hooks:{}},hook,true,true));
assert(!effectiveDataOnly('dedupe',{...config,tryLoadDefaultPnpmfile:false},{...context,hooks:{updateConfig:[()=>config]}},hook,true,true));
const held=holdEmptyHook(observation,{path:'empty-pnpmfile.mjs',sha256:EMPTY_SHA256});assert(held.unchanged());held.close();
// Original archive and derived archive run IDENTICAL trusted hook configuration.
const bin=path.join(root,'bin');await fs.mkdir(bin);await fs.symlink(process.execPath,path.join(bin,'node'));await fs.symlink(path.join(stock,'bin/pnpm.mjs'),path.join(bin,'pnpm'));
function tarPackage(version){const bytes=Buffer.from(JSON.stringify({name:'native-fixture',version,scripts:{preinstall:'node -e "require(\'fs\').writeFileSync(\'dependency-script-executed\',\'bad\')"'}})+'\n');const header=Buffer.alloc(512);header.write('package/package.json');header.write('0000644\0',100);header.write('0000000\0',108);header.write('0000000\0',116);header.write(bytes.length.toString(8).padStart(11,'0')+'\0',124);header.write('00000000000\0',136);header.fill(32,148,156);header.write('0',156);header.write('ustar\0',257);header.write('00',263);header.write([...header].reduce((a,b)=>a+b,0).toString(8).padStart(6,'0')+'\0 ',148);return gzipSync(Buffer.concat([header,bytes,Buffer.alloc((512-bytes.length%512)%512),Buffer.alloc(1024)]));}
const archives=Object.fromEntries(['1.0.0','1.0.1'].map(version=>[version,tarPackage(version)]));
let origin,requests=0;
const registry=createServer((request,response)=>{requests++;const url=new URL(request.url,origin);if(url.pathname==='/native-fixture'){response.setHeader('content-type','application/json');response.end(JSON.stringify({name:'native-fixture','dist-tags':{latest:'1.0.1'},versions:Object.fromEntries(Object.entries(archives).map(([version,bytes])=>[version,{name:'native-fixture',version,dist:{tarball:`${origin}/native-fixture/-/native-fixture-${version}.tgz`,integrity:'sha512-'+createHash('sha512').update(bytes).digest('base64')}}]))}));}else{const match=/native-fixture-(1\.0\.[01])\.tgz$/.exec(url.pathname);if(match)response.end(archives[match[1]]);else{response.statusCode=404;response.end();}}});
await new Promise(resolve=>registry.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${registry.address().port}`;
async function workspace(name,version='1.0.1'){const directory=path.join(root,name);await fs.mkdir(directory);await fs.writeFile(path.join(directory,'package.json'),JSON.stringify({name:'profile-fixture',version:'1.0.0',packageManager:'pnpm@11.17.0',dependencies:{'native-fixture':version},scripts:{preinstall:'node -e "require(\'fs\').writeFileSync(\'script-executed\',\'bad\')"'}}));await fs.writeFile(path.join(directory,'.npmrc'),`registry=${origin}/\nfetch-retries=0\nfetch-timeout=5000\n`);await fs.writeFile(path.join(directory,'.pnpmfile.mjs'),"import fs from 'node:fs'; fs.writeFileSync('hook-executed','native-hook'); export const hooks={readPackage:p=>p};\n");await fs.writeFile(path.join(directory,'.pnpmfile.cjs'),"require('node:fs').writeFileSync('hook-executed','native-hook'); module.exports={hooks:{readPackage:p=>p}};\n");await fs.writeFile(path.join(directory,'pnpm-workspace.yaml'),"pnpmfile: .pnpmfile.cjs\nglobalPnpmfile: .pnpmfile.cjs\nignoreScripts: false\n");return directory;}
async function run(directory,category,observed,profile=true){const home=path.join(directory,'home');await fs.mkdir(home,{recursive:true});const env={PATH:`${bin}:/usr/bin:/bin`,HOME:home,XDG_CONFIG_HOME:path.join(home,'config'),XDG_CACHE_HOME:path.join(home,'cache'),CI:'true',LANG:'C',VITEST_NATIVE_PROFILE_SHA256:prepared.profileSha256,NODE_OPTIONS:observed?`--import=${observation}/loader.mjs`:''};const child=spawn(process.execPath,[path.join(source,'scripts/test-vitest-native-runner.mjs'),'--root',directory,'--renovate',values['renovate-root'],'--bin',bin,'--category',category,'--profile-sha256',prepared.profileSha256,...profile?['--profile-root',observation]:observed?['--unprofiled']:[]],{env,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',part=>{stdout+=part;if(stdout.length>1048576)child.kill('SIGKILL');});child.stderr.on('data',part=>{stderr+=part;if(stderr.length>1048576)child.kill('SIGKILL');});const timer=setTimeout(()=>child.kill('SIGKILL'),45000);return new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>{clearTimeout(timer);resolve({code,signal,stdout,stderr});});});}
async function noScriptMarkers(directory){for(const entry of await fs.readdir(directory,{withFileTypes:true})){assert(!['script-executed','dependency-script-executed','hook-executed'].includes(entry.name),`Executable marker in ${directory}`);if(entry.isDirectory())await noScriptMarkers(path.join(directory,entry.name));}}
const results=[];
try {
 for(const category of ['install','update','dedupe']) {
  const dirs=await Promise.all(['original','derived'].map(flavour=>workspace(`${category}-${flavour}`,category==='install'?'1.0.1':'1.0.0')));
  if(category!=='install')for(let i=0;i<2;i++){const initialized=await run(dirs[i],'install',i===1);assert.equal(initialized.code,0,initialized.stderr);if(category==='update'){const manifest=JSON.parse(await fs.readFile(path.join(dirs[i],'package.json'),'utf8'));manifest.dependencies['native-fixture']='1.0.1';await fs.writeFile(path.join(dirs[i],'package.json'),JSON.stringify(manifest));}}
  const outcomes=[];for(let i=0;i<2;i++){const outcome=await run(dirs[i],category,i===1);assert.equal(outcome.code,0,outcome.stderr);outcomes.push({code:outcome.code,signal:outcome.signal});await noScriptMarkers(dirs[i]);for(const marker of ['hook-executed','script-executed','dependency-script-executed'])await assert.rejects(fs.lstat(path.join(dirs[i],marker)),{code:'ENOENT'});}
  assert.deepEqual(outcomes[0],outcomes[1]);assert.deepEqual(await fs.readFile(path.join(dirs[0],'pnpm-lock.yaml')),await fs.readFile(path.join(dirs[1],'pnpm-lock.yaml')));
  results.push({category,originalDerivedLockAndOutcomeEquivalent:true,defaultAndGlobalPrHookSuppressed:true});
 }
 const control=await workspace('unprofiled-native-hook','1.0.0');assert.equal((await run(control,'install',false,false)).code,0);assert.equal((await run(control,'dedupe',false,false)).code,0);assert.equal(await fs.readFile(path.join(control,'hook-executed'),'utf8'),'native-hook');
 const unsupported=await workspace('instrumented-unprofiled-hook','1.0.0');assert.equal((await run(unsupported,'install',false,false)).code,0);assert.equal((await run(unsupported,'dedupe',true,false)).code,0);assert.equal(await fs.readFile(path.join(unsupported,'hook-executed'),'utf8'),'native-hook');
 const collected=await Promise.all((await fs.readdir(receipts)).filter(name=>name.endsWith('.json')).map(async name=>JSON.parse(await fs.readFile(path.join(receipts,name),'utf8'))));
 assert(collected.every(receipt=>!receipt.completed||process.platform==='linux'));
 if(process.platform==='linux'){for(const category of ['install','update','dedupe'])assert(collected.some(receipt=>receipt.completed&&receipt.events.some(event=>event.state==='dispatch'&&event.category===category)));assert(collected.some(receipt=>receipt.state==='unsupported'&&receipt.events.some(event=>event.reason==='non-data-only-lifecycle')));}
 const ancestry=path.join(root,'observation-link');await fs.symlink(observation,ancestry);assert.throws(()=>holdEmptyHook(ancestry,{path:'empty-pnpmfile.mjs',sha256:EMPTY_SHA256}),/ancestry/);
 const lifetime=holdEmptyHook(observation,{path:'empty-pnpmfile.mjs',sha256:EMPTY_SHA256});
 // Held original authority rejects modified bytes and substituted ancestry.
 await fs.chmod(observation,0o755);await fs.chmod(hook,0o644);await fs.writeFile(hook,'export const hooks={};\n');await fs.chmod(hook,0o444);await fs.chmod(observation,0o555);assert(!lifetime.unchanged());lifetime.close();assert.throws(()=>holdEmptyHook(observation,{path:'empty-pnpmfile.mjs',sha256:EMPTY_SHA256}),/changed/);
 const summary={state:'PASSED',categories:results,unprofiledNativeHookExecuted:true,instrumentedUnprofiledHookStillExecutesUnsupported:true,completeInstallUpdateDedupeCoverage:true,effectiveConfigNegativeCases:7,heldHookTamperRejected:true,heldHookLifetimeAndAncestryTamperRejected:true,registryRequests:requests,actualRenovate:'43.288.0',actualPnpm:'11.17.0',parentNode:process.versions.node,linuxDispatchEvidence:process.platform==='linux',linuxProcessProof:false,productionEligible:false,output:root};await fs.writeFile(path.join(root,'summary.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary));
}finally{registry.closeAllConnections();await new Promise(resolve=>registry.close(resolve));}
