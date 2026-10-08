// Pure source-report decisions. Synthetic events never authenticate Inspector execution.
import { requireValue } from '../vitest-release/files.mjs';

export const observerLimits = Object.freeze({ events: 32, summary: 65_536, commands: 32,
  messages: 4096, protocolBytes: 40_000_000, messageBytes: 20_000_000,
  operationMs: 5000, setupMs: 10_000, lifetimeMs: 30_000, cleanupMs: 3000,
  outputBytes: 131_072, pauses: 8 });
export class UnsupportedObservation extends Error {
  constructor(reason, message) { super(message); this.name = 'UnsupportedObservation'; this.reason = reason; }
}
export function exact(value, keys, message = 'Unknown observer contract fields') {
  requireValue(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === [...keys].sort().join(','), message);
}
const phases = ['launch', 'pre-call-pause', 'handler-entry', 'handler-settlement', 'native-terminal'];
function outcome(value) {
  exact(value, ['exitCode', 'signal']);
  requireValue(value.exitCode === null || Number.isInteger(value.exitCode) && value.exitCode >= 0 && value.exitCode <= 255,
    'Invalid observed native exit');
  requireValue(value.signal === null || ['SIGTERM', 'SIGINT', 'SIGKILL'].includes(value.signal), 'Invalid observed native signal');
  requireValue((value.exitCode === null) !== (value.signal === null), 'Native terminal needs one actual exit or signal');
}
export function summarizeOriginalObservation({ category, events }) {
  requireValue(['install', 'update', 'dedupe'].includes(category), 'Unsupported fixed observer category');
  requireValue(Array.isArray(events) && events.length <= observerLimits.events, 'Observer event bound exceeded');
  const seen = new Set(); let failed = false; let terminal = false; let nativeOutcome = null;
  for (const [index, event] of events.entries()) {
    const extra = event.phase === 'native-terminal' ? ['outcome'] :
      event.phase === 'observer-failure' ? ['reason', 'intervention'] :
      event.phase === 'launch' ? [] : event.phase === 'handler-settlement' ? ['location', 'settlement'] :
      event.phase === 'pre-call-pause' && !('location' in event) ? [] : ['location'];
    exact(event, ['phase', 'sequence', ...extra]);
    requireValue(event.sequence === index && !terminal && !seen.has(event.phase), 'Replayed, late or unordered observer event');
    requireValue(phases.includes(event.phase) || event.phase === 'observer-failure', 'Unknown observer phase');
    if (event.phase !== 'launch') requireValue(seen.has('launch'), 'Observer event before native launch');
    if (event.phase === 'handler-entry') requireValue(seen.has('pre-call-pause') && !failed, 'Handler entry lacks authentic call ordering');
    if (event.phase === 'handler-settlement') requireValue(seen.has('handler-entry') && !failed && event.settlement === 'resolved',
      'Handler settlement cannot be inferred from process exit');
    if ('location' in event) {
      exact(event.location, ['scriptSha256', 'lineNumber', 'columnNumber', 'functionName']);
      requireValue(/^[a-f0-9]{64}$/.test(event.location.scriptSha256) &&
        Number.isInteger(event.location.lineNumber) && event.location.lineNumber >= 0 &&
        Number.isInteger(event.location.columnNumber) && event.location.columnNumber >= 0 &&
        typeof event.location.functionName === 'string' && /^[A-Za-z0-9_$]{0,64}$/.test(event.location.functionName),
      'Invalid normalized source location');
    }
    if (failed) requireValue(event.phase === 'native-terminal', 'Semantic event after observer failure');
    if (event.phase === 'observer-failure') {
      requireValue(['protocol', 'source', 'location', 'disconnect', 'timeout', 'cancelled', 'bounds', 'identity'].includes(event.reason) &&
        ['none', 'resume-disconnect', 'signal-owned-process'].includes(event.intervention), 'Unknown observer failure');
      failed = true;
    }
    if (event.phase === 'native-terminal') { outcome(event.outcome); nativeOutcome = structuredClone(event.outcome); terminal = true; }
    seen.add(event.phase);
  }
  const missingClaims = phases.filter(phase => !seen.has(phase));
  const report = { schemaVersion: 1, qualificationContractRevision: 2, evidenceScope: 'source-fixture',
    category, state: failed ? 'unsupported' : missingClaims.length ? 'incomplete' : 'supported',
    completeness: false, productionEligible: false, observedPhases: phases.filter(phase => seen.has(phase)),
    missingClaims, nativeOutcome, events: structuredClone(events) };
  requireValue(Buffer.byteLength(JSON.stringify(report)) <= observerLimits.summary, 'Observer summary bound exceeded');
  return report;
}
export function validateOriginalObservationReport(report) {
  exact(report, ['schemaVersion', 'qualificationContractRevision', 'evidenceScope', 'category', 'state',
    'completeness', 'productionEligible', 'observedPhases', 'missingClaims', 'nativeOutcome', 'events']);
  requireValue(report.schemaVersion === 1 && report.qualificationContractRevision === 2 &&
    report.evidenceScope === 'source-fixture' && report.completeness === false && report.productionEligible === false,
  'Source report completeness or eligibility promotion');
  const expected = summarizeOriginalObservation(report);
  requireValue(JSON.stringify(report) === JSON.stringify(expected), 'Source report differs from its normalized observations');
  return report;
}
