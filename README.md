# renovate-config

Shared Renovate presets for all Sebastian Software repositories:
[`default.json`](default.json) (general policy) and
[`standards.json`](standards.json) (standards-sync mechanics).

> [!NOTE]
> **Variant A in production** — consumers extend via per-repo `renovate.json`,
> listing both presets. There is no org-level inherited config: the self-hosted
> workers do not set `inheritConfig`, so the per-repo `renovate.json` below is
> the single opt-in path.

## Per-repository usage

A repository opts in by carrying the `managed-deps` GitHub topic (the worker
discovers repos via `autodiscoverTopics`) and extending **both** presets:

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": [
    "github>sebastian-software/renovate-config",
    "github>sebastian-software/renovate-config:standards"
  ]
}
```

Listing `:standards` is safe everywhere: its custom manager only matches in
repos that actually carry a `.repometa.json` stamp, so it is a no-op in repos
that have not onboarded to the standards rollout.

Presets are resolved fresh on every Renovate run — changes to this repository
take effect across the org immediately, without touching the consuming repos.

## `default.json` — general org policy

- Based on `config:recommended`, timezone Europe/Berlin (the worker controls the
  actual run schedule, so the preset pins no schedule of its own)
- Uses `fix(deps):` for release-relevant dependency updates across runtime,
  build, CI, package-manager, Node and Dockerfile managers, so release-please
  can publish deployable releases after merged dependency PRs
- Automerges our own packages (`eslint-config-setup`, `ardo`) once CI is green
- Automerges non-major devDependency updates once CI is green
- Groups the OXC toolchain (`oxlint`, `oxfmt`, bindings) into a single PR
- Groups the React core packages (`react`, `react-dom`, `react-is`,
  `react-test-renderer`, `react-server-dom-*`) into a single PR by package
  name, so they always move in lockstep

### Vitest grouping and verification

Ordinary npm updates group these eight installed packages by name: `vitest`,
`@vitest/coverage-v8`, `@vitest/coverage-istanbul`, `@vitest/ui`,
`@vitest/browser`, `@vitest/browser-playwright`, `@vitest/browser-preview` and
`@vitest/browser-webdriverio`. Their published 4.1.10 and 4.1.11 metadata requires
matching Vitest versions. This explicit rule does not match independently
versioned `@vitest/eslint-plugin` or other `@vitest/*` names; inherited upstream
groups still apply. Absent optional companions are not added.
Existing major-update separation, automerge and semantic commits still apply.
The shared preset retains its one-day base release-age setting; worker package
rules can override it.

`config:recommended` already groups Vitest when its repository metadata matches
Renovate's [monorepo mapping](https://github.com/renovatebot/renovate/blob/f3ec5e6b5166b327833f63a531179d89fd8fc9db/lib/data/monorepo.json)
and [group preset](https://github.com/renovatebot/renovate/blob/f3ec5e6b5166b327833f63a531179d89fd8fc9db/lib/config/presets/internal/group.preset.ts).
The explicit allowlist preserves grouping when that metadata changes.

From the repository root, use Node **24.21.0** and pnpm **11.20.0** to reproduce
the regular CI milestone with Renovate **44.127.1** (source commit
`f3ec5e6b5166b327833f63a531179d89fd8fc9db`):

```sh
tooling_dir="$(mktemp -d)"
pnpm --dir "$tooling_dir" add --save-exact renovate@44.127.1 pnpm@11.20.0 --ignore-scripts --config.minimum-release-age=0
node "$tooling_dir/node_modules/renovate/dist/config-validator.js" --strict default.json standards.json
node scripts/test-vitest-lockstep.mjs \
  --renovate-root "$tooling_dir/node_modules/renovate" \
  --pnpm-cli "$tooling_dir/node_modules/pnpm/bin/pnpm.mjs"
```

The release-age override applies only to this temporary tooling installation.
The fixture retains the ordinary update delay. The runner replays pinned registry
metadata through Renovate's extraction, lookup and branch APIs, applies Renovate's
manifest updater, and generates real pnpm lockfiles through Renovate's native
pnpm path. It prints the temporary artifact directory. The regular 4.1.10 to
4.1.11 case passes manifest, importer, exact-peer and frozen-lockfile checks;
excluded packages stay unchanged. The committed fixture `.npmrc` permits peer
mismatches, so frozen installation alone cannot prove companion compatibility.
Tooling installation disables scripts; missing native RE2 uses Renovate's RegExp
fallback. These literal-name/API/artifact checks do not verify RE2 conformance,
hosted PR creation or the deployed worker.

**Full security alignment remains NOT PROVEN.** The default lockstep command
runs regular grouping only. Adding `--require-security` runs the synthetic
Vitest-only advisory fixture and currently
exits **1**: both native vulnerability defaults and restored `groupName` update
Vitest to 4.1.11 while coverage stays at 4.1.10 in the selected security branch.
A separate ordinary coverage branch does not satisfy same-branch alignment. The
fixture checks the lowest fix despite a newer lookup candidate. Replayed lookup
timestamps model a fix under one day old, with dashboard approval enabled for
ordinary updates; actual tarballs and seed dependencies are pinned separately.
In lookup replay, Renovate bypasses the ordinary release-age and dashboard
approval barriers for the advised update. This does not prove pnpm's release-age
bypass for a truly young published package. Renovate's
[vulnerability initializer](https://github.com/renovatebot/renovate/blob/f3ec5e6b5166b327833f63a531179d89fd8fc9db/lib/workers/repository/init/vulnerability.ts)
selects advised packages; [branch grouping](https://github.com/renovatebot/renovate/blob/f3ec5e6b5166b327833f63a531179d89fd8fc9db/lib/workers/repository/updates/branchify.ts)
does not add unadvised companions. [Version bumps](https://github.com/renovatebot/renovate/blob/f3ec5e6b5166b327833f63a531179d89fd8fc9db/lib/workers/repository/update/branch/bump-versions.ts)
run after [branch lockfile updates](https://github.com/renovatebot/renovate/blob/f3ec5e6b5166b327833f63a531179d89fd8fc9db/lib/workers/repository/update/branch/index.ts),
so a manifest-only bump cannot establish aligned lockfiles.

#### Local worker contracts

CI also runs the [test-only worker fixture](tests/fixtures/vitest-worker-contract/README.md).
Using the same temporary tooling above:

```sh
node scripts/test-vitest-worker-contract.mjs \
  --renovate-root "$tooling_dir/node_modules/renovate" \
  --pnpm-cli "$tooling_dir/node_modules/pnpm/bin/pnpm.mjs"
```

At the recorded reference versions, eight real hook cases and four native
installer cases pass. The hook checks use actual generated regular/advisory
branches, temporary Git repositories, data files and child processes. They cover
branch execution once, no-change skip, command denial and failure. Probe input
validation is test-only; artifact errors do not prove merge prevention.

The pinned sanitized worker/default/standards stack resolves ordinary npm updates
to three days with dashboard approval, despite the preset's one-day base setting.
Advised updates bypass those barriers in lookup replay. Standards tasks are
inspected without execution. pnpm's own installer age is a separate minutes-based
setting: cold loopback cases model one-hour-old install metadata, retain real
immutable target tarball URLs/integrity, and prove exact/scoped target exceptions
while unrelated young releases remain blocked. A separate case without exceptions
proves CLI age 30 minutes overrides workspace 1440 and .npmrc 2880 minutes.
These settings exist only in temporary test workspaces. Transitive metadata and
tarballs still require upstream network access; modeled timestamps do not prove
live publication age or fleet compatibility.

The local runner expects the unchanged native security command to exit **1** for
the companion mismatch; this known-negative check is not full security acceptance.
Its artifact summary reports **full security alignment NOT PROVEN**, with fleet
provenance and required current-HEAD status enforcement **PENDING**. No new consumer preset, worker permission or hook activation is included.
Maintained helper source and a separate helper-aware suite are described below.

[Issue #37](https://github.com/sebastian-software/renovate-config/issues/37) remains
open for hosted security alignment and activation. The cached Renovate 43.288.0
image / Node 24.18.0 tuple is a compatibility candidate; it is not immutable proof
of the completed worker run. pnpm 11.17.0 is the measured consumer compatibility
target; the actual worker installer remains unknown. Command permission still
covers standards only.

#### Maintained helper source and local same-branch proof

[scripts/vitest-lockstep.mjs](scripts/vitest-lockstep.mjs) reads the actual upgrades
array from `RENOVATE_POST_UPGRADE_COMMAND_DATA_FILE`. Trusted runner configuration
supplies an absolute `VITEST_LOCKSTEP_PNPM_CLI`; the helper invokes it with its own
verified Node binary, package-manager/runtime delegation disabled, and repository
pnpmfiles/lifecycle scripts disabled. Its dependencies are exact, isolated YAML
and semver pins under `scripts/vitest-lockstep/`; no root manifest is introduced.

The [helper fixture](tests/fixtures/vitest-helper/README.md) retains native security
exit **1** and separately checks local helper acceptance **0** through the real
Renovate post-upgrade boundary. It checks multiple importers, preserved compatible
caret/tilde/expressive ranges, metadata-derived installed internals, selected
4.1.11 rather than admitted 5.0.3, exact scoped age exceptions and failure recovery.
An excluded package keeps its version, integrity and declarations; existing peer
references into the selected Vitest family follow the new native peer context.
Unrelated dependencies and resolutions remain protected.

Both existing runners and the helper runner accept
`--runtime-profile candidate43-consumer11|reference44`; omission retains the
reference default. Run the exact profile Node binary, bootstrap exact temporary
tools with scripts disabled, then install the helper-local frozen dependency lock:

```sh
# Select Node 24.18.0 for this candidate command; use Node 24.21.0 and
# renovate@44.127.1 / pnpm@11.20.0 for reference44.
candidate_tools="$(mktemp -d)"
pnpm --dir "$candidate_tools" add --save-exact renovate@43.288.0 pnpm@11.17.0 --ignore-scripts --config.minimum-release-age=0
node "$candidate_tools/node_modules/renovate/dist/config-validator.js" --strict default.json standards.json
node "$candidate_tools/node_modules/pnpm/bin/pnpm.mjs" --dir scripts/vitest-lockstep install --frozen-lockfile --ignore-scripts --ignore-pnpmfile --pm-on-fail=ignore
node scripts/test-vitest-worker-contract.mjs --runtime-profile candidate43-consumer11 \
  --renovate-root "$candidate_tools/node_modules/renovate" \
  --pnpm-cli "$candidate_tools/node_modules/pnpm/bin/pnpm.mjs"
node scripts/test-vitest-helper.mjs --runtime-profile candidate43-consumer11 \
  --renovate-root "$candidate_tools/node_modules/renovate" \
  --pnpm-cli "$candidate_tools/node_modules/pnpm/bin/pnpm.mjs"
```

The zero-age bootstrap above applies only to isolated temporary tooling. Consumer
invocations keep their ordinary age policy and inherited exclusions, adding only
exact selected family `package@version` exceptions. Unsupported catalogs,
overrides, executable config dependencies, runtime ownership and affected manifest
peer declarations fail before publication.

Publication is recoverable across several files, not atomic. Catchable failures
restore owned changed bytes or emit explicit recovery failure; concurrent edits
are preserved for inspection. SIGKILL or power loss can interrupt recovery. A
restored advisory branch can still contain the original mismatch and does not
prove merge safety.

No executable `vitest-pnpm.json` is delivered. A later reviewed release must bind
an immutable helper commit and its entire dependency layout, establish real worker
image/binary/installer provenance, narrow command permission, independently
required current-HEAD alignment checks and stale-green/bypass reconciliation,
then pass hosted negative cases and canary evidence before opt-in. Local helper
success leaves these gates pending and keeps #37 open/in-progress.

#### Independent read-only checker

[scripts/vitest-peer-alignment.mjs](scripts/vitest-peer-alignment.mjs) validates
manifest/importer and installed peer contexts against trusted exact-head tree,
file and independent published metadata. Its v1 checker uses its own exact
runtime and evaluates compatibility independently of mutating helper success.

Prepare the isolated checker-local frozen runtime with **Node 24.18.0** and
**pnpm 11.17.0**, following the [checker runbook](docs/runbooks/vitest-peer-alignment.md).
The runbook also owns release binding and fixed clean caller process requirements.
Then run the [120-case offline fixture suite](tests/fixtures/vitest-peer-alignment/README.md):

```sh
node scripts/test-vitest-peer-alignment.mjs
```

CI `vitest-peer-alignment-local` is local source proof, distinct from the future
trusted consumer publisher's `vitest-peer-alignment` status. This does not prove
consumer enforcement, deployment, lowest advisory targets or release-age bypass.
Issue #37 remains open/in-progress; the existing helper interface stays unchanged.

## `standards.json` — standards-sync mechanics

Drives the [standards](https://github.com/sebastian-software/standards) rollout.
It turns the integer `manifest.json#currentVersion` of the standards package
into a Renovate dependency on each repo's `.repometa.json#standards` stamp, then
runs `standards apply` on the upgrade branch. The version model stays
stack-agnostic (no npm semver leaks into Rust or docs-only repos). The preset
carries:

- **`customDatasources`** — reads the org's current standards version as a plain
  integer from `manifest.json`.
- **`customManagers`** — treats the `.repometa.json` stamp as a dependency on
  that datasource.
- **`postUpgradeTasks`** — on bump, runs the mechanical sync and drops the
  `.standards/pending.json` judgement marker (`executionMode: "branch"`,
  `installTools: { node, pnpm }`, plus the `--config.minimum-release-age=0`
  pnpm-cooldown workaround).
- **standards `packageRule`** — `commitMessagePrefix: "chore: "` (so the PR title
  reads `chore: standards v<N>`), `dependencyDashboardApproval: false`,
  `recreateWhen: "always"`, and `addLabels: ["standards:needs-agent"]`.
  **No `automerge`** — Variant A: a human merges every `standards:` PR after the
  two external agent runs have posted their commit/comment.

The PR carries the mechanical changes plus `.standards/pending.json`; an external
LLM agent consumes that marker in pull mode and commits the judgement changes
onto the same branch. Full contract:
[standards/changes/0002-renovate-pending.md](https://github.com/sebastian-software/standards/blob/main/changes/0002-renovate-pending.md).

> [!NOTE]
> What stays on the self-hosted worker (global-only, cannot move into a preset):
> the `allowedCommands` allow-list (security boundary for `postUpgradeTasks`),
> `autodiscover` / `autodiscoverTopics`, and the worker identity
> (`platform`, `endpoint`, token). Those live in the worker templates of
> [`fastner/proxmox`](https://git.dal12.de/fastner/proxmox) (Forgejo), not here.

---

<!-- sebastian-software-branding:start -->
<p align="center">
  <a href="https://oss.sebastian-software.com">
    <img src="https://sebastian-brand.vercel.app/sebastian-software/logo-software.svg" alt="Sebastian Software" width="240" />
  </a>
</p>

<p align="center">
  <strong>Built by Sebastian Software</strong> — consulting for TypeScript, React &amp; Rust.<br />
  <a href="https://sebastian-software.de">Work with us</a> · <a href="https://oss.sebastian-software.com">More open source</a>
</p>

<p align="center">Copyright &copy; 2026 Sebastian Software GmbH</p>
<!-- sebastian-software-branding:end -->
