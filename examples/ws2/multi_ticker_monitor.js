'use strict'

const { debug } = require('../util/setup')
const WSv2 = require('../../lib/transports/ws2')

/**
 * Multi-pair ticker monitoring
 * Demonstrates: subscribing to multiple tickers and monitoring price changes
 */
async function execute () {
  const ws = new WSv2({
    transform: true
  })

  // Configure pairs to monitor
  const pairs = [
    'tBTCUSD',
    'tETHUSD',
    'tLTCUSD',
    'tXRPUSD',
    'tEOSUSD'
  ]

  // Store ticker data
  const tickerData = {}
  const priceChanges = {}

  ws.on('error', (err) => {
    debug('WebSocket error: %s', err.message || err)
  })

  ws.on('open', () => {
    debug('WebSocket connection opened')
  })

  ws.on('close', () => {
    debug('WebSocket connection closed')
  })

  try {
    // Open connection
    await ws.open()
    debug('Connected to Bitfinex WebSocket API\n')

    // Subscribe to all tickers
    for (const pair of pairs) {
      await ws.subscribeTicker(pair)
      debug('✓ Subscribed to %s', pair)
    }

    debug('\nMonitoring %d pairs for price changes...\n', pairs.length)
    debug('='.repeat(80))

    // Listen for ticker updates
    ws.onTicker({ symbol: '*' }, (ticker) => {
      const symbol = ticker.symbol
      const oldData = tickerData[symbol]

      // Store new data
      tickerData[symbol] = {
        lastPrice: ticker.lastPrice,
        volume: ticker.volume,
        high: ticker.high,
        low: ticker.low,
        bid: ticker.bid,
        ask: ticker.ask,
        dailyChange: ticker.dailyChange,
        dailyChangePerc: ticker.dailyChangePerc
      }

      // Calculate price change
      if (oldData) {
        const priceChange = ticker.lastPrice - oldData.lastPrice
        const priceChangePerc = (priceChange / oldData.lastPrice) * 100

        if (priceChange !== 0) {
          priceChanges[symbol] = priceChanges[symbol] || []
          priceChanges[symbol].push({
            timestamp: Date.now(),
            change: priceChange,
            changePerc: priceChangePerc
          })

          // Show update with color indicator
          const indicator = priceChange > 0 ? '↑' : '↓'
          const sign = priceChange > 0 ? '+' : ''

          debug('[%s] %s %s %f (%s%f / %s%.2f%%)',
            new Date().toLocaleTimeString(),
            indicator,
            symbol,
            ticker.lastPrice,
            sign,
            priceChange,
            sign,
            priceChangePerc
          )
        }
      }

      // Show periodic summary every 30 seconds
      if (!ws._lastSummary || Date.now() - ws._lastSummary > 30000) {
        ws._lastSummary = Date.now()
        showSummary()
      }
    })

    // Function to display summary
    function showSummary () {
      debug('\n' + '='.repeat(80))
      debug('MARKET SUMMARY - %s', new Date().toLocaleString())
      debug('='.repeat(80))

      for (const symbol of pairs) {
        const data = tickerData[symbol]
        if (!data) continue

        const changes = priceChanges[symbol] || []
        const recentChanges = changes.slice(-10)
        const avgChange = recentChanges.length > 0
          ? recentChanges.reduce((sum, c) => sum + c.changePerc, 0) / recentChanges.length
          : 0

        const indicator = data.dailyChange > 0 ? '↑' : '↓'
        const sign = data.dailyChange > 0 ? '+' : ''

        debug('\n%s %s', indicator, symbol)
        debug('  Price:        %f', data.lastPrice)
        debug('  Bid/Ask:      %f / %f (Spread: %f)',
          data.bid, data.ask, data.ask - data.bid)
        debug('  24h Change:   %s%.2f%%', sign, data.dailyChangePerc * 100)
        debug('  24h High/Low: %f / %f', data.high, data.low)
        debug('  24h Volume:   %f', data.volume)
        debug('  Avg Change:   %s%.4f%% (last 10 updates)',
          avgChange > 0 ? '+' : '', avgChange)
        debug('  Updates:      %d', changes.length)
      }

      debug('\n' + '='.repeat(80) + '\n')
    }

    // Show summary on demand with SIGUSR1
    process.on('SIGUSR1', () => {
      showSummary()
    })

    // Graceful shutdown
    process.on('SIGINT', async () => {
      debug('\n\nClosing connection...')
      showSummary()
      await ws.close()
      process.exit(0)
    })

    debug('Press Ctrl+C to exit')
    debug('Send SIGUSR1 to process for summary (kill -SIGUSR1 %d)\n', process.pid)
  } catch (err) {
    debug('Error: %s', err.message)
    await ws.close()
    process.exit(1)
  }
}

execute()
