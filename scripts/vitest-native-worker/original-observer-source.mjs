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
// Internal source-contract seam; originalLocations authenticates bytes before using it.
export function originalHandlerLocation(source, category) {
  const handler = {
    install: ['handler5', 'async function handler5(opts3, _params, commands2) {\n',
      '\n}\nasync function dryRunInstall(', '  const include = {\n', '  const include = '],
    update: ['handler13', 'async function handler13(opts3, params = [], commands2) {\n',
      '\n}\nasync function interactiveUpdate(', '  return update(params, opts3, rebuildHandler);\n', '  return '],
    dedupe: ['handler6', 'async function handler6(opts3, _params, commands2) {\n',
      '\n}\nvar commandNames6, recursiveByDefault2;', '  const include = {\n', '  const include = '],
  }[category];
  requireValue(handler, 'Unknown original handler category');
  const start = unique(source, handler[1]); const bodyStart = start + handler[1].length;
  const end = unique(source, handler[2]);
  requireValue(bodyStart < end && source.indexOf('\n}', bodyStart - 1) === end, 'Unsupported original handler body boundary');
  const body = source.slice(bodyStart, end + 1);
  const anchor = unique(body, handler[3]); const entryOffset = bodyStart + anchor + handler[4].length;
  const suspension = body.search(/\b(?:await|yield)\b/);
  requireValue(suspension === -1 || anchor + handler[4].length < suspension,
    'Unsupported original handler entry after suspension');
  return { entry: position(source, entryOffset), handlerName: handler[0],
    functionLocation: position(source, start + 'async '.length) };
}
export function originalLocations(bytes, category) {
  requireValue(digest(bytes) === ORIGINAL_PNPM_BUNDLE, 'Unsupported original observer script bytes');
  const source = bytes.toString('utf8'); const handler = originalHandlerLocation(source, category);
  const call = unique(source, '    let result2 = pnpmCmds[cmd ?? "help"](');
  const awaitOffset = unique(source, '        result2 = await result2;');
  const after = unique(source, '    executionTimeLogger.debug({\n      startedAt: global["pnpm__startedAt"]');
  requireValue(call < awaitOffset && awaitOffset < after, 'Unsupported original await control flow');
  return { preCall: position(source, call + '    let result2 = '.length),
    ...handler,
    settlement: position(source, after + 4), scriptSha256: ORIGINAL_PNPM_BUNDLE };
}
