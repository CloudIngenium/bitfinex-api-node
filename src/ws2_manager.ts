import { EventEmitter } from 'events'
import { debuglog } from 'node:util'
import PromiseThrottleModule from 'promise-throttle'

// Handle both ESM default export and CJS interop
const PromiseThrottle = (PromiseThrottleModule as any).default || PromiseThrottleModule
import deepEqual from './util/deep_equal.js'
import WSv2 from './transports/ws2.js'

const debug = debuglog('bfx_ws2_manager')

const DATA_CHANNEL_LIMIT = 30
const reconnectThrottler = new PromiseThrottle({
  requestsPerSecond: 10 / 60.0,
  promiseImplementation: Promise
})

interface SocketState {
  pendingSubscriptions: Array<[string, Record<string, any>]>
  pendingUnsubscriptions: string[]
  ws: WSv2
}

/**
 * Provides a wrapper around the WSv2 class, opening new sockets when a
 * subscription would push a single socket over the data channel limit.
 */
class WS2Manager extends EventEmitter {
  private _authArgs: { calc: number; dms: number; apiKey?: string; apiSecret?: string }
  private _sockets: SocketState[]
  private _socketArgs: any

  constructor(socketArgs?: any, authArgs: { calc?: number; dms?: number } = { calc: 0, dms: 0 }) {
    super()

    this.setMaxListeners(1000)

    this._authArgs = { calc: 0, dms: 0, ...authArgs }
    this._sockets = []
    this._socketArgs = {
      ...(socketArgs || {}),
      reconnectThrottler
    }
  }

  setAuthArgs(args: Partial<WS2Manager['_authArgs']> = {}): void {
    this._authArgs = {
      ...this._authArgs,
      ...args
    }

    this._sockets.forEach(socket => socket.ws.updateAuthArgs(this._authArgs))
  }

  getAuthArgs(): WS2Manager['_authArgs'] {
    return this._authArgs
  }

  async reconnect(): Promise<void[]> {
    return Promise.all(this._sockets.map(socket => socket.ws.reconnect()))
  }

  async close(): Promise<void> {
    await Promise.all(this._sockets.map(socket => {
      if (typeof socket.ws.removeAllListeners === 'function') {
        socket.ws.removeAllListeners()
      }
      return socket.ws.close()
    }))

    this._sockets = []
  }

  static getDataChannelCount(s: SocketState): number {
    let count = s.ws.getDataChannelCount()
    count += s.pendingSubscriptions.length
    count -= s.pendingUnsubscriptions.length
    return count
  }

  getNumSockets(): number {
    return this._sockets.length
  }

  getSocket(i: number): SocketState {
    return this._sockets[i]
  }

  getSocketInfo(): Array<{ nChannels: number }> {
    return this._sockets.map(s => ({
      nChannels: WS2Manager.getDataChannelCount(s)
    }))
  }

  auth({ apiKey, apiSecret, calc, dms }: { apiKey?: string; apiSecret?: string; calc?: number; dms?: number } = {}): void {
    if (this._socketArgs.apiKey || this._socketArgs.apiSecret) {
      debug('error: auth credentials already provided! refusing auth')
      return
    }

    this._socketArgs.apiKey = apiKey
    this._socketArgs.apiSecret = apiSecret

    if (Number.isFinite(calc)) this._authArgs.calc = calc!
    if (Number.isFinite(dms)) this._authArgs.dms = dms!
    if (apiKey) this._authArgs.apiKey = apiKey
    if (apiSecret) this._authArgs.apiSecret = apiSecret

    this._sockets.forEach(s => {
      if (!s.ws.isAuthenticated()) {
        s.ws.updateAuthArgs(this._authArgs)
        s.ws.auth().catch((err: Error) => {
          debug('error authenticating socket: %s', err.message)
          this.emit('error', err, s.ws)
        })
      }
    })
  }

  openSocket(): SocketState {
    const { apiKey, apiSecret } = this._socketArgs
    const ws = new WSv2(this._socketArgs)
    const wsState: SocketState = {
      pendingSubscriptions: [],
      pendingUnsubscriptions: [],
      ws
    }

    ws.updateAuthArgs(this._authArgs)
    ws.on('open', () => this.emit('open', ws))
    ws.on('message', (msg: any = {}) => this.emit('message', msg, ws))
    ws.on('error', (error: Error) => this.emit('error', error, ws))
    ws.on('auth', () => this.emit('auth', ws))
    ws.on('close', () => {
      this.emit('close', ws)

      wsState.pendingSubscriptions = []
      wsState.pendingUnsubscriptions = []

      const idx = this._sockets.indexOf(wsState)
      if (idx !== -1) {
        this._sockets.splice(idx, 1)
      }
    })
    ws.on('subscribed', (msg: any = {}) => {
      this.emit('subscribed', msg)

      const i = wsState.pendingSubscriptions.findIndex(sub => {
        const subFilter = sub[1]
        const filterKeys = Object.keys(subFilter)
        const fv: Record<string, any> = {}
        for (const k of filterKeys) {
          fv[k] = msg[k]
        }

        return (
          (sub[0] === msg.channel) &&
          deepEqual(fv, subFilter)
        )
      })

      if (i === -1) {
        debug('error removing pending sub: %j', msg)
        return
      }

      wsState.pendingSubscriptions.splice(i, 1)
    })

    ws.on('unsubscribed', (msg: any = {}) => {
      this.emit('unsubscribed', msg)

      const { chanId } = msg
      const i = wsState.pendingUnsubscriptions.findIndex(cid => (
        cid === `${chanId}`
      ))

      if (i === -1) {
        debug('error removing pending unsub: %j', msg)
        return
      }

      wsState.pendingUnsubscriptions.splice(i, 1)
    })

    if (apiKey && apiSecret) {
      ws.once('open', () => {
        debug('authenticating socket...')

        ws.auth().then(() => {
          return debug('socket authenticated')
        }).catch((err: Error) => {
          debug('error authenticating socket: %s', err.message)
        })
      })
    }

    ws.open().then(() => {
      return debug('socket connection opened')
    }).catch((err: Error) => {
      debug('error opening socket: %s', err.stack)
      this.emit('error', err, ws)
    })

    this._sockets.push(wsState)
    return wsState
  }

  getAuthenticatedSocket(): SocketState | undefined {
    return this._sockets.find(s => s.ws.isAuthenticated())
  }

  getFreeDataSocket(): SocketState | undefined {
    return this._sockets.find(s => (
      WS2Manager.getDataChannelCount(s) < DATA_CHANNEL_LIMIT
    ))
  }

  getSocketWithDataChannel(type: string, filter: Record<string, any>): SocketState | undefined {
    return this._sockets.find(s => {
      const subI = s.pendingSubscriptions.findIndex(sub => (
        sub[0] === type && deepEqual(sub[1], filter)
      ))

      if (subI !== -1) {
        return true
      }

      const cid = s.ws.getDataChannelId(type, filter)

      if (!cid) {
        return false
      }

      return cid && !s.pendingUnsubscriptions.some(id => `${id}` === `${cid}`)
    })
  }

  getSocketWithChannel(chanId: number | string): SocketState | undefined {
    const chanIdStr = `${chanId}`
    return this._sockets.find(s => {
      return (
        s.ws.hasChannel(chanId) &&
        !s.pendingUnsubscriptions.some(id => `${id}` === chanIdStr)
      )
    })
  }

  getSocketWithSubRef(channel: string, identifier: string): SocketState | undefined {
    return this._sockets.find(s => s.ws.hasSubscriptionRef(channel, identifier))
  }

  withAllSockets(cb: (state: SocketState) => void): void {
    this._sockets.forEach((ws2) => {
      cb(ws2)
    })
  }

  subscribe(type: string, ident: string, filter: Record<string, any>): void {
    let s = this.getFreeDataSocket()
    if (!s) {
      s = this.openSocket()
    }

    const doSub = () => {
      s!.ws.managedSubscribe(type, ident, filter)
    }

    if (!s.ws.isOpen()) {
      s.ws.once('open', doSub)
    } else {
      doSub()
    }

    s.pendingSubscriptions.push([type, filter])
  }

  managedUnsubscribe(channel: string, identifier: string): void {
    const s = this.getSocketWithSubRef(channel, identifier)

    if (!s) {
      debug('cannot unsub from unknown channel %s: %s', channel, identifier)
      return
    }

    const chanId = s.ws._chanIdByIdentifier(channel, identifier)
    s.ws.managedUnsubscribe(channel, identifier)
    s.pendingUnsubscriptions.push(`${chanId}`)
  }

  unsubscribe(chanId: number | string): void {
    const s = this.getSocketWithChannel(chanId)

    if (!s) {
      debug('cannot unsub from unknown channel: %d', chanId)
      return
    }

    s.ws.unsubscribe(chanId)
    s.pendingUnsubscriptions.push(`${chanId}`)
  }

  subscribeTicker(symbol: string): void {
    this.subscribe('ticker', symbol, { symbol })
  }

  subscribeTrades(symbol: string): void {
    this.subscribe('trades', symbol, { symbol })
  }

  subscribeOrderBook(symbol: string, prec: string = 'P0', len: string = '25', freq: string = 'F0'): void {
    const filter: Record<string, any> = {}

    if (symbol) filter.symbol = symbol
    if (prec) filter.prec = prec
    if (len) filter.len = len
    if (freq) filter.freq = freq

    this.subscribe('book', symbol, filter)
  }

  subscribeCandles(key: string): void {
    this.subscribe('candles', key, { key })
  }

  onCandle({ key, cbGID }: { key: string; cbGID?: string | number }, cb: (...args: any[]) => void): void {
    const s = this.getSocketWithDataChannel('candles', { key })

    if (!s) {
      throw new Error('no data socket available; did you provide a key?')
    }

    s.ws.onCandle({ key, cbGID }, cb)
  }

  onOrderBook({ symbol, prec = 'P0', len = '25', freq = 'F0', cbGID }: { symbol?: string; prec?: string; len?: string; freq?: string; cbGID?: string | number }, cb: (...args: any[]) => void): void {
    const filter: Record<string, any> = {}

    if (symbol) filter.symbol = symbol
    if (prec) filter.prec = prec
    if (len) filter.len = len
    if (freq) filter.freq = freq

    const s = this.getSocketWithDataChannel('book', filter)

    if (!s) {
      throw new Error('no data socket available; did you provide a symbol?')
    }

    s.ws.onOrderBook({ cbGID, ...filter }, cb)
  }

  onTrades({ symbol, cbGID }: { symbol?: string; cbGID?: string | number }, cb: (...args: any[]) => void): void {
    const s = this.getSocketWithDataChannel('trades', { symbol })

    if (!s) {
      throw new Error('no data socket available; did you provide a symbol?')
    }

    s.ws.onTrades({ symbol, cbGID }, cb)
  }

  onTicker({ symbol = '', cbGID }: { symbol?: string; cbGID?: string | number } = {}, cb: (...args: any[]) => void): void {
    const s = this.getSocketWithDataChannel('ticker', { symbol })

    if (!s) {
      throw new Error('no data socket available; did you provide a symbol?')
    }

    s.ws.onTicker({ symbol, cbGID }, cb)
  }
}

export default WS2Manager
