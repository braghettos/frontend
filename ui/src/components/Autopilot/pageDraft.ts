/**
 * W4 PORTAL-BUILDER (FE-P2) — the authored-PAGE held-draft seam.
 *
 * The page analogue of blueprintDraftStore (FE-BP1). A `previewPage` whose widget CR objects
 * were accepted is HELD client-side as a `{slug: yaml}` file map — EXACTLY the shape
 * blueprintDraftStore already holds — so the SAME machinery publishes it: substituteFileContent
 * (base64) fills each `{"$fileContent":"<slug>"}` token from the held YAML at compile time, the
 * blueprint preview-GATE denies a publish unless the SAME page was previewed this thread, and
 * stampAuthorship marks the ops. The page's widget CRs therefore reach the cluster ONLY via a git
 * write (→ krateo-platformops/portal → merge → OCI → the Portal composition re-renders) —
 * NEVER hand-applied (applyResourceSet's isSandboxOnlyTarget guard already denies that).
 *
 * Pure module (js-yaml + string helpers, no React/network/module-state). The provider owns the
 * shared held-draft store; the previewPage branch in finalize populates it via these helpers.
 */

import { dump } from 'js-yaml'

/** The portal-chart file convention for a page's widget CRs: `<kind-lower>.<name>.yaml`. */
export const pageDraftSlug = (kind: string, name: string): string => `${kind.toLowerCase()}.${name}.yaml`

/** #106 — optional sidebar hint the model may pass on previewPage; every field defaults gracefully. */
export interface NavHint {
  label?: string
  icon?: string
  order?: number
}

/** The held-draft KEY (the `$fileContent` token) for a page's nav fragment. */
export const pageNavFragmentSlug = (slug: string): string => `nav-fragment.${slug}.yaml`

/**
 * The Helm chart ROOT inside krateo-platformops/portal — every path a page publish writes hangs off
 * it. This is ONE constant, deliberately, because the last time it was three literals the repo moved
 * underneath them and nobody noticed for five weeks: `chart/` was renamed to `helm/portal/` on
 * 2026-08-03 and no longer exists.
 *
 * A stale prefix is INVISIBLE at publish time. The git-provider writes any path you hand it, so the
 * branch pushes, the change request opens green and the merge is clean — and then nothing renders,
 * because a file outside the chart directory is not packaged by `helm package` and is not reachable
 * by the chart's own `.Files.Glob`. Note that GitHub's rename redirect does NOT save us here: it
 * resolves a stale REPO name, so `krateo-portal-chart` still lands in the right repository, and that
 * is exactly what makes a stale PATH so easy to miss — the publish looks addressed correctly right
 * up to the point where the page silently fails to exist.
 */
export const PORTAL_PAGE_CHART_ROOT = 'helm/portal'

/** The repo PATH the builder writes the nav fragment to (globbed by menu.sidebar-nav.yaml). */
export const pageNavFragmentPath = (slug: string): string => `${PORTAL_PAGE_CHART_ROOT}/files/nav-fragments/${slug}.yaml`

/**
 * The repo path for ONE held page file — the SINGLE router every writer shares (the legacy github
 * git-write set, the BuilderPublish claim, and the preview drawer's Files tab), so what the user is
 * shown and what is committed cannot drift apart again.
 *
 * Held keys are bare identity tokens, not paths (the preview gate and the `$fileContent`
 * substitution match on them), so the destination is derived here instead of being baked into the
 * key. Routing is by key SHAPE and that is sound, not a guess: a nav fragment is
 * `nav-fragment.<slug>.yaml` (pageNavFragmentSlug) and a widget CR is `<kind-lower>.<name>.yaml`
 * where the first segment is a Kubernetes Kind — which cannot contain a hyphen — so only the
 * fragment can ever match. Everything else is a widget CR and belongs in the chart's templates/.
 */
export const pagePublishPath = (key: string): string => {
  const fragment = key.match(/^nav-fragment\.([a-z0-9-]+)\.yaml$/i)
  return fragment ? pageNavFragmentPath(fragment[1].toLowerCase()) : `${PORTAL_PAGE_CHART_ROOT}/templates/${key}`
}

/**
 * A held page draft → the `{path, content}` list a BuilderPublish claim commits. The claim path is
 * the one that runs on installs with AUTOPILOT_PUBLISH_VIA_GIT_PROVIDER=true (the deployed default),
 * and it used to publish the held KEYS verbatim — dropping `flex.page-<slug>.yaml` at the REPO ROOT,
 * which renders exactly as nothing. Blueprints were unaffected because their held keys already are
 * chart-relative paths; a page's are not, so a page needs this routing applied explicitly.
 */
export const pagePublishFiles = (files: Record<string, string>): { content: string; path: string }[] =>
  Object.entries(files).map(([key, content]) => ({ content, path: pagePublishPath(key) }))

/** The page slug from its `flex.page-<slug>.yaml` root, else null (no root flex → no route → no nav). */
export const pageRootSlug = (files: Record<string, string>): string | null => {
  const root = Object.keys(files).find((slug) => /^flex\.page-[a-z0-9-]+\.yaml$/i.test(slug))
  const matched = root?.match(/^flex\.page-([a-z0-9-]+)\.yaml$/i)
  return matched ? matched[1].toLowerCase() : null
}

/** Title-case a kebab/snake slug for a default sidebar label ("cost-report" → "Cost Report"). */
const titleCaseSlug = (slug: string): string =>
  slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

/**
 * #106 — synthesize a page's nav fragment YAML: `item: { label, icon, order, path, page }`. Builder
 * pages use the `page:<slug>` convention (resolves `flexes/page-<slug>`), so a fragment needs ONLY
 * the `item` — no `resourcesRefs` entry. Label/icon/order come from the hint, else sensible defaults
 * (title-cased slug / `fa-file` / 950 so authored pages sort AFTER the built-in nav).
 */
export const pageNavFragment = (slug: string, hint?: NavHint): string => {
  const item = {
    icon: hint?.icon?.trim() || 'fa-file',
    label: hint?.label?.trim() || titleCaseSlug(slug),
    order: typeof hint?.order === 'number' && Number.isFinite(hint.order) ? hint.order : 950,
    page: slug,
    path: `/${slug}`,
  }
  return dump({ item }, { lineWidth: -1, noRefs: true, sortKeys: false })
}

/**
 * A previewed page's widget CR objects → the `{slug: yaml}` file map the publish substitutes.
 * Refuses (null) a page whose any CR is missing `kind` or `metadata.name` — without both there
 * is no stable file path, and a page publish must not fabricate one. YAML is serialized here so
 * the model never has to reproduce the bytes at publish time (published == previewed).
 *
 * #106 — when the page has a `flex.page-<slug>.yaml` root, ALSO emit its nav fragment (keyed
 * `nav-fragment.<slug>.yaml`) so the builder can publish the sidebar entry WITH the page (no manual
 * menu edit). Derived from the SAME held files at record- and publish-time → part of the
 * previewed==published byte set the gate enforces.
 */
export const pageDraftFiles = (widgets: readonly unknown[], nav?: NavHint): Record<string, string> | null => {
  if (!Array.isArray(widgets) || widgets.length === 0) {
    return null
  }
  const files: Record<string, string> = {}
  for (const entry of widgets) {
    const cr = entry && typeof entry === 'object' && !Array.isArray(entry) ? (entry as Record<string, unknown>) : null
    if (!cr) {
      return null
    }
    const kind = typeof cr.kind === 'string' ? cr.kind.trim() : ''
    const metadata = cr.metadata && typeof cr.metadata === 'object' ? (cr.metadata as Record<string, unknown>) : null
    const name = metadata && typeof metadata.name === 'string' ? metadata.name.trim() : ''
    if (!kind || !name) {
      return null
    }
    files[pageDraftSlug(kind, name)] = dump(cr, { lineWidth: -1, noRefs: true, sortKeys: false })
  }
  if (!Object.keys(files).length) {
    return null
  }
  const slug = pageRootSlug(files)
  if (slug) {
    files[pageNavFragmentSlug(slug)] = pageNavFragment(slug, nav)
  }
  return files
}

/**
 * True iff a held draft is a PAGE draft. Blueprint drafts ALWAYS carry a `Chart.yaml`
 * (createBlueprintDraft/previewBlueprint), a page draft never does — so its absence is the
 * discriminator the provider uses to pick the right identity function for the preview-gate.
 */
export const isPageDraft = (files: Record<string, string>): boolean => !('Chart.yaml' in files)

/**
 * The page's STABLE identity for the preview-gate (`page:<root-slug>`): the root page flex
 * (`flex.page-<slug>.yaml`, the portal's page-root convention), else the first CR's slug. Computed
 * identically at record-time (previewPage) and publish-time from the SAME held files, so the
 * gate match is deterministic. A publish whose held page was never previewed → identity absent
 * from the gate's previewed set → DENIED (same invariant as the blueprint gate).
 */
export const pageDisplayName = (files: Record<string, string>): string => {
  const slugs = Object.keys(files)
  const root = slugs.find((slug) => /^flex\.page-[a-z0-9-]+\.yaml$/i.test(slug))
  const pick = root ?? slugs[0] ?? ''
  return pick ? `page:${pick.replace(/\.yaml$/i, '')}` : 'page:draft'
}
