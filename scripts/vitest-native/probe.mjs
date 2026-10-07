import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { holdInterpreter, verifyCli } from './identity.mjs';
import { holdEmptyHook, effectiveDataOnly } from './data-only.mjs';
import { digest } from './transform.mjs';

export function createProbe(profile,url,derivedSha256) {
  let interpreter, closure, emptyHook, current, hookLoaded=false, unsupported=false, dispatched=false, failure=false;
  let channel={};try{channel=JSON.parse(process.env.VITEST_NATIVE_CHANNEL ?? '{}');}catch{}
  const root=path.dirname(path.dirname(fileURLToPath(url)));
  function emit(event) {
    if(failure)return;
    try {
      const bytes=Buffer.from(JSON.stringify({schemaVersion:1,invocation:channel.invocation,nonce:channel.nonce,pid:process.pid,...event})+'\n');
      if(bytes.length>8192)throw Error('Bounded observation exceeded');
      fs.writeSync(3,bytes);
    }catch{failure=true;}
  }
  function reject(reason){if(!unsupported){unsupported=true;emit({state:'unsupported',reason});}}
  try {
    if(!/^[a-f0-9]{32}$/.test(channel.invocation)||!/^[a-f0-9]{64}$/.test(channel.nonce))throw Error('Uncorrelated invocation');
    if(process.execArgv.some(argument=>!/^--max-old-space-size=\d{1,6}$/.test(argument)))throw Error('Unowned interpreter preload');
    if(profile.dataOnlyProfile)emptyHook=holdEmptyHook(profile.dataOnlyRoot,profile.dataOnlyProfile);
    interpreter=holdInterpreter();
    closure=verifyCli(root,profile.pnpmFiles);
    const entry=fs.realpathSync(process.argv[1]);
    if(entry!==path.join(root,'bin/pnpm.mjs'))throw Error('Unowned CLI entry');
    emit({state:'bootstrap',interpreter:interpreter.identity,pnpm:{path:entry,sha256:digest(fs.readFileSync(entry)),version:profile.pnpmVersion,originalBundleSha256:profile.originalBundleSha256,derivedBundleSha256:derivedSha256,transformRevision:profile.transformRevision}});
  }catch{reject('unowned-or-unobservable-runtime');}
  function dataOnly(cmd,config,context,dispatch=false) {
    if(profile.dataOnlyProfile)return Boolean(emptyHook?.unchanged())&&effectiveDataOnly(cmd,config,context,emptyHook.filename,hookLoaded,dispatch);
    return ['install','update','dedupe'].includes(cmd)&&config.ignoreScripts===true&&config.ignorePnpmfile===true&&
      Object.keys(config.configDependencies??{}).length===0;
  }
  const probe={hookLoaded(){hookLoaded=true;},hookRejected(){reject('non-data-only-lifecycle');},delegation(){reject('unowned-delegation');},beforeHooks(cmd,config,context){current={cmd,config,context};if(!dataOnly(cmd,config,context))reject('non-data-only-lifecycle');},
    dispatch(cmd,config,context,version) {
      if(unsupported)return;
      current={cmd,config,context};
      if(!dataOnly(cmd,config,context,true)||version!==profile.pnpmVersion||!interpreter.unchanged()){reject('changed-or-unsupported-dispatch');return;}
      if(dispatched){reject('ambiguous-dispatch');return;}
      dispatched=true;emit({state:'dispatch',category:cmd,interpreter:interpreter.identity});
    }};
  process.once('exit',code=>{
    try {
      if(!unsupported&&current&&!dataOnly(current.cmd,current.config,current.context,true))reject('non-data-only-lifecycle');
      if(!unsupported){const finalClosure=verifyCli(root,profile.pnpmFiles);finalClosure.close();}
    }catch{reject('changed-cli-closure');}
    try{if(!unsupported)emit({state:'process-exit',dispatched,exitCode:code,interpreterUnchanged:interpreter?.unchanged()===true});}catch{}
    try{emptyHook?.close();}catch{}
    try{closure?.close();}catch{}
    try{if(interpreter)fs.closeSync(interpreter.fd);}catch{}
  });
  return Object.freeze(probe);
}
