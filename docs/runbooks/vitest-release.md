# Prepare and verify an authenticated Vitest release

Use this runbook for the stock release and native observation contracts behind
[issue #37](https://github.com/sebastian-software/renovate-config/issues/37).
Stock preparation and authority tools read bounded local inputs without
downloading, installing, publishing or starting a worker. The Q2a source harness
additionally starts fixed owned source processes and a rendered test wrapper; it
starts no live worker. Prepared deployment and the Paratix helper remain inactive.
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
worker. Q2a adds the bounded source harness below; Q2b controlled Linux
qualification, Q2c independent release/image/attestation selection and E live
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

Native preparation-v1 selects `schemaVersion`, `trustScope`, `sourceRevision`,
`sourceOrigin`, containing `transform: {revision, files}` and `original` pnpm
name/version/origin/archive/bundle identities. Selected preparation emits a
nonnull containing `transformRevision`, complete distinct `pnpmFiles` and
`derivedFiles`, authenticated instrumentation, `preparationSha256` and a
read-only `profile.json`. The profile remains `productionEligible: false`.
Without the three provenance/source flags it remains the legacy false/null
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
execution route. Missing authentic stock phase evidence and positive native
delegation remain unsupported.

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

## Attest, issue and verify retained native evidence

After genuine controlled qualification, the outside owner authenticates and
selects complete evidence and publication/image/alias measurements. The
[authority CLI](../../scripts/vitest-native-authority.mjs) validates these bounded
local inputs and emits the existing authority-v1: exactly `checker`, `helper`,
`toolchain`, `observation` components and exactly two original-image aliases.

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
completion event files, concrete lock files and challenge events. Every proof and
raw/event binds the unchanged profile hash, source/transform, original archive/
bundle, derived bundle, trust scope and image. Each raw mount set is exactly four
unique selected components, all `ro` with the corresponding full inventory pin;
duplicate, unknown or writable records fail. All lifecycle records and retained
dispatches measure `runtimeIdentity: "derived"` and the frozen derived bundle.

The fourteen scenarios are readonly, data-only, concurrency, delegation, TERM,
INT, KILL, partial, tamper, redirection, replacement and script/hook/preload
suppression. Retained challenges prove denied changes, zero executable-input
execution, distinct concurrent receipts/completions, observed child delegation
and signal/partial ineligibility with no surviving descendants. Summary booleans
and hash-shaped event references alone cannot establish these observations.
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
