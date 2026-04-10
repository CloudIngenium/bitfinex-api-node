import assert from 'node:assert'
import * as _bfxModels from '@cloudingenium/bfx-api-node-models'
import { isClass } from '../../../dist/util/index.js'

const { TradingTicker } = _bfxModels

describe('isClass', () => {
  it('returns true for classes', () => {
    assert(isClass(TradingTicker))
  })

  it('returns false for functions', () => {
    assert(!isClass(() => {}))
  })

  it('returns false for class instances', () => {
    const t = new TradingTicker()
    assert(!isClass(t))
  })

  it('returns false for primitives', () => {
    assert(!isClass(42))
    assert(!isClass('42'))
    assert(!isClass({}))
    assert(!isClass([]))
  })
})
