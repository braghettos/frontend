# Layer 4 — Silent failures

Every rule up to here describes something a reviewer could see. This class is different: **these defects pass every check that exists.** The CRD validates, the dry-run reports success, the widget renders, no error appears — and the page still does not do what its author declared. No mockup comparison finds an inert row, because an inert row looks exactly like a working one.

## Why the class exists

One fact explains most of it, and it is the most important thing to know when authoring these pages:

> `kubectl apply --dry-run=server` validates **static `widgetData` only**. It never validates `widgetDataTemplate` output, which snowplow evaluates later, at resolve time.
>
> — *the gap every silent failure falls through*

A template emitting the wrong *shape* — a string where the schema wants an array — is accepted at apply time and fails in the browser. A `Card.legend` given a string instead of swatches reported **“84/84 created, 0 errors”** and then rendered *“Error while rendering widget”* on a live page.

The second mechanism is strictness working against you. Widget CRDs are strongly typed with no `x-kubernetes-preserve-unknown-fields`, which is correct — but it means an unknown field on an *existing* schema is **silently pruned**, not rejected. A misspelled property vanishes, and the CR on the cluster is not the CR you wrote.

> **Correction to an earlier version of this document**
>
> This document previously stated that `allowedResources` is “a real containment grammar enforced by CRD validation.” **That was wrong, and the precise shape of the error matters.**
>
> The CRD *does* validate the field: it is required, and its values must come from a fixed enum of plural kind names. What it never does is connect that list to anything — `resourceRefId` is declared `type: string`, and no `x-kubernetes-validations` rule relates the two. The renderer doesn’t check either: it resolves the child and renders whatever `kind` comes back.
>
> So the API server verifies you spelled the *allowed list* correctly, and never checks what you put in `items`. The field looks validated — it *is* validated — just not for the thing it exists to express. That is why nobody noticed.
>
> It also settles where the rule belongs. A CEL rule cannot fix this, because the API server cannot resolve a `resourceRefId` to a kind at admission time. It can only ever be a **static lint across the chart**, where the reference and its target are both visible in one tree.

## The rules

### X1 — A render-time throw must not be able to blank the page.

**Status:** severe → **fixed**

> **Resolved since this rule was written.** `WidgetErrorBoundary`, scoped per widget, with `resetKey={dataUpdatedAt}` so a refetch un-latches it. Landed in PR #196.

**No React error boundary exists anywhere in the app** — zero matches for `componentDidCatch`, `getDerivedStateFromError` or `ErrorBoundary` across `ui/src`, on React 19.1.0, whose default on an uncaught render error is to unmount the tree.

The existing error card only guards the fetch and HTTP paths. So malformed-but-successfully-fetched data reaching a component that assumes a well-formed shape — the `Card.legend` case exactly — doesn’t produce the polished error card the app otherwise commits to. It produces a blank page.

*Evidence: independently verified on `origin/main`*

### X2 — “Denied”, “not found” and “broken” must be distinguishable.

**Status:** severe → **partly fixed**

> **Resolved since this rule was written.** 403 and 404 now render distinct calm states (`WidgetForbidden`, `WidgetNotFound`) rather than the red cross. Landed in PR #196. **Still open:** RBAC-denied child `resourcesRefs` are filtered before any widget sees them, so a denial can still read as absence.

Only 401 and the timeout statuses are special-cased. A **403 renders the identical card as a 500**, differing only by a status substring inside a free-text sentence.

Worse, one level up: RBAC-denied child `resourcesRefs` are filtered out *before any widget sees them*. A `List` with `hideWhenEmpty` then removes the box entirely — so a denial is not “you can’t see this”, it is **absence**.

On a platform where per-user RBAC scoping is a feature, a user with partial permissions sees a page that looks complete and is not. This is a trust property, not a styling one.

*Evidence: verified `useWidgetQuery.ts:194-204` · `WidgetRenderer.tsx:66,144-157` · `ListView.tsx:88-91`*

### X3 — A failed fetch surfaces the backend’s own explanation.

**Status:** gap → **fixed**

> **Resolved since this rule was written.** `WidgetFetchError` now carries a `detail` read best-effort from the failure body, and the renderer prefers it over the generic HTTP phrase. Landed in PR #196.

On a non-OK response only `status` and `statusText` reach the UI — a generic phrase like “Forbidden”. The response body is never read, so any backend-provided message is discarded. The app plainly *can* show detail: the malformed-status branch a few lines away dumps name, namespace, version, endpoint and the whole widget JSON.

Combined with P16, the most-travelled error path in the product discards the real cause, renders every failure identically, and apologises.

*Evidence: verified `useWidgetQuery.ts:203-204` vs `WidgetRenderer.tsx:199-215`*

### X4 — The same authoring mistake produces the same visible result in every container.

**Status:** gap

A `resourceRefId` with no matching `resourcesRefs` entry behaves **three different ways** depending only on which container it sits in:

| Container | Result | Visible to the author? |
|---|---|---|
| Row · Col · Flex · Card | child silently dropped, console error only | no |
| Table | renders an inline dash per cell | ambiguous — same as an empty value |
| Tabs | a visible `Result status="error"` naming the bad ref | yes |

`Tabs` is the only one that tells you. Its behaviour should be the contract.

*Evidence: verified `utils.ts:3-18`, `Row.tsx:38-41`, `Col.tsx:24-28`, `Flex.tsx:17-21`, `Card.tsx:210-218`, `Table.tsx:157-165`, `Tabs.tsx:18-32`*

### X5 — Containment is checked by a chart lint, since nothing else can check it.

**Status:** gap

See the correction above. `allowedResources` is declared on seven containers and enforced by none of them — not by OpenAPI, not by a webhook, not by the renderer.

Two structural oddities the lint would also surface: four containers (`Card`, `Steps`, `Layout`, `Form`) resolve children just as dynamically and declare **no** `allowedResources` at all, with no principle separating them from the seven that do; and `Menu`’s enum names two kinds — `navmenuitems`, `pages` — that the registry documents as **removed** in a routing refactor. Dead values in a live enum.

*Evidence: verified: no `x-kubernetes-validations` in the widget CRDs · `WidgetRenderer.tsx:73-76` · `Col.crd.yaml:156-197`*

### X6 — Recursive rendering has a depth bound.

**Status:** gap

No nesting-depth or cycle guard exists anywhere in the render path. A self-referencing or mutually-cyclic `resourceRefId` chain has nothing between it and a browser stack overflow.

*Evidence: verified: no depth parameter threaded through `WidgetRenderer`’s parse or render path*

### X7 — A CRD-sourced form schema is passed as a string, so field order survives.

**Status:** gap

The mechanism ships and works: the Form prefers `stringSchema`, whose raw JSON preserves key order, over the parsed object. But it is **opt-in** — a Form given only `schema` alphabetises its fields silently, because CRD `openAPIV3Schema` properties arrive from a Go map. No error, just the wrong order.

*Evidence: verified `Form.tsx:170-187` · `SchemaFields.tsx:143-149`*

### X8 — Layout maths runs on the children that survive, not the ones declared.

**Status:** narrow

`Row` computes its default column span from the raw item count *before* unresolvable children are filtered out — so one broken child leaves dead grid space instead of the survivors redistributing to fill the row.

*Evidence: verified `Row.tsx:24` computed ahead of the filter at `:65`*

## What this class demands of enforcement

A static lint catches the decidable half — an empty placeholder feeding a route, a field absent from the schema, a dangling ref, a missing `keyExtras`. It cannot catch shape errors in template output, because that output does not exist until snowplow runs.

Closing that properly means validating **resolved** widget data against the CRD schema, after the template is evaluated and before the page is served. Until that exists, the honest mitigation is narrower: keep computed values *inside* the shape the static default already declares, so a template changes content and never structure. A `tags: []` default the template fills with strings is safe; a `legend` default the template replaces with a different type is the bug above.

One caution from a failed attempt: a static check written for the `legend` class produced **23 false positives against 1 real defect** and was deleted. Scope each check to what is statically decidable — a noisy lint gets removed, and takes the signal with it.

### X9 — A same-path navigate merges into the params already on the URL.

**Status:** holds

**Corrected — this was published as a defect and is not one.** The audit reported that `setExtras` discards every URL param it did not set, because `buildExtrasPath` builds a fresh `URLSearchParams` of whitelisted keys only and appends it to the bare pathname. Read in isolation that is exactly what it looks like.

The merge happens one layer down, in the shared dispatcher every navigate passes through: `resolveNavigationTarget` seeds from `window.location.search` and overlays the target's params whenever the pathname matches — which `buildExtrasPath` guarantees, since it always targets the current pathname. It is bare *because* the dispatcher restores the rest, and its own comment says so.

This is the rule the arrangement encodes, and it is the right one: **an independent filter control emits only its own param** — the status chips `?status=`, the range chips `?range=` — and composition is the dispatcher's job. Any control that emitted its siblings' params too would clobber them on every click.

Worth keeping as a rule for a second reason: **nothing demonstrated it.** No test referenced `resolveNavigationTarget` at all, despite every composable filter on every list page depending on it. That is why the misreading was reasonable, and why a plausible fix would have double-merged. Now pinned by four tests at the seam where the behaviour actually lives.

*Evidence: verified `useHandleActions.ts:121-135,735` · `verbRegistry.ts:79-91` · pinned by `resolveNavigationTarget.test.ts`*

### X10 — A filter the backend still honours must have a control, or be removed from the backend too.

**Status:** defect

On `/compositions`, `listy.compositions-range-chips` and `rangepicker.comp-date-range` are referenced by nothing, and `flex.compositions-range-group` is marked *“SUPERSEDED / UNREFERENCED”* — yet `restaction.compositions-list` still filters on `.range`/`.from`/`.to`. **Autopilot can time-scope that list where a user cannot.** A dead control plus a live filter is a parity gap created by deletion.

*Evidence: verified on the chart at origin/main*
