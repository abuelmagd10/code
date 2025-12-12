# Utility Functions Documentation

## Overview
This document describes the utility functions used throughout the customers module and other parts of the application. These functions provide common functionality for account management, phone normalization, and financial calculations.

## Account Management Functions

### `findAccountId(accounts, criteria)`

Finds an account ID based on various search criteria.

**Parameters:**
- `accounts`: Array of account objects with properties like `id`, `account_name`, `sub_type`
- `criteria`: Object containing search criteria:
  - `subType`: String - exact match for account sub_type (case-insensitive)
  - `nameIncludes`: String[] - array of strings to search for in account_name
  - `namePatterns`: String[] - array of regex patterns to match against account_name

**Returns:** String (account ID) or undefined if no match found

**Search Priority:**
1. First tries exact sub_type match
2. Then tries nameIncludes patterns
3. Finally tries namePatterns regex patterns

**Example:**
```typescript
const accounts = [
  { id: '1', account_name: 'Customer Advance Account', sub_type: 'customer_advance' },
  { id: '2', account_name: 'Cash Account', sub_type: 'cash' }
]

// Find by sub_type
const result = findAccountId(accounts, { subType: 'cash' }) // Returns: '2'

// Find by name includes
const result2 = findAccountId(accounts, { nameIncludes: ['advance'] }) // Returns: '1'

// Find by name patterns
const result3 = findAccountId(accounts, { namePatterns: ['cash', 'bank'] }) // Returns: '2'
```

### `AccountFinders`

Predefined account finder configurations for common account types used throughout the application.

**Available Finders:**
- `customerAdvance`: Finds customer advance accounts (sub_type: 'customer_advance', names: ['advance', 'deposit'])
- `cash`: Finds cash accounts (sub_type: 'cash', names: ['cash'])
- `bank`: Finds bank accounts (sub_type: 'bank', names: ['bank'])

**Usage:**
```typescript
import { AccountFinders } from '@/lib/utils'

const cashAccountId = AccountFinders.cash(accounts)
const customerAdvanceId = AccountFinders.customerAdvance(accounts)
const bankAccountId = AccountFinders.bank(accounts)
```

## Phone Normalization Functions

### `normalizePhone(phone)`

Normalizes phone numbers for consistent storage and validation.

**Features:**
- Converts Arabic numerals (٠١٢٣٤٥٦٧٨٩) to English (0123456789)
- Converts Hindi numerals (۰۱۲۳۴۵۶۷۸۹) to English (0123456789)
- Removes spaces and dashes
- Ensures Egyptian numbers start with 0
- Preserves international format (+ prefix)

**Parameters:**
- `phone`: String - phone number to normalize

**Returns:** String - normalized phone number

**Examples:**
```typescript
import { normalizePhone } from '@/lib/phone-utils'

// Arabic numerals
normalizePhone('٠١٠-١٢٣٤-٥٦٧٨') // Returns: '01012345678'

// Hindi numerals
normalizePhone('۰۱۰۱۲۳۴۵۶۷۸') // Returns: '01012345678'

// Format cleaning
normalizePhone('010 1234 5678') // Returns: '01012345678'
normalizePhone('010-1234-5678') // Returns: '01012345678'

// Egyptian format
normalizePhone('1012345678') // Returns: '01012345678'

// International format
normalizePhone('+201012345678') // Returns: '+201012345678'
```

## Financial Calculation Functions

### `roundToDecimals(value, decimals)`

Rounds numbers to a specified number of decimal places for financial calculations.

**Parameters:**
- `value`: Number - the number to round
- `decimals`: Number - number of decimal places (0 for integers)

**Returns:** Number - rounded value

**Examples:**
```typescript
import { roundToDecimals } from '@/lib/currency-service'

// Standard rounding
roundToDecimals(123.456, 2) // Returns: 123.46
roundToDecimals(123.454, 2) // Returns: 123.45

// Integer rounding
roundToDecimals(123.456, 0) // Returns: 123
roundToDecimals(123.789, 0) // Returns: 124

// Negative numbers
roundToDecimals(-123.456, 2) // Returns: -123.46

// Edge cases
roundToDecimals(0.1 + 0.2, 2) // Returns: 0.30 (handles floating point precision)
```

## Constants

### `DEFAULT_CURRENCIES`

Array of supported currencies with bilingual names.

**Structure:**
```typescript
const DEFAULT_CURRENCIES = [
  { code: 'EGP', name: 'Egyptian Pound', name_ar: 'الجنيه المصري' },
  { code: 'USD', name: 'US Dollar', name_ar: 'الدولار الأمريكي' },
  { code: 'EUR', name: 'Euro', name_ar: 'اليورو' },
  { code: 'SAR', name: 'Saudi Riyal', name_ar: 'الريال السعودي' }
]
```

**Usage:**
```typescript
import { DEFAULT_CURRENCIES } from '@/lib/currency-service'

// Use in dropdowns
currencies.map(currency => ({
  value: currency.code,
  label: `${currency.code} - ${currency.name}`
}))
```

## Best Practices

1. **Always normalize phone numbers** before validation and storage
2. **Use AccountFinders** for consistent account identification
3. **Round financial values** to appropriate decimal places
4. **Handle undefined returns** from findAccountId gracefully
5. **Test edge cases** like null/empty inputs
6. **Use TypeScript interfaces** for type safety

## Error Handling

All utility functions are designed to handle edge cases gracefully:

- `findAccountId`: Returns `undefined` if no account matches or accounts array is empty/invalid
- `normalizePhone`: Returns empty string for null/undefined input
- `roundToDecimals`: Handles all numeric inputs including edge cases

**Example error handling:**
```typescript
const accountId = findAccountId(accounts, AccountFinders.cash)
if (!accountId) {
  console.error('Cash account not found')
  // Handle missing account appropriately
}
```

## Testing

All utility functions have comprehensive unit tests covering:
- Normal operation scenarios
- Edge cases and error conditions
- International formats and special characters
- Performance considerations

Run tests with:
```bash
npm test lib/utils.test.ts
npm test lib/currency-service.test.ts
```

## Migration Guide

When migrating from inline code to these utilities:

1. **Replace inline account finding:**
   ```typescript
   // Old approach
   const cashAccount = accounts.find(a => a.sub_type === 'cash')
   
   // New approach
   const cashAccountId = AccountFinders.cash(accounts)
   ```

2. **Replace manual phone cleaning:**
   ```typescript
   // Old approach
   const cleaned = phone.replace(/[-\s]/g, '')
   
   // New approach
   const normalized = normalizePhone(phone)
   ```

3. **Replace manual rounding:**
   ```typescript
   // Old approach
   const rounded = Math.round(value * 100) / 100
   
   // New approach
   const rounded = roundToDecimals(value, 2)
   ```

These utilities provide a consistent, tested, and maintainable approach to common operations throughout the application.