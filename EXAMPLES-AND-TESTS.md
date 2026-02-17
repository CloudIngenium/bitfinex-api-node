# Examples and Tests Guide

This document describes the new examples and tests added to the bitfinex-api-node library.

## New Examples

### REST API Examples

#### 1. Order Management (`examples/rest2/order_management.js`)

A comprehensive example demonstrating complete order lifecycle management:

- Fetching current open orders
- Getting account balance
- Retrieving current market prices
- Submitting limit orders
- Updating existing orders
- Cancelling orders
- Viewing order history
- Checking trade history

**Usage:**
```bash
# Set your API credentials
export API_KEY="your_api_key"
export API_SECRET="your_api_secret"

# Run the example
node examples/rest2/order_management.js
```

**Features:**
- Safe order placement (orders placed well below market to avoid execution)
- Detailed logging of all operations
- Error handling with helpful messages
- Balance and wallet information display

### WebSocket Examples

#### 2. Real-time Order Updates (`examples/ws2/realtime_orders.js`)

Monitor order updates, positions, and trades in real-time via WebSocket:

**Listens for:**
- Order snapshots (all open orders on connect)
- New order submissions
- Order updates (partial fills, etc.)
- Order closures/cancellations
- Position updates
- Wallet balance changes
- Trade executions
- System notifications

**Usage:**
```bash
export API_KEY="your_api_key"
export API_SECRET="your_api_secret"

node examples/ws2/realtime_orders.js
```

**Features:**
- Real-time order lifecycle monitoring
- Position tracking with P&L
- Wallet balance updates
- Trade execution notifications
- Graceful shutdown with Ctrl+C

#### 3. Multi-Pair Ticker Monitor (`examples/ws2/multi_ticker_monitor.js`)

Monitor price changes across multiple trading pairs simultaneously:

**Monitors:**
- Real-time price updates for multiple pairs
- Bid/Ask spreads
- 24-hour price changes
- Trading volumes
- Price movement statistics

**Usage:**
```bash
node examples/ws2/multi_ticker_monitor.js
```

**Features:**
- Configurable list of trading pairs
- Real-time price change notifications
- Periodic market summaries (every 30 seconds)
- Manual summary via signal: `kill -SIGUSR1 <pid>`
- Average price change calculations
- No authentication required

## New Tests

### Unit Tests

#### 1. Precision Utilities (`test/lib/util/precision.js`)

Comprehensive tests for number formatting and precision handling:

**Tests:**
- `setSigFig()` - Significant figure formatting
- `setPrecision()` - Decimal precision control
- `prepareAmount()` - Amount formatting (8 decimals)
- `preparePrice()` - Price formatting (5 sig figs)
- Edge cases: infinity, NaN, very large/small numbers
- Financial calculation precision

**Run tests:**
```bash
npm run unit -- test/lib/util/precision.js
```

### Integration Tests

#### 2. REST API Integration (`test/lib/rest2-integration.js`)

Tests real REST API endpoints with actual Bitfinex API:

**Public Endpoints Tested:**
- Platform status
- Ticker data
- Multiple tickers
- Public trades
- Order book
- Historical candles
- Symbol list
- Currency list
- Symbol details

**Authenticated Endpoints Tested:**
- Wallet information
- Active orders
- Order history
- Account trades
- Positions
- Margin information
- API key permissions

**Features:**
- Automatic retry on transient failures
- Graceful handling of API issues
- Skip tests when credentials not available
- Data transformation validation
- Error handling tests

**Run tests:**
```bash
# Run without credentials (public endpoints only)
npm run unit -- test/lib/rest2-integration.js

# Run with credentials (all endpoints)
export API_KEY="your_api_key"
export API_SECRET="your_api_secret"
npm run unit -- test/lib/rest2-integration.js
```

#### 3. WebSocket Integration (`test/lib/ws2-subscriptions-integration.js`)

Tests real WebSocket subscriptions and data flow:

**Tests:**
- Connection lifecycle (open, close, reconnect)
- Ticker subscriptions
- Trade subscriptions
- Order book subscriptions (P0 and R0)
- Candle subscriptions (multiple timeframes)
- Authenticated subscriptions
- Subscription management
- Error handling
- Data transformation

**Features:**
- Real WebSocket connection tests
- Multiple subscription types
- Data validation
- Graceful timeout handling
- Skip authenticated tests without credentials

**Run tests:**
```bash
# Run public subscription tests
npm run unit -- test/lib/ws2-subscriptions-integration.js

# Run with authentication
export API_KEY="your_api_key"
export API_SECRET="your_api_secret"
npm run unit -- test/lib/ws2-subscriptions-integration.js
```

## Running All Tests

```bash
# Install dependencies
npm install

# Run linter
npm run lint

# Fix linting issues automatically
npm run lint:fix

# Run all tests
npm test

# Run only unit tests
npm run unit

# Run tests in watch mode
npm run test:watch
```

## Test Coverage

The new tests improve coverage in the following areas:

1. **Utility Functions**: Number formatting, precision handling
2. **REST API**: Public and authenticated endpoints
3. **WebSocket**: Subscriptions, data flow, error handling
4. **Integration**: Real API connectivity and data validation

## Best Practices

### For Examples:

1. Always use environment variables for credentials
2. Include error handling and helpful messages
3. Add comments explaining each step
4. Demonstrate both public and authenticated endpoints
5. Keep examples focused on specific use cases

### For Tests:

1. Use descriptive test names
2. Include both positive and negative test cases
3. Handle API failures gracefully (retries, skips)
4. Test with both transform enabled and disabled
5. Validate data types and structures
6. Clean up resources (close connections)

## Contributing

When adding new examples or tests:

1. Follow the existing code style (Standard JS)
2. Run `npm run lint:fix` before committing
3. Ensure all tests pass with `npm test`
4. Add documentation for new features
5. Include error handling
6. Test with and without API credentials

## Troubleshooting

### API Connection Issues

If tests fail due to API connectivity:
- Check your internet connection
- Verify API credentials if using authenticated endpoints
- Some tests have built-in retries for transient failures
- Tests may skip if API returns 500 errors

### Rate Limiting

If you encounter rate limiting:
- Reduce the number of simultaneous API calls
- Add delays between requests
- Use authenticated endpoints (higher rate limits)

### WebSocket Connection Issues

If WebSocket tests fail:
- Check firewall settings
- Verify WebSocket connectivity: `ws://api.bitfinex.com/ws/2`
- Increase timeout values if on slow connection
- Check for proxy/VPN interference

## Additional Resources

- [Bitfinex API Documentation](https://docs.bitfinex.com/docs)
- [Project README](README.md)
- [Environment Setup](ENV-SETUP.md)
- [Modernization Summary](MODERNIZATION-SUMMARY.md)
