import { RESTv1, RESTv2 } from '@jcbit/bfx-api-node-rest';
import WSv1 from 'bfx-api-node-ws1';
import WSv2 from './transports/ws2.js';
import WS2Manager from './ws2_manager.js';
interface BFXOptions {
    apiKey?: string;
    apiSecret?: string;
    authToken?: string;
    company?: string;
    transform?: boolean;
    ws?: Record<string, any>;
    rest?: Record<string, any>;
}
/**
 * Provides access to versions 1 & 2 of the HTTP & WebSocket Bitfinex APIs
 */
declare class BFX {
    static RESTv1: typeof RESTv1;
    static RESTv2: typeof RESTv2;
    static WSv1: typeof WSv1;
    static WSv2: typeof WSv2;
    static WS2Manager: typeof WS2Manager;
    private _apiKey;
    private _apiSecret;
    private _authToken;
    private _company;
    private _transform;
    private _wsArgs;
    private _restArgs;
    private _transportCache;
    constructor(opts?: BFXOptions);
    private _getTransportPayload;
    rest(version?: number, extraOpts?: Record<string, any>): any;
    ws(version?: number, extraOpts?: Record<string, any>): any;
}
export default BFX;
export { RESTv1, RESTv2, WSv1, WSv2, WS2Manager };
//# sourceMappingURL=index.d.ts.map