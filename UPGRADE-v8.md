# Upgrading to v8.0.0

This guide covers migrating applications from `bitfinex-api-node` v7.x (CommonJS) to `@jcbit/bitfinex-api-node` v8.0.0 (ESM).

## Prerequisites

- **Node.js >= 22.0.0** (required for CJS interop and native ESM support)
- Your project must use ESM: set `"type": "module"` in your `package.json`, or use `.mjs` file extensions

## 1. Update package name and install

```bash
npm uninstall bitfinex-api-node
npm install @jcbit/bitfinex-api-node
```

The package is published on npm under the `@jcbit` scope.

## 2. Update import syntax

### Default import (most common)

```diff
- const BFX = require('bitfinex-api-node')
+ import BFX from '@jcbit/bitfinex-api-node'
```

### Named imports (new in v8)

v8 adds ESM named exports, enabling tree-shaking and direct imports:

```diff
- const BFX = require('bitfinex-api-node')
- const { RESTv2, WSv2 } = BFX
+ import { RESTv2, WSv2 } from '@jcbit/bitfinex-api-node'
```

Available named exports: `RESTv1`, `RESTv2`, `WSv1`, `WSv2`, `WS2Manager`

### Static class properties still work

For backward compatibility, transport classes are also available as static properties on the default export:

```javascript
import BFX from '@jcbit/bitfinex-api-node'

const rest = new BFX.RESTv2({ apiKey, apiSecret })
```

## 3. REST library changes

The REST transport is now powered by `@jcbit/bfx-api-node-rest@^8.0.0`:

- **ESM-only** (no CommonJS)
- **Native `fetch`** (no more `node-fetch` dependency)
- **`agent` option replaced with `fetch` option** for proxy support (see below)
- All REST API methods and signatures remain the same

## 4. Proxy configuration

### WebSocket proxy (unchanged)

The `agent` option still works for WebSocket connections:

```javascript
import { SocksProxyAgent } from 'socks-proxy-agent'

const agent = new SocksProxyAgent('socks5://localhost:9050')
const bfx = new BFX({ ws: { agent } })
```

### REST proxy (changed in v8)

REST v8 uses native `fetch` instead of `node-fetch`. To proxy REST requests, pass a custom `fetch` function with a `dispatcher`:

```diff
- const rest = new RESTv2({ agent: proxyAgent })
+ const rest = new RESTv2({
+   fetch: (url, init = {}) => fetch(url, { ...init, dispatcher: proxyAgent })
+ })
```

### Combined proxy setup

```javascript
import { SocksProxyAgent } from 'socks-proxy-agent'
import BFX from '@jcbit/bitfinex-api-node'

const agent = new SocksProxyAgent(process.env.SOCKS_PROXY_URL)

const bfx = new BFX({
  apiKey: process.env.API_KEY,
  apiSecret: process.env.API_SECRET,
  ws: { agent },
  rest: {
    fetch: (url, init = {}) => fetch(url, { ...init, dispatcher: agent })
  }
})
```

## 5. CJS dependency interop

If your application directly imports `bfx-api-node-models` or `bfx-api-node-util` (which are still CommonJS), ESM named imports will not work. Use the default import + destructuring pattern:

```diff
- const { Order } = require('bfx-api-node-models')
+ import _bfxModels from 'bfx-api-node-models'
+ const { Order } = _bfxModels

- const { prepareAmount } = require('bfx-api-node-util')
+ import _bfxUtil from 'bfx-api-node-util'
+ const { prepareAmount } = _bfxUtil
```

This is only needed for packages that are still CommonJS. ESM packages (like `@jcbit/bfx-api-node-rest`) support named imports directly.

## 6. Remove `'use strict'`

ESM modules are strict by default. Remove all `'use strict'` directives from your files.

## 7. Add `.js` extensions to relative imports

ESM requires explicit file extensions on relative imports:

```diff
- import { helper } from './utils/helper'
+ import { helper } from './utils/helper.js'
```

Package imports remain bare (no `.js` needed):

```javascript
import BFX from '@jcbit/bitfinex-api-node'  // correct
```

## Complete before/after example

### v7.x (CommonJS)

```javascript
'use strict'

const BFX = require('bitfinex-api-node')

const bfx = new BFX({
  apiKey: process.env.API_KEY,
  apiSecret: process.env.API_SECRET,
  transform: true
})

const ws = bfx.ws(2)

ws.on('open', () => {
  ws.subscribeTicker('tBTCUSD')
  ws.auth()
})

ws.onTicker({ symbol: 'tBTCUSD' }, (ticker) => {
  console.log('Ticker:', ticker)
})

ws.open()
```

### v8.0.0 (ESM)

```javascript
import BFX from '@jcbit/bitfinex-api-node'

const bfx = new BFX({
  apiKey: process.env.API_KEY,
  apiSecret: process.env.API_SECRET,
  transform: true
})

const ws = bfx.ws(2)

ws.on('open', () => {
  ws.subscribeTicker('tBTCUSD')
  ws.auth()
})

ws.onTicker({ symbol: 'tBTCUSD' }, (ticker) => {
  console.log('Ticker:', ticker)
})

ws.open()
```

The API surface is identical. The only changes are the import syntax and the removal of `'use strict'`.

## Breaking changes summary

| Change | v7.x | v8.0.0 |
|--------|------|--------|
| Module system | CommonJS | ESM (`"type": "module"`) |
| Node.js | >= 12 | >= 22.0.0 |
| Package name | `bitfinex-api-node` | `@jcbit/bitfinex-api-node` |
| REST dependency | `bfx-api-node-rest` | `@jcbit/bfx-api-node-rest` |
| REST fetch | `node-fetch` | Native `fetch` |
| REST proxy | `agent` option | `fetch` option with `dispatcher` |
| Named exports | Not available | `import { WSv2 } from '...'` |
