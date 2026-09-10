/**
 * REGRESSION GUARD — the page-publish DESTINATION, asserted against the live portal chart layout.
 *
 * WHY THIS FILE EXISTS: krateo-platformops/portal restructured `chart/` → `helm/portal/` on
 * 2026-08-03. The frontend kept writing pages into `chart/`, and for five weeks every page publish
 * SUCCEEDED and shipped nothing. Nothing could have caught it: the git-provider creates whatever path
 * it is handed, so the branch pushed, the change request opened green, the merge was clean, and the
 * only symptom was a page that never appeared in the portal. The repo RENAME was survivable —
 * GitHub 301-redirects a stale repo name — but a redirect only fixes which repository you land in; it
 * does nothing for a path inside it. That asymmetry is why the destination is worth its own test.
 *
 * The live facts these assertions encode (if the chart is ever restructured again, re-verify against
 * krateo-platformops/portal itself — not against this file):
 *   - `helm/portal/Chart.yaml` is the chart root, so `helm package` only sees files beneath it;
 *     anything outside is not in the published tgz and cannot render.
 *   - a page's widget CRs render from `helm/portal/templates/<kind-lower>.<name>.yaml`.
 *   - `helm/portal/templates/menu.sidebar-nav.yaml` appends each nav fragment via
 *     `.Files.Glob "files/nav-fragments/*.yaml"`, which is CHART-ROOT-relative and whose `*` does not
 *     cross a `/` — so the fragment must sit exactly one level in, at
 *     `helm/portal/files/nav-fragments/<slug>.yaml`, and must end in `.yaml`.
 *
 * It guards all THREE writers, because the bug was really one of drift between them: the legacy
 * github git-write op set, the BuilderPublish claim (the path that actually runs on installs with
 * AUTOPILOT_PUBLISH_VIA_GIT_PROVIDER=true), and the preview drawer's Files tab — which is the user's
 * only chance to notice a wrong destination before the merge.
 */

import { describe, expect, it } from 'vitest'

import type { BlueprintDraftHeld } from './blueprintDraftStore'
import { pageNavFragmentPath, pageNavFragmentSlug, pagePublishFiles, pagePublishPath, PORTAL_PAGE_CHART_ROOT } from './pageDraft'
import { buildPagePublishOps } from './pagePublish'
import { buildPagePreviewPayload } from './previewBridge'

/** The directory the portal repo abandoned on 2026-08-03 — no writer may emit it again. */
const DEAD_PREFIX = 'chart/'

const SLUG = 'cost-report'
const WIDGETS = [
  { apiVersion: 'widgets.templates.krateo.io/v1beta1', kind: 'Flex', metadata: { name: `page-${SLUG}` }, spec: { widgetData: {} } },
  { apiVersion: 'widgets.templates.krateo.io/v1beta1', kind: 'Card', metadata: { name: 'cost-summary' }, spec: { widgetData: {} } },
]
/** The same page as a held draft: widget CRs keyed <kind-lower>.<name>.yaml, then the nav fragment. */
const HELD: BlueprintDraftHeld = {
  bytes: 1,
  files: {
    'card.cost-summary.yaml': 'kind: Card\n',
    'flex.page-cost-report.yaml': 'kind: Flex\n',
    [pageNavFragmentSlug(SLUG)]: 'item:\n  page: cost-report\n',
  },
}

/** Every repo path the legacy github git-write set commits. */
const gitWritePaths = (): string[] => buildPagePublishOps({}, HELD, SLUG)
  .filter((op) => op.gvr.resource === 'repocontents')
  .map((op) => ((op.payload as { spec: { path: string } }).spec.path))

/** Every repo path the BuilderPublish claim commits (the live path on the deployed default). */
const claimPaths = (): string[] => pagePublishFiles(HELD.files).map((file) => file.path)

/** Every repo path the preview drawer shows the user before they confirm. */
const previewPaths = (): string[] => (buildPagePreviewPayload(WIDGETS)?.files ?? []).map((file) => file.path)

describe('page publish destination — the live portal chart root', () => {
  it('the chart root is helm/portal (the packaged chart dir), not the abandoned chart/', () => {
    expect(PORTAL_PAGE_CHART_ROOT).toBe('helm/portal')
  })

  it('routes a widget CR into the chart templates dir and a nav fragment into files/nav-fragments', () => {
    expect(pagePublishPath('flex.page-cost-report.yaml')).toBe('helm/portal/templates/flex.page-cost-report.yaml')
    expect(pagePublishPath(pageNavFragmentSlug(SLUG))).toBe('helm/portal/files/nav-fragments/cost-report.yaml')
    expect(pageNavFragmentPath(SLUG)).toBe('helm/portal/files/nav-fragments/cost-report.yaml')
  })

  it('the nav fragment lands where the sidebar glob can actually see it', () => {
    // `.Files.Glob "files/nav-fragments/*.yaml"` is chart-root-relative and `*` never crosses a `/`,
    // so a fragment one directory too deep (or with a .yml extension) is silently skipped: no error,
    // no sidebar entry. Assert the exact shape rather than a substring.
    expect(pageNavFragmentPath(SLUG)).toBe(`${PORTAL_PAGE_CHART_ROOT}/files/nav-fragments/${SLUG}.yaml`)
  })

  it('NO writer emits the dead chart/ prefix — git-write, claim, and preview alike', () => {
    for (const path of [...gitWritePaths(), ...claimPaths(), ...previewPaths()]) {
      expect(path.startsWith(DEAD_PREFIX)).toBe(false)
      expect(path.startsWith(`${PORTAL_PAGE_CHART_ROOT}/`)).toBe(true)
    }
  })

  it('the claim path prefixes page files instead of dropping them at the repo ROOT', () => {
    // The claim commits `files[].path` verbatim (builder-publish only splits basename/dir), and page
    // held keys are bare identity tokens — publishing them unrouted put every widget CR at the repo
    // root, outside the chart. A path with no directory is the exact failure to catch.
    for (const path of claimPaths()) {
      expect(path).toContain('/')
    }
    expect(claimPaths().sort()).toEqual([
      'helm/portal/files/nav-fragments/cost-report.yaml',
      'helm/portal/templates/card.cost-summary.yaml',
      'helm/portal/templates/flex.page-cost-report.yaml',
    ])
  })

  it('all three writers agree on the destination for the SAME page (no preview/publish drift)', () => {
    expect(claimPaths().sort()).toEqual(gitWritePaths().sort())
    // The preview shows the widget CRs only (the nav fragment is synthesized at draft time), so it
    // must match the publish paths for exactly those files.
    expect(previewPaths().sort()).toEqual(gitWritePaths().filter((path) => path.includes('/templates/')).sort())
  })
})
