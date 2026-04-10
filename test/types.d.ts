declare module 'bfx-api-node-models' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const models: {
    TradingTicker: new (...args: any[]) => any
    [key: string]: any
  }
  export default models
}

declare module 'socks-proxy-agent' {
  import { Agent } from 'http'
  export class SocksProxyAgent extends Agent {
    constructor(url: string)
    proxy: { host: string; port: number }
  }
}
