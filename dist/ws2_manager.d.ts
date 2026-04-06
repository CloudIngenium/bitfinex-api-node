import { EventEmitter } from 'events';
import WSv2 from './transports/ws2.js';
interface SocketState {
    pendingSubscriptions: Array<[string, Record<string, any>]>;
    pendingUnsubscriptions: string[];
    ws: WSv2;
}
/**
 * Provides a wrapper around the WSv2 class, opening new sockets when a
 * subscription would push a single socket over the data channel limit.
 */
declare class WS2Manager extends EventEmitter {
    private _authArgs;
    private _sockets;
    private _socketArgs;
    constructor(socketArgs?: any, authArgs?: {
        calc?: number;
        dms?: number;
    });
    setAuthArgs(args?: Partial<WS2Manager['_authArgs']>): void;
    getAuthArgs(): WS2Manager['_authArgs'];
    reconnect(): Promise<void[]>;
    close(): Promise<void>;
    static getDataChannelCount(s: SocketState): number;
    getNumSockets(): number;
    getSocket(i: number): SocketState;
    getSocketInfo(): Array<{
        nChannels: number;
    }>;
    auth({ apiKey, apiSecret, calc, dms }?: {
        apiKey?: string;
        apiSecret?: string;
        calc?: number;
        dms?: number;
    }): void;
    openSocket(): SocketState;
    getAuthenticatedSocket(): SocketState | undefined;
    getFreeDataSocket(): SocketState | undefined;
    getSocketWithDataChannel(type: string, filter: Record<string, any>): SocketState | undefined;
    getSocketWithChannel(chanId: number | string): SocketState | undefined;
    getSocketWithSubRef(channel: string, identifier: string): SocketState | undefined;
    withAllSockets(cb: (state: SocketState) => void): void;
    subscribe(type: string, ident: string, filter: Record<string, any>): void;
    managedUnsubscribe(channel: string, identifier: string): void;
    unsubscribe(chanId: number | string): void;
    subscribeTicker(symbol: string): void;
    subscribeTrades(symbol: string): void;
    subscribeOrderBook(symbol: string, prec?: string, len?: string, freq?: string): void;
    subscribeCandles(key: string): void;
    onCandle({ key, cbGID }: {
        key: string;
        cbGID?: string | number;
    }, cb: (...args: any[]) => void): void;
    onOrderBook({ symbol, prec, len, freq, cbGID }: {
        symbol?: string;
        prec?: string;
        len?: string;
        freq?: string;
        cbGID?: string | number;
    }, cb: (...args: any[]) => void): void;
    onTrades({ symbol, cbGID }: {
        symbol?: string;
        cbGID?: string | number;
    }, cb: (...args: any[]) => void): void;
    onTicker({ symbol, cbGID }: {
        symbol?: string;
        cbGID?: string | number;
    } | undefined, cb: (...args: any[]) => void): void;
}
export default WS2Manager;
//# sourceMappingURL=ws2_manager.d.ts.map