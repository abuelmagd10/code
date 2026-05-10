import { describe, expect, it } from "vitest"
import {
  getDefaultProductAccountingAccounts,
  isCogsAccount,
  validateProductAccountingSelection,
  type ProductAccountingAccount,
} from "../lib/product-accounting"

const accounts: ProductAccountingAccount[] = [
  {
    id: "revenue-root",
    account_code: "4000",
    account_name: "Revenue",
    account_type: "income",
    normal_balance: "credit",
  },
  {
    id: "sales",
    account_code: "4100",
    account_name: "Sales Revenue",
    account_type: "income",
    sub_type: "sales_revenue",
    normal_balance: "credit",
  },
  {
    id: "service-revenue",
    account_code: "4200",
    account_name: "Service Revenue",
    account_type: "income",
    normal_balance: "credit",
  },
  {
    id: "sales-returns",
    account_code: "4110",
    account_name: "Sales Returns",
    account_type: "income",
    sub_type: "sales_returns",
    normal_balance: "debit",
  },
  {
    id: "expense-root",
    account_code: "5000",
    account_name: "Expenses",
    account_type: "expense",
    normal_balance: "debit",
  },
  {
    id: "cogs",
    account_code: "5100",
    account_name: "Cost of Goods Sold",
    account_type: "expense",
    sub_type: "cogs",
    normal_balance: "debit",
  },
  {
    id: "opex",
    account_code: "5200",
    account_name: "Operating Expenses",
    account_type: "expense",
    sub_type: "operating_expenses",
    normal_balance: "debit",
  },
]

describe("product accounting defaults", () => {
  it("selects sales revenue and COGS for stock products", () => {
    const defaults = getDefaultProductAccountingAccounts("purchased", accounts, "product")

    expect(defaults.incomeId).toBe("sales")
    expect(defaults.expenseId).toBe("cogs")
    expect(defaults.pattern).toBe("stock_product")
  })

  it("selects service revenue and avoids COGS for services", () => {
    const defaults = getDefaultProductAccountingAccounts("service", accounts, "service")

    expect(defaults.incomeId).toBe("service-revenue")
    expect(defaults.expenseId).toBe("opex")
    expect(defaults.pattern).toBe("service")
  })

  it("does not treat generic expense roots as COGS", () => {
    expect(isCogsAccount(accounts.find((account) => account.id === "expense-root")!)).toBe(false)
    expect(isCogsAccount(accounts.find((account) => account.id === "cogs")!)).toBe(true)
  })

  it("rejects accounting links that violate the product pattern", () => {
    expect(validateProductAccountingSelection({
      itemType: "product",
      productType: "manufactured",
      incomeAccountId: "sales-returns",
      expenseAccountId: "expense-root",
      accounts,
      lang: "en",
    }).success).toBe(false)

    expect(validateProductAccountingSelection({
      itemType: "product",
      productType: "raw_material",
      incomeAccountId: "sales",
      expenseAccountId: "cogs",
      accounts,
      lang: "en",
    }).success).toBe(true)

    expect(validateProductAccountingSelection({
      itemType: "service",
      productType: "service",
      incomeAccountId: "service-revenue",
      expenseAccountId: "cogs",
      accounts,
      lang: "en",
    }).success).toBe(false)
  })
})
