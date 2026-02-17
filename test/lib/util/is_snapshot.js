/* eslint-env mocha */
'use strict'

const assert = require('assert')

const { isSnapshot } = require('../../../lib/util')

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
    assert.strictEqual(isSnapshot(null), false)
  })

  it('returns false for undefined input', () => {
    assert.strictEqual(isSnapshot(undefined), false)
  })

  it('returns false for non-array input', () => {
    assert.strictEqual(isSnapshot('string'), false)
    assert.strictEqual(isSnapshot(42), false)
    assert.strictEqual(isSnapshot({}), false)
  })

  it('returns false for empty array', () => {
    assert.strictEqual(isSnapshot([]), false)
  })

  it('returns true for single-element nested array', () => {
    assert.strictEqual(isSnapshot([['a']]), true)
  })
})
