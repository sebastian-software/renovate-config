#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { prepareNative } from './vitest-native/prepare.mjs';
import { readFile } from 'node:fs/promises';
const {values}=parseArgs({options:{archive:{type:'string'},'pnpm-root':{type:'string'},output:{type:'string'},
  'receipt-directory':{type:'string'},context:{type:'string'},'context-file':{type:'string'},help:{type:'boolean'}}});
if(values.help)process.stdout.write('Usage: node scripts/vitest-native-prepare.mjs --archive /owned/pnpm-11.17.0.tgz --pnpm-root /owned/pnpm --output /new/instrumentation --receipt-directory /owned/receipts --context /owned/context.json [--context-file /runtime/context.json]\nCandidate only: authenticate original full CLI, emit derived full inventory and immutable loader profile. No installation, execution, deployment or invented containing revision.\n');
else {
  try {
    for(const name of ['archive','pnpm-root','output','receipt-directory','context'])if(!values[name])throw Error('Missing preparation input');
    const result=await prepareNative({archive:values.archive,pnpmRoot:values['pnpm-root'],output:values.output,
      receiptDirectory:values['receipt-directory'],context:JSON.parse(await readFile(values.context,'utf8')),contextFile:values['context-file']??null});
    process.stdout.write(JSON.stringify(result)+'\n');
  }catch{process.stderr.write('Native observation preparation failed: unsupported or unauthenticated input\n');process.exitCode=1;}
}
