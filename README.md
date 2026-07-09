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
> (`platform`, `endpoint`, token). Those live in the `sebastian-software/proxmox`
> worker templates, not here.

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
