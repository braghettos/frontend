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
| `dead-kind` | X11 | A widget kind the frontend no longer resolves — `Panel`, `DataGrid`, `Column`, `TabList`, `NavMenu`, or a removed routing kind. Renders nothing. |
| `legacy-envelope` | X12 | `resourcesRefs` as a bare list instead of `{items: […]}`. The CR does not apply at all. |

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

Against `krateo-platformops/portal` at `origin/main` (685 CRs): **0 violations.** Those rules are
regression guards, not a backlog — they exist so those classes cannot come back.

### The starter templates are not clean

The first real use of this lint found the charts **new portals are cloned from** are on a dead
schema. The antd-fidelity migration was a hard break with no aliases, and these never migrated:

| chart | CRs | on dead kinds |
|---|---|---|
| `composable-portal-starter` | 32 | **12** — DataGrid, NavMenu, NavMenuItem, Page, Panel, Route, RoutesLoader |
| `composition-portal-starter` | 17 | **7** — CompositionReference, EventList, Panel, TabList |
| `template-chart` | 13 | **6** — Column, Page, Panel, Route |
| `portal-composition-page` | 20 | **6** — EventList, Panel, TabList |

Two of them also carry the legacy bare-list `resourcesRefs`, which the current CRD rejects at
apply time. So a portal started from these is broken before anyone edits a line: 30–46% of its
widgets resolve to nothing, and some CRs never apply at all.

This is the highest-leverage place the design system can reach, and the smallest surface — 13–32
CRs each against the portal's 685. Every future portal inherits whatever they carry.

**A note on this script's own bug.** It originally *crashed* on the two charts using the legacy
envelope, because it assumed `resourcesRefs` was always an object. A lint that dies on the charts
most likely to be stale is a lint that never reports on them — so the tolerant accessor and
`legacy-envelope` exist precisely because that shape turned up in the wild.

## Wiring it into a chart's CI

```yaml
- name: Design-system consistency
  run: |
    curl -sO https://raw.githubusercontent.com/krateo-platformops/frontend/main/design/lint/lint-portal-consistency.py
    pip install pyyaml
    python3 lint-portal-consistency.py helm/portal
```
