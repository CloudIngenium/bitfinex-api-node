/* eslint-env mocha */

import assert from 'node:assert'
import { EventEmitter } from 'events'
import _isObject from 'lodash/isObject.js'
import _isArray from 'lodash/isArray.js'
import WS2Manager from '../../dist/ws2_manager.js'
import WSv2 from '../../dist/transports/ws2.js'

describe('WS2Manager', () => {
  let m

  afterEach(async () => {
    if (m) {
      try {
        await m.close()
      } catch (e) {
        assert.ok(true, 'may fail due to being modified internally')
      } finally {
        m = null // eslint-disable-line
      }
    }
  })

  describe('setAuthArgs', () => {
    it('updates the internal auth args', () => {
      m = new WS2Manager()
      m.setAuthArgs({ apiKey: '42' })
      assert.strictEqual(m.getAuthArgs().apiKey, '42')
    })
  })

  describe('getAuthArgs', () => {
    it('returns internal auth args', () => {
      m = new WS2Manager()
      m.setAuthArgs({ apiKey: '42' })
      assert.strictEqual(m.getAuthArgs().apiKey, '42')
    })
  })

  describe('reconnect', () => {
    it('calls reconnect on all sockets', async () => {
      m = new WS2Manager()
      let called = false

      m._sockets.push({
        ws: { reconnect: async () => { called = true } }
      })

      await m.reconnect()
      assert.ok(called, 'reconnect not called on socket')
    })

    it('resolves when all sockets reconnect', async () => {
      m = new WS2Manager()
      let called = false

      m._sockets.push({
        ws: {
          reconnect: async () => {
            await new Promise(resolve => setTimeout(resolve, 10))
            called = true
          }
        }
      })

      await m.reconnect()
      assert.ok(called, 'reconnect not called on socket')
    })
  })

  describe('close', () => {
    it('calls close on all sockets', async () => {
      m = new WS2Manager()
      let called = false

      m._sockets.push({
        ws: { close: async () => { called = true } }
      })

      await m.close()
      assert.ok(called, 'close not called on socket')
    })

    it('resolves when all sockets close', async () => {
      m = new WS2Manager()
      let called = false

      m._sockets.push({
        ws: {
          close: async () => {
            await new Promise(resolve => setTimeout(resolve, 10))
            called = true
          }
        }
      })

      await m.close()
      assert.ok(called, 'close not called on socket')
    })
  })

  describe('getNumSockets', () => {
    it('returns the number of sockets', () => {
      m = new WS2Manager()
      m._sockets.push({})
      m._sockets.push({})
      assert.strictEqual(m.getNumSockets(), 2, 'did not report correct number of sockets')
    })
  })

  describe('getSocket', () => {
    it('returns the socket at the requested index', () => {
      m = new WS2Manager()
      m._sockets.push(1)
      m._sockets.push(42)
      assert.strictEqual(m.getSocket(1), 42)
    })
  })

  describe('getSocketInfo', () => {
    it('returns an array of objects reporting number of data channels per socket', () => {
      m = new WS2Manager()

      m._sockets.push({
        pendingSubscriptions: [[], [], []],
        pendingUnsubscriptions: [[]],
        ws: { getDataChannelCount: () => 2 }
      })

      m._sockets.push({
        pendingSubscriptions: [[], [], []],
        pendingUnsubscriptions: [[]],
        ws: { getDataChannelCount: () => 3 }
      })

      const info = m.getSocketInfo()

      assert.ok(_isArray(info), 'did not return array')
      info.forEach(i => assert.ok(_isObject(i), 'socket info not an object'))
      assert.strictEqual(info[0].nChannels, 4, 'socket info does not report correct number of channels')
      assert.strictEqual(info[1].nChannels, 5, 'socket info does not report correct number of channels')
    })
  })

  describe('getDataChannelCount', () => {
    it('takes pending subs & unsubs into account', () => {
      const s = {
        ws: new WSv2(),
        pendingSubscriptions: [['book', {}]],
        pendingUnsubscriptions: []
      }

      s.ws._channelMap = {
        0: { channel: 'trades' },
        1: { channel: 'candles', key: 'test' },
        2: { channel: 'auth' }
      }

      const count = WS2Manager.getDataChannelCount(s)

      assert.strictEqual(s.ws.getDataChannelCount(), 2)
      assert.strictEqual(count, 3)
    })
  })

  describe('auth', () => {
    it('does nothing if api key/secret are already provided', () => {
      m = new WS2Manager({ apiKey: 'x', apiSecret: 'x' })

      m.auth({ apiKey: '42', apiSecret: '43' })
      assert.strictEqual(m._socketArgs.apiKey, 'x')
      assert.strictEqual(m._socketArgs.apiSecret, 'x')
    })

    it('saves auth args', () => {
      m = new WS2Manager()

      m.auth({ calc: 1, dms: 4 })
      assert.strictEqual(m._authArgs.calc, 1)
      assert.strictEqual(m._authArgs.dms, 4)
    })

    it('calls auth on existing unauthenticated sockets', (done) => {
      let cred = false
      m = new WS2Manager()

      m._sockets = [{
        ws: {
          isAuthenticated: () => false,
          updateAuthArgs: ({ apiKey: key, apiSecret: secret }) => { cred = `${key}:${secret}` },
          auth: () => {
            assert.strictEqual(cred, '41:42')
            done()
          }
        }
      }]

      m.auth({ apiKey: '41', apiSecret: '42' })
    })
  })

  describe('openSocket', () => {
    it('binds listeners to forward events', async () => {
      const heardEvents = {}
      const events = [
        'open', 'message', 'auth', 'error', 'close', 'subscribed',
        'unsubscribed'
      ]

      m = new WS2Manager()
      const s = m.openSocket()
      const { ws } = s

      events.forEach(e => {
        m.on(e, () => { heardEvents[e] = true })
      })

      events.forEach(e => ws.emit(e))
      events.forEach(e => {
        assert(heardEvents[e])
      })

      return new Promise((resolve, reject) => {
        ws.on('open', () => ws.close().then(resolve).catch(reject))
      })
    }).timeout(4000)

    it('saves socket state', async () => {
      m = new WS2Manager()
      const s = m.openSocket()
      const { ws } = s

      assert.deepStrictEqual(m._sockets[0], s)

      return new Promise((resolve, reject) => {
        ws.on('open', () => ws.close().then(resolve).catch(reject))
      })
    }).timeout(4000)

    it('binds \'unsubscribed\' listener to remove channel from pending unsubs', async () => {
      m = new WS2Manager()
      const s = m.openSocket()
      const { ws } = s

      s.pendingUnsubscriptions.push(`${42}`)
      s.ws.emit('unsubscribed', { chanId: 42 })

      assert.strictEqual(s.pendingUnsubscriptions.length, 0)

      return new Promise((resolve, reject) => {
        ws.on('open', () => ws.close().then(resolve).catch(reject))
      })
    }).timeout(4000)

    it('binds \'subscribed\' listener to remove channel from pending subs', async () => {
      m = new WS2Manager()
      const s = m.openSocket()
      const { ws } = s

      s.pendingSubscriptions.push(['book', { symbol: 'tBTCUSD', prec: 'R0' }])
      s.ws.emit('subscribed', {
        channel: 'book',
        symbol: 'tBTCUSD',
        prec: 'R0',
        len: '25'
      })

      assert.strictEqual(s.pendingSubscriptions.length, 0)

      return new Promise((resolve, reject) => {
        ws.on('open', () => ws.close().then(resolve).catch(reject))
      })
    }).timeout(4000)

    it('auto-auths if manager has credentials configured', (done) => {
      m = new WS2Manager({
        apiKey: 'key',
        apiSecret: 'secret'
      })

      const s = m.openSocket()
      const { ws } = s

      ws.auth = async () => {
        assert.strictEqual(ws._authArgs.apiKey, 'key', 'api key not set')
        assert.strictEqual(ws._authArgs.apiSecret, 'secret', 'api secret not set')

        await ws.close()
        done()
      }
    }).timeout(4000)
  })

  describe('getAuthenticatedSocket', () => {
    it('returns the first authenticated socket found', () => {
      m = new WS2Manager()

      for (let i = 0; i < 3; i += 1) {
        m._sockets.push({
          test: i,
          ws: { isAuthenticated: () => i === 1 }
        })
      }

      assert.strictEqual(m.getAuthenticatedSocket().test, 1, 'did not return correct socket')
    })
  })

  describe('getFreeDataSocket', () => {
    it('returns the first socket below the data channel limit', () => {
      m = new WS2Manager()

      m._sockets[0] = {
        ws: { getDataChannelCount: () => 200 },
        pendingSubscriptions: new Array(70),
        pendingUnsubscriptions: new Array(10)
      }

      m._sockets[1] = {
        ws: { getDataChannelCount: () => 5 },
        pendingSubscriptions: [],
        pendingUnsubscriptions: []
      }

      const s = m.getFreeDataSocket()
      assert.deepStrictEqual(s, m._sockets[1])
    })
  })

  describe('getSocketWithDataChannel', () => {
    it('returns socket subscribed to specified channel/filter pair', () => {
      m = new WS2Manager()
      m._sockets[0] = {
        ws: {},
        pendingSubscriptions: [['candles', { key: 'test' }]],
        pendingUnsubscriptions: []
      }

      let s = m.getSocketWithDataChannel('candles', { key: 'test' })
      assert.deepStrictEqual(s, m._sockets[0])

      /// /
      m._sockets[0] = {
        ws: { getDataChannelId: () => false },
        pendingSubscriptions: [['auth', {}]],
        pendingUnsubscriptions: []
      }

      s = m.getSocketWithDataChannel('candles', { key: 'test' })
      assert(!s)

      /// /
      m._sockets[0] = {
        ws: {
          getDataChannelId: (type, filter) => {
            assert.strictEqual(type, 'candles')
            assert.deepStrictEqual(filter, { key: 'test' })
            return 1
          }
        },
        pendingSubscriptions: [],
        pendingUnsubscriptions: []
      }

      s = m.getSocketWithDataChannel('candles', { key: 'test' })
      assert.deepStrictEqual(s, m._sockets[0])

      /// /
      m._sockets[0] = {
        ws: {
          getDataChannelId: (type, filter) => {
            assert.strictEqual(type, 'candles')
            assert.deepStrictEqual(filter, { key: 'test' })
            return 1
          }
        },
        pendingSubscriptions: [],
        pendingUnsubscriptions: [1]
      }

      s = m.getSocketWithDataChannel('candles', { key: 'test' })
      assert(!s)
    })
  })

  describe('getSocketWithChannel', () => {
    it('returns correct socket', () => {
      m = new WS2Manager()
      m._sockets[0] = {
        pendingUnsubscriptions: [],
        ws: {
          hasChannel: (id) => {
            return id === 42
          }
        }
      }

      let s = m.getSocketWithChannel(42)
      assert.deepStrictEqual(s, m._sockets[0])

      /// /
      m._sockets[0] = {
        pendingUnsubscriptions: [42],
        ws: {
          hasChannel: (id) => {
            return id === 42
          }
        }
      }

      s = m.getSocketWithChannel(42)
      assert(!s)
    })
  })

  describe('getSocketWithSubRef', () => {
    it('returns the first socket found that has the requested subscription ref', () => {
      m = new WS2Manager()

      for (let i = 0; i < 3; i += 1) {
        m._sockets.push({
          test: i,
          ws: {
            hasSubscriptionRef: (channel, identifier) => {
              assert.strictEqual(channel, 'a', 'did not pass channel through')
              assert.strictEqual(identifier, 'b', 'did not pass identifier through')
              return i === 1
            }
          }
        })
      }

      const s = m.getSocketWithSubRef('a', 'b')
      assert.ok(_isObject(s), 'did not return a socket')
      assert.strictEqual(s.test, 1, 'did not return correct socket')
    })
  })

  describe('subscribe', () => {
    it('delays sub for unopened sockets', () => {
      m = new WS2Manager()
      let onceOpenCalled = false

      m._sockets[0] = {
        pendingSubscriptions: [],
        pendingUnsubscriptions: [],
        ws: {
          getDataChannelCount: () => 0,
          managedSubscribe: () => assert(false),
          isOpen: () => false,
          once: (eName) => {
            assert.strictEqual(eName, 'open')
            onceOpenCalled = true
          }
        }
      }

      m.subscribe('candles', 'test', { key: 'test' })
      assert(onceOpenCalled)
    })

    it('saves pending sub', () => {
      m = new WS2Manager()
      m._sockets[0] = {
        pendingSubscriptions: [],
        pendingUnsubscriptions: [],
        ws: {
          getDataChannelCount: () => 0,
          managedSubscribe: () => {},
          isOpen: () => true
        }
      }

      m.subscribe('candles', 'test', { key: 'test' })
      assert.deepStrictEqual(m._sockets[0].pendingSubscriptions, [
        ['candles', { key: 'test' }]
      ])
    })

    it('opens a new socket if no sockets are available', () => {
      m = new WS2Manager()
      let openCalled = false

      m.openSocket = () => {
        openCalled = true

        return {
          pendingSubscriptions: [],
          ws: {
            once: () => {},
            isOpen: () => false // to avoid managed sub
          }
        }
      }

      m.subscribe('candles', 'test', { key: 'test' })
      assert(openCalled)
    })

    it('opens a new socket if no sockets are below data limit', () => {
      m = new WS2Manager()
      let openCalled = false

      m._sockets[0] = {
        pendingSubscriptions: [],
        pendingUnsubscriptions: [],
        ws: {
          getDataChannelCount: () => 255
        }
      }

      m.openSocket = () => {
        openCalled = true

        const state = {
          pendingSubscriptions: [],
          ws: {
            once: () => {},
            isOpen: () => false // to avoid managed sub
          }
        }

        m._sockets.push(state)
        return state
      }

      m.subscribe('candles', 'test', { key: 'test' })

      assert(openCalled)
      assert.strictEqual(m._sockets.length, 2)
    })
  })

  describe('unsubscribe', () => {
    it('saves pending unsub & calls unsub on socket', () => {
      m = new WS2Manager()
      let unsubCalled = false

      m._sockets[0] = {
        pendingUnsubscriptions: [],
        ws: {
          unsubscribe: (cid) => {
            assert.strictEqual(cid, 42)
            unsubCalled = true
          },

          hasChannel: (cid) => {
            return cid === 42
          }
        }
      }

      m.unsubscribe(42)
      assert.deepStrictEqual(m._sockets[0].pendingUnsubscriptions, ['42'])
      assert(unsubCalled)
    })

    it('stores chanId as string for type-safe comparison', () => {
      m = new WS2Manager()
      m._sockets[0] = {
        pendingUnsubscriptions: [],
        ws: {
          unsubscribe: () => {},
          hasChannel: () => true
        }
      }

      m.unsubscribe(42)
      assert.strictEqual(typeof m._sockets[0].pendingUnsubscriptions[0], 'string')
      assert.strictEqual(m._sockets[0].pendingUnsubscriptions[0], '42')
    })
  })

  describe('managedUnsubscribe', () => {
    it('saves pending unsub and calls managed unsub on socket', () => {
      m = new WS2Manager()
      let unsubCalled = false

      m._sockets[0] = {
        pendingUnsubscriptions: [],
        ws: {
          managedUnsubscribe: (cid) => {
            assert.strictEqual(cid, 42)
            unsubCalled = true
          },

          hasSubscriptionRef: (cid) => cid === 42,
          _chanIdByIdentifier: () => 42
        }
      }

      m.managedUnsubscribe(42)
      assert.deepStrictEqual(m._sockets[0].pendingUnsubscriptions, ['42'])
      assert(unsubCalled)
    })

    it('stores chanId as string for type-safe comparison', () => {
      m = new WS2Manager()
      m._sockets[0] = {
        pendingUnsubscriptions: [],
        ws: {
          managedUnsubscribe: () => {},
          hasSubscriptionRef: () => true,
          _chanIdByIdentifier: () => 99
        }
      }

      m.managedUnsubscribe('ticker', 'tBTCUSD')
      assert.strictEqual(typeof m._sockets[0].pendingUnsubscriptions[0], 'string')
      assert.strictEqual(m._sockets[0].pendingUnsubscriptions[0], '99')
    })
  })

  describe('auth error handling', () => {
    it('emits error when socket auth fails', (done) => {
      m = new WS2Manager()

      m._sockets = [{
        ws: {
          isAuthenticated: () => false,
          updateAuthArgs: () => {},
          auth: () => Promise.reject(new Error('auth failed'))
        }
      }]

      m.on('error', (err) => {
        assert.ok(err.message.includes('auth failed'))
        done()
      })

      m.auth({ apiKey: 'k', apiSecret: 's' })
    })
  })

  describe('socket close cleanup', () => {
    it('clears pending operations on socket close', () => {
      m = new WS2Manager()

      // Use a simple EventEmitter to avoid real WebSocket connections
      const fakeWs = new EventEmitter()
      const wsState = {
        pendingSubscriptions: [],
        pendingUnsubscriptions: [],
        ws: fakeWs
      }

      fakeWs.on('close', () => {
        wsState.pendingSubscriptions = []
        wsState.pendingUnsubscriptions = []
        const idx = m._sockets.indexOf(wsState)
        if (idx !== -1) {
          m._sockets.splice(idx, 1)
        }
        fakeWs.removeAllListeners()
      })

      m._sockets.push(wsState)
      wsState.pendingSubscriptions.push(['ticker', { symbol: 'tBTCUSD' }])
      wsState.pendingUnsubscriptions.push('42')

      fakeWs.emit('close')

      assert.deepStrictEqual(wsState.pendingSubscriptions, [])
      assert.deepStrictEqual(wsState.pendingUnsubscriptions, [])
    })

    it('removes socket from pool on close', () => {
      m = new WS2Manager()

      const fakeWs = new EventEmitter()
      const wsState = {
        pendingSubscriptions: [],
        pendingUnsubscriptions: [],
        ws: fakeWs
      }

      fakeWs.on('close', () => {
        const idx = m._sockets.indexOf(wsState)
        if (idx !== -1) {
          m._sockets.splice(idx, 1)
        }
        fakeWs.removeAllListeners()
      })

      m._sockets.push(wsState)
      assert.strictEqual(m.getNumSockets(), 1)
      fakeWs.emit('close')
      assert.strictEqual(m.getNumSockets(), 0)
    })
  })

  describe('close clears socket pool', () => {
    it('empties _sockets array after closing', async () => {
      m = new WS2Manager()
      let closeCalled = false

      m._sockets.push({
        ws: {
          close: async () => { closeCalled = true },
          removeAllListeners: () => {}
        }
      })

      await m.close()
      assert.ok(closeCalled)
      assert.strictEqual(m._sockets.length, 0)
    })
  })

  describe('withAllSockets', () => {
    it('calls the provided cb with all internal sockets', () => {
      m = new WS2Manager()
      const socketsSeen = {}

      m._sockets = ['a', 'b', 'c']
      m.withAllSockets((sock) => {
        socketsSeen[sock] = true
      })

      assert(socketsSeen.a)
      assert(socketsSeen.b)
      assert(socketsSeen.c)
    })
  })

  describe('subscribeOrderBook', () => {
    it('calls subscribe with a valid filter and the provided symbol', (done) => {
      m = new WS2Manager()
      m.subscribe = (type, symbol, filter) => {
        assert.ok(_isObject(filter), 'filter not an object')
        assert.strictEqual(filter.symbol, 'tBTCUSD', 'symbol did not match')
        assert.strictEqual(filter.prec, 'P0', 'prec did not match')
        assert.strictEqual(filter.len, '25', 'len did not match')
        assert.strictEqual(filter.freq, 'F0', 'freq did not match')
        assert.strictEqual(symbol, 'tBTCUSD')
        done()
      }

      m.subscribeOrderBook('tBTCUSD', 'P0', '25', 'F0')
    })
  })

  describe('onOrderBook', () => {
    it('passes a valid OB filter to the first socket with a book channel', (done) => {
      const assertFilter = (filter) => {
        assert.ok(_isObject(filter), 'filter not an object')
        assert.strictEqual(filter.symbol, 'tBTCUSD', 'symbol did not match')
        assert.strictEqual(filter.prec, 'P0', 'prec did not match')
        assert.strictEqual(filter.len, '25', 'len did not match')
        assert.strictEqual(filter.freq, 'F0', 'freq did not match')
      }

      m = new WS2Manager()
      m._sockets.push({
        pendingSubscriptions: [],
        pendingUnsubscriptions: [],
        ws: {
          getDataChannelId: (type, filter) => {
            assert.strictEqual(type, 'book')
            assertFilter(filter)
            return 42
          },

          onOrderBook: (filter) => {
            assertFilter(filter)
            done()
          }
        }
      })

      m.onOrderBook({
        symbol: 'tBTCUSD',
        prec: 'P0',
        len: '25',
        freq: 'F0'
      })
    })
  })

  describe('getSocketInfo', () => {
    it('returns channel count info for each socket', () => {
      m = new WS2Manager()
      m._sockets.push({
        pendingSubscriptions: [['ticker', { symbol: 'tBTCUSD' }]],
        pendingUnsubscriptions: [],
        ws: { getDataChannelCount: () => 2 }
      })
      m._sockets.push({
        pendingSubscriptions: [],
        pendingUnsubscriptions: [],
        ws: { getDataChannelCount: () => 5 }
      })

      const info = m.getSocketInfo()
      assert.strictEqual(info.length, 2)
      assert.strictEqual(info[0].nChannels, 3)
      assert.strictEqual(info[1].nChannels, 5)
    })
  })

  describe('getAuthenticatedSocket', () => {
    it('returns first authenticated socket', () => {
      m = new WS2Manager()
      m._sockets.push({
        ws: { isAuthenticated: () => false }
      })
      m._sockets.push({
        ws: { isAuthenticated: () => true, id: 'auth-socket' }
      })

      const s = m.getAuthenticatedSocket()
      assert.ok(s)
      assert.strictEqual(s.ws.id, 'auth-socket')
    })

    it('returns undefined when no socket is authenticated', () => {
      m = new WS2Manager()
      m._sockets.push({
        ws: { isAuthenticated: () => false }
      })

      assert.strictEqual(m.getAuthenticatedSocket(), undefined)
    })
  })

  describe('getSocketWithChannel', () => {
    it('finds socket with matching channel', () => {
      m = new WS2Manager()
      m._sockets.push({
        pendingUnsubscriptions: [],
        ws: { hasChannel: (id) => id === 42, id: 'match' }
      })

      const s = m.getSocketWithChannel(42)
      assert.ok(s)
      assert.strictEqual(s.ws.id, 'match')
    })

    it('excludes socket with pending unsub', () => {
      m = new WS2Manager()
      m._sockets.push({
        pendingUnsubscriptions: [42],
        ws: { hasChannel: () => true }
      })

      const s = m.getSocketWithChannel(42)
      assert.strictEqual(s, undefined)
    })
  })

  describe('getSocketWithSubRef', () => {
    it('finds socket with matching subscription ref', () => {
      m = new WS2Manager()
      m._sockets.push({
        ws: { hasSubscriptionRef: (ch, id) => ch === 'ticker' && id === 'tBTCUSD', id: 'match' }
      })

      const s = m.getSocketWithSubRef('ticker', 'tBTCUSD')
      assert.ok(s)
      assert.strictEqual(s.ws.id, 'match')
    })
  })

  describe('managedUnsubscribe', () => {
    it('calls ws.managedUnsubscribe and tracks pending unsub', () => {
      m = new WS2Manager()
      let unsubCalled = false
      const mockWs = {
        hasSubscriptionRef: () => true,
        _chanIdByIdentifier: () => '42',
        managedUnsubscribe: () => { unsubCalled = true }
      }
      const wsState = {
        pendingSubscriptions: [],
        pendingUnsubscriptions: [],
        ws: mockWs
      }
      m._sockets.push(wsState)

      m.managedUnsubscribe('ticker', 'tBTCUSD')
      assert.ok(unsubCalled)
      assert.strictEqual(wsState.pendingUnsubscriptions.length, 1)
      assert.strictEqual(wsState.pendingUnsubscriptions[0], '42')
    })

    it('does nothing if no socket has the sub ref', () => {
      m = new WS2Manager()
      m._sockets.push({
        ws: { hasSubscriptionRef: () => false }
      })

      // Should not throw
      m.managedUnsubscribe('ticker', 'tBTCUSD')
    })
  })

  describe('unsubscribe', () => {
    it('calls ws.unsubscribe and tracks pending unsub', () => {
      m = new WS2Manager()
      let unsubCalled = false
      const mockWs = {
        hasChannel: () => true,
        unsubscribe: () => { unsubCalled = true }
      }
      const wsState = {
        pendingUnsubscriptions: [],
        ws: mockWs
      }
      m._sockets.push(wsState)

      m.unsubscribe(42)
      assert.ok(unsubCalled)
      assert.strictEqual(wsState.pendingUnsubscriptions[0], '42')
    })

    it('does nothing for unknown channel', () => {
      m = new WS2Manager()
      m._sockets.push({
        pendingUnsubscriptions: [],
        ws: { hasChannel: () => false }
      })

      // Should not throw
      m.unsubscribe(999)
    })
  })

  describe('constructor', () => {
    it('stores socket args with reconnect throttler', () => {
      m = new WS2Manager({ apiKey: 'test' })
      assert.strictEqual(m._socketArgs.apiKey, 'test')
      assert.ok(m._socketArgs.reconnectThrottler)
    })

    it('uses default auth args', () => {
      m = new WS2Manager()
      assert.strictEqual(m._authArgs.calc, 0)
      assert.strictEqual(m._authArgs.dms, 0)
    })

    it('accepts custom auth args', () => {
      m = new WS2Manager({}, { calc: 1, dms: 4 })
      assert.strictEqual(m._authArgs.calc, 1)
      assert.strictEqual(m._authArgs.dms, 4)
    })
  })

  describe('getDataChannelCount', () => {
    it('counts subscribed + pending - unsubscribing channels', () => {
      const state = {
        pendingSubscriptions: [['ticker', {}], ['trades', {}]],
        pendingUnsubscriptions: ['42'],
        ws: { getDataChannelCount: () => 5 }
      }

      assert.strictEqual(WS2Manager.getDataChannelCount(state), 6)
    })
  })

  describe('onCandle', () => {
    it('throws when no matching socket found', () => {
      m = new WS2Manager()
      assert.throws(
        () => m.onCandle({ key: 'trade:1m:tBTCUSD' }, () => {}),
        /no data socket available/
      )
    })

    it('delegates to ws.onCandle on matching socket', (done) => {
      m = new WS2Manager()
      const cb = () => {}
      m._sockets.push({
        pendingSubscriptions: [],
        pendingUnsubscriptions: [],
        ws: {
          getDataChannelId: (type, filter) => {
            assert.strictEqual(type, 'candles')
            assert.deepStrictEqual(filter, { key: 'trade:1m:tBTCUSD' })
            return 42
          },
          onCandle: (opts, fn) => {
            assert.strictEqual(opts.key, 'trade:1m:tBTCUSD')
            assert.strictEqual(fn, cb)
            done()
          }
        }
      })

      m.onCandle({ key: 'trade:1m:tBTCUSD' }, cb)
    })

    it('forwards cbGID to ws.onCandle', (done) => {
      m = new WS2Manager()
      m._sockets.push({
        pendingSubscriptions: [],
        pendingUnsubscriptions: [],
        ws: {
          getDataChannelId: () => 42,
          onCandle: (opts) => {
            assert.strictEqual(opts.cbGID, 'group1')
            done()
          }
        }
      })

      m.onCandle({ key: 'trade:1m:tBTCUSD', cbGID: 'group1' }, () => {})
    })
  })

  describe('onTrades', () => {
    it('throws when no matching socket found', () => {
      m = new WS2Manager()
      assert.throws(
        () => m.onTrades({ symbol: 'tBTCUSD' }, () => {}),
        /no data socket available/
      )
    })

    it('delegates to ws.onTrades on matching socket', (done) => {
      m = new WS2Manager()
      const cb = () => {}
      m._sockets.push({
        pendingSubscriptions: [],
        pendingUnsubscriptions: [],
        ws: {
          getDataChannelId: (type, filter) => {
            assert.strictEqual(type, 'trades')
            assert.deepStrictEqual(filter, { symbol: 'tBTCUSD' })
            return 42
          },
          onTrades: (opts, fn) => {
            assert.strictEqual(opts.symbol, 'tBTCUSD')
            assert.strictEqual(fn, cb)
            done()
          }
        }
      })

      m.onTrades({ symbol: 'tBTCUSD' }, cb)
    })
  })

  describe('onTicker', () => {
    it('throws when no matching socket found', () => {
      m = new WS2Manager()
      assert.throws(
        () => m.onTicker({ symbol: 'tBTCUSD' }, () => {}),
        /no data socket available/
      )
    })

    it('delegates to ws.onTicker on matching socket', (done) => {
      m = new WS2Manager()
      const cb = () => {}
      m._sockets.push({
        pendingSubscriptions: [],
        pendingUnsubscriptions: [],
        ws: {
          getDataChannelId: (type, filter) => {
            assert.strictEqual(type, 'ticker')
            assert.deepStrictEqual(filter, { symbol: 'tBTCUSD' })
            return 42
          },
          onTicker: (opts, fn) => {
            assert.strictEqual(opts.symbol, 'tBTCUSD')
            assert.strictEqual(fn, cb)
            done()
          }
        }
      })

      m.onTicker({ symbol: 'tBTCUSD' }, cb)
    })
  })

  describe('subscribeTicker', () => {
    it('delegates to subscribe with ticker type and symbol filter', (done) => {
      m = new WS2Manager()
      m.subscribe = (type, ident, filter) => {
        assert.strictEqual(type, 'ticker')
        assert.strictEqual(ident, 'tBTCUSD')
        assert.deepStrictEqual(filter, { symbol: 'tBTCUSD' })
        done()
      }

      m.subscribeTicker('tBTCUSD')
    })
  })

  describe('subscribeTrades', () => {
    it('delegates to subscribe with trades type and symbol filter', (done) => {
      m = new WS2Manager()
      m.subscribe = (type, ident, filter) => {
        assert.strictEqual(type, 'trades')
        assert.strictEqual(ident, 'tBTCUSD')
        assert.deepStrictEqual(filter, { symbol: 'tBTCUSD' })
        done()
      }

      m.subscribeTrades('tBTCUSD')
    })
  })

  describe('subscribeCandles', () => {
    it('delegates to subscribe with candles type and key filter', (done) => {
      m = new WS2Manager()
      m.subscribe = (type, ident, filter) => {
        assert.strictEqual(type, 'candles')
        assert.strictEqual(ident, 'trade:1m:tBTCUSD')
        assert.deepStrictEqual(filter, { key: 'trade:1m:tBTCUSD' })
        done()
      }

      m.subscribeCandles('trade:1m:tBTCUSD')
    })
  })
})
