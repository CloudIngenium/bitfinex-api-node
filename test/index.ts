import assert from 'node:assert'
import BFX from '../dist/index.js'
import { RESTv1, RESTv2 } from '@jcbit/bfx-api-node-rest'
import WSv2 from '../dist/transports/ws2.js'

describe('BFX', () => {
  it('should be loaded', () => {
    assert.strictEqual(typeof BFX, 'function')
  })

  describe('constructor', () => {
    it('throws on using the deprecated way to set options', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assert.throws(() => new (BFX as any)(2, {}))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assert.throws(() => new (BFX as any)('dummy', 'dummy', 2))
    })
  })

  describe('rest', () => {
    it('throws an error if an invalid version is requested', () => {
      const bfx = new BFX()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assert.throws(bfx.rest.bind(bfx, 0 as any))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assert.throws(bfx.rest.bind(bfx, 3 as any))
    })

    it('returns correct REST api by version', () => {
      const bfx = new BFX()
      const restDefault = bfx.rest()
      const rest1 = bfx.rest(1)
      const rest2 = bfx.rest(2)

      assert(restDefault instanceof RESTv2)
      assert(rest1 instanceof RESTv1)
      assert(rest2 instanceof RESTv2)
    })

    it('passes API keys & transform flag to new transport', () => {
      const bfx = new BFX({
        apiKey: 'k',
        apiSecret: 's',
        transform: true,
        rest: {
          url: 'http://'
        }
      })

      const rest1 = bfx.rest(1)
      const rest2 = bfx.rest(2)

      assert.strictEqual(rest1._apiKey, 'k')
      assert.strictEqual(rest2._apiKey, 'k')
      assert.strictEqual(rest1._apiSecret, 's')
      assert.strictEqual(rest2._apiSecret, 's')
      assert.strictEqual(rest1._url, 'http://')
      assert.strictEqual(rest2._url, 'http://')
      assert.strictEqual(rest2._transform, true)
    })

    it('passes extra options to new transport', () => {
      const bfx = new BFX()
      const rest2 = bfx.rest(2, { url: '/dev/null' })
      assert.strictEqual(rest2._url, '/dev/null')
    })

    it('returns one instance if called twice for the same version', () => {
      const bfx = new BFX()
      const restA = bfx.rest(2)
      const restB = bfx.rest(2)
      assert(restA === restB)
    })
  })

  describe('ws', () => {
    it('throws an error if an invalid version is requested', () => {
      const bfx = new BFX()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assert.throws(bfx.ws.bind(bfx, 0 as any))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assert.throws(bfx.ws.bind(bfx, 3 as any))
    })

    it('returns correct WebSocket api by version', () => {
      const bfx = new BFX()
      const wsDefault = bfx.ws()
      const ws2 = bfx.ws(2)

      assert(wsDefault instanceof WSv2)
      assert(ws2 instanceof WSv2)
    })

    it('throws when requesting WSv1', () => {
      const bfx = new BFX()
      assert.throws(() => bfx.ws(1), /WSv1 has been removed/)
    })

    it('passes API keys & transform flag to new transport', () => {
      const bfx = new BFX({
        apiKey: 'k',
        apiSecret: 's',
        transform: true,
        ws: {
          url: 'wss://'
        }
      })

      const ws2 = bfx.ws(2)

      assert.strictEqual(ws2._authArgs.apiKey, 'k')
      assert.strictEqual(ws2._authArgs.apiSecret, 's')
      assert.strictEqual(ws2._url, 'wss://')
      assert.strictEqual(ws2._transform, true)
    })

    it('passes extra options to new transport', () => {
      const bfx = new BFX()
      const ws2 = bfx.ws(2, { url: '/dev/null' })
      assert.strictEqual(ws2._url, '/dev/null')
    })

    it('returns one instance if called twice for the same version', () => {
      const bfx = new BFX()
      const wsA = bfx.ws(2)
      const wsB = bfx.ws(2)

      assert(wsA === wsB)
    })
  })
})
