import { Decimal } from 'decimal.js'

const DEFAULT_SIG_FIGS = 5
const PRICE_SIG_FIGS = 5
const AMOUNT_DECIMALS = 8

/**
 * Smartly set the precision (decimal) on a value based off of the significant
 * digit maximum. For example, calling with 3.34 when the max sig figs allowed
 * is 5 would return '3.3400'.
 */
const setSigFig = (number: number = 0, maxSigs: number = DEFAULT_SIG_FIGS): string => {
  const n = +(number)
  if (!isFinite(n)) {
    return String(number)
  }
  const value = n.toPrecision(maxSigs)

  return /e/.test(value)
    ? new Decimal(value).toFixed()
    : value
}

const setPrecision = (number: number = 0, decimals: number = 0): string => {
  const n = +(number)

  return isFinite(n)
    ? n.toFixed(decimals)
    : String(number)
}

const prepareAmount = (amount: number = 0): string => {
  return setPrecision(amount, AMOUNT_DECIMALS)
}

const preparePrice = (price: number = 0): string => {
  return setSigFig(price, PRICE_SIG_FIGS)
}

export { setSigFig, setPrecision, prepareAmount, preparePrice }
