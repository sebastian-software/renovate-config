import { createHash } from 'node:crypto';
export const digest = (value) => createHash('sha256').update(value).digest('hex');
export const ORIGINAL_PNPM_BUNDLE = '228451e6383cf4df0700fc19b37aba1a25e6540e62fbca70ca2d76b719a4d883';
export const ORIGINAL_PNPM_ARCHIVE = '644eb5079654e87dae59a07e62d7f098162b9ce58f06077328b5ddefca1c8541';
const slot = 'globalThis[Symbol.for("vitest.native.observation.v1")]';
function once(source, anchor, replacement) {
  if (source.split(anchor).length !== 2) throw new Error('Absent or ambiguous authenticated observation anchor');
  return source.replace(anchor, replacement);
}
// Authenticated byte offsets describe the two native returns before the real
// switch-child seam. They are source facts, never runtime child-absence proof.
export function delegationSourceFacts(bytes) {
  if (digest(bytes) !== ORIGINAL_PNPM_BUNDLE) throw new Error('Unsupported original pnpm bundle');
  const source = bytes.toString('utf8');
  const anchors = {
    functionOffset: 'async function switchCliVersion(config2, context) {',
    directReturnOffset: '  if (!persistLockfile && pm2.version === packageManager.version)\n    return;',
    resolvedReturnOffset: '  if (pmVersion === packageManager.version) {\n    await storeToUse?.ctrl.close();\n    return;\n  }',
    spawnOffset: '  const { status, signal, error } = import_cross_spawn4.default.sync(pnpmBinPath, process.argv.slice(2), {',
    functionEndOffset: '\nvar import_cross_spawn4, import_semver66, VersionSwitchFail;',
    dispatchOffset: '    let result2 = pnpmCmds[cmd ?? "help"](',
  };
  const facts = { originalBundleSha256: ORIGINAL_PNPM_BUNDLE };
  for (const [key, anchor] of Object.entries(anchors)) {
    if (source.split(anchor).length !== 2) throw new Error('Absent or ambiguous authenticated delegation anchor');
    facts[key] = Buffer.byteLength(source.slice(0, source.indexOf(anchor)));
  }
  if (!(facts.functionOffset < facts.directReturnOffset && facts.directReturnOffset < facts.resolvedReturnOffset &&
    facts.resolvedReturnOffset < facts.spawnOffset && facts.spawnOffset < facts.functionEndOffset &&
    facts.functionEndOffset < facts.dispatchOffset)) throw new Error('Changed authenticated delegation control flow');
  return facts;
}
export function transformPnpm(bytes) {
  if (digest(bytes) !== ORIGINAL_PNPM_BUNDLE) throw new Error('Unsupported original pnpm bundle');
  let source = bytes.toString('utf8');
  const gate = '    ({ config: config2, context } = await installConfigDepsAndLoadHooks(config2, context, {';
  source = once(source, gate, `    ${slot}.beforeHooks(cmd, config2, context);\n${gate}`);
  const dispatch = '    let result2 = pnpmCmds[cmd ?? "help"](';
  source = once(source, dispatch, `    ${slot}.dispatch(cmd, config2, context, packageManager.version);\n${dispatch}`);
  const delegation = '  const { status, signal, error } = import_cross_spawn4.default.sync(pnpmBinPath, process.argv.slice(2), {';
  source = once(source, delegation, `  ${slot}.delegation();\n${delegation}`);
  return Buffer.from(source);
}
export function transformRenovate(bytes, kind, expectedDigest) {
  if (digest(bytes) !== expectedDigest) throw new Error('Unsupported original Renovate observation seam');
  const source = bytes.toString('utf8');
  if (kind === 'manager') {
    const anchor = '\t\tconst execOptions = {';
    return Buffer.from(once(source, anchor, '\t\textraEnv.VITEST_NATIVE_TAG = JSON.stringify({ repository: config.repository ?? null, branch: config.branchName ?? null });\n\t\tObject.assign(extraEnv, '+slot+'.dataOnlyEnvironment());\n'+anchor));
  }
  if (kind === 'branch') {
    const anchor = '\t\t\tconst { pr } = ensurePrResult;';
    return Buffer.from(once(source,anchor,anchor+`\n\t\t\tawait ${slot}.generatedHead(config, pr, scm);`));
  }
  const anchor = '\t\tconst cp = execa(cmd, args, {';
  return Buffer.from(once(source, anchor, `\t\tconst cp = ${slot}.nativeExeca(execa, cmd, args, {`));
}
