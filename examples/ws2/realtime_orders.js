'use strict'

const { debug } = require('../util/setup')
const WSv2 = require('../../lib/transports/ws2')

/**
 * Real-time order updates via WebSocket
 * Demonstrates: authenticated connection and order lifecycle monitoring
 */
async function execute () {
  const ws = new WSv2({
    apiKey: process.env.API_KEY,
    apiSecret: process.env.API_SECRET,
    transform: true
  })

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
    debug('Connected to Bitfinex WebSocket API')

    // Authenticate
    await ws.auth()
    debug('Successfully authenticated')

    // Listen for order snapshots (all existing orders on connect)
    ws.onOrderSnapshot({}, (orders) => {
      debug('\n=== Order Snapshot ===')
      debug('Total open orders: %d', orders.length)
      orders.forEach((order, idx) => {
        debug('[%d] ID:%d %s %s %f @ %f - Status: %s',
          idx + 1,
          order.id,
          order.type,
          order.symbol,
          order.amount,
          order.price,
          order.status
        )
      })
    })

    // Listen for new orders
    ws.onOrderNew({}, (order) => {
      debug('\n✓ NEW ORDER')
      debug('ID: %d', order.id)
      debug('Symbol: %s', order.symbol)
      debug('Type: %s', order.type)
      debug('Amount: %f', order.amount)
      debug('Price: %f', order.price)
      debug('Status: %s', order.status)
    })

    // Listen for order updates
    ws.onOrderUpdate({}, (order) => {
      debug('\n↻ ORDER UPDATED')
      debug('ID: %d', order.id)
      debug('Symbol: %s', order.symbol)
      debug('Amount: %f (original: %f)', order.amount, order.amountOrig)
      debug('Status: %s', order.status)
    })

    // Listen for order cancellations
    ws.onOrderClose({}, (order) => {
      debug('\n✗ ORDER CLOSED/CANCELLED')
      debug('ID: %d', order.id)
      debug('Symbol: %s', order.symbol)
      debug('Status: %s', order.status)
    })

    // Listen for position updates
    ws.onPositionSnapshot({}, (positions) => {
      debug('\n=== Position Snapshot ===')
      debug('Total positions: %d', positions.length)
      positions.forEach((pos, idx) => {
        debug('[%d] %s: %f @ %f (P&L: %f)',
          idx + 1,
          pos.symbol,
          pos.amount,
          pos.basePrice,
          pos.pl
        )
      })
    })

    ws.onPositionUpdate({}, (position) => {
      debug('\n↻ POSITION UPDATED')
      debug('Symbol: %s', position.symbol)
      debug('Amount: %f', position.amount)
      debug('Base Price: %f', position.basePrice)
      debug('P&L: %f', position.pl)
    })

    // Listen for wallet updates
    ws.onWalletUpdate({}, (wallet) => {
      debug('\n💰 WALLET UPDATED')
      debug('Type: %s, Currency: %s', wallet.type, wallet.currency)
      debug('Balance: %f (Available: %f)', wallet.balance, wallet.balanceAvailable)
    })

    // Listen for trade executions
    ws.onAccountTradeEntry({}, (trade) => {
      debug('\n⚡ TRADE EXECUTED')
      debug('ID: %d', trade.id)
      debug('Symbol: %s', trade.symbol)
      debug('Exec Amount: %f', trade.execAmount)
      debug('Exec Price: %f', trade.execPrice)
      debug('Fee: %f %s', trade.fee, trade.feeCurrency)
    })

    // Listen for notifications
    ws.onNotification({}, (notification) => {
      debug('\n📢 NOTIFICATION')
      debug('Type: %s', notification.type)
      debug('Status: %s', notification.status)
      debug('Text: %s', notification.text)
    })

    debug('\n✓ Listening for real-time order updates...')
    debug('Keep this running and place/cancel orders to see updates')
    debug('Press Ctrl+C to exit')

    // Keep process alive
    process.on('SIGINT', async () => {
      debug('\nClosing connection...')
      await ws.close()
      process.exit(0)
    })
  } catch (err) {
    debug('Error: %s', err.message)
    if (err.message.includes('authentication')) {
      debug('\nNote: Set API_KEY and API_SECRET environment variables')
      debug('You can copy .env.example to .env and add your credentials there')
    }
    await ws.close()
    process.exit(1)
  }
}

execute()
