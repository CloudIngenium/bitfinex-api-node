# @jcbit/bitfinex-api-node

Modernized fork of the official Bitfinex API Node.js library. Full TypeScript rewrite with ESM, Node.js 24+, and enhanced resilience.

[![CI](https://github.com/CloudIngenium/bitfinex-api-node/actions/workflows/ci.yml/badge.svg)](https://github.com/CloudIngenium/bitfinex-api-node/actions/workflows/ci.yml)

## Installation

```bash
# Configure npm to use GitHub Package Registry for @jcbit scope
echo "@jcbit:registry=https://npm.pkg.github.com" >> ~/.npmrc

npm install @jcbit/bitfinex-api-node
```

### Requirements

- Node.js >= 24.0.0
- npm >= 10.0.0

## Quick Start

```typescript
import BFX from '@jcbit/bitfinex-api-node'

// REST API
const bfx = new BFX({
  apiKey: process.env.API_KEY,
  apiSecret: process.env.API_SECRET,
  transform: true,
})

const rest = bfx.rest(2)
const ticker = await rest.ticker('tBTCUSD')
console.log('BTC/USD:', ticker)

// WebSocket API
const ws = bfx.ws(2)

ws.on('open', () => {
  ws.subscribeTicker('tBTCUSD')
})

ws.onTicker({ symbol: 'tBTCUSD' }, (ticker) => {
  console.log('Ticker update:', ticker)
})

ws.open()
```

## Configuration

Create a `.env` file in your project root:

```bash
cp .env.example .env
# Edit with your credentials
```

## Scripts

```bash
npm run build         # Compile TypeScript (cleans dist/ first)
npm test              # Build + lint + unit tests
npm run unit          # Unit tests only
npm run coverage      # Unit tests with coverage report
npm run coverage:check # Verify coverage thresholds (90%/85%)
npm run lint          # ESLint check
npm run lint:fix      # ESLint auto-fix
```

## Differences from Original

| Feature | Original | This Fork |
|---------|----------|-----------|
| Language | JavaScript | TypeScript (full rewrite) |
| Module system | CommonJS | ESM-only |
| Node.js | >= 16 | >= 24 |
| ws library | v7 (broken) | v8+ (fixed) |
| Tests | Basic | 490 tests, 90%+ coverage |
| REST client | Built-in | `@cloudingenium/bfx-api-node-rest` |

## API Reference

100% API-compatible with the original Bitfinex library:

- **REST:** Account management, market data, trading operations, funding
- **WebSocket:** Real-time market data, account updates, order management

See the [official Bitfinex docs](https://docs.bitfinex.com/docs) for endpoint details.

## License

MIT License - see [LICENSE.md](LICENSE.md)

## Credits

- **Original Library:** [Bitfinex Team](https://github.com/bitfinexcom/bitfinex-api-node)
- **Fork:** [CloudIngenium](https://github.com/CloudIngenium/bitfinex-api-node)
