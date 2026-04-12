import { EventEmitter } from 'events';
import { createHmac } from 'node:crypto';
import { debuglog } from 'node:util';
import WebSocket from 'ws';
import * as LosslessJSON from 'lossless-json';
import { BalanceInfo, FundingCredit, FundingInfo, FundingLoan, FundingOffer, FundingTrade, MarginInfo, Notification, Order, Position, Trade, PublicTrade, Wallet, OrderBook, Candle, TradingTicker, FundingTicker } from '@cloudingenium/bfx-api-node-models';
import getMessagePayload from '../util/ws2.js';
import throttle from '../util/throttle.js';
function genAuthSig(apiSecret, payload) {
    const sig = createHmac('sha384', apiSecret ?? '').update(payload).digest('hex');
    return { sig };
}
let _lastNonce = Date.now() * 1000;
function nonce() {
    const now = Date.now() * 1000;
    _lastNonce = (_lastNonce < now) ? now : _lastNonce + 1;
    return _lastNonce.toString();
}
const debug = debuglog('bfx_ws2');
const DATA_CHANNEL_TYPES = ['ticker', 'book', 'candles', 'trades'];
const UCM_NOTIFICATION_TYPE = 'ucm-notify-ui';
const MAX_CALC_OPS = 8;
/**
 * Simple callback queue replacing cbq package.
 * Maps string keys to arrays of callbacks, triggers them once.
 */
class CallbackQueue {
    q = new Map();
    push(key, cb) {
        if (!this.q.has(key)) {
            this.q.set(key, []);
        }
        this.q.get(key).push(cb);
    }
    trigger(key, err, res) {
        const cbs = this.q.get(key);
        if (!cbs)
            return;
        this.q.delete(key);
        for (const cb of cbs) {
            cb(err, res);
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
    };
    static info = {
        SERVER_RESTART: 20051,
        MAINTENANCE_START: 20060,
        MAINTENANCE_END: 20061
    };
    static url = 'wss://api.bitfinex.com/ws/2';
    _affCode;
    _agent;
    _url;
    _transform;
    _orderOpBufferDelay;
    _orderOpBuffer;
    _orderOpTimeout;
    _seqAudit;
    _autoReconnect;
    _reconnectDelay;
    _reconnectThrottler;
    _manageOrderBooks;
    _manageCandles;
    _packetWDDelay;
    _packetWDTimeout;
    _packetWDLastTS;
    _orderBooks;
    _losslessOrderBooks;
    _candles;
    _authArgs;
    _listeners;
    _infoListeners;
    _subscriptionRefs;
    _channelMap;
    _enabledFlags;
    _eventCallbacks;
    _isAuthenticated;
    _authOnReconnect;
    _lastPubSeq;
    _lastAuthSeq;
    _isOpen;
    _ws;
    _isClosing;
    _isReconnecting;
    _prevChannelMap;
    _onWSOpen;
    _onWSClose;
    _onWSError;
    _onWSMessage;
    _triggerPacketWD;
    _sendCalc;
    constructor(opts = {}) {
        super();
        this.setMaxListeners(1000);
        this._affCode = opts.affCode ?? undefined;
        this._agent = opts.agent;
        this._url = opts.url || WSv2.url;
        this._transform = opts.transform === true;
        this._orderOpBufferDelay = opts.orderOpBufferDelay || -1;
        this._orderOpBuffer = [];
        this._orderOpTimeout = null;
        this._seqAudit = opts.seqAudit === true;
        this._autoReconnect = opts.autoReconnect === true;
        this._reconnectDelay = opts.reconnectDelay || 1000;
        this._reconnectThrottler = opts.reconnectThrottler;
        this._manageOrderBooks = opts.manageOrderBooks === true;
        this._manageCandles = opts.manageCandles === true;
        this._packetWDDelay = opts.packetWDDelay;
        this._packetWDTimeout = null;
        this._packetWDLastTS = 0;
        this._orderBooks = {};
        this._losslessOrderBooks = {};
        this._candles = {};
        this._authArgs = {
            apiKey: opts.apiKey,
            apiSecret: opts.apiSecret
        };
        this._listeners = {};
        this._infoListeners = {};
        this._subscriptionRefs = {};
        this._channelMap = {};
        this._enabledFlags = this._seqAudit ? WSv2.flags.SEQ_ALL : 0;
        this._eventCallbacks = new CallbackQueue();
        this._isAuthenticated = false;
        this._authOnReconnect = false;
        this._lastPubSeq = -1;
        this._lastAuthSeq = -1;
        this._isOpen = false;
        this._ws = null;
        this._isClosing = false;
        this._isReconnecting = false;
        this._prevChannelMap = {};
        this._onWSOpen = this._onWSOpenHandler.bind(this);
        this._onWSClose = this._onWSCloseHandler.bind(this);
        this._onWSError = this._onWSErrorHandler.bind(this);
        this._onWSMessage = this._onWSMessageHandler.bind(this);
        this._triggerPacketWD = this._triggerPacketWDHandler.bind(this);
        this._sendCalc = throttle(this._sendCalcImpl.bind(this), 1000 / MAX_CALC_OPS);
    }
    getURL() {
        return this._url;
    }
    usesAgent() {
        return !!this._agent;
    }
    updateAuthArgs(args = {}) {
        this._authArgs = {
            ...this._authArgs,
            ...args
        };
    }
    getAuthArgs() {
        const { apiSecret: _, ...safe } = this._authArgs;
        return safe;
    }
    getDataChannelCount() {
        return Object
            .values(this._channelMap)
            .filter(c => DATA_CHANNEL_TYPES.includes(c.channel))
            .length;
    }
    hasChannel(chanId) {
        return !!this._channelMap[chanId];
    }
    hasSubscriptionRef(channel, identifier) {
        return `${channel}:${identifier}` in this._subscriptionRefs;
    }
    getDataChannelId(type, filter) {
        const filterKeys = Object.keys(filter);
        return Object
            .keys(this._channelMap)
            .find(cid => {
            const c = this._channelMap[cid];
            if (c.channel !== type)
                return false;
            for (const k of filterKeys) {
                if (c[k] !== filter[k])
                    return false;
            }
            return true;
        });
    }
    hasDataChannel(type, filter) {
        return !!this.getDataChannelId(type, filter);
    }
    async open() {
        if (this._isOpen || this._ws !== null) {
            throw new Error('already open');
        }
        debug('connecting to %s...', this._url);
        try {
            this._ws = new WebSocket(this._url, {
                agent: this._agent
            });
        }
        catch (err) {
            this._ws = null;
            throw err;
        }
        this._subscriptionRefs = {};
        this._candles = {};
        this._orderBooks = {};
        this._ws.on('message', this._onWSMessage);
        this._ws.on('error', this._onWSError);
        this._ws.on('close', this._onWSClose);
        return new Promise((resolve, reject) => {
            this._ws.once('open', () => {
                this._onWSOpen();
                if (this._enabledFlags !== 0) {
                    this.sendEnabledFlags();
                }
                debug('connected');
                resolve();
            });
            this._ws.once('error', (err) => {
                if (!this._isOpen) {
                    reject(err);
                }
            });
        });
    }
    async close(code, reason) {
        if (!this._isOpen || this._ws === null) {
            throw new Error('not open');
        }
        debug('disconnecting...');
        if (this._orderOpTimeout !== null) {
            clearTimeout(this._orderOpTimeout);
            this._orderOpTimeout = null;
        }
        this._orderOpBuffer = [];
        if (this._packetWDTimeout !== null) {
            clearTimeout(this._packetWDTimeout);
            this._packetWDTimeout = null;
        }
        return new Promise((resolve) => {
            this._ws.once('close', () => {
                this._isOpen = false;
                this._ws = null;
                debug('disconnected');
                resolve();
            });
            if (!this._isClosing) {
                this._isClosing = true;
                this._ws.close(code, reason);
            }
        });
    }
    async auth(calc, dms) {
        this._authOnReconnect = true;
        if (!this._isOpen) {
            throw new Error('not open');
        }
        if (this._isAuthenticated) {
            throw new Error('already authenticated');
        }
        const authNonce = nonce();
        const authPayload = `AUTH${authNonce}${authNonce}`;
        const { sig } = genAuthSig(this._authArgs.apiSecret, authPayload);
        const { apiKey: _key, apiSecret: _secret, ...extraAuthArgs } = this._authArgs;
        if (Number.isFinite(calc))
            extraAuthArgs.calc = calc;
        if (Number.isFinite(dms))
            extraAuthArgs.dms = dms;
        return new Promise((resolve) => {
            this.once('auth', () => {
                debug('authenticated');
                resolve();
            });
            this.send({
                event: 'auth',
                apiKey: this._authArgs.apiKey,
                authSig: sig,
                authPayload,
                authNonce,
                ...extraAuthArgs
            });
        });
    }
    async reconnect() {
        if (this._isReconnecting) {
            debug('reconnect already in progress, skipping');
            return;
        }
        this._isReconnecting = true;
        if (this._ws !== null && this._isOpen) {
            await this.close();
            return new Promise((resolve) => {
                this.once(this._authOnReconnect ? 'auth' : 'open', resolve);
            });
        }
        return this.reconnectAfterClose();
    }
    async reconnectAfterClose() {
        if (!this._isReconnecting || this._ws !== null || this._isOpen) {
            return this.reconnect();
        }
        await this.open();
        if (this._authOnReconnect) {
            await this.auth();
        }
    }
    _validateMessageSeq(msg = []) {
        if (!this._seqAudit)
            return null;
        if (!Array.isArray(msg))
            return null;
        if (msg.length === 0)
            return null;
        const authSeq = msg[0] === 0 && msg[1] !== 'hb'
            ? msg[msg.length - 1]
            : NaN;
        if (`${(msg[2] || [])[1] || ''}`.slice(-4) !== '-req') {
            const seq = ((msg[0] === 0) &&
                (msg[1] !== 'hb') &&
                !(msg[1] === 'n' && ((msg[2] || [])[1] || '').slice(-4) === '-req'))
                ? msg[msg.length - 2]
                : msg[msg.length - 1];
            if (!Number.isFinite(seq))
                return null;
            if (this._lastPubSeq === -1) {
                this._lastPubSeq = seq;
                return null;
            }
            if (seq !== this._lastPubSeq + 1) {
                return new Error(`invalid pub seq #; last ${this._lastPubSeq}, got ${seq}`);
            }
            this._lastPubSeq = seq;
        }
        if (!Number.isFinite(authSeq))
            return null;
        if (authSeq === 0)
            return null;
        if (msg[1] === 'n') {
            return authSeq !== this._lastAuthSeq
                ? new Error(`invalid auth seq #, expected no advancement but got ${authSeq}`)
                : null;
        }
        if (authSeq === this._lastAuthSeq) {
            return new Error(`expected auth seq # advancement but got same seq: ${authSeq}`);
        }
        if (this._lastAuthSeq !== -1 && authSeq !== this._lastAuthSeq + 1) {
            return new Error(`invalid auth seq #; last ${this._lastAuthSeq}, got ${authSeq}`);
        }
        this._lastAuthSeq = authSeq;
        return null;
    }
    async _triggerPacketWDHandler() {
        if (!this._packetWDDelay || !this._isOpen) {
            return;
        }
        debug('packet delay watchdog triggered [last packet %dms ago]', Date.now() - this._packetWDLastTS);
        this._packetWDTimeout = null;
        return this.reconnect();
    }
    _resetPacketWD() {
        if (!this._packetWDDelay)
            return;
        if (this._packetWDTimeout !== null) {
            clearTimeout(this._packetWDTimeout);
        }
        if (!this._isOpen)
            return;
        this._packetWDTimeout = setTimeout(() => {
            this._triggerPacketWD().catch((err) => {
                debug('error triggering packet watchdog: %s', err.message);
            });
        }, this._packetWDDelay);
    }
    resubscribePreviousChannels() {
        Object.values(this._prevChannelMap).forEach((chan) => {
            const { channel } = chan;
            switch (channel) {
                case 'ticker': {
                    const { symbol } = chan;
                    if (symbol)
                        this.subscribeTicker(symbol);
                    break;
                }
                case 'trades': {
                    const { symbol } = chan;
                    if (symbol)
                        this.subscribeTrades(symbol);
                    break;
                }
                case 'book': {
                    const { symbol, len, prec } = chan;
                    if (symbol)
                        this.subscribeOrderBook(symbol, prec, len);
                    break;
                }
                case 'candles': {
                    const { key } = chan;
                    if (key)
                        this.subscribeCandles(key);
                    break;
                }
                default: {
                    debug('unknown previously subscribed channel type: %s', channel);
                }
            }
        });
    }
    _onWSOpenHandler() {
        this._isOpen = true;
        this._isReconnecting = false;
        this._packetWDLastTS = Date.now();
        this._lastAuthSeq = -1;
        this._lastPubSeq = -1;
        this.emit('open');
        if (Object.keys(this._prevChannelMap).length > 0) {
            this.resubscribePreviousChannels();
            this._prevChannelMap = {};
        }
        debug('connection open');
    }
    async _onWSCloseHandler() {
        this._isOpen = false;
        this._isAuthenticated = false;
        this._lastAuthSeq = -1;
        this._lastPubSeq = -1;
        this._enabledFlags = 0;
        this._ws = null;
        this._subscriptionRefs = {};
        this.emit('close');
        debug('connection closed');
        const shouldReconnect = this._isReconnecting || (this._autoReconnect && !this._isClosing);
        if (shouldReconnect) {
            this._prevChannelMap = this._channelMap;
        }
        this._channelMap = {};
        this._isClosing = false;
        if (shouldReconnect) {
            setTimeout(async () => {
                try {
                    if (this._reconnectThrottler) {
                        await this._reconnectThrottler.add(this.reconnectAfterClose.bind(this));
                    }
                    else {
                        await this.reconnectAfterClose();
                    }
                }
                catch (err) {
                    this._isReconnecting = false;
                    debug('error reconnectAfterClose: %s', err.stack);
                    this.emit('error', new Error(`auto-reconnect failed: ${err.message}`));
                }
            }, this._reconnectDelay);
        }
    }
    _onWSErrorHandler(err) {
        this.emit('error', err);
        debug('error: %s', err);
    }
    _onWSNotification(arrN) {
        if (!Array.isArray(arrN) || arrN.length < 8)
            return;
        const status = arrN[6];
        const msg = arrN[7];
        if (!arrN[4] || !Array.isArray(arrN[4]))
            return;
        let key = null;
        if (arrN[1] === 'on-req') {
            if (arrN[4].length < 3)
                return;
            key = `order-new-${arrN[4][2]}`;
        }
        else if (arrN[1] === 'oc-req') {
            key = `order-cancel-${arrN[4][0]}`;
        }
        else if (arrN[1] === 'ou-req') {
            key = `order-update-${arrN[4][0]}`;
        }
        if (key) {
            const err = status === 'SUCCESS' ? null : new Error(`${status}: ${msg}`);
            this._eventCallbacks.trigger(key, err, arrN[4]);
        }
    }
    _onWSMessageHandler(rawMsg, flags) {
        const rawMsgStr = rawMsg.toString();
        debug('recv msg: %s', rawMsgStr);
        this._packetWDLastTS = Date.now();
        this._resetPacketWD();
        let msg;
        try {
            msg = JSON.parse(rawMsgStr);
        }
        catch {
            this.emit('error', `invalid message JSON: ${rawMsgStr}`);
            return;
        }
        debug('recv msg: %j', msg);
        if (this._seqAudit) {
            const seqErr = this._validateMessageSeq(msg);
            if (seqErr !== null) {
                this.emit('error', seqErr);
                return;
            }
        }
        this.emit('message', msg, flags);
        if (Array.isArray(msg)) {
            this._handleChannelMessage(msg, rawMsgStr);
        }
        else if (msg.event) {
            this._handleEventMessage(msg);
        }
        else {
            debug('recv unidentified message: %j', msg);
        }
    }
    _handleChannelMessage(msg, rawMsg) {
        const [chanId, type] = msg;
        const channelData = this._channelMap[chanId];
        if (!channelData) {
            debug('recv msg from unknown channel %d: %j', chanId, msg);
            return;
        }
        if (msg.length < 2)
            return;
        if (msg[1] === 'hb')
            return;
        if (channelData.channel === 'book') {
            if (type === 'cs') {
                this._handleOBChecksumMessage(msg, channelData);
            }
            else {
                this._handleOBMessage(msg, channelData, rawMsg);
            }
        }
        else if (channelData.channel === 'trades') {
            this._handleTradeMessage(msg, channelData);
        }
        else if (channelData.channel === 'ticker') {
            this._handleTickerMessage(msg, channelData);
        }
        else if (channelData.channel === 'candles') {
            this._handleCandleMessage(msg, channelData);
        }
        else if (channelData.channel === 'status') {
            this._handleStatusMessage(msg, channelData);
        }
        else if (channelData.channel === 'auth') {
            this._handleAuthMessage(msg, channelData);
        }
        else {
            this._propagateMessageToListeners(msg, channelData);
            this.emit(channelData.channel, msg);
        }
    }
    _handleOBChecksumMessage(msg, chanData) {
        this.emit('cs', msg);
        if (!this._manageOrderBooks) {
            return;
        }
        const { symbol, prec } = chanData;
        const cs = msg[2];
        if (symbol && symbol[0] === 't') {
            const err = this._verifyManagedOBChecksum(symbol, prec, cs);
            if (err) {
                this.emit('error', err);
                return;
            }
        }
        const internalMessage = [chanData.chanId, 'ob_checksum', cs];
        internalMessage.filterOverride = [
            chanData.symbol,
            chanData.prec,
            chanData.len
        ];
        this._propagateMessageToListeners(internalMessage, false);
        this.emit('cs', symbol, cs);
    }
    _handleOBMessage(msg, chanData, rawMsg) {
        const { symbol, prec } = chanData;
        const raw = prec === 'R0';
        let data = getMessagePayload(msg);
        if (this._manageOrderBooks && symbol) {
            const err = this._updateManagedOB(symbol, data, raw, rawMsg);
            if (err) {
                this.emit('error', err);
                return;
            }
            data = this._orderBooks[symbol];
        }
        if (this._transform) {
            data = new OrderBook((Array.isArray(data[0]) ? data : [data]), raw);
        }
        const internalMessage = [chanData.chanId, 'orderbook', data];
        internalMessage.filterOverride = [
            chanData.symbol,
            chanData.prec,
            chanData.len
        ];
        this._propagateMessageToListeners(internalMessage, chanData, false);
        this.emit('orderbook', symbol, data);
    }
    _updateManagedOB(symbol, data, raw, rawMsg) {
        let rawLossless;
        try {
            rawLossless = LosslessJSON.parse(rawMsg, (_key, value) => {
                return (value && value.isLosslessNumber) ? value.toString() : value;
            });
        }
        catch (err) {
            return new Error(`lossless JSON parse error for OB ${symbol}: ${err.message}`);
        }
        if (!rawLossless || !Array.isArray(rawLossless)) {
            return new Error(`invalid lossless OB data for ${symbol}`);
        }
        const losslessUpdate = rawLossless[1];
        if (Array.isArray(data[0])) {
            this._orderBooks[symbol] = data;
            this._losslessOrderBooks[symbol] = losslessUpdate;
            return null;
        }
        if (!this._orderBooks[symbol]) {
            return new Error(`recv update for unknown OB: ${symbol}`);
        }
        OrderBook.updateArrayOBWith(this._orderBooks[symbol], data, raw);
        OrderBook.updateArrayOBWith(this._losslessOrderBooks[symbol], losslessUpdate, raw);
        return null;
    }
    _verifyManagedOBChecksum(symbol, prec, cs) {
        const ob = this._losslessOrderBooks[symbol];
        if (!ob)
            return null;
        const localCS = ob instanceof OrderBook
            ? ob.checksum()
            : OrderBook.checksumArr(ob, prec === 'R0');
        return localCS !== cs
            ? new Error(`OB checksum mismatch: got ${localCS}, want ${cs}`)
            : null;
    }
    getOB(symbol) {
        if (!this._orderBooks[symbol])
            return null;
        return new OrderBook(this._orderBooks[symbol]);
    }
    getLosslessOB(symbol) {
        if (!this._losslessOrderBooks[symbol])
            return null;
        return new OrderBook(this._losslessOrderBooks[symbol]);
    }
    _handleTradeMessage(msg, chanData) {
        let eventName;
        if (msg[1][0] === 'f') {
            eventName = msg[1];
        }
        else if (msg[1] === 'te') {
            eventName = 'trade-entry';
        }
        else {
            eventName = 'trades';
        }
        let data = getMessagePayload(msg);
        if (data && !Array.isArray(data[0])) {
            data = [data];
        }
        if (this._transform) {
            const M = eventName[0] === 'f' && msg[2].length === 8 ? FundingTrade : PublicTrade;
            const trades = M.unserialize(data);
            if (Array.isArray(trades) && trades.length === 1) {
                data = trades[0];
            }
            else {
                data = trades;
            }
            data = new M(data);
        }
        const internalMessage = [chanData.chanId, eventName, data];
        internalMessage.filterOverride = [chanData.symbol || chanData.pair];
        this._propagateMessageToListeners(internalMessage, chanData, false);
        this.emit('trades', chanData.symbol || chanData.pair, data);
    }
    _handleTickerMessage(msg = [], chanData = { channel: 'ticker' }) {
        const { symbol } = chanData;
        if (!symbol) {
            debug('ticker message missing symbol, ignoring');
            return;
        }
        let data = getMessagePayload(msg);
        if (this._transform) {
            data = symbol[0] === 't'
                ? new TradingTicker([symbol, ...msg[1]])
                : new FundingTicker([symbol, ...msg[1]]);
        }
        const internalMessage = [chanData.chanId, 'ticker', data];
        internalMessage.filterOverride = [symbol];
        this._propagateMessageToListeners(internalMessage, chanData, false);
        this.emit('ticker', symbol, data);
    }
    _handleCandleMessage(msg, chanData) {
        const { key } = chanData;
        let data = getMessagePayload(msg);
        if (this._manageCandles && key) {
            const err = this._updateManagedCandles(key, data);
            if (err) {
                this.emit('error', err);
                return;
            }
            data = this._candles[key];
        }
        else if (data && data.length > 0 && !Array.isArray(data[0])) {
            data = [data];
        }
        if (this._transform) {
            data = Candle.unserialize(data);
        }
        const internalMessage = [chanData.chanId, 'candle', data];
        internalMessage.filterOverride = [chanData.key];
        this._propagateMessageToListeners(internalMessage, chanData, false);
        this.emit('candle', data, key);
    }
    _handleStatusMessage(msg, chanData) {
        const { key } = chanData;
        const data = getMessagePayload(msg);
        const internalMessage = [chanData.chanId, 'status', data];
        internalMessage.filterOverride = [chanData.key];
        this._propagateMessageToListeners(internalMessage, chanData, false);
        this.emit('status', data, key);
    }
    _updateManagedCandles(key, data) {
        if (Array.isArray(data[0])) {
            data.sort((a, b) => b[0] - a[0]);
            this._candles[key] = data;
            return null;
        }
        if (!this._candles[key]) {
            return new Error(`recv update for unknown candles: ${key}`);
        }
        const candles = this._candles[key];
        let updated = false;
        for (let i = 0; i < candles.length; i++) {
            if (data[0] === candles[i][0]) {
                candles[i] = data;
                updated = true;
                break;
            }
        }
        if (!updated) {
            candles.unshift(data);
        }
        return null;
    }
    getCandles(key) {
        return this._candles[key] || [];
    }
    _handleAuthMessage(msg, chanData) {
        if (msg[1] === 'n') {
            const payload = getMessagePayload(msg);
            if (payload) {
                this._onWSNotification(payload);
            }
        }
        else if (msg[1] === 'te') {
            msg[1] = 'auth-te';
        }
        else if (msg[1] === 'tu') {
            msg[1] = 'auth-tu';
        }
        this._propagateMessageToListeners(msg, chanData);
    }
    _propagateMessageToListeners(msg, chan, transform = this._transform) {
        for (const gid of Object.keys(this._listeners)) {
            WSv2._notifyListenerGroup(this._listeners[gid], msg, transform, this, chan);
        }
    }
    static _notifyListenerGroup(lGroup, msg, transform, ws, _chanData) {
        const [, eventName, data = []] = msg;
        let filterByData;
        WSv2._notifyCatchAllListeners(lGroup, msg);
        if (!lGroup[eventName] || lGroup[eventName].length === 0)
            return;
        const listeners = lGroup[eventName].filter((listener) => {
            const { filter } = listener;
            if (!filter)
                return true;
            if (Array.isArray(data[0])) {
                const matchingData = data.filter((item) => {
                    filterByData = msg.filterOverride ? msg.filterOverride : item;
                    return WSv2._payloadPassesFilter(filterByData, filter);
                });
                return matchingData.length !== 0;
            }
            filterByData = msg.filterOverride ? msg.filterOverride : data;
            return WSv2._payloadPassesFilter(filterByData, filter);
        });
        if (listeners.length === 0)
            return;
        listeners.forEach(({ cb, modelClass }) => {
            try {
                if (!modelClass || !transform || data.length === 0) {
                    cb(data, _chanData);
                }
                else if (Array.isArray(data[0])) {
                    cb(data.map((entry) => new modelClass(entry, ws)), _chanData);
                }
                else {
                    cb(new modelClass(data, ws), _chanData);
                }
            }
            catch (err) {
                debug('error in listener callback: %s', err.message);
                ws.emit('error', new Error(`listener callback error: ${err.message}`));
            }
        });
    }
    static _payloadPassesFilter(payload, filter) {
        for (const k of Object.keys(filter)) {
            const filterValue = filter[k];
            if (filterValue === undefined || filterValue === null || filterValue === '' || filterValue === '*') {
                continue;
            }
            if (payload[+k] !== filterValue) {
                return false;
            }
        }
        return true;
    }
    static _notifyCatchAllListeners(lGroup, data) {
        if (!lGroup[''])
            return;
        for (const listener of lGroup['']) {
            try {
                listener.cb(data);
            }
            catch (err) {
                debug('error in catch-all listener callback: %s', err.message);
            }
        }
    }
    _handleEventMessage(msg) {
        if (msg.event === 'auth') {
            this._handleAuthEvent(msg);
        }
        else if (msg.event === 'subscribed') {
            this._handleSubscribedEvent(msg);
        }
        else if (msg.event === 'unsubscribed') {
            this._handleUnsubscribedEvent(msg);
        }
        else if (msg.event === 'info') {
            this._handleInfoEvent(msg);
        }
        else if (msg.event === 'conf') {
            this._handleConfigEvent(msg);
        }
        else if (msg.event === 'error') {
            this._handleErrorEvent(msg);
        }
        else if (msg.event === 'pong') {
            this._handlePongEvent(msg);
        }
        else {
            debug('recv unknown event message: %j', msg);
        }
    }
    _handleConfigEvent(msg = {}) {
        const { status, flags } = msg;
        const k = this._getConfigEventKey(flags);
        if (status !== 'OK') {
            const err = new Error(`config failed (${status}) for flags ${flags}`);
            debug('config failed: %s', err.message);
            this.emit('error', err);
            this._eventCallbacks.trigger(k, err);
        }
        else {
            debug('flags updated to %d', flags);
            this._enabledFlags = flags;
            this._eventCallbacks.trigger(k, null, msg);
        }
    }
    _handlePongEvent(msg) {
        debug('pong: %s', JSON.stringify(msg));
        this.emit('pong', msg);
    }
    _handleErrorEvent(msg) {
        debug('error: %s', JSON.stringify(msg));
        this.emit('error', msg);
    }
    _handleAuthEvent(data = {}) {
        const { chanId, msg = '', status = '' } = data;
        if (status !== 'OK') {
            const err = new Error(msg.match(/nonce/)
                ? 'auth failed: nonce small; you may need to generate a new API key to reset the nonce counter'
                : `auth failed: ${msg} (${status})`);
            debug('%s', err.message);
            this.emit('error', err);
            return;
        }
        this._channelMap[chanId] = { channel: 'auth' };
        this._isAuthenticated = true;
        this.emit('auth', data);
        debug('authenticated!');
    }
    _handleSubscribedEvent(msg) {
        this._channelMap[msg.chanId] = msg;
        debug('subscribed to %s [%d]', msg.channel, msg.chanId);
        this.emit('subscribed', msg);
    }
    _handleUnsubscribedEvent(msg) {
        delete this._channelMap[msg.chanId];
        debug('unsubscribed from %d', msg.chanId);
        this.emit('unsubscribed', msg);
    }
    _handleInfoEvent(msg = {}) {
        const { version, code } = msg;
        if (version) {
            if (version !== 2) {
                const err = new Error(`server not running API v2: v${version}`);
                this.emit('error', err);
                this.close().catch((closeErr) => {
                    debug('error closing connection: %s', closeErr.stack);
                });
                return;
            }
            const { status } = msg.platform || {};
            debug('server running API v2 (platform: %s (%d))', status === 0 ? 'under maintenance' : 'operating normally', status);
        }
        else if (code) {
            if (this._infoListeners[code]) {
                this._infoListeners[code].forEach(cb => cb(msg));
            }
            if (code === WSv2.info.SERVER_RESTART) {
                debug('server restarted, please reconnect');
            }
            else if (code === WSv2.info.MAINTENANCE_START) {
                debug('server maintenance period started!');
            }
            else if (code === WSv2.info.MAINTENANCE_END) {
                debug('server maintenance period ended!');
            }
        }
        this.emit('info', msg);
    }
    managedSubscribe(channel = '', identifier = '', payload = {}) {
        const key = `${channel}:${identifier}`;
        if (this._subscriptionRefs[key]) {
            this._subscriptionRefs[key]++;
            return false;
        }
        this._subscriptionRefs[key] = 1;
        this.subscribe(channel, payload);
        return true;
    }
    managedUnsubscribe(channel = '', identifier = '') {
        const key = `${channel}:${identifier}`;
        const chanId = this._chanIdByIdentifier(channel, identifier);
        if (chanId === null || isNaN(this._subscriptionRefs[key]))
            return false;
        this._subscriptionRefs[key]--;
        if (this._subscriptionRefs[key] > 0)
            return false;
        this.unsubscribe(chanId);
        delete this._subscriptionRefs[key];
        return true;
    }
    getChannelData({ chanId, channel, symbol, key }) {
        const id = chanId || this._chanIdByIdentifier(channel || '', symbol || key || '');
        return (id && this._channelMap[id]) || null;
    }
    _chanIdByIdentifier(channel, identifier) {
        for (const chanId of Object.keys(this._channelMap)) {
            const chan = this._channelMap[chanId];
            if (chan.channel === channel && (chan.symbol === identifier || chan.key === identifier)) {
                return chanId;
            }
        }
        return null;
    }
    _getEventPromise(key) {
        return new Promise((resolve, reject) => {
            this._eventCallbacks.push(key, (err, res) => {
                if (err) {
                    return reject(err);
                }
                resolve(res);
            });
        });
    }
    _getEventPromiseWithTimeout(key, timeoutMs = 30000) {
        return new Promise((resolve, reject) => {
            let settled = false;
            const timer = setTimeout(() => {
                if (!settled) {
                    settled = true;
                    reject(new Error(`timeout waiting for ${key} (${timeoutMs}ms)`));
                }
            }, timeoutMs);
            this._eventCallbacks.push(key, (err, res) => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                if (err) {
                    return reject(err);
                }
                resolve(res);
            });
        });
    }
    send(msg) {
        if (!this._ws || !this._isOpen) {
            this.emit('error', new Error('no ws client or not open'));
            return false;
        }
        if (this._isClosing) {
            this.emit('error', new Error('connection currently closing'));
            return false;
        }
        try {
            debug('sending %j', msg);
            this._ws.send(JSON.stringify(msg));
            return true;
        }
        catch (err) {
            debug('error sending message: %s', err.message);
            this.emit('error', err);
            return false;
        }
    }
    sequencingEnabled() {
        return this._seqAudit;
    }
    async enableSequencing(args = { audit: true }) {
        this._seqAudit = args.audit === true;
        return this.enableFlag(WSv2.flags.SEQ_ALL);
    }
    async enableFlag(flag) {
        this._enabledFlags = this._enabledFlags | flag;
        if (!this._isOpen) {
            return;
        }
        this.sendEnabledFlags();
        return this._getEventPromiseWithTimeout(this._getConfigEventKey(flag));
    }
    sendEnabledFlags() {
        this.send({
            event: 'conf',
            flags: this._enabledFlags
        });
    }
    isFlagEnabled(flag) {
        return (this._enabledFlags & flag) === flag;
    }
    _getConfigEventKey(flag) {
        return `conf-res-${flag}`;
    }
    onServerRestart(cb) {
        return this.onInfoMessage(WSv2.info.SERVER_RESTART, cb);
    }
    onMaintenanceStart(cb) {
        return this.onInfoMessage(WSv2.info.MAINTENANCE_START, cb);
    }
    onMaintenanceEnd(cb) {
        return this.onInfoMessage(WSv2.info.MAINTENANCE_END, cb);
    }
    subscribe(channel, payload) {
        this.send(Object.assign({
            event: 'subscribe',
            channel
        }, payload));
    }
    async subscribeTicker(symbol) {
        return this.managedSubscribe('ticker', symbol, { symbol });
    }
    async subscribeTrades(symbol) {
        return this.managedSubscribe('trades', symbol, { symbol });
    }
    async subscribeOrderBook(symbol, prec = 'P0', len = '25') {
        return this.managedSubscribe('book', symbol, { symbol, len, prec });
    }
    async subscribeCandles(key) {
        return this.managedSubscribe('candles', key, { key });
    }
    async subscribeStatus(key) {
        return this.managedSubscribe('status', key, { key });
    }
    unsubscribe(chanId) {
        this.send({
            event: 'unsubscribe',
            chanId: +chanId
        });
    }
    async unsubscribeTicker(symbol) {
        return this.managedUnsubscribe('ticker', symbol);
    }
    async unsubscribeTrades(symbol) {
        return this.managedUnsubscribe('trades', symbol);
    }
    async unsubscribeOrderBook(symbol) {
        return this.managedUnsubscribe('book', symbol);
    }
    async unsubscribeCandles(symbol, frame) {
        return this.managedUnsubscribe('candles', `trade:${frame}:${symbol}`);
    }
    async unsubscribeStatus(key) {
        return this.managedUnsubscribe('status', key);
    }
    removeListeners(cbGID) {
        delete this._listeners[cbGID];
    }
    requestCalc(prefixes) {
        this._sendCalc([0, 'calc', null, prefixes.map(p => [p])]);
    }
    _sendCalcImpl(msg) {
        if (!this._ws || !this._isOpen) {
            debug('cannot send calc, ws not open');
            return;
        }
        try {
            debug('req calc: %j', msg);
            this._ws.send(JSON.stringify(msg));
        }
        catch (err) {
            debug('error sending calc: %s', err.message);
            this.emit('error', err);
        }
    }
    async submitOrder(params) {
        if (!this._isAuthenticated) {
            throw new Error('not authenticated');
        }
        const order = params?.order ?? params;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const packet = Array.isArray(order)
            ? order
            : order instanceof Order
                ? order.toNewOrderPacket()
                : new Order(order).toNewOrderPacket();
        if (this._affCode) {
            if (!packet.meta) {
                packet.meta = {};
            }
            packet.meta.aff_code = packet.meta.aff_code || this._affCode;
        }
        this._sendOrderPacket([0, 'on', null, packet]);
        return this._getEventPromiseWithTimeout(`order-new-${packet.cid}`);
    }
    async updateOrder(changes = {}) {
        const { id } = changes;
        if (!this._isAuthenticated) {
            throw new Error('not authenticated');
        }
        else if (!id) {
            throw new Error('order ID required for update');
        }
        this._sendOrderPacket([0, 'ou', null, changes]);
        return this._getEventPromiseWithTimeout(`order-update-${id}`);
    }
    async cancelOrder(order) {
        if (!this._isAuthenticated) {
            throw new Error('not authenticated');
        }
        const id = typeof order === 'number'
            ? order
            : Array.isArray(order)
                ? order[0]
                : order.id;
        debug(`cancelling order ${id}`);
        this._sendOrderPacket([0, 'oc', null, { id }]);
        return this._getEventPromiseWithTimeout(`order-cancel-${id}`);
    }
    async cancelOrders(params) {
        if (!this._isAuthenticated) {
            throw new Error('not authenticated');
        }
        const orders = params?.ids ?? params;
        return Promise.all(orders.map((o) => {
            return this.cancelOrder(o);
        }));
    }
    async submitOrderMultiOp(opPayloads) {
        if (!this._isAuthenticated) {
            throw new Error('not authenticated');
        }
        return this.send([0, 'ox_multi', null, opPayloads]);
    }
    _sendOrderPacket(packet) {
        if (this._hasOrderBuff()) {
            this._ensureOrderBuffTimeout();
            this._orderOpBuffer.push(packet);
        }
        else {
            this.send(packet);
        }
    }
    _hasOrderBuff() {
        return this._orderOpBufferDelay > 0;
    }
    _ensureOrderBuffTimeout() {
        if (this._orderOpTimeout !== null)
            return;
        this._orderOpTimeout = setTimeout(this._flushOrderOps.bind(this), this._orderOpBufferDelay);
    }
    _flushOrderOps() {
        this._orderOpTimeout = null;
        if (this._isClosing || !this._isOpen) {
            this._orderOpBuffer = [];
            return Promise.resolve();
        }
        const packets = this._orderOpBuffer.map(p => [p[1], p[3]]);
        this._orderOpBuffer = [];
        if (packets.length <= 15) {
            return this.submitOrderMultiOp(packets);
        }
        const promises = [];
        const remaining = [...packets];
        while (remaining.length > 0) {
            const opPackets = remaining.splice(0, Math.min(remaining.length, 15));
            promises.push(this.submitOrderMultiOp(opPackets));
        }
        return Promise.all(promises);
    }
    isAuthenticated() {
        return this._isAuthenticated;
    }
    isOpen() {
        return this._isOpen;
    }
    isReconnecting() {
        return this._isReconnecting;
    }
    notifyUI(opts = {}) {
        const { type, message, level, image, link, sound } = opts;
        if (typeof type !== 'string' || typeof message !== 'string') {
            throw new Error(`notified with invalid type/message: ${type}/${message}`);
        }
        if (!this._isOpen) {
            throw new Error('socket not open');
        }
        if (!this._isAuthenticated) {
            throw new Error('socket not authenticated');
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
            }]);
    }
    _registerListener(eventName, filter, modelClass, cbGID, cb) {
        if (!cbGID)
            cbGID = null;
        const gid = cbGID;
        if (!this._listeners[gid]) {
            this._listeners[gid] = { [eventName]: [] };
        }
        const listeners = this._listeners[gid];
        if (!listeners[eventName]) {
            listeners[eventName] = [];
        }
        const l = {
            cb,
            modelClass,
            filter
        };
        listeners[eventName].push(l);
    }
    onInfoMessage(code, cb) {
        if (!this._infoListeners[code]) {
            this._infoListeners[code] = [];
        }
        this._infoListeners[code].push(cb);
        return () => {
            const idx = this._infoListeners[code].indexOf(cb);
            if (idx !== -1) {
                this._infoListeners[code].splice(idx, 1);
            }
        };
    }
    onMessage({ cbGID }, cb) {
        this._registerListener('', null, null, cbGID ?? null, cb);
    }
    onCandle({ key, cbGID }, cb) {
        this._registerListener('candle', { 0: key }, Candle, cbGID ?? null, cb);
    }
    onOrderBook({ symbol, prec, len, cbGID }, cb) {
        this._registerListener('orderbook', {
            0: symbol,
            1: prec,
            2: len
        }, OrderBook, cbGID ?? null, cb);
    }
    onOrderBookChecksum({ symbol, prec, len, cbGID }, cb) {
        this._registerListener('ob_checksum', {
            0: symbol,
            1: prec,
            2: len
        }, null, cbGID ?? null, cb);
    }
    onTrades({ symbol, pair, cbGID }, cb) {
        const id = pair || symbol || '';
        const model = id[0] === 'f' ? FundingTrade : PublicTrade;
        this._registerListener('trades', { 0: id }, model, cbGID ?? null, cb);
    }
    onTradeEntry({ pair, symbol, cbGID }, cb) {
        const id = pair || symbol || '';
        this._registerListener('trade-entry', { 0: id }, PublicTrade, cbGID ?? null, cb);
    }
    onAccountTradeEntry({ symbol, cbGID }, cb) {
        this._registerListener('auth-te', { 1: symbol }, Trade, cbGID ?? null, cb);
    }
    onAccountTradeUpdate({ symbol, cbGID }, cb) {
        this._registerListener('auth-tu', { 1: symbol }, Trade, cbGID ?? null, cb);
    }
    onTicker({ symbol = '', cbGID } = {}, cb) {
        const m = symbol[0] === 'f' ? FundingTicker : TradingTicker;
        this._registerListener('ticker', { 0: symbol }, m, cbGID ?? null, cb);
    }
    onStatus({ key = '', cbGID } = {}, cb) {
        this._registerListener('status', { 0: key }, null, cbGID ?? null, cb);
    }
    onOrderSnapshot({ symbol, id, cid, gid, cbGID }, cb) {
        this._registerListener('os', { 0: id, 1: gid, 2: cid, 3: symbol }, Order, cbGID ?? null, cb);
    }
    onOrderNew({ symbol, id, cid, gid, cbGID }, cb) {
        this._registerListener('on', { 0: id, 1: gid, 2: cid, 3: symbol }, Order, cbGID ?? null, cb);
    }
    onOrderUpdate({ symbol, id, cid, gid, cbGID }, cb) {
        this._registerListener('ou', { 0: id, 1: gid, 2: cid, 3: symbol }, Order, cbGID ?? null, cb);
    }
    onOrderClose({ symbol, id, cid, gid, cbGID }, cb) {
        this._registerListener('oc', { 0: id, 1: gid, 2: cid, 3: symbol }, Order, cbGID ?? null, cb);
    }
    onPositionSnapshot({ symbol, cbGID }, cb) {
        this._registerListener('ps', { 0: symbol }, Position, cbGID ?? null, cb);
    }
    onPositionNew({ symbol, cbGID }, cb) {
        this._registerListener('pn', { 0: symbol }, Position, cbGID ?? null, cb);
    }
    onPositionUpdate({ symbol, cbGID }, cb) {
        this._registerListener('pu', { 0: symbol }, Position, cbGID ?? null, cb);
    }
    onPositionClose({ symbol, cbGID }, cb) {
        this._registerListener('pc', { 0: symbol }, Position, cbGID ?? null, cb);
    }
    onFundingOfferSnapshot({ symbol, cbGID }, cb) {
        this._registerListener('fos', { 1: symbol }, FundingOffer, cbGID ?? null, cb);
    }
    onFundingOfferNew({ symbol, cbGID }, cb) {
        this._registerListener('fon', { 1: symbol }, FundingOffer, cbGID ?? null, cb);
    }
    onFundingOfferUpdate({ symbol, cbGID }, cb) {
        this._registerListener('fou', { 1: symbol }, FundingOffer, cbGID ?? null, cb);
    }
    onFundingOfferClose({ symbol, cbGID }, cb) {
        this._registerListener('foc', { 1: symbol }, FundingOffer, cbGID ?? null, cb);
    }
    onFundingCreditSnapshot({ symbol, cbGID }, cb) {
        this._registerListener('fcs', { 1: symbol }, FundingCredit, cbGID ?? null, cb);
    }
    onFundingCreditNew({ symbol, cbGID }, cb) {
        this._registerListener('fcn', { 1: symbol }, FundingCredit, cbGID ?? null, cb);
    }
    onFundingCreditUpdate({ symbol, cbGID }, cb) {
        this._registerListener('fcu', { 1: symbol }, FundingCredit, cbGID ?? null, cb);
    }
    onFundingCreditClose({ symbol, cbGID }, cb) {
        this._registerListener('fcc', { 1: symbol }, FundingCredit, cbGID ?? null, cb);
    }
    onFundingLoanSnapshot({ symbol, cbGID }, cb) {
        this._registerListener('fls', { 1: symbol }, FundingLoan, cbGID ?? null, cb);
    }
    onFundingLoanNew({ symbol, cbGID }, cb) {
        this._registerListener('fln', { 1: symbol }, FundingLoan, cbGID ?? null, cb);
    }
    onFundingLoanUpdate({ symbol, cbGID }, cb) {
        this._registerListener('flu', { 1: symbol }, FundingLoan, cbGID ?? null, cb);
    }
    onFundingLoanClose({ symbol, cbGID }, cb) {
        this._registerListener('flc', { 1: symbol }, FundingLoan, cbGID ?? null, cb);
    }
    onWalletSnapshot({ cbGID }, cb) {
        this._registerListener('ws', null, Wallet, cbGID ?? null, cb);
    }
    onWalletUpdate({ cbGID }, cb) {
        this._registerListener('wu', null, Wallet, cbGID ?? null, cb);
    }
    onBalanceInfoUpdate({ cbGID }, cb) {
        this._registerListener('bu', null, BalanceInfo, cbGID ?? null, cb);
    }
    onMarginInfoUpdate({ cbGID }, cb) {
        this._registerListener('miu', null, MarginInfo, cbGID ?? null, cb);
    }
    onFundingInfoUpdate({ cbGID }, cb) {
        this._registerListener('fiu', null, FundingInfo, cbGID ?? null, cb);
    }
    onFundingTradeEntry({ symbol, cbGID }, cb) {
        this._registerListener('fte', { 0: symbol }, FundingTrade, cbGID ?? null, cb);
    }
    onFundingTradeUpdate({ symbol, cbGID }, cb) {
        this._registerListener('ftu', { 0: symbol }, FundingTrade, cbGID ?? null, cb);
    }
    onNotification({ type, cbGID }, cb) {
        this._registerListener('n', { 1: type }, Notification, cbGID ?? null, cb);
    }
}
export default WSv2;
//# sourceMappingURL=ws2.js.map