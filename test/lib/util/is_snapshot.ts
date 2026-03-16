import assert from 'node:assert'

import { isSnapshot } from '../../../dist/util/index.js'

describe('isSnapshot - detects snapshots by data structure', () => {
  it('returns false for heartbeats', () => {
    assert.strictEqual(isSnapshot(['hb']), false)
  })

  it('returns false simple lists (data updates)', () => {
    assert.strictEqual(isSnapshot([1337]), false)
  })

  it('returns true for nested lists (snapshots)', () => {
    assert.strictEqual(isSnapshot([['a'], ['b']]), true)
  })

  it('returns false for null input', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assert.strictEqual(isSnapshot(null as any), false)
  })

  it('returns false for undefined input', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assert.strictEqual(isSnapshot(undefined as any), false)
  })

  it('returns false for non-array input', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assert.strictEqual(isSnapshot('string' as any), false)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assert.strictEqual(isSnapshot(42 as any), false)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assert.strictEqual(isSnapshot({} as any), false)
  })

  it('returns false for empty array', () => {
    assert.strictEqual(isSnapshot([]), false)
  })

  it('returns true for single-element nested array', () => {
    assert.strictEqual(isSnapshot([['a']]), true)
  })
})
