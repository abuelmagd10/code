/**
 * Currency service tests
 * 
 * This test suite validates:
 * 1. DEFAULT_CURRENCIES constant structure and uniqueness
 * 2. roundToDecimals function accuracy for financial calculations
 * 
 * These utilities ensure consistent multi-currency support across the application
 */

import { describe, it, expect } from 'vitest'
import { DEFAULT_CURRENCIES, roundToDecimals } from './currency-service'

describe('DEFAULT_CURRENCIES', () => {
  it('should contain the expected currencies', () => {
    expect(DEFAULT_CURRENCIES).toHaveLength(4)
    
    const expectedCurrencies = [
      { code: 'EGP', name: 'Egyptian Pound', name_ar: 'الجنيه المصري' },
      { code: 'USD', name: 'US Dollar', name_ar: 'الدولار الأمريكي' },
      { code: 'EUR', name: 'Euro', name_ar: 'اليورو' },
      { code: 'SAR', name: 'Saudi Riyal', name_ar: 'الريال السعودي' }
    ]
    
    expect(DEFAULT_CURRENCIES).toEqual(expectedCurrencies)
  })

  it('should have unique currency codes', () => {
    const codes = DEFAULT_CURRENCIES.map(c => c.code)
    const uniqueCodes = [...new Set(codes)]
    expect(codes).toEqual(uniqueCodes)
  })

  it('should have all required properties for each currency', () => {
    DEFAULT_CURRENCIES.forEach(currency => {
      expect(currency).toHaveProperty('code')
      expect(currency).toHaveProperty('name')
      expect(currency).toHaveProperty('name_ar')
      expect(typeof currency.code).toBe('string')
      expect(typeof currency.name).toBe('string')
      expect(typeof currency.name_ar).toBe('string')
    })
  })
})

/**
 * Financial rounding tests
 * 
 * The roundToDecimals function ensures proper financial calculations
 * by rounding to specified decimal places with proper handling of:
 * - Standard rounding rules (0.5 rounds up)
 * - Zero decimal places (integer rounding)
 * - Negative numbers
 * - Edge cases with repeating decimals
 */
describe('roundToDecimals', () => {
  it('should round to specified decimal places', () => {
    expect(roundToDecimals(123.456, 2)).toBe(123.46)
    expect(roundToDecimals(123.454, 2)).toBe(123.45)
  })

  it('should handle zero decimals', () => {
    expect(roundToDecimals(123.456, 0)).toBe(123)
    expect(roundToDecimals(123.789, 0)).toBe(124)
  })

  it('should handle negative numbers', () => {
    expect(roundToDecimals(-123.456, 2)).toBe(-123.46)
  })

  it('should handle edge cases', () => {
    expect(roundToDecimals(0, 2)).toBe(0)
    expect(roundToDecimals(123, 2)).toBe(123)
  })

  it('should handle very small numbers', () => {
    expect(roundToDecimals(0.001, 2)).toBe(0)
    expect(roundToDecimals(0.009, 3)).toBe(0.009)
  })
})