# Local Vitest worker contracts

This test fixture proves reference-version transport, process and installer-age
contracts. It contains a harmless stub, not a production companion updater.
Full security alignment is **NOT PROVEN**; fleet provenance and required status
enforcement remain **PENDING**.

Run from the repository root with Node 24.21.0 and README's temporary
Renovate 44.127.1 / pnpm 11.20.0 bootstrap:

```sh
node scripts/test-vitest-worker-contract.mjs \
  --renovate-root "$tooling_dir/node_modules/renovate" \
  --pnpm-cli "$tooling_dir/node_modules/pnpm/bin/pnpm.cjs"
```

The runner prints its unique temporary artifact directory. Optional `--output`
selects a directory that must not already exist. Exit 0 means these local
contracts passed; it does not mean the security bug or worker rollout is solved.

The existing lockstep runner's optional `--policy-input` accepts only a local
fixture policy. Without it, existing regular/security semantics stay unchanged.
Its `hook-input.json` exports actual generated branches. The new runner resolves
internal presets and local default/standards snapshots in worker extends order,
applies real package rules, and reuses advisory initialization, lookup,
branchification and native manifest/lock generation. Ordinary npm age is three
days with dashboard approval; advised updates bypass those barriers in lookup
replay. Standards task settings are compared without executing standards or
installTools. `worker-policy.json` records sanitized source provenance and local
preset hashes; refresh those pins deliberately after a reviewed policy change.

Temporary fixture-only Git seed commits and native Renovate Git synchronization
provide real repository status. Branch mode executes the two-upgrade regular
branch once. The advisory branch data names package.json, resolved Vitest 4.1.11
and advisory state despite candidate 5.0.3. No-changes returns null; denial never
starts the stub; intentional child failure produces its marker and artifact
error. Malformed JSON/target/path cases validate only this probe. Artifact errors
cannot establish required checks or stale-green PR merge prevention.

Native pnpm cases use separate unlocked workspaces, stores, metadata caches and
empty explicit user/global config files; HOME is not changed. Loopback metadata
models the selected release as one hour old while retaining real published
package metadata, immutable tarball URLs and integrity. Every direct package
metadata request is observed. Baseline and unrelated control must return the
exact native maturity error identifying the served package/version/time; target
exceptions must install Vitest and scoped coverage 4.1.11. Config precedence uses
NO exceptions: CLI age 30 minutes permits the one-hour-old targets despite
workspace 1440 minutes and .npmrc 2880 minutes, proving that CLI override wins in
this measured case. No consumer config or global zero-age policy is written.
Upstream transitive metadata/tarballs still require network access. This is a
synthetic installer-metadata model, not a newly published release or fleet proof.

Artifacts include policy observations, actual pipeline branches/manifests/locks,
stub data/markers/errors, registry inputs/requests and installer logs. The pipeline
regular case passes while native strict security remains exit 1 with coverage
4.1.10 beside Vitest 4.1.11. Permissive fixture peers mean frozen installs alone
cannot prove alignment. No hosted PR, production-helper validation, RE2
conformance, worker permissions or platform status enforcement is tested.

Use `--timeout-proof-only` with the same pinned arguments for the focused owned
process-group check. It also runs in the normal suite: a harmless long-lived
grandchild inherits pipes, the deadline signals only that invocation's POSIX
group, escalates to SIGKILL, and bounds pipe cleanup. Timeout state is explicit;
both recorded fixture PIDs must be gone and no delayed marker may exist. This
checks macOS/Linux owned-group cleanup, not processes that deliberately create a
new session outside that group.
