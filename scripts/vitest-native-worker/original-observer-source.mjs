// Locations are fixed source tokens, not a nearest-breakpoint search.
import { ORIGINAL_PNPM_BUNDLE, digest } from '../vitest-native/transform.mjs';
import { requireValue } from '../vitest-release/files.mjs';

function unique(source, anchor) {
  requireValue(source.split(anchor).length === 2, 'Unsupported original source anchor');
  return source.indexOf(anchor);
}
function position(source, offset) {
  const before = source.slice(0, offset); const lineNumber = before.split('\n').length - 1;
  return { lineNumber, columnNumber: offset - before.lastIndexOf('\n') - 1 };
}
export function originalLocations(bytes, category) {
  requireValue(digest(bytes) === ORIGINAL_PNPM_BUNDLE, 'Unsupported original observer script bytes');
  const source = bytes.toString('utf8');
  const handler = { install: ['handler5', 'async function handler5(opts3, _params, commands2) {\n  if (opts3.global', 'opts3.global'],
    update: ['handler13', 'async function handler13(opts3, params = [], commands2) {\n  if (opts3.global', 'opts3.global'],
    dedupe: ['handler6', 'async function handler6(opts3, _params, commands2) {\n  const include = {', '{'] }[category];
  requireValue(handler, 'Unknown original handler category');
  const start = unique(source, handler[1]);
  const firstLine = source.indexOf('\n', start) + 1;
  const entryOffset = source.indexOf(handler[2], firstLine);
  const call = unique(source, '    let result2 = pnpmCmds[cmd ?? "help"](');
  const awaitOffset = unique(source, '        result2 = await result2;');
  const after = unique(source, '    executionTimeLogger.debug({\n      startedAt: global["pnpm__startedAt"]');
  requireValue(call < awaitOffset && awaitOffset < after, 'Unsupported original await control flow');
  return { preCall: position(source, call + '    let result2 = '.length),
    entry: position(source, entryOffset), handlerName: handler[0], functionLocation: position(source, start + 'async '.length),
    settlement: position(source, after + 4), scriptSha256: ORIGINAL_PNPM_BUNDLE };
}
