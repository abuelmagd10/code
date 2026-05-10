import {
  resolveProductClassification,
  type CompatItemType,
  type ProductType,
} from "@/lib/product-type"

export interface ProductAccountingAccount {
  id: string
  account_code?: string | null
  account_name?: string | null
  account_type?: string | null
  sub_type?: string | null
  normal_balance?: string | null
  is_active?: boolean | null
}

export interface ProductAccountingDefaults {
  incomeId: string
  expenseId: string
  incomeAccount?: ProductAccountingAccount
  expenseAccount?: ProductAccountingAccount
  pattern: "stock_product" | "service"
}

function norm(value: unknown) {
  return String(value || "").trim().toLowerCase()
}

function accountCode(account: ProductAccountingAccount) {
  return String(account.account_code || "").trim()
}

function accountName(account: ProductAccountingAccount) {
  return norm(account.account_name)
}

function isActive(account: ProductAccountingAccount) {
  return account.is_active !== false
}

function isDebit(account: ProductAccountingAccount) {
  return norm(account.normal_balance) === "debit"
}

function isCredit(account: ProductAccountingAccount) {
  return norm(account.normal_balance) === "credit"
}

function subType(account: ProductAccountingAccount) {
  return norm(account.sub_type)
}

export function isStockProductType(productType: ProductType, itemType?: CompatItemType) {
  return itemType !== "service" && productType !== "service"
}

export function isUsableIncomeAccount(account: ProductAccountingAccount) {
  const st = subType(account)
  return (
    isActive(account) &&
    norm(account.account_type) === "income" &&
    st !== "sales_returns" &&
    st !== "sales_discounts" &&
    !isDebit(account)
  )
}

export function isCogsAccount(account: ProductAccountingAccount) {
  const code = accountCode(account)
  const name = accountName(account)
  const st = subType(account)

  return (
    isActive(account) &&
    norm(account.account_type) === "expense" &&
    (st === "cogs" ||
      st === "cost_of_goods_sold" ||
      code === "5100" ||
      name.includes("cost of goods") ||
      name.includes("cogs") ||
      name.includes("تكلفة البضاعة") ||
      name.includes("تكلفة المبيعات")) &&
    !isCredit(account)
  )
}

export function isNonCogsExpenseAccount(account: ProductAccountingAccount) {
  return (
    isActive(account) &&
    norm(account.account_type) === "expense" &&
    !isCogsAccount(account) &&
    !isCredit(account)
  )
}

export function isCompatibleProductIncomeAccount(account: ProductAccountingAccount) {
  return isUsableIncomeAccount(account)
}

export function isCompatibleProductExpenseAccount(
  account: ProductAccountingAccount,
  productType: ProductType,
  itemType?: CompatItemType
) {
  return isStockProductType(productType, itemType)
    ? isCogsAccount(account)
    : isNonCogsExpenseAccount(account)
}

function firstBy(
  accounts: ProductAccountingAccount[],
  predicate: (account: ProductAccountingAccount) => boolean
) {
  return accounts.find((account) => isActive(account) && predicate(account))
}

function pickSalesRevenueAccount(accounts: ProductAccountingAccount[]) {
  const incomeAccounts = accounts.filter(isUsableIncomeAccount)

  return (
    firstBy(incomeAccounts, (account) => subType(account) === "sales_revenue") ||
    firstBy(incomeAccounts, (account) => accountCode(account) === "4100") ||
    firstBy(incomeAccounts, (account) => accountCode(account) === "4000" && accountName(account).includes("sales")) ||
    firstBy(incomeAccounts, (account) => accountName(account).includes("مبيعات")) ||
    incomeAccounts[0]
  )
}

function pickServiceRevenueAccount(accounts: ProductAccountingAccount[]) {
  const incomeAccounts = accounts.filter(isUsableIncomeAccount)

  return (
    firstBy(incomeAccounts, (account) => subType(account) === "service_revenue") ||
    firstBy(incomeAccounts, (account) => accountCode(account) === "4200") ||
    firstBy(incomeAccounts, (account) => accountName(account).includes("service")) ||
    firstBy(incomeAccounts, (account) => accountName(account).includes("خدمات")) ||
    pickSalesRevenueAccount(accounts) ||
    incomeAccounts[0]
  )
}

function pickCogsAccount(accounts: ProductAccountingAccount[]) {
  const expenseAccounts = accounts.filter((account) => norm(account.account_type) === "expense")

  return (
    firstBy(expenseAccounts, (account) => subType(account) === "cogs") ||
    firstBy(expenseAccounts, (account) => subType(account) === "cost_of_goods_sold") ||
    firstBy(expenseAccounts, (account) => accountCode(account) === "5100") ||
    firstBy(expenseAccounts, isCogsAccount)
  )
}

function pickOperatingExpenseAccount(accounts: ProductAccountingAccount[]) {
  const expenseAccounts = accounts.filter(isNonCogsExpenseAccount)

  return (
    firstBy(expenseAccounts, (account) => subType(account) === "operating_expenses") ||
    firstBy(expenseAccounts, (account) => accountCode(account).startsWith("52")) ||
    firstBy(expenseAccounts, (account) => accountName(account).includes("operating")) ||
    firstBy(expenseAccounts, (account) => accountName(account).includes("تشغيل")) ||
    expenseAccounts[0]
  )
}

export function getDefaultProductAccountingAccounts(
  productType: ProductType,
  accounts: ProductAccountingAccount[],
  itemType?: CompatItemType
): ProductAccountingDefaults {
  const classification = resolveProductClassification({
    itemType,
    productType,
  })
  const isStockProduct = isStockProductType(classification.productType, classification.itemType)

  const incomeAccount = isStockProduct
    ? pickSalesRevenueAccount(accounts)
    : pickServiceRevenueAccount(accounts)
  const expenseAccount = isStockProduct
    ? pickCogsAccount(accounts)
    : pickOperatingExpenseAccount(accounts)

  return {
    incomeId: incomeAccount?.id || "",
    expenseId: expenseAccount?.id || "",
    incomeAccount,
    expenseAccount,
    pattern: isStockProduct ? "stock_product" : "service",
  }
}

export function validateProductAccountingSelection(params: {
  itemType?: CompatItemType
  productType: ProductType
  incomeAccountId?: string | null
  expenseAccountId?: string | null
  accounts: ProductAccountingAccount[]
  lang?: "ar" | "en"
}) {
  const lang = params.lang || "ar"
  const classification = resolveProductClassification({
    itemType: params.itemType,
    productType: params.productType,
  })
  const byId = new Map(params.accounts.map((account) => [account.id, account]))
  const incomeAccount = params.incomeAccountId ? byId.get(params.incomeAccountId) : null
  const expenseAccount = params.expenseAccountId ? byId.get(params.expenseAccountId) : null
  const isStockProduct = isStockProductType(classification.productType, classification.itemType)
  const errors: string[] = []

  if (!incomeAccount) {
    errors.push(lang === "en" ? "Income account is required." : "حساب الإيرادات مطلوب.")
  } else if (!isUsableIncomeAccount(incomeAccount)) {
    errors.push(
      lang === "en"
        ? "Income account must be an active credit-nature income account."
        : "حساب الإيرادات يجب أن يكون حساب إيراد نشط بطبيعة دائنة."
    )
  }

  if (isStockProduct) {
    if (!expenseAccount) {
      errors.push(lang === "en" ? "COGS account is required for stock products." : "حساب تكلفة المبيعات مطلوب للمنتجات المخزنية.")
    } else if (!isCogsAccount(expenseAccount)) {
      errors.push(
        lang === "en"
          ? "Stock products must use a Cost of Goods Sold (COGS) expense account."
          : "المنتجات المخزنية يجب أن تستخدم حساب تكلفة مبيعات (COGS) من نوع مصروف."
      )
    }
  } else if (expenseAccount && !isNonCogsExpenseAccount(expenseAccount)) {
    errors.push(
      lang === "en"
        ? "Services must not use a COGS account. Use an operating expense account or leave it empty."
        : "الخدمات لا يجب أن تستخدم حساب تكلفة مبيعات. استخدم حساب مصروف تشغيلي أو اتركه بدون."
    )
  }

  return {
    success: errors.length === 0,
    errors,
  }
}
