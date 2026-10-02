# Independent checker fixtures

The `paratix/` data preserves the complete four-importer pnpm v9 topology from
Paratix commit `de00be779511a13efb737aefbcc2825de8893a98`: 511 tree leaves,
1,104 package records, 1,112 snapshots and the original 368,288-byte lock.
Historical `@vitest` 3.2.4 companions coexist with two Vitest 4.1.11 contexts,
whose nested Vite/esbuild versions differ. Dependency declarations and unrelated
npm TypeScript aliases remain intact. There is no Vitest 3.2.4 runtime in this
real fixture.

The separate [modeled independent runtime overlay](modeled-independent-runtimes.json)
adds a synthetic workspace with a genuine Vitest 3.2.4 runtime alongside the
unchanged 4.1.11 contexts. Its 48 complete authentic published contracts retain
all dependency, optional and peer declarations. Provenance includes cached public
npm packument hashes and a single fixed public acquisition of tinypool 1.1.1,
vite-node 3.2.4 and strip-literal 3.0.0. The overlay SHA256 is
`f85118be391760d7ca02dcbbc95658de2959cb6238688cf89e686d09f1b17ef5`.
Tests consume these pinned documents offline; the model is not historical Paratix
installation evidence and leaves the original fixture bytes unchanged.

Manifest author, scripts, repository and bug-tracker fields are removed. The
tree inventory retains every original leaf path, with recalculated blob SHA1
and byte sizes for supplied sanitized manifests. Unrelated source payloads are
not included. The fixture head is a synthetic identity, not an actual Git
commit. `paratix/provenance.json` records these distinctions explicitly.

`registry-metadata.json` contains all 1,104 independent published version
projections acquired from fixed public npm HTTPS version endpoints. The
projection retains names, versions, integrity, dependency and optional-peer
obligations. Provenance records acquisition time, exact bytes and SHA256. The
suite never acquires live metadata and checks the pinned file hash before use.

Local proof does not establish advisory target selection, release-age bypass,
trusted deployment, required current-head status publication or consumer
activation. The immutable runtime is provisioned separately from the exact
checker manifest/lock; evaluating repository data never installs or executes it.

Graph regressions add clearly modeled trusted documents for
`fixture-required-peer`, `fixture-mocker-consumer` and `different-vite`; these
are test doubles, not claims that those modeled package versions were published.
All original registry documents and complete real topology remain present.
The erased reverse-peer case removes its lock peer field, snapshot peer token
and Vitest edge together. Its required peer is discoverable solely through the
independent modeled published document; unrelated real Vitest nodes remain
reachable. Optional absence is modeled in an importer without a Vitest binding.

The non-family alias positive gives a modeled wrapper an actual published
mocker resolution with a matching aliased Vite provider from the same reaching
importer and exact provider context. A different workspace or provider context
cannot authorize it. Native pnpm 11.17.0 indexes providers under both their
declared alias and resolved name, then checks the selected peer's version range
(`dist/pnpm.mjs` lines 178817–178847 and 178876–178897). Vitest-family names
retain strict actual identity independently of these non-family alias semantics.

Missing and denied helper probes fail with ENOENT and EACCES before the checker
independently rejects unchanged 4.1.11/4.1.10 mismatch bytes. Native-aligned data
succeeds with the helper absent. No helper outcome field is an alignment proof.

Resource tests keep fixed request, file, tree, graph, metadata, parser node and
peer-context limits. Diagnostics remain one bounded record. Closed input and
trusted configuration reject repository-selected runtime, revision, executable,
endpoint or timeout fields. The CLI rejects malformed UTF-8 with non-success
bounded JSON output.

`registry-transport-stub.mjs` is an owned offline native HTTPS transport double,
loaded before the acquisition export through `syncBuiltinESMExports`. It records
all fixed encoded public npm endpoints and accept-only headers, models response
and request failures including connection closure, and measures four-request
concurrency plus cancellation. It covers projections, redirects, non-200 replies,
wrong identities, malformed UTF-8/JSON, duplicates, 1 MiB response and 16 MiB
aggregate limits. The per-response timeout waits for the actual owned 10-second
timer; no clock or production limit is changed. This proves client boundary
behavior, not availability or authentication of a live registry response.

The [checker runbook](../../../docs/runbooks/vitest-peer-alignment.md) owns the
v1 caller contract, immutable release preparation and operational boundaries.
The complete owned release tests check actual module resolution and documented
runtime hash basis under Node read-only permissions. Trusted fault copies verify
Worker write denial, runtime denial, parser timeout and early Worker exit;
consumer scripts and `.npmrc` cannot select execution or transport. These copies
are explicit test support, separate from the authenticated positive release.
The completed source suite has 120 cases. Production caller argv/environment,
whole-layout authentication and deployment remain outside local fixture proof.
