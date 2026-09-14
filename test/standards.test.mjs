import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const preset = JSON.parse(readFileSync(new URL("../standards.json", import.meta.url), "utf8"));
const workflowManager = preset.customManagers.find(
  (manager) => manager.datasourceTemplate === "npm",
);
const pattern = new RegExp(workflowManager.matchStrings[0], "g");

test("discovers exact CLI pins for both check commands and prereleases", () => {
  for (const command of ["check", "ci"]) {
    const input = `- run: pnpm dlx @sebastian-software/standards@0.12.0 ${command}
- run: pnpm dlx @sebastian-software/standards@0.13.0-rc.1 ${command}`;
    assert.deepEqual(
      [...input.matchAll(pattern)].map((match) => match.groups.currentValue),
      ["0.12.0", "0.13.0-rc.1"],
    );
  }
});

test("does not treat unpinned commands or unrelated packages as CLI pins", () => {
  for (const input of [
    "standards@latest ci",
    "@sebastian-software/standards@^0.12.0 check",
    "@sebastian-software/standards ci",
    "@other/standards@0.12.0 ci",
  ]) {
    assert.deepEqual([...input.matchAll(pattern)], []);
  }
});

test("limits workflow discovery to the two supported forge directories", () => {
  const [configured] = workflowManager.managerFilePatterns;
  const files = new RegExp(configured.slice(1, -1));
  for (const name of [".github/workflows/ci.yml", ".forgejo/workflows/check.yaml"])
    assert.equal(files.test(name), true);
  for (const name of ["README.md", "reference/rust/ci.yml", "package.json"])
    assert.equal(files.test(name), false);
});

test("only stamp updates apply files and trigger the first agent", () => {
  const rules = preset.packageRules.filter((rule) => rule.postUpgradeTasks);
  assert.equal(rules.length, 1);
  assert.deepEqual(rules[0].matchDatasources, ["custom.sebastian-software-standards"]);
  assert.deepEqual(rules[0].matchPackageNames, ["standards"]);
  assert.equal(rules[0].automerge, false);
  assert.deepEqual(rules[0].addLabels, ["standards:needs-agent"]);
  assert.equal(rules[0].minimumReleaseAge, "0");
});
