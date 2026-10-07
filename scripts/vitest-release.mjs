#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { packageRelease } from './vitest-release/package.mjs';

const help = `Usage: node scripts/vitest-release.mjs build|finalize|verify [options]

Required for all three commands:
  --provenance FILE           Independently authenticated preparation document
  --provenance-sha256 SHA256  Pin obtained through a separate trusted channel
  --artifact-root DIRECTORY  Original stock Node/pnpm/yaml/semver gzip tar archives
  --source-root DIRECTORY    Git source with exact selected revision and source bytes
  --output DIRECTORY         New bundle (build) or sealed bundle to check (finalize/verify)
Required for build:
  --checker-root DIRECTORY   Complete prepared checker layout
  --helper-root DIRECTORY    Complete prepared helper layout
  --toolchain-root DIRECTORY Complete original owned Node/pnpm layout
Production modes also require:
  --selection FILE           Outside selected selection-v1 including publication attestation
  --selection-sha256 SHA256  Independent pin of exact protected selection bytes
Optional for all three commands:
  --candidate                Unpublished candidate proof; never production eligible

Example:
  node scripts/vitest-release.mjs build --provenance /owned/preparation.json \\
    --provenance-sha256 INDEPENDENT_64_HEX_PIN --artifact-root /owned/archives \\
    --source-root /owned/source --checker-root /owned/checker \\
    --helper-root /owned/helper --toolchain-root /owned/tools --output /owned/release \\
    --selection /protected/selection.json --selection-sha256 INDEPENDENT_SELECTION_PIN

Provenance v1 contains schemaVersion, sourceRevision, sourceOrigin (exact GitHub
commit URL), attestationOrigin (HTTPS immutable locator), artifacts, components,
and toolchain. Production preparation also requires trustScope:release-owner and
packager:{revision,files:[path,type,sha256,size,executable]}. The independently
selected selection-v1 pins preparation, verifier bytes, complete source inventory
and their publication attestation. Each artifact: id, name, version, origin (official archive URL),
path (relative archive filename), sha256, memberPrefix. Exactly four stock
archives are supported: Node/pnpm 24.18.0/11.17.0 or 24.21.0/11.20.0,
yaml 2.9.1, semver 7.8.5.
toolchain: nodeVersion, pnpmVersion, platform (linux/darwin-x64/arm64), nodeEntry,
pnpmEntry, pnpmPackage. components: checker/helper/toolchain arrays of every leaf.
File: path,type:'file',sha256,size,executable,artifact,member.
Link: path,type:'symlink',target,artifact,member.
For --candidate only, attestationOrigin must be null. This explicitly identifies
an unpublished local preparation, whose computed pin is not production authority.
Source leaves use artifact:'git', member equal to their repository path. All other
leaves must match original archive members; each used package must be complete.
Generated executable wrappers/metadata and derived runtimes are unsupported.

The tool never installs, executes packaged code, downloads, or publishes. Archive
member correspondence authenticates prepared bytes; emitted manifest self hashes
are not provenance. Recensor alignment-release.json remains v1. Toolchain budgets
are separate. Candidate packager commit stays pending; production binds the exact
executing containing implementation. finalize verifies already sealed bytes
against the independently selected final receipt pin; it never edits a receipt.
Production requires positive release-owner scope and Linux /proc directory FDs.
URLs/self hashes/eligibility booleans cannot authenticate the outside selection.
The owner selects the emitted releaseSha256 in final selection without editing
sealed receipt bytes; finalize and separate verify reconstruct the same receipt.
Pure source-fixture API tests stay false eligible; no fixture CLI flag exists.
Darwin candidate output cannot prove Linux directory ancestry resistance.
See docs/runbooks/vitest-release.md for immutable preparation, qualification,
independent attestation, issuance and outside verification. Complete native worker
proof requires a separately reviewed Q2 Linux harness; these commands run none.
`;

async function main() {
  const names = ['provenance', 'provenance-sha256', 'artifact-root', 'source-root',
    'checker-root', 'helper-root', 'toolchain-root', 'output'];
  const selectionNames=['selection','selection-sha256'];
  const { values, positionals } = parseArgs({ options: {
    ...Object.fromEntries([...names,...selectionNames].map((name) => [name, { type: 'string' }])),
    help: { type: 'boolean' },
    candidate: { type: 'boolean' },
  }, allowPositionals: true, strict: true });
  if (values.help) { process.stdout.write(help); return; }
  if (positionals.length !== 1 || !['build', 'finalize', 'verify'].includes(positionals[0])) throw new Error('Choose build, finalize or verify; see --help');
  const required = names.filter((name) => positionals[0] === 'build' || !name.endsWith('-root') || ['source-root', 'artifact-root'].includes(name));
  if (!values.candidate) required.push(...selectionNames);
  for (const name of required) if (!values[name]) throw new Error(`Missing --${name}; see --help`);
  process.stdout.write(`${JSON.stringify(await packageRelease(positionals[0], values))}\n`);
}
main().catch((error) => {
  // Do not include supplied paths, archive names, or child-process output in errors.
  process.stderr.write(`Release packaging failed: ${error.name === 'ReleaseError' ? error.message : 'invalid input or unsupported preparation'}\n`);
  process.exitCode = 1;
});
