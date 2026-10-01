// Harmless transport/probe validator. This is not a companion updater.
import assert from 'node:assert/strict';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, normalize } from 'node:path';
await appendFile('stub-marker.txt', 'executed\n');
const input = process.env.RENOVATE_POST_UPGRADE_COMMAND_DATA_FILE;
assert(input, 'The real executor must supply the data-file environment.');
const upgrades = JSON.parse(await readFile(input, 'utf8'));
assert(Array.isArray(upgrades) && upgrades.length > 0);
const data = upgrades.map((u) => {
  assert.equal(typeof u.depName, 'string');
  assert.match(u.newVersion, /^\d+\.\d+\.\d+$/);
  assert.equal(typeof u.packageFile, 'string');
  assert(!isAbsolute(u.packageFile) && !normalize(u.packageFile).startsWith('..'));
  return { depName: u.depName, packageFile: u.packageFile, newVersion: u.newVersion, isVulnerabilityAlert: Boolean(u.isVulnerabilityAlert) };
});
await writeFile('stub-data.json', JSON.stringify(data, null, 2) + '\n');
if (process.argv.includes('--fail')) throw new Error('intentional-test-child-failure');
