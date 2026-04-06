# Copilot Instructions - Bitfinex API Node

> **Primary reference:** Read the repo's `CLAUDE.md` first — it is the single source of truth. This file provides supplementary Copilot-specific context.


## Architecture Overview

This is a **modernized fork** of the official Bitfinex API Node.js library providing REST and WebSocket APIs for the Bitfinex exchange. The library uses a **facade pattern** with the main `BFX` class providing unified access to:

- **REST APIs**: v1 and v2 via external `bfx-api-node-rest` package
- **WebSocket APIs**: v1 via `bfx-api-node-ws1`, v2 via internal `lib/transports/ws2.js`
- **Socket Management**: `WS2Manager` for handling multiple WebSocket connections

## Key Components

### Main Entry Point

- `index.js` - BFX facade class with transport caching and configuration
- Uses **caching pattern**: `_transportCache` stores REST/WS instances by version and options

### WebSocket Architecture

- **`lib/transports/ws2.js`** - Core WebSocket v2 transport (2800+ lines)
- **`lib/ws2_manager.js`** - Socket pool manager with 30-channel limit per socket
- **Automatic socket pooling**: Opens new sockets when exceeding `DATA_CHANNEL_LIMIT = 30`
- **Connection throttling**: Uses `PromiseThrottle` at 10 requests per 60 seconds

### Socket Manager Patterns

```javascript
// Manager automatically handles socket pooling
const manager = new WS2Manager(socketArgs, authArgs);
manager.subscribeTicker("tBTCUSD"); // Finds free socket or creates new one
manager.onTicker({ symbol: "tBTCUSD" }, callback);
```

### State Management

- **Pending subscriptions tracking**: `pendingSubscriptions` array per socket
- **Pending unsubscriptions**: `pendingUnsubscriptions` for cleanup
- **Channel limits**: Monitors active channels via `getDataChannelCount()`

## Development Workflow

### Environment Setup

- **Node.js 20+** required (critical - legacy versions have ws compatibility issues)
- Use `.env` file for configuration: `cp .env.example .env`
- **Debug pattern**: Set `DEBUG=bfx:*` for comprehensive logging

### Essential Commands

```bash
npm run dev          # Start examples with nodemon
npm run test:watch   # Live test watching
npm run lint:fix     # Auto-fix StandardJS issues
npm run docs:serve   # Documentation at localhost:8080
npm run fresh-install # Clean reinstall (fixes dependency issues)
```

### Testing Strategy

- **228 unit tests** - all must pass before changes
- **Example-driven testing**: `examples/` directory serves as integration tests
- **Public examples**: No credentials needed (symbols, tickers, trades)
- **Authenticated examples**: Require API keys in `.env`

## Critical Patterns

### WebSocket Subscription Management

```javascript
// Use WS2Manager for high-volume subscriptions
const manager = new WS2Manager({ apiKey, apiSecret });
manager.subscribeTicker("tBTCUSD"); // Auto-routes to free socket
manager.subscribeOrderBook("tBTCUSD"); // May open new socket if at limit
manager.onTicker({ symbol: "tBTCUSD" }, handleTicker);
```

### Error Handling Conventions

- **Debug-first**: All components use `debug('bfx:component:event')` pattern
- **Event-driven errors**: Components emit 'error' events, don't throw
- **Connection resilience**: Built-in reconnection with exponential backoff

### Configuration Patterns

- **Transport args**: Passed down through BFX → REST/WS constructors
- **Auth caching**: Credentials stored in BFX instance, reused for all transports
- **Feature flags**: WSv2 supports flags like `DEC_S`, `CHECKSUM`, `SEQ_ALL`

## External Dependencies

### Critical Dependencies

- **`ws` v8+**: WebSocket library (v7 has breaking Buffer incompatibility)
- **`bfx-api-node-*`**: External packages for models, REST, WS1, utilities
- **`lodash`**: Extensively used for data manipulation (prefer specific imports)
- **`debug`**: Hierarchical logging with `bfx:*` namespace

### Authentication

```javascript
// Bitfinex-specific auth: API key + secret + timestamp + nonce
const payload = "AUTH" + nonce + apiKey + apiSecret;
const signature = crypto
  .createHmac("sha384", apiSecret)
  .update(payload)
  .digest("hex");
```

## Performance Considerations

### WebSocket Limits

- **30 channels per socket maximum** - WS2Manager enforces this
- **Rate limiting**: 10 reconnections per 60 seconds via `PromiseThrottle`
- **Memory management**: EventEmitter with `setMaxListeners(1000)`

### Connection Management

- **Socket pooling**: Automatic based on channel count
- **Pending state tracking**: Prevents duplicate subscriptions
- **Graceful cleanup**: Proper unsubscription handling

## Testing & Debugging

### Debug Categories

```bash
DEBUG=bfx:ws2:manager    # Socket pool management
DEBUG=bfx:ws2           # WebSocket transport
DEBUG=bfx:examples:*    # Example scripts
```

### Common Issues

- **ws version conflicts**: Ensure ws v8+ for Buffer compatibility
- **Rate limiting**: Monitor reconnection throttling
- **Channel limits**: Check socket pool status with `getSocketInfo()`
- **Authentication**: Verify API key/secret format and permissions

### Example-First Development

- Always test changes with relevant `examples/` scripts
- Public examples for market data, authenticated for trading
- Use `examples/util/setup.js` for consistent configuration patterns

This modernized fork maintains 100% API compatibility while fixing critical dependency issues and enhancing development experience.
