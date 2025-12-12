/**
 * Unit tests for utility functions
 * 
 * This test suite covers:
 * 1. Account finding functionality (findAccountId, AccountFinders)
 * 2. Phone number normalization (normalizePhone)
 * 
 * All tests ensure proper handling of edge cases and international formats
 */

import { describe, it, expect } from 'vitest'
import { findAccountId, AccountFinders } from './utils'
import { normalizePhone } from './phone-utils'

/**
 * Account finding functionality tests
 * 
 * These tests verify the findAccountId function and AccountFinders utility
 * which are used throughout the customers module to locate specific accounts
 * for transactions, vouchers, and refunds.
 */
describe('findAccountId', () => {
  const mockAccounts = [
    { id: '1', account_name: 'Customer Advance Account', sub_type: 'customer_advance' },
    { id: '2', account_name: 'Cash Account', sub_type: 'cash' },
    { id: '3', account_name: 'Bank Account', sub_type: 'bank' },
    { id: '4', account_name: 'Deposit Account', sub_type: 'deposit' },
    { id: '5', account_name: 'Advance Payment', sub_type: 'other' },
    { id: '6', account_name: 'Main Cash', sub_type: 'cash' },
    { id: '7', account_name: 'Primary Bank', sub_type: 'bank' },
  ]

  it('should find account by sub_type', () => {
    const result = findAccountId(mockAccounts, { subType: 'customer_advance' })
    expect(result).toBe('1')
  })

  it('should find account by name includes pattern', () => {
    const result = findAccountId(mockAccounts, { nameIncludes: ['advance'] })
    expect(result).toBe('1')
  })

  it('should find account by multiple name includes patterns', () => {
    const result = findAccountId(mockAccounts, { nameIncludes: ['advance', 'deposit'] })
    expect(result).toBe('1')
  })

  it('should return undefined when no account matches', () => {
    const result = findAccountId(mockAccounts, { subType: 'nonexistent' })
    expect(result).toBeUndefined()
  })

  it('should return undefined for empty accounts array', () => {
    const result = findAccountId([], { subType: 'cash' })
    expect(result).toBeUndefined()
  })

  it('should return undefined for null accounts', () => {
    const result = findAccountId(null as any, { subType: 'cash' })
    expect(result).toBeUndefined()
  })

  it('should handle case insensitive matching', () => {
    const result = findAccountId(mockAccounts, { subType: 'CASH' })
    expect(result).toBe('2')
  })

  it('should handle case insensitive name matching', () => {
    const result = findAccountId(mockAccounts, { nameIncludes: ['CASH'] })
    expect(result).toBe('2')
  })

  it('should prioritize sub_type over name includes', () => {
    const result = findAccountId(mockAccounts, { 
      subType: 'cash',
      nameIncludes: ['advance'] 
    })
    expect(result).toBe('2')
  })
})

describe('AccountFinders', () => {
  const mockAccounts = [
    { id: '1', account_name: 'Customer Advance Account', sub_type: 'customer_advance' },
    { id: '2', account_name: 'Cash Account', sub_type: 'cash' },
    { id: '3', account_name: 'Bank Account', sub_type: 'bank' },
    { id: '4', account_name: 'Deposit Account', sub_type: 'deposit' },
    { id: '5', account_name: 'Advance Payment', sub_type: 'other' },
  ]

  describe('customerAdvance', () => {
    it('should find customer advance account by sub_type', () => {
      const result = AccountFinders.customerAdvance(mockAccounts)
      expect(result).toBe('1')
    })

    it('should find customer advance account by name pattern', () => {
      const accounts = [{ id: '5', account_name: 'Advance Payment', sub_type: 'other' }]
      const result = AccountFinders.customerAdvance(accounts)
      expect(result).toBe('5')
    })

    it('should find customer advance account by deposit pattern', () => {
      const accounts = [{ id: '4', account_name: 'Deposit Account', sub_type: 'deposit' }]
      const result = AccountFinders.customerAdvance(accounts)
      expect(result).toBe('4')
    })

    it('should return undefined when no account matches', () => {
      const accounts = [{ id: '1', account_name: 'Other Account', sub_type: 'other' }]
      const result = AccountFinders.customerAdvance(accounts)
      expect(result).toBeUndefined()
    })
  })

  describe('cash', () => {
    it('should find cash account by sub_type', () => {
      const result = AccountFinders.cash(mockAccounts)
      expect(result).toBe('2')
    })

    it('should find cash account by name pattern', () => {
      const accounts = [{ id: '5', account_name: 'Main Cash', sub_type: 'other' }]
      const result = AccountFinders.cash(accounts)
      expect(result).toBe('5')
    })

    it('should return undefined when no account matches', () => {
      const accounts = [{ id: '1', account_name: 'Bank Account', sub_type: 'bank' }]
      const result = AccountFinders.cash(accounts)
      expect(result).toBeUndefined()
    })
  })

  describe('bank', () => {
    it('should find bank account by sub_type', () => {
      const result = AccountFinders.bank(mockAccounts)
      expect(result).toBe('3')
    })

    it('should find bank account by name pattern', () => {
      const accounts = [{ id: '5', account_name: 'Primary Bank', sub_type: 'other' }]
      const result = AccountFinders.bank(accounts)
      expect(result).toBe('5')
    })

    it('should return undefined when no account matches', () => {
      const accounts = [{ id: '1', account_name: 'Cash Account', sub_type: 'cash' }]
      const result = AccountFinders.bank(accounts)
      expect(result).toBeUndefined()
    })
  })
})

/**
 * Phone normalization tests
 * 
 * The normalizePhone function handles:
 * - Arabic numeral conversion (٠١٢٣٤٥٦٧٨٩ → 0123456789)
 * - Hindi numeral conversion (۰۱۲۳۴۵۶۷۸۹ → 0123456789)
 * - Format cleaning (removes spaces, dashes)
 * - Egyptian number formatting (ensures leading 0)
 * - International format preservation
 */
describe('normalizePhone', () => {
  it('should normalize phone numbers by removing spaces and dashes', () => {
    expect(normalizePhone('010-1234-5678')).toBe('01012345678')
    expect(normalizePhone('010 1234 5678')).toBe('01012345678')
  })

  it('should convert Arabic numerals to English', () => {
    expect(normalizePhone('٠١٠١٢٣٤٥٦٧٨')).toBe('01012345678')
  })

  it('should convert Hindi numerals to English', () => {
    expect(normalizePhone('۰۱۰۱۲۳۴۵۶۷۸')).toBe('01012345678')
  })

  it('should handle Egyptian phone number formats', () => {
    expect(normalizePhone('00201012345678')).toBe('01012345678')
    expect(normalizePhone('0201012345678')).toBe('01012345678')
  })

  it('should ensure Egyptian numbers start with 0', () => {
    expect(normalizePhone('1012345678')).toBe('01012345678')
  })

  it('should return empty string for invalid input', () => {
    expect(normalizePhone('')).toBe('')
    expect(normalizePhone(null as any)).toBe('')
    expect(normalizePhone(undefined as any)).toBe('')
  })

  it('should handle international format', () => {
    expect(normalizePhone('+201012345678')).toBe('+201012345678')
  })

  it('should handle non-Egyptian phone numbers', () => {
    expect(normalizePhone('1234567890')).toBe('01234567890')
    expect(normalizePhone('+1234567890')).toBe('+1234567890')
  })
})