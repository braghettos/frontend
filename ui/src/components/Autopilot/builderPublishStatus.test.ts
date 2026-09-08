/**
 * The pure half of the publish follow-up: what a git-provider child's conditions mean, and the
 * phase a sweep of them reduces to. The cases here ARE the customer report — a parent claiming
 * health over failing children, and the exact message the children were carrying all along.
 */
import { describe, expect, it } from 'vitest'

import {
  childResourceName,
  isTerminalPhase,
  readChildSync,
  reducePublishVerdict,
  type ChildSyncState,
  type PublishFollowPhase,
} from './builderPublishStatus'

/** The verbatim message from the live incident. */
const CLONE_FAILURE = 'observe failed: failed to clone repository: authentication required: invalid credentials'

const child = (status: string, message?: string, type = 'Synced') => ({
  status: { conditions: [{ lastTransitionTime: '2026-09-08T00:00:00Z', message, reason: 'ReconcileError', status, type }] },
})

const ready = (name: string): ChildSyncState => ({ failed: false, name, ready: true })

describe('childResourceName', () => {
  it('reproduces the composition naming: <claim>-000 … -00N', () => {
    expect(childResourceName('publish-my-chart', 0)).toBe('publish-my-chart-000')
    expect(childResourceName('publish-my-chart', 5)).toBe('publish-my-chart-005')
    expect(childResourceName('publish-my-chart', 12)).toBe('publish-my-chart-012')
  })
})

describe('readChildSync', () => {
  it('reads Synced: False and keeps the child\'s OWN message', () => {
    const state = readChildSync('publish-x-000', child('False', CLONE_FAILURE))
    expect(state).toEqual({ failed: true, message: CLONE_FAILURE, name: 'publish-x-000', ready: false, reason: 'ReconcileError' })
  })

  it('reads Synced: True as ready', () => {
    expect(readChildSync('publish-x-000', child('True')).ready).toBe(true)
  })

  it('treats an absent or Unknown condition as still working — never as failed', () => {
    expect(readChildSync('publish-x-000', { status: {} })).toEqual({ failed: false, name: 'publish-x-000', ready: false })
    expect(readChildSync('publish-x-000', null)).toEqual({ failed: false, name: 'publish-x-000', ready: false })
    const unknown = readChildSync('publish-x-000', child('Unknown'))
    expect(unknown.failed).toBe(false)
    expect(unknown.ready).toBe(false)
  })

  it('falls back to Ready when the resource carries no Synced condition', () => {
    expect(readChildSync('publish-x-000', child('True', undefined, 'Ready')).ready).toBe(true)
    expect(readChildSync('publish-x-000', child('False', 'boom', 'Ready')).failed).toBe(true)
  })
})

describe('reducePublishVerdict', () => {
  const base = { budgetMs: 300000, elapsedMs: 1000, expectedMin: 6, stableSweeps: 5 }

  it('THE INCIDENT: six children all Synced: False → failed, carrying the first child\'s own message', () => {
    const children = Array.from({ length: 6 }, (_unused, index) => readChildSync(
      childResourceName('publish-blueprints', index),
      child('False', CLONE_FAILURE),
    ))
    const verdict = reducePublishVerdict({ ...base, sweep: { children } })
    expect(verdict.phase).toBe('failed')
    expect(verdict.failure?.message).toBe(CLONE_FAILURE)
    expect(verdict.failure?.child).toBe('publish-blueprints-000')
  })

  it('reports a failure the instant it appears, even mid-render and even if others are fine', () => {
    const children = [ready('a-000'), readChildSync('a-001', child('False', 'permission denied'))]
    const verdict = reducePublishVerdict({ ...base, expectedMin: 6, sweep: { children } })
    expect(verdict.phase).toBe('failed')
    expect(verdict.failure).toEqual({ child: 'a-001', message: 'permission denied', reason: 'ReconcileError' })
  })

  it('says exactly that when a child fails with no message — never invents one', () => {
    const children = [readChildSync('a-000', child('False'))]
    const verdict = reducePublishVerdict({ ...base, expectedMin: 1, sweep: { children } })
    expect(verdict.failure?.message).toBe('a-000 reported a failure with no message')
  })

  it('is pushed only when every EXPECTED child exists, is ready, and the count has settled', () => {
    const all = Array.from({ length: 6 }, (_unused, index) => ready(`a-00${index}`))
    expect(reducePublishVerdict({ ...base, sweep: { children: all } }).phase).toBe('pushed')
  })

  it('does NOT call a half-rendered set a success (3 of 6, all Synced)', () => {
    const half = [ready('a-000'), ready('a-001'), ready('a-002')]
    expect(reducePublishVerdict({ ...base, expectedMin: 6, sweep: { children: half } }).phase).toBe('pending')
  })

  it('does NOT call a complete-but-unsettled set a success (one sweep is not enough)', () => {
    const all = Array.from({ length: 2 }, (_unused, index) => ready(`a-00${index}`))
    expect(reducePublishVerdict({ ...base, expectedMin: 2, stableSweeps: 1, sweep: { children: all } }).phase).toBe('pending')
  })

  it('is pending — not failed — while nothing has rendered yet', () => {
    const verdict = reducePublishVerdict({ ...base, sweep: { children: [] } })
    expect(verdict.phase).toBe('pending')
    expect(verdict.total).toBe(0)
  })

  it('AT THE BOUND: still-pending children become `stalled`, never `failed`', () => {
    const pendingChildren = [readChildSync('a-000', child('Unknown'))]
    const verdict = reducePublishVerdict({ ...base, elapsedMs: 300000, expectedMin: 6, sweep: { children: pendingChildren } })
    expect(verdict.phase).toBe('stalled')
    expect(verdict.failure).toBeUndefined()
  })

  it('AT THE BOUND: nothing read at all + a transport error becomes `unreadable`, not `failed`', () => {
    const verdict = reducePublishVerdict({ ...base, elapsedMs: 999999, sweep: { children: [], transportError: 'read failed (HTTP 403)' } })
    expect(verdict.phase).toBe('unreadable')
  })

  it('a failure still wins over an expired budget', () => {
    const children = [readChildSync('a-000', child('False', CLONE_FAILURE))]
    expect(reducePublishVerdict({ ...base, elapsedMs: 999999, expectedMin: 1, sweep: { children } }).phase).toBe('failed')
  })
})

describe('isTerminalPhase', () => {
  it('keeps only `pending` running', () => {
    expect(isTerminalPhase('pending')).toBe(false)
    const terminal: PublishFollowPhase[] = ['pushed', 'failed', 'stalled', 'unreadable']
    expect(terminal.every((phase) => isTerminalPhase(phase))).toBe(true)
  })
})
