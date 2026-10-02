# Maintained helper local contract

This suite separately proves local helper acceptance through an actual Renovate
advisory branch. It keeps the original native security mismatch as an expected
exit 1 negative control. No hosted PR protection or worker activation is proved.

Run `scripts/test-vitest-helper.mjs` from the repository root with the exact
profile Node, `--renovate-root` and `--pnpm-cli` described in the root README.
`--runtime-profile reference44` is default (44.127.1/24.21.0/11.20.0);
`candidate43-consumer 11` is 43.288.0/24.18.0/11.17.0. `--output` selects a directory
that must not exist. Otherwise a unique temporary artifact directory is printed.
Every failed assertion or unsupported native capability is nonzero.

The runner generates real native regular and advisory branches, asserts the
native security command exits 1 with 4.1.11/coverage 4.1.10, then executes the maintained
helper through Renovate's actual data-file/post-upgrade wrapper in that same
advisory branch. It checks frozen artifacts and denied/missing helper behavior.

The workspace inputs contain two affected importers: caret/tilde and exact
coverage declarations plus an expressive Vitest range admitting 5.0.3. A third
importer contains the excluded eslint-plugin. The old installed graph is built
with native pnpm and ordinary age policy from temporary exact old declarations;
fixture range specifiers are restored in manifests/importers before the helper.
No committed seed lock masks target generation. Helper installation then
independently verifies actual 4.1.11 resolutions, metadata-derived installed
internals and peer contexts. Nine published 4.1.11 metadata entries are pinned in
`target-metadata.json`; `young-control-metadata.json` pins is-odd 3.0.1. Existing
registry metadata provides the admitted 5.0.3 candidate and immutable tarballs.
The temporary workspace uses native `registries.default` routing; actual metadata
requests must reach the loopback server. Loopback publication times are modeled, never presented as live release evidence.

Only installed companions enter the closure. Missing UI/browser/other optional
companions remain absent. eslint-plugin's version, integrity, declarations and
unrelated edges stay unchanged; its existing native Vitest peer reference follows
the selected 4.1.11 context. is-number nodes remain unchanged. The inherited exact
is-number age exclusion survives alongside invocation-only exact family entries,
while a young unrelated is-odd remains blocked. Conflicting pmOnFail: download
configuration does not change the verified Node/CLI identity.

Negative cases cover malformed/missing/escaping data, missing tool/helper,
conflicting targets, unsupported manager/catalog/peer/runtime/executable-config
ownership, unavailable target, native install failure, partial multi-file
publication, explicit recovery failure, concurrent edits, owned subprocess timeout
and disabled repository pnpmfiles. A second successful run is byte-identical.
The isolated distribution test installs only the reviewed helper-local frozen
lock and rejects a missing dependency even when a parent offers that module.

An immutable release consists of `vitest-lockstep.mjs`, sibling
`vitest-lockstep/package.json`, `pnpm-lock.yaml` and the complete installed
`node_modules` closure including `.pnpm`. Never resolve runtime modules from
Renovate or the caller's dependency tree. No worker-side install or executable
consumer preset is delivered by these tests.

Catchable failures restore owned bytes, or retain an explicit recovery failure
for inspection. External publication edits are not overwritten. SIGKILL/power
loss may interrupt recovery, and restored original bytes may still mismatch.
Hosted required current-HEAD alignment, old green PR reconciliation, bypass rules,
actual worker provenance, immutable permissions/distribution and canary rollout
remain activation gates. Issue 37 remains open/in-progress.
