# Standards updates: operation and recovery

This guide is for maintainers of the shared preset and self-hosted worker.
For ordinary consumer setup, start with [the README](../README.md).

## Two related dependencies

| Dependency                          | Source                                             | What updates it                                                           |
| ----------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------- |
| `.repometa.json#standards`          | Integer in the published package's `manifest.json` | Custom datasource and stamp manager                                       |
| `@sebastian-software/standards` CLI | npm package version                                | npm manager for package manifests; shared regex manager for workflow pins |

These are different versions. A CLI-only repair can leave the standards integer
unchanged. A CLI release with new standards requires the consumer's stamp and
configuration to migrate too.

The stamp rule runs `standards apply` and writes `.standards/pending.json`.
Its payload names the CLI version that the migration agent must pin. The
normal npm/workflow-pin update does not run that post-upgrade task. If it
introduces a new standards version, run the migration in that PR before
merging, or let the corresponding stamp migration update the pin first.
Do not weaken CI's alignment check to let an incomplete update pass.

## Worker prerequisites

Consumers extend both presets directly. The documented deployment does not
rely on org-level `inheritConfig`.

The worker configuration owns these global-only settings:

- `autodiscover` and `autodiscoverTopics`, including `managed-deps`;
- platform, endpoint and worker identity;
- `allowedCommands`, scoped to the post-upgrade command in
  [standards.json](../standards.json).

Worker templates live in `sebastian-software/proxmox`. The preset requests
Node and pnpm through `installTools`; a worker using global binaries must
provide those tools itself. Hosted services can restrict post-upgrade commands;
verify the service's capability before relying on automatic application.
A local `standards sync` is the fallback.

## Migration PR lifecycle

1. Renovate reads the published standards integer and opens
   `chore: standards v<N>` when the consumer is behind.
2. The permitted post-upgrade command applies deterministic changes and writes
   the pending marker. The original integer is passed through `--from-version`.
3. Agent run 1 reads the marker, aligns the CLI pin and lockfile, handles the
   applicable migration steps, and requests review when finished.
4. Agent run 2 reviews the result. A human merges after CI and review pass.

The marker is the durable work signal. The preset adds `standards:needs-agent`
when opening the PR. It must not add `standards:needs-review` before run 1 has
finished. See the [agent contract](https://github.com/sebastian-software/standards/blob/main/SKILL.md#pull-mode-agent-wiring)
for blocked markers, retries and review output.

## Why the special settings exist

- **Published manifest through unpkg:** reading GitHub main can advertise a
  migration before its CLI is published. The published package avoids that
  ordering problem. A datasource outage delays discovery until a later run.
- **Zero release age for the integer dependency:** that datasource supplies no
  release timestamp. The global strict age gate would otherwise prevent the
  migration PR from appearing.
- **Post-upgrade task inside the stamp rule:** unrelated dependency PRs and
  repositories without a stamp must never run `standards apply`.
- **Explicit `automerge: false`:** migration decisions require human review,
  even if a consumer adds broader automerge rules before this preset.
- **`chore:` prefix:** custom-datasource PRs need the explicit prefix to retain
  the intended Conventional Commit title.

## Recover a stuck update

| Symptom                         | Check                                                                        |
| ------------------------------- | ---------------------------------------------------------------------------- |
| No standards PR                 | Topic, both presets, published datasource availability and worker logs       |
| Stamp changed but files did not | Worker `allowedCommands`, tool availability and post-upgrade logs            |
| CI reports CLI/stamp mismatch   | Exact CLI pin and lockfile versus pending payload target                     |
| Pending marker remains          | Agent availability; resume the migration                                     |
| A retry erased agent changes    | Renovate recreated the branch; the pending marker requires a fresh agent run |

The Renovate rebase/retry checkbox can replace a branch containing agent
commits. Use it to deliberately restart a migration, not as a routine way to
preserve those commits. [Full recovery contract](https://github.com/sebastian-software/standards/blob/main/SKILL.md#recreated-drift-branches).
