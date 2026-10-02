# Run the independent Vitest peer checker

Use this runbook to prepare a reviewed checker release and evaluate authenticated
repository data through its v1 interface. The checker validates installed Vitest
peer obligations against independent published metadata. It does not mutate a
consumer, execute PR code, or use helper success as proof of alignment.

The owning implementation is [the checker](../../scripts/vitest-peer-alignment.mjs).
[Local CI](../../.github/workflows/ci.yml) runs `vitest-peer-alignment-local`.
The future trusted consumer status `vitest-peer-alignment` is a separate publisher
contract. Source proof does not establish deployment, advisory target selection,
release-age bypass, required hosted current-head status, or consumer activation.
Issue 37 remains open and in progress until that separate delivery is complete.

## Prepare a complete owned release

The trusted release owner selects a reviewed immutable repository revision after
source delivery and authenticates the complete artifact, including every runtime
module source file. Keep this layout together:

```text
<owned-release>/
  scripts/vitest-peer-alignment.mjs
  scripts/vitest-peer-alignment/
    package.json
    pnpm-lock.yaml
    node_modules/
```

Use the trusted Node 24.18.0 and pnpm 11.17.0 profile from local checker CI. The
source requires Node 24; the runtime manifest constrains Node to `>=24 <25`.
The runtime binds exactly `yaml@2.9.1` and `semver@7.8.5` through its reviewed
pnpm v9 lock. Both installed packages must have empty dependency and optional
dependency closures. The checker verifies their actual entry and manifest
resolution remains inside the owned runtime. Missing files, incorrect pins,
symlink escapes, ancestor fallback, or an incomplete lock are non-success.

Run preparation only against reviewed owned files, before accepting repository
input. Replace the following toolchain and release paths with values from trusted
service configuration. The pnpm CLI and interpreter are separate owned artifacts,
not files selected from a consumer PR.

```sh
owned_node=/trusted/toolchain/node-24.18.0/bin/node
owned_pnpm_cli=/trusted/toolchain/pnpm-11.17.0/bin/pnpm.mjs
owned_release=/trusted/releases/reviewed-checker
prep_root="$(mktemp -d)"
mkdir -p "$prep_root/home" "$prep_root/config" "$prep_root/cache"
env -i HOME="$prep_root/home" XDG_CONFIG_HOME="$prep_root/config" \
  XDG_CACHE_HOME="$prep_root/cache" \
  PATH="$(dirname "$owned_node"):/usr/bin:/bin" CI=true \
  npm_config_userconfig=/dev/null npm_config_globalconfig=/dev/null \
  "$owned_node" "$owned_pnpm_cli" \
  --dir "$owned_release/scripts/vitest-peer-alignment" install \
  --frozen-lockfile --ignore-scripts --ignore-pnpmfile --pm-on-fail=ignore \
  --registry=https://registry.npmjs.org --store-dir="$prep_root/store"
```

Retain the reviewed manifest/lock, preparation receipt, resolved module paths,
versions and hashes. Authenticate all artifact bytes against the selected release
before using them. This normal preparation uses the fixed public registry. It is
not an offline guarantee. A measured `--offline` install reused cached tarballs
but still fetched public supply-chain policy metadata; sandbox attempts were
cancelled or timed out. Those setup outcomes are not alignment verdicts and do
not justify changing consumer age or trust policy.

## Fix the caller's authority before evaluation

The trusted caller owns the interpreter, entry path, argv, environment, metadata
transport/cache and externally selected `checkerRevision` and `policyRevision`.
Never copy any of these authority fields from PR JSON, manifests, `.npmrc`,
repository URLs, helper output or executable settings. A revision label alone
neither authenticates the entry nor proves the code existed at that revision.
Compare `checkerSha256` with the reviewed release and bind the full artifact to
that externally selected revision. Source cannot pin its future containing commit.

Launch a fixed clean process. Exclude unrelated preloads, loaders and bootstrap
hooks, including injected `NODE_OPTIONS`, `NODE_PATH`, `--import`, `--require`
and loader flags. The source inherits trusted caller flags into the Worker; it
does not sanitize or construct a production launcher. Keep only the required
actual Node permission flags and owned paths. Do not claim production isolation
until the deployed caller configuration and full artifact binding are verified.

This POSIX invocation grants filesystem reads only to the release and permits
owned Workers, with no filesystem write, child-process or addon permission:

```sh
owned_node=/trusted/toolchain/node-24.18.0/bin/node
owned_release=/trusted/releases/reviewed-checker
checker_revision=REPLACE_WITH_REVIEWED_40_LOWERCASE_HEX_REVISION
policy_revision=REPLACE_WITH_TRUSTED_POLICY_TOKEN
trusted_request=/trusted/requests/captured-head.json
env -i "$owned_node" --permission --disable-warning=SecurityWarning \
  --allow-fs-read="$owned_release" --allow-worker \
  "$owned_release/scripts/vitest-peer-alignment.mjs" \
  --mode check --checker-revision "$checker_revision" \
  --policy-revision "$policy_revision" < "$trusted_request"
```

These placeholders require trusted substitution; they are not runnable release
identities. The shell provides captured request bytes on stdin; the checker does
not read the consumer filesystem. Node's [Worker documentation](https://nodejs.org/docs/latest-v24.x/api/worker_threads.html)
defines default parent-option inheritance, and the [Permission Model](https://nodejs.org/docs/latest-v24.x/api/permissions.html)
defines these capability restrictions. Local probes confirmed an actual Worker
write attempt returns `ERR_ACCESS_DENIED`, leaves no sentinel, and respects denied
runtime reads. Those probes deliberately alter an owned test copy, not PR code or
the authenticated release used for positive alignment evidence.

## Capture the exact repository input

The caller must authenticate the complete forge tree and relevant file bytes at
the captured exact head. Reject truncated reads and bind repository/PR/head to
that acquisition. Matching tree size and Git blob hashes prove internal byte
consistency only; repository-provided hashes or `complete:true` do not establish
external provenance.

The v1 request is a JSON object with the following fields. Request, identity,
tree, tree-entry, file and metadata-envelope objects reject unsupported fields.

| Field | Required contract |
| --- | --- |
| `schemaVersion` | Integer `1` |
| `identity` | `{repository, pullRequest, head}`; bounded `owner/repo`, positive safe integer PR, 40 lowercase hex exact head |
| `tree` | `{complete:true, head, entries}`; same head, every exact-tree leaf, no truncation |
| `tree.entries[]` | `{path, mode, sha, size}`; bounded relative POSIX path, Git object ID, nonnegative safe byte size |
| `mode` | `100644`, `100755`, `120000` or `160000`; links are inventoried but never followed |
| `files[]` | `{path, content}`; exact UTF-8 text of each relevant regular blob, matching its tree size and Git SHA1 |
| `metadata` | Required for checking; optional for discovery; independently acquired envelope described below |

Relevant bytes are root `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`
when present, and every manifest discovered by workspace patterns in the complete
tree. Include all workspaces even for lock-only changes. No other file payloads
are accepted. The root declares exactly `pnpm@11.17.0` or `pnpm@11.20.0`.
Supported workspace patterns are literal paths or whole single-segment stars,
including the actual `packages/*` and `website`. Data-only `allowBuilds` package
booleans are accepted. Catalogs, overrides, patches, executable pnpm ownership,
ambiguous ownership, or workspace symlink/submodule matches are non-success.

The Git blob SHA1 basis is UTF-8 bytes prefixed by `blob <byte-length>\0`, where
`\0` means one NUL byte. Duplicate JSON or YAML members, YAML aliases, malformed
UTF-8, path escapes and parser complexity violations are rejected.

## Discover and acquire independent metadata

Run the same owned process with `--mode discover` and metadata omitted. A
successful result has `operation:"discover"`, `verdict:"metadata-required"`,
`coordinates:[{name,version}]` and discovery stats. It is never alignment success,
even though its CLI exit code is zero.

Acquire published metadata for every reachable coordinate. This is necessary to
find a non-family package's required Vitest peer when the PR removes both lock
peer fields and snapshot peer tokens, even its Vitest edge. Checking only packages
identified by PR peer fields can hide that obligation. A trusted caller may reuse
independently authenticated cached projections and fetch missing coordinates.

The metadata envelope has this shape; `packages` contains complete projections
for all discovered reachable versions before final checking:

```json
{
  "schemaVersion": 1,
  "source": "https://registry.npmjs.org",
  "authenticated": true,
  "policy": "public-npm-v1",
  "packages": []
}
```

The empty array illustrates envelope shape, not a complete Paratix input. Each
document contains `name`, exact `version`, SHA512 `dist.integrity`, and every
published `dependencies`, `optionalDependencies`, `peerDependencies` and
`peerDependenciesMeta` field when present. Preserve complete range and optional
flag information. Only `optional:true` permits an absent peer; omitted and false
flags both mean required. The authenticated flag is the caller's provenance
assertion, not self-authentication. PR files cannot mint this envelope.

The owned JavaScript exports are:

```js
import {
  checkAlignment, discoverMetadata, acquireRegistryMetadata, LIMITS,
} from './scripts/vitest-peer-alignment.mjs';

// These authority values are supplied by trusted release/service configuration.
const trustedConfig = { checkerRevision, policyRevision };
const discovery = await discoverMetadata(rawRequestJson, trustedConfig);
// Verify operation, identity, revisions and receipt hashes before acquisition.
// Only use coordinates when discovery.verdict === 'metadata-required'.
const metadata = await acquireRegistryMetadata(discovery.coordinates);
// The trusted caller assembles finalRequestJson with this authenticated envelope.
const result = await checkAlignment(finalRequestJson, trustedConfig);
```

This integration outline assumes caller-owned assembly and receipt verification;
its named variables are required inputs, not global values provided by the module.
Prefer raw JSON text for untrusted serialized input so parsing runs inside the
owned bounded Worker. Passing an assembled object serializes it in the caller
process and is intended for trusted assembly. `checkAlignment` and
`discoverMetadata` resolve bounded result objects on validation/runtime failure.
`acquireRegistryMetadata` rejects failed acquisition and returns a projected
metadata envelope on success. It does not determine compatibility.

Acquisition is separate from pure validation. The client constructs only fixed
public npm HTTPS version endpoints from encoded exact names and versions, with
an `accept: application/json` header. It sends no credential header, follows no
redirects and reads no repository config or URLs. Four requests run concurrently,
with 10-second response and 120-second batch deadlines, no retries, and bounded
raw/projected bytes. A failure cancels active requests. The trusted owner fixes
TLS/environment policy and authenticates any cache; PR metadata cannot change
source, policy or transport. Pure check/discovery never fetches or installs.

## Interpret the final result

Final checking verifies all manifest/importer ownership, complete reachable graph
coverage, and relevant family, reverse-family and full nested peer obligations
against independent published ranges and integrity. Published required dependency
identity and range establish graph ownership before relevance is selected. It does not require global
Vitest version equality. Historical companion subgraphs and multiple installed
contexts remain independent. Optional absence, compatible caret/tilde/exact
ranges and independently versioned `@vitest/eslint-plugin` can be valid.

Vitest-family declaration names retain strict actual published identity. Native
explicit non-family npm aliases can satisfy peers only with demonstrated parent
or reaching-importer ownership and the exact contextual provider. Unrelated
workspace or undeclared same-version names do not authorize substitution. Real
TypeScript npm aliases remain supported. The pnpm 11.17.0 bundle indexes both
alias and resolved name, then selects a named peer by version range; the fixture
README records the exact inspected source and tests.

Common output fields are `schemaVersion`, `operation`, `identity`,
`checkerRevision`, `policyRevision`, `checkerSha256`, `runtimeSha256`, `inputHash`,
`metadataHash`, `verdict`, `diagnostics` and `stats`. Successful discovery adds
`coordinates`. Errors return null for fields not yet established. Check success
stats contain `importers`, `snapshots`, `familySnapshots` and `metadataPackages`;
discovery stats omit `familySnapshots` and count required coordinates.

| Operation/result | CLI exit | Meaning |
| --- | --- | --- |
| `check` / `aligned` | `0` | Relevant installed obligations are compatible with the trusted input |
| `check` or `discover` / `not-aligned` | `1` | Ownership, range, identity, integrity or peer context fails |
| `check` or `discover` / `error` | `1` | Input, metadata, runtime or resource prerequisite failed |
| `discover` / `metadata-required` | `0` | Coordinate discovery completed; no alignment verdict |

The CLI writes one JSON result on stdout. A checker that cannot be loaded as a
native entry can fail before any JSON; treat missing output or native failure as
non-success. There is no `--help` surface. Default mode is `check`; revision flags
are required and unsupported flags fail. Never convert missing runtime, input,
metadata, timeout, discovery, or missing output into success.

For every accepted result, the trusted caller checks operation/schema, captured
identity, selected revisions and expected hashes. Bind discovery and final check
to the same `inputHash`, independently verify metadata provenance/hash, and accept
only the final `check` / `aligned` verdict. Publication and stale-current-head
reconciliation remain responsibilities of the future trusted publisher.

### Hash bases

All result hashes use lowercase SHA256 hex. Canonical JSON recursively sorts
object keys, preserves array order, uses JSON string encoding and no whitespace.

| Hash | Exact basis |
| --- | --- |
| `checkerSha256` | Actual checker entry bytes |
| `runtimeSha256` | Canonical `{manifestSha256, lockSha256, modules}`; modules ordered semver, then yaml, each `{name,version,entrySha256,manifestSha256}` |
| `inputHash` | Canonical `{schemaVersion,identity,tree,files}`; metadata and trusted configuration excluded |
| `metadataHash` | Complete canonical metadata envelope, including provenance fields and document array order; null when absent |

The runtime hash binds manifest/lock and resolved entry/package-manifest bytes.
It does not authenticate every module source file or prove an artifact's origin.
Whole-layout authentication and revision-to-artifact binding remain external
trusted release duties. Keep input array order stable between discovery and
final checking; sorting those arrays changes their receipt hash.

### Fixed budgets and recovery

| Budget | Limit |
| --- | --- |
| Serialized request | 32 MiB |
| Exact tree / supplied files | 10,000 leaves / 256 files |
| Each supplied file | 2 MiB |
| Metadata versions / aggregate raw and projected metadata | 4,096 / 16 MiB |
| Individual registry response | 1 MiB |
| Data depth / nodes | 64 / 300,000 |
| Peer context depth / tokens per resolution | 16 / 256 |
| Package records / snapshots | 20,000 each |
| Diagnostics | One record, message ≤512 characters, path ≤256 characters |
| Owned Worker / stdin / registry response | 10 seconds each |
| Registry acquisition batch | 120 seconds |
| Worker V8 old / young / stack | 192 MiB / 32 MiB / 4 MiB |

These are fixed source-policy bounds from `LIMITS`. Synchronous parser work is
covered by the owner's Worker termination timer. Registry failures do not retry.
On `UNAVAILABLE_RUNTIME`, restore the authenticated complete owned layout; on
`INCOMPLETE_TREE`, `INCOMPLETE_INPUT` or `INCOMPLETE_METADATA`, reacquire complete
exact-head data or authenticated projections. On peer/ownership mismatch, repair
repository data through its separate authorized workflow and evaluate fresh
captured bytes. On resource or deadline failure, return non-success; do not widen
limits from PR data or reuse a stale success receipt.

## Reproduce local source proof

After the owned runtime preparation, the established local command is:

```sh
node scripts/test-vitest-peer-alignment.mjs
```

Use the pinned trusted Node profile to run it. The [fixture contract](../../tests/fixtures/vitest-peer-alignment/README.md)
and [provenance](../../tests/fixtures/vitest-peer-alignment/paratix/provenance.json)
preserve the complete Paratix topology from commit
`de00be779511a13efb737aefbcc2825de8893a98`: four importers, 511 tree leaves,
1,104 package records, 1,112 snapshots and the original 368,288-byte lock.
Historical `@vitest` 3.2.4 companions coexist with two Vitest 4.1.11 nested
Vite/esbuild contexts; there is no `vitest@3.2.4` runtime in that real tree.
Supplied manifests remove personal/script fields while retaining all dependency
declarations, including unrelated npm TypeScript aliases. The fixture head is
synthetic; tree blob hashes are recalculated for sanitized supplied bytes.

The 1,104 published projected metadata documents total 351,532 bytes, SHA256
`bfa93a2633436dee9a59ede6eeb37d9fa259ff7cbd56977b5d511b6e2f5512e2`.
The original lock SHA256 is
`854bdc33762b3f8339fe897c2a9c628aae8da57ef6d63d57705995ee746c1c5c`.
The suite checks pinned primary metadata and input/fixture immutability. All
original graph nodes remain present. Synthetic regression documents are labeled
as trusted test doubles. The separate [modeled independent runtime overlay](../../tests/fixtures/vitest-peer-alignment/modeled-independent-runtimes.json)
adds a synthetic Vitest 3.2.4 workspace alongside the real 4.1.11 contexts, using
48 complete authentic published contracts. Its provenance records cached public
npm document hashes and one acquisition of three additional version documents.
This model does not change the real fixture or attribute a 3.2.4 runtime to Paratix.

The measured implementation gate passed 120/120 cases. Coverage includes the
coherent 4.1.11/coverage 4.1.10 mismatch, erased required reverse peer, full nested
contexts, optional/range behavior, forged peer fields, parser/resource/input
failures, fixed endpoint acquisition doubles, complete immutable module layout,
missing/denied helper independence, read-only CLI/Worker permissions and actual
10-second parser, stdin and acquisition deadlines. Native-aligned data succeeds
without the mutating helper. Tests use pinned metadata offline and never fetch it
live. The owned HTTPS transport double proves client failure/projection policy;
it does not establish live registry availability. Trusted runtime fault copies
prove bounds and permissions separately from the authenticated positive layout.

This is local source evidence. Independent final validation/review, deployment,
credential and publisher policy, required current-head enforcement and consumer
canary activation remain separate gates. Existing preset/helper interfaces and
jobs are unchanged by the checker; local Actions success cannot substitute for
the future trusted consumer alignment status.
