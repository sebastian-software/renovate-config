import * as fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { holdInterpreter } from './identity.mjs';
const hash=/^[a-f0-9]{64}$/;
const retained = [];
const reasons=new Set(['unowned-or-unobservable-runtime','non-data-only-lifecycle','changed-or-unsupported-dispatch','ambiguous-dispatch','changed-cli-closure','unowned-delegation']);
function exact(value,keys) { return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>keys.includes(key)); }
function interpreter(value) {
  return exact(value,['path','sha256','version'])&&typeof value.path==='string'&&path.isAbsolute(value.path)&&value.path.length<=1024&&!/[\x00-\x1f]/.test(value.path)&&hash.test(value.sha256)&&/^24\.\d+\.\d+$/.test(value.version);
}
function eventValid(event) {
  if(!exact(event,['schemaVersion','invocation','nonce','pid','state','reason','interpreter','pnpm','category','dispatched','exitCode','interpreterUnchanged']))return false;
  if(event.state==='unsupported')return reasons.has(event.reason)&&Object.keys(event).length===6;
  if(event.state==='dispatch')return ['install','update','dedupe'].includes(event.category)&&interpreter(event.interpreter)&&Object.keys(event).length===7;
  if(event.state==='process-exit')return typeof event.dispatched==='boolean'&&typeof event.interpreterUnchanged==='boolean'&&Number.isInteger(event.exitCode)&&event.exitCode>=0&&event.exitCode<=255&&Object.keys(event).length===8;
  const pnpm=event.pnpm;
  return event.state==='bootstrap'&&interpreter(event.interpreter)&&exact(pnpm,['path','sha256','version','originalBundleSha256','derivedBundleSha256','transformRevision'])&&typeof pnpm.path==='string'&&path.isAbsolute(pnpm.path)&&pnpm.path.length<=1024&&!/[\x00-\x1f]/.test(pnpm.path)&&hash.test(pnpm.sha256)&&pnpm.version==='11.17.0'&&hash.test(pnpm.originalBundleSha256)&&hash.test(pnpm.derivedBundleSha256)&&(pnpm.transformRevision===null||/^[a-f0-9]{40}$/.test(pnpm.transformRevision))&&Object.keys(event).length===7;
}
function inputHead(directory) {
  try {
    const head=execFileSync('/usr/bin/git',['--no-pager','--no-replace-objects','-C',directory,'rev-parse','--verify','HEAD^{commit}'],
      {encoding:'utf8',timeout:1000,stdio:['ignore','pipe','ignore'],env:{PATH:'/usr/bin:/bin',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_NO_LAZY_FETCH:'1'}}).trim();
    return /^[a-f0-9]{40}$/.test(head)?head:null;
  }catch{return null;}
}
export function nativeExeca(profile,loader,execa,command,args,options) {
  let collect;
  try { collect=prepareCollection(profile,loader,options); } catch { /* Missing evidence cannot replace native execution. */ }
  // Support the actual native seam's ordinary stdio only. Preserve every
  // caller-selected stream/custom stdio option by declining instrumentation.
  if(!collect)return execa(command,args,options);
  // Execa's own synchronous spawn error is native; do not spawn a second time.
  let child;try{child=execa(command,args,collect.options);}catch(error){collect.dispose();throw error;}
  try { collect.attach(child); } catch { collect.dispose(); /* Child/result remains authoritative. */ }
  return child;
}
function prepareCollection(profile,loader,options) {
  if(!options.env?.VITEST_NATIVE_TAG||options.stdio!==undefined||[options.stdin,options.stdout,options.stderr].some(value=>value!==undefined&&!['pipe','ignore','inherit'].includes(value)))return null;
  const inherited=options.env.NODE_OPTIONS??'';
  const stripped=inherited.replaceAll(`--import=${loader}`,'').trim();
  if(stripped&&!/^(?:--max-old-space-size=\d{1,6})(?:\s+--max-old-space-size=\d{1,6})*$/.test(stripped))return null;
  const directory=profile.receiptDirectory;
  if(!path.isAbsolute(directory)||fs.realpathSync(directory)!==directory||!fs.lstatSync(directory).isDirectory())return null;
  if(fs.readdirSync(directory).length>=256)return null;
  const invocation=randomBytes(16).toString('hex'),nonce=randomBytes(32).toString('hex');
  let tag={};try{tag=JSON.parse(options.env.VITEST_NATIVE_TAG);}catch{}
  const repository=typeof tag.repository==='string'&&/^[\w.-]+\/[\w.-]+$/.test(tag.repository)?tag.repository:null;
  const branch=typeof tag.branch==='string'&&tag.branch.length<=256&&!/[\x00-\x1f]/.test(tag.branch)?tag.branch:null;
  let parent;try{parent=holdInterpreter();}catch{}
  const receipt={schemaVersion:1,invocation,sourceRevision:profile.transformRevision,provenanceClass:profile.provenanceClass,
    parentInterpreter:parent?.identity??null,parentPid:process.pid,productionEligible:false,deploymentIdentityVerified:profile.contextAuthenticated===true,
    worker:profile.context.worker,wrapperInvocation:profile.context.wrapperInvocation,containerId:profile.context.containerId,
    imageId:profile.context.imageId,imageDigest:profile.context.imageDigest,repository,branch,inputHead:inputHead(options.cwd),
    generatedPrHead:null,state:'launch',events:[],nativeExit:null,nativeSignal:null,completed:false};
  let invalid=!parent,failedWrite=false,bytes=0,pending='';
  function save() {
    try {
      const output=path.join(directory,`${invocation}.json`),temporary=path.join(directory,`${invocation}.new`);
      fs.writeFileSync(temporary,JSON.stringify(receipt)+'\n',{mode:0o600,flag:'wx'});
      fs.renameSync(temporary,output);
    }catch{failedWrite=true;}
  }
  function receive(part) {
    try {
      bytes+=part.length;if(bytes>65536){invalid=true;return;}
      pending+=part.toString('utf8');
      while(pending.includes('\n')) {
        const newline=pending.indexOf('\n'),line=pending.slice(0,newline);pending=pending.slice(newline+1);
        try {
          const event=JSON.parse(line);
          if(event.schemaVersion!==1||event.invocation!==invocation||event.nonce!==nonce||!Number.isSafeInteger(event.pid)||event.pid<=0||receipt.events.length>=16||!eventValid(event))throw Error('Invalid observation');
          if(event.state==='unsupported'||event.interpreterUnchanged===false)invalid=true;
          const {nonce:unused,...safe}=event;receipt.events.push(safe);
          receipt.state=invalid?'unsupported':event.state==='dispatch'?'dispatch':receipt.state;
          save();
        }catch{invalid=true;receipt.state='unsupported';save();}
      }
    }catch{invalid=true;}
  }
  save();
  const {stdin,stdout,stderr,...rest}=options;
  return { options:{...rest,stdio:[stdin??'pipe',stdout??'pipe',stderr??'pipe','pipe'],env:{...options.env,
    ...(profile.launchProfileSha256?{VITEST_NATIVE_PROFILE_SHA256:profile.launchProfileSha256}:{}),
    ...(profile.launchAuthoritySha256?{VITEST_NATIVE_RUNTIME_AUTHORITY_SHA256:profile.launchAuthoritySha256}:{}),
    VITEST_NATIVE_CHANNEL:JSON.stringify({invocation,nonce}),NODE_OPTIONS:`${stripped} --import=${loader}`.trim()}},
    dispose(){try{if(parent)fs.closeSync(parent.fd);}catch{}},
    attach(child) {
      child.stdio[3]?.on('data',receive);
      child.stdio[3]?.on('error',()=>{invalid=true;});
      child.once('close',(code,signal)=>{
        try {
          receipt.nativeExit=code;receipt.nativeSignal=signal;
          const dispatches=receipt.events.filter(event=>event.state==='dispatch');
          const exits=receipt.events.filter(event=>event.state==='process-exit'&&event.dispatched&&event.interpreterUnchanged);
          const bootstraps=receipt.events.filter(event=>event.state==='bootstrap');
          const linked=bootstraps.length===1&&dispatches.length===1&&bootstraps[0].pid===dispatches[0].pid&&
            exits.length===1&&exits[0].pid===dispatches[0].pid&&exits[0].exitCode===code;
          receipt.completed=linked&&Boolean(parent)&&parent.unchanged()&&!invalid&&!pending&&code!==null&&!signal&&!failedWrite;
          receipt.state=receipt.completed?(repository&&branch&&receipt.inputHead?'completed':'uncorrelated'):
            invalid?'unsupported':dispatches.length?'incomplete':'absent';
          save();
          if(receipt.state==='completed'&&!failedWrite&&retained.length<256)retained.push({profile,receipt,directory});
        }catch{ /* Evidence failure only. */ }
        finally{try{if(parent)fs.closeSync(parent.fd);}catch{}}
      });
    }};
}
export function mapGeneratedHead(receipt,identity) {
  if(receipt.state!=='completed'||identity.repository!==receipt.repository||identity.branch!==receipt.branch||
    identity.inputHead!==receipt.inputHead||! /^[a-f0-9]{40}$/.test(identity.generatedPrHead))throw Error('Uncorrelated generated PR head');
  return {...receipt,generatedPrHead:identity.generatedPrHead};
}
// Called only by the authenticated Renovate with-pr branch seam. A failed
// collection/mapping write is evidence failure and cannot change the PR result.
export async function recordGeneratedHead(profile,config,pr,scm) {
  try {
    if(pr?.sourceBranch!==config.branchName||! /^[a-f0-9]{40}$/.test(pr.sha))return;
    const generatedPrHead=await scm.getBranchCommit(config.branchName);
    if(!/^[a-f0-9]{40}$/.test(generatedPrHead)||generatedPrHead!==pr.sha)return;
    for(const pending of retained.filter(item=>item.profile===profile&&
      item.receipt.repository===config.repository&&item.receipt.branch===config.branchName)) {
      const mapped=mapGeneratedHead(pending.receipt,{repository:config.repository,branch:config.branchName,
        inputHead:pending.receipt.inputHead,generatedPrHead});
      const file=path.join(pending.directory,`${mapped.invocation}.json`);
      // Reauthenticate the complete retained receipt before adding one head.
      const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
      let bytes;try{if(fs.fstatSync(fd).size>65536)continue;bytes=fs.readFileSync(fd);}finally{fs.closeSync(fd);}
      if(JSON.stringify(JSON.parse(bytes))!==JSON.stringify(pending.receipt))continue;
      const temporary=path.join(pending.directory,`${mapped.invocation}.mapped`);
      fs.writeFileSync(temporary,JSON.stringify(mapped)+'\n',{flag:'wx',mode:0o600});
      fs.renameSync(temporary,file);
      pending.receipt=mapped;
    }
  }catch{ /* Missing mapping never rewrites native/forge outcomes. */ }
}
