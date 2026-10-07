#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { prepareNative } from './vitest-native/prepare.mjs';
import { readFile } from 'node:fs/promises';
const {values}=parseArgs({options:{archive:{type:'string'},'pnpm-root':{type:'string'},output:{type:'string'},
  provenance:{type:'string'},'provenance-sha256':{type:'string'},'source-root':{type:'string'},
  'receipt-directory':{type:'string'},context:{type:'string'},'context-file':{type:'string'},help:{type:'boolean'}}});
if(values.help)process.stdout.write('Usage: node scripts/vitest-native-prepare.mjs --archive /owned/pnpm-11.17.0.tgz --pnpm-root /owned/pnpm --output /new/instrumentation --receipt-directory /owned/receipts --context /owned/context.json [--context-file /runtime/context.json] [--provenance /selected/preparation.json --provenance-sha256 INDEPENDENT_PIN --source-root /selected/source]\nAuthenticate the original full pnpm 11.17.0 distribution and exact containing Git implementation bytes, then freeze the distinct derived dist/pnpm.mjs inventory and read-only loader profile before qualification. Selected provenance requires all three provenance/source flags and emits a real transformRevision while productionEligible stays false; without provenance it stays a false/null candidate. The original bootstrap is unchanged. Issuance cannot edit profile flags, hashes or inventories. Current authority requires receipt-directory /opt/renovate-native-receipts and context-file /opt/renovate-native-context/context.json. Complete worker proof needs the separately reviewed Q2 Linux harness; see docs/runbooks/vitest-release.md. No installation, worker execution or deployment.\n');
else {
  try {
    for(const name of ['archive','pnpm-root','output','receipt-directory','context'])if(!values[name])throw Error('Missing preparation input');
    const result=await prepareNative({archive:values.archive,pnpmRoot:values['pnpm-root'],output:values.output,
      receiptDirectory:values['receipt-directory'],context:JSON.parse(await readFile(values.context,'utf8')),contextFile:values['context-file']??null,provenance:values.provenance??null,
      provenanceSha256:values['provenance-sha256']??null,sourceRoot:values['source-root']??null});
    process.stdout.write(JSON.stringify(result)+'\n');
  }catch{process.stderr.write('Native observation preparation failed: unsupported or unauthenticated input\n');process.exitCode=1;}
}
