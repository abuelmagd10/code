-- ============================================================
-- AI Assistant: company_ai_settings + page_guides tables
-- ============================================================

-- 1. Per-company AI settings
CREATE TABLE IF NOT EXISTS public.company_ai_settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ai_assistant_enabled BOOLEAN NOT NULL DEFAULT true,
  ai_mode         TEXT NOT NULL DEFAULT 'manual'
                    CHECK (ai_mode IN ('disabled', 'manual', 'auto')),
  ai_language_mode TEXT NOT NULL DEFAULT 'follow_app_language'
                    CHECK (ai_language_mode IN ('follow_app_language', 'custom')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id)
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.touch_company_ai_settings()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_touch_company_ai_settings ON public.company_ai_settings;
CREATE TRIGGER trg_touch_company_ai_settings
  BEFORE UPDATE ON public.company_ai_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_company_ai_settings();

-- RLS
ALTER TABLE public.company_ai_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_ai_settings_select" ON public.company_ai_settings
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM public.company_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "company_ai_settings_upsert" ON public.company_ai_settings
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM public.company_members
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- 2. Page guides table (app-wide, not per-company)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.page_guides (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_key        TEXT NOT NULL UNIQUE,
  title_ar        TEXT NOT NULL DEFAULT '',
  title_en        TEXT NOT NULL DEFAULT '',
  description_ar  TEXT NOT NULL DEFAULT '',
  description_en  TEXT NOT NULL DEFAULT '',
  steps_ar        JSONB NOT NULL DEFAULT '[]'::jsonb,
  steps_en        JSONB NOT NULL DEFAULT '[]'::jsonb,
  tips_ar         TEXT[] NOT NULL DEFAULT '{}',
  tips_en         TEXT[] NOT NULL DEFAULT '{}',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: all authenticated users can read page_guides (read-only)
ALTER TABLE public.page_guides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "page_guides_select_authenticated" ON public.page_guides
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only service_role can insert/update/delete
CREATE POLICY "page_guides_admin_write" ON public.page_guides
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- 3. Seed: page guides for all major application pages
-- ============================================================
INSERT INTO public.page_guides
  (page_key, title_ar, title_en, description_ar, description_en, steps_ar, steps_en, tips_ar, tips_en)
VALUES

-- DASHBOARD
('dashboard',
 'لوحة التحكم',
 'Dashboard',
 'لوحة التحكم هي نقطة البداية الرئيسية للنظام. تعرض ملخصاً شاملاً للأداء المالي والتشغيلي للشركة في الوقت الفعلي.',
 'The Dashboard is the main starting point of the system. It displays a comprehensive real-time summary of your company''s financial and operational performance.',
 '["اختر نطاق العرض: شركة كاملة أو فرع محدد من القائمة أعلى", "راجع بطاقات المؤشرات الرئيسية: صافي المبيعات، الأرباح، المصروفات", "استعرض الرسوم البيانية لمقارنة الفترات الزمنية", "انقر على أي بطاقة للانتقال مباشرة للتقرير التفصيلي"]',
 '["Select scope: full company or specific branch from the top selector", "Review key metric cards: net sales, profit, expenses", "Browse charts to compare time periods", "Click any card to navigate directly to the detailed report"]',
 ARRAY['الأرقام تعتمد على القيود المرحّلة فقط (status=posted)', 'الفواتير الملغاة لا تُحتسب في الإيرادات', 'تأكد من ترحيل الفواتير لظهورها في لوحة التحكم'],
 ARRAY['Numbers rely only on posted journal entries (status=posted)', 'Cancelled invoices are excluded from revenue', 'Post invoices to see them reflected on the dashboard']
),

-- INVOICES
('invoices',
 'فواتير المبيعات',
 'Sales Invoices',
 'صفحة الفواتير تتيح إنشاء وإدارة جميع فواتير المبيعات. يمكن إصدار الفاتورة للعملاء وتتبع حالة الدفع وإجراء مرتجعات جزئية.',
 'The Invoices page lets you create and manage all sales invoices. You can issue invoices to customers, track payment status, and process partial returns.',
 '["انقر «فاتورة جديدة» لإنشاء فاتورة", "اختر العميل والفرع والمنتجات مع الكميات", "احفظ الفاتورة كمسودة أو أرسلها مباشرة", "سجّل الدفعات عبر زر «تسجيل دفعة»", "لإجراء مرتجع: افتح الفاتورة ثم «إرجاع جزئي»"]',
 '["Click «New Invoice» to create an invoice", "Select customer, branch, and products with quantities", "Save as draft or send directly", "Record payments via the «Record Payment» button", "To return: open the invoice then «Partial Return»"]',
 ARRAY['ترحيل الفاتورة ينشئ قيود GL تلقائياً', 'المرتجع يعكس COGS ويعيد المخزون', 'الفواتير الملغاة تُحذف قيودها بالـ Soft Delete'],
 ARRAY['Posting an invoice auto-creates GL journal entries', 'Returns reverse COGS and restore inventory', 'Cancelled invoice journals are soft-deleted for audit trail']
),

-- BILLS
('bills',
 'فواتير المشتريات',
 'Purchase Bills',
 'صفحة فواتير المشتريات لتسجيل مشتريات البضاعة والخدمات من الموردين. تؤثر على المخزون والذمم الدائنة تلقائياً.',
 'Purchase Bills page for recording goods and service purchases from suppliers. Automatically affects inventory and accounts payable.',
 '["انقر «فاتورة شراء جديدة» لبدء فاتورة", "اختر المورد والمخزن والمنتجات", "حدد السعر والكمية والضريبة لكل صنف", "اعتمد الفاتورة لتحديث المخزون والذمم الدائنة", "سجّل الدفع للمورد من زر «تسجيل دفعة»"]',
 '["Click «New Purchase Bill» to start", "Select supplier, warehouse, and products", "Set price, quantity, and tax per item", "Approve the bill to update inventory and payables", "Record supplier payment via «Record Payment»"]',
 ARRAY['اعتماد الفاتورة يرفع المخزون ويُنشئ التزام بالذمم الدائنة', 'تسجيل الدفع يُخفض الذمم الدائنة ويُخفض النقدية', 'تأكد من تحديد المخزن الصحيح قبل الاعتماد'],
 ARRAY['Approving the bill increases inventory and creates AP liability', 'Recording payment reduces AP and reduces cash', 'Ensure the correct warehouse is selected before approval']
),

-- CUSTOMERS
('customers',
 'العملاء',
 'Customers',
 'إدارة بيانات العملاء بشكل مركزي. يمكن إضافة بيانات العميل والاطلاع على سجل معاملاته وكشف حسابه.',
 'Centrally manage customer data. Add customer details, view transaction history, and access account statements.',
 '["انقر «عميل جديد» لإضافة عميل", "أدخل الاسم والبريد والهاتف والبلد", "حدد الحد الائتماني إن وجد", "انقر على العميل لعرض سجل فواتيره ومدفوعاته", "اضغط «كشف حساب» للاطلاع على الرصيد"]',
 '["Click «New Customer» to add a customer", "Enter name, email, phone, and country", "Set credit limit if applicable", "Click on a customer to view invoice and payment history", "Press «Account Statement» to view the balance"]',
 ARRAY['الذمم المدينة تُحسب من قيود GL وليس من جداول الفواتير مباشرة', 'يمكن ربط العميل بفرع محدد', 'تحديث بيانات العميل لا يؤثر على الفواتير السابقة'],
 ARRAY['Receivables are calculated from GL entries not invoice tables directly', 'Customers can be linked to a specific branch', 'Updating customer data does not affect previous invoices']
),

-- SUPPLIERS
('suppliers',
 'الموردين',
 'Suppliers',
 'إدارة بيانات الموردين ومتابعة الذمم الدائنة وكشوف الحساب.',
 'Manage supplier data and track accounts payable and account statements.',
 '["انقر «مورد جديد» لإضافة مورد", "أدخل البيانات الأساسية: الاسم والبريد والهاتف", "اعرض سجل فواتير الشراء والمدفوعات", "اطلع على الرصيد المستحق لكل مورد"]',
 '["Click «New Supplier» to add a supplier", "Enter basic details: name, email, phone", "View purchase bill and payment history", "Check outstanding balance per supplier"]',
 ARRAY['الذمم الدائنة تعكس الفواتير المعتمدة غير المدفوعة', 'الدفع الجزئي يُخفض الرصيد تدريجياً', 'يمكن إضافة ملاحظات خاصة لكل مورد'],
 ARRAY['Payables reflect approved unpaid bills', 'Partial payments reduce the balance progressively', 'You can add private notes per supplier']
),

-- PRODUCTS
('products',
 'المنتجات والخدمات',
 'Products & Services',
 'إدارة كتالوج المنتجات والخدمات بما يشمل الأسعار والتكاليف وتصنيفات المخزون.',
 'Manage the product and service catalog including prices, costs, and inventory classifications.',
 '["انقر «منتج جديد» لإضافة منتج أو خدمة", "حدد نوع المنتج: مخزون / خدمة / غير مخزون", "أدخل سعر البيع والتكلفة ووحدة القياس", "أضف صورة ووصفاً ورقم SKU إن رغبت", "المنتجات المعطلة لا تظهر في الفواتير الجديدة"]',
 '["Click «New Product» to add a product or service", "Set product type: inventory / service / non-inventory", "Enter selling price, cost, and unit of measure", "Add image, description, and SKU if needed", "Disabled products won''t appear in new invoices"]',
 ARRAY['تكلفة المنتج تُستخدم في حساب COGS عند البيع', 'التسعير يمكن تجاوزه يدوياً في الفاتورة', 'المنتجات من نوع خدمة لا تؤثر على المخزون'],
 ARRAY['Product cost is used to calculate COGS on sale', 'Pricing can be manually overridden in the invoice', 'Service-type products do not affect inventory']
),

-- INVENTORY
('inventory',
 'المخزون',
 'Inventory',
 'متابعة أرصدة المخزون الفعلية عبر المخازن والفروع. يعتمد على طريقة FIFO لتقييم التكلفة.',
 'Track actual inventory balances across warehouses and branches. Uses FIFO method for cost valuation.',
 '["اعرض الأرصدة الحالية لكل منتج ومخزن", "استخدم فلتر المخزن لعرض مخزن محدد", "انقر على منتج لعرض حركاته التفصيلية", "أجرِ تسوية مخزون عند الجرد الفعلي", "راجع تقرير تقادم المخزون للمنتجات البطيئة"]',
 '["View current balances per product and warehouse", "Use warehouse filter to view a specific store", "Click on a product to view detailed movements", "Perform inventory adjustment after physical count", "Review aging report for slow-moving products"]',
 ARRAY['الكميات تعكس الحركات الفعلية من الفواتير والمشتريات والتسويات', 'التكلفة محسوبة بـ FIFO ويجب مطابقتها مع GL', 'تسوية المخزون تُنشئ قيد محاسبي تلقائياً'],
 ARRAY['Quantities reflect actual movements from invoices, purchases, and adjustments', 'Cost is calculated via FIFO and should match GL', 'Inventory adjustments automatically create a journal entry']
),

-- EXPENSES
('expenses',
 'المصروفات',
 'Expenses',
 'تسجيل وإدارة المصروفات التشغيلية غير المرتبطة بالمشتريات المباشرة كالإيجار والكهرباء والرواتب.',
 'Record and manage operational expenses not tied to direct purchases, such as rent, utilities, and salaries.',
 '["انقر «مصروف جديد» لإضافة مصروف", "حدد الحساب المحاسبي المناسب للمصروف", "أدخل المبلغ والتاريخ والوصف", "أرفق إيصالاً أو مستنداً داعماً", "المصروف يُنشئ قيد محاسبي (مدين مصروف / دائن نقدية)"]',
 '["Click «New Expense» to add an expense", "Select the appropriate GL account for the expense", "Enter amount, date, and description", "Attach a receipt or supporting document", "Expense creates a journal entry (Dr. Expense / Cr. Cash)"]',
 ARRAY['تأكد من اختيار الحساب الصحيح لتصنيف المصروف بدقة', 'المصروفات تظهر في قائمة الدخل مباشرة بعد الترحيل', 'يمكن ربط المصروف بمركز تكلفة محدد'],
 ARRAY['Ensure correct account selection for accurate expense classification', 'Expenses appear in the income statement immediately after posting', 'Expenses can be linked to a specific cost center']
),

-- JOURNAL
('journal',
 'القيود اليومية',
 'Journal Entries',
 'إنشاء ومراجعة القيود اليومية يدوياً. مخصص للمحاسبين لإدخال قيود التسوية والتصحيحات.',
 'Create and review journal entries manually. Designed for accountants to enter adjustment and correction entries.',
 '["انقر «قيد جديد» لإنشاء قيد يدوي", "أضف سطور المدين والدائن مع تحديد الحسابات", "تأكد من توازن القيد (المدين = الدائن)", "احفظ كمسودة أو ارحّل مباشرة", "القيود المرحّلة فقط تؤثر على التقارير"]',
 '["Click «New Entry» to create a manual entry", "Add debit and credit lines with account selection", "Ensure the entry is balanced (debit = credit)", "Save as draft or post directly", "Only posted entries affect reports"]',
 ARRAY['لا يمكن تعديل قيد مرحّل — يجب إنشاء قيد عكسي', 'القيود بـ status=draft لا تظهر في أي تقرير', 'استخدم وصفاً واضحاً لكل سطر لسهولة التدقيق'],
 ARRAY['Posted entries cannot be edited — create a reversal entry instead', 'Draft entries do not appear in any report', 'Use clear descriptions per line for easier auditing']
),

-- PAYMENTS
('payments',
 'المدفوعات',
 'Payments',
 'إدارة مدفوعات العملاء والموردين وتسوية الأرصدة.',
 'Manage customer and supplier payments and balance settlement.',
 '["استعرض المدفوعات المسجلة مع تفاصيلها", "سجّل دفعة جديدة عبر «تسجيل دفعة»", "اربط الدفعة بفاتورة أو اتركها غير مرتبطة", "الدفع الجزئي يُحدّث حالة الفاتورة تلقائياً", "راجع تقرير الأرصدة للتحقق من الذمم"]',
 '["Browse recorded payments with their details", "Record a new payment via «Record Payment»", "Link payment to an invoice or leave unlinked", "Partial payment automatically updates invoice status", "Review balance report to verify receivables/payables"]',
 ARRAY['الدفعة غير المرتبطة تُسجَّل كدفعة مقدمة', 'يجب تحديد الحساب البنكي أو النقدي عند التسجيل', 'الدفع يُنشئ قيد GL تلقائياً'],
 ARRAY['Unlinked payment is recorded as an advance payment', 'Bank or cash account must be specified on recording', 'Payment auto-creates a GL journal entry']
),

-- INCOME STATEMENT
('income_statement',
 'قائمة الدخل (الأرباح والخسائر)',
 'Income Statement (P&L)',
 'تقرير شامل للإيرادات والمصروفات وصافي الربح خلال فترة زمنية محددة. يعتمد حصراً على القيود المرحّلة في دفتر الأستاذ.',
 'Comprehensive report of revenues, expenses, and net profit for a specified period. Relies exclusively on posted journal entries in the general ledger.',
 '["حدد الفترة الزمنية (من - إلى) من أعلى الصفحة", "اختر الفرع أو اعرض مستوى الشركة الكاملة", "راجع إجمالي الإيرادات وتفاصيل المصروفات", "لاحظ صافي الربح في أسفل التقرير", "يمكن تصدير التقرير بصيغة PDF أو Excel"]',
 '["Set the date range (from - to) at the top", "Select branch or view full company level", "Review total revenues and expense details", "Note the net profit at the bottom of the report", "Export report as PDF or Excel"]',
 ARRAY['جميع الأرقام من GL — لا من جداول الفواتير مباشرة', 'المرتجعات تُخصم من الإيرادات تلقائياً', 'COGS يُحتسب من قيود invoice_cogs المرحّلة'],
 ARRAY['All figures from GL — not invoice tables directly', 'Returns are automatically deducted from revenues', 'COGS is calculated from posted invoice_cogs entries']
),

-- BALANCE SHEET
('balance_sheet',
 'الميزانية العمومية',
 'Balance Sheet',
 'تقرير الوضع المالي للشركة: الأصول = الالتزامات + حقوق الملكية. يعرض الوضع حتى تاريخ محدد.',
 'Company financial position report: Assets = Liabilities + Equity. Shows position as of a specific date.',
 '["حدد تاريخ الميزانية (As of Date)", "راجع قسم الأصول: نقدية + مخزون + ذمم مدينة + أصول أخرى", "راجع قسم الالتزامات: ذمم دائنة + التزامات", "راجع حقوق الملكية: رأس المال + الأرباح المحتجزة", "تحقق أن الأصول = الالتزامات + حقوق الملكية"]',
 '["Set the balance sheet date (As of Date)", "Review Assets: cash + inventory + receivables + other assets", "Review Liabilities: payables + liabilities", "Review Equity: capital + retained earnings", "Verify Assets = Liabilities + Equity"]',
 ARRAY['الميزانية تعتمد على GL فقط (status=posted)', 'الفرق بين الأصول والمطلوبات يجب أن يكون صفراً', 'راجع صفحة اختبارات التحقق لضمان التوازن'],
 ARRAY['Balance sheet relies on GL only (status=posted)', 'Difference between assets and liabilities must be zero', 'Check the Accounting Validation page to ensure balance']
),

-- ACCOUNTING VALIDATION
('accounting_validation',
 'اختبارات التحقق المحاسبي',
 'Accounting Validation',
 'صفحة تشغيل 9 اختبارات آلية للتحقق من تكامل البيانات المحاسبية. تمنع الإقفال السنوي عند وجود أخطاء حرجة.',
 'Run 9 automated tests to verify accounting data integrity. Blocks annual closing when critical errors exist.',
 '["اضغط «تشغيل الاختبارات» لبدء الفحص الشامل", "راجع نتيجة كل اختبار: اجتاز / فشل", "الأخطاء الحرجة (Critical) يجب إصلاحها أولاً", "لاحظ الفرق الرقمي في البطاقات عند الفشل", "النتائج محفوظة مع الطابع الزمني للفحص الأخير"]',
 '["Press «Run Tests» to start the comprehensive check", "Review each test result: Passed / Failed", "Critical errors must be resolved first", "Note numeric differences in cards on failure", "Results saved with timestamp of last run"]',
 ARRAY['الاختبار 9 يقارن قيمة المخزون في GL مع FIFO Engine', 'الإقفال السنوي محظور عند وجود أخطاء حرجة', 'شغّل الاختبارات دورياً للتأكد من سلامة البيانات'],
 ARRAY['Test 9 compares GL inventory with FIFO Engine valuation', 'Annual closing is blocked when critical errors exist', 'Run tests periodically to ensure data integrity']
),

-- ANNUAL CLOSING
('annual_closing',
 'الإقفال السنوي',
 'Annual Closing',
 'تنفيذ قيد الإقفال السنوي: تصفير حسابات الإيرادات والمصروفات وترحيل صافي الدخل لحساب الأرباح المحتجزة.',
 'Execute the annual closing entry: zero out revenue and expense accounts and transfer net income to Retained Earnings.',
 '["تأكد من اجتياز جميع اختبارات التحقق المحاسبي أولاً", "حدد السنة المالية المراد إقفالها", "اختر حساب الأرباح المحتجزة (3200)", "اضغط «معاينة» لمراجعة الأرقام قبل التنفيذ", "اضغط «تنفيذ الإقفال» وأكّد العملية"]',
 '["Ensure all accounting validation tests pass first", "Select the fiscal year to close", "Choose Retained Earnings account (3200)", "Press «Preview» to review numbers before execution", "Press «Execute Closing» and confirm"]',
 ARRAY['الإقفال عملية لا رجعة فيها — تأكد من المعاينة أولاً', 'يجب اجتياز جميع الاختبارات الحرجة قبل الإقفال', 'الإقفال يُقفل الفترة المحاسبية ويمنع إضافة قيود لها'],
 ARRAY['Closing is irreversible — always preview first', 'All critical validation tests must pass before closing', 'Closing locks the accounting period preventing new entries']
),

-- SHAREHOLDERS
('shareholders',
 'المساهمون',
 'Shareholders',
 'إدارة بيانات المساهمين وتوزيع الأرباح. يدعم التوزيع الفوري أو التسجيل كالتزام.',
 'Manage shareholder data and profit distribution. Supports immediate payment or recording as a liability.',
 '["أضف مساهماً جديداً مع نسبة ملكيته", "حدد مبلغ الأرباح المراد توزيعها", "اختر طريقة التوزيع: فوري أو كالتزام", "للتوزيع الفوري: حدد حساب الصرف (نقدي/بنكي)", "راجع سجل التوزيعات السابقة"]',
 '["Add a new shareholder with ownership percentage", "Set the profit amount to distribute", "Choose distribution method: immediate or as liability", "For immediate: select disbursement account (cash/bank)", "Review history of previous distributions"]',
 ARRAY['توزيع الأرباح يُنشئ قيد: مدين أرباح محتجزة / دائن حساب التوزيع', 'التوزيع الفوري يُخفض النقدية مباشرة', 'يمكن تفعيل قيد الإقفال السنوي قبل التوزيع'],
 ARRAY['Distribution creates entry: Dr. Retained Earnings / Cr. Distribution Account', 'Immediate distribution reduces cash directly', 'Consider executing annual closing before distribution']
),

-- PAYROLL
('payroll',
 'الرواتب',
 'Payroll',
 'إدارة رواتب الموظفين ومعالجة دورة الرواتب الشهرية وتسجيل قيود المحاسبة المقابلة.',
 'Manage employee salaries, process monthly payroll cycle, and record corresponding accounting entries.',
 '["راجع قائمة الموظفين والرواتب الأساسية", "ابدأ دورة رواتب جديدة بتحديد الشهر والسنة", "أضف البدلات والخصومات لكل موظف", "اعتمد قائمة الرواتب لتوليد القيود المحاسبية", "نفّذ الصرف لتسجيل الدفع من حساب البنك/النقدية"]',
 '["Review employee list and base salaries", "Start a new payroll cycle by selecting month and year", "Add allowances and deductions per employee", "Approve payroll to generate accounting entries", "Execute payment to record payout from bank/cash account"]',
 ARRAY['الرواتب تُنشئ قيد: مدين مصروف رواتب / دائن نقدية أو بنك', 'العمولات تُحتسب منفصلاً عن الراتب الأساسي', 'اعتمد القائمة قبل تنفيذ الصرف لمنع الأخطاء'],
 ARRAY['Payroll creates: Dr. Salary Expense / Cr. Cash or Bank', 'Commissions are calculated separately from base salary', 'Approve the list before executing payment to prevent errors']
),

-- EMPLOYEES (HR)
('employees',
 'الموظفون',
 'Employees',
 'إدارة بيانات الموظفين وتسجيل التعيينات والإجازات والمرفقات الوظيفية.',
 'Manage employee data, record appointments, leaves, and job attachments.',
 '["أضف موظفاً جديداً ببياناته الكاملة", "حدد الراتب الأساسي والمسمى الوظيفي والفرع", "سجّل الإجازات والغيابات من تبويب الحضور", "أضف المرفقات: العقد وبطاقة الهوية", "عرض ملف الموظف الكامل بضغطة واحدة"]',
 '["Add a new employee with complete details", "Set base salary, job title, and branch", "Record leaves and absences from the Attendance tab", "Add attachments: contract and ID card", "View complete employee profile with one click"]',
 ARRAY['الموظف غير النشط لا يظهر في قائمة الرواتب', 'يمكن ربط الموظف بأكثر من فرع', 'بيانات الموظف محمية ولا يمكن للمستخدمين العاديين تعديلها'],
 ARRAY['Inactive employees do not appear in payroll lists', 'Employees can be linked to multiple branches', 'Employee data is protected and cannot be edited by regular users']
),

-- CHART OF ACCOUNTS
('chart_of_accounts',
 'الشجرة المحاسبية',
 'Chart of Accounts',
 'إدارة دليل الحسابات المحاسبية. أساس كل العمليات المالية في النظام.',
 'Manage the chart of accounts. The foundation of all financial operations in the system.',
 '["راجع الحسابات المقسّمة حسب النوع: أصول، التزامات، إيرادات...", "أضف حساباً فرعياً جديداً تحت الحساب الأب المناسب", "تأكد من تحديد الطبيعة المحاسبية: مدين/دائن", "لا تحذف حسابات لها قيود مرتبطة", "استخدم الأكواد المحاسبية المعيارية"]',
 '["Review accounts grouped by type: assets, liabilities, revenues...", "Add a new sub-account under the appropriate parent", "Ensure correct normal balance: debit/credit", "Do not delete accounts with linked journal entries", "Use standard accounting codes"]',
 ARRAY['الحسابات الورقية (غير الطرفية) لا تستقبل قيوداً مباشرة', 'الحساب المعطّل لا يظهر في قوائم الاختيار', 'تأكد من وجود حسابات المخزون وAR وAP وCOGS قبل الترحيل'],
 ARRAY['Parent (non-leaf) accounts do not receive direct entries', 'Disabled accounts do not appear in selection lists', 'Ensure Inventory, AR, AP, and COGS accounts exist before posting']
),

-- TRIAL BALANCE
('trial_balance',
 'ميزان المراجعة',
 'Trial Balance',
 'تقرير يعرض أرصدة جميع الحسابات مدين ودائن لفترة محددة. يُستخدم لاكتشاف الأخطاء وإعداد القوائم المالية.',
 'Report showing all account balances (debit/credit) for a specific period. Used to detect errors and prepare financial statements.',
 '["حدد الفترة الزمنية للتقرير", "راجع كل حساب وتحقق من منطقية الرصيد", "تأكد أن إجمالي المدين = إجمالي الدائن", "انقر على حساب لعرض قيوده التفصيلية", "صدّر التقرير للمراجعة الخارجية"]',
 '["Set the report date range", "Review each account and verify balance logic", "Ensure total debits = total credits", "Click on an account to view detailed entries", "Export the report for external auditing"]',
 ARRAY['الميزان يعتمد على status=posted فقط', 'الفرق بين المدين والدائن يدل على خطأ في القيود', 'شغّل اختبار ميزان المراجعة في صفحة التحقق المحاسبي'],
 ARRAY['Trial balance relies on posted entries only', 'Debit/credit difference indicates a journal error', 'Run the trial balance test on the Accounting Validation page']
),

-- PURCHASE ORDERS
('purchase_orders',
 'أوامر الشراء',
 'Purchase Orders',
 'إنشاء وتتبع أوامر الشراء قبل استلام البضاعة. تُحوَّل لاحقاً لفواتير شراء.',
 'Create and track purchase orders before receiving goods. Later converted to purchase bills.',
 '["أنشئ أمر شراء جديداً مع تحديد المورد", "أضف المنتجات والكميات والأسعار المتوقعة", "أرسل الأمر للمورد بضغطة واحدة", "عند استلام البضاعة: حوّل الأمر لفاتورة شراء", "تتبع حالة الأوامر: مفتوح / مكتمل / ملغى"]',
 '["Create a new PO with supplier selection", "Add products, quantities, and expected prices", "Send the order to the supplier with one click", "On goods receipt: convert the PO to a purchase bill", "Track order status: open / completed / cancelled"]',
 ARRAY['أمر الشراء لا يُنشئ قيوداً محاسبية — فقط الفاتورة تفعل', 'يمكن استلام جزء من الأمر وتحويله لفاتورة جزئية', 'أوامر الشراء الملغاة لا تؤثر على المخزون'],
 ARRAY['Purchase orders do not create accounting entries — only bills do', 'Partial receipt can be converted to a partial bill', 'Cancelled POs do not affect inventory']
),

-- BANKING
('banking',
 'الأعمال المصرفية',
 'Banking',
 'إدارة الحسابات البنكية وتسجيل الحركات وتسوية كشف الحساب البنكي.',
 'Manage bank accounts, record movements, and reconcile bank statements.',
 '["راجع أرصدة الحسابات البنكية الحالية", "سجّل حركات بنكية: إيداع أو سحب أو تحويل", "قارن كشف الحساب البنكي مع قيود النظام", "أجرِ التسوية البنكية لاكتشاف الفروق", "تقرير التدفق النقدي مرتبط بهذه الحسابات"]',
 '["Review current bank account balances", "Record bank movements: deposit, withdrawal, or transfer", "Compare bank statement with system entries", "Perform bank reconciliation to find differences", "Cash flow report is linked to these accounts"]',
 ARRAY['الرصيد البنكي في النظام يعتمد على GL وليس على كشف البنك مباشرة', 'التسوية البنكية تكشف القيود المفقودة', 'تحويل بين حسابين يُنشئ قيدين متزامنين'],
 ARRAY['Bank balance in system relies on GL not on bank statement directly', 'Bank reconciliation reveals missing entries', 'Transfer between two accounts creates two simultaneous entries']
),

-- SETTINGS
('settings',
 'الإعدادات',
 'Settings',
 'إدارة إعدادات الشركة والحساب والمظهر وصلاحيات المستخدمين وإعدادات المساعد الذكي.',
 'Manage company settings, account settings, appearance, user permissions, and AI assistant settings.',
 '["عدّل بيانات الشركة: الاسم والعنوان والشعار", "غيّر العملة الأساسية واللغة", "أضف أو عدّل مستخدمين من قسم المستخدمين والصلاحيات", "فعّل أو عطّل المساعد الذكي من قسم AI Assistant", "احتفظ بنسخة احتياطية من بيانات الشركة دورياً"]',
 '["Edit company data: name, address, and logo", "Change base currency and language", "Add or edit users from Users & Permissions section", "Enable or disable AI Assistant from the AI Assistant section", "Keep regular backups of company data"]',
 ARRAY['تغيير اللغة يُطبَّق فوراً على جميع الصفحات', 'تغيير العملة قد يستلزم تحويل البيانات الموجودة', 'يمكن إيقاف المساعد الذكي نهائياً من هنا'],
 ARRAY['Language change applies immediately across all pages', 'Currency change may require converting existing data', 'You can permanently disable the AI assistant from here']
)

ON CONFLICT (page_key) DO UPDATE SET
  title_ar = EXCLUDED.title_ar,
  title_en = EXCLUDED.title_en,
  description_ar = EXCLUDED.description_ar,
  description_en = EXCLUDED.description_en,
  steps_ar = EXCLUDED.steps_ar,
  steps_en = EXCLUDED.steps_en,
  tips_ar = EXCLUDED.tips_ar,
  tips_en = EXCLUDED.tips_en,
  updated_at = now();
