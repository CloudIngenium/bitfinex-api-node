import assert from 'node:assert'
import deepEqual from '../../../dist/util/deep_equal.js'

describe('deepEqual', () => {
  it('returns true for same reference', () => {
    const obj = { a: 1 }
    assert.strictEqual(deepEqual(obj, obj), true)
  })

  it('returns true for equal primitives', () => {
    assert.strictEqual(deepEqual(1, 1), true)
    assert.strictEqual(deepEqual('abc', 'abc'), true)
    assert.strictEqual(deepEqual(true, true), true)
  })

  it('returns false for unequal primitives', () => {
    assert.strictEqual(deepEqual(1, 2), false)
    assert.strictEqual(deepEqual('a', 'b'), false)
    assert.strictEqual(deepEqual(true, false), false)
  })

  it('returns true for both null', () => {
    assert.strictEqual(deepEqual(null, null), true)
  })

  it('returns false when one side is null', () => {
    assert.strictEqual(deepEqual(null, {}), false)
    assert.strictEqual(deepEqual({}, null), false)
    assert.strictEqual(deepEqual(null, 1), false)
    assert.strictEqual(deepEqual(undefined, {}), false)
  })

  it('returns false for different types', () => {
    assert.strictEqual(deepEqual(1, '1'), false)
    assert.strictEqual(deepEqual(true, 1), false)
  })

  it('returns true for empty objects', () => {
    assert.strictEqual(deepEqual({}, {}), true)
  })

  it('returns true for objects with same keys and values', () => {
    assert.strictEqual(deepEqual({ a: 1, b: 2 }, { a: 1, b: 2 }), true)
  })

  it('returns false for objects with different keys', () => {
    assert.strictEqual(deepEqual({ a: 1 }, { b: 1 }), false)
  })

  it('returns false for objects with different values', () => {
    assert.strictEqual(deepEqual({ a: 1 }, { a: 2 }), false)
  })

  it('returns false for objects with different key counts', () => {
    assert.strictEqual(deepEqual({ a: 1 }, { a: 1, b: 2 }), false)
    assert.strictEqual(deepEqual({ a: 1, b: 2 }, { a: 1 }), false)
  })

  it('compares nested objects recursively', () => {
    assert.strictEqual(deepEqual({ a: { b: 1 } }, { a: { b: 1 } }), true)
    assert.strictEqual(deepEqual({ a: { b: 1 } }, { a: { b: 2 } }), false)
    assert.strictEqual(deepEqual({ a: { b: { c: 3 } } }, { a: { b: { c: 3 } } }), true)
  })

  it('returns false when key missing on b via hasOwnProperty', () => {
    const b = Object.create({ inherited: true })
    assert.strictEqual(deepEqual({ inherited: true }, b), false)
  })
})
