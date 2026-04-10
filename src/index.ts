import { RESTv1, RESTv2 } from '@jcbit/bfx-api-node-rest'
import WSv2 from './transports/ws2.js'
import WS2Manager from './ws2_manager.js'

/**
 * Generate a deterministic cache key from an object by sorting keys.
 * Prevents cache collisions from different key orderings.
 */
const stableStringify = (obj: any): string => {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj)
  if (Array.isArray(obj)) return JSON.stringify(obj.map(stableStringify))
  const keys = Object.keys(obj).sort()
  return '{' + keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',') + '}'
}

interface BFXOptions {
  apiKey?: string
  apiSecret?: string
  authToken?: string
  company?: string
  transform?: boolean
  ws?: Record<string, any>
  rest?: Record<string, any>
}

/**
 * Provides access to versions 1 & 2 of the HTTP & WebSocket Bitfinex APIs
 */
class BFX {
  static RESTv1 = RESTv1
  static RESTv2 = RESTv2
  static WSv2 = WSv2
  static WS2Manager = WS2Manager

  private _apiKey: string
  private _apiSecret: string
  private _authToken: string
  private _company: string
  private _transform: boolean
  private _wsArgs: Record<string, any>
  private _restArgs: Record<string, any>
  private _transportCache: {
    rest: Record<string, any>
    ws: Record<string, any>
  }

  constructor(opts: BFXOptions = {}) {
    if (opts.constructor.name !== 'Object') {
      throw new Error([
        'constructor takes an object since version 2.0.0, see:',
        'https://github.com/bitfinexcom/bitfinex-api-node#version-200-breaking-changes\n'
      ].join('\n'))
    }

    this._apiKey = opts.apiKey || ''
    this._apiSecret = opts.apiSecret || ''
    this._authToken = opts.authToken || ''
    this._company = opts.company || ''
    this._transform = opts.transform === true
    this._wsArgs = opts.ws || {}
    this._restArgs = opts.rest || {}
    this._transportCache = {
      rest: {},
      ws: {}
    }
  }

  private _getTransportPayload(extraOpts: Record<string, any>): Record<string, any> {
    return {
      apiKey: this._apiKey,
      apiSecret: this._apiSecret,
      authToken: this._authToken,
      company: this._company,
      transform: this._transform,
      ...extraOpts
    }
  }

  rest(version: number = 2, extraOpts: Record<string, any> = {}): any {
    if (version !== 1 && version !== 2) {
      throw new Error(`invalid http API version: ${version}`)
    }

    const key = `${version}|${stableStringify(extraOpts)}`

    if (!this._transportCache.rest[key]) {
      const mergedOpts = { ...this._restArgs, ...extraOpts }
      const payload = this._getTransportPayload(mergedOpts)

      this._transportCache.rest[key] = version === 2
        ? new RESTv2(payload)
        : new RESTv1(payload)
    }

    return this._transportCache.rest[key]
  }

  ws(version: number = 2, extraOpts: Record<string, any> = {}): any {
    if (version !== 1 && version !== 2) {
      throw new Error(`invalid websocket API version: ${version}`)
    }

    const key = `${version}|${stableStringify(extraOpts)}`

    if (!this._transportCache.ws[key]) {
      const mergedOpts = { ...this._wsArgs, ...extraOpts }
      const payload = this._getTransportPayload(mergedOpts)

      if (version !== 2) {
        throw new Error('WSv1 has been removed; use ws(2) instead')
      }
      this._transportCache.ws[key] = new WSv2(payload)
    }

    return this._transportCache.ws[key]
  }
}

export default BFX
export { RESTv1, RESTv2, WSv2, WS2Manager }
