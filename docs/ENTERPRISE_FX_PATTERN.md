# 🌍 Enterprise FX Pattern — Single Source of Truth

> **Last reviewed**: 2026-05-22 (v3.24.x)
> **Compliance**: IAS 21 + Cash Basis + Multi-Currency Enterprise Standards
> **Audience**: developers extending any monetary form (payment, expense, refund, transfer, etc.)

## ⚖️ Three Currency Levels

Every money operation in the system has up to three currencies:

| # | Layer | Source | Purpose |
|---|---|---|---|
| 1 | **Base Currency** | `companies.base_currency` | The functional currency used in the GL (every journal entry's `debit_amount`/`credit_amount`). |
| 2 | **Document Currency** | `invoice.currency_code`, `bill.currency_code` | The currency the customer/supplier was billed in. |
| 3 | **Payment Currency** | User-selected at payment time | The currency the cash actually moved in. |
| 4 | **Account Currency** *(optional)* | `chart_of_accounts.original_currency` (v3.24.0+) | The currency the bank/cash account physically holds. |

Conversion always happens **at the same source of truth**: the `exchange_rates` table managed in `/settings/exchange-rates`.

---

## 🚫 Rule #1 — No Manual Rate Input at Payment Time

The user **never types** an exchange rate value into a payment form. They only choose one of two methods:

| Option | Source | Updated by |
|---|---|---|
| 🔄 **API rate** | `exchange_rates` row with `source='api'` | Daily Edge Function (`update-exchange-rates`) |
| ✋ **Manual rate** | `exchange_rates` row with `source='manual'` | Admin via `/settings/exchange-rates` |

### Implementation

Always use the shared component:

```tsx
import { ExchangeRateSelector } from "@/components/ExchangeRateSelector"

<ExchangeRateSelector
  fromCurrency={paymentCurrency}    // e.g. "USD"
  baseCurrency={companyBaseCurrency} // e.g. "EGP"
  value={exchangeRate}
  onChange={setExchangeRate}
  onRateMetaChange={(meta) => {
    setExchangeRateId(meta?.rateId)
    setRateSource(meta?.source)
  }}
/>
```

**Anti-patterns** — these must NEVER appear in a monetary form:

```tsx
// ❌ NEVER — direct numeric input for rate
<NumericInput value={exchangeRate} onChange={setExchangeRate} />

// ❌ NEVER — inline API fetch in form
const res = await fetch("https://api.exchangerate-api.com/v4/latest/USD")
setExchangeRate(res.rates.EGP)

// ❌ NEVER — single getExchangeRate() call in form (bypasses user's source choice)
const { rate } = await getExchangeRate(supabase, "USD", "EGP")
setExchangeRate(rate)
```

---

## 💱 Rule #2 — Payment ≠ Base Currency

When `Payment Currency ≠ Application Base Currency`:

1. UI: show `ExchangeRateSelector` (lets user pick api/manual)
2. The selected rate auto-converts to base currency before posting
3. Both values are persisted: `payment.amount` (FC) + `payment.base_currency_amount` (base)
4. Journal entries store the base-currency value in `debit_amount`/`credit_amount` and the FC value in `original_debit`/`original_credit`/`original_currency`/`exchange_rate_used` (IAS 21 disclosure)

**Example**: Customer pays 100 USD on an EGP invoice at rate 50:
- `payment.amount` = 100 (USD)
- `payment.currency_code` = "USD"
- `payment.exchange_rate` = 50
- `payment.base_currency_amount` = 5000 (EGP)
- Journal: Cash Dr 5000 EGP / AR Cr 5000 EGP
- Journal disclosure: `original_debit=100, original_currency='USD', exchange_rate_used=50`

---

## 🏦 Rule #3 — Account Currency Comparison

After the user picks the cash/bank account, compare:

```
Payment Currency  vs  Account Currency
```

### Case A — Same currency
```
Payment USD + Account USD → no conversion needed at the cash-leg level
```
- Cash debit (in base) = `amount × rate` (already computed for the AR side)
- Cash debit (in account currency, stored in `original_debit`) = `amount` (the FC value)

### Case B — Different currencies
```
Payment USD + Account EGP → convert via Exchange Rates Page
```
- Cash debit (in base, EGP) = `amount × rate_payment_to_base`
- Cash debit (in account currency, EGP) = same value (account is in base)

```
Payment EGP + Account USD → convert via Exchange Rates Page (NEW)
```
- Cash debit (in base, EGP) = `amount` (payment already in base)
- Cash debit (in account currency, USD) = `amount / rate_USD_to_EGP`
- The cash-side journal line records the USD value in `original_debit`

### Implementation

The conversion factor:

```ts
function convertToAccountCurrency(
  amount: number,
  paymentCurrency: string,
  paymentRate: number,         // payment.currency → base
  accountCurrency: string | null,
  accountRate: number | null,  // account.currency → base (if account is FC)
): number {
  const pc = (paymentCurrency || '').toUpperCase()
  const ac = (accountCurrency || '').toUpperCase()
  if (!ac || pc === ac) return amount  // no conversion
  // amount × payment_rate = base amount
  // / account_rate = amount in account currency
  return amount * (paymentRate || 1) / (accountRate || 1)
}
```

For `original_debit` on the cash journal line:
```ts
const cashAmountInAccountCcy = convertToAccountCurrency(
  payment.amount,
  payment.currency_code,
  payment.exchange_rate,
  account.original_currency,
  account.exchange_rate_used,
)
```

---

## 💰 Rule #4 — Excess and Shortfall (in Base Currency)

After settlement, in **base currency**:

| Scenario | Recording |
|---|---|
| `Cash Received > Invoice Outstanding` (overpayment) | Excess → **Customer Credit** entry (`customer_credit_ledger`) OR keep as `unallocated_amount` on the payment |
| `Cash Paid > Bill Outstanding` (supplier overpaid) | Excess → **Supplier Advance** / Vendor Credit |
| `Cash Received < Invoice Outstanding` | Remaining = invoice.outstanding - amount → **Remaining Receivable** (stays on invoice) |
| `Cash Paid < Bill Outstanding` | Remaining → **Remaining Payable** |

All thresholds and accumulations are in base currency.

---

## 📋 Rule #5 — Unified Across All Monetary Pages

The same logic applies to:

| Domain | Page(s) | Pattern Component |
|---|---|---|
| Customer payments | `/payments` customer section, `/invoices/[id]` payment dialog, `CustomerPaymentAllocationUI` | ExchangeRateSelector ✅ |
| Supplier payments | `/payments` supplier section, `/bills/[id]` payment dialog, `SupplierPaymentAllocationUI` | ExchangeRateSelector ✅ |
| Expenses | `/expenses/new`, `/expenses/[id]/edit` | ExchangeRateSelector ✅ |
| Drawings | `/drawings/new` | ExchangeRateSelector ✅ |
| Treasury / Bank transfers | `/banking` | ExchangeRateSelector ✅ |
| Journal entries | `/journal-entries/new` | ExchangeRateSelector ✅ |
| Refunds | `/customer-refund-requests/**`, `/vendor-refund-requests/**` | ExchangeRateSelector (when FC) |
| Returns | `/sales-returns/**`, `/purchase-returns/new` | ExchangeRateSelector ✅ |
| Sales / Purchase Orders | `/sales-orders/{new,edit}`, `/purchase-orders/{new,edit}` | ExchangeRateSelector ✅ |
| Credit notes | `/customer-debit-notes/new`, `/vendor-credits/new` | ExchangeRateSelector ✅ |

**Audit performed 2026-05-22**: all 14 monetary forms use ExchangeRateSelector. Zero manual rate inputs.

---

## 🗄️ Database Columns Reference

### `payments`
| Column | Holds | Always present |
|---|---|---|
| `amount` | Payment in payment currency (FC) | yes |
| `currency_code` | Payment currency (e.g. "USD") | yes (defaults to base) |
| `exchange_rate` | FC → base rate at payment time | yes (1.0 if same as base) |
| `exchange_rate_id` | FK to `exchange_rates` row used | optional (audit) |
| `rate_source` | `'api'` or `'manual'` | optional (audit) |
| `base_currency_amount` | Payment value in base currency | yes (set by service layer) |
| `original_amount` | Same as `amount` (FC) | redundant, present for older flows |
| `original_currency` | Same as `currency_code` | redundant, present for older flows |

### `journal_entry_lines`
| Column | Holds |
|---|---|
| `debit_amount` / `credit_amount` | **Always** in base currency (IAS 21) |
| `original_debit` / `original_credit` | FC value (for FC documents) |
| `original_currency` | FC code (e.g. "USD") |
| `exchange_rate_used` | The rate stored in `debit_amount = original_debit × rate` |

### `chart_of_accounts`
| Column | Holds | When populated |
|---|---|---|
| `original_currency` | Account's holding currency (v3.24.0+) | When user explicitly picks non-base currency for a bank/cash account |

### `exchange_rates`
| Column | Holds |
|---|---|
| `from_currency`, `to_currency` | The pair |
| `rate` | Rate value |
| `source` | `'api'` (set by daily Edge Function) or `'manual'` (admin) |
| `rate_date` | The day this rate applies to |
| `company_id` | Per-tenant scoping |

---

## 🛡️ Compliance Self-Check (run before merge)

Before merging any new monetary form or change, verify all six points:

- [ ] No `<NumericInput>` or `<Input type="number">` bound to a "rate" variable
- [ ] No direct `fetch("exchangerate-api.com")` call in the form
- [ ] `ExchangeRateSelector` is rendered whenever payment currency ≠ base
- [ ] `payment.amount` is in payment currency, `payment.base_currency_amount` is the converted value
- [ ] Journal entries persist `debit_amount` in base currency and FC values in `original_*`
- [ ] If a cash/bank account is in FC, the cash journal line also records `original_debit` in the account's own currency

---

## 🔮 Future Enhancements

### Phase 2 (planned) — Account-currency aware cash leg

When `chart_of_accounts.original_currency` is non-null and differs from the payment currency:
1. UI surfaces the account's currency next to the account selector
2. Cash journal line stores `original_debit` in the account's currency (converted via the same `ExchangeRateSelector` choice)
3. Account balance views show balance in account's own currency (using `original_debit/credit` sums)
4. Period-end FX revaluation revalues FC bank balances

### Phase 3 — Customer credit from invoice overpayments

Currently `customer_credit_ledger` only receives entries from sales returns. Add:
- Trigger on invoice overpayment (when `paid_amount > total_amount`) to create a customer-credit-ledger entry for the surplus in base currency
- Same for suppliers (supplier advance ledger)

### Phase 4 — Reports

- Per-account multi-currency statement: show both base and native currency balances
- Multi-currency trial balance with disclosure of FC components

---

**Owner**: Accounting Engine team
**Related code**:
- `components/ExchangeRateSelector.tsx`
- `lib/accrual-accounting-engine.ts` (`prepareInvoiceRevenueJournal`, `createPurchaseInventoryJournal`, `preparePaymentJournalFromData`)
- `lib/services/customer-payment-command.service.ts` (`applyAllocation`)
- `lib/services/supplier-payment-command.service.ts`
- `app/settings/exchange-rates/page.tsx`
- `supabase/functions/update-exchange-rates/index.ts`
