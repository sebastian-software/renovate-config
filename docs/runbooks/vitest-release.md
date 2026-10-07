# Prepare and verify an authenticated Vitest release

Use this runbook for the stock release and native observation contracts behind
[issue #37](https://github.com/sebastian-software/renovate-config/issues/37).
The builtin-only tools read bounded local inputs; they do not download, install,
publish or run a worker. Current source preparation and fixtures remain inactive.
Actual production release selection, Linux worker qualification, image/alias
measurements and independent publication attestations are pending Q2; deployment,
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
bases and receipt hashes keep their original meaning. The Q1 source changes
following these bases still need their ordinary source PR delivery; their final
commits and PR URLs are pending and must be recorded separately. Do not pin a
future documentation commit into its own contents. A Recensor `v1.1.0` source
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
`yaml@2.9.1` and `semver@7.8.5`. `--help` lists exact tuples and platforms. Each
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
That Q2 prerequisite is not implemented or run by Q1. No existing command supplies
complete all-category worker proof; partial identity/data-only suites cannot be
combined into it. Native worker qualification is **UNRUN**.

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

Local source-author smoke completed the documentary native fixture after
bundle, mount and lifecycle-binding corrections. Independent final acceptance
against final documentation/source bytes is pending; Linux source CI has not been
observed for this Q1 change. Neither green source fixtures nor a Linux source CI
pass would certify the separately required full native worker qualification.
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
