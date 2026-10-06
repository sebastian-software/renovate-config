// Controlled source fixture: actual Renovate manager -> util/exec -> execa.
// This runner never receives a forge token or invokes a live worker.
import { dataOnlyEnvironment } from './vitest-native/data-only.mjs';
import { parseArgs } from 'node:util';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const {values}=parseArgs({options:{root:{type:'string'},renovate:{type:'string'},node:{type:'string'},pnpm:{type:'string'},
  bin:{type:'string'},'profile-sha256':{type:'string'},dedupe:{type:'boolean'},category:{type:'string'},'profile-root':{type:'string'},unprofiled:{type:'boolean'}}});
const load=name=>import(pathToFileURL(path.join(values.renovate,'dist',name)).href);
const {init,levels}=await load('logger/index.js');await init();levels('stdout','warn');
const {GlobalConfig}=await load('config/global.js');
const {setCustomEnv}=await load('util/env.js');
GlobalConfig.set({localDir:values.root,cacheDir:path.join(values.root,'cache'),binarySource:'global',
  allowScripts:false,executionTimeout:1,exposeAllEnv:false});
setCustomEnv({PATH:`${values.bin}:${process.env.PATH}`,
  VITEST_NATIVE_PROFILE_SHA256:values['profile-sha256']??'',CI:'true',
  pnpm_config_userconfig:'/dev/null',pnpm_config_globalconfig:'/dev/null',
  ...(values['profile-root']?dataOnlyEnvironment(values['profile-root']):{}),
  ...(values.unprofiled?{pnpm_config_pnpmfile:'.pnpmfile.mjs',pnpm_config_global_pnpmfile:'.pnpmfile.mjs'}:{})});
const {generateLockFile}=await load('modules/manager/npm/post-update/pnpm.js');
const category=values.category??'install';
if(!['install','update','dedupe'].includes(category))throw Error('Unsupported fixture category');
const upgrades=category==='dedupe'?[]:[{depName:'native-fixture',packageName:'native-fixture',newVersion:'1.0.1',isLockfileUpdate:category==='update'}];
const result=await generateLockFile('.',{}, {repository:'fixture/native',branchName:'renovate/observation',
  constraints:{pnpm:'11.17.0',node:'>=24 <25'},postUpdateOptions:values.dedupe||category==='dedupe'?['pnpmDedupe']:[]},upgrades);
process.stdout.write(JSON.stringify({error:result.error??false,lockFile:result.lockFile??null})+'\n');
if(result.error)process.exitCode=1;
