# Prepare an authenticated Vitest release candidate

The builtin-only [release CLI](../../scripts/vitest-release.mjs) packages the
complete checker, helper and owned Node/pnpm distributions without installing,
downloading, executing packaged code or publishing a release. It verifies each
prepared leaf against selected Git source or authenticated original archive
members. It then copies the layouts into a new read-only bundle and writes a
Recensor-compatible `checker/alignment-release.json` v1, separate helper/toolchain
inventories and a root receipt. Existing outputs are never overwritten.

This is disabled source preparation for [issue #37](https://github.com/sebastian-software/renovate-config/issues/37).
Current output is explicitly `productionEligible: false`: the containing packager
commit and production release selection remain pending. A locally calculated pin,
fixture archive or emitted receipt self-hash does not supply production authority.
Deployment, publisher isolation, native installer observation, protection and
consumer activation require their separate reviewed contracts and evidence.

## Supply independent authority

Obtain the preparation-document SHA256 through a separate trusted channel. The
document fixes the exact source revision, original archive identities and every
prepared leaf. Retain the original gzip/tar archives alongside their independent
official checksums or registry integrity records. Unsupported archive layouts,
generated pnpm wrappers/metadata and derived instrumented runtimes fail closed;
do not relabel them as original published bytes.

The six source leaves are the checker/helper entry files, nested `package.json`
files and frozen `pnpm-lock.yaml` files. They must match the selected real Git
revision, executable mode and working source bytes. Each checker/helper includes the complete
`yaml@2.9.1` and `semver@7.8.5` packages at the existing `createRequire` anchors.
The toolchain includes complete original Node and pnpm distributions, including
the published `bin/pnpm.mjs` entry. Symlinks must resolve inside their component.
Each used original archive package must be represented completely.

Preparation schema v1 has exactly these top-level fields:

| Field | Authority |
| --- | --- |
| `schemaVersion` | Integer `1` |
| `sourceRevision`, `sourceOrigin` | Real selected 40-hex commit and its exact renovate-config GitHub commit URL |
| `attestationOrigin` | Independently authenticated immutable HTTPS locator; `null` only with `--candidate` |
| `artifacts` | Exactly the stock Node, pnpm, yaml and semver gzip/tar identities |
| `components` | Complete `checker`, `helper`, `toolchain` leaf arrays |
| `toolchain` | Exact Node/pnpm versions, platform and relative `nodeEntry`, `pnpmEntry`, `pnpmPackage` paths |

Each artifact records `id`, `name`, `version`, official `origin`, relative archive
`path`, `sha256` and `memberPrefix`. File leaves record `path`, `type: "file"`,
`sha256`, `size`, `executable`, `artifact` and `member`. Link leaves instead record
`path`, `type: "symlink"`, `target`, `artifact` and `member`. Git source uses
`artifact: "git"` with `member` equal to its repository path. Paths are relative,
bounded and cannot escape. Every non-source leaf must match its archive member's
bytes, size, executable bit or link target; a hash of unrelated archive bytes
cannot authenticate a prepared module.

## Build and verify

Use an owned interpreter from the exact Node/pnpm tuples documented by `--help`.
The following paths and pin require trusted
substitution; this example does not assert a published preparation or deployed
release. Inputs must be controlled by the trusted preparation owner throughout
the operation. Do not make untrusted processes owners of source, archive, output
or ancestor directories.

```sh
node scripts/vitest-release.mjs build --candidate \
  --provenance /owned/preparation.json \
  --provenance-sha256 INDEPENDENT_64_HEX_PIN \
  --artifact-root /owned/archives --source-root /owned/source \
  --checker-root /owned/checker --helper-root /owned/helper \
  --toolchain-root /owned/toolchain --output /owned/new-bundle

node scripts/vitest-release.mjs verify --candidate \
  --provenance /owned/preparation.json \
  --provenance-sha256 INDEPENDENT_64_HEX_PIN \
  --artifact-root /owned/archives --source-root /owned/source \
  --output /owned/new-bundle
```

An unpublished preparation uses `attestationOrigin: null` and `--candidate` in
both commands. Normal mode rejects that document; a genuine production
attestation locator and independent pin remain necessary. Both modes currently
retain the pending packager revision and cannot claim production eligibility.
Production packaging additionally requires Linux held-directory traversal through
`/proc/self/fd`. Darwin candidate preparation records
`directoryAncestry: "candidate-unverified-pathname"`; it cannot certify the Linux
directory-race boundary. The archive parser hashes the same held compressed
stream that supplies its member bytes, and rejects changes to that opened file.
`--help` owns the exhaustive command contract. Success prints one JSON result;
failure prints a bounded diagnostic on stderr and exits nonzero.

Checker/helper budgets are 10,000 leaves, 2 MiB per file and 64 MiB total each.
The separately authenticated native toolchain permits 50,000 leaves, 256 MiB per
file and 1 GiB total. Archives are bounded before and during decompression.
All output files and directories are read-only; deployment must also enforce
trusted ownership and prevent runtime replacement. Merely removing mode write
bits does not constrain the owning user.

## Recover without inventing evidence

On extra/missing/altered files, unsafe links, source drift, wrong pins or unsupported
closure, correct the trusted preparation and rebuild into a fresh output. Never
edit manifests or recompute the authority pin to make a tampered runtime pass.
Verification reconstructs expected manifests from the external authority, so
self-consistent edits to a leaf, inventory and receipt cannot supply trust.

The packager only removes its exclusive staging directory on failure. A failed
publication can leave the newly reserved output incomplete; preserve it for
inspection and select a fresh output path. A partial bundle cannot pass complete
verification. This does not promise power-loss-atomic publication.

The [checker runbook](vitest-peer-alignment.md) owns its clean evaluation process
and result contract. Instrumented native pnpm requires a distinct original/derived
identity and Linux behavior/lock equivalence; this stock packager alone supplies
neither native dispatch evidence nor helper activation authority.


## Prepare native observation candidates

The separate `scripts/vitest-native-prepare.mjs` command authenticates the exact
pnpm 11.17.0 archive and complete stock CLI before emitting a derived inventory,
fixed loader profile and original/derived identities. Run its `--help` for the
required archive, stock root, new output, receipt directory and worker context
inputs. The stock root must already be read-only; deployment must additionally
keep every ancestor and executable under trusted ownership. An optional runtime
context file requires its separately supplied SHA-256 pin when loading the
profile. Candidate preparation neither installs the loader nor enables a worker.

The collector observes the authenticated Renovate 43.288.0 manager, util/exec and
execa path. On supported Linux it holds the actual child executable and CLI
closure, records launch and effective dispatch, and requires complete exit
correlation. Observation failures preserve the native child result. Custom
stdio, executable inherited preloads, unowned delegation, replacement and
unproven executable hooks cannot produce accepted evidence. Interrupted dispatch
is retained as incomplete. Receipts contain bounded process/tool identities and
repository/branch/input-head correlation; the authenticated Renovate 43 `with-pr` seam now maps the actual SCM branch commit to the
returned PR head. Failed mapping retains incomplete evidence and preserves native outcomes.

`vitest-native-observation-local` runs source validation in Linux CI with different
parent and child Node binaries, stock/derived lock and outcome comparison,
replacement and interrupted-run negatives. Darwin preparation and native outcome
comparison explicitly report unsupported Linux observation. The fixed empty-hook profile
binds owned local/global pnpmfile modules through trusted environment settings and checks the
actual effective configuration before hook loading, at dispatch and at completion. It requires
no config dependencies and no executable hook/finder collections. Native command strings, flags
and tool selection stay unchanged. Both stock and derived runtimes use this same authenticated
profile for real install, update and dedupe lock/outcome comparison; separate unprofiled controls
require the original native hook to execute. Unsafe configuration and replaced profile bytes
retain unsupported evidence rather than changing native outcomes. The actual three-category
Darwin comparison does not supply Linux process or whole-worker observation proof.
Dormant Proxmox source wiring now supplies read-only complete artifact mounts and native
Node/pnpm aliases, a host-written launch document after captured container identity and before
start, and a retained native receipt channel. The outside host verifier and runtime loader
bind full inventories, independently selected authority/proof pins and worker/container/image
context. Node aliases use authenticated file SHA256; pnpm aliases use SHA256 of compact JSON
ASCII inventory tuples sorted by relative path: `[path, type, hash-or-link-target]`. Matching
alias and original-image labels alone cannot replace authenticated source equality. Actual
image-alias byte equivalence, published full authority, immutable Linux proof and complete safe
install/update/dedupe coverage remain acceptance obligations; all activation defaults and pins
remain disabled or null. Candidate receipts
always retain `productionEligible: false`; this preparation does not satisfy
consumer activation or the issue's full security gates.
