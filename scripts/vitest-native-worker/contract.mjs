// Source orchestration report only. It is never an input to authority issuance.
import { requireValue, relativeName, digestPattern } from '../vitest-release/files.mjs';
export const categories = ['install', 'update', 'dedupe'];
export const scenarios = ['readonly', 'data-only', 'concurrency', 'delegation', 'term', 'int', 'kill',
  'partial', 'tamper', 'redirection', 'replacement', 'script-suppression', 'hook-suppression', 'preload-suppression'];
export const limits = Object.freeze({ input: 2_097_152, summary: 65_536, leaf: 1_048_576,
  retainedFiles: 1_000, retainedBytes: 67_108_864, commandMs: 45_000, totalMs: 900_000,
  diagnostic: 4_096, workspaceFiles: 32, workspaceBytes: 1_048_576 });
export const slots = categories.flatMap(category => [
  ...['original', 'derived'].map(runtimeIdentity => ({ id: `baseline:${runtimeIdentity}:${category}`,
    kind: 'baseline', runtimeIdentity, category, scenario: null })),
  ...scenarios.map(scenario => ({ id: `lifecycle:derived:${category}:${scenario}`,
    kind: 'lifecycle', runtimeIdentity: 'derived', category, scenario })),
]);
export function summarizeQualification({ cases, evidenceScope }) {
  requireValue(['source-fixture', 'unrun-qualification'].includes(evidenceScope), 'Unsupported evidence scope');
  requireValue(Array.isArray(cases) && cases.length <= 48, 'Bounded case inventory required');
  const supplied = new Map();
  for (const record of cases) {
    requireValue(record && slots.some(slot => slot.id === record.id), 'Unknown qualification slot');
    const canonical = slots.find(slot => slot.id === record.id);
    const allowed = ['id', 'state', 'reason', 'references', 'nativeOutcome', 'kind', 'runtimeIdentity', 'category', 'scenario'];
    requireValue(Object.keys(record).every(key => allowed.includes(key)), 'Unknown source case field');
    for (const key of ['kind', 'runtimeIdentity', 'category', 'scenario']) requireValue(
      !(key in record) || record[key] === canonical[key], 'Source record cannot override its canonical slot');
    requireValue(!supplied.has(record.id), 'Duplicate qualification slot');
    requireValue(['FAILED', 'UNSUPPORTED', 'UNRUN', 'PASSED'].includes(record.state), 'Invalid case state');
    // Q2a has no independently observed whole-worker adapter. A source record
    // cannot earn operational PASSED by declaring facts or a proof reference.
    requireValue(record.state !== 'PASSED', 'Source evidence cannot promote a qualification slot');
    requireValue(typeof record.reason === 'string' && record.reason.length > 0 && record.reason.length <= 256 &&
      !/[\x00-\x1f]/.test(record.reason), 'Bounded case reason required');
    requireValue(Array.isArray(record.references) && record.references.length <= 32, 'Bounded case references required');
    for (const reference of record.references) {
      requireValue(reference && Object.keys(reference).sort().join(',') === 'path,sha256' &&
        digestPattern.test(reference.sha256), 'Invalid retained reference');
      relativeName(reference.path);
    }
    if (record.nativeOutcome) {
      const outcome = record.nativeOutcome;
      requireValue(Object.keys(outcome).sort().join(',') === 'exitCode,signal' &&
        (outcome.exitCode === null || Number.isInteger(outcome.exitCode) && outcome.exitCode >= 0 && outcome.exitCode <= 255) &&
        (outcome.signal === null || ['SIGTERM', 'SIGINT', 'SIGKILL'].includes(outcome.signal)), 'Invalid native outcome');
    }
    supplied.set(record.id, structuredClone(record));
  }
  const records = slots.map(slot => ({ ...slot, ...(supplied.get(slot.id) ?? {
    state: 'UNRUN', reason: 'Required controlled observation is unavailable', references: [],
  }) }));
  const summary = { schemaVersion: 1, evidenceScope, completeness: false, productionEligible: false,
    cases: records, missingSlots: records.filter(record => record.state !== 'PASSED').map(record => record.id) };
  requireValue(Buffer.byteLength(JSON.stringify(summary)) <= limits.summary, 'Summary byte budget exceeded');
  return summary;
}
export function qualificationExitCode(summary) {
  requireValue(summary?.schemaVersion === 1 && summary.completeness === false && summary.productionEligible === false &&
    ['source-fixture', 'unrun-qualification'].includes(summary.evidenceScope), 'Source completeness or eligibility promotion');
  const checked = summarizeQualification({ cases: summary.cases, evidenceScope: summary.evidenceScope });
  requireValue(JSON.stringify(checked.missingSlots) === JSON.stringify(summary.missingSlots), 'Missing slot summary differs');
  return checked.missingSlots.length ? 1 : 0;
}
