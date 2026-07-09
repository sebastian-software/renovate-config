# 0001: Release-Triggering Renovate Commits

**Plan status:** Implemented
**Quelle:** $firmo plan https://github.com/sebastian-software/renovate-config/issues/21
**Empfohlener Workflow:** Feature (`$firmo build`)

## Anforderung

Issue 21 fordert eine zentrale Änderung der geteilten Renovate-Konfiguration, damit dependency updates mit Laufzeit-, Security-, Produktions- oder Deployment-Wirkung release-auslösende Conventional-Commit-Typen verwenden. Relanto erbt diese Konfiguration über `local>sebastian-software/renovate-config`; lokale Overrides in `sebastian-software/relanto` sind ausdrücklich nicht Teil der Lösung.

Der empfohlene Workflow ist Feature, weil sich das Verhalten der geteilten Renovate-Presets für konsumierende Repositories ändert. Es ist kein reiner Bugfix in einer Anwendung und kein reines Dokumentationsthema.

Verifizierter Kontext:

- `default.json` enthält die allgemeine Organisations-Policy mit `config:recommended`, globalem Release-Age-Gate, Labels und mehreren `packageRules`.
- `default.json` setzt bisher keinen expliziten `semanticCommitType`.
- `standards.json` enthält eine Spezialregel für den Standards-Rollout mit `commitMessagePrefix: "chore: "`, `commitMessageTopic: "standards"` und ausführlicher Begründung, warum dieser Flow absichtlich getrennt funktioniert.
- `renovate.json` dieses Repositories erbt aktuell `local>sebastian-software/renovate-config`.
- Relanto Issue 49 zeigt aktuell mehrere deployment-relevante Pending Updates als `chore(deps): ...`, darunter `isbot`, `nodemailer`, `vite`, `pnpm`, `eslint`, OXC und TypeScript; `palamedes` und `react-router` erscheinen bereits als `fix(deps): ...`.
- Die aktuelle Renovate-Dokumentation beschreibt, dass `config:recommended` meist `chore` nutzt, aber für erkannte Produktions-Dependencies `fix`; `semanticCommitType` steuert Commit Messages und PR-Titel bei Semantic Commits. `commitMessagePrefix` soll für Sonderfälle reserviert bleiben.

## Architekturentscheidungen

- Die zentrale Regel wird in `default.json` ergänzt, weil dieses Preset die allgemeine Dependency-Policy für konsumierende Repositories trägt.
- Die Standards-Spezialregel in `standards.json` bleibt bewusst `chore: standards ...`; sie ist kein normaler Dependency-Update-PR und hat einen eigenen human-gated Rollout.
- Die Umsetzung soll `semanticCommitType: "fix"` in `packageRules` verwenden. `commitMessagePrefix` bleibt auf den vorhandenen Standards-Sonderfall beschränkt, solange Renovate Semantic Commits für normale Updates korrekt anwendet.
- Die Regel soll deployment-relevante Manager und Updateklassen breit genug abdecken: npm, pnpm/Node-Erkennung, Dockerfile, GitHub Actions und lockfile-beeinflussende Updates. In der geteilten Config ist ein zu enges `dependencies`-Only-Matching riskant, weil Build-Tooling, Generatoren, CI und Container-Basisimages ebenfalls Deployment-Auswirkungen haben können.
- Rein wartende Ausnahmen sollen nur bewusst und dokumentiert eingeführt werden. Ohne klare, repoübergreifend belastbare Ausnahme bleibt die sichere Default-Entscheidung: release-relevante Updatepfade werden `fix(deps):`.

## Betroffene Dateien

| Datei | Beschreibung |
|---|---|
| `default.json` | Zentrale `packageRules` für release-relevante Updates um `semanticCommitType: "fix"` ergänzen oder bestehende Regeln entsprechend erweitern. |
| `standards.json` | Nur gegenprüfen; die vorhandene `chore: standards ...`-Spezialregel bleibt unverändert und wird nicht auf `fix(deps):` umgestellt. |
| `README.md` | Falls die Config-Änderung neue policy-relevante Semantik einführt, die allgemeine Policy knapp dokumentieren. |
| `.github/workflows/ci.yml` | Bestehenden Validierungspfad verwenden; voraussichtlich keine Änderung nötig. |
| `renovate.json` | Keine lokale Override-Regel ergänzen; dient nur als Selbsttest-Konsument des Presets. |

## Implementierungsdetails

### Vorgehen

1. In `default.json` eine früh lesbare, beschriebene `packageRules`-Regel für release-relevante Dependency-Updates ergänzen.
2. Die Regel auf normale Renovate-Updatepfade ausrichten, die in Relanto und anderen Deployments relevant sein können: npm-Dependencies inklusive Build-Tooling, Lockfile-/Package-Manager-Updates, Node-/Dockerfile-Basisimages und GitHub Actions.
3. `semanticCommitType: "fix"` setzen, damit Renovate PRs und Commits für diese Regel als `fix(deps): ...` erzeugt.
4. Bestehende spezifischere Regeln in `default.json` beibehalten: interne Scopes behalten `minimumReleaseAge: null`, org-eigene Pakete behalten `automerge`, OXC und Palamedes bleiben gruppiert, non-major `devDependencies` behalten ihr Automerge-Verhalten. Wenn eine bestehende Regel dieselben Updates matcht, muss geprüft werden, dass `semanticCommitType: "fix"` nicht durch spätere Regeln neutralisiert wird.
5. Keine Änderung in `standards.json` vornehmen, außer eine spätere Validierung zeigt eine unbeabsichtigte Interaktion. Der bestehende Kommentar begründet bereits den `chore: standards`-Flow.
6. Optional `README.md` ergänzen, falls die neue Policy für Nutzer der Presets sonst nicht erkennbar ist: normale release-relevante Dependency-Updates verwenden `fix(deps):`; Standards-Rollout bleibt `chore: standards`.
7. Die Änderung mit dem vorhandenen CI-Pfad validieren: JSON-Syntaxcheck und `renovate-config-validator default.json standards.json`.
8. Nach Merge der zentralen Config einen realen Relanto-Nachweis erfassen: Dependency Dashboard Refresh oder frisch erzeugter Renovate-PR muss für mindestens ein zuvor problematisches deployment-relevantes Update release-auslösend erscheinen.

### Edge Cases

- Renovate erzeugt für manche Produktionsabhängigkeiten bereits `fix(deps):`; die neue Regel darf diese Fälle nicht zu `chore(deps):` zurückstufen.
- DevDependencies können Deployment-Wirkung haben, wenn sie Build, Typecheck, Containeroutput, Generatoren, Lockfiles oder CI betreffen. Der Plan behandelt sie deshalb nicht pauschal als „nur Wartung“.
- GitHub Actions, Dockerfile, Node-, pnpm- und Lockfile-Updates können sicherheits- oder deployment-relevant sein und sollen in der Regelentscheidung betrachtet werden.
- Bestehende Dependency-Dashboard-Einträge ändern sich möglicherweise erst beim nächsten Renovate-Lauf. Die Abnahme darf daher über den nächsten Dashboard-Refresh oder einen neuen Renovate-PR erfolgen.
- Die geteilte Config gilt organisationsweit. Keine Regel darf Relanto-spezifische Pfade oder Paketnamen voraussetzen, außer eine Ausnahme wird bewusst als repo-spezifisch dokumentiert und begründet.
- Falls Renovate für einzelne Manager keinen `deps`-Scope erzeugt, ist das akzeptabel, solange der Typ release-auslösend ist und die resultierende PR für release-please geeignet bleibt.

## Akzeptanzkriterien

- [x] `default.json` enthält eine dokumentierte `packageRules`-Regel oder eine nachvollziehbare Erweiterung bestehender Regeln, die release-relevante Renovate-Updates per `semanticCommitType: "fix"` release-auslösend macht.
- [x] `standards.json` bleibt für den Standards-Rollout bewusst bei `chore: standards ...`; falls die Datei geändert wird, nur zur Klarstellung ohne Verhaltenswechsel.
- [x] In `sebastian-software/relanto` werden keine lokalen `semanticCommitType`-, `commitMessagePrefix`- oder `packageRules`-Overrides benötigt oder geplant.
- [x] `default.json` und `standards.json` bleiben syntaktisch gültig und bestehen den vorhandenen Renovate-Config-Validator.
- [ ] Nach Merge oder Testlauf bestätigt ein realer Relanto-Dashboard-Eintrag oder Renovate-PR, dass mindestens ein deployment-relevantes Update nicht mehr als `chore(deps):`, sondern release-auslösend erscheint. Dieser Nachweis ist nachgelagert, weil er einen Renovate-Lauf im Zielrepository benötigt.
- [x] Falls bestimmte Updateklassen bewusst `chore(deps):` bleiben, ist die Ausnahme in der Config-Beschreibung oder im PR begründet.

## Validierungsplan

- JSON-Syntax für alle Top-Level-JSON-Dateien prüfen, äquivalent zum CI-Schritt `jq . "$file"`.
- Renovate-Presets mit dem bestehenden CI-Befehl `renovate-config-validator default.json standards.json` validieren.
- Vor dem Merge prüfen, dass `standards.json` weiterhin `commitMessagePrefix: "chore: "` für den Standards-Datasource-Fall enthält.
- Nach dem Merge oder in einem geeigneten Testlauf Relanto Issue 49 beziehungsweise einen neu erzeugten Renovate-PR prüfen und den konkreten PR-/Dashboard-Titel dokumentieren.
- Für den Relanto-Nachweis zusätzlich prüfen, dass der resultierende Conventional-Commit-Typ von release-please als release-auslösend gilt.

## Testergebnisse

- `jq . default.json` erfolgreich.
- `jq . standards.json` erfolgreich.
- `jq . renovate.json` erfolgreich.
- `pnpm dlx --package renovate -- renovate-config-validator default.json standards.json` erfolgreich; der erste Sandbox-Lauf hatte keinen DNS-Zugriff, der freigegebene Netzwerklauf validierte beide Presets erfolgreich.
- `rg`-Prüfung bestätigt: `standards.json` enthält weiterhin `commitMessagePrefix: "chore: "`, `renovate.json` enthält keine lokalen `semanticCommitType`-, `commitMessagePrefix`- oder `packageRules`-Overrides.
- Nachgelagert: Ein echter Relanto-Dashboard-Refresh oder Renovate-PR muss nach Merge oder Testlauf dokumentiert werden.

## Annahmen und offene Punkte

- Annahme: `fix(deps):` ist der bevorzugte release-auslösende Typ für dependency updates, weil er bereits für einige Relanto-Updates erscheint und von release-please berücksichtigt wird.
- Annahme: Es ist akzeptabel, deployment-relevante DevDependency-Updates im Zweifel release-auslösend zu behandeln, weil Relanto Build- und Containeroutput stark von Tooling abhängen kann.
- Offener Umsetzungsentscheid: Die genaue Renovate-Matching-Form soll beim Implementieren anhand der aktuellen Renovate-Schema-Validierung gewählt werden, damit keine ungültigen Manager- oder DepType-Kombinationen geplant werden.
- Offener Abnahmepunkt: Der reale Relanto-Nachweis kann erst nach einem Renovate-Lauf oder einem gezielten Test-PR vollständig erbracht werden.

## Plan-Review

**Ergebnis:** Freigegeben

### Zusammenfassung

| Bereich | Kritisch | Wichtig | Hinweis |
|---|---:|---:|---:|
| Architektur | 0 | 0 | 0 |
| Security | 0 | 0 | 1 |
| Datenschutz | 0 | 0 | 0 |
| Fehlerfälle | 0 | 0 | 0 |
| Testbarkeit | 0 | 0 | 1 |
| Scope | 0 | 0 | 0 |
| Wartbarkeit | 0 | 0 | 0 |

### Befunde

- Hinweis, Security: Security-Updates können in mehreren Renovate-Managern auftauchen. Der Implementierungsschritt muss deshalb nicht nur npm-`dependencies`, sondern auch Actions, Dockerfile, Node/pnpm und lockfile-relevante Pfade prüfen.
- Hinweis, Testbarkeit: Der abschließende Relanto-Nachweis hängt von einem Renovate-Lauf ab und ist nicht vollständig lokal erzwingbar. Der Plan trennt lokale Config-Validierung von späterer Betriebsverifikation.

## Review-Findings

**Datum:** 2026-07-09
**Reviewer:** generic reviewer

Keine kritischen Findings gefunden. Der manuelle Review hat bestätigt, dass die neue Regel auf `default.json` beschränkt ist, `standards.json` bewusst bei `chore: standards ...` bleibt und keine lokalen Relanto-Overrides eingeführt wurden.

## Open Points

- The real Relanto PR or dashboard confirmation must be collected after the shared config change is merged or tested through Renovate.
