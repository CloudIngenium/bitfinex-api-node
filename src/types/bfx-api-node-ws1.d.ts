declare module 'bfx-api-node-ws1' {
  import { EventEmitter } from 'events'

  interface WSv1Options {
    apiKey?: string
    apiSecret?: string
    transform?: boolean
    [key: string]: unknown
  }

  class WSv1 extends EventEmitter {
    constructor(opts?: WSv1Options)
    open(): void
    close(): void
    auth(): void
    subscribeTicker(symbol: string): void
    subscribeTrades(symbol: string): void
    subscribeOrderBook(symbol: string): void
  }

  export default WSv1
}
