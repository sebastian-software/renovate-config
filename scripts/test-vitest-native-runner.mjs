// Controlled source fixture: actual Renovate manager -> util/exec -> execa.
// This runner never receives a forge token or invokes a live worker.
import { parseArgs } from 'node:util';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const {values}=parseArgs({options:{root:{type:'string'},renovate:{type:'string'},node:{type:'string'},pnpm:{type:'string'},
  bin:{type:'string'},'profile-sha256':{type:'string'},dedupe:{type:'boolean'}}});
const load=name=>import(pathToFileURL(path.join(values.renovate,'dist',name)).href);
const {init,levels}=await load('logger/index.js');await init();levels('stdout','warn');
const {GlobalConfig}=await load('config/global.js');
const {setCustomEnv}=await load('util/env.js');
GlobalConfig.set({localDir:values.root,cacheDir:path.join(values.root,'cache'),binarySource:'global',
  allowScripts:false,executionTimeout:1,exposeAllEnv:false});
setCustomEnv({PATH:`${values.bin}:${process.env.PATH}`,
  VITEST_NATIVE_PROFILE_SHA256:values['profile-sha256']??'',CI:'true',
  npm_config_userconfig:'/dev/null',npm_config_globalconfig:'/dev/null'});
const {generateLockFile}=await load('modules/manager/npm/post-update/pnpm.js');
const result=await generateLockFile('.',{}, {repository:'fixture/native',branchName:'renovate/observation',
  constraints:{pnpm:'11.17.0',node:'>=24 <25'},postUpdateOptions:values.dedupe?['pnpmDedupe']:[]},[{depName:'native-fixture',packageName:'native-fixture',newVersion:'1.0.1'}]);
process.stdout.write(JSON.stringify({error:result.error??false,lockFile:result.lockFile??null})+'\n');
if(result.error)process.exitCode=1;
