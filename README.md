# renovate-config

Shared [Renovate](https://docs.renovatebot.com/) preset for all Sebastian
Software repositories, plus the reference configuration for the self-hosted
Renovate worker that drives the [standards](https://github.com/sebastian-software/standards)
rollout.

## Per-repository usage

A repository opts in by carrying the `managed-deps` GitHub topic (the worker
discovers repos via `autodiscoverTopics`) and extending the shared preset:

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["github>sebastian-software/renovate-config"]
}
```

Presets are resolved fresh on every Renovate run — changes to this repository
take effect across the org immediately, without touching the consuming repos.

## What the preset does

See [`default.json`](default.json):

- Based on `config:recommended`, timezone Europe/Berlin (the worker controls the
  actual run schedule, so the preset pins no schedule of its own)
- Automerges our own packages (`eslint-config-setup`, `ardo`) once CI is green
- Automerges non-major devDependency updates once CI is green
- Groups the OXC toolchain (`oxlint`, `oxfmt`, bindings) into a single PR

## Self-hosted worker — standards rollout

> [!NOTE]
> This is the reference configuration for the org's self-hosted worker, kept here
> so it lives in version control rather than only on the server. Reconcile it with
> the live server config when you change either side. The hosted Mend app cannot
> run `postUpgradeTasks` and therefore cannot drive the automated pull model — for
> Mend, repos still get version bumps + a red `standards check`, and the judgement
> work is done with `standards sync` locally or from a CI job.

The worker turns the integer `manifest.json#currentVersion` of the standards
package into a Renovate dependency on each repo's `.repometa.json#standards`
stamp, then runs `standards apply` on the upgrade branch. The version model stays
stack-agnostic (no npm semver leaks into Rust or docs-only repos).

```json5
{
  "autodiscover": true,
  "autodiscoverTopics": ["managed-deps"],

  // Read the org's current standards version as a plain integer.
  "customDatasources": {
    "sebastian-software-standards": {
      "defaultRegistryUrlTemplate": "https://raw.githubusercontent.com/sebastian-software/standards/main/manifest.json",
      "format": "json",
      "transformTemplates": ["{ \"releases\": [ { \"version\": $string(currentVersion) } ] }"]
    }
  },

  // Treat the .repometa.json stamp as a dependency on that datasource.
  "customManagers": [
    {
      "customType": "regex",
      "managerFilePatterns": ["/^\\.repometa\\.json$/"],
      "matchStrings": ["\"standards\":\\s*(?<currentValue>\\d+)"],
      "datasourceTemplate": "custom.sebastian-software-standards",
      "depNameTemplate": "standards",
      "versioningTemplate": "loose"
    }
  ],

  // On bump: run the mechanical sync and drop the pending-judgement marker.
  "postUpgradeTasks": {
    "commands": [
      "pnpm dlx @sebastian-software/standards apply --from-version {{{currentValue}}} --emit-pending .standards/pending.json"
    ],
    "fileFilters": ["**/*"],
    "executionMode": "branch"
  }
}
```

Server-level (admin) settings, outside the repo config:

- `allowedPostUpgradeCommands` must permit the exact `standards apply` invocation
  — pin it tightly with regex anchors.
- One worker per bot identity. The org runs several (GitHub org PAT for
  `sebastian-software/*`, a user PAT for personal repos with an
  `autodiscoverFilter`, and a Forgejo worker); the custom manager, datasource and
  `postUpgradeTasks` block are identical across them — only `platform`,
  `endpoint`, token and filter differ.

The PR carries the mechanical changes plus `.standards/pending.json`; an external
LLM agent consumes that marker in pull mode and commits the judgement changes onto
the same branch. Full contract:
[standards/changes/0002-renovate-pending.md](https://github.com/sebastian-software/standards/blob/main/changes/0002-renovate-pending.md).

## `org-inherited-config.json`

[`org-inherited-config.json`](org-inherited-config.json) is a hosted-Mend-app
feature (the app reads `{org}/renovate-config/org-inherited-config.json` for every
repo). On a self-hosted server it only takes effect if the global config sets
`inheritConfig: true`; otherwise the per-repo `renovate.json` above is what
applies.

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
