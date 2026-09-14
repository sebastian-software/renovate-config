# renovate-config

Shared Renovate rules for Sebastian Software repositories. Use this repo to
configure dependency updates; use [standards](https://github.com/sebastian-software/standards)
to manage repository files and migrations.

## Enable updates in a repository

Add both presets to the repository's root `renovate.json`:

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": [
    "github>sebastian-software/renovate-config",
    "github>sebastian-software/renovate-config:standards"
  ]
}
```

For the self-hosted worker, also add the GitHub topic `managed-deps` in the
repository's About settings. The worker uses that topic to discover repos.
Presets are read on each Renovate run; merging a change here affects consumers
without a separate preset-version update.

## What each preset does

| Preset | Responsibility |
| --- | --- |
| [default.json](default.json) | Dependency policy: release-age delay, groups, commit types and automerge |
| [standards.json](standards.json) | Standards stamp discovery, workflow CLI pins and migration handoff |

The default policy:

- Uses the Europe/Berlin timezone and a one-day release-age delay, with an
  exception for the configured internal npm scopes.
- Uses `fix(deps)` for npm, GitHub Actions, Dockerfile and nvm updates so
  Release Please can release deployment-relevant changes.
- Automerges `eslint-config-setup`, `ardo` and `ardo-*` when checks pass.
- Automerges minor and patch devDependency updates when checks pass.
- Groups the OXC toolchain and the `@palamedes/*` packages.

Standards migration PRs explicitly disable automerge. A human reviews the
mechanical and agent changes before merging.

## Set up standards updates

A managed repo also needs `.repometa.json` and its pinned standards CLI.
Follow [repository onboarding](https://github.com/sebastian-software/standards/blob/main/docs/runbooks/onboard-repo.md).

The standards preset recognizes both the integer stamp and exact CLI versions
in `.github/workflows` and `.forgejo/workflows`. Remove an equivalent local
workflow-pin regex manager when adopting this shared one.

**An agent is a separate prerequisite.** The preset runs no agent itself.
Automatic file application needs a worker that permits `postUpgradeTasks`;
remaining migration decisions need external agent wiring or a local
`standards sync` run. See [the rollout guide](docs/standards-rollout.md) for
worker requirements, the two version numbers and recovery.

## Change and validate the presets

Use Node 24, pnpm 11 and jq. From this checkout:

```sh
node --test test/*.test.mjs
pnpm dlx --package renovate -- renovate-config-validator default.json standards.json
```

The validator checks Renovate's schema; contract tests check representative
workflow pins and the migration rule's boundaries. CI also parses each root
JSON file. Read [the rollout guide](docs/standards-rollout.md) before changing
`postUpgradeTasks`, labels, datasource selection or automerge.

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
