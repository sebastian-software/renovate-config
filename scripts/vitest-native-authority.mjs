#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { issueAuthority, verifyIssuedAuthority } from './vitest-native/authority.mjs';
const names=['selection','selection-sha256','provenance','profile','source-root','evidence-root','stock-provenance',
  'stock-selection','stock-root','artifact-root','checker-root','helper-root','toolchain-root','observation-root',
  'output','authority','authority-sha256'];
try {
  const {values,positionals}=parseArgs({options:{...Object.fromEntries(names.map(name=>[name,{type:'string'}])),help:{type:'boolean'}},allowPositionals:true});
  if(values.help) {
    process.stdout.write('Usage: node scripts/vitest-native-authority.mjs issue|verify --selection FILE --selection-sha256 INDEPENDENT_PIN --provenance FILE --profile FILE --source-root DIR --evidence-root DIR --stock-provenance FILE --stock-selection FILE --stock-root DIR --artifact-root DIR --checker-root DIR --helper-root DIR --toolchain-root DIR --observation-root DIR [issue: --output NEW_FILE] [verify: --authority FILE --authority-sha256 INDEPENDENT_PIN]\nOffline bounded evidence validation only; every preparation/profile/stock/proof/event/lock/publication/image/alias pin comes from the independently selected outside record, including containing issuer bytes. Retain six proof documents plus the complete raw phase/challenge/concrete-lock closure. Authority schema1 qualificationContractRevision2 rejects legacy/missing/mixed markers and requires paired same-version absence and expected-negative delegation evidence without fabricated dispatch/completion. Rejection invalidates evidence only; native cross_spawn continues. Authority has exactly four components and two original-image aliases. Every raw mount is one of four unique selected read-only components; all 42 lifecycle records bind the frozen derived runtime. issue exclusively creates a new mode-0444 authority file; verify reconstructs it with an outside authority pin. Positive release-owner scope is required; fixture scope is unavailable at this entry. URLs/self hashes/booleans are not execution authority. No worker execution, publication or profile mutation. Complete worker proof needs the separately reviewed Q2 Linux harness; see docs/runbooks/vitest-release.md.\n');
  } else {
  if(positionals.length!==1||!['issue','verify'].includes(positionals[0])) throw Error('Choose issue or verify');
  const options=Object.fromEntries(Object.entries(values).map(([name,value])=>[name.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase()),value]));
  options.componentRoots=Object.fromEntries(['checker','helper','toolchain','observation'].map(name=>[name,values[`${name}-root`]]));
  const result=await(positionals[0]==='issue'?issueAuthority(options):verifyIssuedAuthority(options));
  process.stdout.write(JSON.stringify(result)+'\n');
  }
} catch {
  process.stderr.write('Native authority rejected: missing independent selection or incomplete bounded evidence\n');process.exitCode=1;
}
