import { EventEmitter } from 'events';
interface PromiseThrottler {
    add: (fn: () => Promise<any>) => Promise<any>;
}
interface WSv2Options {
    affCode?: string | null;
    apiKey?: string;
    apiSecret?: string;
    url?: string;
    orderOpBufferDelay?: number;
    transform?: boolean;
    agent?: any;
    manageOrderBooks?: boolean;
    manageCandles?: boolean;
    seqAudit?: boolean;
    autoReconnect?: boolean;
    reconnectDelay?: number;
    reconnectThrottler?: PromiseThrottler;
    packetWDDelay?: number;
}
interface ListenerEntry {
    cb: (...args: any[]) => void;
    modelClass: any;
    filter: Record<string, any> | null;
}
type ListenerGroup = Record<string, ListenerEntry[]>;
interface ChannelData {
    channel: string;
    chanId?: number;
    symbol?: string;
    pair?: string;
    key?: string;
    prec?: string;
    len?: string;
    freq?: string;
    [key: string]: any;
}
/**
 * Communicates with v2 of the Bitfinex WebSocket API
 */
declare class WSv2 extends EventEmitter {
    static flags: {
        DEC_S: number;
        TIME_S: number;
        TIMESTAMP: number;
        SEQ_ALL: number;
        CHECKSUM: number;
    };
    static info: {
        SERVER_RESTART: number;
        MAINTENANCE_START: number;
        MAINTENANCE_END: number;
    };
    static url: string;
    private _affCode;
    private _agent;
    private _url;
    private _transform;
    private _orderOpBufferDelay;
    private _orderOpBuffer;
    private _orderOpTimeout;
    private _seqAudit;
    private _autoReconnect;
    private _reconnectDelay;
    private _reconnectThrottler;
    private _manageOrderBooks;
    private _manageCandles;
    private _packetWDDelay;
    private _packetWDTimeout;
    private _packetWDLastTS;
    private _orderBooks;
    private _losslessOrderBooks;
    private _candles;
    private _authArgs;
    private _listeners;
    private _infoListeners;
    private _subscriptionRefs;
    private _channelMap;
    private _enabledFlags;
    private _eventCallbacks;
    private _isAuthenticated;
    private _authOnReconnect;
    private _lastPubSeq;
    private _lastAuthSeq;
    private _isOpen;
    private _ws;
    private _isClosing;
    private _isReconnecting;
    private _prevChannelMap;
    private _onWSOpen;
    private _onWSClose;
    private _onWSError;
    private _onWSMessage;
    private _triggerPacketWD;
    _sendCalc: (...args: any[]) => void;
    constructor(opts?: WSv2Options);
    getURL(): string;
    usesAgent(): boolean;
    updateAuthArgs(args?: Partial<WSv2['_authArgs']>): void;
    getAuthArgs(): WSv2['_authArgs'];
    getDataChannelCount(): number;
    hasChannel(chanId: number | string): boolean;
    hasSubscriptionRef(channel: string, identifier: string): boolean;
    getDataChannelId(type: string, filter: Record<string, any>): string | undefined;
    hasDataChannel(type: string, filter: Record<string, any>): boolean;
    open(): Promise<void>;
    close(code?: number, reason?: string): Promise<void>;
    auth(calc?: number, dms?: number): Promise<void>;
    reconnect(): Promise<void>;
    reconnectAfterClose(): Promise<void>;
    private _validateMessageSeq;
    private _triggerPacketWDHandler;
    private _resetPacketWD;
    resubscribePreviousChannels(): void;
    private _onWSOpenHandler;
    private _onWSCloseHandler;
    private _onWSErrorHandler;
    private _onWSNotification;
    private _onWSMessageHandler;
    private _handleChannelMessage;
    private _handleOBChecksumMessage;
    private _handleOBMessage;
    private _updateManagedOB;
    private _verifyManagedOBChecksum;
    getOB(symbol: string): any;
    getLosslessOB(symbol: string): any;
    private _handleTradeMessage;
    private _handleTickerMessage;
    private _handleCandleMessage;
    private _handleStatusMessage;
    private _updateManagedCandles;
    getCandles(key: string): any[];
    private _handleAuthMessage;
    private _propagateMessageToListeners;
    static _notifyListenerGroup(lGroup: ListenerGroup, msg: any[], transform: boolean, ws: WSv2, _chanData: any): void;
    static _payloadPassesFilter(payload: any, filter: Record<string, any>): boolean;
    static _notifyCatchAllListeners(lGroup: ListenerGroup, data: any): void;
    private _handleEventMessage;
    private _handleConfigEvent;
    private _handlePongEvent;
    private _handleErrorEvent;
    private _handleAuthEvent;
    private _handleSubscribedEvent;
    private _handleUnsubscribedEvent;
    private _handleInfoEvent;
    managedSubscribe(channel?: string, identifier?: string, payload?: Record<string, any>): boolean;
    managedUnsubscribe(channel?: string, identifier?: string): boolean;
    getChannelData({ chanId, channel, symbol, key }: {
        chanId?: number;
        channel?: string;
        symbol?: string;
        key?: string;
    }): ChannelData | null;
    _chanIdByIdentifier(channel: string, identifier: string): string | null;
    private _getEventPromise;
    private _getEventPromiseWithTimeout;
    send(msg: any): boolean;
    sequencingEnabled(): boolean;
    enableSequencing(args?: {
        audit?: boolean;
    }): Promise<void>;
    enableFlag(flag: number): Promise<any>;
    sendEnabledFlags(): void;
    isFlagEnabled(flag: number): boolean;
    private _getConfigEventKey;
    onServerRestart(cb: (msg: any) => void): () => void;
    onMaintenanceStart(cb: (msg: any) => void): () => void;
    onMaintenanceEnd(cb: (msg: any) => void): () => void;
    subscribe(channel: string, payload?: Record<string, any>): void;
    subscribeTicker(symbol: string): Promise<boolean>;
    subscribeTrades(symbol: string): Promise<boolean>;
    subscribeOrderBook(symbol: string, prec?: string, len?: string): Promise<boolean>;
    subscribeCandles(key: string): Promise<boolean>;
    subscribeStatus(key: string): Promise<boolean>;
    unsubscribe(chanId: number | string): void;
    unsubscribeTicker(symbol: string): Promise<boolean>;
    unsubscribeTrades(symbol: string): Promise<boolean>;
    unsubscribeOrderBook(symbol: string): Promise<boolean>;
    unsubscribeCandles(symbol: string, frame: string): Promise<boolean>;
    unsubscribeStatus(key: string): Promise<boolean>;
    removeListeners(cbGID: string | number): void;
    requestCalc(prefixes: string[]): void;
    private _sendCalcImpl;
    submitOrder(params: any): Promise<any>;
    updateOrder(changes?: any): Promise<any>;
    cancelOrder(order: any): Promise<any>;
    cancelOrders(params: any): Promise<any[]>;
    submitOrderMultiOp(opPayloads: any[]): Promise<boolean>;
    private _sendOrderPacket;
    private _hasOrderBuff;
    private _ensureOrderBuffTimeout;
    private _flushOrderOps;
    isAuthenticated(): boolean;
    isOpen(): boolean;
    isReconnecting(): boolean;
    notifyUI(opts?: {
        type?: string;
        message?: string;
        level?: string;
        image?: string;
        link?: string;
        sound?: string;
    }): void;
    private _registerListener;
    onInfoMessage(code: number, cb: (msg: any) => void): () => void;
    onMessage({ cbGID }: {
        cbGID?: string | number;
    }, cb: (...args: any[]) => void): void;
    onCandle({ key, cbGID }: {
        key: string;
        cbGID?: string | number;
    }, cb: (...args: any[]) => void): void;
    onOrderBook({ symbol, prec, len, cbGID }: {
        symbol?: string;
        prec?: string;
        len?: string;
        cbGID?: string | number;
    }, cb: (...args: any[]) => void): void;
    onOrderBookChecksum({ symbol, prec, len, cbGID }: {
        symbol?: string;
        prec?: string;
        len?: string;
        cbGID?: string | number;
    }, cb: (...args: any[]) => void): void;
    onTrades({ symbol, pair, cbGID }: {
        symbol?: string;
        pair?: string;
        cbGID?: string | number;
    }, cb: (...args: any[]) => void): void;
    onTradeEntry({ pair, symbol, cbGID }: {
        pair?: string;
        symbol?: string;
        cbGID?: string | number;
    }, cb: (...args: any[]) => void): void;
    onAccountTradeEntry({ symbol, cbGID }: {
        symbol?: string;
        cbGID?: string | number;
    }, cb: (...args: any[]) => void): void;
    onAccountTradeUpdate({ symbol, cbGID }: {
        symbol?: string;
        cbGID?: string | number;
    }, cb: (...args: any[]) => void): void;
    onTicker({ symbol, cbGID }: {
        symbol?: string;
        cbGID?: string | number;
    } | undefined, cb: (...args: any[]) => void): void;
    onStatus({ key, cbGID }: {
        key?: string;
        cbGID?: string | number;
    } | undefined, cb: (...args: any[]) => void): void;
    onOrderSnapshot({ symbol, id, cid, gid, cbGID }: {
        symbol?: string;
        id?: number;
        cid?: number;
        gid?: number;
        cbGID?: string | number;
    }, cb: (...args: any[]) => void): void;
    onOrderNew({ symbol, id, cid, gid, cbGID }: {
        symbol?: string;
        id?: number;
        cid?: number;
        gid?: number;
        cbGID?: string | number;
    }, cb: (...args: any[]) => void): void;
    onOrderUpdate({ symbol, id, cid, gid, cbGID }: {
        symbol?: string;
        id?: number;
        cid?: number;
        gid?: number;
        cbGID?: string | number;
    }, cb: (...args: any[]) => void): void;
    onOrderClose({ symbol, id, cid, gid, cbGID }: {
        symbol?: string;
        id?: number;
        cid?: number;
        gid?: number;
        cbGID?: string | number;
    }, cb: (...args: any[]) => void): void;
    onPositionSnapshot({ symbol, cbGID }: {
        symbol?: string;
        cbGID?: string | number;
    }, cb: (...args: any[]) => void): void;
    onPositionNew({ symbol, cbGID }: {
        symbol?: string;
        cbGID?: string | number;
    }, cb: (...args: any[]) => void): void;
    onPositionUpdate({ symbol, cbGID }: {
        symbol?: string;
        cbGID?: string | number;
    }, cb: (...args: any[]) => void): void;
    onPositionClose({ symbol, cbGID }: {
        symbol?: string;
        cbGID?: string | number;
    }, cb: (...args: any[]) => void): void;
    onFundingOfferSnapshot({ symbol, cbGID }: {
        symbol?: string;
        cbGID?: string | number;
    }, cb: (...args: any[]) => void): void;
    onFundingOfferNew({ symbol, cbGID }: {
        symbol?: string;
        cbGID?: string | number;
    }, cb: (...args: any[]) => void): void;
    onFundingOfferUpdate({ symbol, cbGID }: {
        symbol?: string;
        cbGID?: string | number;
    }, cb: (...args: any[]) => void): void;
    onFundingOfferClose({ symbol, cbGID }: {
        symbol?: string;
        cbGID?: string | number;
    }, cb: (...args: any[]) => void): void;
    onFundingCreditSnapshot({ symbol, cbGID }: {
        symbol?: string;
        cbGID?: string | number;
    }, cb: (...args: any[]) => void): void;
    onFundingCreditNew({ symbol, cbGID }: {
        symbol?: string;
        cbGID?: string | number;
    }, cb: (...args: any[]) => void): void;
    onFundingCreditUpdate({ symbol, cbGID }: {
        symbol?: string;
        cbGID?: string | number;
    }, cb: (...args: any[]) => void): void;
    onFundingCreditClose({ symbol, cbGID }: {
        symbol?: string;
        cbGID?: string | number;
    }, cb: (...args: any[]) => void): void;
    onFundingLoanSnapshot({ symbol, cbGID }: {
        symbol?: string;
        cbGID?: string | number;
    }, cb: (...args: any[]) => void): void;
    onFundingLoanNew({ symbol, cbGID }: {
        symbol?: string;
        cbGID?: string | number;
    }, cb: (...args: any[]) => void): void;
    onFundingLoanUpdate({ symbol, cbGID }: {
        symbol?: string;
        cbGID?: string | number;
    }, cb: (...args: any[]) => void): void;
    onFundingLoanClose({ symbol, cbGID }: {
        symbol?: string;
        cbGID?: string | number;
    }, cb: (...args: any[]) => void): void;
    onWalletSnapshot({ cbGID }: {
        cbGID?: string | number;
    }, cb: (...args: any[]) => void): void;
    onWalletUpdate({ cbGID }: {
        cbGID?: string | number;
    }, cb: (...args: any[]) => void): void;
    onBalanceInfoUpdate({ cbGID }: {
        cbGID?: string | number;
    }, cb: (...args: any[]) => void): void;
    onMarginInfoUpdate({ cbGID }: {
        cbGID?: string | number;
    }, cb: (...args: any[]) => void): void;
    onFundingInfoUpdate({ cbGID }: {
        cbGID?: string | number;
    }, cb: (...args: any[]) => void): void;
    onFundingTradeEntry({ symbol, cbGID }: {
        symbol?: string;
        cbGID?: string | number;
    }, cb: (...args: any[]) => void): void;
    onFundingTradeUpdate({ symbol, cbGID }: {
        symbol?: string;
        cbGID?: string | number;
    }, cb: (...args: any[]) => void): void;
    onNotification({ type, cbGID }: {
        type?: string;
        cbGID?: string | number;
    }, cb: (...args: any[]) => void): void;
}
export default WSv2;
//# sourceMappingURL=ws2.d.ts.map