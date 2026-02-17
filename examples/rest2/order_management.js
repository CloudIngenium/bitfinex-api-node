'use strict'

const { RESTv2 } = require('../../index')
const { debug } = require('../util/setup')

/**
 * Complete order management example
 * Demonstrates: creating, updating, cancelling orders and checking status
 */
async function execute () {
  const rest = new RESTv2({
    apiKey: process.env.API_KEY,
    apiSecret: process.env.API_SECRET,
    transform: true
  })

  const symbol = 'tBTCUSD'
  // const amount = 0.001 // Small test amount (uncomment when needed)

  try {
    // 1. Get current open orders
    debug('Fetching current open orders...')
    const openOrders = await rest.activeOrders()
    debug('Current open orders: %d', openOrders.length)

    if (openOrders.length > 0) {
      debug('Sample order: %o', openOrders[0])
    }

    // 2. Get account balance
    debug('\nFetching wallets...')
    const wallets = await rest.wallets()
    debug('Available wallets: %d', wallets.length)

    const tradingWallet = wallets.find(w => w.type === 'exchange' && w.currency === 'USD')
    if (tradingWallet) {
      debug('Trading wallet balance (USD): %f', tradingWallet.balance)
    }

    // 3. Get current ticker for price reference
    debug('\nFetching current %s ticker...', symbol)
    const ticker = await rest.ticker(symbol)
    debug('Current price: %f', ticker.lastPrice)
    debug('Bid: %f, Ask: %f', ticker.bid, ticker.ask)

    // 4. Example: Submit a limit buy order (well below market price to avoid execution)
    const safePrice = ticker.bid * 0.5 // 50% below current bid (won't execute)

    debug('\nExample order submission (limit buy at %f):', safePrice)
    debug('NOTE: This is just an example. Uncomment to actually place order.')

    /*
    const newOrder = await rest.submitOrder({
      type: 'EXCHANGE LIMIT',
      symbol: symbol,
      amount: amount,
      price: safePrice
    })

    debug('Order submitted successfully!')
    debug('Order ID: %d', newOrder.id)
    debug('Status: %s', newOrder.status)

    // 5. Update the order
    debug('\nUpdating order price...')
    const updatedOrder = await rest.updateOrder({
      id: newOrder.id,
      price: safePrice * 0.95
    })
    debug('Order updated! New price: %f', updatedOrder.price)

    // 6. Cancel the order
    debug('\nCancelling order...')
    await rest.cancelOrder(newOrder.id)
    debug('Order cancelled successfully!')
    */

    // 7. Get order history
    debug('\nFetching order history...')
    const orderHistory = await rest.orderHistory(symbol, undefined, undefined, 10)
    debug('Historical orders found: %d', orderHistory.length)

    if (orderHistory.length > 0) {
      const lastOrder = orderHistory[0]
      debug('Last order: ID=%d, Type=%s, Amount=%f, Price=%f, Status=%s',
        lastOrder.id, lastOrder.type, lastOrder.amount, lastOrder.price, lastOrder.status)
    }

    // 8. Get recent trades
    debug('\nFetching trade history...')
    const trades = await rest.trades(symbol, undefined, undefined, 5)
    debug('Recent trades: %d', trades.length)

    if (trades.length > 0) {
      const lastTrade = trades[0]
      debug('Last trade: ID=%d, Amount=%f, Price=%f',
        lastTrade.id, lastTrade.execAmount, lastTrade.execPrice)
    }

    debug('\n✓ Order management example completed successfully!')
  } catch (err) {
    debug('Error: %s', err.message)
    if (err.message.includes('apikey')) {
      debug('\nNote: Set API_KEY and API_SECRET environment variables to test authenticated endpoints')
      debug('You can copy .env.example to .env and add your credentials there')
    }
  }
}

execute()
