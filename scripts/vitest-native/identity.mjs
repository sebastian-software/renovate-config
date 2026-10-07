import * as fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const limit = 268_435_456;
const equal = (a,b) => ['dev','ino','size','mtimeNs','ctimeNs','mode'].every(key => a[key] === b[key]);
export function hashFd(fd) {
  const before=fs.fstatSync(fd,{bigint:true});
  if (!before.isFile() || before.size > BigInt(limit)) throw Error('Unsupported executable size');
  const hash=createHash('sha256'), buffer=Buffer.alloc(65536);
  let position=0, count;
  while ((count=fs.readSync(fd,buffer,0,buffer.length,position))) {
    position+=count; if(position>limit) throw Error('Executable grew beyond budget');
    hash.update(buffer.subarray(0,count));
  }
  if(!equal(before,fs.fstatSync(fd,{bigint:true}))) throw Error('Executable changed');
  return hash.digest('hex');
}
export function holdInterpreter() {
  if(process.platform!=='linux') throw Error('Actual interpreter observation requires Linux procfs');
  const resolved=fs.readlinkSync('/proc/self/exe');
  if(resolved.endsWith(' (deleted)')) throw Error('Executing interpreter was replaced');
  const fd=fs.openSync('/proc/self/exe',fs.constants.O_RDONLY);
  try {
    const stat=fs.fstatSync(fd,{bigint:true});
    const sha256=hashFd(fd);
    return { fd, identity:{path:resolved,sha256,version:process.versions.node}, unchanged() {
      try {return equal(stat,fs.statSync(resolved,{bigint:true})) && hashFd(fd)===sha256 && fs.readlinkSync('/proc/self/exe')===resolved;}
      catch {return false;}
    }};
  }catch(error){fs.closeSync(fd);throw error;}
}
export function verifyCli(root,expected) {
  if(process.platform!=='linux') throw Error('CLI closure requires Linux held-directory FDs');
  const actual=[], handles=[];
  let total=0,entries=0;
  function walk(filename,prefix='') {
    const fd=fs.openSync(filename,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);
    handles.push(fd);
    const stat=fs.fstatSync(fd);
    if(stat.mode&0o222) throw Error('CLI directory is writable');
    const directory=`/proc/self/fd/${fd}`;
    for(const name of fs.readdirSync(directory).sort()) {
      if(++entries>20000)throw Error('CLI entry budget exceeded');
      const relative=prefix?`${prefix}/${name}`:name, file=path.join(directory,name), leaf=fs.lstatSync(file);
      if(leaf.isDirectory()){walk(file,relative);continue;}
      if(leaf.isSymbolicLink()){
        const target=fs.readlinkSync(file), resolved=fs.realpathSync(file);
        if(path.isAbsolute(target)||!resolved.startsWith(`${root}/`))throw Error('CLI link escapes');
        actual.push({path:relative,type:'symlink',target});continue;
      }
      if(!leaf.isFile()||(leaf.mode&0o222))throw Error('CLI leaf is unsupported or writable');
      total+=leaf.size;if(total>536870912)throw Error('CLI byte budget exceeded');
      const input=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
      try{actual.push({path:relative,type:'file',sha256:hashFd(input)});}finally{fs.closeSync(input);}
    }
  }
  try {
    if(fs.realpathSync(root)!==root)throw Error('CLI root traverses links');
    walk(root);
    const pinned=new Map(expected.map(file=>[file.path,file]));
    if(actual.length!==pinned.size||pinned.size!==expected.length)throw Error('CLI closure differs');
    for(const file of actual){const original=pinned.get(file.path);if(!original||Object.keys(file).some(key=>file[key]!==original[key]))throw Error('CLI closure differs');}
    // Retain every opened directory until completion. No fallback pathname tree
    // can acquire authority by moving underneath an already observed process.
    return { close(){for(const fd of handles)fs.closeSync(fd);} };
  }catch(error){for(const fd of handles)fs.closeSync(fd);throw error;}
}
