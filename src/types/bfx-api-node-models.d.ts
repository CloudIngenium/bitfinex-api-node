declare module 'bfx-api-node-models' {
  /** Base model class with common static/instance methods */
  interface ModelClass {
    new (data: unknown, ...args: unknown[]): ModelInstance
    unserialize(data: unknown): unknown
    updateArrayOBWith?: (ob: unknown[], update: unknown, raw: boolean) => void
    checksumArr?: (ob: unknown[], raw: boolean) => number
  }

  interface ModelInstance {
    serialize(): unknown[]
    toNewOrderPacket?(): Record<string, unknown> & { cid: number; meta?: Record<string, unknown> }
    checksum?(): number
    [key: string]: unknown
  }

  interface BfxModels {
    OrderBook: ModelClass & {
      new (data: unknown, raw?: boolean): ModelInstance
      updateArrayOBWith(ob: unknown[], update: unknown, raw: boolean): void
      checksumArr(ob: unknown[], raw: boolean): number
    }
    BalanceInfo: ModelClass
    FundingCredit: ModelClass
    FundingInfo: ModelClass
    FundingLoan: ModelClass
    FundingOffer: ModelClass
    FundingTrade: ModelClass
    MarginInfo: ModelClass
    Notification: ModelClass
    Order: ModelClass & {
      new (data: unknown): ModelInstance & {
        toNewOrderPacket(): Record<string, unknown> & { cid: number; meta?: Record<string, unknown> }
      }
    }
    Position: ModelClass
    Trade: ModelClass
    Wallet: ModelClass
    WalletHist: ModelClass
    Alert: ModelClass
    TradingTicker: ModelClass
    TradingTickerHist: ModelClass
    FundingTicker: ModelClass
    FundingTickerHist: ModelClass
    PublicTrade: ModelClass
    Candle: ModelClass
    LedgerEntry: ModelClass
    Liquidations: ModelClass
    Movement: ModelClass
    MovementInfo: ModelClass
    UserInfo: ModelClass
    Currency: ModelClass
    StatusMessagesDeriv: ModelClass
    Login: ModelClass
    ChangeLog: ModelClass
    Invoice: ModelClass
    SymbolDetails: ModelClass
    TransactionFee: ModelClass
    AccountSummary: ModelClass
    AuthPermission: ModelClass
    CoreSettings: ModelClass
    WeightedAverages: ModelClass
    isCollection(data: unknown): boolean
  }

  const models: BfxModels
  export default models
}
