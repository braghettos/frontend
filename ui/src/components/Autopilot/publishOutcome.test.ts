/**
 * The chip gates. This is where the original defect lived: the "Open change request" chip was
 * pushed the moment the claim compiled — before the confirm, before the composition rendered,
 * before anything reached the remote.
 */
import { describe, expect, it, vi } from 'vitest'

import type { Config } from '../../context/ConfigContext'

import { startPublishFollow, type PublishFollowSeed } from './builderPublishStore'
import { pushPublishOutcome } from './publishOutcome'
import type { AutopilotActionChip } from './types'

// The follow itself is exercised in builderPublishFollow/Store tests; here we only assert WHICH
// gate reaches it, so the store's real (cluster-touching) starter is replaced.
vi.mock('./builderPublishStore', () => ({
  createPublishAnnouncer: vi.fn(() => vi.fn()),
  startPublishFollow: vi.fn(() => true),
}))

const SEED: PublishFollowSeed = {
  branch: 'builder/my-chart',
  claimName: 'publish-my-chart',
  deepLink: 'https://github.com/krateo-blueprints/blueprints/compare/main...builder/my-chart?expand=1',
  destination: 'krateo-blueprints/blueprints',
  expectedChildren: 3,
  namespace: 'krateo-system',
}

const CONFIG = { api: { SNOWPLOW_API_BASE_URL: 'http://snowplow' } } as Config

const OPS = [{ gvr: { group: 'composition.krateo.io', resource: 'builderpublishes', version: 'v1-7-17' }, namespace: 'krateo-system', verb: 'POST' as const }]

/** What `apply` returns when the human confirmed AND the apiserver accepted the claim. */
const dispatched: AutopilotActionChip = { label: 'apply 1 object', ok: true, readOnly: false, verb: 'applyResourceSet' }
/** …and when it confirmed but the apiserver REFUSED it (403 / 409 AlreadyExists / 5xx). */
const rejected: AutopilotActionChip = { label: 'apply 1 object — not applied: builderpublishes.composition.krateo.io "publish-my-chart" already exists', ok: false, readOnly: false, verb: 'applyResourceSet' }

const mockedStart = vi.mocked(startPublishFollow)

describe('pushPublishOutcome', () => {
  it('a DENIAL becomes a read-only chip and dispatches nothing', async () => {
    const chips: AutopilotActionChip[] = []
    const apply = vi.fn()
    await pushPublishOutcome({ apply, chips, compiled: { denial: 'denied — no publish destination', ops: null }, config: CONFIG, deepLink: null, follow: null, label: undefined, origin: { actor: 'agent' } })
    expect(apply).not.toHaveBeenCalled()
    expect(chips).toEqual([{ label: 'denied — no publish destination', readOnly: true, verb: 'applyResourceSet' }])
  })

  it('A DECLINED CONFIRM offers NO change-request link and starts NO follow (nothing was written)', async () => {
    mockedStart.mockClear()
    const chips: AutopilotActionChip[] = []
    const apply = vi.fn().mockResolvedValue(null)
    await pushPublishOutcome({ apply, chips, compiled: { denial: null, ops: OPS }, config: CONFIG, deepLink: SEED.deepLink, follow: SEED, label: 'publish', origin: { actor: 'agent' } })
    expect(apply).toHaveBeenCalledTimes(1)
    expect(chips).toEqual([])
    expect(mockedStart).not.toHaveBeenCalled()
  })

  it('A DISPATCHED CLAIM starts the follow and says only "publishing" — the link is withheld', async () => {
    mockedStart.mockClear()
    mockedStart.mockReturnValue(true)
    const chips: AutopilotActionChip[] = []
    const apply = vi.fn().mockResolvedValue(dispatched)
    await pushPublishOutcome({ apply, chips, compiled: { denial: null, ops: OPS }, config: CONFIG, deepLink: SEED.deepLink, follow: SEED, label: 'publish', origin: { actor: 'agent' } })
    expect(mockedStart).toHaveBeenCalledTimes(1)
    expect(mockedStart.mock.calls[0][0]).toEqual(SEED)
    expect(chips).toHaveLength(2)
    expect(chips[1].label).toBe('publishing to krateo-blueprints/blueprints · builder/my-chart')
    expect(chips.some((chip) => chip.url)).toBe(false)
    expect(chips.some((chip) => chip.label === 'Open change request')).toBe(false)
  })

  it('A REJECTED CLAIM (403 / 409 / 5xx) starts NO follow and offers NO link — nothing was created', async () => {
    mockedStart.mockClear()
    const chips: AutopilotActionChip[] = []
    const apply = vi.fn().mockResolvedValue(rejected)
    await pushPublishOutcome({ apply, chips, compiled: { denial: null, ops: OPS }, config: CONFIG, deepLink: SEED.deepLink, follow: SEED, label: 'publish', origin: { actor: 'agent' } })
    // The server's own words are kept (the chip), and nothing is added on top that contradicts them:
    // no "publishing…", no watch that would later report a non-existent publish as still running.
    expect(chips).toEqual([rejected])
    expect(mockedStart).not.toHaveBeenCalled()
    expect(chips.some((chip) => chip.url)).toBe(false)
  })

  it('a rejected claim on the LEGACY path is not handed the immediate link either', async () => {
    mockedStart.mockClear()
    const chips: AutopilotActionChip[] = []
    const apply = vi.fn().mockResolvedValue(rejected)
    await pushPublishOutcome({ apply, chips, compiled: { denial: null, ops: OPS }, config: CONFIG, deepLink: 'https://github.com/o/r/compare/main...b', follow: null, label: 'publish', origin: { actor: 'agent' } })
    expect(chips).toEqual([rejected])
  })

  it('falls back to the immediate link ONLY when there is nothing to follow (legacy github path)', async () => {
    mockedStart.mockClear()
    const chips: AutopilotActionChip[] = []
    const apply = vi.fn().mockResolvedValue(dispatched)
    await pushPublishOutcome({ apply, chips, compiled: { denial: null, ops: OPS }, config: CONFIG, deepLink: 'https://github.com/o/r/compare/main...b', follow: null, label: 'publish', origin: { actor: 'agent' } })
    expect(mockedStart).not.toHaveBeenCalled()
    expect(chips[1]).toEqual({ label: 'Open change request', readOnly: true, url: 'https://github.com/o/r/compare/main...b', verb: 'openChangeRequest' })
  })

  it('falls back to the immediate link when the install has no snowplow to watch through', async () => {
    mockedStart.mockClear()
    mockedStart.mockReturnValue(false)
    const chips: AutopilotActionChip[] = []
    const apply = vi.fn().mockResolvedValue(dispatched)
    await pushPublishOutcome({ apply, chips, compiled: { denial: null, ops: OPS }, config: undefined, deepLink: SEED.deepLink, follow: SEED, label: 'publish', origin: { actor: 'agent' } })
    expect(chips[1].label).toBe('Open change request')
    mockedStart.mockReturnValue(true)
  })
})
