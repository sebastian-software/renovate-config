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
// Internal source-contract seam; positions alone never authenticate callable identity.
export function originalDispatchLocations(source) {
  const signature = '  let { output, exitCode } = await (async () => {\n';
  const start = unique(source, signature); const bodyStart = start + signature.length;
  const end = unique(source, '    return result2;\n  })();\n');
  requireValue(bodyStart < end && source.indexOf('  })();\n', bodyStart) === end + '    return result2;\n'.length,
    'Unsupported original dispatch function boundary');
  const call = unique(source, '    let result2 = pnpmCmds[cmd ?? "help"](');
  const control = '    );\n    try {\n      if (result2 instanceof Promise) {\n        result2 = await result2;\n      }\n' +
    '    } finally {\n      await finishWorkers();\n    }\n' +
    '    executionTimeLogger.debug({\n      startedAt: global["pnpm__startedAt"]';
  const controlStart = unique(source, control);
  const awaitOffset = unique(source, '        result2 = await result2;');
  const cleanup = unique(source, '      await finishWorkers();\n');
  const after = unique(source, '    executionTimeLogger.debug({\n      startedAt: global["pnpm__startedAt"]');
  requireValue(bodyStart < call && call < controlStart && controlStart < awaitOffset && awaitOffset < cleanup && cleanup < after && after < end,
    'Unsupported original dispatch await/finally/success control flow');
  const preCleanup = position(source, cleanup + '      await '.length);
  const dispatchFunctionLocation = position(source, start + signature.indexOf('async'));
  requireValue(preCleanup.lineNumber === 312340 && preCleanup.columnNumber === 12 &&
    dispatchFunctionLocation.lineNumber === 312305 && dispatchFunctionLocation.columnNumber === 36,
  'Unsupported original dispatch cleanup/function location');
  return { preCall: position(source, call + '    let result2 = '.length), preCleanup,
    settlement: position(source, after + 4), dispatchFunctionName: '', dispatchFunctionLocation };
}
export function originalLocations(bytes, category) {
  requireValue(digest(bytes) === ORIGINAL_PNPM_BUNDLE, 'Unsupported original observer script bytes');
  const source = bytes.toString('utf8');
  return { ...originalDispatchLocations(source), ...originalHandlerLocation(source, category), scriptSha256: ORIGINAL_PNPM_BUNDLE };
}
