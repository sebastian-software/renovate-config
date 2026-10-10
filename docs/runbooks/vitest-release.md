# Prepare and verify an authenticated Vitest release

Use this runbook for the stock release and native observation contracts behind
[issue #37](https://github.com/sebastian-software/renovate-config/issues/37).
Stock preparation and authority tools read bounded local inputs without
downloading, installing, publishing or starting a worker. The Q2a source harness
additionally starts fixed owned source processes and a rendered test wrapper; it
starts no live worker. Q2b.1a adds a separate bounded original Inspector fixture
with owned local processes; Q2b.1b investigates fixed install/update entry points
in that fixture, also without a live worker. Q2b.1c adds bounded controller-owned
lifecycle diagnostics to the same source fixture. Q2b.1d adds one fixed
pre-cleanup diagnostic pause to original launches. The initial inquiry and later
bounded frame diagnostics failed their authentic dispatch-frame gates on October
10, 2026. The current source correction selects the structural start of `async`
at `312305:36`; the bounded source validation below confirms actual frame
acceptance and pre-cleanup hits. Prepared deployment and the Paratix helper
remain inactive.
Actual production release selection, Linux worker qualification, image/alias
measurements and independent publication attestations remain separate Q2 gates; deployment,
protection and Paratix activation require the separately approved E manifest.

## Keep source identities and observations separate

These containing merged preparation commits were reacquired on October 7, 2026:

| Repository | Containing merged preparation commit |
| --- | --- |
| renovate-config | `9052d39ec8b21a7842e0f6a9350e5cfa456c6ec0` |
| Recensor | `9389d53ca0324ad3f3feeeaad6e920dcccf09aad` |
| Proxmox | `2cb4b8cbda13284b3cd9d48187b70215852c5a1f` |
| Paratix | `1673d92ffb5056be9412830ad3e092f070d3a979` |

They identify merged preparation source, not measurements of those bytes or
selected published runtime releases. Historical candidate source revisions,
bases and receipt hashes keep their original meaning. Q1 source is merged through
[renovate-config #43](https://github.com/sebastian-software/renovate-config/pull/43)
and [Proxmox #182](https://git.dal12.de/fastner/proxmox/pulls/182). These source PRs
do not select a published release, measure an installed image or qualify a Linux
worker. Q2a adds the bounded source harness below; Q2b.0 revises only its native
evidence contract. Q2b.1a adds historical partial original-observer source feasibility;
Q2b.1b completed the bounded entry inquiry below in merged
[renovate-config #47](https://github.com/sebastian-software/renovate-config/pull/47).
Q2b.1c is the retained lifecycle-diagnostic checkpoint from merged
[renovate-config #48](https://github.com/sebastian-software/renovate-config/pull/48).
Q2b.1d is the current bounded pre-cleanup source inquiry. Remaining Q2b.1–Q2b.3
operational observer/facility/qualification, Q2c
independent release/image/attestation selection and E live
actions remain separate gates. Do not treat PR heads as squash or release
identities or pin a future documentation commit into its own contents. A Recensor `v1.1.0` source
version or published tag does not establish that it contains the required code.

## Select trust inputs outside PR execution

The trusted release owner authenticates original origins and complete
preparation/attestation bytes outside PR execution and retains the independent
selection record. Supply the preparation-v1 local file through `--provenance`
with its separately obtained `--provenance-sha256`. Noncandidate stock commands
also require the exact protected selection-v1 bytes through `--selection` and
`--selection-sha256`. Native issuance selects preparation, unchanged profile,
stock release, every proof/event/lock leaf, containing issuer bytes and
image/aliases through its own separately pinned selection.

An HTTPS URL is a locator, not origin authentication. A commit-shaped value,
receipt self-hash, `productionEligible` boolean or locally recomputed selection
pin cannot prove independent execution authority. These tools validate the
preselected local byte chain; they do not discover an authority, contact a
signer or introduce a trust principal. Changing candidate inputs and recomputing
their hashes cannot replace the retained outside selection pin.

Retain all four complete original gzip/tar archives with independent official
checksums or registry integrity records: the supported stock Node/pnpm tuple,
`yaml@2.9.1` and `semver@7.8.5`. Stock `scripts/vitest-release.mjs --help`
lists exact tuples and platforms. Each
checker/helper contains the complete yaml and semver packages at its existing
`createRequire` anchors; the toolchain contains complete original Node and pnpm,
including `bin/pnpm.mjs`. Symlinks must resolve inside their component. Generated
wrappers/metadata and derived runtimes cannot be relabeled as original archives.

The checker/helper entry files, nested `package.json` files and frozen
`pnpm-lock.yaml` files are the six selected source leaves. Their exact Git
bytes, sizes and executable modes must match the selected working source.
Containing packager/transform/issuer records authenticate the complete executing
implementation against actual immutable Git commit objects and selected working
bytes; a tree object or commit URL alone is insufficient. Source and containing
implementation revisions may differ where the contract permits it.

The checker rejects duplicate YAML mapping keys before conversion and retains
its scalar-string key semantics, graph budgets and 10-second deadline. Any
checker correction needs freshly selected source and complete rebuilt inventories.
The [checker runbook](vitest-peer-alignment.md) owns evaluation and result semantics.

## Build, finalize and separately verify stock bytes

Preparation-v1 uses the following contract:

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Integer `1` |
| `sourceRevision`, `sourceOrigin` | Selected Git commit and its exact renovate-config GitHub commit URL |
| `attestationOrigin` | Independently authenticated immutable HTTPS locator; candidate mode requires `null` |
| `artifacts` | Exactly four original stock archive identities |
| `components` | Complete `checker`, `helper`, `toolchain` leaf arrays |
| `toolchain` | Exact versions/platform and relative `nodeEntry`, `pnpmEntry`, `pnpmPackage` |
| `trustScope`, `packager` | Required in noncandidate preparation: `release-owner` and containing `{revision, files}` |

Archive records contain `id`, `name`, `version`, official `origin`, relative
`path`, `sha256` and `memberPrefix`. File leaves contain `path`, `type: "file"`,
`sha256`, `size`, `executable`, `artifact`, `member`; link leaves instead contain
`type: "symlink"` and `target`. Git leaves use `artifact: "git"` with `member`
equal to their repository path. Every other leaf must correspond to the complete
original archive member bytes, size, executable bit or link target. Packager
`files` contain complete implementation `path`, `type`, `sha256`, `size` and
`executable` records.

Stock selection-v1 binds `schemaVersion`, `trustScope`, `provenanceSha256`,
`verifierRevision`, complete `verifierFiles` and the six-leaf `sourceInventory`.
Its `publicationAttestation` binds the same scope/preparation/source/verifier,
`sourceInventorySha256` and `immutableOrigin` matching `attestationOrigin`.
The protected stager additionally retains its independently selected published
Recensor tag/commit and complete Recensor source/attestation contract.

The following commands are templates for an outside owner with already selected
production inputs on supported unprivileged Linux. Paths and uppercase pins
require substitution; no production selection is supplied by this repository.
Keep inputs and their ancestors controlled by the preparation owner.

```sh
node scripts/vitest-release.mjs build \
  --provenance /protected/stock-preparation.json \
  --provenance-sha256 PREPARATION_PIN \
  --selection /protected/stock-selection.json --selection-sha256 SELECTION_PIN \
  --artifact-root /protected/archives --source-root /protected/source \
  --checker-root /protected/checker --helper-root /protected/helper \
  --toolchain-root /protected/toolchain --output /protected/new-stock

node scripts/vitest-release.mjs finalize \
  --provenance /protected/stock-preparation.json \
  --provenance-sha256 PREPARATION_PIN \
  --selection /protected/final-stock-selection.json --selection-sha256 FINAL_SELECTION_PIN \
  --artifact-root /protected/archives --source-root /protected/source \
  --output /protected/new-stock

node scripts/vitest-release.mjs verify \
  --provenance /protected/stock-preparation.json \
  --provenance-sha256 PREPARATION_PIN \
  --selection /protected/final-stock-selection.json --selection-sha256 FINAL_SELECTION_PIN \
  --artifact-root /protected/archives --source-root /protected/source \
  --output /protected/new-stock
```

Build copies into a new read-only bundle, writing Recensor-compatible
`checker/alignment-release.json` v1, helper/toolchain inventories and `release.json`.
The outside owner selects the emitted receipt SHA256 in the final selection's
`releaseSha256`; the receipt does not embed the selection hash, avoiding a cycle.
`finalize` verifies already sealed bytes against that final selection and never
rewrites them. Separate `verify` reconstructs the same receipt and inventories
from the selected inputs. The noncandidate `release-owner` path can emit true
eligibility and a real containing packager revision only after those checks.
This source contract does not supply the currently pending production inputs.

For unpublished candidates, use `--candidate`, `attestationOrigin: null` and the
legacy preparation fields without `trustScope`/`packager`; omit selection flags.
Candidates remain false with a null/pending packager. Normal mode rejects them.
There is no CLI fixture switch. Pure API tests explicitly select `source-fixture`
with `sourceFixture: true`; their reconstructed receipts remain false and cannot
reach normal packaging, protected staging or live runtime verification.

Production requires actual Linux `/proc/self/fd` held-directory traversal.
Darwin candidates report `candidate-unverified-pathname`; explicit source
fixtures report `fixture-unverified-pathname`. Neither proves Linux ancestry
race resistance. Archives are authenticated from the same held compressed stream
that supplies members. Checker/helper budgets are 10,000 leaves, 2 MiB per file
and 64 MiB total each; toolchain budgets are 50,000 leaves, 256 MiB per file and
1 GiB total. Read-only modes also require trusted runtime ownership/ancestors.
Success writes one JSON result; rejection writes bounded stderr and exits 1.

## Freeze native preparation before qualification

The [native preparation CLI](../../scripts/vitest-native-prepare.mjs) authenticates
original pnpm 11.17.0 plus complete containing transform implementation, derives
the instrumented `dist/pnpm.mjs` bundle and freezes the profile before proof:

```sh
node scripts/vitest-native-prepare.mjs \
  --archive /protected/archives/pnpm-11.17.0.tgz --pnpm-root /protected/original-pnpm \
  --output /protected/new-observation \
  --receipt-directory /opt/renovate-native-receipts \
  --context /protected/worker-context.json \
  --context-file /opt/renovate-native-context/context.json \
  --provenance /protected/native-preparation.json \
  --provenance-sha256 NATIVE_PREPARATION_PIN --source-root /protected/source
```

Native preparation with `schemaVersion: 1` and `qualificationContractRevision: 2`
selects `trustScope`, `sourceRevision`,
`sourceOrigin`, containing `transform: {revision, files}` and `original` pnpm
name/version/origin/archive/bundle identities. Selected preparation emits a
nonnull containing `transformRevision`, complete distinct `pnpmFiles` and
`derivedFiles`, authenticated instrumentation, `preparationSha256` and a
read-only `profile.json`. The profile remains `productionEligible: false`.
Without the three provenance/source flags it creates a fresh revision-2 false/null
candidate. Preparation does not install the loader or start a worker.

Keep the original bootstrap `toolchain.pnpmEntry` unchanged. Reconstruction
transforms authenticated original `<dirname(pnpmPackage)>/dist/pnpm.mjs`, not the
bootstrap. The observed runtime is a distinct derived identity. The immutable
observation component has ten leaves: seven selected modules, empty pnpmfile,
derived bundle and unchanged profile. The eight instrumentation records include
the empty pnpmfile. Runtime loading also pins a separately supplied context file.
Issuance requires the fixed receipt/context paths shown above and the exact
existing data-only profile; it cannot edit flags, hashes or inventories.

Qualification must bind wrapper/worker/container and immutable image context,
actual held `/proc/self/exe` identities with differing parent/child interpreter
hashes, read-only complete CLI closure and effective handler dispatch after CLI
switching. The collector retains launch/dispatch/completion and repository/
branch/input-head linkage; the selected Renovate 43 `with-pr` seam maps the actual
SCM branch commit to the eventual PR head. Observation failure preserves the
native outcome and cannot invent successful completion. Unowned delegation,
executable scripts/hooks/configuration/preloads and unsafe stdio stay unsupported.

Complete whole-worker proof needs a separately reviewed, bounded Linux harness
under the existing owner, authentic differing interpreters and unchanged profile.
The Q2a source harness below collects bounded source observations, while complete
controlled Linux qualification remains a Q2b prerequisite. No existing command
supplies complete all-category worker proof; partial identity/data-only suites
cannot be combined into it. Native worker qualification is **UNRUN**.

## Use qualification contract revision 2 for new native evidence

Q2b.0 corrects the fixed pnpm 11.17.0 delegation evidence contract in source.
Native preparation selections, newly frozen profiles, probe/collector records,
worker inputs/reports, authority selections, retained proofs/raw events and
issued authorities explicitly carry `qualificationContractRevision: 2` while
`schemaVersion` remains 1. Loader, issuer, JavaScript runtime and Python host
consumer reject missing, unknown or mixed revisions on this path. Stock release
schemas and wrapper container receipts retain their separate contracts.

The authenticated original `switchCliVersion` returns both when the requested
version already equals the running version and when the resolved version equals
it. Only another resolved version reaches `cross_spawn`. The profile's
`delegationSource` records authenticated byte offsets for both returns, the
spawn seam and handler dispatch; the issuer recomputes these facts from the
selected original bundle. Static control flow alone proves no runtime absence.

Each install/update/dedupe delegation slot now requires two distinct retained
observations. The lifecycle case selects the negative record as `evidence` and
the normal same-version record as `sameVersion`; all 48 slots are preserved:

- The `delegation-same-version` record retains authentic ordered launch,
  dispatch and completion. Its `delegationAbsence` observation spans the full
  launch-to-completion lifecycle, binds the source-flow hash and frozen version,
  and proves zero switch children. Independent `descendants` and `cleanup`
  records must account for the entire observed lifecycle with no unknown or
  surviving child. A source fact or an empty child list alone is insufficient.
- The `delegation-rejection` variant retains launch, genuine
  `unowned-delegation` rejection, an independently observed `nativeTerminal`,
  descendant accounting and cleanup in order. It binds the actual native
  exit/signal and concrete lock bytes without inventing dispatch or completion.
  Any child that ran needs correlated parent/child PIDs and invocation IDs,
  unchanged held interpreter identity, observed ineligible CLI identity, actual
  outcome and independent cleanup. Each `child.terminal` reference must select
  separate retained `childTerminal` event bytes with matching parent/child PID,
  invocation, interpreter, CLI, outcome and bounded lifecycle order; a completion
  flag or outcome in the descendants summary alone is insufficient. Unknown, replaced, incomplete or
  uncorrelated children fail the case.

`caseVerdict: "expected-negative"` assesses the qualification case separately
from native `state: "unsupported"` and `receiptEligible: false`. The probe
invalidates evidence; it does not prevent native execution. After the probe
rejects delegation, the original `cross_spawn` still continues. This correction
permits no additional CLI version or implicit download/install.

Freeze a new revision-2 profile before fresh observations. Existing frozen
profiles, proofs and receipts retain their original bytes and semantics; do not
repin, convert, relabel or promote them to revision 2. This path explicitly
rejects legacy evidence. Source fixtures remain `source-fixture`, false-eligible
and incomplete, with zero operational `PASSED` and no complete proof pair.
The source collector still reports missing paired observations as unsupported.
Offline archive/source oracles and documentary consumer roundtrips test this
contract; they are not negative CLI execution or runtime qualification.

The complete authentic original-phase observer and operational worker adapter
(Q2b.1), beyond the partial Q2b.1a source prototype below,
selected facility/action manifest (Q2b.2), actual Linux qualification (Q2b.3),
independent immutable release/image/attestation selection (Q2c) and activation
(E) remain pending. Real namespaces, image identity, mounts and complete
native/descendant/cleanup measurements remain required. Deployment defaults,
release selections and the Paratix helper stay inactive.

## Run the bounded Q2a source harness

Use the [fixed driver](../../scripts/test-vitest-native-worker.mjs) for source
collection with already authenticated local inputs. It accepts `--inventory`
alone, or `--input`, `--input-sha256` and `--output` together. Input/output paths
must be absolute, bounded safe paths; output must be new and distinct from
protected inputs. Select the lowercase 64-hex SHA256 independently before
observation. Optional `--source-fixture` changes no validation, launcher or scope;
the selected input itself must be `source-fixture`. There is no `--help`, arbitrary
command, environment, endpoint, version switch or production fallback.

The collection command below is a template: replace paths and `INPUT_PIN` with
the selected readonly input and its outside pin. Inventory and the portable
source oracle require no collection inputs:

```sh
node scripts/test-vitest-native-worker.mjs --inventory
node scripts/test-vitest-native-worker.mjs \
  --input /protected/source-fixture-input.json --input-sha256 INPUT_PIN \
  --output /protected/new-source-observation
node scripts/test-vitest-native-worker-source.mjs
```

Inventory exits 0 without launching collection. The fixed collection invokes the
actual selected Renovate 43.288.0 manager → util/exec → execa, parent Node 24.18.0
and authentic differing native Node 24.21.0 with pnpm 11.17.0. The original physical
stock CLI remains unchanged; the derived loader authenticates that original and
transforms its bundle in memory to the frozen derived identity. A complete
physical derived distribution is separately validated, not substituted for that
execution route. Missing authentic stock phase evidence and the paired
revision-2 delegation observations remain unsupported.

Wrapper/container/image and requested mount values are source doubles. They
establish no worker namespace, immutable image or four observed readonly mounts.
Context is sealed after source CID capture and pinned before first loader import;
that order alone does not prove a Linux worker. The callback reuses existing
rendered wrappers but executes native collection only in full/github-org. Targeted
is rendered; genuine targeted wrapper execution belongs to the separate existing
55-case full/targeted suite. Production `native_precreate`, issuer, host/runtime
verifier and deployment renders retain strict release-owner authority and contain
no source callback.

The report retains exactly six baseline and 42 derived lifecycle slots, always
`completeness: false` and `productionEligible: false`, with no operational `PASSED`
and no complete compatibility/lifecycle proof pair. Missing, failed, unsupported
or unrun slots make qualification exit 1. The output retains a bounded
`qualification-summary.json` and supporting raw/lock/receipt references; native
outcomes remain separate from manager or observer failure. CLI stdout reports
source scope and missing slots, while rejection uses bounded stderr and exit 1.
A source test can exit 0 by checking that expected incomplete result; that success
supplies no qualification or release authority. Overbudget, drift, observation or
report-write failure remains non-success rather than truncated successful output.

Inputs and complete containing source, four component and module inventories are
pinned and readonly before and after collection. Fresh matching preparation and
profile are frozen before any observation; measured bytes are never repinned.
Original archives and both complete runtime distributions require independent
outside selection and stock provenance, not a self-selected hash or `--version`
claim. Protected and output roots cannot overlap. The auxiliary Python capsule
contains frozen Jinja2/PyYAML/MarkupSafe modules and required metadata, isolated
`-B -I` startup, no ambient site or startup hooks and one pinned existing base
alias. The opt-in collection test currently supports Darwin arm64 with the fixed
existing Python 3.14.8 base; nearby versions and general `@` paths are rejected.
Its external base/stdlib is not a new authenticated Linux distribution or worker
image proof. Missing prerequisites fail; no auxiliary install or interpreter
fallback occurs.

| Source harness limit | Bound |
| --- | --- |
| Default input JSON / summary | 2 MiB / 64 KiB |
| Retained raw evidence | 1,000 files, 1 MiB per leaf, 64 MiB total |
| Controlled workspace | 32 files, 1 MiB total |
| Source-control observations | 4 KiB per record, 32 KiB total, 64 registrations |
| Context plan / context / launch JSON | 4 KiB each |

Typed authenticated stock provenance uses its existing 16 MiB limit; larger
stock/observation/Python component inventories retain their component-specific
count/byte limits. The default input bound is not universal. Authentication is
count/byte bounded, not a whole-OS wall-clock guarantee. The public 900-second
execution timer starts after preflight; individual manager execution is bounded
to 45 seconds, wrapper/callback to 890/840 seconds. Manager retirement preserves
up to two seconds of TERM grace before hard KILL, followed by a two-second group
disappearance/reap check. This cleanup covers owned observed source groups, not
operational Linux descendant containment or an uncatchable public-owner KILL/OS
failure.

The opt-in [collection test](../../scripts/test-vitest-native-worker-collection.mjs)
requires five fixed prerequisites: complete selected archives (Node 24.18.0,
pnpm 11.17.0, yaml 2.9.1 and semver 7.8.5), the independently pinned original Node
24.21.0 Darwin arm64 archive, existing complete Renovate 43.288.0 modules and the
matching Proxmox wrapper source. Run it with existing authenticated Node 24.18.0
on Darwin arm64; replace paths and `NATIVE_ARCHIVE_PIN` below. It creates a fresh
frozen source/wrapper capsule and reports its root. The
[process regression](../../scripts/test-vitest-native-worker-process.mjs) accepts
only `--fixture` for that generated capsule, checks its driver against current
owned source bytes and creates fresh preparation/profile/output per observation:

```sh
node scripts/test-vitest-native-worker-collection.mjs \
  --archives /authenticated/test-archives \
  --native-archive /authenticated/node-v24.21.0-darwin-arm64.tar.gz \
  --native-archive-sha256 NATIVE_ARCHIVE_PIN \
  --renovate-modules /authenticated/renovate43/node_modules \
  --wrapper-root /authenticated/proxmox-source
node scripts/test-vitest-native-worker-process.mjs \
  --fixture /authenticated/generated-source-fixture
```

The collection test bounds its driver subprocess to 910 seconds. The process test
bounds each spawned driver to 180 seconds and samples genuinely owned STOPped
native groups within 2.3 seconds after manager resume, before postflight. Final
report/cleanup waits are separately bounded to 20/5 seconds; setup/preparation
retains authenticated byte/count bounds outside execution timers. Native groups
remain stopped until owner KILL or finally cleanup, excluding natural network or
deadline exit as a cleanup explanation. This is local source evidence only.
Source CI adds the portable source oracle above; these Darwin collection/process
tests are separate opt-in checks.

The October 8, 2026 source checks retained twelve genuine manager invocations,
seven derived native receipts and 46 raw leaves, disjoint concurrent invocation
IDs and unchanged profile bytes. Wrapper exit was 0 and qualification exit 1:
all 48 slots remained missing (19 `UNSUPPORTED`, 29 `UNRUN`, zero `PASSED`). Four
causal owned-process cases passed: original/derived enclosing collection KILL,
original public TERM and derived public INT. Genuine incomplete/unsupported native
receipts remained ineligible; sent signals did not replace unknown recorded
outcomes. These checks do not qualify a Linux worker or select production inputs.

## Inspect the bounded Q2b.1b original-source entry inquiry

The [separate fixture CLI](../../scripts/test-vitest-native-original-observer.mjs)
measures feasibility with existing authenticated Node 24.18.0/V8 and pnpm 11.17.0.
It starts fixed original and derived install/update/dedupe processes in newly
created disposable workspaces. Only original processes receive a fixture-owned
ephemeral loopback Inspector endpoint; derived processes keep the existing
loader without debugger flags. Loopback is a trusted local test boundary, not
operational exclusion from job-controlled processes or descendants.

Select a readonly input document and its independent lowercase 64-hex SHA256,
then a new absolute output path. This invocation is a template; replace the paths
and `INPUT_PIN` with those preselected local values:

```sh
node scripts/test-vitest-native-original-observer.mjs \
  --input /authenticated/original-observer-input.json --input-sha256 INPUT_PIN \
  --output /authenticated/new-original-observation
```

These are the only three CLI options. Unknown, duplicate or missing options,
including `--help`, fail. Input schema 1 requires `qualificationContractRevision:
2`, `evidenceScope: "source-fixture"`, `node`, `pnpm`, `controllerFiles` and
`fixtureRecipe`. The node record pins path, SHA256, version, V8 and an authenticated
archive; the fixed existing Darwin arm64 executable also has an explicit pinned
no-archive path. The pnpm record selects archive and complete readonly root.
The controller closure is the exact sorted fixed file/hash inventory. Only
`empty-v1` and `offline-miss-v1` fixture recipes are accepted; their package data,
argv and environment are generated internally. Input cannot choose commands,
configuration, debugger methods, expressions, credentials or endpoints.

Preflight authenticates the complete original pnpm archive/extraction, selected
Node bytes and version/V8, original bundle and controller closure. Protected
inputs and the new output cannot overlap. The controller additionally hashes the
actual debugger script source and requires each source-selected token to be
independently reported executable by `Debugger.getPossibleBreakpoints`, resolved
to exactly its authenticated script, line and column, and actually hit. Unknown
source, protocol or location is unsupported; there is no nearest-breakpoint fallback. Held identities and
source inventories are rechecked. This authenticates source-fixture bytes, not a
kernel measurement of the child executable or an immutable worker image.

The finite protocol permits only `Debugger.enable`, `Debugger.setBreakpointByUrl`
with the fixed URL and unconditional location, `Debugger.getScriptSource`,
`Debugger.getPossibleBreakpoints`, `Debugger.resume` and
`Runtime.runIfWaitingForDebugger`. Evaluation, getter invocation, conditions,
value mutation, live edits, script injection and protocol passthrough are absent.
Only bounded normalized locations/events, identities, counts, output hashes and
native facts are retained; raw frames, locals, environment and transcripts are
not written to reports.

Q2b.1b selects one fixed entry candidate per category from the authenticated
original bundle. The selector requires a unique handler body and unique own-body
anchor, and rejects an entry after an `await` or `yield`:

| Category | Handler | Fixed entry token | Path limit |
| --- | --- | --- | --- |
| install | `handler5` | `{` in its own `const include = {` | After the global guard, before its first await |
| update | `handler13` | `update` in `return update(params, opts3, rebuildHandler);` | Normal non-global, noninteractive path, before suspension |
| dedupe | `handler6` | `{` in its own `const include = {` | Retained existing entry anchor before its first await |

These body points show that execution reached the named path; they do not prove
the first instruction, unexecuted branch coverage or a nested operation's outcome.
An unsupported fixed point stops that observation without candidate search,
nearest-location relocation or success fallback.

A pre-call pause proves only that execution reached the call site. Handler entry
requires the exact executable and resolved location, its actual breakpoint hit
and the current named handler frame in the authenticated original script. A
separate caller frame must belong to that same script at the original dispatch
pre-call line; the existing caller rule does not require its continuation column
to equal the pre-call token column. Entry must follow the invocation's pre-call
pause; duplicate, replayed, late and uncorrelated phases are rejected. Successful
handler settlement uses a separate authenticated post-await success continuation. Neither native exit nor matching lock bytes
substitutes for entry or settlement. Rejected settlement lacks an authenticated
error observation and remains a missing claim. Controlled debugger detach at
native shutdown is retained separately; observation failure cancels only the
owned fixture, with the resulting signal and observer intervention recorded
apart from natural native completion. Unexpected programming errors remain
execution failures rather than legitimate unsupported feasibility. Expected
pre-connection disconnect, cancellation, timeout and output-bound failures use
recognized observation errors and preserve native facts. The actual controller
early-abort regression retains launch, cancelled failure and native terminal for
all three original/derived pairs, with handler phases still missing. A separate
native-before-endpoint case retains natural exit 7 as a disconnect; real lifetime
and output-bound cases retain their attributable cancellation outcomes.

| Original-observer bound | Limit |
| --- | --- |
| Input / normalized summary | 64 KiB each |
| Normalized events / pauses / protocol commands | 32 / 8 / 32 |
| Protocol messages / one message / aggregate bytes | 4,096 / 20 MB / 40 MB |
| Original endpoint setup / connection and protocol operation | 10 / 5 seconds each |
| Each native process lifetime / cleanup wait | 30 / 3 seconds |
| Combined stdout/stderr per process | 128 KiB |

Authentication has byte/count bounds outside process timers; these limits do not
promise a whole-workflow wall-clock deadline. Cleanup reports cover owned
processes and process groups, not independently observed arbitrary descendants.
Leader terminal and group retirement are separate. Cleanup checks its own group,
escalates TERM to KILL after 500 ms and requires empty-group confirmation within
its bound; unconfirmed cleanup prevents completion. An acknowledged same-group
child ignoring TERM after leader exit is covered by a real regression, including
repeated stop/finalization and independent group readback. Child retirement does
not rewrite the naturally exited leader's outcome. This covers the owned local
fixture group only; escaped or unobserved descendants remain unproved.
The CLI writes a new bounded `summary.json` and prints its source scope/state;
exit 0 can represent an honest unsupported result. Invalid input or unexpected
execution failure produces bounded stderr and exit 1. A partial output is retained
for inspection; retry only into a fresh output after resolving the cause.

Historical Q2b.1a measurement (October 8, 2026): the Darwin arm64 empty-fixture
smoke authenticated the actual script source in all three original processes. Dedupe retained distinct launch,
pre-call, handler entry, successful await continuation and native exit 0. It
required controlled debugger detach at shutdown; no signal intervention occurred,
and the derived exit and concrete lockfile hash matched. Install/update could
not independently confirm the exact selected entry token, including the
source-selected `opts3.global` operand. They retained missing pre-call/entry/
settlement claims and an explicit observer-caused SIGTERM; their derived processes
exited 0. These cancelled originals are not natural completion or compatibility
success. All six owned process groups were empty on local readback.

The historical Q2b.1a `offline-miss-v1` fixture additionally exercised native
errors. Dedupe retained handler entry and natural exit 1 matching its derived
comparison, but successful settlement was missing: its report was `incomplete`.
This was no authenticated handler-error/settlement observation. Install/update
retained the same exact-token unsupported result and observer SIGTERM, separately
from derived exit 1. Both fixed recipes kept source-only ineligibility; all twelve owned
process groups were empty after the actual recipe tests.

The [documentary source test](../../scripts/test-vitest-native-original-observer-source.mjs)
separates 40 documentary event/order/missing/promotion negatives, 25 synthetic
source-parser negatives and 32 synthetic executable/resolution/frame/caller
correlation negatives. The parser and correlation cases call pure internal seams
shared with the controller; they create no Inspector target and measure no
runtime feasibility. The immutable fixture also checks three authentic source
selections and four altered-byte variants. Altered bytes fail authentication
before parsing; they are not parser-negative coverage.
The [process regressions](../../scripts/test-vitest-native-original-observer-process.mjs)
check actual endpoint loss, own-group retirement, bounds and controller early
abort. The [immutable fixture suite](../../scripts/test-vitest-native-original-observer-fixture.mjs)
checks prelaunch input/CLI rejection and both real recipes. Its test-only
`--source-selection-only` option runs authenticated selection and byte rejection
without native recipes; it is not an option on the three-flag fixture CLI.
For the fixed existing Darwin arm64 source recipe, bind `q37_node` to the
already authenticated Node 24.18.0 executable, `q37_archives` to the existing
archive directory and `q37_pnpm` to the complete readonly pnpm root. Reverify the
selected Node SHA256 `ee6fb0e015284d83a91e8ec5213f43a157f8a392b58555301682892ba928c04a`,
V8 `13.6.233.17-node.50`, pnpm archive SHA256
`644eb5079654e87dae59a07e62d7f098162b9ce58f06077328b5ddefca1c8541`
and `dist/pnpm.mjs` SHA256
`228451e6383cf4df0700fc19b37aba1a25e6540e62fbca70ca2d76b719a4d883`.
The approved input receipt supplies the local paths; these variables select
pre-existing inputs, not resources to provision. Missing or mismatched inputs
stop the run without acquisition or substitution.

```sh
"$q37_node" scripts/test-vitest-native-original-observer-source.mjs
for q37_case in native-before-endpoint owned-group output-bound lifetime-timeout group-failure-diagnostic post-term-terminal-sequencing; do
  "$q37_node" scripts/test-vitest-native-original-observer-process.mjs --case "$q37_case" || exit
done
"$q37_node" scripts/test-vitest-native-original-observer-process.mjs \
  --case early-cancel --archives "$q37_archives" --pnpm-root "$q37_pnpm"
"$q37_node" scripts/test-vitest-native-original-observer-fixture.mjs \
  --archives "$q37_archives" --pnpm-root "$q37_pnpm"
```

The five actual-process selectors are `native-before-endpoint`, `owned-group`,
`output-bound`, `lifetime-timeout` and `early-cancel`. The additional
`group-failure-diagnostic` and `post-term-terminal-sequencing` selectors inject
synthetic permission/order failures; they are separate preservation evidence.
The ordinary full fixture command runs both `empty-v1` and `offline-miss-v1`.
The optional `--source-selection-only` fixture check does not replace either
recipe or the process checks. `q37_archives` contains `pnpm-11.17.0.tgz`.
No Node archive is selected in this fixed Darwin recipe. The separately
established Linux source CI supplies its authenticated original Node archive
through `--node-archive`; it is not Linux operational qualification. The tests
acquire nothing. Existing
`vitest-native-observation-local` source CI already invokes the source, process
and full immutable fixture suites using its already selected Node 24.18.0/pnpm 11.17.0 archives and stock root. Its final step
freezes only the job's disposable stock fixture readonly after existing checks.
No new acquisition, runner, service or permission is introduced. The merged
Q2b.1a source PR [#46](https://github.com/sebastian-software/renovate-config/pull/46)
retains five successful hosted source checks. Those Q2b.1a checks and local
Darwin results alone did not establish Q2b.1b execution or Linux worker qualification.
Q2b.1b changes no CI invocation or wiring.

The final Q2b.1b ordinary, unwrapped full fixture suite on the repaired
process helper passed on October 8, 2026 with exit 0. It exercised both real recipes, three authenticated source
selections, four altered-byte authentication cases, 25 preflight cases and five
actual CLI rejection cases; no execution failure was returned. This is a source
fixture assertion pass. Both recipe summaries remain `unsupported`, incomplete
and ineligible; matching native outcomes or locks alone cannot supply missing
settlement claims.

The table records the final repaired-candidate ordinary run, not a prior
checkpoint or instrumented diagnosis.
Every original authenticated its actual debugger script and retained the fixed
pre-call and handler-entry observations. Derived processes retained native facts
without debugger observation; original entry/success claims cannot be transferred
to them. Native outcomes are shown as original / derived. “None” refers to signal
intervention; controlled debugger detach remains a separate timing intervention.

| Recipe | Category | Original state | Original entry / success | Native outcomes | Observer signal intervention | Original / derived locks | Owned original / derived groups |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `empty-v1` | install | `unsupported` | observed / missing | SIGTERM / exit 0 | timeout → SIGTERM | present, equal SHA256 | empty / empty |
| `empty-v1` | update | `supported` | observed / resolved | exit 0 / exit 0 | none | present, equal SHA256 | empty / empty |
| `empty-v1` | dedupe | `supported` | observed / resolved | exit 0 / exit 0 | none | present, equal SHA256 | empty / empty |
| `offline-miss-v1` | install | `unsupported` | observed / missing | SIGTERM / exit 1 | timeout → SIGTERM | absent / absent | empty / empty |
| `offline-miss-v1` | update | `incomplete` | observed / missing | exit 1 / exit 1 | none | absent / absent | empty / empty |
| `offline-miss-v1` | dedupe | `incomplete` | observed / missing | exit 1 / exit 1 | none | absent / absent | empty / empty |

All three empty-recipe lock pairs retained SHA256
`17c814b167307942d3609c7b9d916ceddb85839573ab39baa114e30edb132a1a`.
Empty update/dedupe and offline update/dedupe required controlled debugger detach
at native shutdown. Install reached its selected entry in both recipes but timed
out before settlement and was cancelled by the observer; its original terminal
is not natural completion or compatibility success. Offline update/dedupe
retained natural exit 1 matching their derived comparison, without authenticated
rejected handler settlement. Missing offline locks do not constitute concrete
lockfile equivalence proof. All twelve owned leaders exited and their groups were
confirmed empty by helper finalization and separate fixture readback. This is
owned local group cleanup, not independent observation of all descendants.

The earlier Q2b.1b attempt was **ABORTED on October 8, 2026** after two ordinary
full-suite failures with `kill EPERM` and exit 1. Both retained `actualRecipes: 0`
and no returned semantic case or PID/group receipts. Their underlying OS cause
and cleanup remain **UNKNOWN**. An initial resumed ordinary checkpoint later
passed both recipes with twelve confirmed empty owned groups; it did not
establish final acceptance. The separate earlier instrumented diagnosis remains
**DIAGNOSIS ONLY**, excluded from ordinary semantic proof and from cleanup claims
for unrecorded groups.

A subsequent independent ordinary run and a bounded discriminatory ordinary run
again failed with EPERM during offline install after completing the empty recipe.
Each retained six confirmed empty groups for its completed recipe, but cleanup
of its failed original remains **UNKNOWN**. The discriminator observed the owned
PID and actual PGID both as 96848, matching observer UID and process state `Z`,
after TERM and before Node reported the native terminal. Its failing operation
was the post-TERM negative-group signal-0 probe, not TERM or KILL. This establishes
the premature probe ordering in that measured run; it does not establish a
broader kernel defect or sandbox cause. State `Z` alone is neither a retained
native terminal nor group-empty confirmation. Earlier failed PID 80611 and the
discriminator PID 96848 keep their unknown cleanup; later absence or a successful
run cannot retrospectively establish their group retirement.

The minimal helper repair gates post-TERM retirement probes on the existing
owned-leader exit observation, then continues the actual group-empty check.
It waits for exit rather than pipe closure because descendants may retain pipes.
The initial group probe, negative-group TERM/KILL targets, 500 ms escalation,
three-second cleanup bound and 20 ms polling remain unchanged. After leader exit,
plain timed polling avoids a resolved-promise busy loop. ESRCH alone means an
empty group; other group errors retain the original thrown object and fail.
A dedicated `post-term-terminal-sequencing` regression failed before this repair
and passed after it, preserving the actual SIGTERM terminal and post-exit ESRCH
readback. Its synthetic pre-exit EPERM guard tests ordering; it is separate from
the normal-run failure observation and the five actual process gates.

Failure-only diagnostics retain sanitized process-group context without changing
kill arguments or turning EPERM into an unsupported observation. Only a failed
group operation triggers a fixed owned-PID `ps` identity probe, bounded to 250 ms
and 1,024 bytes. Its diagnostic subprocess alone uses SIGKILL on timeout. Reports
retain a UID-match boolean rather than raw UID, a bounded process state and an
actually observed PGID or explicit unavailable/null fields. No raw process log
or ordinary native-path identity polling is added. The separate synthetic
`group-failure-diagnostic` regression passed after the sequencing repair,
checking unchanged error identity and real owned-group cleanup; it does not
replace a normal OS failure measurement.

Final fixed-candidate checks passed all 97 documentary source negatives
(40 report/state, 25 selector and 32 correlation cases) and all five actual
process gates with exit 0: `native-before-endpoint`, `owned-group`, `output-bound`,
`lifetime-timeout` and `early-cancel`. Their ten owned groups were confirmed empty;
the two additional synthetic regressions above remain separate evidence.
Neighboring worker-source, release-trust, native-runtime, 19-case collector and
native-prepare checks also passed. Darwin ancestry and Linux process proof remain
unsupported; the optional real Renovate module was not supplied, and the unchanged
Darwin-unsupported native-identity check was not rerun. Independent exact-source review subsequently completed, and
[renovate-config #47](https://github.com/sebastian-software/renovate-config/pull/47)
merged on October 8, 2026 with five successful hosted source checks. Its final
PR source head is `7377d1293151c4f0292df89319ded6ffdba0554a`, not a squash
commit, selected release or operational receipt. Q2b.1b is complete as a source
entry inquiry; install success and authenticated rejected settlement remain
missing. Historical measurements and unknown-cleanup records above retain their
original scope. Source completion does not complete issue #37.
An unexpected regression or unknown cleanup fails the source check. Empty install
success still requires independent entry and success observations with unforced
matching terminal and lock facts. Offline exit 1, `finally`, an outer catch or
printed errors cannot authenticate rejected handler settlement. That claim
remains missing pending a separate reviewed mechanism; Q2b.1b adds no exception
pauses, async stacks, protocol methods or privileges.

The historical Q2b.1a aggregate source result was `unsupported`. Every report keeps
`qualificationContractRevision: 2`, source-fixture scope, `completeness: false`
and `productionEligible: false`; promotion is rejected. Unit-test success is not
an operational `PASSED`, complete proof pair or authority. Debugger pauses and
detach change timing. Kernel executable identity, full descendant accounting,
worker namespaces, immutable image, observed mounts, independently enforced
data-only execution, independent cleanup and debugger access exclusion remain
unproved. Operational adapter/facility/Linux qualification (remaining Q2b.1–3),
Q2c release selection and E activation remain pending. Existing production debug
and authority gates stay strict, with deployment and release defaults inactive.

## Inspect Q2b.1c lifecycle diagnostics without inferring a cause

Q2b.1c records bounded controller callback and continuation order at the existing
original-observer protocol/process sites. It preserves the same three selected
source breakpoints, exact script/frame/caller checks and six Inspector methods.
It adds no protocol traffic, exception mode, evaluation, property inspection,
Promise reaction, target hook, dependency or execution authority. Existing
native timers, Promise races, listener ownership, error identity and cleanup
rules remain unchanged. Diagnosis does not repair a suspected install cause.

Each original and derived envelope has a separate `lifecycleDiagnostics` object;
the semantic `report` keeps its existing shape. The diagnostic header identifies
`recipe`, `category`, `role` and fixed `launch` number (install 0/1, update 2/3,
dedupe 4/5 for original/derived). It retains `state`, `reason`, `events`,
`firstFailure`, `lastResumeIssued`, `lastResumeAcknowledged` and
`missingObservations`. Events share one launch-local sequence and finite
monotonic elapsed-millisecond offsets. These are controller observation times,
not target timestamps, a global ordering across launches or cross-process
causality proof.

The closed vocabulary distinguishes connection, command-response and
notification-wait origins; endpoint setup and native lifetime failures; fixed
method/request linkage and matching response acknowledgement; the existing
stderr shutdown-cue callback; native exit and stream close; controller receipt;
intentional protocol-close request and actual socket close; cancellation/stop,
owned signal and confirmed empty group. `firstFailure` points to the earliest
recorded originating failure and survives later fan-out. Resume issuance and
acknowledgement remain distinct; an acknowledged error response is marked
`accepted: false`. An intentional close request is not confirmed debugger detach,
and the shutdown string is not handler success. A cue can be recorded without
the observer ever receiving it; an exited leader does not prove closed streams
or an empty group. Missing observations remain listed without new waits.

| Lifecycle diagnostic bound | Limit |
| --- | --- |
| Events per original/derived launch | 96 |
| Complete diagnostic object, including header | 8,192 UTF-8 bytes |
| Fields / serialized bytes per event | 12 / 512 |
| String value | 64 UTF-8 bytes, with narrower closed vocabularies |
| Local elapsed offset | 0–120,000 ms; native timeouts remain unchanged |
| Enclosing ordinary summary | 65,536 bytes |

Synchronous recording stops with explicit `unavailable` on invalid input, clock
or recorder failure, or `truncated` on count/byte overflow. Bounded terminal
status space is reserved inside the diagnostic byte limit. Neither condition
replaces a native error, intervention, terminal or cleanup fact. Required source
checks reject missing, unavailable or truncated diagnostics as successful
diagnostic completion; an actual cue or socket-close callback that never
occurred may remain explicitly missing. `available` means the recorder worked,
not that every event occurred or semantic evidence is supported.

Diagnostics retain only fixed normalized fields. They contain no raw Inspector
messages, frames, scopes, local values, stderr, endpoint, paths, arguments,
environment or wall-clock timestamps. They cannot grant semantic support,
operational completeness or eligibility. Existing outer reports remain schema1,
`qualificationContractRevision: 2`, source-fixture scoped, `completeness: false`
and `productionEligible: false`. Worker/proof/authority gates stay strict.

The focused source command has passed the retained 97 baseline negatives plus
8 lifecycle seam cases and 29 diagnostic negatives. These cases drive the real
protocol/process helper implementation with owned synthetic sockets, timers and
children; globals and builtin bindings restore afterward. They distinguish
connection/request/notification origins, acknowledgement/replay, concurrent
launch correlation, throwing recorders, cue before/after lifetime timeout and
exit before stream close. They test recording rules, bounds and nonpromotion;
they do not observe real pnpm execution or establish an install cause.
The ordinary fixture and process tests now require available, bounded,
correctly correlated diagnostics alongside their existing native/lock/error and
independent owned-group assertions. Synthetic failure cases remain separate
from the five actual-process gates and both authentic ordinary recipes.

**Q2b.1c native measurement checkpoint: PASSED on 9 October 2026.**
An independent nonauthor validator ran all 14 commands against the authenticated
frozen inputs: the focused source check, five actual-process cases, two separate
synthetic process cases, both ordinary recipes in one command, and five
neighboring owner checks. All exited 0. The source check retained its 97 baseline
negatives plus 8 lifecycle seam cases and 29 diagnostic negatives. All 12
ordinary original/derived envelopes had available, bounded, correctly correlated
diagnostics. The following sequence numbers belong to each original launch;
`none` means no first originating failure was recorded.

| Recipe / category | First origin | Last resume issued / acknowledged | Shutdown cue / controller receipt | Missing observations |
| --- | --- | --- | --- | --- |
| `empty-v1` install | Notification-wait timeout, sequence 42; no command method | 12 / 12 | 51 / absent | `controller-shutdown-receipt` |
| `empty-v1` update | none | 13 / 13 | 46 / 47 | none |
| `empty-v1` dedupe | none | 13 / 13 | 46 / 47 | none |
| `offline-miss-v1` install | Notification-wait timeout, sequence 42; no command method | 12 / 12 | absent / absent | `shutdown-cue`, `controller-shutdown-receipt` |
| `offline-miss-v1` update | none | 12 / 12 | 42 / 43 | none |
| `offline-miss-v1` dedupe | none | 12 / 12 | 42 / 43 | none |

For both installs, the controller received the failure at sequence 43, requested
protocol close at 45, sent owned SIGTERM at 49 and observed socket close at 50.
For `empty-v1`, the shutdown cue followed at 51, native exit at 52 and stream
close at 57; controller shutdown receipt remained missing. For
`offline-miss-v1`, native exit followed at 51 and stream close at 52, with both
cue and controller shutdown receipt missing. Neither install recorded a native
lifetime origin. Both last resume requests had matching acknowledgements. The
shared notification-wait origin describes these observed observer failures; it
does not establish a shared underlying install cause.

For the four update/dedupe originals, cue and controller receipt preceded close
request and socket close, which preceded native exit and stream close. The
`empty-v1` order was 46, 47, 48, 52, 53, 54; the `offline-miss-v1` order was
42, 43, 44, 48, 49, 50. Repeated close requests were also retained (sequence 50
and 46 respectively). Derived launches recorded no protocol commands and
retained their natural terminal outcomes. These callback/continuation sequences
do not measure target execution timing or establish causal pnpm behavior.

Semantic/native outcomes and lock comparisons matched the retained #47 matrix
above. Both original installs remained unsupported with timeout intervention
and SIGTERM, against derived natural exit 0 for `empty-v1` and exit 1 for
`offline-miss-v1`. The other four originals retained `empty-v1` supported success
with exit 0 and `offline-miss-v1` incomplete outcomes with exit 1. Empty-recipe
lockfiles remained present and byte-equal; offline lockfiles remained absent,
which supplies no concrete lockfile proof. This comparison asserts no unchanged
timing, causal install repair or rejected-settlement mechanism.

The independent validator read back all owned groups as `EMPTY`: 10 groups
across the five actual-process cases, 12 ordinary-launch groups and 3 distinct
groups across the two separately classified synthetic cases. The earlier
historical `UNKNOWN` cleanup receipts remain unchanged. Local validation and
authenticated chronology/native/lock receipts are retained at
`/private/tmp/apply37-q2b1c-orchestrator/validation-results.json` and
`/private/tmp/apply37-q2b1c-orchestrator/final-measurements.json` respectively.

The optional real Renovate invocation remains absent; Darwin ancestry and Linux
proof remain unsupported. This source-only revision-2 checkpoint grants no
operational completeness or production eligibility. Causal repair and
error-mechanism selection remain subsequent planning gates; operational adapter,
facility, qualification, release selection and activation remain unreleased.

## Inspect the Q2b.1d pre-cleanup diagnostic boundary

**Initial Q2b.1d bounded inquiry: FAILED on October 10, 2026.** The authentic
dispatch-frame gate rejected the selected callable identity. This retained,
unaccepted local inquiry evidence permitted no source acceptance or PR from
that failed run.
The preceding Q2b.1c checkpoint remains historical. Deployment and the Paratix
helper remain inactive.

The independent source-contract command exited 0. Exactly one ordinary fixture
command ran and exited 1, failing the retained assertion `Established genuine
original call and handler entry must remain observed`. Only `empty-v1` launched
its three original/derived pairs; `offline-miss-v1` remains UNRUN. The remaining
12 of 14 required invocations were SKIPPED after the frame gate failed. No
fallback, replacement identity or additional measurement followed.

All three originals authenticated the pinned bundle, completed four fixed
breakpoint setup and four one-character possible-location operations with
accepted acknowledgements, and resolved exactly `preCall`, `entry`, `preCleanup`
and `settlement`. Each then reported `Original dispatch frame differs from
authenticated pre-call callable` before accepting a semantic pre-call or handler
entry. No pre-cleanup hit or successful continuation was observed. Each original
retained `location` intervention, actual SIGTERM and the missing `pre-cleanup`
marker; all three derived processes exited naturally 0 without Inspector events.
The predicate's rejection in this run establishes neither V8 impossibility nor
an implementation-assertion error as its cause. Actual frame payloads were not
inspected or persisted.

Each original's first origin was `observer-failure`/`location`, sequence 42; last
resume issued/acknowledged command IDs were 7/7. Close request, socket close,
native exit and stream close were sequences 43, 48, 49 and 50. No shutdown cue
or controller shutdown receipt occurred. Original locks were absent; derived
locks were present and byte-equal to each other, so each original/derived lock
comparison was unequal. Previously supported empty update/dedupe behavior and
authentic entry were not retained. These failed-run differences prove no repair,
rejection or equivalence.

All six available diagnostic envelopes fit on this failed path. The empty-recipe
summary was 52,144 bytes; each original had 56 events and 5,746–5,747 compact JSON
bytes. This proves neither pre-cleanup-hit-path fit nor both-recipes/all-12-envelope
fit. Independent readback found all six owned groups `EMPTY` via `ESRCH`.
Normalized evidence is retained in `/private/tmp/apply37-q2b1d/final-validation.md`,
`validation-measurements.json` and `validation-empty-readbacks.json` in that same
directory. These local group observations do not cover operational descendants.

A later bounded frame-diagnostic inquiry also FAILED on October 10, 2026.
Exactly one ordinary invocation exited 1 after 11.007 seconds. All three
`empty-v1` originals first rejected the function-location column: observed
zero-based `312305:36`, expected `312305:42`. The anonymous name, truthy actual
and expected function locations, script and line comparisons passed. The four
exact source points resolved, but genuine pre-call/handler entry, a pre-cleanup
hit and settlement were not established. The failed-path summary was 54,340
bytes; all six available envelopes fit existing bounds and all six owned groups
were independently `ESRCH`/`EMPTY`. `offline-miss-v1`, seven later process
invocations and five owner invocations were skipped. Retain this separately from
the initial inquiry above; its normalized evidence is
`/private/tmp/apply37-frame-diagnostic/final-validation.md`. It identifies the
column mismatch, without establishing an install cause, successful continuation,
equivalence or operational eligibility.

The active bounded correction derives the dispatch function location from the
beginning of `async` in the same unique exact anonymous-IIFE signature, guarded
at zero-based `312305:36`. Column `42` is the previous parameter-start token
`()` and is no longer the active expectation. Literal-newline source inspection
explains that structural distinction. The source oracles accept the structural
start and reject the old column `42` at the column comparison without changing
authenticated pre-call state. The existing diagnostic cases and unrelated
synthetic coordinates retain their scope. The measured bounded source receipt
below establishes actual frame acceptance for this correction; independent
source review remains a separate delivery gate. No operational qualification is
claimed.

Original launches install and resolve exactly four distinct authenticated
points: `preCall`, `entry`, `preCleanup` and `settlement`. The three semantic
anchors and semantic report schema remain unchanged. The added point is the
`finishWorkers` token at zero-based line `312340`, column `12`, immediately before
the unchanged dispatch cleanup call. Source selection requires the unique
enclosing anonymous async IIFE and the same dispatch call, await, finally and
successful continuation. The fixed dispatch function has an empty name and
structurally derived async-start location `312305:36`; `main4` is not its
expected name.
The pinned bundle, one-character possible-breakpoint range, exact resolution
and actual pause must all agree. A coordinate alone is not identity.

The actual dispatch frame must match that fixed callable identity and the
authenticated pre-call frame's name, function location and script identity.
Pause-local frame IDs do not identify the callable. Handler entry retains its
named own-frame and dispatch-line caller checks, with that caller also matched
to the authenticated pre-call callable. A pre-cleanup hit requires preceding
authentic call and handler entry in the same recipe/category/role/launch.
Unknown points, scripts or frames, missing or extra resolutions, nearest
locations, replayed hits and late or unordered pauses are rejected.

A validated hit emits only `{ event: "diagnostic-pause", point: "preCleanup" }`
in lifecycle diagnostics, then uses the existing resume method. It never enters
semantic `add()` or becomes a handler-settlement event. Breakpoint-resolution
diagnostics also permit `preCleanup`; `semantic-pause` still permits only
`preCall`, `entry` and `settlement`. Originals list `pre-cleanup` in
`missingObservations` until that diagnostic hit is recorded. Derived launches
have no Inspector, pre-cleanup diagnostic event, breakpoint-resolution event or
required pre-cleanup missing marker. Only transient callable identity is used;
frames, scopes, locals, expressions, environment and raw transcripts are not
persisted.

The same six Inspector methods and every existing bound remain unchanged:
32 commands, 8 pauses and 32 semantic events; 96 lifecycle events and 8,192 bytes
per launch; 12 fields and 512 bytes per event; 64-byte strings, 120,000 ms elapsed
offsets and a 65,536-byte enclosing summary. The existing 5-second operation,
10-second setup, 30-second native lifetime and 3-second cleanup bounds, protocol
and output limits, error identity, Promise/listener ownership, races and
TERM/KILL/leader-exit/ESRCH rules remain in force. Original pnpm and derived
transform bytes are unchanged. Added setup, resolution, hit and acknowledgement
traffic fit the unchanged budgets on both recipes/all categories in the bounded
source validation below.

The finite validation gate established authentic exact-point/frame feasibility,
available bounded diagnostics and independent empty-group readback while
retaining entry/dedupe and native/lock assertions. The current outcomes below
remain distinct from the historical #48 matrix. A changed timing or outcome is a
new observation, not a demonstrated causal repair. Unsupported point, frame or
report fit, unknown cleanup, regression or unavailable/truncated diagnostics
remain stop conditions. A synthetic unsupported-location negative does not
replace authentic measurement.

Reaching finally cannot distinguish handler resolution from rejection. A hit
without the existing successful continuation only narrows the observed interval:
handler rejection propagation, pending or failed cleanup and lost later
observation remain possible. Absence is inconclusive. Neither hit nor absence,
exit 1, derived errors or missing locks authenticate rejection, success,
equivalence or operational completeness. Reports remain schema 1, qualification
contract revision 2, with `completeness: false` and `productionEligible: false`.
Causal repair and
rejected-settlement mechanisms remain unreleased, as do the later operational
adapter, facility, qualification, release and activation gates.

### Measured callable-start source validation

The correction passed its bounded source validation on October 10, 2026. All
14 prescribed invocations completed once with exit 0 in sequence: one source
contract, exactly one normal ordinary fixture, seven process cases and five
owner checks. No required invocation was skipped or repeated. The ordinary
fixture exited 0 after 27.387360 seconds and covered both recipes, all three
categories and all 12 available correlated original/derived envelopes.

All six originals accepted genuine `preCall` and named-handler entry under the
strict authenticated anonymous dispatch function location `312305:36`. Each
resolved the same four distinct exact points and reached authentic `preCleanup`
at diagnostic sequence 49 after entry. No dispatch-frame rejection occurred.
The exact callable/script/line/column, pre-call equality, handler/caller linkage,
source pins, source ordering and original/derived separation remain unchanged.

The `empty-v1` and `offline-miss-v1` summaries were 61,675 and 59,012 bytes,
respectively, within 65,536 bytes. Maximum actual lifecycle usage was 69/96
events, 6,984/8,192 envelope bytes, 6/12 event fields, 136/512 event bytes,
31/64 string bytes and 5,536/120,000 elapsed milliseconds. Protocol, pause,
semantic, time and cleanup bounds were not increased. Independent readbacks
returned `ESRCH`/`EMPTY` for all 25 distinct owned groups: 12 ordinary groups and
13 from the seven process cases. These local group readbacks establish no
complete descendant, kernel containment or Linux operational qualification.

| Recipe/category | Original state | Native terminal / intervention | Original/derived equivalent |
| --- | --- | --- | --- |
| `empty-v1/install` | unsupported | SIGTERM / timeout | false |
| `empty-v1/update` | supported | natural exit 0 / none | true |
| `empty-v1/dedupe` | supported | natural exit 0 / none | true |
| `offline-miss-v1/install` | unsupported | SIGTERM / timeout | false |
| `offline-miss-v1/update` | incomplete | natural exit 1 / none | true |
| `offline-miss-v1/dedupe` | incomplete | natural exit 1 / none | true |

Both install originals still first failed at `notification-wait` with reason
`timeout`, sequence 52, followed by actual SIGTERM and timeout intervention;
these are distinct facts. Their original/derived outcomes remain nonequivalent.
Empty install locks were present on both sides; offline install locks were
absent on both sides. Empty update/dedupe retained equivalent locks and outcomes.
Offline update/dedupe retained the exactly missing handler-settlement observation
and equivalent natural exit 1 without intervention or locks. Reaching `finally`
and recording `preCleanup` does not distinguish handler resolution, rejection,
cleanup failure or lost later observation. No install cause, rejected-settlement
mechanism or causal repair is established.

Normalized source evidence is retained in
`/private/tmp/apply37-callable-start/final-validation.md`, `validation-results.json`,
`validation-measurements.json` and `validation-all-empty-readbacks.json` in that
directory. All six retained file hashes were unchanged during runtime validation;
this later documentation-only reconciliation changes no executable source or
test. Both earlier failed inquiries above remain historical failures. Reports
remain schema 1, qualification contract revision 2, `completeness: false` and
`productionEligible: false`, with no operational `PASSED`. Release selection,
activation and the later operational gates remain unreleased; prepared deployment
and the Paratix helper remain inactive. Issue #37 remains OPEN/in progress.

## Attest, issue and verify retained native evidence

After genuine controlled qualification, the outside owner authenticates and
selects complete evidence and publication/image/alias measurements. The
[authority CLI](../../scripts/vitest-native-authority.mjs) validates these bounded
local inputs and emits authority schema 1 with `qualificationContractRevision: 2`:
exactly `checker`, `helper`, `toolchain`, `observation` components and exactly two original-image aliases.

The independently pinned selection binds preparation/profile/source/transform,
stock preparation/selection/final receipt, containing `issuer: {revision, files}`,
full component inventory pins, every raw leaf and all six proof documents.
Its fields include `preparationSha256`, `profileSha256`, `compatibilitySha256`,
`lifecycleSha256`, `publicationSha256`, `inventoriesSha256`, `imageSha256`,
`aliasesSha256`, `componentInventorySha256`, `rawEvidence` and
`stock: {provenanceSha256, selectionSha256, releaseSha256}`. The selection's
`sourceRevision` identifies checker/helper source; `transformRevision` selects
the contained native implementation. Evidence documents use that selected
`transformRevision` in their own `sourceRevision` field.


| Evidence-root document | Required scope |
| --- | --- |
| `linux-compatibility.json` | install/update/dedupe original and derived concrete lock bytes and equal outcomes |
| `data-only-lifecycle.json` | 42 derived-runtime cases: three categories × fourteen lifecycle scenarios |
| `publication.json` | Exact preparation, proofs, inventories, image/aliases, issuer and complete raw-leaf inventory |
| `inventories.json` | Complete physical four-component inventories including generated stock manifests |
| `image.json` | Selected immutable ImageID/digest and full component inventory/alias bindings |
| `aliases.json` | Exactly two measured original-image aliases equal to authenticated original toolchain bytes |

Retain independently pinned raw invocation records, ordered launch/dispatch/
completion event files for normal records, the paired delegation records
described above, concrete lock files and challenge events. Every proof and
raw/event binds the unchanged profile hash, source/transform, original archive/
bundle, derived bundle, trust scope and image. Each raw mount set is exactly four
unique selected components, all `ro` with the corresponding full inventory pin;
duplicate, unknown or writable records fail. All lifecycle records and retained
dispatches measure `runtimeIdentity: "derived"` and the frozen derived bundle.

The fourteen scenarios are readonly, data-only, concurrency, delegation, TERM,
INT, KILL, partial, tamper, redirection, replacement and script/hook/preload
suppression. Retained challenges prove denied changes, zero executable-input
execution, distinct concurrent receipts/completions, paired same-version absence
and expected-negative delegation, and signal/partial ineligibility with no
surviving descendants. Summary booleans and hash-shaped event references alone cannot establish these observations.
Every selected raw leaf must be referenced; no extra or missing physical leaf is
accepted. Evidence-root bounds: six proof files plus at most 1,000 raw leaves,
16 MiB per physical leaf and 64 MiB aggregate; compatibility/lifecycle and
raw/event documents are at most 64 KiB, concrete locks 2 MiB, authority 8 MiB.

Use the same inputs for issue and outside verification. These templates require
already authenticated Q2 inputs; they do not collect observations:

```sh
node scripts/vitest-native-authority.mjs issue \
  --selection /protected/native-selection.json --selection-sha256 NATIVE_SELECTION_PIN \
  --provenance /protected/native-preparation.json --profile /protected/observation/profile.json \
  --source-root /protected/source --evidence-root /protected/native-evidence \
  --stock-provenance /protected/stock-preparation.json --stock-selection /protected/final-stock-selection.json \
  --stock-root /protected/stock --artifact-root /protected/archives \
  --checker-root /protected/stock/checker --helper-root /protected/stock/helper \
  --toolchain-root /protected/stock/toolchain --observation-root /protected/observation \
  --output /protected/new-authority.json

node scripts/vitest-native-authority.mjs verify \
  --selection /protected/native-selection.json --selection-sha256 NATIVE_SELECTION_PIN \
  --provenance /protected/native-preparation.json --profile /protected/observation/profile.json \
  --source-root /protected/source --evidence-root /protected/native-evidence \
  --stock-provenance /protected/stock-preparation.json --stock-selection /protected/final-stock-selection.json \
  --stock-root /protected/stock --artifact-root /protected/archives \
  --checker-root /protected/stock/checker --helper-root /protected/stock/helper \
  --toolchain-root /protected/stock/toolchain --observation-root /protected/observation \
  --authority /protected/new-authority.json --authority-sha256 OUTSIDE_AUTHORITY_PIN
```

Issue exclusively creates a new mode-0444 receipt; profile and evidence inputs
stay unchanged. The outside owner retains/selects its exact authority hash and
separately verifies by reconstructing from the full selected chain. It must retain
the six proof documents and raw closure; the existing consumer layout carries
`authority.json`, compatibility/lifecycle proofs and four components. Runtime
and host verification still use independent authority/profile/proof/context
pins, original toolchain aliases and trusted read-only ownership. Missing or
arbitrary trust markers fail: normal issuer, CLI, runtime and protected stager
require positive `release-owner` scope. An explicit pure fixture API seam never
authorizes protected host writes, deployment or consumer opt-in.

## Verify source fixtures without claiming production proof

[Source CI](../../.github/workflows/ci.yml) uses complete fixed authentic archive
fixtures, production-format source/evidence documents and actual pure stager/
native-consumer seams. Checked-in archive pins authenticate test inputs only;
they are not independently selected production release-owner authority. Fixtures
retain `trustScope: "source-fixture"` and false eligibility. Documentary Linux
records are not measured worker execution, publication or image qualification.

The established new source commands are:

```sh
node scripts/test-vitest-release-production.mjs --archives /authenticated/test-archives
node scripts/test-vitest-native-authority.mjs --archives /authenticated/test-archives
```

Their optional `--stage-module FILE` / `--native-verifier FILE` exercise the actual
Python pure validation seam; they never call `stage()`. The existing preparation,
release-trust, collector and native-runtime suites remain affected checks.
Source CI additionally requires `--platform linux-x64 --require-linux` on both
new suites, refusing unsupported platforms and UID 0. Stock noncandidate fixture
build/finalize/separate verify must exercise actual held-directory procfs
traversal; the release-trust suite separately discriminates pathname replacement
against a held FD. Darwin unsupported execution cannot count as a Linux pass.

The earlier Q1 source-author smoke and pending acceptance/Linux-CI notes describe
a historical preparation checkpoint. Q1 source is now merged through the PRs
linked above. The current Q2a local checks also passed the existing 117-case
documentary authority fixture, including actual consumer rejection of incomplete
delegation; no new version-switch or native child was introduced. A merged source
PR or local fixture pass does not supply hosted Q2a CI or Linux worker evidence.
Neither green source fixtures nor a Linux source CI pass would certify the
separately required full native worker qualification.
All real release/image/proof selections and E actions remain pending.

## Recover without changing qualified inputs

On source drift, wrong pins, unsafe paths or missing/extra/altered leaves, stop
and reacquire authenticated complete inputs. Rebuild into a fresh output after
an approved source correction, then qualify and independently attest the new
profile. Never patch a qualified profile/receipt, change a fixture trust marker
or recompute an authority pin to make tampered evidence pass.

Stock packaging removes only its exclusive temporary staging directory on
failure. A reserved output may remain incomplete; retain it for inspection and
use a fresh path. Partial bundles cannot verify, and publication is not promised
to be power-loss atomic. Native issuance also never overwrites an output. Keep
receipts before bounded retention prunes them. The stock packager alone supplies
neither native dispatch proof nor helper activation authority; issue #37 remains
open and the inactive Paratix helper/eight direct matches stay unchanged.


### Bounded rejected dispatch-frame diagnostics

A rejected dispatch callable now emits `frame-rejection` and immediately linked
`frame-rejection-coordinates` before the existing controller failure receipt and
`observer-failure` with reason `location`. The existing error text, acceptance
predicate, expected empty name and cleanup remain unchanged. The diagnostic
addition itself did not change the source selector; the separately authorized
structural callable-start correction above changes only its active function
location from `312305:42` to `312305:36`. The launch header provides recipe/category correlation; the
rejection point and first failed check identify the dispatch conjunction stage.
For handler entry, this diagnoses the first rejected eligible dispatch caller
only when overall caller linkage fails; it does not add handler callable checks.

The closed statuses classify the actual name as empty, another allowed name,
absent or malformed; no arbitrary name is retained. Location statuses distinguish
absence, null, other types and truthiness. Script/line/column equality statuses
distinguish missing, malformed and differing values. Every skipped conjunction
operand is `not-evaluated`; diagnostics never read later frame fields to fill it.
The coordinate event retains only evaluated integer coordinates in
`0..2147483647`, otherwise `null`; script IDs and complete frames are excluded.
The two events share the selected point and precede the unchanged failure event;
`firstFailure` continues to identify that existing failure event.

All existing bounds remain: 96 events, 8,192 bytes per lifecycle envelope,
12 fields and 512 bytes per sequenced event, 64 bytes per string and 65,536 bytes
per complete summary. Closed-schema validation rejects inconsistent first-failed
checks, skipped-coordinate claims and missing failure linkage. Unavailable or
truncated diagnostics cannot qualify as completed evidence. Synthetic source
contracts verify these distinctions; they establish no Inspector feasibility or
runtime root cause. The retained authentic failures remain historical failures;
the measured callable-start source receipt above records the separately
authorized ordinary validation and its remaining unsupported install outcomes.
