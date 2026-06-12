# renovate-config

Shared [Renovate](https://docs.renovatebot.com/) preset for all Sebastian Software repositories.

## Usage

Every repository only needs a minimal `renovate.json`:

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["github>sebastian-software/renovate-config"]
}
```

Presets are resolved fresh on every Renovate run — changes to this repository
take effect org-wide immediately, without touching the consuming repositories.

## What it does

- Weekly update schedule (Europe/Berlin), based on `config:recommended`
- Automerges our own packages (`eslint-config-setup`, `ardo`) once CI is green
- Automerges non-major devDependency updates once CI is green
- Groups the OXC toolchain (`oxlint`, `oxfmt`, bindings) into a single PR

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
