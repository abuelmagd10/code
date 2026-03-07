// Default Chart of Accounts for new companies
// This creates a professional chart of accounts structure

export interface DefaultAccount {
  account_code: string
  account_name: string
  account_name_en: string
  account_type: 'asset' | 'liability' | 'equity' | 'income' | 'expense'
  normal_balance: 'debit' | 'credit'
  sub_type?: string
  parent_code?: string
  opening_balance?: number
  is_active?: boolean
}

// Currency symbols mapping
export const CURRENCY_SYMBOLS: Record<string, string> = {
  EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
  KWD: 'د.ك', QAR: '﷼', BHD: 'د.ب', OMR: '﷼', JOD: 'د.أ', LBP: 'ل.ل'
}

export const CURRENCY_NAMES: Record<string, { ar: string, en: string }> = {
  EGP: { ar: 'الجنيه المصري', en: 'Egyptian Pound' },
  USD: { ar: 'الدولار الأمريكي', en: 'US Dollar' },
  EUR: { ar: 'اليورو', en: 'Euro' },
  GBP: { ar: 'الجنيه الإسترليني', en: 'British Pound' },
  SAR: { ar: 'الريال السعودي', en: 'Saudi Riyal' },
  AED: { ar: 'الدرهم الإماراتي', en: 'UAE Dirham' },
  KWD: { ar: 'الدينار الكويتي', en: 'Kuwaiti Dinar' },
  QAR: { ar: 'الريال القطري', en: 'Qatari Riyal' },
  BHD: { ar: 'الدينار البحريني', en: 'Bahraini Dinar' },
  OMR: { ar: 'الريال العماني', en: 'Omani Rial' },
  JOD: { ar: 'الدينار الأردني', en: 'Jordanian Dinar' },
  LBP: { ar: 'الليرة اللبنانية', en: 'Lebanese Pound' }
}

// =====================================================
// 🏛️ شجرة الحسابات الافتراضية - متوافقة مع IFRS
// Professional Chart of Accounts - IFRS Compliant
// =====================================================
// الترقيم: 4 أرقام للحسابات الرئيسية، يمكن إضافة فرعية بـ 6 أرقام
// Numbering: 4 digits for main accounts, 6 digits for sub-accounts
// =====================================================

export const DEFAULT_ACCOUNTS: DefaultAccount[] = [
  // ═══════════════════════════════════════════════════════════════
  // 1xxx - الأصول (Assets) - Normal Balance: Debit
  // ═══════════════════════════════════════════════════════════════
  { account_code: '1000', account_name: 'الأصول', account_name_en: 'Assets', account_type: 'asset', normal_balance: 'debit' },

  // ─────────────────────────────────────────────────────────────
  // 11xx - الأصول المتداولة (Current Assets)
  // ─────────────────────────────────────────────────────────────
  { account_code: '1100', account_name: 'الأصول المتداولة', account_name_en: 'Current Assets', account_type: 'asset', normal_balance: 'debit', parent_code: '1000' },

  // النقدية والبنوك
  { account_code: '1110', account_name: 'الصندوق', account_name_en: 'Cash on Hand', account_type: 'asset', normal_balance: 'debit', sub_type: 'cash', parent_code: '1100' },
  { account_code: '1120', account_name: 'البنوك', account_name_en: 'Bank Accounts', account_type: 'asset', normal_balance: 'debit', sub_type: 'bank', parent_code: '1100' },

  // الذمم المدينة والعملاء
  { account_code: '1130', account_name: 'العملاء (الذمم المدينة)', account_name_en: 'Accounts Receivable', account_type: 'asset', normal_balance: 'debit', sub_type: 'accounts_receivable', parent_code: '1100' },
  { account_code: '1131', account_name: 'مخصص الديون المشكوك فيها', account_name_en: 'Allowance for Doubtful Accounts', account_type: 'asset', normal_balance: 'credit', sub_type: 'allowance_doubtful', parent_code: '1130' },
  { account_code: '1135', account_name: 'أوراق القبض', account_name_en: 'Notes Receivable', account_type: 'asset', normal_balance: 'debit', parent_code: '1100' },

  // المخزون
  { account_code: '1140', account_name: 'المخزون', account_name_en: 'Inventory', account_type: 'asset', normal_balance: 'debit', sub_type: 'inventory', parent_code: '1100' },

  // المصروفات المدفوعة مقدماً والضرائب
  { account_code: '1150', account_name: 'مصروفات مدفوعة مقدماً', account_name_en: 'Prepaid Expenses', account_type: 'asset', normal_balance: 'debit', sub_type: 'prepaid_expense', parent_code: '1100' },
  { account_code: '1160', account_name: 'ضريبة القيمة المضافة - مدخلات', account_name_en: 'VAT Input (Recoverable)', account_type: 'asset', normal_balance: 'debit', sub_type: 'vat_input', parent_code: '1100' },
  { account_code: '1170', account_name: 'سلف ومقدمات للموظفين', account_name_en: 'Employee Advances', account_type: 'asset', normal_balance: 'debit', parent_code: '1100' },
  { account_code: '1180', account_name: 'سلف ومقدمات للموردين', account_name_en: 'Supplier Advances', account_type: 'asset', normal_balance: 'debit', parent_code: '1100' },
  { account_code: '1185', account_name: 'العهد (عهد الموظفين)', account_name_en: 'Petty Cash / Employee Custody', account_type: 'asset', normal_balance: 'debit', sub_type: 'cash', parent_code: '1100' },

  // ─────────────────────────────────────────────────────────────
  // 12xx - الأصول الثابتة (Fixed Assets / PPE)
  // ─────────────────────────────────────────────────────────────
  { account_code: '1200', account_name: 'الأصول الثابتة', account_name_en: 'Property, Plant & Equipment', account_type: 'asset', normal_balance: 'debit', parent_code: '1000' },
  { account_code: '1210', account_name: 'الأراضي', account_name_en: 'Land', account_type: 'asset', normal_balance: 'debit', sub_type: 'fixed_assets', parent_code: '1200' },
  { account_code: '1220', account_name: 'المباني والإنشاءات', account_name_en: 'Buildings', account_type: 'asset', normal_balance: 'debit', sub_type: 'fixed_assets', parent_code: '1200' },
  { account_code: '1230', account_name: 'الآلات والمعدات', account_name_en: 'Machinery & Equipment', account_type: 'asset', normal_balance: 'debit', sub_type: 'fixed_assets', parent_code: '1200' },
  { account_code: '1240', account_name: 'السيارات ووسائل النقل', account_name_en: 'Vehicles', account_type: 'asset', normal_balance: 'debit', sub_type: 'fixed_assets', parent_code: '1200' },
  { account_code: '1250', account_name: 'الأثاث والتجهيزات', account_name_en: 'Furniture & Fixtures', account_type: 'asset', normal_balance: 'debit', sub_type: 'fixed_assets', parent_code: '1200' },
  { account_code: '1260', account_name: 'أجهزة الحاسب الآلي', account_name_en: 'Computer Equipment', account_type: 'asset', normal_balance: 'debit', sub_type: 'fixed_assets', parent_code: '1200' },
  { account_code: '1270', account_name: 'مشاريع تحت التنفيذ', account_name_en: 'Capital Work in Progress (CWIP)', account_type: 'asset', normal_balance: 'debit', sub_type: 'fixed_assets', parent_code: '1200' },
  { account_code: '1290', account_name: 'مجمع الإهلاك', account_name_en: 'Accumulated Depreciation', account_type: 'asset', normal_balance: 'credit', sub_type: 'accumulated_depreciation', parent_code: '1200' },

  // ─────────────────────────────────────────────────────────────
  // 13xx - الأصول غير الملموسة (Intangible Assets)
  // ─────────────────────────────────────────────────────────────
  { account_code: '1300', account_name: 'الأصول غير الملموسة', account_name_en: 'Intangible Assets', account_type: 'asset', normal_balance: 'debit', parent_code: '1000' },
  { account_code: '1310', account_name: 'الشهرة', account_name_en: 'Goodwill', account_type: 'asset', normal_balance: 'debit', parent_code: '1300' },
  { account_code: '1320', account_name: 'براءات الاختراع والعلامات التجارية', account_name_en: 'Patents & Trademarks', account_type: 'asset', normal_balance: 'debit', parent_code: '1300' },
  { account_code: '1330', account_name: 'البرمجيات والتراخيص', account_name_en: 'Software & Licenses', account_type: 'asset', normal_balance: 'debit', parent_code: '1300' },
  { account_code: '1390', account_name: 'مجمع إطفاء الأصول غير الملموسة', account_name_en: 'Accumulated Amortization', account_type: 'asset', normal_balance: 'credit', parent_code: '1300' },

  // ═══════════════════════════════════════════════════════════════
  // 2xxx - الالتزامات (Liabilities) - Normal Balance: Credit
  // ═══════════════════════════════════════════════════════════════
  { account_code: '2000', account_name: 'الالتزامات', account_name_en: 'Liabilities', account_type: 'liability', normal_balance: 'credit' },

  // ─────────────────────────────────────────────────────────────
  // 21xx - الالتزامات المتداولة (Current Liabilities)
  // ─────────────────────────────────────────────────────────────
  { account_code: '2100', account_name: 'الالتزامات المتداولة', account_name_en: 'Current Liabilities', account_type: 'liability', normal_balance: 'credit', parent_code: '2000' },

  // الموردين والذمم الدائنة
  { account_code: '2110', account_name: 'الموردين (الذمم الدائنة)', account_name_en: 'Accounts Payable', account_type: 'liability', normal_balance: 'credit', sub_type: 'accounts_payable', parent_code: '2100' },
  { account_code: '2115', account_name: 'أوراق الدفع', account_name_en: 'Notes Payable', account_type: 'liability', normal_balance: 'credit', parent_code: '2100' },

  // الضرائب المستحقة
  { account_code: '2120', account_name: 'ضريبة القيمة المضافة - مخرجات', account_name_en: 'VAT Output (Payable)', account_type: 'liability', normal_balance: 'credit', sub_type: 'vat_output', parent_code: '2100' },
  { account_code: '2125', account_name: 'ضرائب مستحقة أخرى', account_name_en: 'Other Taxes Payable', account_type: 'liability', normal_balance: 'credit', parent_code: '2100' },

  // المستحقات
  { account_code: '2130', account_name: 'الرواتب والأجور المستحقة', account_name_en: 'Accrued Salaries & Wages', account_type: 'liability', normal_balance: 'credit', sub_type: 'accrued_salaries', parent_code: '2100' },
  { account_code: '2140', account_name: 'إيرادات مقدمة (غير مكتسبة)', account_name_en: 'Unearned Revenue', account_type: 'liability', normal_balance: 'credit', sub_type: 'unearned_revenue', parent_code: '2100' },
  { account_code: '2145', account_name: 'سلف من العملاء', account_name_en: 'Customer Deposits', account_type: 'liability', normal_balance: 'credit', parent_code: '2100' },
  { account_code: '2150', account_name: 'الأرباح الموزعة المستحقة', account_name_en: 'Dividends Payable', account_type: 'liability', normal_balance: 'credit', sub_type: 'dividends_payable', parent_code: '2100' },
  { account_code: '2155', account_name: 'رصيد العملاء الدائن', account_name_en: 'Customer Credit Balance', account_type: 'liability', normal_balance: 'credit', sub_type: 'customer_credit', parent_code: '2100' },
  { account_code: '2160', account_name: 'مصروفات مستحقة أخرى', account_name_en: 'Other Accrued Expenses', account_type: 'liability', normal_balance: 'credit', sub_type: 'accruals', parent_code: '2100' },
  { account_code: '2170', account_name: 'قروض قصيرة الأجل', account_name_en: 'Short-term Loans', account_type: 'liability', normal_balance: 'credit', parent_code: '2100' },

  // ─────────────────────────────────────────────────────────────
  // 22xx - الالتزامات طويلة الأجل (Non-Current Liabilities)
  // ─────────────────────────────────────────────────────────────
  { account_code: '2200', account_name: 'الالتزامات طويلة الأجل', account_name_en: 'Long-term Liabilities', account_type: 'liability', normal_balance: 'credit', parent_code: '2000' },
  { account_code: '2210', account_name: 'القروض طويلة الأجل', account_name_en: 'Long-term Loans', account_type: 'liability', normal_balance: 'credit', parent_code: '2200' },
  { account_code: '2220', account_name: 'سندات مستحقة الدفع', account_name_en: 'Bonds Payable', account_type: 'liability', normal_balance: 'credit', parent_code: '2200' },
  { account_code: '2230', account_name: 'التزامات عقود الإيجار', account_name_en: 'Lease Liabilities', account_type: 'liability', normal_balance: 'credit', parent_code: '2200' },
  { account_code: '2240', account_name: 'مخصص مكافأة نهاية الخدمة', account_name_en: 'Provision for End of Service Benefits', account_type: 'liability', normal_balance: 'credit', parent_code: '2200' },

  // ═══════════════════════════════════════════════════════════════
  // 3xxx - حقوق الملكية (Equity) - Normal Balance: Credit
  // ═══════════════════════════════════════════════════════════════
  { account_code: '3000', account_name: 'حقوق الملكية', account_name_en: 'Equity', account_type: 'equity', normal_balance: 'credit' },
  { account_code: '3100', account_name: 'رأس المال', account_name_en: 'Share Capital', account_type: 'equity', normal_balance: 'credit', sub_type: 'capital', parent_code: '3000' },
  { account_code: '3200', account_name: 'الأرباح المحتجزة', account_name_en: 'Retained Earnings', account_type: 'equity', normal_balance: 'credit', sub_type: 'retained_earnings', parent_code: '3000' },
  { account_code: '3300', account_name: 'صافي ربح/خسارة الفترة', account_name_en: 'Net Income / Loss', account_type: 'equity', normal_balance: 'credit', parent_code: '3000' },
  { account_code: '3400', account_name: 'الاحتياطي القانوني', account_name_en: 'Legal Reserve', account_type: 'equity', normal_balance: 'credit', parent_code: '3000' },
  { account_code: '3500', account_name: 'احتياطيات أخرى', account_name_en: 'Other Reserves', account_type: 'equity', normal_balance: 'credit', parent_code: '3000' },
  { account_code: '3600', account_name: 'حساب جاري الشركاء', account_name_en: 'Partners Current Account', account_type: 'equity', normal_balance: 'credit', parent_code: '3000' },

  // ═══════════════════════════════════════════════════════════════
  // 4xxx - الإيرادات (Revenue/Income) - Normal Balance: Credit
  // ═══════════════════════════════════════════════════════════════
  { account_code: '4000', account_name: 'الإيرادات', account_name_en: 'Revenue', account_type: 'income', normal_balance: 'credit' },

  // إيرادات المبيعات
  { account_code: '4100', account_name: 'إيرادات المبيعات', account_name_en: 'Sales Revenue', account_type: 'income', normal_balance: 'credit', sub_type: 'sales_revenue', parent_code: '4000' },
  { account_code: '4110', account_name: 'مردودات المبيعات', account_name_en: 'Sales Returns', account_type: 'income', normal_balance: 'debit', sub_type: 'sales_returns', parent_code: '4100' },
  { account_code: '4120', account_name: 'خصم المبيعات (المسموح به)', account_name_en: 'Sales Discounts', account_type: 'income', normal_balance: 'debit', sub_type: 'sales_discounts', parent_code: '4100' },

  // إيرادات أخرى
  { account_code: '4200', account_name: 'إيرادات الخدمات', account_name_en: 'Service Revenue', account_type: 'income', normal_balance: 'credit', parent_code: '4000' },
  { account_code: '4300', account_name: 'إيرادات أخرى', account_name_en: 'Other Income', account_type: 'income', normal_balance: 'credit', parent_code: '4000' },
  { account_code: '4310', account_name: 'إيرادات الفوائد', account_name_en: 'Interest Income', account_type: 'income', normal_balance: 'credit', parent_code: '4300' },
  { account_code: '4320', account_name: 'أرباح فروق العملة', account_name_en: 'Foreign Exchange Gains', account_type: 'income', normal_balance: 'credit', parent_code: '4300' },
  { account_code: '4330', account_name: 'أرباح بيع أصول', account_name_en: 'Gain on Asset Disposal', account_type: 'income', normal_balance: 'credit', parent_code: '4300' },

  // ═══════════════════════════════════════════════════════════════
  // 5xxx - المصروفات (Expenses) - Normal Balance: Debit
  // ═══════════════════════════════════════════════════════════════
  { account_code: '5000', account_name: 'المصروفات', account_name_en: 'Expenses', account_type: 'expense', normal_balance: 'debit' },

  // ─────────────────────────────────────────────────────────────
  // 51xx - تكلفة المبيعات (Cost of Sales)
  // ─────────────────────────────────────────────────────────────
  { account_code: '5100', account_name: 'تكلفة البضائع المباعة', account_name_en: 'Cost of Goods Sold', account_type: 'expense', normal_balance: 'debit', sub_type: 'cogs', parent_code: '5000' },
  { account_code: '5110', account_name: 'مشتريات', account_name_en: 'Purchases', account_type: 'expense', normal_balance: 'debit', sub_type: 'purchases', parent_code: '5100' },
  { account_code: '5120', account_name: 'مردودات المشتريات', account_name_en: 'Purchase Returns', account_type: 'expense', normal_balance: 'credit', sub_type: 'purchase_returns', parent_code: '5100' },
  { account_code: '5130', account_name: 'خصم المشتريات (المكتسب)', account_name_en: 'Purchase Discounts', account_type: 'expense', normal_balance: 'credit', parent_code: '5100' },
  { account_code: '5140', account_name: 'مصاريف نقل المشتريات', account_name_en: 'Freight-in', account_type: 'expense', normal_balance: 'debit', parent_code: '5100' },

  // ─────────────────────────────────────────────────────────────
  // 52xx - المصروفات التشغيلية (Operating Expenses)
  // ─────────────────────────────────────────────────────────────
  { account_code: '5200', account_name: 'المصروفات التشغيلية', account_name_en: 'Operating Expenses', account_type: 'expense', normal_balance: 'debit', sub_type: 'operating_expenses', parent_code: '5000' },
  { account_code: '5210', account_name: 'الرواتب والأجور', account_name_en: 'Salaries & Wages', account_type: 'expense', normal_balance: 'debit', parent_code: '5200' },
  { account_code: '5220', account_name: 'الإيجارات', account_name_en: 'Rent Expense', account_type: 'expense', normal_balance: 'debit', parent_code: '5200' },
  { account_code: '5230', account_name: 'المرافق (كهرباء، مياه، غاز)', account_name_en: 'Utilities', account_type: 'expense', normal_balance: 'debit', parent_code: '5200' },
  { account_code: '5240', account_name: 'الاتصالات والإنترنت', account_name_en: 'Communication & Internet', account_type: 'expense', normal_balance: 'debit', parent_code: '5200' },
  { account_code: '5250', account_name: 'الصيانة والإصلاحات', account_name_en: 'Repairs & Maintenance', account_type: 'expense', normal_balance: 'debit', parent_code: '5200' },
  { account_code: '5260', account_name: 'التسويق والإعلان', account_name_en: 'Marketing & Advertising', account_type: 'expense', normal_balance: 'debit', parent_code: '5200' },
  { account_code: '5270', account_name: 'المصاريف الإدارية', account_name_en: 'Administrative Expenses', account_type: 'expense', normal_balance: 'debit', parent_code: '5200' },
  { account_code: '5280', account_name: 'النقل والتوصيل', account_name_en: 'Transportation & Delivery', account_type: 'expense', normal_balance: 'debit', parent_code: '5200' },
  { account_code: '5290', account_name: 'مصروف الإهلاك', account_name_en: 'Depreciation Expense', account_type: 'expense', normal_balance: 'debit', sub_type: 'depreciation_expense', parent_code: '5200' },
  { account_code: '5295', account_name: 'مصروف الإطفاء', account_name_en: 'Amortization Expense', account_type: 'expense', normal_balance: 'debit', parent_code: '5200' },

  // ─────────────────────────────────────────────────────────────
  // 53xx - مصروفات أخرى (Other Expenses)
  // ─────────────────────────────────────────────────────────────
  { account_code: '5300', account_name: 'مصروفات أخرى', account_name_en: 'Other Expenses', account_type: 'expense', normal_balance: 'debit', parent_code: '5000' },
  { account_code: '5310', account_name: 'خسائر فروق العملة', account_name_en: 'Foreign Exchange Losses', account_type: 'expense', normal_balance: 'debit', parent_code: '5300' },
  { account_code: '5320', account_name: 'مصاريف بنكية وعمولات', account_name_en: 'Bank Charges & Fees', account_type: 'expense', normal_balance: 'debit', parent_code: '5300' },
  { account_code: '5330', account_name: 'مصروفات الفوائد', account_name_en: 'Interest Expense', account_type: 'expense', normal_balance: 'debit', parent_code: '5300' },
  { account_code: '5340', account_name: 'خسائر بيع أصول', account_name_en: 'Loss on Asset Disposal', account_type: 'expense', normal_balance: 'debit', parent_code: '5300' },
  { account_code: '5350', account_name: 'مخصص الديون المشكوك فيها', account_name_en: 'Bad Debt Expense', account_type: 'expense', normal_balance: 'debit', parent_code: '5300' },
  { account_code: '5360', account_name: 'التأمينات', account_name_en: 'Insurance Expense', account_type: 'expense', normal_balance: 'debit', parent_code: '5300' },
  { account_code: '5370', account_name: 'الرسوم والضرائب', account_name_en: 'Taxes & Duties', account_type: 'expense', normal_balance: 'debit', parent_code: '5300' },
]

/**
 * Creates default chart of accounts for a new company
 * @param supabase - Supabase client instance
 * @param companyId - The ID of the new company
 * @param language - The preferred language ('ar' or 'en')
 * @returns Promise with result of the operation
 */
export async function createDefaultChartOfAccounts(
  supabase: any,
  companyId: string,
  language: 'ar' | 'en' = 'ar'
): Promise<{ success: boolean; error?: string; accountsCreated?: number }> {
  try {
    // Build a map of account_code to parent account

    // First pass: insert all accounts and build the map
    const accountMap = new Map<string, string>()
    const accountsToInsert = DEFAULT_ACCOUNTS.map(acc => ({
      company_id: companyId,
      account_code: acc.account_code,
      account_name: language === 'en' ? acc.account_name_en : acc.account_name,
      account_type: acc.account_type,
      normal_balance: acc.normal_balance,
      sub_type: acc.sub_type || null,
      description: '',
      opening_balance: acc.opening_balance || 0,
      is_active: acc.is_active !== false,
      is_system: true, // Mark all default accounts as system accounts
      parent_id: null, // Will be updated in second pass
      level: acc.parent_code ? (acc.parent_code.length === 4 ? 2 : 3) : 1
    }))

    // Insert accounts
    const { data: insertedAccounts, error: insertError } = await supabase
      .from('chart_of_accounts')
      .insert(accountsToInsert)
      .select('id, account_code')

    if (insertError) {
      console.error('Error inserting accounts:', insertError)
      return { success: false, error: insertError.message }
    }

    // Build map of account_code to id
    insertedAccounts?.forEach((acc: any) => {
      accountMap.set(acc.account_code, acc.id)
    })

    // Second pass: update parent_id for accounts with parent_code
    const updates = DEFAULT_ACCOUNTS
      .filter(acc => acc.parent_code)
      .map(acc => {
        const accountId = accountMap.get(acc.account_code)
        const parentId = accountMap.get(acc.parent_code!)
        return { accountId, parentId }
      })
      .filter(u => u.accountId && u.parentId)

    // Update parent_id for each account
    for (const update of updates) {
      await supabase
        .from('chart_of_accounts')
        .update({ parent_id: update.parentId })
        .eq('id', update.accountId)
    }

    return {
      success: true,
      accountsCreated: insertedAccounts?.length || 0
    }
  } catch (error: any) {
    console.error('Error creating default chart of accounts:', error)
    return { success: false, error: error.message }
  }
}

