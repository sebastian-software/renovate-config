// Separate fixture-only feasibility entry. No operational authority or generic debugger.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runOriginalObserver } from './vitest-native-worker/original-observer.mjs';
export { runOriginalObserver };
export function parseOriginalObserverArgs(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index]; const value = args[index + 1];
    if (!['--input', '--input-sha256', '--output'].includes(name) || values[name] !== undefined ||
      typeof value !== 'string' || value.startsWith('--')) throw Error('Unknown, duplicate or missing fixed observer argument');
    values[name] = value;
  }
  if (Object.keys(values).length !== 3 || !/^[a-f0-9]{64}$/.test(values['--input-sha256'])) throw Error('Pinned observer input and new output required');
  return values;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseOriginalObserverArgs(process.argv.slice(2));
    const summary = await runOriginalObserver(args['--input'], args['--input-sha256'], args['--output']);
    process.stdout.write(JSON.stringify({ schemaVersion: 1, qualificationContractRevision: 2,
      evidenceScope: 'source-fixture', state: summary.state, completeness: false, productionEligible: false,
      summary: path.join(args['--output'], 'summary.json') }) + '\n');
  } catch {
    process.stderr.write('Unsupported bounded original-observer input or execution\n'); process.exitCode = 1;
  }
}
