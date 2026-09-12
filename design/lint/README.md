# lint-portal-consistency

Static checks for the composition rules in [`../03-composition.md`](../03-composition.md) and
[`../04-silent-failures.md`](../04-silent-failures.md).

Ships from this repo — which defines the widget vocabulary — and runs in a **consuming chart's**
CI, because that is where CRs are written. The rules then arrive as a failing check with a link,
at the moment they matter, rather than as a document nobody in that repo reads.

```bash
# a chart directory (rendered with helm template)
python3 lint-portal-consistency.py path/to/helm/portal

# a directory of already-rendered YAML, or a single file
python3 lint-portal-consistency.py rendered/ 
python3 lint-portal-consistency.py table.incidents.yaml --rule row-nav-placeholder
```

Exit code is the number of violations, so CI fails on any.

## What it checks

| Rule | ID | Catches |
|---|---|---|
| `dangling-ref` | X4 | An `items[].resourceRefId` with no matching `resourcesRefs` entry. Renders three different ways depending on container — silent drop, a dash, or a visible error — and only `Tabs` tells you. |
| `row-nav-placeholder` | P10 | A `rowNavigateTo` placeholder that resolves to neither a column nor a `dataSource` cell. The row stops being clickable with no cursor, no warning and no visual difference. |
| `back-link` | P1 | A `← Back to X` label. Filed four times on four pages with an identical fix each time. |
| `emoji` | P15 | Emoji in a title, label or status text. |
| `tag-colour-no-label` | C13 | A `Tag` with a colour and no label — meaning carried by colour alone. |

## The scope discipline

Every check is decidable from the CR tree alone, with no guessing about what a
`widgetDataTemplate` emits at resolve time. That boundary is the point, not fussiness: **an
earlier attempt at a composition lint produced 23 false positives against 1 real defect and was
deleted, taking its signal with it.**

Two decisions in this script came directly from that:

- **`row-nav-placeholder` was wrong on its first draft.** Checking placeholders against
  `columns[].valueKey` alone reported **12 violations against the portal chart, of which 12 were
  false** — a table routinely carries navigation-only cells (`{routeNs}`, `{namespace}`) that are
  deliberately not columns. `buildRowPath` resolves against row *cells*, and those cells are
  minted by the `dataSource` jq, whose `valueKey:"…"` literals are statically visible. Reading
  both sources took it to zero false positives while still catching a genuinely missing key.
- **A chart is rendered, not text-substituted.** Replacing `{{ … }}` inline looks simpler and
  silently loses every file using a Helm control block — measured at **36 of 618 files, 6% of the
  tree**, including the nav `Menu` that defines the route table. A lint with a silent 6% blind
  spot reports "clean" for a defect it never looked at.

Both halves are pinned by `test_lint.py`: every rule must fire on `fixtures/violations.yaml` and
stay silent on `fixtures/clean.yaml`. The clean fixture encodes the exact cases that made earlier
drafts noisy, so a future "improvement" that reintroduces them fails the test.

## Current state

Against `krateo-platformops/portal` at `origin/main` (685 CRs): **0 violations.** The rules are
regression guards, not a backlog — they exist so these five classes cannot come back.

## Wiring it into a chart's CI

```yaml
- name: Design-system consistency
  run: |
    curl -sO https://raw.githubusercontent.com/krateo-platformops/frontend/main/design/lint/lint-portal-consistency.py
    pip install pyyaml
    python3 lint-portal-consistency.py helm/portal
```
