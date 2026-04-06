/**
 * Smartly set the precision (decimal) on a value based off of the significant
 * digit maximum. For example, calling with 3.34 when the max sig figs allowed
 * is 5 would return '3.3400'.
 */
declare const setSigFig: (number?: number, maxSigs?: number) => string;
declare const setPrecision: (number?: number, decimals?: number) => string;
declare const prepareAmount: (amount?: number) => string;
declare const preparePrice: (price?: number) => string;
export { setSigFig, setPrecision, prepareAmount, preparePrice };
//# sourceMappingURL=precision.d.ts.map