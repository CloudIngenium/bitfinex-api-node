declare module 'bfx-api-node-util' {
  interface AuthSig {
    sig: string
  }

  interface BfxApiNodeUtil {
    setSigFig(number: number, maxSigs?: number): string
    setPrecision(number: number, decimals?: number): string
    prepareAmount(amount: number): string
    preparePrice(price: number): string
    nonce(): string
    genAuthSig(secret: string | undefined, payload: string): AuthSig
    isSnapshot(msg: unknown[]): boolean
    isClass(f: unknown): boolean
    padCandles(candles: unknown[], count: number): unknown[]
  }

  const util: BfxApiNodeUtil
  export default util
}
