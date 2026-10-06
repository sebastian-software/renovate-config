import { registerHooks } from 'node:module';
import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest, transformPnpm, transformRenovate, ORIGINAL_PNPM_BUNDLE } from './transform.mjs';
import { createProbe } from './probe.mjs';
import { nativeExeca } from './collector.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
let profile;
try {
  const filename=path.join(root,'profile.json'),bytes=fs.readFileSync(filename);
  if(bytes.length>2097152||digest(bytes)!==process.env.VITEST_NATIVE_PROFILE_SHA256||fs.realpathSync(filename)!==filename)throw Error('Unowned observation profile');
  profile=JSON.parse(bytes);
  if(profile.schemaVersion!==1||profile.pnpmVersion!=='11.17.0'||profile.originalBundleSha256!==ORIGINAL_PNPM_BUNDLE||
    !Array.isArray(profile.pnpmFiles)||profile.pnpmFiles.length>10000)throw Error('Unsupported observation profile');
  for(const file of profile.instrumentationFiles) {
    if(!/^[a-z-]+\.mjs$/.test(file.path))throw Error('Invalid observation closure');
    const absolute=path.join(root,file.path),stat=fs.lstatSync(absolute);
    if(!stat.isFile()||(stat.mode&0o222)||digest(fs.readFileSync(absolute))!==file.sha256)throw Error('Changed observation closure');
  }
  // A fixed independent launch pin authenticates host-written context; the
  // context's own self-hash cannot establish worker/container provenance.
  profile.contextAuthenticated=false;
  const contextFile=profile.contextFile;
  if(contextFile){
    const fd=fs.openSync(contextFile,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
    try{const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.size>4096||(stat.mode&0o222))throw Error('Unowned worker context');
      const contextBytes=fs.readFileSync(fd);if(digest(contextBytes)!==process.env.VITEST_NATIVE_CONTEXT_SHA256)throw Error('Unpinned worker context');
      const supplied=JSON.parse(contextBytes);
      if(Object.keys(supplied).sort().join(',')!=='containerId,imageDigest,imageId,worker,wrapperInvocation'||
        !/^[a-z0-9-]{1,64}$/.test(supplied.worker)||!/^[a-zA-Z0-9._-]{1,128}$/.test(supplied.wrapperInvocation)||
        !/^[a-f0-9]{64}$/.test(supplied.containerId)||!/^sha256:[a-f0-9]{64}$/.test(supplied.imageId)||
        !(supplied.imageDigest===null||/^sha256:[a-f0-9]{64}$/.test(supplied.imageDigest)))throw Error('Invalid worker identity');
      profile.context=supplied;profile.contextAuthenticated=true;
    }finally{fs.closeSync(fd);}
  }
  const startup=(process.env.NODE_OPTIONS??'').replaceAll(`--import=${fileURLToPath(import.meta.url)}`,'').trim();
  if(startup&&!/^(?:--max-old-space-size=\d{1,6})(?:\s+--max-old-space-size=\d{1,6})*$/.test(startup))throw Error('Executable inherited preload');
}catch{profile=null;}
if(profile) {
  let probe;
  const slot=Symbol.for('vitest.native.observation.v1');
  Object.defineProperty(globalThis,slot,{value:Object.freeze({
    nativeExeca:(execa,command,args,options)=>nativeExeca(profile,fileURLToPath(import.meta.url),execa,command,args,options),
    delegation:()=>probe?.delegation(),beforeHooks:(...args)=>probe?.beforeHooks(...args),dispatch:(...args)=>probe?.dispatch(...args),
  }),writable:false,configurable:false});
  registerHooks({load(url,context,nextLoad) {
    const result=nextLoad(url,context);
    if(!url.startsWith('file:')||!result.source)return result;
    const filename=fileURLToPath(url),bytes=Buffer.from(result.source);
    try {
      if(filename.endsWith('/dist/pnpm.mjs')&&digest(bytes)===ORIGINAL_PNPM_BUNDLE) {
        const derived=transformPnpm(bytes);
        if(digest(derived)!==profile.derivedBundleSha256)throw Error('Changed derived observation');
        probe=createProbe(profile,url,digest(derived));
        return {...result,source:derived};
      }
      for(const [kind,seam] of Object.entries(profile.renovateSeams)) {
        if(filename.endsWith(seam.path)&&digest(bytes)===seam.sha256)return {...result,source:transformRenovate(bytes,kind,seam.sha256)};
      }
    }catch{
      // An unauthenticated source continues unchanged. Its missing trusted
      // dispatch is unsupported evidence, never an invented bootstrap success.
    }
    return result;
  }});
}
