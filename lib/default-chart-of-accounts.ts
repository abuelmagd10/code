// Default Chart of Accounts for new companies
// This creates a professional chart of accounts structure

export interface DefaultAccount {
  account_code: string
  account_name: string
  account_name_en: string
  account_type: 'asset' | 'liability' | 'equity' | 'income' | 'expense'
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

export const DEFAULT_ACCOUNTS: DefaultAccount[] = [
  // === الأصول (Assets) ===
  { account_code: '1000', account_name: 'الأصول', account_name_en: 'Assets', account_type: 'asset' },
  
  // الأصول المتداولة
  { account_code: '1100', account_name: 'الأصول المتداولة', account_name_en: 'Current Assets', account_type: 'asset', parent_code: '1000' },
  { account_code: '1110', account_name: 'الصندوق', account_name_en: 'Cash on Hand', account_type: 'asset', sub_type: 'cash', parent_code: '1100' },
  { account_code: '1120', account_name: 'البنك', account_name_en: 'Bank Account', account_type: 'asset', sub_type: 'bank', parent_code: '1100' },
  { account_code: '1130', account_name: 'العملاء', account_name_en: 'Accounts Receivable', account_type: 'asset', sub_type: 'accounts_receivable', parent_code: '1100' },
  { account_code: '1140', account_name: 'المخزون', account_name_en: 'Inventory', account_type: 'asset', sub_type: 'inventory', parent_code: '1100' },
  { account_code: '1150', account_name: 'مصروفات مدفوعة مقدماً', account_name_en: 'Prepaid Expenses', account_type: 'asset', sub_type: 'prepaid_expense', parent_code: '1100' },
  { account_code: '1160', account_name: 'ضريبة القيمة المضافة - مدخلات', account_name_en: 'VAT Input', account_type: 'asset', sub_type: 'vat_input', parent_code: '1100' },
  
  // الأصول الثابتة
  { account_code: '1200', account_name: 'الأصول الثابتة', account_name_en: 'Fixed Assets', account_type: 'asset', parent_code: '1000' },
  { account_code: '1210', account_name: 'المباني', account_name_en: 'Buildings', account_type: 'asset', sub_type: 'fixed_assets', parent_code: '1200' },
  { account_code: '1220', account_name: 'الأثاث والتجهيزات', account_name_en: 'Furniture & Fixtures', account_type: 'asset', sub_type: 'fixed_assets', parent_code: '1200' },
  { account_code: '1230', account_name: 'المعدات', account_name_en: 'Equipment', account_type: 'asset', sub_type: 'fixed_assets', parent_code: '1200' },
  { account_code: '1240', account_name: 'السيارات', account_name_en: 'Vehicles', account_type: 'asset', sub_type: 'fixed_assets', parent_code: '1200' },
  { account_code: '1250', account_name: 'مجمع الإهلاك', account_name_en: 'Accumulated Depreciation', account_type: 'asset', sub_type: 'fixed_assets', parent_code: '1200' },

  // === الالتزامات (Liabilities) ===
  { account_code: '2000', account_name: 'الالتزامات', account_name_en: 'Liabilities', account_type: 'liability' },
  
  // الالتزامات المتداولة
  { account_code: '2100', account_name: 'الالتزامات المتداولة', account_name_en: 'Current Liabilities', account_type: 'liability', parent_code: '2000' },
  { account_code: '2110', account_name: 'الموردين', account_name_en: 'Accounts Payable', account_type: 'liability', sub_type: 'accounts_payable', parent_code: '2100' },
  { account_code: '2120', account_name: 'ضريبة القيمة المضافة - مخرجات', account_name_en: 'VAT Output', account_type: 'liability', sub_type: 'vat_output', parent_code: '2100' },
  { account_code: '2130', account_name: 'الرواتب المستحقة', account_name_en: 'Accrued Salaries', account_type: 'liability', parent_code: '2100' },
  { account_code: '2140', account_name: 'إيرادات مقدمة', account_name_en: 'Unearned Revenue', account_type: 'liability', parent_code: '2100' },
  
  // الالتزامات طويلة الأجل
  { account_code: '2200', account_name: 'الالتزامات طويلة الأجل', account_name_en: 'Long-term Liabilities', account_type: 'liability', parent_code: '2000' },
  { account_code: '2210', account_name: 'القروض طويلة الأجل', account_name_en: 'Long-term Loans', account_type: 'liability', parent_code: '2200' },

  // === حقوق الملكية (Equity) ===
  { account_code: '3000', account_name: 'حقوق الملكية', account_name_en: 'Equity', account_type: 'equity' },
  { account_code: '3100', account_name: 'رأس المال', account_name_en: 'Capital', account_type: 'equity', sub_type: 'capital', parent_code: '3000' },
  { account_code: '3200', account_name: 'الأرباح المحتجزة', account_name_en: 'Retained Earnings', account_type: 'equity', sub_type: 'retained_earnings', parent_code: '3000' },
  { account_code: '3300', account_name: 'أرباح/خسائر السنة', account_name_en: 'Current Year Profit/Loss', account_type: 'equity', parent_code: '3000' },

  // === الإيرادات (Income) ===
  { account_code: '4000', account_name: 'الإيرادات', account_name_en: 'Income', account_type: 'income' },
  { account_code: '4100', account_name: 'إيرادات المبيعات', account_name_en: 'Sales Revenue', account_type: 'income', sub_type: 'sales_revenue', parent_code: '4000' },
  { account_code: '4200', account_name: 'إيرادات الخدمات', account_name_en: 'Service Revenue', account_type: 'income', parent_code: '4000' },
  { account_code: '4300', account_name: 'إيرادات أخرى', account_name_en: 'Other Income', account_type: 'income', parent_code: '4000' },
  { account_code: '4400', account_name: 'أرباح فروق العملة', account_name_en: 'FX Gains', account_type: 'income', parent_code: '4000' },

  // === المصروفات (Expenses) ===
  { account_code: '5000', account_name: 'المصروفات', account_name_en: 'Expenses', account_type: 'expense' },
  
  // تكلفة البضائع المباعة
  { account_code: '5100', account_name: 'تكلفة البضائع المباعة', account_name_en: 'Cost of Goods Sold', account_type: 'expense', sub_type: 'cogs', parent_code: '5000' },
  
  // المصروفات التشغيلية
  { account_code: '5200', account_name: 'المصروفات التشغيلية', account_name_en: 'Operating Expenses', account_type: 'expense', sub_type: 'operating_expenses', parent_code: '5000' },
  { account_code: '5210', account_name: 'الرواتب والأجور', account_name_en: 'Salaries & Wages', account_type: 'expense', parent_code: '5200' },
  { account_code: '5220', account_name: 'الإيجار', account_name_en: 'Rent Expense', account_type: 'expense', parent_code: '5200' },
  { account_code: '5230', account_name: 'الكهرباء والمياه', account_name_en: 'Utilities', account_type: 'expense', parent_code: '5200' },
  { account_code: '5240', account_name: 'الاتصالات والإنترنت', account_name_en: 'Communication', account_type: 'expense', parent_code: '5200' },
  { account_code: '5250', account_name: 'مصاريف الصيانة', account_name_en: 'Maintenance', account_type: 'expense', parent_code: '5200' },
  { account_code: '5260', account_name: 'مصاريف التسويق', account_name_en: 'Marketing', account_type: 'expense', parent_code: '5200' },
  { account_code: '5270', account_name: 'مصاريف إدارية', account_name_en: 'Administrative', account_type: 'expense', parent_code: '5200' },
  { account_code: '5280', account_name: 'مصاريف النقل', account_name_en: 'Transportation', account_type: 'expense', parent_code: '5200' },
  { account_code: '5290', account_name: 'الإهلاك', account_name_en: 'Depreciation', account_type: 'expense', parent_code: '5200' },
  
  // مصروفات أخرى
  { account_code: '5300', account_name: 'مصروفات أخرى', account_name_en: 'Other Expenses', account_type: 'expense', parent_code: '5000' },
  { account_code: '5310', account_name: 'خسائر فروق العملة', account_name_en: 'FX Losses', account_type: 'expense', parent_code: '5300' },
  { account_code: '5320', account_name: 'مصاريف البنك', account_name_en: 'Bank Charges', account_type: 'expense', parent_code: '5300' },
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
    const accountMap = new Map<string, string>()

    // First pass: insert all accounts and build the map
    const accountsToInsert = DEFAULT_ACCOUNTS.map(acc => ({
      company_id: companyId,
      account_code: acc.account_code,
      account_name: language === 'en' ? acc.account_name_en : acc.account_name,
      account_type: acc.account_type,
      sub_type: acc.sub_type || null,
      description: '',
      opening_balance: acc.opening_balance || 0,
      is_active: acc.is_active !== false,
      parent_id: null, // Will be updated in second pass
      level: acc.parent_code ? (acc.parent_code.length === 4 ? 1 : 2) : 0
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

