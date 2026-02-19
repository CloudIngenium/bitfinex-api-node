/* eslint-env mocha */

import assert from 'node:assert'
import BFX from '../../index.js'
import * as util from '../../lib/util/index.js'

describe('BFX', () => {
  describe('constructor', () => {
    it('throws on non-object argument', () => {
      assert.throws(() => new BFX('string'), /constructor takes an object/)
      assert.throws(() => new BFX(42), /constructor takes an object/)
      assert.throws(() => new BFX(true), /constructor takes an object/)
    })

    it('accepts empty object', () => {
      const bfx = new BFX({})
      assert.ok(bfx)
      assert.strictEqual(bfx._apiKey, '')
      assert.strictEqual(bfx._apiSecret, '')
    })

    it('accepts no arguments (defaults)', () => {
      const bfx = new BFX()
      assert.ok(bfx)
      assert.strictEqual(bfx._transform, false)
    })

    it('stores API credentials', () => {
      const bfx = new BFX({ apiKey: 'key123', apiSecret: 'secret456' })
      assert.strictEqual(bfx._apiKey, 'key123')
      assert.strictEqual(bfx._apiSecret, 'secret456')
    })

    it('stores optional auth fields', () => {
      const bfx = new BFX({ authToken: 'token', company: 'myco' })
      assert.strictEqual(bfx._authToken, 'token')
      assert.strictEqual(bfx._company, 'myco')
    })

    it('stores transform flag', () => {
      const bfx = new BFX({ transform: true })
      assert.strictEqual(bfx._transform, true)

      const bfx2 = new BFX({ transform: false })
      assert.strictEqual(bfx2._transform, false)
    })

    it('stores transport args', () => {
      const ws = { url: 'ws://test' }
      const rest = { url: 'http://test' }
      const bfx = new BFX({ ws, rest })
      assert.deepStrictEqual(bfx._wsArgs, ws)
      assert.deepStrictEqual(bfx._restArgs, rest)
    })

    it('initializes empty transport cache', () => {
      const bfx = new BFX()
      assert.deepStrictEqual(bfx._transportCache, { rest: {}, ws: {} })
    })
  })

  describe('_getTransportPayload', () => {
    it('includes all credentials in payload', () => {
      const bfx = new BFX({
        apiKey: 'k', apiSecret: 's', authToken: 't', company: 'c', transform: true
      })
      const payload = bfx._getTransportPayload({})
      assert.strictEqual(payload.apiKey, 'k')
      assert.strictEqual(payload.apiSecret, 's')
      assert.strictEqual(payload.authToken, 't')
      assert.strictEqual(payload.company, 'c')
      assert.strictEqual(payload.transform, true)
    })

    it('merges extra options', () => {
      const bfx = new BFX({ apiKey: 'k' })
      const payload = bfx._getTransportPayload({ timeout: 5000 })
      assert.strictEqual(payload.apiKey, 'k')
      assert.strictEqual(payload.timeout, 5000)
    })
  })

  describe('rest', () => {
    it('throws on invalid version', () => {
      const bfx = new BFX()
      assert.throws(() => bfx.rest(3))
      assert.throws(() => bfx.rest(0))
    })

    it('returns RESTv2 instance by default', () => {
      const bfx = new BFX()
      const rest = bfx.rest()
      assert.ok(rest)
      assert.strictEqual(rest.constructor.name, 'RESTv2')
    })

    it('returns RESTv1 instance for version 1', () => {
      const bfx = new BFX()
      const rest = bfx.rest(1)
      assert.ok(rest)
      assert.strictEqual(rest.constructor.name, 'RESTv1')
    })

    it('caches instances by version and options', () => {
      const bfx = new BFX()
      const rest1 = bfx.rest(2)
      const rest2 = bfx.rest(2)
      assert.strictEqual(rest1, rest2)
    })

    it('creates separate instances for different options', () => {
      const bfx = new BFX()
      const rest1 = bfx.rest(2, { timeout: 1000 })
      const rest2 = bfx.rest(2, { timeout: 2000 })
      assert.notStrictEqual(rest1, rest2)
    })

    it('does not mutate extraOpts', () => {
      const bfx = new BFX({ rest: { url: 'http://custom' } })
      const opts = { timeout: 5000 }
      bfx.rest(2, opts)
      assert.deepStrictEqual(opts, { timeout: 5000 })
    })

    it('merges restArgs with extraOpts (extraOpts takes priority)', () => {
      const bfx = new BFX({ rest: { timeout: 1000 } })
      const rest = bfx.rest(2, { timeout: 2000 })
      assert.ok(rest)
      // The instance was created — we can't easily inspect the merged opts
      // but we verify no error was thrown
    })
  })

  describe('ws', () => {
    it('throws on invalid version', () => {
      const bfx = new BFX()
      assert.throws(() => bfx.ws(3))
      assert.throws(() => bfx.ws(0))
    })

    it('returns WSv2 instance by default', () => {
      const bfx = new BFX()
      const ws = bfx.ws()
      assert.ok(ws)
      assert.strictEqual(ws.constructor.name, 'WSv2')
    })

    it('caches instances by version and options', () => {
      const bfx = new BFX()
      const ws1 = bfx.ws(2)
      const ws2 = bfx.ws(2)
      assert.strictEqual(ws1, ws2)
    })

    it('creates separate instances for different options', () => {
      const bfx = new BFX()
      const ws1 = bfx.ws(2, { url: 'ws://a' })
      const ws2 = bfx.ws(2, { url: 'ws://b' })
      assert.notStrictEqual(ws1, ws2)
    })

    it('does not mutate extraOpts', () => {
      const bfx = new BFX({ ws: { url: 'ws://custom' } })
      const opts = { transform: true }
      bfx.ws(2, opts)
      assert.deepStrictEqual(opts, { transform: true })
    })

    it('passes credentials to ws transport', () => {
      const bfx = new BFX({ apiKey: 'key', apiSecret: 'secret' })
      const ws = bfx.ws(2)
      assert.strictEqual(ws._authArgs.apiKey, 'key')
      assert.strictEqual(ws._authArgs.apiSecret, 'secret')
    })
  })

  describe('module exports', () => {
    it('exports all transport classes', () => {
      assert.ok(BFX.RESTv1)
      assert.ok(BFX.RESTv2)
      assert.ok(BFX.WSv1)
      assert.ok(BFX.WSv2)
      assert.ok(BFX.WS2Manager)
    })
  })

  describe('cache key stability', () => {
    it('returns same cached instance regardless of option key order', () => {
      const bfx = new BFX()
      const rest1 = bfx.rest(2, { timeout: 1000, url: 'http://test' })
      const rest2 = bfx.rest(2, { url: 'http://test', timeout: 1000 })
      assert.strictEqual(rest1, rest2, 'same opts in different order should return cached instance')
    })

    it('returns same cached ws instance regardless of option key order', () => {
      const bfx = new BFX()
      const ws1 = bfx.ws(2, { transform: true, url: 'ws://test' })
      const ws2 = bfx.ws(2, { url: 'ws://test', transform: true })
      assert.strictEqual(ws1, ws2, 'same opts in different order should return cached instance')
    })

    it('returns different instances for different option values', () => {
      const bfx = new BFX()
      const rest1 = bfx.rest(2, { timeout: 1000 })
      const rest2 = bfx.rest(2, { timeout: 2000 })
      assert.notStrictEqual(rest1, rest2)
    })

    it('handles nested objects in cache key', () => {
      const bfx = new BFX()
      const rest1 = bfx.rest(2, { headers: { 'X-Test': 'a' } })
      const rest2 = bfx.rest(2, { headers: { 'X-Test': 'a' } })
      assert.strictEqual(rest1, rest2)
    })
  })

  describe('util exports', () => {
    it('exports precision utilities from util/index', () => {
      // util is imported at the top of the file
      assert.ok(util.setSigFig)
      assert.ok(util.setPrecision)
      assert.ok(util.prepareAmount)
      assert.ok(util.preparePrice)
      assert.ok(util.isSnapshot)
      assert.ok(util.isClass)
    })
  })

  describe('ESM named exports', () => {
    it('exports RESTv1 as a named export', async () => {
      const { RESTv1 } = await import('../../index.js')
      assert.strictEqual(typeof RESTv1, 'function')
    })

    it('exports RESTv2 as a named export', async () => {
      const { RESTv2 } = await import('../../index.js')
      assert.strictEqual(typeof RESTv2, 'function')
    })

    it('exports WSv1 as a named export', async () => {
      const { WSv1 } = await import('../../index.js')
      assert.strictEqual(typeof WSv1, 'function')
    })

    it('exports WSv2 as a named export', async () => {
      const { WSv2 } = await import('../../index.js')
      assert.strictEqual(typeof WSv2, 'function')
    })

    it('exports WS2Manager as a named export', async () => {
      const { WS2Manager } = await import('../../index.js')
      assert.strictEqual(typeof WS2Manager, 'function')
    })

    it('default export is the BFX class', () => {
      assert.strictEqual(BFX.name, 'BFX')
      assert.strictEqual(typeof BFX, 'function')
    })

    it('named exports match static class properties', async () => {
      const mod = await import('../../index.js')
      assert.strictEqual(mod.RESTv1, BFX.RESTv1)
      assert.strictEqual(mod.RESTv2, BFX.RESTv2)
      assert.strictEqual(mod.WSv1, BFX.WSv1)
      assert.strictEqual(mod.WSv2, BFX.WSv2)
      assert.strictEqual(mod.WS2Manager, BFX.WS2Manager)
    })

    it('util barrel exports all expected symbols as functions', () => {
      const expected = ['isClass', 'isSnapshot', 'setSigFig', 'setPrecision', 'prepareAmount', 'preparePrice']
      for (const name of expected) {
        assert.strictEqual(typeof util[name], 'function', `util.${name} should be a function`)
      }
    })
  })
})
