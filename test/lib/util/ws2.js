/* eslint-env mocha */

import assert from 'node:assert'
import getMessagePayload from '../../../dist/util/ws2.js'

describe('getMessagePayload', () => {
  it('returns the last array element from a message', () => {
    const result = getMessagePayload([42, [1, 2, 3]])
    assert.deepStrictEqual(result, [1, 2, 3])
  })

  it('returns the last array when multiple arrays are present', () => {
    const result = getMessagePayload([42, [1, 2], [4, 5, 6]])
    assert.deepStrictEqual(result, [4, 5, 6])
  })

  it('skips non-array elements when finding payload', () => {
    const result = getMessagePayload([42, 'te', [1, 2, 3]])
    assert.deepStrictEqual(result, [1, 2, 3])
  })

  it('returns payload correctly when sequence number is appended', () => {
    const result = getMessagePayload([42, [1, 2, 3], 7])
    assert.deepStrictEqual(result, [1, 2, 3])
  })

  it('handles auth channel messages with sequence numbers', () => {
    const data = [100, 200, 300, 'tBTCUSD']
    const result = getMessagePayload([0, 'tu', data, 5, 8])
    assert.deepStrictEqual(result, data)
  })

  it('returns undefined for empty array', () => {
    const result = getMessagePayload([])
    assert.strictEqual(result, undefined)
  })

  it('returns undefined when called with no arguments', () => {
    const result = getMessagePayload()
    assert.strictEqual(result, undefined)
  })

  it('returns undefined when no array elements exist', () => {
    const result = getMessagePayload([42, 'hb'])
    assert.strictEqual(result, undefined)
  })

  it('handles nested arrays (snapshots)', () => {
    const snapshot = [[1, 2], [3, 4]]
    const result = getMessagePayload([42, snapshot])
    assert.deepStrictEqual(result, snapshot)
  })

  it('returns undefined for single non-array element', () => {
    const result = getMessagePayload([42])
    assert.strictEqual(result, undefined)
  })
})
