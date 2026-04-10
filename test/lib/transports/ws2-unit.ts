/* eslint-env mocha */

import assert from 'node:assert'
import _bfxMockSrv from 'bfx-api-mock-srv'
import * as _bfxModels from '@cloudingenium/bfx-api-node-models'

const _isFunction = (v) => typeof v === 'function'
const _isObject = (v) => v !== null && typeof v === 'object'
const _isString = (v) => typeof v === 'string'
const _isEmpty = (v) => !v || (typeof v === 'string' && v.length === 0)
const _isError = (v) => v instanceof Error
const _includes = (str, sub) => str.includes(sub)

import WSv2 from '../../../dist/transports/ws2.js'

const { MockWSv2Server } = _bfxMockSrv
const {
  Position, FundingOffer, FundingCredit, FundingLoan, Wallet, BalanceInfo,
  MarginInfo, FundingInfo, FundingTrade, Notification, Candle, PublicTrade,
  Trade, TradingTicker, FundingTicker
} = _bfxModels

const API_KEY = 'dummy'
const API_SECRET = 'dummy'

const createTestWSv2Instance = (params = {}) => {
  return new WSv2({
    apiKey: API_KEY,
    apiSecret: API_SECRET,
    url: 'ws://localhost:9997',
    ...params
  })
}

describe('WSv2 unit', () => {
  let ws = null
  let wss = null

  afterEach(async () => {
    try { // may fail due to being modified by a test, it's not a problem
      if (ws && ws.isOpen()) {
        await ws.close()
      }
    } catch (e) {
      assert(true)
    }

    if (wss && wss.isOpen()) {
      await wss.close()
    }

    ws = null // eslint-disable-line
    wss = null // eslint-disable-line
  })

  describe('event subscribers', () => {
    const testSub = (name, eventName, filterIndex, filterKey, filterValue, model) => {
      describe(name, () => {
        it(`listens for ${eventName} event, passes valid filter, and uses correct model`, (done) => {
          ws = createTestWSv2Instance()
          ws._registerListener = (passedEventName, filter, passedModel) => {
            assert.strictEqual(passedEventName, eventName, 'incorrect event name')

            if (filterIndex !== null) {
              assert.deepStrictEqual(filter, { [filterIndex]: filterValue }, 'incorrect filter')
            }

            if (model !== null) {
              assert.strictEqual(model, passedModel)
            }

            done()
          }

          ws[name]({ [filterKey]: filterValue })
        })
      })
    }

    testSub('onCandle', 'candle', 0, 'key', 'test-key', Candle)
    testSub('onTrades', 'trades', 0, 'symbol', 'tBTCUSD', PublicTrade)
    testSub('onTrades', 'trades', 0, 'symbol', 'fUSD', FundingTrade)
    testSub('onTradeEntry', 'trade-entry', 0, 'symbol', 'tBTCUSD', PublicTrade)
    testSub('onAccountTradeEntry', 'auth-te', 1, 'symbol', 'tBTCUSD', Trade)
    testSub('onAccountTradeUpdate', 'auth-tu', 1, 'symbol', 'tBTCUSD', Trade)
    testSub('onTicker', 'ticker', 0, 'symbol', 'tBTCUSD', TradingTicker)
    testSub('onTicker', 'ticker', 0, 'symbol', 'fUSD', FundingTicker)
    testSub('onStatus', 'status', 0, 'key', 'test-key', null)
    testSub('onPositionSnapshot', 'ps', 0, 'symbol', 'tBTCUSD', Position)
    testSub('onPositionNew', 'pn', 0, 'symbol', 'tBTCUSD', Position)
    testSub('onPositionUpdate', 'pu', 0, 'symbol', 'tBTCUSD', Position)
    testSub('onPositionClose', 'pc', 0, 'symbol', 'tBTCUSD', Position)
    testSub('onFundingOfferSnapshot', 'fos', 1, 'symbol', 'tBTCUSD', FundingOffer)
    testSub('onFundingOfferNew', 'fon', 1, 'symbol', 'tBTCUSD', FundingOffer)
    testSub('onFundingOfferUpdate', 'fou', 1, 'symbol', 'tBTCUSD', FundingOffer)
    testSub('onFundingOfferClose', 'foc', 1, 'symbol', 'tBTCUSD', FundingOffer)
    testSub('onFundingCreditSnapshot', 'fcs', 1, 'symbol', 'tBTCUSD', FundingCredit)
    testSub('onFundingCreditNew', 'fcn', 1, 'symbol', 'tBTCUSD', FundingCredit)
    testSub('onFundingCreditUpdate', 'fcu', 1, 'symbol', 'tBTCUSD', FundingCredit)
    testSub('onFundingCreditClose', 'fcc', 1, 'symbol', 'tBTCUSD', FundingCredit)
    testSub('onFundingLoanSnapshot', 'fls', 1, 'symbol', 'tBTCUSD', FundingLoan)
    testSub('onFundingLoanNew', 'fln', 1, 'symbol', 'tBTCUSD', FundingLoan)
    testSub('onFundingLoanUpdate', 'flu', 1, 'symbol', 'tBTCUSD', FundingLoan)
    testSub('onFundingLoanClose', 'flc', null, null, null, FundingLoan)
    testSub('onWalletSnapshot', 'ws', null, null, null, Wallet)
    testSub('onWalletUpdate', 'wu', null, null, null, Wallet)
    testSub('onBalanceInfoUpdate', 'bu', null, null, null, BalanceInfo)
    testSub('onMarginInfoUpdate', 'miu', null, null, null, MarginInfo)
    testSub('onFundingInfoUpdate', 'fiu', null, null, null, FundingInfo)
    testSub('onFundingTradeEntry', 'fte', 0, 'symbol', 'tBTCUSD', FundingTrade)
    testSub('onFundingTradeUpdate', 'ftu', 0, 'symbol', 'tBTCUSD', FundingTrade)
    testSub('onNotification', 'n', 1, 'type', 'oc-req', Notification)
  })

  describe('utilities', () => {
    it('sendEnabledFlags: sends the current flags value to the server', async () => {
      ws = createTestWSv2Instance()
      wss = new MockWSv2Server()

      await ws.open()

      ws._enabledFlags = WSv2.flags.CHECKSUM // eslint-disable-line

      return new Promise((resolve) => {
        ws.send = (packet) => {
          assert.strictEqual(packet.event, 'conf')
          assert.strictEqual(packet.flags, WSv2.flags.CHECKSUM)
          resolve()
        }

        ws.sendEnabledFlags()
      })
    })

    it('enableFlag: saves enabled flag status', () => {
      ws = createTestWSv2Instance()

      assert(!ws.isFlagEnabled(WSv2.flags.SEQ_ALL))
      assert(!ws.isFlagEnabled(WSv2.flags.CHECKSUM))

      ws.enableFlag(WSv2.flags.SEQ_ALL)

      assert(ws.isFlagEnabled(WSv2.flags.SEQ_ALL))
      assert(!ws.isFlagEnabled(WSv2.flags.CHECKSUM))

      ws.enableFlag(WSv2.flags.CHECKSUM)

      assert(ws.isFlagEnabled(WSv2.flags.SEQ_ALL))
      assert(ws.isFlagEnabled(WSv2.flags.CHECKSUM))
    })

    it('enableFlag: sends conf packet if open', async () => {
      ws = createTestWSv2Instance()
      wss = new MockWSv2Server()

      await ws.open()

      return new Promise((resolve) => {
        ws.send = (packet) => {
          assert(_isObject(packet))
          assert.strictEqual(packet.event, 'conf')
          resolve()
        }

        ws.enableFlag(WSv2.flags.SEQ_ALL)
      })
    })

    it('_registerListener: correctly adds listener to internal map with cbGID', () => {
      ws = createTestWSv2Instance()
      ws._registerListener('trade', { 2: 'tBTCUSD' }, Map, 42, () => { })

      const { _listeners } = ws

      assert.strictEqual(Object.keys(_listeners).length, 1)
      assert.strictEqual(+Object.keys(_listeners)[0], 42)
      assert.strictEqual(typeof _listeners[42], 'object')

      const listenerSet = _listeners[42]

      assert.strictEqual(Object.keys(listenerSet).length, 1)
      assert.strictEqual(Object.keys(listenerSet)[0], 'trade')
      assert.strictEqual(listenerSet.trade.constructor.name, 'Array')
      assert.strictEqual(listenerSet.trade.length, 1)

      const listener = listenerSet.trade[0]

      assert.strictEqual(listener.modelClass, Map)
      assert.deepStrictEqual(listener.filter, { 2: 'tBTCUSD' })
      assert.strictEqual(typeof listener.cb, 'function')
    })

    it('sequencingEnabled: returns sequencing status', () => {
      ws = createTestWSv2Instance({ seqAudit: false })

      assert.ok(_isFunction(ws.sequencingEnabled), 'WSv2 does not provide sequencingEnabled()')
      assert.ok(!ws.sequencingEnabled(), 'sequencing enabled even though disabled in constructor')
      ws.enableSequencing()
      assert.ok(ws.sequencingEnabled(), 'sequencing status not reported by getter')
    })

    it('enableSequencing: sends the correct conf flag', async () => {
      ws = createTestWSv2Instance()
      wss = new MockWSv2Server()
      let packetSent = false

      await ws.open()

      ws.send = (packet) => {
        assert.strictEqual(packet.event, 'conf')
        assert.strictEqual(packet.flags, 65536)
        packetSent = true
      }

      ws.enableSequencing()

      assert(packetSent)
    })

    it('getCandles: returns empty array if no candle set is available', () => {
      ws = createTestWSv2Instance()
      assert.deepStrictEqual(ws.getCandles('i.dont.exist'), [])
    })

    it('_sendCalc: stringifes payload & passes it to the ws client', (done) => {
      ws = createTestWSv2Instance()

      ws._isOpen = true
      ws._ws = {}
      ws._ws.send = (data) => {
        assert.strictEqual(data, '[]')
        done()
      }

      ws._sendCalc([])
    })

    it('notifyUI: throws error if supplied invalid arguments', () => {
      ws = createTestWSv2Instance()

      assert.throws(() => ws.notifyUI())
      assert.throws(() => ws.notifyUI(null))
      assert.throws(() => ws.notifyUI(null, null))
    })

    it('notifyUI: throws error if socket closed or not authenticated', () => {
      ws = createTestWSv2Instance()
      const n = { type: 'info', message: 'test' }

      assert.throws(() => ws.notifyUI(n))
      ws._isOpen = true
      assert.throws(() => ws.notifyUI(n))
      ws._isAuthenticated = true
      ws.send = () => { }
      assert.doesNotThrow(() => ws.notifyUI(n))
    })

    it('notifyUI: sends the correct UCM broadcast notification', (done) => {
      ws = createTestWSv2Instance()
      ws._isOpen = true
      ws._isAuthenticated = true
      ws.send = (msg = []) => {
        assert.deepStrictEqual(msg[0], 0)
        assert.deepStrictEqual(msg[1], 'n')
        assert.deepStrictEqual(msg[2], null)

        const data = msg[3]

        assert(_isObject(data))
        assert.deepStrictEqual(data.type, 'ucm-notify-ui')
        assert(_isObject(data.info))
        assert.deepStrictEqual(data.info.type, 'success')
        assert.deepStrictEqual(data.info.message, '42')
        done()
      }

      ws.notifyUI({ type: 'success', message: '42' })
    })
  })

  describe('lifetime', () => {
    it('starts unopened & unauthenticated', () => {
      ws = createTestWSv2Instance()

      assert.strictEqual(ws.isOpen(), false)
      assert.strictEqual(ws.isAuthenticated(), false)
    })

    it('open: fails to open twice', async () => {
      wss = new MockWSv2Server()
      ws = createTestWSv2Instance()

      await ws.open()

      try {
        await ws.open()
        assert(false)
      } catch (e) {
        assert.ok(true, 'failed to open twice')
      }
    })

    it('open: updates open flag', async () => {
      wss = new MockWSv2Server()
      ws = createTestWSv2Instance()

      await ws.open()

      assert.strictEqual(ws.isOpen(), true)
    })

    it('open: sends flags value', async () => {
      wss = new MockWSv2Server()
      ws = createTestWSv2Instance()
      let flagsSent = false

      ws.enableSequencing()
      ws.sendEnabledFlags = () => {
        assert.strictEqual(ws._enabledFlags, WSv2.flags.SEQ_ALL)
        flagsSent = true
      }

      await ws.open()

      assert(flagsSent)
    })

    it('close: doesn\'t close if not open', async () => {
      ws = createTestWSv2Instance()

      try {
        await ws.close()
        assert(false)
      } catch (e) {
        assert.ok(true, 'did not close due to being open')
      }
    })

    it('close: fails to close twice', async () => {
      wss = new MockWSv2Server()
      ws = createTestWSv2Instance()

      await ws.open()

      return new Promise((resolve) => {
        ws.on('close', async () => {
          try {
            await ws.close()
            assert(false)
          } catch (e) {
            resolve()
          }
        })

        return ws.close()
      })
    })

    it('close: clears connection state', async () => {
      wss = new MockWSv2Server()
      ws = createTestWSv2Instance()
      ws._onWSClose = () => { } // disable fallback reset

      await ws.open()

      assert(ws._ws !== null)
      assert(ws._isOpen)

      await ws.close()

      assert(ws._ws == null)
      assert(!ws._isOpen)
    })

    it('auth: fails to auth twice', async () => {
      wss = new MockWSv2Server()
      ws = createTestWSv2Instance()

      await ws.open()
      await ws.auth()

      try {
        await ws.auth()
        assert(false)
      } catch (e) {
        assert.ok(true, 'failed to auth twice')
      }
    })

    it('auth: updates auth flag', async () => {
      wss = new MockWSv2Server()
      ws = createTestWSv2Instance()

      await ws.open()
      await ws.auth()

      assert(ws.isAuthenticated())
    })

    it('auth: forwards calc param', async () => {
      wss = new MockWSv2Server()
      ws = createTestWSv2Instance()
      let sentCalc = false

      await ws.open()

      const send = ws.send
      ws.send = (data) => {
        assert.strictEqual(data.calc, 42)
        sentCalc = true

        ws.send = send
        ws.send(data)
      }

      await ws.auth(42)

      assert(sentCalc)
    })

    it('auth: forwards dms param', async () => {
      wss = new MockWSv2Server()
      ws = createTestWSv2Instance()
      let sentDMS = false

      await ws.open()

      const send = ws.send
      ws.send = (data) => {
        assert.strictEqual(data.dms, 42)
        sentDMS = true

        ws.send = send
        ws.send(data)
      }

      await ws.auth(0, 42)

      assert(sentDMS)
    })

    it('reconnect: connects if not already connected', async () => {
      wss = new MockWSv2Server()
      ws = createTestWSv2Instance()

      let sawClose = false
      let sawOpen = false

      ws.on('close', () => { sawClose = true })
      ws.on('open', () => { sawOpen = true })

      await ws.reconnect()

      assert(!sawClose)
      assert(sawOpen)
    })

    it('reconnect: disconnects & connects back if currently connected', async () => {
      wss = new MockWSv2Server()
      ws = createTestWSv2Instance()

      await ws.open()

      let sawClose = false
      let sawOpen = false

      ws.on('close', () => { sawClose = true })
      ws.on('open', () => { sawOpen = true })

      await ws.reconnect()

      assert(sawClose)
      assert(sawOpen)
      assert(ws.isOpen())
    })

    it('reconnect: automatically auths on open if previously authenticated', async () => {
      wss = new MockWSv2Server()
      ws = createTestWSv2Instance()

      let closed = false
      let opened = false
      let authenticated = false

      ws.on('error', (error) => {
        throw error
      })

      await ws.open()
      await ws.auth()

      ws.once('close', () => { closed = true })
      ws.once('open', () => { opened = true })
      ws.once('auth', () => { authenticated = true })

      await ws.reconnect()

      assert(closed)
      assert(opened)
      assert(authenticated)
    })
  })

  describe('constructor', () => {
    it('defaults to production WS url', () => {
      ws = createTestWSv2Instance({ url: undefined })
      assert.notStrictEqual(ws._url.indexOf('api.bitfinex.com'), -1)
    })

    it('defaults to no transform', () => {
      ws = createTestWSv2Instance()
      const transWS = createTestWSv2Instance({ transform: true })
      assert.strictEqual(ws._transform, false)
      assert.strictEqual(transWS._transform, true)
    })
  })

  describe('auto reconnect', () => {
    it('reconnects on close if autoReconnect is enabled', async () => {
      wss = new MockWSv2Server()
      ws = createTestWSv2Instance({ autoReconnect: true })

      await ws.open()
      await ws.auth()

      return new Promise((resolve) => {
        ws.reconnectAfterClose = Promise.resolve(resolve())
        wss.close() // trigger reconnect
      })
    })

    it('respects reconnectDelay', async () => {
      wss = new MockWSv2Server()
      ws = createTestWSv2Instance({
        autoReconnect: true,
        reconnectDelay: 75
      })

      await ws.open()
      await ws.auth()

      return new Promise((resolve) => {
        const now = Date.now()

        ws.reconnectAfterClose = () => {
          assert((Date.now() - now) >= 70)
          resolve()

          return Promise.resolve()
        }

        wss.close() // trigger reconnect
      })
    })

    it('does not auto-reconnect if explicity closed', async () => {
      wss = new MockWSv2Server()
      ws = createTestWSv2Instance({
        autoReconnect: true
      })

      await ws.open()
      await ws.auth()

      ws.reconnect = async () => assert(false)
      await ws.close()

      await new Promise(resolve => setTimeout(resolve, 50))
    })
  })

  it('reconnect with new credentials', async () => {
    wss = new MockWSv2Server({ authMiddleware: ({ apiKey, apiSecret }) => apiKey === API_KEY && apiSecret === API_SECRET })
    ws = createTestWSv2Instance({ reconnectDelay: 10 })

    await ws.open()
    await ws.auth()
    assert(ws.isAuthenticated())

    ws.updateAuthArgs({ apiKey: 'wrong', apiSecret: 'wrong' })
    ws.reconnect()
    await new Promise(resolve => setTimeout(resolve, 50))
    assert(!ws.isAuthenticated())

    ws.updateAuthArgs({ apiKey: API_KEY, apiSecret: API_SECRET })
    ws.reconnect()
    await new Promise(resolve => setTimeout(resolve, 50))
    assert(ws.isAuthenticated())
  })

  describe('seq audit', () => {
    it('automatically enables sequencing if seqAudit is true in constructor', () => {
      ws = createTestWSv2Instance({ seqAudit: true })
      assert(ws.isFlagEnabled(WSv2.flags.SEQ_ALL))
    })

    it('emits error on invalid seq number', async () => {
      wss = new MockWSv2Server()
      ws = createTestWSv2Instance({ seqAudit: true })

      let errorsSeen = 0

      await ws.open()
      await ws.auth()

      ws.on('error', (err) => {
        if (_includes(err.message, 'seq #')) errorsSeen++

        return null
      })

      ws._channelMap[42] = { channel: 'trades', chanId: 42 } // eslint-disable-line

      ws._onWSMessage(JSON.stringify([0, 'tu', [], 0, 0]))
      ws._onWSMessage(JSON.stringify([0, 'te', [], 1, 0]))
      ws._onWSMessage(JSON.stringify([0, 'wu', [], 2, 1]))
      ws._onWSMessage(JSON.stringify([0, 'tu', [], 3, 2])) //
      ws._onWSMessage(JSON.stringify([0, 'tu', [], 4, 4])) // error
      ws._onWSMessage(JSON.stringify([0, 'tu', [], 5, 5]))
      ws._onWSMessage(JSON.stringify([0, 'tu', [], 6, 6]))
      ws._onWSMessage(JSON.stringify([42, [], 7]))
      ws._onWSMessage(JSON.stringify([42, [], 8]))
      ws._onWSMessage(JSON.stringify([42, [], 9])) //
      ws._onWSMessage(JSON.stringify([42, [], 13])) // error
      ws._onWSMessage(JSON.stringify([42, [], 14]))
      ws._onWSMessage(JSON.stringify([42, [], 15]))

      assert.strictEqual(errorsSeen, 6)
    })
  })

  describe('ws event handlers', () => {
    it('_onWSOpen: updates open flag', () => {
      ws = createTestWSv2Instance()
      assert(!ws.isOpen())
      ws._onWSOpen()
      assert(ws.isOpen())
    })

    it('_onWSClose: updates open flag', () => {
      ws = createTestWSv2Instance()
      ws._onWSOpen()
      assert(ws.isOpen())
      ws._onWSClose()
      assert(!ws.isOpen())
    })

    it('_onWSError: emits error', (done) => {
      ws = createTestWSv2Instance()
      ws.on('error', () => done())
      ws._onWSError(new Error())
    })

    it('_onWSMessage: emits error on invalid packet', (done) => {
      ws = createTestWSv2Instance()
      ws.on('error', () => done())
      ws._onWSMessage('I can\'t believe it\'s not JSON!')
    })

    it('_onWSMessage: emits message', () => {
      ws = createTestWSv2Instance()
      const msg = [1]
      const flags = 'flags'
      let messageSeen = false

      ws.on('message', (m) => {
        assert.deepStrictEqual(m, msg)
        assert.strictEqual(flags, 'flags')
        messageSeen = true
      })

      ws._onWSMessage(JSON.stringify(msg), flags)
      assert(messageSeen)
    })

    it('_onWSNotification: triggers event callbacks for new orders', (done) => {
      ws = createTestWSv2Instance()
      const kNew = 'order-new-42'

      ws._eventCallbacks.push(kNew, (err, order) => {
        assert(!err)
        assert(order)
        assert.deepStrictEqual(order, [0, 0, 42])

        ws._eventCallbacks.push(kNew, (err, order) => {
          assert(err)
          assert.deepStrictEqual(order, [0, 0, 42])
          done()
        })

        ws._onWSNotification([0, 'on-req', null, null, [0, 0, 42], 0, 'ERROR', 'order failed'])
      })

      ws._onWSNotification([0, 'on-req', null, null, [0, 0, 42], 0, 'SUCCESS', 'ok'])
    })

    it('_onWSNotification: triggers event callbacks for cancelled orders', (done) => {
      ws = createTestWSv2Instance()
      const kCancel = 'order-cancel-42'

      ws._eventCallbacks.push(kCancel, (err, order) => {
        assert(!err)
        assert(order)
        assert.deepStrictEqual(order, [42])

        ws._eventCallbacks.push(kCancel, (err, order) => {
          assert(err)
          assert.deepStrictEqual(order, [42])
          done()
        })

        ws._onWSNotification([0, 'oc-req', null, null, [42], 0, 'ERROR', 'cancel failed'])
      })

      ws._onWSNotification([0, 'oc-req', null, null, [42], 0, 'SUCCESS', 'ok'])
    })
  })

  describe('WSv2 channel msg handling', () => {
    it('_handleChannelMessage: emits message', () => {
      ws = createTestWSv2Instance()

      const packet = [42, 'tu', []]
      let packetSeen = false

      ws._channelMap = {
        42: { channel: 'meaning' }
      }

      ws.on('meaning', (msg) => {
        assert.deepStrictEqual(msg, packet)
        packetSeen = true
      })

      ws._handleChannelMessage(packet)
      assert(packetSeen)
    })

    it('_handleChannelMessage: calls all registered listeners (nofilter)', (done) => {
      ws = createTestWSv2Instance()
      ws._channelMap = { 0: { channel: 'auth' } }
      let called = 0
      ws.onWalletUpdate({}, () => {
        if (++called === 2) done()
      })

      ws.onWalletUpdate({}, () => {
        if (++called === 2) done()
      })

      ws._handleChannelMessage([0, 'wu', []])
    })

    const doFilterTest = (transform, done) => {
      ws = new WSv2({ transform })
      ws._channelMap = { 0: { channel: 'auth' } }
      let calls = 0
      let btcListenerCalled = false

      ws.onAccountTradeEntry({ symbol: 'tBTCUSD' }, () => {
        assert(!btcListenerCalled)
        btcListenerCalled = true

        if (++calls === 7) done()
      })

      ws.onAccountTradeEntry({}, () => {
        if (++calls === 7) done()
      })

      ws.onAccountTradeEntry({}, () => {
        if (++calls === 7) done()
      })

      ws._handleChannelMessage([0, 'te', [123, 'tETHUSD']])
      ws._handleChannelMessage([0, 'te', [123, 'tETHUSD']])
      ws._handleChannelMessage([0, 'te', [123, 'tBTCUSD']])
    }

    it('_handleChannelMessage: filters messages if listeners require it (transform)', (done) => {
      doFilterTest(true, done)
    })

    it('_handleChannelMessage: filters messages if listeners require it (no transform)', (done) => {
      doFilterTest(false, done)
    })

    it('_handleChannelMessage: transforms payloads if enabled', (done) => {
      let calls = 0

      const wsTransform = new WSv2({ transform: true })
      const wsNoTransform = new WSv2({ transform: false })
      wsTransform._channelMap = { 0: { channel: 'auth' } }
      wsNoTransform._channelMap = { 0: { channel: 'auth' } }

      const tradeData = [
        0, 'tBTCUSD', Date.now(), 0, 0.1, 1, 'type', 1, false, 0.001, 'USD'
      ]

      wsNoTransform.onAccountTradeUpdate({}, (trade) => {
        assert.strictEqual(trade.constructor.name, 'Array')
        assert.deepStrictEqual(trade, tradeData)

        if (calls++ === 1) done()
      })

      wsTransform.onAccountTradeUpdate({}, (trade) => {
        assert.strictEqual(trade.constructor.name, 'Trade')
        assert.strictEqual(trade.id, tradeData[0])
        assert.strictEqual(trade.symbol, tradeData[1])
        assert.strictEqual(trade.mtsCreate, tradeData[2])
        assert.strictEqual(trade.orderID, tradeData[3])
        assert.strictEqual(trade.execAmount, tradeData[4])
        assert.strictEqual(trade.execPrice, tradeData[5])
        assert.strictEqual(trade.orderType, tradeData[6])
        assert.strictEqual(trade.orderPrice, tradeData[7])
        assert.strictEqual(trade.maker, tradeData[8])
        assert.strictEqual(trade.fee, tradeData[9])
        assert.strictEqual(trade.feeCurrency, tradeData[10])

        if (calls++ === 1) done()
      })

      wsTransform._handleChannelMessage([0, 'tu', tradeData])
      wsNoTransform._handleChannelMessage([0, 'tu', tradeData])
    })

    it('onMessage: calls the listener with all messages (no filter)', (done) => {
      ws = createTestWSv2Instance()
      ws._channelMap = { 0: { channel: 'auth' } }

      let calls = 0

      ws.onMessage({}, () => {
        if (++calls === 2) done()
      })

      ws._handleChannelMessage([0, 'wu', []])
      ws._handleChannelMessage([0, 'tu', []])
    })

    it('_payloadPassesFilter: correctly detects matching payloads', () => {
      const filter = {
        1: 'tBTCUSD'
      }

      const goodPayloads = [
        [0, 'tBTCUSD', 42, ''],
        [0, 'tBTCUSD', 3.14, '']
      ]

      const badPayloads = [
        [0, 'tETHUSD', 42, ''],
        [0, 'tETHUSD', 3.14, '']
      ]

      goodPayloads.forEach(p => assert(WSv2._payloadPassesFilter(p, filter)))
      badPayloads.forEach(p => assert(!WSv2._payloadPassesFilter(p, filter)))
    })

    it('_payloadPassesFilter: ignores filter if empty', () => {
      const filterUndefined = { 1: undefined }
      const filterNull = { 1: null }
      const filterEmpty = { 1: '' }
      const payload = [0, 'tBTCUSD', 42, '']

      assert(WSv2._payloadPassesFilter(payload, filterUndefined))
      assert(WSv2._payloadPassesFilter(payload, filterNull))
      assert(WSv2._payloadPassesFilter(payload, filterEmpty))
    })

    it('_payloadPassesFilter: ignores filter if *', () => {
      const filter = { 1: '*' }
      const payload = [0, 'tBTCUSD', 42, '']

      assert(WSv2._payloadPassesFilter(payload, filter))
    })

    it('_notifyListenerGroup: notifies all matching listeners in the group', (done) => {
      let calls = 0
      const func = () => {
        assert(calls < 3)
        if (++calls === 2) done()
      }

      const lg = {
        '': [{ cb: func }],
        test: [{ cb: func }],
        nope: [{ cb: func }]
      }

      WSv2._notifyListenerGroup(lg, [0, 'test', [0, 'tu']], false)
    })

    it('_notifyListenerGroup: doesn\'t fail on missing data if filtering', (done) => {
      const lg = {
        test: [{
          filter: { 1: 'on' },
          cb: () => {
            done(new Error('filter should not have matched'))
          }
        }]
      }

      WSv2._notifyListenerGroup(lg, [0, 'test'], false)
      done()
    })

    it('_propagateMessageToListeners: notifies all matching listeners', () => {
      const ws = createTestWSv2Instance()
      let seenMessage = false
      ws._channelMap = { 0: { channel: 'auth' } }

      ws.onAccountTradeEntry({ symbol: 'tBTCUSD' }, () => {
        seenMessage = true
      })

      ws._propagateMessageToListeners([0, 'auth-te', [123, 'tBTCUSD']])
      assert(seenMessage)
    })

    it('_notifyCatchAllListeners: passes data to all listeners on the empty \'\' event', () => {
      let s = 0

      const lg = {
        '': [
          { cb: d => { s += d } },
          { cb: d => { s += (d * 2) } }
        ]
      }

      WSv2._notifyCatchAllListeners(lg, 5)
      assert.strictEqual(s, 15)
    })

    it('_handleOBMessage: maintains internal OB if management is enabled', () => {
      ws = new WSv2({
        manageOrderBooks: true,
        transform: true
      })

      ws._channelMapA = {
        42: {
          channel: 'orderbook',
          symbol: 'tBTCUSD'
        }
      }
      ws._channelMapB = {
        43: {
          channel: 'orderbook',
          symbol: 'fUSD'
        }
      }

      let obMsg = [42, [
        [100, 2, -4],
        [200, 4, -8],
        [300, 1, 3]
      ]]

      ws._handleOBMessage(obMsg, ws._channelMapA[42], JSON.stringify(obMsg))

      obMsg = [43, [
        [0.0008, 2, 5, 200],
        [0.00045, 30, 4, -300],
        [0.0004, 15, 3, -600]
      ]]

      ws._handleOBMessage(obMsg, ws._channelMapB[43], JSON.stringify(obMsg))

      let obA = ws.getOB('tBTCUSD')
      let obB = ws.getOB('fUSD')

      assert(obA !== null)
      assert(obB !== null)

      assert.strictEqual(obA.bids.length, 1)
      assert.strictEqual(obB.bids.length, 2)
      assert.deepStrictEqual(obA.bids, [[300, 1, 3]])
      assert.deepStrictEqual(obB.bids, [[0.00045, 30, 4, -300], [0.0004, 15, 3, -600]])
      assert.strictEqual(obA.asks.length, 2)
      assert.strictEqual(obB.asks.length, 1)
      assert.deepStrictEqual(obA.getEntry(100), { price: 100, count: 2, amount: -4 })
      assert.deepStrictEqual(obA.getEntry(200), { price: 200, count: 4, amount: -8 })
      assert.deepStrictEqual(obB.getEntry(0.00045), { rate: 0.00045, count: 4, amount: -300, period: 30 })
      assert.deepStrictEqual(obB.getEntry(0.0008), { rate: 0.0008, count: 5, amount: 200, period: 2 })

      obMsg = [42, [300, 0, 1]]
      ws._handleOBMessage(obMsg, ws._channelMapA[42], JSON.stringify(obMsg))
      obA = ws.getOB('tBTCUSD')
      assert.strictEqual(obA.bids.length, 0)
      obMsg = [43, [0.0008, 2, 0, 1]]
      ws._handleOBMessage(obMsg, ws._channelMapB[43], JSON.stringify(obMsg))
      obB = ws.getOB('fUSD')
      assert.strictEqual(obB.asks.length, 0)
    })

    it('_handleOBMessage: emits error on internal OB update failure', (done) => {
      const wsNoTransform = new WSv2({ manageOrderBooks: true })
      const wsTransform = new WSv2({
        manageOrderBooks: true,
        transform: true
      })

      wsNoTransform._channelMap = {
        42: {
          channel: 'orderbook',
          symbol: 'tBTCUSD'
        }
      }

      wsTransform._channelMap = wsNoTransform._channelMap

      let errorsSeen = 0

      wsNoTransform.on('error', () => {
        if (++errorsSeen === 2) done()
      })

      wsTransform.on('error', () => {
        if (++errorsSeen === 2) done()
      })

      const obMsg = [42, [100, 0, 1]]
      wsTransform._handleOBMessage(obMsg, wsTransform._channelMap[42], JSON.stringify(obMsg))
      wsNoTransform._handleOBMessage(obMsg, wsNoTransform._channelMap[42], JSON.stringify(obMsg))
    })

    it('_handleOBMessage: forwards managed ob to listeners', (done) => {
      ws = new WSv2({ manageOrderBooks: true })
      ws._channelMap = {
        42: {
          channel: 'orderbook',
          symbol: 'tBTCUSD'
        }
      }

      let seen = 0
      ws.onOrderBook({ symbol: 'tBTCUSD' }, (ob) => {
        assert.deepStrictEqual(ob, [[100, 2, 3]])
        if (++seen === 2) done()
      })

      ws.onOrderBook({}, (ob) => {
        assert.deepStrictEqual(ob, [[100, 2, 3]])
        if (++seen === 2) done()
      })

      const obMsg = [42, [[100, 2, 3]]]
      ws._handleOBMessage(obMsg, ws._channelMap[42], JSON.stringify(obMsg))
    })

    it('_handleOBMessage: filters by prec and len', (done) => {
      ws = new WSv2({ manageOrderBooks: true })
      ws._channelMap = {
        40: {
          channel: 'orderbook',
          symbol: 'tBTCUSD',
          prec: 'P0'
        },

        41: {
          channel: 'orderbook',
          symbol: 'tBTCUSD',
          prec: 'P1'
        },

        42: {
          channel: 'orderbook',
          symbol: 'tBTCUSD',
          prec: 'P2'
        }
      }

      let seen = 0
      ws.onOrderBook({ symbol: 'tBTCUSD', prec: 'P0' }, () => {
        assert(false)
      })

      ws.onOrderBook({ symbol: 'tBTCUSD', prec: 'P1' }, () => {
        assert(false)
      })

      ws.onOrderBook({ symbol: 'tBTCUSD', prec: 'P2' }, () => {
        if (++seen === 2) done()
      })

      const obMsg = [42, [[100, 2, 3]]]
      ws._handleOBMessage(obMsg, ws._channelMap[42], JSON.stringify(obMsg))
      ws._handleOBMessage(obMsg, ws._channelMap[42], JSON.stringify(obMsg))
    })

    it('_handleOBMessage: emits managed ob', (done) => {
      ws = new WSv2({ manageOrderBooks: true })
      ws._channelMap = {
        42: {
          channel: 'orderbook',
          symbol: 'tBTCUSD'
        }
      }

      ws.on('orderbook', (symbol, data) => {
        assert.strictEqual(symbol, 'tBTCUSD')
        assert.deepStrictEqual(data, [[100, 2, 3]])
        done()
      })

      const obMsg = [42, [[100, 2, 3]]]
      ws._handleOBMessage(obMsg, ws._channelMap[42], JSON.stringify(obMsg))
    })

    it('_handleOBMessage: forwards transformed data if transform enabled', (done) => {
      ws = new WSv2({ transform: true })
      ws._channelMap = {
        42: {
          chanId: 42,
          channel: 'orderbook',
          symbol: 'tBTCUSD'
        }
      }

      ws.onOrderBook({ symbol: 'tBTCUSD' }, (ob) => {
        assert(ob.asks)
        assert(ob.bids)
        assert.strictEqual(ob.asks.length, 0)
        assert.deepStrictEqual(ob.bids, [[100, 2, 3]])
        done()
      })

      const obMsg = [42, [[100, 2, 3]]]
      ws._handleOBMessage(obMsg, ws._channelMap[42], obMsg)
    })

    it('_updateManagedOB: does nothing on rm non-existent entry', () => {
      ws = createTestWSv2Instance()
      ws._orderBooks.tBTCUSD = [
        [100, 1, 1],
        [200, 2, 1]
      ]
      ws._losslessOrderBooks.tBTCUSD = [
        ['100', '1', '1'],
        ['200', '2', '1']
      ]

      const err = ws._updateManagedOB('tBTCUSD', [150, 0, -1], false, JSON.stringify([1, [150, 0, -1]]))
      assert.strictEqual(err, null)
      assert.deepStrictEqual(ws._orderBooks.tBTCUSD, [
        [100, 1, 1],
        [200, 2, 1]
      ])
    })

    it('_updateManagedOB: correctly maintains transformed OBs', () => {
      ws = new WSv2({ transform: true })
      ws._orderBooks.tBTCUSD = []
      ws._losslessOrderBooks.tBTCUSD = []

      // symbol, data, raw, rawMsg
      assert(!ws._updateManagedOB('tBTCUSD', [100, 1, 1], false, JSON.stringify([1, [100, 1, 1]])))
      assert(!ws._updateManagedOB('tBTCUSD', [200, 1, -1], false, JSON.stringify([1, [200, 1, -1]])))
      assert(!ws._updateManagedOB('tBTCUSD', [200, 0, -1], false, JSON.stringify([1, [200, 0, -1]])))

      const ob = ws.getOB('tBTCUSD')

      assert.strictEqual(ob.bids.length, 1)
      assert.strictEqual(ob.asks.length, 0)
      assert.deepStrictEqual(ob.bids, [[100, 1, 1]])
    })

    it('_updateManagedOB: correctly maintains non-transformed OBs', () => {
      ws = createTestWSv2Instance()
      ws._orderBooks.tBTCUSD = []
      ws._losslessOrderBooks.tBTCUSD = []

      assert(!ws._updateManagedOB('tBTCUSD', [100, 1, 1], false, JSON.stringify([1, [100, 1, 1]])))
      assert(!ws._updateManagedOB('tBTCUSD', [200, 1, -1], false, JSON.stringify([1, [200, 1, -1]])))
      assert(!ws._updateManagedOB('tBTCUSD', [200, 0, -1], false, JSON.stringify([1, [200, 0, -1]])))

      const ob = ws._orderBooks.tBTCUSD

      assert.strictEqual(ob.length, 1)
      assert.deepStrictEqual(ob, [[100, 1, 1]])
    })

    it('_handleCandleMessage: maintains internal candles if management is enabled', () => {
      ws = new WSv2({ manageCandles: true })
      ws._channelMap = {
        64: {
          channel: 'candles',
          key: 'trade:1m:tBTCUSD'
        }
      }

      ws._handleCandleMessage([64, [
        [5, 100, 70, 150, 30, 1000],
        [2, 200, 90, 150, 30, 1000],
        [1, 130, 90, 150, 30, 1000],
        [4, 104, 80, 150, 30, 1000]
      ]], ws._channelMap[64])

      const candles = ws._candles['trade:1m:tBTCUSD']

      // maintains sort
      assert.strictEqual(candles.length, 4)
      assert.strictEqual(candles[0][0], 5)
      assert.strictEqual(candles[1][0], 4)
      assert.strictEqual(candles[2][0], 2)
      assert.strictEqual(candles[3][0], 1)

      // updates existing candle
      ws._handleCandleMessage([
        64,
        [5, 200, 20, 220, 20, 2000]
      ], ws._channelMap[64])

      assert.deepStrictEqual(candles[0], [5, 200, 20, 220, 20, 2000])

      // inserts new candle
      ws._handleCandleMessage([
        64,
        [10, 300, 20, 450, 10, 4000]
      ], ws._channelMap[64])

      assert.deepStrictEqual(candles[0], [10, 300, 20, 450, 10, 4000])
    })

    it('_handleCandleMessage: emits error on internal candle update failure', (done) => {
      ws = new WSv2({ manageCandles: true })
      ws._channelMap = {
        42: {
          channel: 'candles',
          key: 'trade:30m:tBTCUSD'
        },

        64: {
          channel: 'candles',
          key: 'trade:1m:tBTCUSD'
        }
      }

      let errorsSeen = 0

      ws.on('error', () => {
        if (++errorsSeen === 1) done()
      })

      ws._handleCandleMessage([64, [
        [5, 100, 70, 150, 30, 1000],
        [2, 200, 90, 150, 30, 1000],
        [1, 130, 90, 150, 30, 1000],
        [4, 104, 80, 150, 30, 1000]
      ]], ws._channelMap[64])

      // update for unknown key
      ws._handleCandleMessage([
        42,
        [5, 10, 70, 150, 30, 10]
      ], ws._channelMap[42])
    })

    it('_handleCandleMessage: forwards managed candles to listeners', (done) => {
      ws = new WSv2({ manageCandles: true })
      ws._channelMap = {
        42: {
          chanId: 42,
          channel: 'candles',
          key: 'trade:1m:tBTCUSD'
        }
      }

      let seen = 0
      ws.onCandle({ key: 'trade:1m:tBTCUSD' }, (data) => {
        assert.deepStrictEqual(data, [[5, 10, 70, 150, 30, 10]])
        if (++seen === 2) done()
      })

      ws.onCandle({}, (data) => {
        assert.deepStrictEqual(data, [[5, 10, 70, 150, 30, 10]])
        if (++seen === 2) done()
      })

      ws._handleCandleMessage([
        42,
        [[5, 10, 70, 150, 30, 10]]
      ], ws._channelMap[42])
    })

    it('_handleCandleMessage: emits managed candles', () => {
      let seenCandle = false
      ws = new WSv2({ manageCandles: true })
      ws._channelMap = {
        42: {
          channel: 'candles',
          key: 'trade:1m:tBTCUSD'
        }
      }

      ws.on('candle', (data, key) => {
        assert.strictEqual(key, 'trade:1m:tBTCUSD')
        assert.deepStrictEqual(data, [[5, 10, 70, 150, 30, 10]])
        seenCandle = true
      })

      ws._handleCandleMessage([
        42,
        [[5, 10, 70, 150, 30, 10]]
      ], ws._channelMap[42])

      assert(seenCandle)
    })

    it('_handleCandleMessage: forwards transformed data if transform enabled', () => {
      let seenCandle = false
      ws = new WSv2({ transform: true })
      ws._channelMap = {
        42: {
          chanId: 42,
          channel: 'candles',
          key: 'trade:1m:tBTCUSD'
        }
      }

      ws.onCandle({ key: 'trade:1m:tBTCUSD' }, (candles) => {
        assert.strictEqual(candles.length, 1)
        assert.deepStrictEqual(candles[0], {
          mts: 5,
          open: 10,
          close: 70,
          high: 150,
          low: 30,
          volume: 10
        })

        seenCandle = true
      })

      ws._handleCandleMessage([
        42,
        [[5, 10, 70, 150, 30, 10]]
      ], ws._channelMap[42])

      assert(seenCandle)
    })

    it('_updateManagedCandles: returns an error on update for unknown key', () => {
      ws = createTestWSv2Instance()
      ws._candles['trade:1m:tBTCUSD'] = []

      const err = ws._updateManagedCandles('trade:30m:tBTCUSD', [
        1, 10, 70, 150, 30, 10
      ])

      assert(err)
      assert(_isError(err))
    })

    it('_updateManagedCandles: correctly maintains transformed OBs', () => {
      ws = new WSv2({ transform: true })

      assert(!ws._updateManagedCandles('trade:1m:tBTCUSD', [
        [1, 10, 70, 150, 30, 10],
        [2, 10, 70, 150, 30, 10]
      ]))

      assert(!ws._updateManagedCandles('trade:1m:tBTCUSD', [
        2, 10, 70, 150, 30, 500
      ]))

      assert(!ws._updateManagedCandles('trade:1m:tBTCUSD', [
        3, 100, 70, 150, 30, 10
      ]))

      const candles = ws._candles['trade:1m:tBTCUSD']

      assert.strictEqual(candles.length, 3)
      assert.deepStrictEqual(candles[0], [
        3, 100, 70, 150, 30, 10
      ])

      assert.deepStrictEqual(candles[1], [
        2, 10, 70, 150, 30, 500
      ])

      assert.deepStrictEqual(candles[2], [
        1, 10, 70, 150, 30, 10
      ])
    })

    it('_updateManagedCandles: correctly maintains non-transformed OBs', () => {
      ws = createTestWSv2Instance()

      assert(!ws._updateManagedCandles('trade:1m:tBTCUSD', [
        [1, 10, 70, 150, 30, 10],
        [2, 10, 70, 150, 30, 10]
      ]))

      assert(!ws._updateManagedCandles('trade:1m:tBTCUSD', [
        2, 10, 70, 150, 30, 500
      ]))

      assert(!ws._updateManagedCandles('trade:1m:tBTCUSD', [
        3, 100, 70, 150, 30, 10
      ]))

      const candles = ws._candles['trade:1m:tBTCUSD']

      assert.strictEqual(candles.length, 3)
      assert.deepStrictEqual(candles[0], [
        3, 100, 70, 150, 30, 10
      ])

      assert.deepStrictEqual(candles[1], [
        2, 10, 70, 150, 30, 500
      ])

      assert.deepStrictEqual(candles[2], [
        1, 10, 70, 150, 30, 10
      ])
    })
  })

  describe('event msg handling', () => {
    it('_handleErrorEvent: emits error', (done) => {
      ws = createTestWSv2Instance()
      ws.on('error', (err) => {
        if (err === 42) done()
      })
      ws._handleErrorEvent(42)
    })

    it('_handleConfigEvent: emits error if config failed', (done) => {
      ws = createTestWSv2Instance()
      ws.on('error', (err) => {
        if (_includes(err.message, '42')) done()
      })
      ws._handleConfigEvent({ status: 'bad', flags: 42 })
    })

    it('_handleAuthEvent: emits an error on auth fail', (done) => {
      ws = createTestWSv2Instance()
      ws.on('error', () => {
        done()
      })
      ws._handleAuthEvent({ status: 'FAIL' })
    })

    it('_handleAuthEvent: updates auth flag on auth success', () => {
      ws = createTestWSv2Instance()
      assert(!ws.isAuthenticated())
      ws._handleAuthEvent({ status: 'OK' })
      assert(ws.isAuthenticated())
    })

    it('_handleAuthEvent: adds auth channel to channel map', () => {
      ws = createTestWSv2Instance()
      assert(Object.keys(ws._channelMap).length === 0)
      ws._handleAuthEvent({ chanId: 42, status: 'OK' })
      assert(ws._channelMap[42])
      assert.strictEqual(ws._channelMap[42].channel, 'auth')
    })

    it('_handleAuthEvent: emits auth message', (done) => {
      ws = createTestWSv2Instance()
      ws.once('auth', (msg) => {
        assert.strictEqual(msg.chanId, 0)
        assert.strictEqual(msg.status, 'OK')
        done()
      })
      ws._handleAuthEvent({ chanId: 0, status: 'OK' })
    })

    it('_handleSubscribedEvent: adds channel to channel map', () => {
      ws = createTestWSv2Instance()
      assert(Object.keys(ws._channelMap).length === 0)
      ws._handleSubscribedEvent({ chanId: 42, channel: 'test', extra: 'stuff' })
      assert(ws._channelMap[42])
      assert.strictEqual(ws._channelMap[42].chanId, 42)
      assert.strictEqual(ws._channelMap[42].channel, 'test')
      assert.strictEqual(ws._channelMap[42].extra, 'stuff')
    })

    it('_handleUnsubscribedEvent: removes channel from channel map', () => {
      ws = createTestWSv2Instance()
      assert(Object.keys(ws._channelMap).length === 0)
      ws._handleSubscribedEvent({ chanId: 42, channel: 'test', extra: 'stuff' })
      ws._handleUnsubscribedEvent({ chanId: 42, channel: 'test', extra: 'stuff' })
      assert(Object.keys(ws._channelMap).length === 0)
    })

    it('_handleInfoEvent: passes message to relevant listeners (raw access)', async () => {
      wss = new MockWSv2Server()
      ws = createTestWSv2Instance()

      await ws.open()

      let n = 0

      ws._infoListeners[42] = [ // eslint-disable-line
        () => { n += 1 },
        () => { n += 2 }
      ]

      ws._handleInfoEvent({ code: 42 })

      assert.strictEqual(n, 3)
    })

    it('_handleInfoEvent: passes message to relevant listeners', async () => {
      wss = new MockWSv2Server()
      ws = createTestWSv2Instance()

      await ws.open()

      let n = 0

      ws.onInfoMessage(42, () => { n += 1 })
      ws.onInfoMessage(42, () => { n += 2 })
      ws._handleInfoEvent({ code: 42 })

      assert.strictEqual(n, 3)
      wss.close()
    })

    it('_handleInfoEvent: passes message to relevant named listeners', async () => {
      wss = new MockWSv2Server()
      ws = createTestWSv2Instance()

      await ws.open()

      let n = 0

      ws.onServerRestart(() => { n += 1 })
      ws.onMaintenanceStart(() => { n += 10 })
      ws.onMaintenanceEnd(() => { n += 100 })

      ws._handleInfoEvent({ code: WSv2.info.SERVER_RESTART })
      ws._handleInfoEvent({ code: WSv2.info.MAINTENANCE_START })
      ws._handleInfoEvent({ code: WSv2.info.MAINTENANCE_END })

      assert.strictEqual(n, 111)
      wss.close()
    })

    it('_handleInfoEvent: closes & emits error if not on api v2', async () => {
      wss = new MockWSv2Server()
      ws = createTestWSv2Instance()

      await ws.open()

      return new Promise((resolve) => {
        let seen = 0

        ws.on('error', () => { if (++seen === 2) { resolve() } })
        ws.on('close', () => { if (++seen === 2) { resolve() } })

        ws._handleInfoEvent({ version: 3 })
      })
    })

    it('_flushOrderOps: returned promise rejects if not authorised', async () => {
      ws = createTestWSv2Instance()
      ws._orderOpBuffer = [[0, 'oc', null, []]]

      try {
        await ws._flushOrderOps()
        assert(false)
      } catch (e) {
        assert.ok(true, 'rejected due to being unauthorized')
      }
    })

    it('_flushOrderOps: merges the buffer into a multi-op packet & sends', (done) => {
      ws = createTestWSv2Instance()
      ws._isAuthenticated = true
      ws._isOpen = true

      ws._orderOpBuffer = [
        [0, 'oc', null, []],
        [0, 'on', null, []],
        [0, 'oc_multi', null, []],
        [0, 'ou', null, []]
      ]

      ws.send = (packet) => {
        assert.strictEqual(packet[1], 'ox_multi')
        assert.strictEqual(packet[3].length, 4)
        done()
      }

      ws._flushOrderOps().catch(() => assert(false))
    })

    it('_flushOrderOps: splits up buffers greater than 15 ops in size', async () => {
      ws = createTestWSv2Instance()
      ws._isAuthenticated = true
      ws._isOpen = true

      let seenCount = 0
      let seenAll = false

      for (let i = 0; i < 45; i++) {
        ws._orderOpBuffer.push([0, 'oc', null, []])
      }

      ws.send = (packet) => {
        assert.strictEqual(packet[1], 'ox_multi')
        assert(packet[3].length <= 15)
        seenCount += packet[3].length

        if (seenCount === 45) {
          seenAll = true
        }
      }

      try {
        await ws._flushOrderOps()
        assert(false)
      } catch (e) {
        assert(seenAll)
      }
    })
  })

  describe('WSv2 packet watch-dog', () => {
    it('resets the WD timeout on every websocket message', (done) => {
      ws = new WSv2({ packetWDDelay: 1000 })
      assert.strictEqual(ws._packetWDTimeout, null)

      ws.on('error', () => { }) // ignore json errors

      let wdResets = 0
      ws._resetPacketWD = () => {
        if (++wdResets === 4) done()
      }

      ws._onWSMessage('asdf')
      ws._onWSMessage('asdf')
      ws._onWSMessage('asdf')
      ws._onWSMessage('asdf')
    })

    it('_resetPacketWD: clears existing wd timeout', (done) => {
      ws = new WSv2({ packetWDDelay: 1000 })
      ws._packetWDTimeout = setTimeout(() => {
        assert(false)
      }, 100)

      ws._resetPacketWD()
      setTimeout(done, 200)
    })

    it('_resetPacketWD: schedules new wd timeout', (done) => {
      ws = new WSv2({ packetWDDelay: 500 })
      ws._isOpen = true
      ws._triggerPacketWD = async () => { done() }
      ws._resetPacketWD()
      assert(ws._packetWDTimeout !== null)
    })

    it('_triggerPacketWD: does nothing if wd is disabled', (done) => {
      ws = createTestWSv2Instance()
      ws._isOpen = true
      ws.reconnect = async () => { assert(false) }
      ws._triggerPacketWD()

      setTimeout(done, 50)
    })

    it('_triggerPacketWD: calls reconnect()', (done) => {
      ws = new WSv2({ packetWDDelay: 1000 })
      ws._isOpen = true
      ws.reconnect = async () => { done() }
      ws._triggerPacketWD()
    })

    it('triggers wd when no packet arrives after delay elapses', async () => {
      const now = Date.now()
      let wdTriggered = false

      ws = new WSv2({ packetWDDelay: 100 })
      ws._isOpen = true

      ws.on('error', () => { }) // invalid json to prevent message routing
      ws._triggerPacketWD = () => {
        assert((Date.now() - now) >= 95)
        wdTriggered = true

        return Promise.resolve()
      }

      ws._triggerPacketWD = ws._triggerPacketWD.bind(ws)
      ws._onWSMessage('asdf') // send first packet, init wd

      await new Promise(resolve => setTimeout(resolve, 150))

      assert(wdTriggered)
    })

    it('doesn\'t trigger wd when packets arrive as expected', async () => {
      ws = new WSv2({ packetWDDelay: 100 })
      ws._isOpen = true

      ws.on('error', () => { }) // invalid json to prevent message routing

      const sendInterval = setInterval(() => {
        ws._onWSMessage('asdf')
      }, 50)

      ws._triggerPacketWD = async () => { assert(false) }
      ws._onWSMessage('asdf')

      await new Promise(resolve => setTimeout(resolve, 200))

      clearInterval(sendInterval)
      clearTimeout(ws._packetWDTimeout)
    })
  })

  describe('message sending', () => {
    it('emits error if no client available or open', async () => {
      ws = createTestWSv2Instance()

      return new Promise((resolve) => {
        ws.on('error', (e) => {
          if (!_includes(e.message, 'no ws client')) {
            throw new Error('received unexpected error')
          } else {
            resolve()
          }
        })

        ws.send({})
      })
    })

    it('emits error if connection is closing', async () => {
      ws = createTestWSv2Instance()

      ws._ws = true
      ws._isOpen = true
      ws._isClosing = true

      return new Promise((resolve) => {
        ws.on('error', (e) => {
          if (!_includes(e.message, 'currently closing')) {
            throw new Error('received unexpected error')
          } else {
            resolve()
          }
        })

        ws.send({})
      })
    })

    it('sends stringified payload', async () => {
      ws = createTestWSv2Instance()

      ws._isOpen = true
      ws._isClosing = false

      return new Promise((resolve) => {
        ws._ws = {
          send: (json) => {
            const msg = JSON.parse(json)

            assert.strictEqual(msg.a, 42)
            resolve()
          }
        }

        ws.send({ a: 42 })
      })
    })
  })

  describe('WSv2 seq audit: _validateMessageSeq', () => {
    it('returns an error on invalid pub seq', () => {
      ws = createTestWSv2Instance()

      ws._seqAudit = true
      ws._lastPubSeq = 0

      assert.strictEqual(ws._validateMessageSeq([243, [252.12, 2, -1], 1]), null)
      assert.strictEqual(ws._validateMessageSeq([243, [252.12, 2, -1], 2]), null)
      assert(_isError(ws._validateMessageSeq([243, [252.12, 2, -1], 5])))
    })

    it('returns an error on invalid auth seq', () => {
      ws = createTestWSv2Instance()

      ws._seqAudit = true
      ws._lastPubSeq = 0
      ws._lastAuthSeq = 0

      assert.strictEqual(ws._validateMessageSeq([0, [252.12, 2, -1], 1, 1]), null)
      assert.strictEqual(ws._validateMessageSeq([0, [252.12, 2, -1], 2, 2]), null)
      assert(_isError(ws._validateMessageSeq([0, [252.12, 2, -1], 3, 5])))
    })

    it('ignores heartbeats', () => {
      ws = createTestWSv2Instance()

      ws._seqAudit = true
      ws._lastPubSeq = 0

      assert.strictEqual(ws._validateMessageSeq([243, [252.12, 2, -1], 1]), null)
      assert.strictEqual(ws._validateMessageSeq([243, [252.12, 2, -1], 2]), null)
      assert.strictEqual(ws._validateMessageSeq([243, 'hb']), null)
      assert.strictEqual(ws._validateMessageSeq([243, 'hb']), null)
      assert.strictEqual(ws._validateMessageSeq([243, [252.12, 2, -1], 3]), null)
      assert.strictEqual(ws._validateMessageSeq([243, [252.12, 2, -1], 4]), null)
    })

    it.skip('all chan 0 messages except for notifications include, but do not advance the pub seq num', () => {
      const ws = new WSv2()

      ws._seqAudit = true
      ws._lastPubSeq = 1
      ws._lastAuthSeq = 1

      assert.strictEqual(ws._validateMessageSeq([0, 'bu', [], 1, 2]), null)
      assert.strictEqual(ws._validateMessageSeq([0, 'bu', [], 1, 3]), null)
      assert.strictEqual(ws._validateMessageSeq([0, 'bu', [], 1, 4]), null)
      assert.strictEqual(ws._validateMessageSeq([0, 'n', [], 1, 5]), null)
      assert.strictEqual(ws._lastPubSeq, 1)
      assert.strictEqual(ws._lastAuthSeq, 5)
    })

    it.skip('non-*-req notifications advance the auth seq num and do not include a pub seq num', () => {
      const ws = new WSv2()

      ws._seqAudit = true
      ws._lastPubSeq = 4
      ws._lastAuthSeq = 4

      const nonReqPayload = [null, null, null, null, null, null, null]

      assert.strictEqual(ws._validateMessageSeq([0, 'n', nonReqPayload, 5]), null)
      assert.strictEqual(ws._validateMessageSeq([0, 'n', nonReqPayload, 6]), null)
      assert.strictEqual(ws._validateMessageSeq([0, 'n', nonReqPayload, 7]), null)
      assert.strictEqual(ws._validateMessageSeq([0, 'n', nonReqPayload, 8]), null)
      assert.strictEqual(ws._validateMessageSeq([0, 'n', nonReqPayload, 9]), null)
      assert.strictEqual(ws._lastPubSeq, 9)
      assert.strictEqual(ws._lastAuthSeq, 9)
    })

    it.skip('*-req notifications do not advance the auth sequence number', () => {
      const ws = new WSv2()
      const onReqPacket = [0, 'n', [0, 'on-req', null, null, [], null, '', ''], 1]
      const ouReqPacket = [0, 'n', [0, 'ou-req', null, null, [], null, '', ''], 1]
      const ocReqPacket = [0, 'n', [0, 'oc-req', null, null, [], null, '', ''], 1]

      ws._seqAudit = true
      ws._lastPubSeq = -1
      ws._lastAuthSeq = -1

      assert.strictEqual(ws._validateMessageSeq(onReqPacket), null)
      assert.strictEqual(ws._validateMessageSeq(ouReqPacket), null)
      assert.strictEqual(ws._validateMessageSeq(ocReqPacket), null)
      assert.strictEqual(ws._lastPubSeq, -1)
      assert.strictEqual(ws._lastAuthSeq, 3)
    })
  })

  describe('_handleTradeMessage', () => {
    it('correctly forwards payloads w/ seq numbers', () => {
      ws = createTestWSv2Instance()

      const payload = [
        [286614318, 1535531325604, 0.05, 7073.51178714],
        [286614249, 1535531321436, 0.0215938, 7073.6],
        [286614248, 1535531321430, 0.0284062, 7073.51178714]
      ]

      const msg = [1710, payload, 1]
      let sawTrade = false

      ws.onTrades({ pair: 'tBTCUSD' }, (data) => {
        assert.deepStrictEqual(data, payload)
        sawTrade = true
      })

      ws._handleTradeMessage(msg, {
        channel: 'trades',
        pair: 'tBTCUSD'
      })

      assert(sawTrade)
    })

    it('correctly forwards funding trades', () => {
      ws = createTestWSv2Instance()

      const payload = [
        [286614318, 1535531325604, 0.05, 7073.51178714],
        [286614249, 1535531321436, 0.0215938, 7073.6],
        [286614248, 1535531321430, 0.0284062, 7073.51178714]
      ]

      const msg = [1710, payload, 1]
      let sawTrade = false

      ws.onTrades({ pair: 'fUSD' }, (data) => {
        assert.deepStrictEqual(data, payload)
        sawTrade = true
      })

      ws._handleTradeMessage(msg, {
        channel: 'trades',
        pair: 'fUSD'
      })

      assert(sawTrade)
    })

    it('correctly routes fte packets', () => {
      ws = createTestWSv2Instance()

      const payload = [636854, 'fUSD', 1575282446000, 41238905, -1000, 0.002, 7, null]
      const msg = [0, 'fte', payload]
      let sawFTE = false

      ws.onFundingTradeEntry({ pair: 'tBTCUSD' }, (data) => {
        assert.deepStrictEqual(data[0], payload)
        sawFTE = true
      })

      ws._handleTradeMessage(msg, {
        channel: 'fte',
        pair: 'tBTCUSD'
      })

      assert(sawFTE)
    })

    it('correctly routes ftu packets', () => {
      ws = createTestWSv2Instance()

      const payload = [636854, 'fUSD', 1575282446000, 41238905, -1000, 0.002, 7, null]
      const msg = [0, 'ftu', payload]
      let sawFTU = false

      ws.onFundingTradeUpdate({ pair: 'tBTCUSD' }, (data) => {
        assert.deepStrictEqual(data[0], payload)
        sawFTU = true
      })

      ws._handleTradeMessage(msg, {
        channel: 'ftu',
        pair: 'tBTCUSD'
      })

      assert(sawFTU)
    })

    it('uses funding trade model for funding symbols', (done) => {
      ws = createTestWSv2Instance({ transform: true })

      const payload = [636854, 'fUSD', 1575282446000, 41238905, -1000, 0.002, 7, null]
      const msg = [0, 'ftu', payload]

      ws.on('trades', (_, data) => {
        assert(data instanceof FundingTrade)
        done()
      })

      ws._handleTradeMessage(msg, {
        channel: 'ftu',
        pair: 'fUSD'
      })
    })

    it('uses public trade model for trading symbols', (done) => {
      ws = createTestWSv2Instance({ transform: true })

      const payload = [636854, 'tBTCUSD', 1575282446000, 41238905, -1000, 0.002, 7, null]
      const msg = [0, 'tu', payload]

      ws.on('trades', (_, data) => {
        assert(data instanceof PublicTrade)
        done()
      })

      ws._handleTradeMessage(msg, {
        channel: 'tu',
        pair: 'tBTCUSD'
      })
    })
  })

  describe('resubscribePreviousChannels', () => {
    it('resubscribes to channels in prev channel map', () => {
      ws = createTestWSv2Instance()
      let subTicker = false
      let subTrades = false
      let subBook = false
      let subCandles = false

      ws._prevChannelMap = {
        123: { channel: 'ticker', symbol: 'tBTCUSD' },
        456: { channel: 'trades', symbol: 'tBTCUSD' },
        789: { channel: 'candles', key: 'trade:1m:tBTCUSD' },
        42: { channel: 'book', symbol: 'tBTCUSD', prec: 'R0', len: '25' }
      }

      ws.subscribeTicker = (sym) => {
        assert.strictEqual(sym, 'tBTCUSD')
        subTicker = true
      }

      ws.subscribeTrades = (sym) => {
        assert.strictEqual(sym, 'tBTCUSD')
        subTrades = true
      }

      ws.subscribeCandles = (key) => {
        assert.strictEqual(key, 'trade:1m:tBTCUSD')
        subCandles = true
      }

      ws.subscribeOrderBook = (sym, prec, len) => {
        assert.strictEqual(sym, 'tBTCUSD')
        assert.strictEqual(prec, 'R0')
        assert.strictEqual(len, '25')
        subBook = true
      }

      ws.resubscribePreviousChannels()

      assert(subTicker)
      assert(subTrades)
      assert(subCandles)
      assert(subBook)
    })
  })

  describe('getURL', () => {
    it('returns the URL the instance was constructed with', () => {
      const ws = new WSv2({ url: 'test' })
      assert.strictEqual(ws.getURL(), 'test', 'instance does not use provided URL')
    })
  })

  describe('auth args', () => {
    it('provides getAuthArgs to read args', () => {
      ws = createTestWSv2Instance()
      ws.updateAuthArgs({ dms: 4 })
      assert.strictEqual(ws.getAuthArgs().dms, 4)
    })

    it('initializes auth args', () => {
      ws = createTestWSv2Instance()
      const initAuthArgs = ws.getAuthArgs()

      assert(_isObject(initAuthArgs))
      assert.deepStrictEqual(initAuthArgs, {
        apiKey: API_KEY,
        apiSecret: API_SECRET
      })
    })

    it('updates auth args with setAuthArgs', async () => {
      ws = createTestWSv2Instance()
      wss = new MockWSv2Server()
      let sendCalled = false

      await ws.open()

      ws.updateAuthArgs({ dms: 4 })
      assert.strictEqual(ws.getAuthArgs().dms, 4)

      ws.send = (payload) => {
        assert.strictEqual(payload.dms, 4)
        sendCalled = true
        ws.emit('auth')
      }

      ws.auth() // note promise ignored
      assert(sendCalled)
    })
  })

  describe('usesAgent', () => {
    it('returns true if an agent was passed to the constructor', () => {
      ws = createTestWSv2Instance({
        agent: { __testAgent: true }
      })

      assert.ok(ws.usesAgent(), 'usesAgent() does not indicate agent presence when one was provided')
    })

    it('returns false if no agent was passed to the constructor', () => {
      ws = createTestWSv2Instance()

      assert.ok(!ws.usesAgent(), 'usesAgent() indicates agent presence when none provided')
    })
  })

  describe('default connection url', () => {
    it('is a static member on the class', () => {
      assert.ok(_isString(WSv2.url) && !_isEmpty(WSv2.url))
    })
  })

  describe('onMaintenanceStart', () => {
    it('is called when receiving a 20060 info code', async () => {
      ws = createTestWSv2Instance()
      wss = new MockWSv2Server()

      await ws.open()

      return new Promise((resolve) => {
        ws.onMaintenanceStart(() => resolve())
        wss.send({
          event: 'info',
          code: '20060'
        })
      })
    })
  })

  describe('onMaintenanceEnd', () => {
    it('is called when receiving a 20061 info code', async () => {
      ws = createTestWSv2Instance()
      wss = new MockWSv2Server()

      await ws.open()

      return new Promise((resolve) => {
        ws.onMaintenanceEnd(() => resolve())
        wss.send({
          event: 'info',
          code: '20061'
        })
      })
    })
  })

  describe('onServerRestart', () => {
    it('is called when receiving a 20051 info code', async () => {
      ws = createTestWSv2Instance()
      wss = new MockWSv2Server()

      await ws.open()

      return new Promise((resolve) => {
        ws.onServerRestart(() => resolve())
        wss.send({
          event: 'info',
          code: '20051'
        })
      })
    })
  })

  describe('cancelOrder', () => {
    it('throws an error if not authenticated', (done) => {
      ws = createTestWSv2Instance()
      ws.cancelOrder().catch(() => { done() })
    })

    it('uses order as id if given number', (done) => {
      ws = createTestWSv2Instance()
      ws._isAuthenticated = true
      ws._sendOrderPacket = (packet) => {
        assert.deepStrictEqual(packet[3], { id: 42 })
        done()
      }

      ws.cancelOrder(42)
    })

    it('parses id from order array', (done) => {
      ws = createTestWSv2Instance()
      ws._isAuthenticated = true
      ws._sendOrderPacket = (packet) => {
        assert.deepStrictEqual(packet[3], { id: 42 })
        done()
      }

      ws.cancelOrder([42])
    })

    it('parses id from order object', (done) => {
      ws = createTestWSv2Instance()
      ws._isAuthenticated = true
      ws._sendOrderPacket = (packet) => {
        assert.deepStrictEqual(packet[3], { id: 42 })
        done()
      }

      ws.cancelOrder({ id: 42 })
    })

    it('resolves on confirmation', (done) => {
      ws = createTestWSv2Instance()
      ws._isAuthenticated = true
      ws._sendOrderPacket = () => { }

      ws.cancelOrder(42)
        .then(() => done())
        .catch((e) => done(e))

      ws._eventCallbacks.q.get('order-cancel-42')[0]()
    })
  })

  describe('cancelOrders', () => {
    it('throws an error if not authenticated', (done) => {
      ws = createTestWSv2Instance()
      ws.cancelOrders([]).catch(() => done())
    })

    it('calls cancelOrder with each order', () => {
      ws = createTestWSv2Instance()
      ws._isAuthenticated = true

      let seen = 0

      ws.cancelOrder = (i) => { seen += i }
      ws.cancelOrders([1, 2])
      assert.strictEqual(seen, 3)
    })

    it('resolves when all orders are cancelled', async () => {
      const now = Date.now()
      ws = createTestWSv2Instance()
      ws._isAuthenticated = true
      ws.cancelOrder = async () => {
        return new Promise(resolve => setTimeout(resolve, 10))
      }

      await ws.cancelOrders([1, 2])

      assert.ok(Date.now() - now >= 10, 'did not wait') // note 10 - parallel
    })
  })

  describe('_handleTickerMessage', () => {
    it('forwards messages to relevant listeners', (done) => {
      ws = createTestWSv2Instance()
      ws._channelMap = {
        42: {
          chanId: 42,
          channel: 'ticker',
          symbol: 'tBTCUSD'
        }
      }

      ws.onTicker({ symbol: 'tBTCUSD' }, () => { done() })
      ws._handleTickerMessage([42, ['test']], ws._channelMap[42])
    })

    it('emits a ticker event with the symbol', (done) => {
      ws = createTestWSv2Instance()
      ws._channelMap = {
        42: {
          chanId: 42,
          channel: 'ticker',
          symbol: 'tBTCUSD'
        }
      }

      ws.on('ticker', (symbol, data) => {
        assert.strictEqual(symbol, 'tBTCUSD')
        assert.strictEqual(data[0], 42)
        done()
      })

      ws._handleTickerMessage([42, [42]], ws._channelMap[42])
    })

    it('uses the trading ticker model for trade symbols', (done) => {
      ws = createTestWSv2Instance({ transform: true })
      ws._channelMap = {
        42: {
          chanId: 42,
          channel: 'ticker',
          symbol: 'tBTCUSD'
        }
      }

      ws.on('ticker', (symbol, data) => {
        assert.ok(data instanceof TradingTicker)
        done()
      })

      ws._handleTickerMessage([42, [42]], ws._channelMap[42])
    })

    it('uses the funding ticker model for funding symbols', (done) => {
      ws = createTestWSv2Instance({ transform: true })
      ws._channelMap = {
        42: {
          chanId: 42,
          channel: 'ticker',
          symbol: 'fUSD'
        }
      }

      ws.on('ticker', (symbol, data) => {
        assert.ok(data instanceof FundingTicker)
        done()
      })

      ws._handleTickerMessage([42, [42]], ws._channelMap[42])
    })
  })

  describe('getChannelId', () => {
    it('matches the specified type and filter', () => {
      ws = createTestWSv2Instance()
      ws._channelMap = {
        test: {
          chanId: 42,
          channel: 'ticker',
          symbol: 'fUSD'
        }
      }

      assert.strictEqual(ws.getDataChannelId('ticker', { symbol: 'fUSD' }), 'test')
    })
  })

  describe('_getEventPromiseWithTimeout', () => {
    it('resolves when event callback fires', async () => {
      ws = createTestWSv2Instance()
      const p = ws._getEventPromiseWithTimeout('test-key', 5000)
      ws._eventCallbacks.trigger('test-key', null, 'result')
      const res = await p
      assert.strictEqual(res, 'result')
    })

    it('rejects on timeout', async () => {
      ws = createTestWSv2Instance()
      const p = ws._getEventPromiseWithTimeout('never-fires', 50)
      try {
        await p
        assert.fail('should have timed out')
      } catch (err) {
        assert.ok(err.message.includes('timeout'))
        assert.ok(err.message.includes('never-fires'))
      }
    })

    it('rejects with error from callback', async () => {
      ws = createTestWSv2Instance()
      const p = ws._getEventPromiseWithTimeout('err-key', 5000)
      ws._eventCallbacks.trigger('err-key', new Error('order failed'))
      try {
        await p
        assert.fail('should have rejected')
      } catch (err) {
        assert.strictEqual(err.message, 'order failed')
      }
    })

    it('ignores callback after timeout', async () => {
      ws = createTestWSv2Instance()
      const p = ws._getEventPromiseWithTimeout('late-key', 20)
      try {
        await p
        assert.fail('should have timed out')
      } catch (err) {
        assert.ok(err.message.includes('timeout'))
      }
      // Late trigger should not throw
      ws._eventCallbacks.trigger('late-key', null, 'late-result')
    })
  })

  describe('send', () => {
    it('returns false when not open', () => {
      ws = createTestWSv2Instance()
      let errorEmitted = false
      ws.on('error', () => { errorEmitted = true })
      const result = ws.send({ test: true })
      assert.strictEqual(result, false)
      assert.ok(errorEmitted)
    })

    it('returns false when closing', () => {
      ws = createTestWSv2Instance()
      ws._isOpen = true
      ws._isClosing = true
      ws._ws = {}
      let errorEmitted = false
      ws.on('error', () => { errorEmitted = true })
      const result = ws.send({ test: true })
      assert.strictEqual(result, false)
      assert.ok(errorEmitted)
    })

    it('returns true on successful send', () => {
      ws = createTestWSv2Instance()
      ws._isOpen = true
      ws._ws = { send: () => {} }
      const result = ws.send({ test: true })
      assert.strictEqual(result, true)
    })

    it('returns false and emits error on ws.send() exception', () => {
      ws = createTestWSv2Instance()
      ws._isOpen = true
      ws._ws = {
        send: () => { throw new Error('connection reset') }
      }
      let errorEmitted = false
      ws.on('error', (err) => {
        assert.strictEqual(err.message, 'connection reset')
        errorEmitted = true
      })
      const result = ws.send({ test: true })
      assert.strictEqual(result, false)
      assert.ok(errorEmitted)
    })
  })

  describe('_sendCalc', () => {
    it('does nothing when ws is null', () => {
      ws = createTestWSv2Instance()
      ws._ws = null
      ws._isOpen = false
      // Should not throw
      ws._sendCalc([0, 'calc'])
    })

    it('emits error on exception', () => {
      ws = createTestWSv2Instance()
      ws._isOpen = true
      ws._ws = {
        send: () => { throw new Error('send failed') }
      }
      let errorEmitted = false
      ws.on('error', (err) => {
        assert.ok(err.message.includes('send failed'))
        errorEmitted = true
      })
      ws._sendCalc([0, 'calc'])
      assert.ok(errorEmitted)
    })
  })

  describe('close cleanup', () => {
    it('clears order op buffer on close', async () => {
      wss = new MockWSv2Server()
      ws = createTestWSv2Instance()
      await ws.open()

      ws._orderOpBuffer = [['dummy']]
      ws._orderOpTimeout = setTimeout(() => {}, 99999)

      await ws.close()

      assert.deepStrictEqual(ws._orderOpBuffer, [])
      assert.strictEqual(ws._orderOpTimeout, null)
    })

    it('clears packet watchdog timeout on close', async () => {
      wss = new MockWSv2Server()
      ws = createTestWSv2Instance({ packetWDDelay: 5000 })
      await ws.open()

      // Watchdog should be set since packetWDDelay is configured
      assert.notStrictEqual(ws._packetWDTimeout, null)

      await ws.close()

      assert.strictEqual(ws._packetWDTimeout, null)
    })
  })

  describe('_flushOrderOps', () => {
    it('does nothing when closing', () => {
      ws = createTestWSv2Instance()
      ws._isOpen = true
      ws._isClosing = true
      ws._orderOpBuffer = [['dummy']]

      const result = ws._flushOrderOps()
      assert.ok(result instanceof Promise)
      assert.deepStrictEqual(ws._orderOpBuffer, [])
    })

    it('does nothing when not open', () => {
      ws = createTestWSv2Instance()
      ws._isOpen = false
      ws._orderOpBuffer = [['dummy']]

      ws._flushOrderOps()
      assert.deepStrictEqual(ws._orderOpBuffer, [])
    })
  })

  describe('_onWSNotification', () => {
    it('ignores malformed notifications with non-array data', () => {
      ws = createTestWSv2Instance()
      // Should not throw
      ws._onWSNotification([0, 'on-req', null, null, 'not-an-array', 0, 'SUCCESS', 'ok'])
    })

    it('ignores on-req with too few elements', () => {
      ws = createTestWSv2Instance()
      // arrN[4] has fewer than 3 elements for on-req
      ws._onWSNotification([0, 'on-req', null, null, [1, 2], 0, 'SUCCESS', 'ok'])
    })

    it('handles oc-req correctly', (done) => {
      ws = createTestWSv2Instance()
      ws._eventCallbacks.push('order-cancel-99', (err, data) => {
        assert(!err)
        assert.deepStrictEqual(data, [99])
        done()
      })
      ws._onWSNotification([0, 'oc-req', null, null, [99], 0, 'SUCCESS', 'ok'])
    })

    it('handles ou-req correctly', (done) => {
      ws = createTestWSv2Instance()
      ws._eventCallbacks.push('order-update-55', (err, data) => {
        assert(!err)
        assert.deepStrictEqual(data, [55])
        done()
      })
      ws._onWSNotification([0, 'ou-req', null, null, [55], 0, 'SUCCESS', 'ok'])
    })
  })

  describe('onInfoMessage', () => {
    it('returns an unsubscribe function', () => {
      ws = createTestWSv2Instance()
      let callCount = 0

      const unsub = ws.onInfoMessage(20051, () => { callCount++ })
      assert(_isFunction(unsub))

      // Trigger info message
      ws._handleEventMessage({ event: 'info', code: 20051 })
      assert.strictEqual(callCount, 1)

      // Unsubscribe
      unsub()

      // Should not fire again
      ws._handleEventMessage({ event: 'info', code: 20051 })
      assert.strictEqual(callCount, 1)
    })

    it('supports multiple listeners for same code', () => {
      ws = createTestWSv2Instance()
      let count1 = 0
      let count2 = 0

      ws.onInfoMessage(20060, () => { count1++ })
      ws.onInfoMessage(20060, () => { count2++ })

      ws._handleEventMessage({ event: 'info', code: 20060 })
      assert.strictEqual(count1, 1)
      assert.strictEqual(count2, 1)
    })
  })

  describe('_notifyListenerGroup error handling', () => {
    it('catches callback errors and continues to next listener', () => {
      const wsInst = createTestWSv2Instance()
      let secondCalled = false
      let errorEmitted = false

      wsInst.on('error', () => { errorEmitted = true })

      const lg = {
        test: [
          {
            cb: () => { throw new Error('callback failed') }
          },
          {
            cb: () => { secondCalled = true }
          }
        ]
      }

      WSv2._notifyListenerGroup(lg, [0, 'test', []], false, wsInst)
      assert.ok(secondCalled, 'second listener should still be called')
      assert.ok(errorEmitted, 'error should have been emitted')
    })
  })

  describe('_notifyCatchAllListeners error handling', () => {
    it('catches callback errors and continues', () => {
      let secondCalled = false

      const lg = {
        '': [
          { cb: () => { throw new Error('catch-all fail') } },
          { cb: () => { secondCalled = true } }
        ]
      }

      WSv2._notifyCatchAllListeners(lg, 'data')
      assert.ok(secondCalled)
    })
  })

  describe('_prevChannelMap initialization', () => {
    it('initializes _prevChannelMap as empty object', () => {
      ws = createTestWSv2Instance()
      assert.deepStrictEqual(ws._prevChannelMap, {})
    })
  })

  describe('_onWSClose reconnection state', () => {
    it('saves channel map before clearing on reconnect', () => {
      ws = createTestWSv2Instance({ autoReconnect: true, reconnectDelay: 99999 })
      ws._channelMap = {
        42: { channel: 'ticker', symbol: 'tBTCUSD' }
      }
      ws._isOpen = true

      ws._onWSClose()

      // _prevChannelMap should have the old channels
      assert.deepStrictEqual(ws._prevChannelMap, {
        42: { channel: 'ticker', symbol: 'tBTCUSD' }
      })
      // _channelMap should be cleared
      assert.deepStrictEqual(ws._channelMap, {})
    })

    it('does not save channel map on explicit close', () => {
      ws = createTestWSv2Instance({ autoReconnect: true })
      ws._channelMap = {
        42: { channel: 'ticker', symbol: 'tBTCUSD' }
      }
      ws._isOpen = true
      ws._isClosing = true

      ws._onWSClose()

      assert.deepStrictEqual(ws._prevChannelMap, {})
      assert.deepStrictEqual(ws._channelMap, {})
    })
  })

  describe('channel data queries', () => {
    it('hasChannel: returns true for known channels', () => {
      ws = createTestWSv2Instance()
      ws._channelMap = { 42: { channel: 'ticker' } }
      assert.ok(ws.hasChannel(42))
      assert.ok(!ws.hasChannel(99))
    })

    it('getDataChannelCount: counts data channels', () => {
      ws = createTestWSv2Instance()
      ws._channelMap = {
        0: { channel: 'auth' },
        42: { channel: 'ticker' },
        43: { channel: 'trades' }
      }
      assert.strictEqual(ws.getDataChannelCount(), 2)
    })

    it('hasSubscriptionRef: checks subscription refs', () => {
      ws = createTestWSv2Instance()
      ws._subscriptionRefs = {
        'ticker:tBTCUSD': 1
      }
      assert.ok(ws.hasSubscriptionRef('ticker', 'tBTCUSD'))
      assert.ok(!ws.hasSubscriptionRef('ticker', 'tETHUSD'))
      assert.ok(!ws.hasSubscriptionRef('trades', 'tBTCUSD'))
    })

    it('getDataChannelId: returns channel id for matching filter', () => {
      ws = createTestWSv2Instance()
      ws._channelMap = {
        42: { chanId: 42, channel: 'ticker', symbol: 'tBTCUSD' },
        43: { chanId: 43, channel: 'trades', symbol: 'tETHUSD' }
      }
      assert.strictEqual(ws.getDataChannelId('ticker', { symbol: 'tBTCUSD' }), '42')
      assert.strictEqual(ws.getDataChannelId('trades', { symbol: 'tETHUSD' }), '43')
      assert.strictEqual(ws.getDataChannelId('ticker', { symbol: 'tETHUSD' }), undefined)
    })

    it('getChannelData: returns channel map entry', () => {
      ws = createTestWSv2Instance()
      ws._channelMap = {
        42: { channel: 'ticker', symbol: 'tBTCUSD' }
      }
      const data = ws.getChannelData({ chanId: 42 })
      assert.deepStrictEqual(data, { channel: 'ticker', symbol: 'tBTCUSD' })
      assert.strictEqual(ws.getChannelData({ chanId: 99 }), null)
    })
  })

  describe('subscription management', () => {
    it('managedSubscribe: creates and increments subscription refs', () => {
      ws = createTestWSv2Instance()
      ws._isOpen = true
      ws._ws = { send: () => {} }

      ws.managedSubscribe('ticker', 'tBTCUSD', { symbol: 'tBTCUSD' })
      assert.strictEqual(ws._subscriptionRefs['ticker:tBTCUSD'], 1)

      ws.managedSubscribe('ticker', 'tBTCUSD', { symbol: 'tBTCUSD' })
      assert.strictEqual(ws._subscriptionRefs['ticker:tBTCUSD'], 2)
    })

    it('managedUnsubscribe: decrements ref and unsubscribes at 0', () => {
      ws = createTestWSv2Instance()
      ws._isOpen = true
      ws._ws = { send: () => {} }
      ws._channelMap = {
        42: { chanId: 42, channel: 'ticker', symbol: 'tBTCUSD' }
      }

      ws.managedSubscribe('ticker', 'tBTCUSD', { symbol: 'tBTCUSD' })
      ws.managedSubscribe('ticker', 'tBTCUSD', { symbol: 'tBTCUSD' })
      assert.strictEqual(ws._subscriptionRefs['ticker:tBTCUSD'], 2)

      ws.managedUnsubscribe('ticker', 'tBTCUSD')
      assert.strictEqual(ws._subscriptionRefs['ticker:tBTCUSD'], 1)
    })
  })

  describe('order operations', () => {
    it('submitOrder: rejects when not authenticated', async () => {
      ws = createTestWSv2Instance()
      ws._isOpen = true

      try {
        await ws.submitOrder({ type: 'LIMIT', symbol: 'tBTCUSD', amount: 1, price: 100 })
        assert.fail('should reject')
      } catch (err) {
        assert.ok(err.message.includes('not authenticated'))
      }
    })

    it('cancelOrder: rejects when not authenticated', async () => {
      ws = createTestWSv2Instance()
      ws._isOpen = true

      try {
        await ws.cancelOrder(12345)
        assert.fail('should reject')
      } catch (err) {
        assert.ok(err.message.includes('not authenticated'))
      }
    })

    it('cancelOrder: parses id from array', async () => {
      wss = new MockWSv2Server()
      ws = createTestWSv2Instance()
      await ws.open()
      await ws.auth()

      let sentPacket = null
      ws._sendOrderPacket = (p) => { sentPacket = p }

      // Don't await - just check the packet was formatted
      ws.cancelOrder([42, null, null, 'tBTCUSD'])
      assert.ok(sentPacket)
      assert.strictEqual(sentPacket[3].id, 42)
    })

    it('cancelOrder: parses id from object', async () => {
      wss = new MockWSv2Server()
      ws = createTestWSv2Instance()
      await ws.open()
      await ws.auth()

      let sentPacket = null
      ws._sendOrderPacket = (p) => { sentPacket = p }

      ws.cancelOrder({ id: 99 })
      assert.ok(sentPacket)
      assert.strictEqual(sentPacket[3].id, 99)
    })

    it('cancelOrders: throws when not authenticated', async () => {
      ws = createTestWSv2Instance()
      ws._isOpen = true

      try {
        await ws.cancelOrders([1, 2, 3])
        assert.fail('should reject')
      } catch (err) {
        assert.ok(err.message.includes('not authenticated'))
      }
    })

    it('cancelOrders: calls cancelOrder for each id', async () => {
      wss = new MockWSv2Server()
      ws = createTestWSv2Instance()
      await ws.open()
      await ws.auth()

      const cancelledIds = []
      ws.cancelOrder = (id) => {
        cancelledIds.push(id)
        return Promise.resolve()
      }

      await ws.cancelOrders([1, 2, 3])
      assert.deepStrictEqual(cancelledIds, [1, 2, 3])
    })
  })

  describe('packet watchdog', () => {
    it('_resetPacketWD: does nothing without delay configured', () => {
      ws = createTestWSv2Instance()
      ws._resetPacketWD()
      assert.strictEqual(ws._packetWDTimeout, null)
    })

    it('_resetPacketWD: sets timeout when configured and open', () => {
      ws = createTestWSv2Instance({ packetWDDelay: 1000 })
      ws._isOpen = true
      ws._resetPacketWD()
      assert.notStrictEqual(ws._packetWDTimeout, null)
      clearTimeout(ws._packetWDTimeout)
    })

    it('_resetPacketWD: clears previous timeout', () => {
      ws = createTestWSv2Instance({ packetWDDelay: 1000 })
      ws._isOpen = true

      ws._resetPacketWD()
      const first = ws._packetWDTimeout
      ws._resetPacketWD()
      const second = ws._packetWDTimeout

      assert.notStrictEqual(first, second)
      clearTimeout(ws._packetWDTimeout)
    })

    it('_resetPacketWD: does nothing when not open', () => {
      ws = createTestWSv2Instance({ packetWDDelay: 1000 })
      ws._isOpen = false
      ws._resetPacketWD()
      assert.strictEqual(ws._packetWDTimeout, null)
    })
  })

  describe('requestCalc', () => {
    it('sends calc message when open', (done) => {
      ws = createTestWSv2Instance()
      ws._isOpen = true
      ws._ws = {
        send: (data) => {
          const parsed = JSON.parse(data)
          assert.strictEqual(parsed[0], 0)
          assert.strictEqual(parsed[1], 'calc')
          done()
        }
      }

      ws.requestCalc([['position_tBTCUSD']])
    })
  })

  describe('state queries', () => {
    it('isOpen: reflects connection state', () => {
      ws = createTestWSv2Instance()
      assert.strictEqual(ws.isOpen(), false)
      ws._isOpen = true
      assert.strictEqual(ws.isOpen(), true)
    })

    it('isAuthenticated: reflects auth state', () => {
      ws = createTestWSv2Instance()
      assert.strictEqual(ws.isAuthenticated(), false)
      ws._isAuthenticated = true
      assert.strictEqual(ws.isAuthenticated(), true)
    })

    it('isReconnecting: reflects reconnection state', () => {
      ws = createTestWSv2Instance()
      assert.strictEqual(ws.isReconnecting(), false)
      ws._isReconnecting = true
      assert.strictEqual(ws.isReconnecting(), true)
    })

    it('isFlagEnabled: checks enabled flags', () => {
      ws = createTestWSv2Instance()
      assert.strictEqual(ws.isFlagEnabled(WSv2.flags.SEQ_ALL), false)
      ws._enabledFlags = WSv2.flags.SEQ_ALL
      assert.strictEqual(ws.isFlagEnabled(WSv2.flags.SEQ_ALL), true)
    })

    it('getURL: returns configured URL', () => {
      ws = createTestWSv2Instance()
      assert.strictEqual(ws.getURL(), 'ws://localhost:9997')
    })
  })

  describe('updateAuthArgs', () => {
    it('merges new auth args', () => {
      ws = createTestWSv2Instance()
      ws.updateAuthArgs({ apiKey: 'newkey' })
      assert.strictEqual(ws._authArgs.apiKey, 'newkey')
      assert.strictEqual(ws._authArgs.apiSecret, API_SECRET)
    })
  })

  describe('_propagateMessageToListeners snapshot safety', () => {
    it('listeners removed during propagation do not break iteration', () => {
      ws = createTestWSv2Instance()
      ws._channelMap = { 0: { channel: 'auth' } }

      let called = false

      ws.onWalletUpdate({ cbGID: 'group1' }, () => {
        ws.removeListeners('group1')
      })

      ws.onWalletUpdate({ cbGID: 'group2' }, () => {
        called = true
      })

      ws._handleChannelMessage([0, 'wu', []])
      assert.ok(called)
    })
  })

  describe('open error handling', () => {
    it('rejects promise on connection error', async () => {
      ws = createTestWSv2Instance({ url: 'ws://localhost:1' })
      // Suppress the error event that fires after rejection
      ws.on('error', () => {})

      try {
        await ws.open()
        assert.fail('should have rejected')
      } catch (err) {
        assert.ok(err)
        assert.ok(err.message || err.code)
      }

      // Clean up - ws may be in a bad state
      if (ws._ws) {
        ws._ws.removeAllListeners()
        ws._ws = null
      }
      ws._isOpen = false
    })
  })

  describe('reconnect race condition', () => {
    it('skips duplicate reconnect calls', async () => {
      ws = createTestWSv2Instance()
      ws._isReconnecting = true

      // Should return immediately without error
      await ws.reconnect()
      assert.strictEqual(ws._isReconnecting, true)
    })

    it('sets _isReconnecting flag', () => {
      ws = createTestWSv2Instance()
      assert.strictEqual(ws._isReconnecting, false)

      // Can't fully test reconnect without a server, but verify the guard
      ws._isReconnecting = true
      ws.reconnect() // Should silently return
    })
  })

  describe('submitOrderMultiOp', () => {
    it('returns result of send()', async () => {
      wss = new MockWSv2Server()
      ws = createTestWSv2Instance()
      await ws.open()
      await ws.auth()

      let sentData = null
      ws.send = (msg) => {
        sentData = msg
        return true
      }

      const result = await ws.submitOrderMultiOp([['on', { type: 'LIMIT' }]])
      assert.strictEqual(result, true)
      assert.ok(sentData)
      assert.strictEqual(sentData[1], 'ox_multi')
    })

    it('rejects when not authenticated', async () => {
      ws = createTestWSv2Instance()
      ws._isOpen = true

      try {
        await ws.submitOrderMultiOp([['on', { type: 'LIMIT' }]])
        assert.fail('should reject')
      } catch (err) {
        assert.ok(err.message.includes('not authenticated'))
      }
    })
  })

  describe('_updateManagedOB error handling', () => {
    it('returns error on invalid lossless JSON', () => {
      ws = createTestWSv2Instance({ manageOrderBooks: true })
      const err = ws._updateManagedOB('tBTCUSD', [1, 2, 3], false, 'not-valid-json{{{')
      assert.ok(err instanceof Error)
      assert.ok(err.message.includes('lossless JSON parse error'))
    })

    it('returns error on null lossless result', () => {
      ws = createTestWSv2Instance({ manageOrderBooks: true })
      const err = ws._updateManagedOB('tBTCUSD', [1, 2, 3], false, 'null')
      assert.ok(err instanceof Error)
      assert.ok(err.message.includes('invalid lossless OB data'))
    })
  })

  describe('_onWSNotification array validation', () => {
    it('ignores non-array input', () => {
      ws = createTestWSv2Instance()
      // Should not throw
      ws._onWSNotification('not-an-array')
      ws._onWSNotification(null)
      ws._onWSNotification(42)
    })

    it('ignores arrays shorter than 8 elements', () => {
      ws = createTestWSv2Instance()
      // Should not throw
      ws._onWSNotification([0, 'on-req', null, null, [1, 2, 3]])
      ws._onWSNotification([0, 'on-req', null])
    })

    it('handles on-req SUCCESS correctly', (done) => {
      ws = createTestWSv2Instance()
      ws._eventCallbacks.push('order-new-42', (err, data) => {
        assert(!err)
        assert.deepStrictEqual(data, [1, 2, 42])
        done()
      })
      ws._onWSNotification([0, 'on-req', null, null, [1, 2, 42], 0, 'SUCCESS', 'ok'])
    })

    it('handles on-req ERROR correctly', (done) => {
      ws = createTestWSv2Instance()
      ws._eventCallbacks.push('order-new-42', (err) => {
        assert.ok(err instanceof Error)
        assert.ok(err.message.includes('ERROR'))
        done()
      })
      ws._onWSNotification([0, 'on-req', null, null, [1, 2, 42], 0, 'ERROR', 'insufficient funds'])
    })

    it('handles oc-req ERROR correctly', (done) => {
      ws = createTestWSv2Instance()
      ws._eventCallbacks.push('order-cancel-99', (err) => {
        assert.ok(err instanceof Error)
        assert.ok(err.message.includes('FAILED'))
        done()
      })
      ws._onWSNotification([0, 'oc-req', null, null, [99], 0, 'FAILED', 'order not found'])
    })

    it('handles ou-req ERROR correctly', (done) => {
      ws = createTestWSv2Instance()
      ws._eventCallbacks.push('order-update-55', (err) => {
        assert.ok(err instanceof Error)
        assert.ok(err.message.includes('ERROR'))
        done()
      })
      ws._onWSNotification([0, 'ou-req', null, null, [55], 0, 'ERROR', 'invalid'])
    })
  })

  describe('_handleTickerMessage', () => {
    it('ignores ticker messages without symbol', () => {
      ws = createTestWSv2Instance()
      let emitted = false
      ws.on('ticker', () => { emitted = true })

      // chanData without symbol
      ws._handleTickerMessage([42, [1, 2, 3]], {})
      assert.ok(!emitted, 'should not emit ticker without symbol')
    })

    it('emits ticker with valid symbol', () => {
      ws = createTestWSv2Instance()
      let emittedSymbol = null
      ws.on('ticker', (symbol) => { emittedSymbol = symbol })

      ws._handleTickerMessage([42, [1, 2, 3]], { chanId: 42, symbol: 'tBTCUSD' })
      assert.strictEqual(emittedSymbol, 'tBTCUSD')
    })
  })

  describe('_handleEventMessage', () => {
    it('handles auth success event', () => {
      ws = createTestWSv2Instance()
      let authEmitted = false
      ws.on('auth', () => { authEmitted = true })

      ws._handleEventMessage({ event: 'auth', status: 'OK', chanId: 0 })
      assert.ok(authEmitted)
      assert.ok(ws._isAuthenticated)
    })

    it('handles auth failure event', () => {
      ws = createTestWSv2Instance()
      let errorEmitted = false
      ws.on('error', () => { errorEmitted = true })

      ws._handleEventMessage({ event: 'auth', status: 'FAILED', msg: 'apikey: invalid' })
      assert.ok(errorEmitted)
      assert.ok(!ws._isAuthenticated)
    })

    it('handles subscribed event', () => {
      ws = createTestWSv2Instance()
      let subEmitted = false
      ws.on('subscribed', () => { subEmitted = true })

      ws._handleEventMessage({ event: 'subscribed', channel: 'ticker', chanId: 42, symbol: 'tBTCUSD' })
      assert.ok(subEmitted)
      assert.deepStrictEqual(ws._channelMap[42], { event: 'subscribed', channel: 'ticker', chanId: 42, symbol: 'tBTCUSD' })
    })

    it('handles unsubscribed event', () => {
      ws = createTestWSv2Instance()
      ws._channelMap = { 42: { channel: 'ticker' } }
      let unsubEmitted = false
      ws.on('unsubscribed', () => { unsubEmitted = true })

      ws._handleEventMessage({ event: 'unsubscribed', chanId: 42 })
      assert.ok(unsubEmitted)
      assert.strictEqual(ws._channelMap[42], undefined)
    })

    it('handles config success event', () => {
      ws = createTestWSv2Instance()
      ws._handleEventMessage({ event: 'conf', status: 'OK', flags: 131072 })
      assert.strictEqual(ws._enabledFlags, 131072)
    })

    it('handles config failure event', () => {
      ws = createTestWSv2Instance()
      let errorEmitted = false
      ws.on('error', () => { errorEmitted = true })

      ws._handleEventMessage({ event: 'conf', status: 'FAILED', flags: 131072 })
      assert.ok(errorEmitted)
    })

    it('handles error event', () => {
      ws = createTestWSv2Instance()
      let errorEmitted = false
      ws.on('error', () => { errorEmitted = true })

      ws._handleEventMessage({ event: 'error', msg: 'test error' })
      assert.ok(errorEmitted)
    })

    it('handles pong event', () => {
      ws = createTestWSv2Instance()
      let pongEmitted = false
      ws.on('pong', () => { pongEmitted = true })

      ws._handleEventMessage({ event: 'pong', ts: 123 })
      assert.ok(pongEmitted)
    })

    it('handles info event with version check', () => {
      ws = createTestWSv2Instance()
      let infoEmitted = false
      ws.on('info', () => { infoEmitted = true })

      ws._handleEventMessage({ event: 'info', version: 2, platform: { status: 1 } })
      assert.ok(infoEmitted)
    })

    it('emits error on non-v2 server', () => {
      ws = createTestWSv2Instance()
      ws._isOpen = true
      ws._ws = {
        close: () => {},
        once: (ev, cb) => { if (ev === 'close') cb() }
      }

      let errorEmitted = false
      ws.on('error', () => { errorEmitted = true })

      ws._handleEventMessage({ event: 'info', version: 1 })
      assert.ok(errorEmitted)

      // Reset state so afterEach cleanup doesn't hang
      ws._isOpen = false
      ws._ws = null
    })
  })

  describe('_handleChannelMessage', () => {
    it('ignores unknown channels', () => {
      ws = createTestWSv2Instance()
      ws._channelMap = {}

      // Should not throw
      ws._handleChannelMessage([999, 'test', []])
    })

    it('ignores heartbeats', () => {
      ws = createTestWSv2Instance()
      ws._channelMap = { 42: { channel: 'ticker', symbol: 'tBTCUSD' } }

      let emitted = false
      ws.on('ticker', () => { emitted = true })

      ws._handleChannelMessage([42, 'hb'])
      assert.ok(!emitted)
    })

    it('ignores messages with length < 2', () => {
      ws = createTestWSv2Instance()
      ws._channelMap = { 42: { channel: 'ticker', symbol: 'tBTCUSD' } }

      // Should not throw
      ws._handleChannelMessage([42])
    })
  })

  describe('_handleOBChecksumMessage', () => {
    it('emits cs event', () => {
      ws = createTestWSv2Instance()
      let csEmitted = false
      ws.on('cs', () => { csEmitted = true })

      ws._handleOBChecksumMessage([42, 'cs', 12345], { symbol: 'tBTCUSD', prec: 'P0' })
      assert.ok(csEmitted)
    })

    it('skips checksum verification when not managing OBs', () => {
      ws = createTestWSv2Instance({ manageOrderBooks: false })

      // Should not throw even with no OB data
      ws._handleOBChecksumMessage([42, 'cs', 12345], { symbol: 'tBTCUSD', prec: 'P0' })
    })
  })

  describe('updateOrder', () => {
    it('rejects when not authenticated', async () => {
      ws = createTestWSv2Instance()
      ws._isOpen = true

      try {
        await ws.updateOrder({ id: 1, price: 100 })
        assert.fail('should reject')
      } catch (err) {
        assert.ok(err.message.includes('not authenticated'))
      }
    })

    it('rejects when no id provided', async () => {
      wss = new MockWSv2Server()
      ws = createTestWSv2Instance()
      await ws.open()
      await ws.auth()

      try {
        await ws.updateOrder({ price: 100 })
        assert.fail('should reject')
      } catch (err) {
        assert.ok(err.message.includes('order ID required'))
      }
    })

    it('sends update packet with correct format', async () => {
      wss = new MockWSv2Server()
      ws = createTestWSv2Instance()
      await ws.open()
      await ws.auth()

      let sentPacket = null
      ws._sendOrderPacket = (p) => { sentPacket = p }

      // Don't await since we mock the packet sending
      ws.updateOrder({ id: 42, price: 100 })
      assert.ok(sentPacket)
      assert.strictEqual(sentPacket[1], 'ou')
      assert.strictEqual(sentPacket[3].id, 42)
      assert.strictEqual(sentPacket[3].price, 100)
    })
  })

  describe('_sendOrderPacket and buffering', () => {
    it('sends directly when no buffer enabled', () => {
      ws = createTestWSv2Instance()
      ws._isOpen = true
      ws._ws = { send: () => {} }

      let sentPacket = null
      ws.send = (p) => { sentPacket = p; return true }

      ws._sendOrderPacket([0, 'on', null, { type: 'LIMIT' }])
      assert.ok(sentPacket)
    })

    it('buffers when buffer delay is set', () => {
      ws = createTestWSv2Instance({ orderOpBufferDelay: 100 })
      ws._isOpen = true
      ws._ws = { send: () => {} }

      ws._sendOrderPacket([0, 'on', null, { type: 'LIMIT' }])
      assert.strictEqual(ws._orderOpBuffer.length, 1)

      // Clean up timeout
      if (ws._orderOpTimeout !== null) {
        clearTimeout(ws._orderOpTimeout)
        ws._orderOpTimeout = null
      }
    })

    it('_ensureOrderBuffTimeout only creates one timeout', () => {
      ws = createTestWSv2Instance({ orderOpBufferDelay: 100 })

      ws._ensureOrderBuffTimeout()
      const first = ws._orderOpTimeout
      assert.ok(first !== null)

      ws._ensureOrderBuffTimeout()
      assert.strictEqual(ws._orderOpTimeout, first)

      clearTimeout(ws._orderOpTimeout)
      ws._orderOpTimeout = null
    })
  })

  describe('_flushOrderOps - batch splitting', () => {
    it('merges the buffer into ox_multi packet', async () => {
      ws = createTestWSv2Instance({ orderOpBufferDelay: 100 })
      ws._isOpen = true
      ws._isAuthenticated = true
      ws._ws = { send: () => {} }

      ws._orderOpBuffer = [
        [0, 'on', null, { type: 'LIMIT', cid: 1 }],
        [0, 'on', null, { type: 'LIMIT', cid: 2 }]
      ]

      let sentMsg = null
      ws.send = (msg) => {
        sentMsg = msg
        return true
      }

      await ws._flushOrderOps()
      assert.ok(sentMsg)
      assert.strictEqual(sentMsg[1], 'ox_multi')
      assert.strictEqual(sentMsg[3].length, 2)
    })

    it('splits buffer into packets of max 15', async () => {
      ws = createTestWSv2Instance({ orderOpBufferDelay: 100 })
      ws._isOpen = true
      ws._isAuthenticated = true
      ws._ws = { send: () => {} }

      // Create 20 ops
      ws._orderOpBuffer = Array.from({ length: 20 }, (_, i) => (
        [0, 'on', null, { type: 'LIMIT', cid: i }]
      ))

      const sentMsgs = []
      ws.send = (msg) => {
        sentMsgs.push(msg)
        return true
      }

      await ws._flushOrderOps()
      assert.strictEqual(sentMsgs.length, 2)
      assert.strictEqual(sentMsgs[0][3].length, 15)
      assert.strictEqual(sentMsgs[1][3].length, 5)
    })
  })

  describe('_validateMessageSeq', () => {
    it('returns null when seq audit is disabled', () => {
      ws = createTestWSv2Instance({ seqAudit: false })
      assert.strictEqual(ws._validateMessageSeq([42, 'test', 1]), null)
    })

    it('returns null for non-array messages', () => {
      ws = createTestWSv2Instance({ seqAudit: true })
      assert.strictEqual(ws._validateMessageSeq({ event: 'test' }), null)
    })

    it('returns null for empty messages', () => {
      ws = createTestWSv2Instance({ seqAudit: true })
      assert.strictEqual(ws._validateMessageSeq([]), null)
    })

    it('accepts first public sequence number', () => {
      ws = createTestWSv2Instance({ seqAudit: true })
      const err = ws._validateMessageSeq([42, [[1, 2, 3]], 1])
      assert.strictEqual(err, null)
      assert.strictEqual(ws._lastPubSeq, 1)
    })

    it('detects out-of-order public sequence', () => {
      ws = createTestWSv2Instance({ seqAudit: true })
      ws._lastPubSeq = 5
      const err = ws._validateMessageSeq([42, [[1, 2, 3]], 10])
      assert.ok(err instanceof Error)
      assert.ok(err.message.includes('invalid pub seq'))
    })

    it('accepts sequential public sequence', () => {
      ws = createTestWSv2Instance({ seqAudit: true })
      ws._lastPubSeq = 5
      const err = ws._validateMessageSeq([42, [[1, 2, 3]], 6])
      assert.strictEqual(err, null)
    })
  })

  describe('_handleTradeMessage', () => {
    it('emits trades event with correct symbol', () => {
      ws = createTestWSv2Instance()
      let emittedSymbol = null
      ws.on('trades', (symbol) => { emittedSymbol = symbol })

      const chanData = { chanId: 42, channel: 'trades', symbol: 'tBTCUSD' }
      ws._handleTradeMessage([42, 'tu', [1, 2, 3, 4]], chanData)
      assert.strictEqual(emittedSymbol, 'tBTCUSD')
    })
  })

  describe('_handleCandleMessage', () => {
    it('emits candle event', () => {
      ws = createTestWSv2Instance()
      let emittedKey = null
      ws.on('candle', (data, key) => { emittedKey = key })

      const chanData = { chanId: 42, channel: 'candles', key: 'trade:1m:tBTCUSD' }
      ws._handleCandleMessage([42, [[1, 2, 3, 4, 5, 6]]], chanData)
      assert.strictEqual(emittedKey, 'trade:1m:tBTCUSD')
    })

    it('wraps single candle in array when not managing', () => {
      ws = createTestWSv2Instance({ manageCandles: false })
      let emittedData = null
      ws.on('candle', (data) => { emittedData = data })

      const chanData = { chanId: 42, channel: 'candles', key: 'trade:1m:tBTCUSD' }
      ws._handleCandleMessage([42, [1, 2, 3, 4, 5, 6]], chanData)
      // Single candle should be wrapped in array
      assert.ok(Array.isArray(emittedData))
      assert.ok(Array.isArray(emittedData[0]))
    })
  })

  describe('_updateManagedCandles', () => {
    it('stores snapshot sorted by timestamp desc', () => {
      ws = createTestWSv2Instance({ manageCandles: true })
      const data = [[100, 1, 2, 3, 4, 5], [300, 1, 2, 3, 4, 5], [200, 1, 2, 3, 4, 5]]
      const err = ws._updateManagedCandles('trade:1m:tBTCUSD', data)

      assert.strictEqual(err, null)
      assert.strictEqual(ws._candles['trade:1m:tBTCUSD'][0][0], 300)
      assert.strictEqual(ws._candles['trade:1m:tBTCUSD'][1][0], 200)
      assert.strictEqual(ws._candles['trade:1m:tBTCUSD'][2][0], 100)
    })

    it('updates existing candle by timestamp', () => {
      ws = createTestWSv2Instance({ manageCandles: true })
      ws._candles['trade:1m:tBTCUSD'] = [
        [300, 1, 2, 3, 4, 5],
        [200, 1, 2, 3, 4, 5],
        [100, 1, 2, 3, 4, 5]
      ]

      const err = ws._updateManagedCandles('trade:1m:tBTCUSD', [200, 10, 20, 30, 40, 50])
      assert.strictEqual(err, null)
      assert.strictEqual(ws._candles['trade:1m:tBTCUSD'][1][1], 10)
    })

    it('prepends new candle when timestamp not found', () => {
      ws = createTestWSv2Instance({ manageCandles: true })
      ws._candles['trade:1m:tBTCUSD'] = [
        [300, 1, 2, 3, 4, 5],
        [200, 1, 2, 3, 4, 5]
      ]

      const err = ws._updateManagedCandles('trade:1m:tBTCUSD', [400, 10, 20, 30, 40, 50])
      assert.strictEqual(err, null)
      assert.strictEqual(ws._candles['trade:1m:tBTCUSD'].length, 3)
      assert.strictEqual(ws._candles['trade:1m:tBTCUSD'][0][0], 400)
    })

    it('returns error for update on unknown candle set', () => {
      ws = createTestWSv2Instance({ manageCandles: true })
      const err = ws._updateManagedCandles('trade:1m:tBTCUSD', [100, 1, 2, 3, 4, 5])
      assert.ok(err instanceof Error)
      assert.ok(err.message.includes('unknown candles'))
    })
  })

  describe('getOB and getLosslessOB', () => {
    it('getOB returns null for unknown symbol', () => {
      ws = createTestWSv2Instance()
      assert.strictEqual(ws.getOB('tFOOBAR'), null)
    })

    it('getLosslessOB returns null for unknown symbol', () => {
      ws = createTestWSv2Instance()
      assert.strictEqual(ws.getLosslessOB('tFOOBAR'), null)
    })
  })

  describe('_handleAuthMessage', () => {
    it('processes notification messages', () => {
      ws = createTestWSv2Instance()
      ws._channelMap = { 0: { channel: 'auth' } }

      let notifCalled = false
      ws._onWSNotification = () => { notifCalled = true }

      ws._handleAuthMessage([0, 'n', [0, 'on-req', null, null, [1, 2, 42], 0, 'SUCCESS', 'ok']], { channel: 'auth' })
      assert.ok(notifCalled)
    })

    it('renames te to auth-te', () => {
      ws = createTestWSv2Instance()
      const msg = [0, 'te', [1, 2, 3]]

      ws._handleAuthMessage(msg, { channel: 'auth' })
      assert.strictEqual(msg[1], 'auth-te')
    })

    it('renames tu to auth-tu', () => {
      ws = createTestWSv2Instance()
      const msg = [0, 'tu', [1, 2, 3]]

      ws._handleAuthMessage(msg, { channel: 'auth' })
      assert.strictEqual(msg[1], 'auth-tu')
    })
  })

  describe('subscribe/unsubscribe methods', () => {
    it('subscribeTicker sends subscribe packet', () => {
      ws = createTestWSv2Instance()
      ws._isOpen = true
      ws._ws = { send: () => {} }

      let sentPacket = null
      ws.send = (p) => { sentPacket = p; return true }

      ws.subscribeTicker('tBTCUSD')
      // managedSubscribe calls subscribe which calls send
      assert.ok(sentPacket)
      assert.strictEqual(sentPacket.event, 'subscribe')
      assert.strictEqual(sentPacket.channel, 'ticker')
      assert.strictEqual(sentPacket.symbol, 'tBTCUSD')
    })

    it('subscribeTrades sends subscribe packet', () => {
      ws = createTestWSv2Instance()
      ws._isOpen = true
      ws._ws = { send: () => {} }

      let sentPacket = null
      ws.send = (p) => { sentPacket = p; return true }

      ws.subscribeTrades('tBTCUSD')
      assert.ok(sentPacket)
      assert.strictEqual(sentPacket.channel, 'trades')
    })

    it('subscribeOrderBook sends subscribe packet with precision', () => {
      ws = createTestWSv2Instance()
      ws._isOpen = true
      ws._ws = { send: () => {} }

      let sentPacket = null
      ws.send = (p) => { sentPacket = p; return true }

      ws.subscribeOrderBook('tBTCUSD', 'R0', '100')
      assert.ok(sentPacket)
      assert.strictEqual(sentPacket.channel, 'book')
      assert.strictEqual(sentPacket.prec, 'R0')
      assert.strictEqual(sentPacket.len, '100')
    })

    it('subscribeCandles sends subscribe packet', () => {
      ws = createTestWSv2Instance()
      ws._isOpen = true
      ws._ws = { send: () => {} }

      let sentPacket = null
      ws.send = (p) => { sentPacket = p; return true }

      ws.subscribeCandles('trade:1m:tBTCUSD')
      assert.ok(sentPacket)
      assert.strictEqual(sentPacket.channel, 'candles')
      assert.strictEqual(sentPacket.key, 'trade:1m:tBTCUSD')
    })

    it('unsubscribe sends unsubscribe packet', () => {
      ws = createTestWSv2Instance()
      ws._isOpen = true
      ws._ws = { send: () => {} }

      let sentPacket = null
      ws.send = (p) => { sentPacket = p; return true }

      ws.unsubscribe(42)
      assert.ok(sentPacket)
      assert.strictEqual(sentPacket.event, 'unsubscribe')
      assert.strictEqual(sentPacket.chanId, 42)
    })
  })

  describe('removeListeners', () => {
    it('removes all listeners for a group', () => {
      ws = createTestWSv2Instance()
      ws._registerListener('test', null, null, 'group1', () => {})
      ws._registerListener('test2', null, null, 'group1', () => {})

      assert.ok(ws._listeners.group1)
      ws.removeListeners('group1')
      assert.strictEqual(ws._listeners.group1, undefined)
    })
  })

  describe('_payloadPassesFilter', () => {
    it('passes when no filter values are set', () => {
      assert.ok(WSv2._payloadPassesFilter([1, 2, 3], {}))
    })

    it('passes when filter values match', () => {
      assert.ok(WSv2._payloadPassesFilter(['tBTCUSD', 100], { 0: 'tBTCUSD' }))
    })

    it('fails when filter values do not match', () => {
      assert.ok(!WSv2._payloadPassesFilter(['tETHUSD', 100], { 0: 'tBTCUSD' }))
    })

    it('ignores undefined, null, empty, and wildcard filter values', () => {
      assert.ok(WSv2._payloadPassesFilter([1], { 0: undefined }))
      assert.ok(WSv2._payloadPassesFilter([1], { 0: null }))
      assert.ok(WSv2._payloadPassesFilter([1], { 0: '' }))
      assert.ok(WSv2._payloadPassesFilter([1], { 0: '*' }))
    })
  })

  describe('_onWSMessage', () => {
    it('handles Buffer input (ws v8+)', () => {
      ws = createTestWSv2Instance()
      ws._isOpen = true

      let msgReceived = null
      ws.on('message', (msg) => { msgReceived = msg })

      // Simulate Buffer message (as ws v8+ sends)
      const buf = Buffer.from(JSON.stringify({ event: 'info', version: 2 }))
      ws._onWSMessage(buf)
      assert.ok(msgReceived)
      assert.strictEqual(msgReceived.event, 'info')
    })

    it('emits error on invalid JSON', () => {
      ws = createTestWSv2Instance()
      ws._isOpen = true

      let errorEmitted = false
      ws.on('error', () => { errorEmitted = true })

      ws._onWSMessage('not-valid-json{{{')
      assert.ok(errorEmitted)
    })
  })

  describe('_triggerPacketWD', () => {
    it('does nothing when not open', async () => {
      ws = createTestWSv2Instance({ packetWDDelay: 1000 })
      ws._isOpen = false

      const result = await ws._triggerPacketWD()
      assert.ok(result === undefined || result instanceof Promise || result === null)
    })

    it('does nothing without packetWDDelay', async () => {
      ws = createTestWSv2Instance()
      ws._isOpen = true

      await ws._triggerPacketWD()
      // Should resolve without error
    })
  })

  describe('resubscribePreviousChannels', () => {
    it('resubscribes ticker channels', () => {
      ws = createTestWSv2Instance()
      ws._isOpen = true
      ws._ws = { send: () => {} }

      const subscribed = []
      ws.subscribeTicker = (symbol) => { subscribed.push({ type: 'ticker', symbol }) }

      ws._prevChannelMap = {
        42: { channel: 'ticker', symbol: 'tBTCUSD' }
      }

      ws.resubscribePreviousChannels()
      assert.strictEqual(subscribed.length, 1)
      assert.strictEqual(subscribed[0].symbol, 'tBTCUSD')
    })

    it('resubscribes trades channels', () => {
      ws = createTestWSv2Instance()

      const subscribed = []
      ws.subscribeTrades = (symbol) => { subscribed.push(symbol) }

      ws._prevChannelMap = {
        42: { channel: 'trades', symbol: 'tETHUSD' }
      }

      ws.resubscribePreviousChannels()
      assert.strictEqual(subscribed.length, 1)
      assert.strictEqual(subscribed[0], 'tETHUSD')
    })

    it('resubscribes book channels with precision and length', () => {
      ws = createTestWSv2Instance()

      const subscribed = []
      ws.subscribeOrderBook = (symbol, prec, len) => { subscribed.push({ symbol, prec, len }) }

      ws._prevChannelMap = {
        42: { channel: 'book', symbol: 'tBTCUSD', prec: 'P0', len: '25' }
      }

      ws.resubscribePreviousChannels()
      assert.strictEqual(subscribed.length, 1)
      assert.strictEqual(subscribed[0].symbol, 'tBTCUSD')
      assert.strictEqual(subscribed[0].prec, 'P0')
      assert.strictEqual(subscribed[0].len, '25')
    })

    it('resubscribes candle channels', () => {
      ws = createTestWSv2Instance()

      const subscribed = []
      ws.subscribeCandles = (key) => { subscribed.push(key) }

      ws._prevChannelMap = {
        42: { channel: 'candles', key: 'trade:1m:tBTCUSD' }
      }

      ws.resubscribePreviousChannels()
      assert.strictEqual(subscribed.length, 1)
      assert.strictEqual(subscribed[0], 'trade:1m:tBTCUSD')
    })
  })

  describe('notifyUI', () => {
    it('throws when not open', () => {
      ws = createTestWSv2Instance()
      assert.throws(() => ws.notifyUI({ type: 'info', message: 'test' }), /not open/)
    })

    it('throws when not authenticated', () => {
      ws = createTestWSv2Instance()
      ws._isOpen = true
      assert.throws(() => ws.notifyUI({ type: 'info', message: 'test' }), /not authenticated/)
    })

    it('throws with missing type', () => {
      ws = createTestWSv2Instance()
      ws._isOpen = true
      ws._isAuthenticated = true
      assert.throws(() => ws.notifyUI({ message: 'test' }), /invalid type/)
    })

    it('throws with missing message', () => {
      ws = createTestWSv2Instance()
      ws._isOpen = true
      ws._isAuthenticated = true
      assert.throws(() => ws.notifyUI({ type: 'info' }), /invalid type/)
    })
  })

  describe('auth nonce error detection', () => {
    it('detects nonce-related auth failures', () => {
      ws = createTestWSv2Instance()
      let errorMsg = null
      ws.on('error', (err) => { errorMsg = err.message })

      ws._handleAuthEvent({ status: 'FAILED', msg: 'nonce: small' })
      assert.ok(errorMsg.includes('nonce'))
    })

    it('handles generic auth failures', () => {
      ws = createTestWSv2Instance()
      let errorMsg = null
      ws.on('error', (err) => { errorMsg = err.message })

      ws._handleAuthEvent({ status: 'FAILED', msg: 'apikey: invalid' })
      assert.ok(errorMsg.includes('auth failed'))
      assert.ok(errorMsg.includes('apikey: invalid'))
    })
  })

  describe('getAuthArgs', () => {
    it('returns auth args', () => {
      ws = createTestWSv2Instance()
      const args = ws.getAuthArgs()
      assert.strictEqual(args.apiKey, API_KEY)
      assert.strictEqual(args.apiSecret, API_SECRET)
    })
  })

  describe('usesAgent', () => {
    it('returns false when no agent', () => {
      ws = createTestWSv2Instance()
      assert.strictEqual(ws.usesAgent(), false)
    })

    it('returns true when agent is set', () => {
      const agent = { __testAgent: true }
      ws = createTestWSv2Instance({ agent })
      assert.strictEqual(ws.usesAgent(), true)
    })
  })

  describe('constructor option storage', () => {
    it('stores affCode option', () => {
      ws = createTestWSv2Instance({ affCode: 'TEST123' })
      assert.strictEqual(ws._affCode, 'TEST123')
    })

    it('defaults affCode to undefined', () => {
      ws = createTestWSv2Instance()
      assert.strictEqual(ws._affCode, undefined)
    })

    it('stores agent option', () => {
      const agent = { __testAgent: true }
      ws = createTestWSv2Instance({ agent })
      assert.strictEqual(ws._agent, agent)
    })

    it('defaults manageOrderBooks to false', () => {
      ws = createTestWSv2Instance()
      assert.strictEqual(ws._manageOrderBooks, false)
    })

    it('defaults manageCandles to false', () => {
      ws = createTestWSv2Instance()
      assert.strictEqual(ws._manageCandles, false)
    })

    it('defaults autoReconnect to false', () => {
      ws = createTestWSv2Instance()
      assert.strictEqual(ws._autoReconnect, false)
    })

    it('initializes empty internal state', () => {
      ws = createTestWSv2Instance()
      assert.deepStrictEqual(ws._orderBooks, {})
      assert.deepStrictEqual(ws._losslessOrderBooks, {})
      assert.deepStrictEqual(ws._candles, {})
      assert.deepStrictEqual(ws._listeners, {})
      assert.deepStrictEqual(ws._channelMap, {})
    })
  })

  describe('submitOrder affCode', () => {
    it('applies affCode to order packet meta', () => {
      ws = createTestWSv2Instance({ affCode: 'AFF123' })
      ws._isAuthenticated = true
      let sentPacket = null
      ws._sendOrderPacket = (p) => { sentPacket = p }

      ws.submitOrder({ type: 'LIMIT', symbol: 'tBTCUSD', amount: '1', price: '100', cid: 1 })
      assert.ok(sentPacket)
      assert.strictEqual(sentPacket[3].meta.aff_code, 'AFF123')
    })

    it('does not overwrite existing aff_code in meta', () => {
      ws = createTestWSv2Instance({ affCode: 'AFF123' })
      ws._isAuthenticated = true
      let sentPacket = null
      ws._sendOrderPacket = (p) => { sentPacket = p }

      ws.submitOrder({
        type: 'LIMIT',
        symbol: 'tBTCUSD',
        amount: '1',
        price: '100',
        cid: 2,
        meta: { aff_code: 'EXISTING' }
      })
      assert.ok(sentPacket)
      assert.strictEqual(sentPacket[3].meta.aff_code, 'EXISTING')
    })

    it('does not add aff_code when affCode is not set', () => {
      ws = createTestWSv2Instance()
      ws._isAuthenticated = true
      let sentPacket = null
      ws._sendOrderPacket = (p) => { sentPacket = p }

      ws.submitOrder({ type: 'LIMIT', symbol: 'tBTCUSD', amount: '1', price: '100', cid: 3 })
      assert.ok(sentPacket)
      assert.strictEqual(sentPacket[3].meta?.aff_code, undefined)
    })
  })

  describe('_handleStatusMessage', () => {
    it('emits status event with data and key', (done) => {
      ws = createTestWSv2Instance()
      const chanData = { chanId: 42, channel: 'status', key: 'liq:global' }
      const statusData = [1, 2, 3]

      ws.on('status', (data, key) => {
        assert.deepStrictEqual(data, statusData)
        assert.strictEqual(key, 'liq:global')
        done()
      })

      ws._handleStatusMessage([42, statusData], chanData)
    })

    it('propagates to listeners with filterOverride', () => {
      ws = createTestWSv2Instance()
      const chanData = { chanId: 42, channel: 'status', key: 'liq:global' }
      let propagated = false

      ws._propagateMessageToListeners = (msg, cd, transformed) => {
        assert.deepStrictEqual(msg.filterOverride, ['liq:global'])
        assert.strictEqual(transformed, false)
        propagated = true
      }

      ws._handleStatusMessage([42, [1, 2, 3]], chanData)
      assert.ok(propagated)
    })

    it('extracts payload via getMessagePayload', () => {
      ws = createTestWSv2Instance()
      const chanData = { chanId: 42, channel: 'status', key: 'liq:global' }
      const statusData = [10, 20, 30]

      ws.on('status', (data) => {
        assert.deepStrictEqual(data, statusData)
      })

      // Append a sequence number after payload to test getMessagePayload
      ws._handleStatusMessage([42, statusData, 7], chanData)
    })
  })
})
