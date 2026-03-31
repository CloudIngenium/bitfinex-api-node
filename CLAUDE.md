# CLAUDE.md — bitfinex-api-node

## Project Purpose

CloudIngenium modernized fork of the official Bitfinex API client for Node.js. Published as `@jcbit/bitfinex-api-node` exclusively to GitHub Packages. Provides both REST and WebSocket interfaces. Used by BfxPingPongBot (via `file:` protocol) and BfxLendingBot (via dashboard backend).

## Stack

- **Language:** TypeScript 5.9 (ESM-only)
- **Runtime:** Node.js >= 24, npm >= 10
- **Build:** `tsc` (output to `dist/`)
- **Test:** Mocha + c8 (coverage thresholds: 90% lines/functions, 85% branches)
- **Lint:** ESLint 9 + typescript-eslint
- **WebSocket:** `ws` v8+

## Build & Dev

```bash
npm ci                # Install dependencies
npm run build         # Compile TypeScript (runs clean first)
npm test              # Build + lint + unit tests
npm run unit          # Unit tests only
npm run coverage      # Unit tests with coverage report
npm run coverage:check # Verify coverage thresholds
npm run lint          # ESLint check
npm run lint:fix      # ESLint auto-fix
```

## Publishing

Published exclusively to GitHub Packages (`@jcbit` scope). Automated via CI on tag push:

```bash
git tag v9.1.0 && git push origin v9.1.0   # Triggers publish.yml
```

Manual publish (if needed):
```bash
npm publish   # Uses publishConfig → GitHub Packages
```

## Structure

```
src/
  index.ts              # Package entry — exports BFX client class
  ws2_manager.ts        # WebSocket v2 manager
  transports/
    ws2.ts              # WebSocket v2 transport implementation
  types/                # Type declarations for untyped dependencies
    bfx-api-node-models.d.ts
    bfx-api-node-util.d.ts
    bfx-api-node-ws1.d.ts
  util/                 # Internal utilities
    deep_equal.ts
    is_class.ts
    is_snapshot.ts
    precision.ts
    throttle.ts
    ws2.ts              # WS2 helpers
test/                   # Mocha test suites
examples/               # REST and WebSocket usage examples
```

## Key Dependencies

- `@cloudingenium/bfx-api-node-rest` — REST API client (CloudIngenium fork)
- `bfx-api-node-models` — Bitfinex data model classes
- `bfx-api-node-util` — Shared utilities
- `bfx-api-node-ws1` — Legacy WebSocket v1 transport
- `ws` — WebSocket client
- `bignumber.js` — Precision arithmetic
- `lossless-json` — JSON parsing without float precision loss
- `promise-throttle` — Rate limiting for API calls

## Conventions

- 100% API-compatible with upstream `bitfinex-api-node`
- WebSocket v2 is the primary transport; v1 is legacy
- Never hardcode API keys — use environment variables or `.env` files
- `transform: true` returns model instances instead of raw arrays
- Rate limiting: 90 req/5min on private REST endpoints
