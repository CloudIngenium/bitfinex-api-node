/* eslint-env mocha */

import assert from 'node:assert'
import { setSigFig, setPrecision, prepareAmount, preparePrice } from '../../../dist/util/precision.js'

describe('Precision utilities', () => {
  describe('setSigFig', () => {
    it('sets significant figures correctly for regular numbers', () => {
      assert.strictEqual(setSigFig(3.34, 5), '3.3400')
      assert.strictEqual(setSigFig(123.456, 5), '123.46')
      assert.strictEqual(setSigFig(0.001234, 3), '0.00123')
    })

    it('handles zero correctly', () => {
      assert.strictEqual(setSigFig(0, 5), '0.0000')
    })

    it('handles very small numbers', () => {
      const result = setSigFig(0.0000001234, 3)
      assert.strictEqual(result, '0.000000123')
    })

    it('handles very large numbers', () => {
      const result = setSigFig(123456789, 5)
      assert.ok(result.includes('123460000') || result.includes('1.2346e+8'))
    })

    it('uses default sig figs when not provided', () => {
      const result = setSigFig(3.34)
      assert.strictEqual(result, '3.3400')
    })

    it('handles negative numbers', () => {
      assert.strictEqual(setSigFig(-3.34, 5), '-3.3400')
      assert.strictEqual(setSigFig(-123.456, 5), '-123.46')
    })

    it('handles non-finite numbers by returning strings', () => {
      assert.strictEqual(setSigFig(Infinity), 'Infinity')
      assert.strictEqual(setSigFig(-Infinity), '-Infinity')
      assert.strictEqual(setSigFig(NaN), 'NaN')
    })

    it('handles scientific notation', () => {
      const result = setSigFig(1.23e-10, 3)
      assert.ok(typeof result === 'string')
    })
  })

  describe('setPrecision', () => {
    it('sets decimal precision correctly', () => {
      assert.strictEqual(setPrecision(3.14159, 2), '3.14')
      assert.strictEqual(setPrecision(3.14159, 4), '3.1416')
      assert.strictEqual(setPrecision(10, 3), '10.000')
    })

    it('handles zero correctly', () => {
      assert.strictEqual(setPrecision(0, 2), '0.00')
      assert.strictEqual(setPrecision(0, 8), '0.00000000')
    })

    it('rounds correctly', () => {
      assert.strictEqual(setPrecision(3.145, 2), '3.15')
      assert.strictEqual(setPrecision(3.144, 2), '3.14')
    })

    it('handles negative numbers', () => {
      assert.strictEqual(setPrecision(-3.14159, 2), '-3.14')
      assert.strictEqual(setPrecision(-10, 3), '-10.000')
    })

    it('uses default decimals when not provided', () => {
      assert.strictEqual(setPrecision(3.14159), '3')
    })

    it('handles non-finite numbers by returning strings', () => {
      assert.strictEqual(setPrecision(Infinity, 2), 'Infinity')
      assert.strictEqual(setPrecision(-Infinity, 2), '-Infinity')
      assert.strictEqual(setPrecision(NaN, 2), 'NaN')
    })
  })

  describe('prepareAmount', () => {
    it('formats amounts with 8 decimal places', () => {
      assert.strictEqual(prepareAmount(1.23456789), '1.23456789')
      assert.strictEqual(prepareAmount(1.2), '1.20000000')
      assert.strictEqual(prepareAmount(100), '100.00000000')
    })

    it('handles very small amounts', () => {
      assert.strictEqual(prepareAmount(0.00000001), '0.00000001')
      assert.strictEqual(prepareAmount(0.00000009), '0.00000009')
    })

    it('rounds to 8 decimals', () => {
      assert.strictEqual(prepareAmount(1.123456789), '1.12345679')
    })

    it('handles zero', () => {
      assert.strictEqual(prepareAmount(0), '0.00000000')
    })

    it('handles negative amounts', () => {
      assert.strictEqual(prepareAmount(-1.23), '-1.23000000')
    })

    it('uses default value when not provided', () => {
      assert.strictEqual(prepareAmount(), '0.00000000')
    })
  })

  describe('preparePrice', () => {
    it('formats prices with 5 significant figures', () => {
      assert.strictEqual(preparePrice(3.34), '3.3400')
      assert.strictEqual(preparePrice(123.456), '123.46')
    })

    it('handles various price ranges', () => {
      assert.strictEqual(preparePrice(0.001234), '0.0012340')
      assert.strictEqual(preparePrice(50000), '50000')
    })

    it('handles zero', () => {
      assert.strictEqual(preparePrice(0), '0.0000')
    })

    it('handles negative prices', () => {
      assert.strictEqual(preparePrice(-99.99), '-99.990')
    })

    it('uses default value when not provided', () => {
      assert.strictEqual(preparePrice(), '0.0000')
    })

    it('handles typical crypto prices', () => {
      // Bitcoin price range
      assert.ok(preparePrice(45000.123).includes('45000'))
      // Altcoin price range
      assert.strictEqual(preparePrice(1.2345), '1.2345')
      // Very small price
      assert.ok(preparePrice(0.00001234).includes('0.00001234'))
    })
  })

  describe('edge cases', () => {
    it('handles string inputs that can be converted to numbers', () => {
      assert.strictEqual(preparePrice('123.45'), '123.45')
      assert.strictEqual(prepareAmount('1.23'), '1.23000000')
    })

    it('handles very large numbers consistently', () => {
      const largeNum = 999999999
      const result = preparePrice(largeNum)
      assert.ok(typeof result === 'string')
      assert.ok(result.length > 0)
    })

    it('maintains precision for financial calculations', () => {
      // Test that rounding is consistent
      const price = 0.123456789
      const prepared = prepareAmount(price)
      assert.strictEqual(prepared, '0.12345679')
    })
  })
})
