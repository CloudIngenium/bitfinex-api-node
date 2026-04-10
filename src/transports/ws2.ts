import { EventEmitter } from 'events'
import { debuglog } from 'node:util'
import WebSocket from 'ws'
import _bfxUtil from 'bfx-api-node-util'
import * as LosslessJSON from 'lossless-json'
import {
  BalanceInfo, FundingCredit, FundingInfo, FundingLoan, FundingOffer,
  FundingTrade, MarginInfo, Notification, Order, Position, Trade,
  PublicTrade, Wallet, OrderBook, Candle, TradingTicker, FundingTicker
} from '@cloudingenium/bfx-api-node-models'
import getMessagePayload from '../util/ws2.js'
import throttle from '../util/throttle.js'

const { genAuthSig, nonce } = _bfxUtil

const debug = debuglog('bfx_ws2')

const DATA_CHANNEL_TYPES = ['ticker', 'book', 'candles', 'trades']
const UCM_NOTIFICATION_TYPE = 'ucm-notify-ui'
const MAX_CALC_OPS = 8

interface PromiseThrottler {
  add: (fn: () => Promise<any>) => Promise<any>
}

interface WSv2Options {
  affCode?: string | null
  apiKey?: string
  apiSecret?: string
  url?: string
  orderOpBufferDelay?: number
  transform?: boolean
  agent?: any
  manageOrderBooks?: boolean
  manageCandles?: boolean
  seqAudit?: boolean
  autoReconnect?: boolean
  reconnectDelay?: number
  reconnectThrottler?: PromiseThrottler
  packetWDDelay?: number
}

interface ListenerEntry {
  cb: (...args: any[]) => void
  modelClass: any
  filter: Record<string, any> | null
}

type ListenerGroup = Record<string, ListenerEntry[]>

interface ChannelData {
  channel: string
  chanId?: number
  symbol?: string
  pair?: string
  key?: string
  prec?: string
  len?: string
  freq?: string
  [key: string]: any
}

type ExtendedMessage = any[] & { filterOverride?: any[] }

/**
 * Simple callback queue replacing cbq package.
 * Maps string keys to arrays of callbacks, triggers them once.
 */
class CallbackQueue {
  q: Map<string, Array<(err: Error | null, res?: any) => void>> = new Map()

  push(key: string, cb: (err: Error | null, res?: any) => void): void {
    if (!this.q.has(key)) {
      this.q.set(key, [])
    }
    this.q.get(key)!.push(cb)
  }

  trigger(key: string, err: Error | null, res?: any): void {
    const cbs = this.q.get(key)
    if (!cbs) return
    this.q.delete(key)
    for (const cb of cbs) {
      cb(err, res)
    }
  }
}

/**
 * Communicates with v2 of the Bitfinex WebSocket API
 */
class WSv2 extends EventEmitter {
  static flags = {
    DEC_S: 8,
    TIME_S: 32,
    TIMESTAMP: 32768,
    SEQ_ALL: 65536,
    CHECKSUM: 131072
  }

  static info = {
    SERVER_RESTART: 20051,
    MAINTENANCE_START: 20060,
    MAINTENANCE_END: 20061
  }

  static url = 'wss://api.bitfinex.com/ws/2'

  private _affCode: string | undefined
  private _agent: any
  private _url: string
  private _transform: boolean
  private _orderOpBufferDelay: number
  private _orderOpBuffer: any[]
  private _orderOpTimeout: ReturnType<typeof setTimeout> | null
  private _seqAudit: boolean
  private _autoReconnect: boolean
  private _reconnectDelay: number
  private _reconnectThrottler: PromiseThrottler | undefined
  private _manageOrderBooks: boolean
  private _manageCandles: boolean
  private _packetWDDelay: number | undefined
  private _packetWDTimeout: ReturnType<typeof setTimeout> | null
  private _packetWDLastTS: number
  private _orderBooks: Record<string, any>
  private _losslessOrderBooks: Record<string, any>
  private _candles: Record<string, any[]>
  private _authArgs: { apiKey?: string; apiSecret?: string; calc?: number; dms?: number }
  private _listeners: Record<string, ListenerGroup>
  private _infoListeners: Record<number, Array<(msg: any) => void>>
  private _subscriptionRefs: Record<string, number>
  private _channelMap: Record<string | number, ChannelData>
  private _enabledFlags: number
  private _eventCallbacks: CallbackQueue
  private _isAuthenticated: boolean
  private _authOnReconnect: boolean
  private _lastPubSeq: number
  private _lastAuthSeq: number
  private _isOpen: boolean
  private _ws: WebSocket | null
  private _isClosing: boolean
  private _isReconnecting: boolean
  private _prevChannelMap: Record<string | number, ChannelData>

  private _onWSOpen: () => void
  private _onWSClose: () => Promise<void>
  private _onWSError: (err: Error) => void
  private _onWSMessage: (rawMsg: WebSocket.Data, flags: any) => void
  private _triggerPacketWD: () => Promise<void>
  _sendCalc: (...args: any[]) => void

  constructor(opts: WSv2Options = {}) {
    super()

    this.setMaxListeners(1000)
    this._affCode = opts.affCode ?? undefined
    this._agent = opts.agent
    this._url = opts.url || WSv2.url
    this._transform = opts.transform === true
    this._orderOpBufferDelay = opts.orderOpBufferDelay || -1
    this._orderOpBuffer = []
    this._orderOpTimeout = null
    this._seqAudit = opts.seqAudit === true
    this._autoReconnect = opts.autoReconnect === true
    this._reconnectDelay = opts.reconnectDelay || 1000
    this._reconnectThrottler = opts.reconnectThrottler
    this._manageOrderBooks = opts.manageOrderBooks === true
    this._manageCandles = opts.manageCandles === true
    this._packetWDDelay = opts.packetWDDelay
    this._packetWDTimeout = null
    this._packetWDLastTS = 0
    this._orderBooks = {}
    this._losslessOrderBooks = {}
    this._candles = {}
    this._authArgs = {
      apiKey: opts.apiKey,
      apiSecret: opts.apiSecret
    }

    this._listeners = {}
    this._infoListeners = {}
    this._subscriptionRefs = {}
    this._channelMap = {}
    this._enabledFlags = this._seqAudit ? WSv2.flags.SEQ_ALL : 0
    this._eventCallbacks = new CallbackQueue()
    this._isAuthenticated = false
    this._authOnReconnect = false
    this._lastPubSeq = -1
    this._lastAuthSeq = -1
    this._isOpen = false
    this._ws = null
    this._isClosing = false
    this._isReconnecting = false
    this._prevChannelMap = {}

    this._onWSOpen = this._onWSOpenHandler.bind(this)
    this._onWSClose = this._onWSCloseHandler.bind(this)
    this._onWSError = this._onWSErrorHandler.bind(this)
    this._onWSMessage = this._onWSMessageHandler.bind(this)
    this._triggerPacketWD = this._triggerPacketWDHandler.bind(this)
    this._sendCalc = throttle(this._sendCalcImpl.bind(this), 1000 / MAX_CALC_OPS)
  }

  getURL(): string {
    return this._url
  }

  usesAgent(): boolean {
    return !!this._agent
  }

  updateAuthArgs(args: Partial<WSv2['_authArgs']> = {}): void {
    this._authArgs = {
      ...this._authArgs,
      ...args
    }
  }

  getAuthArgs(): WSv2['_authArgs'] {
    return this._authArgs
  }

  getDataChannelCount(): number {
    return Object
      .values(this._channelMap)
      .filter(c => DATA_CHANNEL_TYPES.includes(c.channel))
      .length
  }

  hasChannel(chanId: number | string): boolean {
    return !!this._channelMap[chanId]
  }

  hasSubscriptionRef(channel: string, identifier: string): boolean {
    return `${channel}:${identifier}` in this._subscriptionRefs
  }

  getDataChannelId(type: string, filter: Record<string, any>): string | undefined {
    const filterKeys = Object.keys(filter)
    return Object
      .keys(this._channelMap)
      .find(cid => {
        const c = this._channelMap[cid]
        if (c.channel !== type) return false
        for (const k of filterKeys) {
          if (c[k] !== filter[k]) return false
        }
        return true
      })
  }

  hasDataChannel(type: string, filter: Record<string, any>): boolean {
    return !!this.getDataChannelId(type, filter)
  }

  async open(): Promise<void> {
    if (this._isOpen || this._ws !== null) {
      throw new Error('already open')
    }

    debug('connecting to %s...', this._url)

    try {
      this._ws = new WebSocket(this._url, {
        agent: this._agent
      })
    } catch (err) {
      this._ws = null
      throw err
    }

    this._subscriptionRefs = {}
    this._candles = {}
    this._orderBooks = {}

    this._ws.on('message', this._onWSMessage)
    this._ws.on('error', this._onWSError)
    this._ws.on('close', this._onWSClose)

    return new Promise<void>((resolve, reject) => {
      this._ws!.once('open', () => {
        this._onWSOpen()

        if (this._enabledFlags !== 0) {
          this.sendEnabledFlags()
        }

        debug('connected')
        resolve()
      })

      this._ws!.once('error', (err: Error) => {
        if (!this._isOpen) {
          reject(err)
        }
      })
    })
  }

  async close(code?: number, reason?: string): Promise<void> {
    if (!this._isOpen || this._ws === null) {
      throw new Error('not open')
    }

    debug('disconnecting...')

    if (this._orderOpTimeout !== null) {
      clearTimeout(this._orderOpTimeout)
      this._orderOpTimeout = null
    }

    this._orderOpBuffer = []

    if (this._packetWDTimeout !== null) {
      clearTimeout(this._packetWDTimeout)
      this._packetWDTimeout = null
    }

    return new Promise<void>((resolve) => {
      this._ws!.once('close', () => {
        this._isOpen = false
        this._ws = null

        debug('disconnected')
        resolve()
      })

      if (!this._isClosing) {
        this._isClosing = true
        this._ws!.close(code, reason)
      }
    })
  }

  async auth(calc?: number, dms?: number): Promise<void> {
    this._authOnReconnect = true
    if (!this._isOpen) {
      throw new Error('not open')
    }

    if (this._isAuthenticated) {
      throw new Error('already authenticated')
    }

    const authNonce = nonce()
    const authPayload = `AUTH${authNonce}${authNonce}`
    const { sig } = genAuthSig(this._authArgs.apiSecret, authPayload)
    const authArgs = { ...this._authArgs }

    if (Number.isFinite(calc)) (authArgs as any).calc = calc
    if (Number.isFinite(dms)) (authArgs as any).dms = dms

    return new Promise<void>((resolve) => {
      this.once('auth', () => {
        debug('authenticated')
        resolve()
      })

      this.send({
        event: 'auth',
        apiKey: this._authArgs.apiKey,
        authSig: sig,
        authPayload,
        authNonce,
        ...authArgs
      })
    })
  }

  async reconnect(): Promise<void> {
    if (this._isReconnecting) {
      debug('reconnect already in progress, skipping')
      return
    }

    this._isReconnecting = true

    if (this._ws !== null && this._isOpen) {
      await this.close()

      return new Promise<void>((resolve) => {
        this.once(this._authOnReconnect ? 'auth' : 'open', resolve)
      })
    }

    return this.reconnectAfterClose()
  }

  async reconnectAfterClose(): Promise<void> {
    if (!this._isReconnecting || this._ws !== null || this._isOpen) {
      return this.reconnect()
    }

    await this.open()

    if (this._authOnReconnect) {
      await this.auth()
    }
  }

  private _validateMessageSeq(msg: any[] = []): Error | null {
    if (!this._seqAudit) return null
    if (!Array.isArray(msg)) return null
    if (msg.length === 0) return null

    const authSeq = msg[0] === 0 && msg[1] !== 'hb'
      ? msg[msg.length - 1]
      : NaN

    if (`${(msg[2] || [])[1] || ''}`.slice(-4) !== '-req') {
      const seq = (
        (msg[0] === 0) &&
        (msg[1] !== 'hb') &&
        !(msg[1] === 'n' && ((msg[2] || [])[1] || '').slice(-4) === '-req')
      )
        ? msg[msg.length - 2]
        : msg[msg.length - 1]

      if (!Number.isFinite(seq)) return null

      if (this._lastPubSeq === -1) {
        this._lastPubSeq = seq
        return null
      }

      if (seq !== this._lastPubSeq + 1) {
        return new Error(`invalid pub seq #; last ${this._lastPubSeq}, got ${seq}`)
      }

      this._lastPubSeq = seq
    }

    if (!Number.isFinite(authSeq)) return null
    if (authSeq === 0) return null

    if (msg[1] === 'n') {
      return authSeq !== this._lastAuthSeq
        ? new Error(
          `invalid auth seq #, expected no advancement but got ${authSeq}`
        )
        : null
    }

    if (authSeq === this._lastAuthSeq) {
      return new Error(
        `expected auth seq # advancement but got same seq: ${authSeq}`
      )
    }

    if (this._lastAuthSeq !== -1 && authSeq !== this._lastAuthSeq + 1) {
      return new Error(
        `invalid auth seq #; last ${this._lastAuthSeq}, got ${authSeq}`
      )
    }

    this._lastAuthSeq = authSeq
    return null
  }

  private async _triggerPacketWDHandler(): Promise<void> {
    if (!this._packetWDDelay || !this._isOpen) {
      return
    }

    debug(
      'packet delay watchdog triggered [last packet %dms ago]',
      Date.now() - this._packetWDLastTS
    )

    this._packetWDTimeout = null
    return this.reconnect()
  }

  private _resetPacketWD(): void {
    if (!this._packetWDDelay) return
    if (this._packetWDTimeout !== null) {
      clearTimeout(this._packetWDTimeout)
    }

    if (!this._isOpen) return

    this._packetWDTimeout = setTimeout(() => {
      this._triggerPacketWD().catch((err: Error) => {
        debug('error triggering packet watchdog: %s', err.message)
      })
    }, this._packetWDDelay)
  }

  resubscribePreviousChannels(): void {
    Object.values(this._prevChannelMap).forEach((chan) => {
      const { channel } = chan

      switch (channel) {
        case 'ticker': {
          const { symbol } = chan
          if (symbol) this.subscribeTicker(symbol)
          break
        }
        case 'trades': {
          const { symbol } = chan
          if (symbol) this.subscribeTrades(symbol)
          break
        }
        case 'book': {
          const { symbol, len, prec } = chan
          if (symbol) this.subscribeOrderBook(symbol, prec, len)
          break
        }
        case 'candles': {
          const { key } = chan
          if (key) this.subscribeCandles(key)
          break
        }
        default: {
          debug('unknown previously subscribed channel type: %s', channel)
        }
      }
    })
  }

  private _onWSOpenHandler(): void {
    this._isOpen = true
    this._isReconnecting = false
    this._packetWDLastTS = Date.now()
    this._lastAuthSeq = -1
    this._lastPubSeq = -1
    this.emit('open')

    if (Object.keys(this._prevChannelMap).length > 0) {
      this.resubscribePreviousChannels()
      this._prevChannelMap = {}
    }

    debug('connection open')
  }

  private async _onWSCloseHandler(): Promise<void> {
    this._isOpen = false
    this._isAuthenticated = false
    this._lastAuthSeq = -1
    this._lastPubSeq = -1
    this._enabledFlags = 0
    this._ws = null
    this._subscriptionRefs = {}
    this.emit('close')

    debug('connection closed')

    const shouldReconnect = this._isReconnecting || (this._autoReconnect && !this._isClosing)

    if (shouldReconnect) {
      this._prevChannelMap = this._channelMap
    }

    this._channelMap = {}
    this._isClosing = false

    if (shouldReconnect) {
      setTimeout(async () => {
        try {
          if (this._reconnectThrottler) {
            await this._reconnectThrottler.add(this.reconnectAfterClose.bind(this))
          } else {
            await this.reconnectAfterClose()
          }
        } catch (err: any) {
          this._isReconnecting = false
          debug('error reconnectAfterClose: %s', err.stack)
          this.emit('error', new Error(`auto-reconnect failed: ${err.message}`))
        }
      }, this._reconnectDelay)
    }
  }

  private _onWSErrorHandler(err: Error): void {
    this.emit('error', err)
    debug('error: %s', err)
  }

  private _onWSNotification(arrN: any[]): void {
    if (!Array.isArray(arrN) || arrN.length < 8) return

    const status = arrN[6]
    const msg = arrN[7]

    if (!arrN[4] || !Array.isArray(arrN[4])) return

    let key: string | null = null

    if (arrN[1] === 'on-req') {
      if (arrN[4].length < 3) return
      key = `order-new-${arrN[4][2]}`
    } else if (arrN[1] === 'oc-req') {
      key = `order-cancel-${arrN[4][0]}`
    } else if (arrN[1] === 'ou-req') {
      key = `order-update-${arrN[4][0]}`
    }

    if (key) {
      const err = status === 'SUCCESS' ? null : new Error(`${status}: ${msg}`)
      this._eventCallbacks.trigger(key, err, arrN[4])
    }
  }

  private _onWSMessageHandler(rawMsg: WebSocket.Data, flags: any): void {
    const rawMsgStr = rawMsg.toString()
    debug('recv msg: %s', rawMsgStr)

    this._packetWDLastTS = Date.now()
    this._resetPacketWD()

    let msg: any

    try {
      msg = JSON.parse(rawMsgStr)
    } catch {
      this.emit('error', `invalid message JSON: ${rawMsgStr}`)
      return
    }

    debug('recv msg: %j', msg)

    if (this._seqAudit) {
      const seqErr = this._validateMessageSeq(msg)

      if (seqErr !== null) {
        this.emit('error', seqErr)
        return
      }
    }

    this.emit('message', msg, flags)

    if (Array.isArray(msg)) {
      this._handleChannelMessage(msg, rawMsgStr)
    } else if (msg.event) {
      this._handleEventMessage(msg)
    } else {
      debug('recv unidentified message: %j', msg)
    }
  }

  private _handleChannelMessage(msg: any[], rawMsg: string): void {
    const [chanId, type] = msg
    const channelData = this._channelMap[chanId]

    if (!channelData) {
      debug('recv msg from unknown channel %d: %j', chanId, msg)
      return
    }

    if (msg.length < 2) return
    if (msg[1] === 'hb') return

    if (channelData.channel === 'book') {
      if (type === 'cs') {
        this._handleOBChecksumMessage(msg, channelData)
      } else {
        this._handleOBMessage(msg, channelData, rawMsg)
      }
    } else if (channelData.channel === 'trades') {
      this._handleTradeMessage(msg, channelData)
    } else if (channelData.channel === 'ticker') {
      this._handleTickerMessage(msg, channelData)
    } else if (channelData.channel === 'candles') {
      this._handleCandleMessage(msg, channelData)
    } else if (channelData.channel === 'status') {
      this._handleStatusMessage(msg, channelData)
    } else if (channelData.channel === 'auth') {
      this._handleAuthMessage(msg, channelData)
    } else {
      this._propagateMessageToListeners(msg, channelData)
      this.emit(channelData.channel, msg)
    }
  }

  private _handleOBChecksumMessage(msg: any[], chanData: ChannelData): void {
    this.emit('cs', msg)

    if (!this._manageOrderBooks) {
      return
    }

    const { symbol, prec } = chanData
    const cs = msg[2]

    if (symbol && symbol[0] === 't') {
      const err = this._verifyManagedOBChecksum(symbol, prec, cs)

      if (err) {
        this.emit('error', err)
        return
      }
    }

    const internalMessage: ExtendedMessage = [chanData.chanId, 'ob_checksum', cs]
    internalMessage.filterOverride = [
      chanData.symbol,
      chanData.prec,
      chanData.len
    ]

    this._propagateMessageToListeners(internalMessage, false as any)
    this.emit('cs', symbol, cs)
  }

  private _handleOBMessage(msg: any[], chanData: ChannelData, rawMsg: string): void {
    const { symbol, prec } = chanData
    const raw = prec === 'R0'
    let data = getMessagePayload(msg)

    if (this._manageOrderBooks && symbol) {
      const err = this._updateManagedOB(symbol, data, raw, rawMsg)

      if (err) {
        this.emit('error', err)
        return
      }

      data = this._orderBooks[symbol]
    }

    if (this._transform) {
      data = new OrderBook((Array.isArray(data![0]) ? data : [data]), raw) as unknown as typeof data
    }

    const internalMessage: ExtendedMessage = [chanData.chanId, 'orderbook', data]
    internalMessage.filterOverride = [
      chanData.symbol,
      chanData.prec,
      chanData.len
    ]

    this._propagateMessageToListeners(internalMessage, chanData, false)
    this.emit('orderbook', symbol, data)
  }

  private _updateManagedOB(symbol: string, data: any, raw: boolean, rawMsg: string): Error | null {
    let rawLossless: any
    try {
      rawLossless = LosslessJSON.parse(rawMsg, (_key: string, value: any) => {
        if (value && value.isLosslessNumber) {
          return value.toString()
        } else {
          return value
        }
      })
    } catch (err: any) {
      return new Error(`lossless JSON parse error for OB ${symbol}: ${err.message}`)
    }

    if (!rawLossless || !Array.isArray(rawLossless)) {
      return new Error(`invalid lossless OB data for ${symbol}`)
    }

    const losslessUpdate = rawLossless[1]

    if (Array.isArray(data[0])) {
      this._orderBooks[symbol] = data
      this._losslessOrderBooks[symbol] = losslessUpdate
      return null
    }

    if (!this._orderBooks[symbol]) {
      return new Error(`recv update for unknown OB: ${symbol}`)
    }

    OrderBook.updateArrayOBWith(this._orderBooks[symbol], data, raw)
    OrderBook.updateArrayOBWith(this._losslessOrderBooks[symbol], losslessUpdate, raw)
    return null
  }

  private _verifyManagedOBChecksum(symbol: string, prec: string | undefined, cs: number): Error | null {
    const ob = this._losslessOrderBooks[symbol]

    if (!ob) return null

    const localCS = ob instanceof OrderBook
      ? ob.checksum!()
      : OrderBook.checksumArr(ob, prec === 'R0')

    return localCS !== cs
      ? new Error(`OB checksum mismatch: got ${localCS}, want ${cs}`)
      : null
  }

  getOB(symbol: string): any {
    if (!this._orderBooks[symbol]) return null
    return new OrderBook(this._orderBooks[symbol])
  }

  getLosslessOB(symbol: string): any {
    if (!this._losslessOrderBooks[symbol]) return null
    return new OrderBook(this._losslessOrderBooks[symbol])
  }

  private _handleTradeMessage(msg: any[], chanData: ChannelData): void {
    let eventName: string
    if (msg[1][0] === 'f') {
      eventName = msg[1]
    } else if (msg[1] === 'te') {
      eventName = 'trade-entry'
    } else {
      eventName = 'trades'
    }

    let payload = getMessagePayload(msg)

    if (payload && !Array.isArray(payload[0])) {
      payload = [payload]
    }

    let data: any = payload

    if (this._transform) {
      const M = eventName[0] === 'f' && msg[2].length === 8 ? FundingTrade : PublicTrade
      const trades = M.unserialize(data)

      if (Array.isArray(trades) && trades.length === 1) {
        data = trades[0]
      } else {
        data = trades
      }

      data = new M(data)
    }

    const internalMessage: ExtendedMessage = [chanData.chanId, eventName, data]
    internalMessage.filterOverride = [chanData.symbol || chanData.pair]

    this._propagateMessageToListeners(internalMessage, chanData, false)
    this.emit('trades', chanData.symbol || chanData.pair, data)
  }

  private _handleTickerMessage(msg: any[] = [], chanData: ChannelData = { channel: 'ticker' }): void {
    const { symbol } = chanData

    if (!symbol) {
      debug('ticker message missing symbol, ignoring')
      return
    }

    let data: any = getMessagePayload(msg)

    if (this._transform) {
      data = symbol[0] === 't'
        ? new TradingTicker([symbol, ...msg[1]])
        : new FundingTicker([symbol, ...msg[1]])
    }

    const internalMessage: ExtendedMessage = [chanData.chanId, 'ticker', data]
    internalMessage.filterOverride = [symbol]

    this._propagateMessageToListeners(internalMessage, chanData, false)
    this.emit('ticker', symbol, data)
  }

  private _handleCandleMessage(msg: any[], chanData: ChannelData): void {
    const { key } = chanData
    let data = getMessagePayload(msg)

    if (this._manageCandles && key) {
      const err = this._updateManagedCandles(key, data)

      if (err) {
        this.emit('error', err)
        return
      }

      data = this._candles[key]
    } else if (data && data.length > 0 && !Array.isArray(data[0])) {
      data = [data]
    }

    if (this._transform) {
      data = Candle.unserialize(data) as typeof data
    }

    const internalMessage: ExtendedMessage = [chanData.chanId, 'candle', data]
    internalMessage.filterOverride = [chanData.key]

    this._propagateMessageToListeners(internalMessage, chanData, false)
    this.emit('candle', data, key)
  }

  private _handleStatusMessage(msg: any[], chanData: ChannelData): void {
    const { key } = chanData
    const data = getMessagePayload(msg)

    const internalMessage: ExtendedMessage = [chanData.chanId, 'status', data]
    internalMessage.filterOverride = [chanData.key]

    this._propagateMessageToListeners(internalMessage, chanData, false)
    this.emit('status', data, key)
  }

  private _updateManagedCandles(key: string, data: any): Error | null {
    if (Array.isArray(data[0])) {
      data.sort((a: any[], b: any[]) => b[0] - a[0])
      this._candles[key] = data
      return null
    }

    if (!this._candles[key]) {
      return new Error(`recv update for unknown candles: ${key}`)
    }

    const candles = this._candles[key]
    let updated = false

    for (let i = 0; i < candles.length; i++) {
      if (data[0] === candles[i][0]) {
        candles[i] = data
        updated = true
        break
      }
    }

    if (!updated) {
      candles.unshift(data)
    }

    return null
  }

  getCandles(key: string): any[] {
    return this._candles[key] || []
  }

  private _handleAuthMessage(msg: any[], chanData: ChannelData): void {
    if (msg[1] === 'n') {
      const payload = getMessagePayload(msg)

      if (payload) {
        this._onWSNotification(payload)
      }
    } else if (msg[1] === 'te') {
      msg[1] = 'auth-te'
    } else if (msg[1] === 'tu') {
      msg[1] = 'auth-tu'
    }

    this._propagateMessageToListeners(msg, chanData)
  }

  private _propagateMessageToListeners(msg: any[], chan: ChannelData | any, transform: boolean = this._transform): void {
    const keys = Object.keys(this._listeners)

    for (let i = 0; i < keys.length; i++) {
      WSv2._notifyListenerGroup(this._listeners[keys[i]], msg, transform, this, chan)
    }
  }

  static _notifyListenerGroup(lGroup: ListenerGroup, msg: any[], transform: boolean, ws: WSv2, _chanData: any): void {
    const [, eventName, data = []] = msg
    let filterByData: any

    WSv2._notifyCatchAllListeners(lGroup, msg)

    if (!lGroup[eventName] || lGroup[eventName].length === 0) return

    const listeners = lGroup[eventName].filter((listener) => {
      const { filter } = listener

      if (!filter) return true

      if (Array.isArray(data[0])) {
        const matchingData = data.filter((item: any) => {
          filterByData = (msg as ExtendedMessage).filterOverride ? (msg as ExtendedMessage).filterOverride : item
          return WSv2._payloadPassesFilter(filterByData, filter)
        })

        return matchingData.length !== 0
      }

      filterByData = (msg as ExtendedMessage).filterOverride ? (msg as ExtendedMessage).filterOverride : data
      return WSv2._payloadPassesFilter(filterByData, filter)
    })

    if (listeners.length === 0) return

    listeners.forEach(({ cb, modelClass }) => {
      try {
        const ModelClass = modelClass

        if (!ModelClass || !transform || data.length === 0) {
          cb(data, _chanData)
        } else if (Array.isArray(data[0])) {
          cb(data.map((entry: any) => {
            return new ModelClass(entry, ws)
          }), _chanData)
        } else {
          cb(new ModelClass(data, ws), _chanData)
        }
      } catch (err: any) {
        debug('error in listener callback: %s', err.message)
        ws.emit('error', new Error(`listener callback error: ${err.message}`))
      }
    })
  }

  static _payloadPassesFilter(payload: any, filter: Record<string, any>): boolean {
    const filterIndices = Object.keys(filter)
    let filterValue: any

    for (let k = 0; k < filterIndices.length; k++) {
      filterValue = filter[filterIndices[k]]

      if (filterValue === undefined || filterValue === null || filterValue === '' || filterValue === '*') {
        continue
      }

      if (payload[+filterIndices[k]] !== filterValue) {
        return false
      }
    }

    return true
  }

  static _notifyCatchAllListeners(lGroup: ListenerGroup, data: any): void {
    if (!lGroup['']) return

    for (let j = 0; j < lGroup[''].length; j++) {
      try {
        lGroup[''][j].cb(data)
      } catch (err: any) {
        debug('error in catch-all listener callback: %s', err.message)
      }
    }
  }

  private _handleEventMessage(msg: any): void {
    if (msg.event === 'auth') {
      this._handleAuthEvent(msg)
    } else if (msg.event === 'subscribed') {
      this._handleSubscribedEvent(msg)
    } else if (msg.event === 'unsubscribed') {
      this._handleUnsubscribedEvent(msg)
    } else if (msg.event === 'info') {
      this._handleInfoEvent(msg)
    } else if (msg.event === 'conf') {
      this._handleConfigEvent(msg)
    } else if (msg.event === 'error') {
      this._handleErrorEvent(msg)
    } else if (msg.event === 'pong') {
      this._handlePongEvent(msg)
    } else {
      debug('recv unknown event message: %j', msg)
    }
  }

  private _handleConfigEvent(msg: any = {}): void {
    const { status, flags } = msg
    const k = this._getConfigEventKey(flags)

    if (status !== 'OK') {
      const err = new Error(`config failed (${status}) for flags ${flags}`)
      debug('config failed: %s', err.message)

      this.emit('error', err)
      this._eventCallbacks.trigger(k, err)
    } else {
      debug('flags updated to %d', flags)

      this._enabledFlags = flags
      this._eventCallbacks.trigger(k, null, msg)
    }
  }

  private _handlePongEvent(msg: any): void {
    debug('pong: %s', JSON.stringify(msg))
    this.emit('pong', msg)
  }

  private _handleErrorEvent(msg: any): void {
    debug('error: %s', JSON.stringify(msg))
    this.emit('error', msg)
  }

  private _handleAuthEvent(data: any = {}): void {
    const { chanId, msg = '', status = '' } = data

    if (status !== 'OK') {
      const err = new Error(msg.match(/nonce/)
        ? 'auth failed: nonce small; you may need to generate a new API key to reset the nonce counter'
        : `auth failed: ${msg} (${status})`
      )

      debug('%s', err.message)
      this.emit('error', err)
      return
    }

    this._channelMap[chanId] = { channel: 'auth' }
    this._isAuthenticated = true

    this.emit('auth', data)
    debug('authenticated!')
  }

  private _handleSubscribedEvent(msg: any): void {
    this._channelMap[msg.chanId] = msg
    debug('subscribed to %s [%d]', msg.channel, msg.chanId)
    this.emit('subscribed', msg)
  }

  private _handleUnsubscribedEvent(msg: any): void {
    delete this._channelMap[msg.chanId]
    debug('unsubscribed from %d', msg.chanId)
    this.emit('unsubscribed', msg)
  }

  private _handleInfoEvent(msg: any = {}): void {
    const { version, code } = msg

    if (version) {
      if (version !== 2) {
        const err = new Error(`server not running API v2: v${version}`)

        this.emit('error', err)
        this.close().catch((closeErr: Error) => {
          debug('error closing connection: %s', closeErr.stack)
        })
        return
      }

      const { status } = msg.platform || {}

      debug(
        'server running API v2 (platform: %s (%d))',
        status === 0 ? 'under maintenance' : 'operating normally', status
      )
    } else if (code) {
      if (this._infoListeners[code]) {
        this._infoListeners[code].forEach(cb => cb(msg))
      }

      if (code === WSv2.info.SERVER_RESTART) {
        debug('server restarted, please reconnect')
      } else if (code === WSv2.info.MAINTENANCE_START) {
        debug('server maintenance period started!')
      } else if (code === WSv2.info.MAINTENANCE_END) {
        debug('server maintenance period ended!')
      }
    }

    this.emit('info', msg)
  }

  managedSubscribe(channel: string = '', identifier: string = '', payload: Record<string, any> = {}): boolean {
    const key = `${channel}:${identifier}`

    if (this._subscriptionRefs[key]) {
      this._subscriptionRefs[key]++
      return false
    }

    this._subscriptionRefs[key] = 1
    this.subscribe(channel, payload)

    return true
  }

  managedUnsubscribe(channel: string = '', identifier: string = ''): boolean {
    const key = `${channel}:${identifier}`
    const chanId = this._chanIdByIdentifier(channel, identifier)

    if (chanId === null || isNaN(this._subscriptionRefs[key])) return false

    this._subscriptionRefs[key]--
    if (this._subscriptionRefs[key] > 0) return false

    this.unsubscribe(chanId)
    delete this._subscriptionRefs[key]

    return true
  }

  getChannelData({ chanId, channel, symbol, key }: { chanId?: number; channel?: string; symbol?: string; key?: string }): ChannelData | null {
    const id = chanId || this._chanIdByIdentifier(channel || '', symbol || key || '')

    return (id && this._channelMap[id]) || null
  }

  _chanIdByIdentifier(channel: string, identifier: string): string | null {
    const channelIds = Object.keys(this._channelMap)
    let chan: ChannelData

    for (let i = 0; i < channelIds.length; i++) {
      chan = this._channelMap[channelIds[i]]

      if (chan.channel === channel && (
        chan.symbol === identifier ||
        chan.key === identifier
      )) {
        return channelIds[i]
      }
    }

    return null
  }

  private _getEventPromise(key: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this._eventCallbacks.push(key, (err, res) => {
        if (err) {
          return reject(err)
        }
        resolve(res)
      })
    })
  }

  private _getEventPromiseWithTimeout(key: string, timeoutMs: number = 30000): Promise<any> {
    return new Promise((resolve, reject) => {
      let settled = false
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true
          reject(new Error(`timeout waiting for ${key} (${timeoutMs}ms)`))
        }
      }, timeoutMs)

      this._eventCallbacks.push(key, (err, res) => {
        if (settled) return
        settled = true
        clearTimeout(timer)

        if (err) {
          return reject(err)
        }
        resolve(res)
      })
    })
  }

  send(msg: any): boolean {
    if (!this._ws || !this._isOpen) {
      this.emit('error', new Error('no ws client or not open'))
      return false
    }

    if (this._isClosing) {
      this.emit('error', new Error('connection currently closing'))
      return false
    }

    try {
      debug('sending %j', msg)
      this._ws.send(JSON.stringify(msg))
      return true
    } catch (err: any) {
      debug('error sending message: %s', err.message)
      this.emit('error', err)
      return false
    }
  }

  sequencingEnabled(): boolean {
    return this._seqAudit
  }

  async enableSequencing(args: { audit?: boolean } = { audit: true }): Promise<void> {
    this._seqAudit = args.audit === true
    return this.enableFlag(WSv2.flags.SEQ_ALL)
  }

  async enableFlag(flag: number): Promise<any> {
    this._enabledFlags = this._enabledFlags | flag

    if (!this._isOpen) {
      return
    }

    this.sendEnabledFlags()
    return this._getEventPromiseWithTimeout(this._getConfigEventKey(flag))
  }

  sendEnabledFlags(): void {
    this.send({
      event: 'conf',
      flags: this._enabledFlags
    })
  }

  isFlagEnabled(flag: number): boolean {
    return (this._enabledFlags & flag) === flag
  }

  private _getConfigEventKey(flag: number | string): string {
    return `conf-res-${flag}`
  }

  onServerRestart(cb: (msg: any) => void): () => void {
    return this.onInfoMessage(WSv2.info.SERVER_RESTART, cb)
  }

  onMaintenanceStart(cb: (msg: any) => void): () => void {
    return this.onInfoMessage(WSv2.info.MAINTENANCE_START, cb)
  }

  onMaintenanceEnd(cb: (msg: any) => void): () => void {
    return this.onInfoMessage(WSv2.info.MAINTENANCE_END, cb)
  }

  subscribe(channel: string, payload?: Record<string, any>): void {
    this.send(Object.assign({
      event: 'subscribe',
      channel
    }, payload))
  }

  async subscribeTicker(symbol: string): Promise<boolean> {
    return this.managedSubscribe('ticker', symbol, { symbol })
  }

  async subscribeTrades(symbol: string): Promise<boolean> {
    return this.managedSubscribe('trades', symbol, { symbol })
  }

  async subscribeOrderBook(symbol: string, prec: string = 'P0', len: string = '25'): Promise<boolean> {
    return this.managedSubscribe('book', symbol, { symbol, len, prec })
  }

  async subscribeCandles(key: string): Promise<boolean> {
    return this.managedSubscribe('candles', key, { key })
  }

  async subscribeStatus(key: string): Promise<boolean> {
    return this.managedSubscribe('status', key, { key })
  }

  unsubscribe(chanId: number | string): void {
    this.send({
      event: 'unsubscribe',
      chanId: +chanId
    })
  }

  async unsubscribeTicker(symbol: string): Promise<boolean> {
    return this.managedUnsubscribe('ticker', symbol)
  }

  async unsubscribeTrades(symbol: string): Promise<boolean> {
    return this.managedUnsubscribe('trades', symbol)
  }

  async unsubscribeOrderBook(symbol: string): Promise<boolean> {
    return this.managedUnsubscribe('book', symbol)
  }

  async unsubscribeCandles(symbol: string, frame: string): Promise<boolean> {
    return this.managedUnsubscribe('candles', `trade:${frame}:${symbol}`)
  }

  async unsubscribeStatus(key: string): Promise<boolean> {
    return this.managedUnsubscribe('status', key)
  }

  removeListeners(cbGID: string | number): void {
    delete this._listeners[cbGID]
  }

  requestCalc(prefixes: string[]): void {
    this._sendCalc([0, 'calc', null, prefixes.map(p => [p])])
  }

  private _sendCalcImpl(msg: any): void {
    if (!this._ws || !this._isOpen) {
      debug('cannot send calc, ws not open')
      return
    }

    try {
      debug('req calc: %j', msg)
      this._ws.send(JSON.stringify(msg))
    } catch (err: any) {
      debug('error sending calc: %s', err.message)
      this.emit('error', err)
    }
  }

  async submitOrder(params: any): Promise<any> {
    if (!this._isAuthenticated) {
      throw new Error('not authenticated')
    }

    const order = params?.order ?? params
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const packet: any = Array.isArray(order)
      ? order
      : order instanceof Order
        ? order.toNewOrderPacket!()
        : new Order(order).toNewOrderPacket!()

    if (this._affCode) {
      if (!packet.meta) {
        packet.meta = {}
      }

      packet.meta.aff_code = packet.meta.aff_code || this._affCode
    }

    this._sendOrderPacket([0, 'on', null, packet])

    return this._getEventPromiseWithTimeout(`order-new-${packet.cid}`)
  }

  async updateOrder(changes: any = {}): Promise<any> {
    const { id } = changes

    if (!this._isAuthenticated) {
      throw new Error('not authenticated')
    } else if (!id) {
      throw new Error('order ID required for update')
    }

    this._sendOrderPacket([0, 'ou', null, changes])

    return this._getEventPromiseWithTimeout(`order-update-${id}`)
  }

  async cancelOrder(order: any): Promise<any> {
    if (!this._isAuthenticated) {
      throw new Error('not authenticated')
    }

    const id = typeof order === 'number'
      ? order
      : Array.isArray(order)
        ? order[0]
        : order.id

    debug(`cancelling order ${id}`)
    this._sendOrderPacket([0, 'oc', null, { id }])

    return this._getEventPromiseWithTimeout(`order-cancel-${id}`)
  }

  async cancelOrders(params: any): Promise<any[]> {
    if (!this._isAuthenticated) {
      throw new Error('not authenticated')
    }

    const orders = params?.ids ?? params

    return Promise.all(orders.map((o: any) => {
      return this.cancelOrder(o)
    }))
  }

  async submitOrderMultiOp(opPayloads: any[]): Promise<boolean> {
    if (!this._isAuthenticated) {
      throw new Error('not authenticated')
    }

    return this.send([0, 'ox_multi', null, opPayloads])
  }

  private _sendOrderPacket(packet: any[]): void {
    if (this._hasOrderBuff()) {
      this._ensureOrderBuffTimeout()
      this._orderOpBuffer.push(packet)
    } else {
      this.send(packet)
    }
  }

  private _hasOrderBuff(): boolean {
    return this._orderOpBufferDelay > 0
  }

  private _ensureOrderBuffTimeout(): void {
    if (this._orderOpTimeout !== null) return

    this._orderOpTimeout = setTimeout(
      this._flushOrderOps.bind(this),
      this._orderOpBufferDelay
    )
  }

  private _flushOrderOps(): Promise<any> {
    this._orderOpTimeout = null

    if (this._isClosing || !this._isOpen) {
      this._orderOpBuffer = []
      return Promise.resolve()
    }

    const packets = this._orderOpBuffer.map(p => [p[1], p[3]])
    this._orderOpBuffer = []

    if (packets.length <= 15) {
      return this.submitOrderMultiOp(packets)
    }

    const promises: Promise<any>[] = []

    const remaining = [...packets]
    while (remaining.length > 0) {
      const opPackets = remaining.splice(0, Math.min(remaining.length, 15))
      promises.push(this.submitOrderMultiOp(opPackets))
    }

    return Promise.all(promises)
  }

  isAuthenticated(): boolean {
    return this._isAuthenticated
  }

  isOpen(): boolean {
    return this._isOpen
  }

  isReconnecting(): boolean {
    return this._isReconnecting
  }

  notifyUI(opts: { type?: string; message?: string; level?: string; image?: string; link?: string; sound?: string } = {}): void {
    const { type, message, level, image, link, sound } = opts

    if (typeof type !== 'string' || typeof message !== 'string') {
      throw new Error(`notified with invalid type/message: ${type}/${message}`)
    }

    if (!this._isOpen) {
      throw new Error('socket not open')
    }

    if (!this._isAuthenticated) {
      throw new Error('socket not authenticated')
    }

    this.send([0, 'n', null, {
      type: UCM_NOTIFICATION_TYPE,
      info: {
        type,
        message,
        level,
        image,
        link,
        sound
      }
    }])
  }

  private _registerListener(eventName: string, filter: Record<string, any> | null, modelClass: any, cbGID: string | number | null, cb: (...args: any[]) => void): void {
    if (!cbGID) cbGID = null

    const gid = cbGID as string

    if (!this._listeners[gid]) {
      this._listeners[gid] = { [eventName]: [] }
    }

    const listeners = this._listeners[gid]

    if (!listeners[eventName]) {
      listeners[eventName] = []
    }

    const l: ListenerEntry = {
      cb,
      modelClass,
      filter
    }

    listeners[eventName].push(l)
  }

  onInfoMessage(code: number, cb: (msg: any) => void): () => void {
    if (!this._infoListeners[code]) {
      this._infoListeners[code] = []
    }

    this._infoListeners[code].push(cb)

    return () => {
      const idx = this._infoListeners[code].indexOf(cb)
      if (idx !== -1) {
        this._infoListeners[code].splice(idx, 1)
      }
    }
  }

  onMessage({ cbGID }: { cbGID?: string | number }, cb: (...args: any[]) => void): void {
    this._registerListener('', null, null, cbGID ?? null, cb)
  }

  onCandle({ key, cbGID }: { key: string; cbGID?: string | number }, cb: (...args: any[]) => void): void {
    this._registerListener('candle', { 0: key }, Candle, cbGID ?? null, cb)
  }

  onOrderBook({ symbol, prec, len, cbGID }: { symbol?: string; prec?: string; len?: string; cbGID?: string | number }, cb: (...args: any[]) => void): void {
    this._registerListener('orderbook', {
      0: symbol,
      1: prec,
      2: len
    }, OrderBook, cbGID ?? null, cb)
  }

  onOrderBookChecksum({ symbol, prec, len, cbGID }: { symbol?: string; prec?: string; len?: string; cbGID?: string | number }, cb: (...args: any[]) => void): void {
    this._registerListener('ob_checksum', {
      0: symbol,
      1: prec,
      2: len
    }, null, cbGID ?? null, cb)
  }

  onTrades({ symbol, pair, cbGID }: { symbol?: string; pair?: string; cbGID?: string | number }, cb: (...args: any[]) => void): void {
    const id = pair || symbol || ''
    const model = id[0] === 'f' ? FundingTrade : PublicTrade

    this._registerListener('trades', { 0: id }, model, cbGID ?? null, cb)
  }

  onTradeEntry({ pair, symbol, cbGID }: { pair?: string; symbol?: string; cbGID?: string | number }, cb: (...args: any[]) => void): void {
    const id = pair || symbol || ''
    this._registerListener('trade-entry', { 0: id }, PublicTrade, cbGID ?? null, cb)
  }

  onAccountTradeEntry({ symbol, cbGID }: { symbol?: string; cbGID?: string | number }, cb: (...args: any[]) => void): void {
    this._registerListener('auth-te', { 1: symbol }, Trade, cbGID ?? null, cb)
  }

  onAccountTradeUpdate({ symbol, cbGID }: { symbol?: string; cbGID?: string | number }, cb: (...args: any[]) => void): void {
    this._registerListener('auth-tu', { 1: symbol }, Trade, cbGID ?? null, cb)
  }

  onTicker({ symbol = '', cbGID }: { symbol?: string; cbGID?: string | number } = {}, cb: (...args: any[]) => void): void {
    const m = symbol[0] === 'f' ? FundingTicker : TradingTicker
    this._registerListener('ticker', { 0: symbol }, m, cbGID ?? null, cb)
  }

  onStatus({ key = '', cbGID }: { key?: string; cbGID?: string | number } = {}, cb: (...args: any[]) => void): void {
    this._registerListener('status', { 0: key }, null, cbGID ?? null, cb)
  }

  onOrderSnapshot({ symbol, id, cid, gid, cbGID }: { symbol?: string; id?: number; cid?: number; gid?: number; cbGID?: string | number }, cb: (...args: any[]) => void): void {
    this._registerListener('os', { 0: id, 1: gid, 2: cid, 3: symbol }, Order, cbGID ?? null, cb)
  }

  onOrderNew({ symbol, id, cid, gid, cbGID }: { symbol?: string; id?: number; cid?: number; gid?: number; cbGID?: string | number }, cb: (...args: any[]) => void): void {
    this._registerListener('on', { 0: id, 1: gid, 2: cid, 3: symbol }, Order, cbGID ?? null, cb)
  }

  onOrderUpdate({ symbol, id, cid, gid, cbGID }: { symbol?: string; id?: number; cid?: number; gid?: number; cbGID?: string | number }, cb: (...args: any[]) => void): void {
    this._registerListener('ou', { 0: id, 1: gid, 2: cid, 3: symbol }, Order, cbGID ?? null, cb)
  }

  onOrderClose({ symbol, id, cid, gid, cbGID }: { symbol?: string; id?: number; cid?: number; gid?: number; cbGID?: string | number }, cb: (...args: any[]) => void): void {
    this._registerListener('oc', { 0: id, 1: gid, 2: cid, 3: symbol }, Order, cbGID ?? null, cb)
  }

  onPositionSnapshot({ symbol, cbGID }: { symbol?: string; cbGID?: string | number }, cb: (...args: any[]) => void): void {
    this._registerListener('ps', { 0: symbol }, Position, cbGID ?? null, cb)
  }

  onPositionNew({ symbol, cbGID }: { symbol?: string; cbGID?: string | number }, cb: (...args: any[]) => void): void {
    this._registerListener('pn', { 0: symbol }, Position, cbGID ?? null, cb)
  }

  onPositionUpdate({ symbol, cbGID }: { symbol?: string; cbGID?: string | number }, cb: (...args: any[]) => void): void {
    this._registerListener('pu', { 0: symbol }, Position, cbGID ?? null, cb)
  }

  onPositionClose({ symbol, cbGID }: { symbol?: string; cbGID?: string | number }, cb: (...args: any[]) => void): void {
    this._registerListener('pc', { 0: symbol }, Position, cbGID ?? null, cb)
  }

  onFundingOfferSnapshot({ symbol, cbGID }: { symbol?: string; cbGID?: string | number }, cb: (...args: any[]) => void): void {
    this._registerListener('fos', { 1: symbol }, FundingOffer, cbGID ?? null, cb)
  }

  onFundingOfferNew({ symbol, cbGID }: { symbol?: string; cbGID?: string | number }, cb: (...args: any[]) => void): void {
    this._registerListener('fon', { 1: symbol }, FundingOffer, cbGID ?? null, cb)
  }

  onFundingOfferUpdate({ symbol, cbGID }: { symbol?: string; cbGID?: string | number }, cb: (...args: any[]) => void): void {
    this._registerListener('fou', { 1: symbol }, FundingOffer, cbGID ?? null, cb)
  }

  onFundingOfferClose({ symbol, cbGID }: { symbol?: string; cbGID?: string | number }, cb: (...args: any[]) => void): void {
    this._registerListener('foc', { 1: symbol }, FundingOffer, cbGID ?? null, cb)
  }

  onFundingCreditSnapshot({ symbol, cbGID }: { symbol?: string; cbGID?: string | number }, cb: (...args: any[]) => void): void {
    this._registerListener('fcs', { 1: symbol }, FundingCredit, cbGID ?? null, cb)
  }

  onFundingCreditNew({ symbol, cbGID }: { symbol?: string; cbGID?: string | number }, cb: (...args: any[]) => void): void {
    this._registerListener('fcn', { 1: symbol }, FundingCredit, cbGID ?? null, cb)
  }

  onFundingCreditUpdate({ symbol, cbGID }: { symbol?: string; cbGID?: string | number }, cb: (...args: any[]) => void): void {
    this._registerListener('fcu', { 1: symbol }, FundingCredit, cbGID ?? null, cb)
  }

  onFundingCreditClose({ symbol, cbGID }: { symbol?: string; cbGID?: string | number }, cb: (...args: any[]) => void): void {
    this._registerListener('fcc', { 1: symbol }, FundingCredit, cbGID ?? null, cb)
  }

  onFundingLoanSnapshot({ symbol, cbGID }: { symbol?: string; cbGID?: string | number }, cb: (...args: any[]) => void): void {
    this._registerListener('fls', { 1: symbol }, FundingLoan, cbGID ?? null, cb)
  }

  onFundingLoanNew({ symbol, cbGID }: { symbol?: string; cbGID?: string | number }, cb: (...args: any[]) => void): void {
    this._registerListener('fln', { 1: symbol }, FundingLoan, cbGID ?? null, cb)
  }

  onFundingLoanUpdate({ symbol, cbGID }: { symbol?: string; cbGID?: string | number }, cb: (...args: any[]) => void): void {
    this._registerListener('flu', { 1: symbol }, FundingLoan, cbGID ?? null, cb)
  }

  onFundingLoanClose({ symbol, cbGID }: { symbol?: string; cbGID?: string | number }, cb: (...args: any[]) => void): void {
    this._registerListener('flc', { 1: symbol }, FundingLoan, cbGID ?? null, cb)
  }

  onWalletSnapshot({ cbGID }: { cbGID?: string | number }, cb: (...args: any[]) => void): void {
    this._registerListener('ws', null, Wallet, cbGID ?? null, cb)
  }

  onWalletUpdate({ cbGID }: { cbGID?: string | number }, cb: (...args: any[]) => void): void {
    this._registerListener('wu', null, Wallet, cbGID ?? null, cb)
  }

  onBalanceInfoUpdate({ cbGID }: { cbGID?: string | number }, cb: (...args: any[]) => void): void {
    this._registerListener('bu', null, BalanceInfo, cbGID ?? null, cb)
  }

  onMarginInfoUpdate({ cbGID }: { cbGID?: string | number }, cb: (...args: any[]) => void): void {
    this._registerListener('miu', null, MarginInfo, cbGID ?? null, cb)
  }

  onFundingInfoUpdate({ cbGID }: { cbGID?: string | number }, cb: (...args: any[]) => void): void {
    this._registerListener('fiu', null, FundingInfo, cbGID ?? null, cb)
  }

  onFundingTradeEntry({ symbol, cbGID }: { symbol?: string; cbGID?: string | number }, cb: (...args: any[]) => void): void {
    this._registerListener('fte', { 0: symbol }, FundingTrade, cbGID ?? null, cb)
  }

  onFundingTradeUpdate({ symbol, cbGID }: { symbol?: string; cbGID?: string | number }, cb: (...args: any[]) => void): void {
    this._registerListener('ftu', { 0: symbol }, FundingTrade, cbGID ?? null, cb)
  }

  onNotification({ type, cbGID }: { type?: string; cbGID?: string | number }, cb: (...args: any[]) => void): void {
    this._registerListener('n', { 1: type }, Notification, cbGID ?? null, cb)
  }
}

export default WSv2
