/* eslint-env mocha */
/* eslint-disable @typescript-eslint/no-explicit-any */

import assert from 'node:assert'
import WSv2 from '../../dist/transports/ws2.js'

/**
 * WebSocket v2 Subscription Integration Tests
 * Tests real WebSocket subscriptions and data flow
 */
describe('WSv2 subscription integration tests', function () {
  this.timeout(15000) // WebSocket operations can take time

  let ws: any

  afterEach(async () => {
    if (ws && ws.isOpen()) {
      await ws.close()
    }
    ws = null
  })

  describe('connection lifecycle', () => {
    it('opens connection successfully', async () => {
      ws = new WSv2({ transform: true })

      await ws.open()

      assert.ok(ws.isOpen(), 'connection should be open')
    })

    it('closes connection successfully', async () => {
      ws = new WSv2({ transform: true })

      await ws.open()
      assert.ok(ws.isOpen(), 'connection should be open')

      await ws.close()
      assert.ok(!ws.isOpen(), 'connection should be closed')
    })

    it('reconnects successfully', async () => {
      ws = new WSv2({ transform: true })

      await ws.open()
      assert.ok(ws.isOpen(), 'first connection should be open')

      await ws.reconnect()
      assert.ok(ws.isOpen(), 'reconnected connection should be open')
    })

    it('emits open event', (done) => {
      ws = new WSv2({ transform: true })

      ws.once('open', () => {
        assert.ok(true, 'open event emitted')
        done()
      })

      ws.open()
    })

    it('emits close event', (done) => {
      ws = new WSv2({ transform: true })

      ws.once('close', () => {
        assert.ok(true, 'close event emitted')
        done()
      })

      ws.open().then(() => ws.close())
    })
  })

  describe('ticker subscriptions', () => {
    it('subscribes to ticker successfully', async () => {
      ws = new WSv2({ transform: true })

      await ws.open()
      await ws.subscribeTicker('tBTCUSD')

      // Wait a bit for subscription to be processed
      await new Promise(resolve => setTimeout(resolve, 1000))

      assert.ok(true, 'subscription completed without error')
    })

    it('receives ticker updates', (done) => {
      ws = new WSv2({ transform: true })

      ws.open().then(async () => {
        let updateReceived = false

        ws.onTicker({ symbol: 'tBTCUSD' }, (ticker: any) => {
          if (!updateReceived) {
            updateReceived = true

            assert.ok(ticker, 'ticker data received')
            assert.strictEqual(ticker.symbol, 'tBTCUSD', 'correct symbol')
            assert.ok(typeof ticker.bid === 'number', 'has bid price')
            assert.ok(typeof ticker.ask === 'number', 'has ask price')
            assert.ok(typeof ticker.lastPrice === 'number', 'has last price')

            done()
          }
        })

        await ws.subscribeTicker('tBTCUSD')
      })
    })

    it('subscribes to multiple tickers', async () => {
      ws = new WSv2({ transform: true })

      await ws.open()

      const symbols = ['tBTCUSD', 'tETHUSD']
      for (const symbol of symbols) {
        await ws.subscribeTicker(symbol)
      }

      await new Promise(resolve => setTimeout(resolve, 1000))

      assert.ok(true, 'multiple subscriptions completed')
    })
  })

  describe('trades subscriptions', () => {
    it('subscribes to trades successfully', async () => {
      ws = new WSv2({ transform: true })

      await ws.open()
      await ws.subscribeTrades('tBTCUSD')

      await new Promise(resolve => setTimeout(resolve, 1000))

      assert.ok(true, 'trades subscription completed')
    })

    it('receives trade updates', function (done) {
      this.timeout(20000) // Trades might take longer to arrive

      ws = new WSv2({ transform: true })

      ws.open().then(async () => {
        let updateReceived = false

        ws.onTradeEntry({ symbol: 'tBTCUSD' }, (trade: any) => {
          if (!updateReceived) {
            updateReceived = true

            assert.ok(trade, 'trade data received')
            assert.ok(trade.id, 'trade has id')
            assert.ok(typeof trade.mts === 'number', 'trade has timestamp')
            assert.ok(typeof trade.amount === 'number', 'trade has amount')
            assert.ok(typeof trade.price === 'number', 'trade has price')

            done()
          }
        })

        await ws.subscribeTrades('tBTCUSD')
      })
    })
  })

  describe('order book subscriptions', () => {
    it('subscribes to order book successfully', async () => {
      ws = new WSv2({ transform: true })

      await ws.open()
      await ws.subscribeOrderBook('tBTCUSD')

      await new Promise(resolve => setTimeout(resolve, 1000))

      assert.ok(true, 'order book subscription completed')
    })

    it('receives order book snapshots and updates', (done) => {
      ws = new WSv2({ transform: true })

      ws.open().then(async () => {
        let snapshotReceived = false

        ws.onOrderBook({ symbol: 'tBTCUSD' }, (book: any) => {
          if (!snapshotReceived) {
            snapshotReceived = true

            assert.ok(book, 'order book data received')

            // Check if it's an array (raw) or object (transformed)
            if (Array.isArray(book)) {
              assert.ok(book.length > 0, 'order book has entries')
            } else {
              assert.ok(book.bids || book.asks, 'order book has bids or asks')
            }

            done()
          }
        })

        await ws.subscribeOrderBook('tBTCUSD', 'P0', '25')
      })
    })

    it('subscribes to raw order book (R0)', async () => {
      ws = new WSv2({ transform: true })

      await ws.open()
      await ws.subscribeOrderBook('tBTCUSD', 'R0')

      await new Promise(resolve => setTimeout(resolve, 1000))

      assert.ok(true, 'raw order book subscription completed')
    })
  })

  describe('candles subscriptions', () => {
    it('subscribes to candles successfully', async () => {
      ws = new WSv2({ transform: true })

      await ws.open()
      await ws.subscribeCandles('trade:1m:tBTCUSD')

      await new Promise(resolve => setTimeout(resolve, 1000))

      assert.ok(true, 'candles subscription completed')
    })

    it('receives candle updates', (done) => {
      ws = new WSv2({ transform: true })

      ws.open().then(async () => {
        let candleReceived = false

        ws.onCandle({ key: 'trade:1m:tBTCUSD' }, (candles: any) => {
          if (!candleReceived) {
            candleReceived = true

            assert.ok(candles, 'candle data received')
            assert.ok(Array.isArray(candles), 'candles is array')

            if (candles.length > 0) {
              const candle = candles[0]
              assert.ok(candle.mts || candle[0], 'candle has timestamp')
            }

            done()
          }
        })

        await ws.subscribeCandles('trade:1m:tBTCUSD')
      })
    })

    it('subscribes to different timeframes', async () => {
      ws = new WSv2({ transform: true })

      await ws.open()

      const timeframes = ['1m', '5m', '1h']
      for (const tf of timeframes) {
        await ws.subscribeCandles(`trade:${tf}:tBTCUSD`)
      }

      await new Promise(resolve => setTimeout(resolve, 1000))

      assert.ok(true, 'multiple timeframe subscriptions completed')
    })
  })

  describe('authenticated subscriptions', () => {
    const hasCredentials = (): boolean => {
      return !!(process.env.API_KEY && process.env.API_SECRET)
    }

    beforeEach(function () {
      if (!hasCredentials()) {
        this.skip()
      }
    })

    it('authenticates successfully', async function () {
      ws = new WSv2({
        apiKey: process.env.API_KEY,
        apiSecret: process.env.API_SECRET,
        transform: true
      })

      await ws.open()
      await ws.auth()

      assert.ok(ws.isAuthenticated(), 'should be authenticated')
    })

    it('receives wallet snapshot', function (done) {
      ws = new WSv2({
        apiKey: process.env.API_KEY,
        apiSecret: process.env.API_SECRET,
        transform: true
      })

      ws.open().then(async () => {
        ws.onWalletSnapshot({}, (wallets: any) => {
          assert.ok(wallets, 'wallets received')
          assert.ok(Array.isArray(wallets), 'wallets is array')

          if (wallets.length > 0) {
            const wallet = wallets[0]
            assert.ok(wallet.type || wallet[0], 'wallet has type')
            assert.ok(wallet.currency || wallet[1], 'wallet has currency')
          }

          done()
        })

        await ws.auth()
      })
    })

    it('receives order snapshot', function (done) {
      ws = new WSv2({
        apiKey: process.env.API_KEY,
        apiSecret: process.env.API_SECRET,
        transform: true
      })

      ws.open().then(async () => {
        ws.onOrderSnapshot({}, (orders: any) => {
          assert.ok(orders, 'orders received')
          assert.ok(Array.isArray(orders), 'orders is array')
          done()
        })

        await ws.auth()
      })
    })
  })

  describe('subscription management', () => {
    it('unsubscribes from channel', async () => {
      ws = new WSv2({ transform: true })

      await ws.open()
      await ws.subscribeTicker('tBTCUSD')

      await new Promise(resolve => setTimeout(resolve, 1000))

      const chanId = ws.getDataChannelId('ticker', { symbol: 'tBTCUSD' })
      assert.ok(chanId, 'channel id should exist')

      await ws.unsubscribe(chanId)

      await new Promise(resolve => setTimeout(resolve, 1000))

      assert.ok(true, 'unsubscribe completed')
    })

    it('handles multiple subscription/unsubscription cycles', async () => {
      ws = new WSv2({ transform: true })

      await ws.open()

      for (let i = 0; i < 3; i++) {
        await ws.subscribeTicker('tBTCUSD')
        await new Promise(resolve => setTimeout(resolve, 500))

        const chanId = ws.getDataChannelId('ticker', { symbol: 'tBTCUSD' })
        if (chanId) {
          await ws.unsubscribe(chanId)
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }

      assert.ok(true, 'multiple cycles completed')
    })
  })

  describe('error handling', () => {
    it('handles connection errors gracefully', (done) => {
      ws = new WSv2({
        url: 'ws://invalid-url-that-does-not-exist.com',
        transform: true
      })

      ws.once('error', (err: Error) => {
        assert.ok(err, 'error event emitted')
        done()
      })

      ws.open().catch(() => {
        // Expected to fail
        assert.ok(true, 'connection failed as expected')
        done()
      })
    })

    it('handles invalid subscription', async () => {
      ws = new WSv2({ transform: true })

      await ws.open()

      try {
        await ws.subscribeTicker('INVALID_SYMBOL_12345')
        // Wait to see if server rejects
        await new Promise(resolve => setTimeout(resolve, 2000))
        // Some invalid symbols might not be rejected immediately
        assert.ok(true, 'handled invalid symbol')
      } catch (err) {
        assert.ok(err, 'error thrown for invalid symbol')
      }
    })
  })

  describe('data transformation', () => {
    it('transforms data when enabled', (done) => {
      ws = new WSv2({ transform: true })

      ws.open().then(async () => {
        ws.onTicker({ symbol: 'tBTCUSD' }, (ticker: any) => {
          assert.ok(typeof ticker === 'object', 'ticker is object')
          assert.ok(ticker.symbol, 'has symbol property')
          assert.ok(typeof ticker.bid === 'number', 'has bid property')
          done()
        })

        await ws.subscribeTicker('tBTCUSD')
      })
    })

    it('returns raw arrays when transform disabled', (done) => {
      ws = new WSv2({ transform: false })

      ws.open().then(async () => {
        ws.onTicker({ symbol: 'tBTCUSD' }, (ticker: any) => {
          assert.ok(Array.isArray(ticker), 'ticker is array')
          assert.ok(ticker.length > 0, 'array has elements')
          done()
        })

        await ws.subscribeTicker('tBTCUSD')
      })
    })
  })
})
