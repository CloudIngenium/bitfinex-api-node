import { EventEmitter } from 'events';
import { debuglog } from 'node:util';
import PromiseThrottleModule from 'promise-throttle';
// Handle both ESM default export and CJS interop
const PromiseThrottle = PromiseThrottleModule.default || PromiseThrottleModule;
import deepEqual from './util/deep_equal.js';
import WSv2 from './transports/ws2.js';
const debug = debuglog('bfx_ws2_manager');
const DATA_CHANNEL_LIMIT = 30;
const reconnectThrottler = new PromiseThrottle({
    requestsPerSecond: 10 / 60.0,
    promiseImplementation: Promise
});
/**
 * Provides a wrapper around the WSv2 class, opening new sockets when a
 * subscription would push a single socket over the data channel limit.
 */
class WS2Manager extends EventEmitter {
    _authArgs;
    _sockets;
    _socketArgs;
    constructor(socketArgs, authArgs = { calc: 0, dms: 0 }) {
        super();
        this.setMaxListeners(1000);
        this._authArgs = { calc: 0, dms: 0, ...authArgs };
        this._sockets = [];
        this._socketArgs = {
            ...(socketArgs || {}),
            reconnectThrottler
        };
    }
    setAuthArgs(args = {}) {
        this._authArgs = {
            ...this._authArgs,
            ...args
        };
        this._sockets.forEach(socket => socket.ws.updateAuthArgs(this._authArgs));
    }
    getAuthArgs() {
        return this._authArgs;
    }
    async reconnect() {
        return Promise.all(this._sockets.map(socket => socket.ws.reconnect()));
    }
    async close() {
        await Promise.all(this._sockets.map(socket => {
            if (typeof socket.ws.removeAllListeners === 'function') {
                socket.ws.removeAllListeners();
            }
            return socket.ws.close();
        }));
        this._sockets = [];
    }
    static getDataChannelCount(s) {
        let count = s.ws.getDataChannelCount();
        count += s.pendingSubscriptions.length;
        count -= s.pendingUnsubscriptions.length;
        return count;
    }
    getNumSockets() {
        return this._sockets.length;
    }
    getSocket(i) {
        return this._sockets[i];
    }
    getSocketInfo() {
        return this._sockets.map(s => ({
            nChannels: WS2Manager.getDataChannelCount(s)
        }));
    }
    auth({ apiKey, apiSecret, calc, dms } = {}) {
        if (this._socketArgs.apiKey || this._socketArgs.apiSecret) {
            debug('error: auth credentials already provided! refusing auth');
            return;
        }
        this._socketArgs.apiKey = apiKey;
        this._socketArgs.apiSecret = apiSecret;
        if (Number.isFinite(calc))
            this._authArgs.calc = calc;
        if (Number.isFinite(dms))
            this._authArgs.dms = dms;
        if (apiKey)
            this._authArgs.apiKey = apiKey;
        if (apiSecret)
            this._authArgs.apiSecret = apiSecret;
        this._sockets.forEach(s => {
            if (!s.ws.isAuthenticated()) {
                s.ws.updateAuthArgs(this._authArgs);
                s.ws.auth().catch((err) => {
                    debug('error authenticating socket: %s', err.message);
                    this.emit('error', err, s.ws);
                });
            }
        });
    }
    openSocket() {
        const { apiKey, apiSecret } = this._socketArgs;
        const ws = new WSv2(this._socketArgs);
        const wsState = {
            pendingSubscriptions: [],
            pendingUnsubscriptions: [],
            ws
        };
        ws.updateAuthArgs(this._authArgs);
        ws.on('open', () => this.emit('open', ws));
        ws.on('message', (msg = {}) => this.emit('message', msg, ws));
        ws.on('error', (error) => this.emit('error', error, ws));
        ws.on('auth', () => this.emit('auth', ws));
        ws.on('close', () => {
            this.emit('close', ws);
            wsState.pendingSubscriptions = [];
            wsState.pendingUnsubscriptions = [];
            const idx = this._sockets.indexOf(wsState);
            if (idx !== -1) {
                this._sockets.splice(idx, 1);
            }
        });
        ws.on('subscribed', (msg = {}) => {
            this.emit('subscribed', msg);
            const i = wsState.pendingSubscriptions.findIndex(sub => {
                const subFilter = sub[1];
                const filterKeys = Object.keys(subFilter);
                const fv = {};
                for (const k of filterKeys) {
                    fv[k] = msg[k];
                }
                return ((sub[0] === msg.channel) &&
                    deepEqual(fv, subFilter));
            });
            if (i === -1) {
                debug('error removing pending sub: %j', msg);
                return;
            }
            wsState.pendingSubscriptions.splice(i, 1);
        });
        ws.on('unsubscribed', (msg = {}) => {
            this.emit('unsubscribed', msg);
            const { chanId } = msg;
            const i = wsState.pendingUnsubscriptions.findIndex(cid => (cid === `${chanId}`));
            if (i === -1) {
                debug('error removing pending unsub: %j', msg);
                return;
            }
            wsState.pendingUnsubscriptions.splice(i, 1);
        });
        if (apiKey && apiSecret) {
            ws.once('open', () => {
                debug('authenticating socket...');
                ws.auth().then(() => {
                    return debug('socket authenticated');
                }).catch((err) => {
                    debug('error authenticating socket: %s', err.message);
                });
            });
        }
        ws.open().then(() => {
            return debug('socket connection opened');
        }).catch((err) => {
            debug('error opening socket: %s', err.stack);
            this.emit('error', err, ws);
        });
        this._sockets.push(wsState);
        return wsState;
    }
    getAuthenticatedSocket() {
        return this._sockets.find(s => s.ws.isAuthenticated());
    }
    getFreeDataSocket() {
        return this._sockets.find(s => (WS2Manager.getDataChannelCount(s) < DATA_CHANNEL_LIMIT));
    }
    getSocketWithDataChannel(type, filter) {
        return this._sockets.find(s => {
            const subI = s.pendingSubscriptions.findIndex(sub => (sub[0] === type && deepEqual(sub[1], filter)));
            if (subI !== -1) {
                return true;
            }
            const cid = s.ws.getDataChannelId(type, filter);
            if (!cid) {
                return false;
            }
            return cid && !s.pendingUnsubscriptions.some(id => `${id}` === `${cid}`);
        });
    }
    getSocketWithChannel(chanId) {
        const chanIdStr = `${chanId}`;
        return this._sockets.find(s => {
            return (s.ws.hasChannel(chanId) &&
                !s.pendingUnsubscriptions.some(id => `${id}` === chanIdStr));
        });
    }
    getSocketWithSubRef(channel, identifier) {
        return this._sockets.find(s => s.ws.hasSubscriptionRef(channel, identifier));
    }
    withAllSockets(cb) {
        this._sockets.forEach((ws2) => {
            cb(ws2);
        });
    }
    subscribe(type, ident, filter) {
        let s = this.getFreeDataSocket();
        if (!s) {
            s = this.openSocket();
        }
        const doSub = () => {
            s.ws.managedSubscribe(type, ident, filter);
        };
        if (!s.ws.isOpen()) {
            s.ws.once('open', doSub);
        }
        else {
            doSub();
        }
        s.pendingSubscriptions.push([type, filter]);
    }
    managedUnsubscribe(channel, identifier) {
        const s = this.getSocketWithSubRef(channel, identifier);
        if (!s) {
            debug('cannot unsub from unknown channel %s: %s', channel, identifier);
            return;
        }
        const chanId = s.ws._chanIdByIdentifier(channel, identifier);
        s.ws.managedUnsubscribe(channel, identifier);
        s.pendingUnsubscriptions.push(`${chanId}`);
    }
    unsubscribe(chanId) {
        const s = this.getSocketWithChannel(chanId);
        if (!s) {
            debug('cannot unsub from unknown channel: %d', chanId);
            return;
        }
        s.ws.unsubscribe(chanId);
        s.pendingUnsubscriptions.push(`${chanId}`);
    }
    subscribeTicker(symbol) {
        this.subscribe('ticker', symbol, { symbol });
    }
    subscribeTrades(symbol) {
        this.subscribe('trades', symbol, { symbol });
    }
    subscribeOrderBook(symbol, prec = 'P0', len = '25', freq = 'F0') {
        const filter = {};
        if (symbol)
            filter.symbol = symbol;
        if (prec)
            filter.prec = prec;
        if (len)
            filter.len = len;
        if (freq)
            filter.freq = freq;
        this.subscribe('book', symbol, filter);
    }
    subscribeCandles(key) {
        this.subscribe('candles', key, { key });
    }
    onCandle({ key, cbGID }, cb) {
        const s = this.getSocketWithDataChannel('candles', { key });
        if (!s) {
            throw new Error('no data socket available; did you provide a key?');
        }
        s.ws.onCandle({ key, cbGID }, cb);
    }
    onOrderBook({ symbol, prec = 'P0', len = '25', freq = 'F0', cbGID }, cb) {
        const filter = {};
        if (symbol)
            filter.symbol = symbol;
        if (prec)
            filter.prec = prec;
        if (len)
            filter.len = len;
        if (freq)
            filter.freq = freq;
        const s = this.getSocketWithDataChannel('book', filter);
        if (!s) {
            throw new Error('no data socket available; did you provide a symbol?');
        }
        s.ws.onOrderBook({ cbGID, ...filter }, cb);
    }
    onTrades({ symbol, cbGID }, cb) {
        const s = this.getSocketWithDataChannel('trades', { symbol });
        if (!s) {
            throw new Error('no data socket available; did you provide a symbol?');
        }
        s.ws.onTrades({ symbol, cbGID }, cb);
    }
    onTicker({ symbol = '', cbGID } = {}, cb) {
        const s = this.getSocketWithDataChannel('ticker', { symbol });
        if (!s) {
            throw new Error('no data socket available; did you provide a symbol?');
        }
        s.ws.onTicker({ symbol, cbGID }, cb);
    }
}
export default WS2Manager;
//# sourceMappingURL=ws2_manager.js.map