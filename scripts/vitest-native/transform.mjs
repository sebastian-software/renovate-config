import { createHash } from 'node:crypto';
export const digest = (value) => createHash('sha256').update(value).digest('hex');
export const ORIGINAL_PNPM_BUNDLE = '228451e6383cf4df0700fc19b37aba1a25e6540e62fbca70ca2d76b719a4d883';
export const ORIGINAL_PNPM_ARCHIVE = '644eb5079654e87dae59a07e62d7f098162b9ce58f06077328b5ddefca1c8541';
const slot = 'globalThis[Symbol.for("vitest.native.observation.v1")]';
function once(source, anchor, replacement) {
  if (source.split(anchor).length !== 2) throw new Error('Absent or ambiguous authenticated observation anchor');
  return source.replace(anchor, replacement);
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
    return Buffer.from(once(source, anchor, '\t\textraEnv.VITEST_NATIVE_TAG = JSON.stringify({ repository: config.repository ?? null, branch: config.branchName ?? null });\n'+anchor));
  }
  const anchor = '\t\tconst cp = execa(cmd, args, {';
  return Buffer.from(once(source, anchor, `\t\tconst cp = ${slot}.nativeExeca(execa, cmd, args, {`));
}
