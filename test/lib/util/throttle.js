/* eslint-env mocha */

import assert from 'node:assert'
import throttle from '../../../dist/util/throttle.js'

describe('throttle', () => {
  it('executes the first call immediately', () => {
    let count = 0
    const fn = throttle(() => { count++ }, 100)
    fn()
    assert.strictEqual(count, 1)
  })

  it('defers a second call within the delay', (done) => {
    const calls = []
    const fn = throttle((v) => { calls.push(v) }, 30)

    fn('first')
    fn('second')

    assert.strictEqual(calls.length, 1)
    assert.strictEqual(calls[0], 'first')

    setTimeout(() => {
      assert.strictEqual(calls.length, 2)
      assert.strictEqual(calls[1], 'second')
      done()
    }, 60)
  })

  it('uses latest args for trailing call', (done) => {
    const calls = []
    const fn = throttle((v) => { calls.push(v) }, 30)

    fn('a')
    fn('b')
    fn('c')

    setTimeout(() => {
      assert.strictEqual(calls.length, 2)
      assert.strictEqual(calls[0], 'a')
      assert.strictEqual(calls[1], 'c')
      done()
    }, 60)
  })

  it('allows immediate call again after delay', (done) => {
    let count = 0
    const fn = throttle(() => { count++ }, 20)

    fn()
    assert.strictEqual(count, 1)

    setTimeout(() => {
      fn()
      assert.strictEqual(count, 2)
      done()
    }, 40)
  })

  it('clears pending timer when immediate call happens', (done) => {
    const calls = []
    const fn = throttle((v) => { calls.push(v) }, 20)

    fn('first')
    fn('queued')

    setTimeout(() => {
      // After delay, trailing call should have fired
      // Now call again — should be immediate (no stale timer)
      fn('after-delay')
      assert.strictEqual(calls[calls.length - 1], 'after-delay')
      done()
    }, 50)
  })

  it('handles zero delay by executing every call immediately', () => {
    let count = 0
    const fn = throttle(() => { count++ }, 0)

    fn()
    fn()
    fn()

    assert.strictEqual(count, 3)
  })

  it('produces at most 2 invocations for rapid calls (leading + trailing)', (done) => {
    let count = 0
    const fn = throttle(() => { count++ }, 30)

    for (let i = 0; i < 10; i++) {
      fn()
    }

    assert.strictEqual(count, 1) // only leading

    setTimeout(() => {
      assert.strictEqual(count, 2) // leading + trailing
      done()
    }, 60)
  })
})
