// Exact pnpm 11.17 profile. No imports, hooks, finders or config plugins can
// acquire authority from repository-selected code. Native argv stays unchanged.
import * as fs from 'node:fs';
import path from 'node:path';
import { digest } from './transform.mjs';
import { hashFd } from './identity.mjs';
export const EMPTY_PNPMFILE = 'export {};\n';
export const EMPTY_SHA256 = digest(EMPTY_PNPMFILE);
export function dataOnlyEnvironment(root) {
  const hook=path.join(root,'empty-pnpmfile.mjs');
  return {pnpm_config_pnpmfile:hook,pnpm_config_global_pnpmfile:hook,pnpm_config_ignore_scripts:'true'};
}
const selected=(value,hook)=>value===hook||(Array.isArray(value)&&value.length===1&&value[0]===hook);
export function effectiveDataOnly(cmd,config,context,hook,loaded=false,dispatch=false) {
  if(!['install','update','dedupe'].includes(cmd)||config.ignoreScripts!==true||
    config.configDependencies!=null||!selected(config.pnpmfile,hook)||config.globalPnpmfile!==hook)return false;
  if(config.ignorePnpmfile===true)return true;
  if(dispatch&&(!loaded||config.tryLoadDefaultPnpmfile!==false))return false;
  if(!dispatch)return true;
  const allowed=['readPackage','beforePacking','preResolution','afterAllResolved','filterLog','updateConfig'];
  return context&&Object.keys(context.finders??{}).length===0&&context.hooks&&
    Object.keys(context.hooks).length===allowed.length&&Object.keys(context.hooks).every(key=>allowed.includes(key)&&Array.isArray(context.hooks[key])&&context.hooks[key].length===0);
}
export function holdEmptyHook(root,profile) {
  if(profile?.path!=='empty-pnpmfile.mjs'||profile.sha256!==EMPTY_SHA256)throw Error('Unowned empty hook');
  if(fs.realpathSync(root)!==root)throw Error('Hook ancestry traverses links');
  const directory=fs.openSync(root,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);
  let fd;
  try {
    const parent=fs.fstatSync(directory,{bigint:true});
    if(parent.mode&0o222n)throw Error('Hook directory writable');
    const filename=path.join(root,profile.path);
    fd=fs.openSync(process.platform==='linux'?`/proc/self/fd/${directory}/${profile.path}`:filename,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
    const stat=fs.fstatSync(fd,{bigint:true});
    if(stat.mode&0o222n||hashFd(fd)!==EMPTY_SHA256)throw Error('Hook bytes writable or changed');
    const same=(a,b)=>['dev','ino','mode','size','ctimeNs','mtimeNs'].every(key=>a[key]===b[key]);
    return {filename,unchanged(){try{return same(parent,fs.statSync(root,{bigint:true}))&&same(stat,fs.statSync(filename,{bigint:true}))&&hashFd(fd)===EMPTY_SHA256;}catch{return false;}},
      close(){fs.closeSync(fd);fs.closeSync(directory);}};
  }catch(error){if(fd!==undefined)fs.closeSync(fd);fs.closeSync(directory);throw error;}
}
