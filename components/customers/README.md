# Customers Module Documentation

## Overview
The customers module provides a comprehensive customer management system with bilingual support (Arabic/English), multi-currency handling, and integrated voucher/refund functionality.

## Components

### CustomerFormDialog
A reusable dialog component for creating and editing customer records.

**Props:**
- `open`: Boolean to control dialog visibility
- `onOpenChange`: Function to handle dialog open/close state
- `customer`: Optional customer object for editing mode
- `onSave`: Callback function after successful save
- `accounts`: Array of account objects for dropdown selection

**Features:**
- Bilingual form labels and validation messages
- Phone number normalization (Arabic/Hindi numerals to English)
- Duplicate phone number validation
- Email and tax ID validation
- Credit limit management
- Address management with multiple addresses support
- Form validation with real-time feedback

**Usage:**
```tsx
<CustomerFormDialog
  open={isFormOpen}
  onOpenChange={setIsFormOpen}
  customer={selectedCustomer}
  onSave={handleCustomerSave}
  accounts={accounts}
/>
```

### CustomerVoucherDialog
A dialog component for creating customer vouchers with multi-currency support.

**Props:**
- `open`: Boolean to control dialog visibility
- `onOpenChange`: Function to handle dialog open/close state
- `customer`: Customer object for voucher creation
- `accounts`: Array of account objects
- `exchangeRates`: Object containing currency exchange rates
- `onVoucherCreated`: Callback after successful voucher creation

**Features:**
- Multi-currency voucher creation (EGP, USD, EUR, SAR)
- Automatic exchange rate calculation
- Account selection for voucher posting
- Amount validation
- Bilingual interface

**Usage:**
```tsx
<CustomerVoucherDialog
  open={isVoucherOpen}
  onOpenChange={setIsVoucherOpen}
  customer={selectedCustomer}
  accounts={accounts}
  exchangeRates={exchangeRates}
  onVoucherCreated={handleVoucherCreated}
/>
```

### CustomerRefundDialog
A dialog component for processing customer refunds.

**Props:**
- `open`: Boolean to control dialog visibility
- `onOpenChange`: Function to handle dialog open/close state
- `customer`: Customer object for refund processing
- `accounts`: Array of account objects
- `exchangeRates`: Object containing currency exchange rates
- `onRefundProcessed`: Callback after successful refund

**Features:**
- Multi-currency refund processing
- Automatic exchange rate calculation
- Account selection for refund posting
- Amount validation
- Bilingual interface

**Usage:**
```tsx
<CustomerRefundDialog
  open={isRefundOpen}
  onOpenChange={setIsRefundOpen}
  customer={selectedCustomer}
  accounts={accounts}
  exchangeRates={exchangeRates}
  onRefundProcessed={handleRefundProcessed}
/>
```

## Utility Functions

### Phone Normalization (`lib/phone-utils.ts`)
Normalizes phone numbers by:
- Converting Arabic numerals (٠١٢٣٤٥٦٧٨٩) to English (0123456789)
- Converting Hindi numerals (۰۱۲۳۴۵۶۷۸۹) to English (0123456789)
- Removing spaces and dashes

**Usage:**
```typescript
import { normalizePhone } from '@/lib/phone-utils'

const normalized = normalizePhone('٠١٠-١٢٣٤-٥٦٧٨') // Returns: '01012345678'
```

### Account Finding (`lib/utils.ts`)
Utility functions for finding account IDs based on various criteria.

**Functions:**
- `findAccountId(accounts, criteria)`: Find account by subtype, name includes, or name patterns
- `AccountFinders`: Predefined account finder configurations

**Usage:**
```typescript
import { findAccountId, AccountFinders } from '@/lib/utils'

const cashAccountId = findAccountId(accounts, AccountFinders.CASH)
const customerAccountId = findAccountId(accounts, AccountFinders.CUSTOMER)
```

### Currency Constants (`lib/currency-service.ts`)
Centralized currency constants for consistent multi-currency support.

**Constants:**
- `DEFAULT_CURRENCIES`: Array of supported currencies ['EGP', 'USD', 'EUR', 'SAR']
- `roundToDecimals(value, decimals)`: Round numbers to specified decimal places

**Usage:**
```typescript
import { DEFAULT_CURRENCIES, roundToDecimals } from '@/lib/currency-service'

const currencies = DEFAULT_CURRENCIES // ['EGP', 'USD', 'EUR', 'SAR']
const rounded = roundToDecimals(123.456, 2) // 123.46
```

## Data Types

### Customer Interface
```typescript
interface Customer {
  id: string
  name: string
  phone: string
  email?: string
  tax_id?: string
  credit_limit: number
  credit_limit_currency: string
  addresses: Address[]
  created_at: string
  updated_at: string
}
```

### Address Interface
```typescript
interface Address {
  id: string
  customer_id: string
  street: string
  city: string
  governorate: string
  postal_code?: string
  is_default: boolean
}
```

## Localization

All components support bilingual localization through the `useTranslations` hook. Supported languages:
- Arabic (ar)
- English (en)

Translation keys are organized by component:
- `customers.form.*`: Form labels and validation messages
- `customers.voucher.*`: Voucher dialog labels
- `customers.refund.*`: Refund dialog labels

## Error Handling

Components handle errors through:
- Form validation with user-friendly messages
- Supabase operation error handling
- Toast notifications for user feedback
- Console error logging (removed in production)

## Best Practices

1. **Always use centralized constants** for currencies and account types
2. **Normalize phone numbers** before validation and storage
3. **Use utility functions** for common operations like account finding
4. **Implement proper error handling** with user feedback
5. **Maintain bilingual support** for all user-facing text
6. **Validate all inputs** before submission
7. **Use TypeScript interfaces** for type safety

## Testing

All utility functions have comprehensive unit tests:
- Phone normalization tests
- Account finding tests
- Currency rounding tests

Run tests with:
```bash
npm test
```

## Migration from Monolithic Component

If migrating from the original monolithic `app/customers/page.tsx`:

1. Replace inline form logic with `CustomerFormDialog`
2. Replace inline voucher logic with `CustomerVoucherDialog`
3. Replace inline refund logic with `CustomerRefundDialog`
4. Import utility functions from `lib/utils.ts` and `lib/phone-utils.ts`
5. Use `DEFAULT_CURRENCIES` from `lib/currency-service.ts`
6. Remove redundant state management and functions

The refactored approach reduces the main component size by ~42% while maintaining all functionality.