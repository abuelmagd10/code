-- Add accounting pattern columns to page_guides
-- Structured JSONB: { event, entries: [{account, side}], impact: {assets, liabilities, equity, pl} }
ALTER TABLE public.page_guides
  ADD COLUMN IF NOT EXISTS accounting_pattern_ar JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS accounting_pattern_en JSONB DEFAULT NULL;

-- ── Invoices ─────────────────────────────────────────────────────────────────
UPDATE public.page_guides SET
  accounting_pattern_ar = '{"event":"عند ترحيل فاتورة المبيعات يُسجَّل الإيراد وتكلفة البضاعة المباعة والضريبة في دفتر الأستاذ العام دفعةً واحدة","entries":[{"account":"الذمم المدينة","side":"debit"},{"account":"إيرادات المبيعات","side":"credit"},{"account":"ضريبة القيمة المضافة المستحقة","side":"credit"},{"account":"تكلفة البضاعة المباعة (COGS)","side":"debit"},{"account":"المخزون","side":"credit"}],"impact":{"assets":"↑ الذمم المدينة ترتفع؛ ↓ المخزون ينخفض بتكلفة البضاعة","liabilities":"↑ ضريبة القيمة المضافة المستحقة ترتفع","equity":"↑ الأرباح المرحلة ترتفع بمقدار صافي الربح","pl":"↑ إيرادات ترتفع؛ ↑ COGS مصروف يُخفض الربح"}}'::jsonb,
  accounting_pattern_en = '{"event":"Posting a sales invoice records revenue, COGS, and VAT in the General Ledger in a single atomic transaction","entries":[{"account":"Accounts Receivable","side":"debit"},{"account":"Sales Revenue","side":"credit"},{"account":"VAT Payable","side":"credit"},{"account":"Cost of Goods Sold (COGS)","side":"debit"},{"account":"Inventory","side":"credit"}],"impact":{"assets":"↑ Receivables increase; ↓ Inventory decreases at cost","liabilities":"↑ VAT payable increases","equity":"↑ Retained earnings increase by net profit","pl":"↑ Revenue increases; ↑ COGS expense reduces profit"}}'::jsonb
WHERE page_key = 'invoices';

-- ── Sales Returns ─────────────────────────────────────────────────────────────
UPDATE public.page_guides SET
  accounting_pattern_ar = '{"event":"عند اعتماد مرتجع المبيعات يُعكَس الإيراد وتُعكَس تكلفة COGS ويُعاد المخزون إلى قيمته الأصلية","entries":[{"account":"إيرادات المبيعات","side":"debit"},{"account":"ضريبة القيمة المضافة المستحقة","side":"debit"},{"account":"الذمم المدينة","side":"credit"},{"account":"المخزون","side":"debit"},{"account":"تكلفة البضاعة المباعة (COGS)","side":"credit"}],"impact":{"assets":"↓ الذمم المدينة تنخفض؛ ↑ المخزون يرتفع بالتكلفة الأصلية","liabilities":"↓ ضريبة القيمة المضافة المستحقة تنخفض","equity":"↓ الأرباح المرحلة تنخفض بمقدار الخسارة","pl":"↓ إيرادات تنخفض (تُخفض صافي المبيعات)؛ ↓ COGS تنخفض أيضاً"}}'::jsonb,
  accounting_pattern_en = '{"event":"Approving a sales return reverses the revenue, reverses COGS, and restores inventory at its original cost","entries":[{"account":"Sales Revenue","side":"debit"},{"account":"VAT Payable","side":"debit"},{"account":"Accounts Receivable","side":"credit"},{"account":"Inventory","side":"debit"},{"account":"Cost of Goods Sold (COGS)","side":"credit"}],"impact":{"assets":"↓ Receivables decrease; ↑ Inventory restored at original cost","liabilities":"↓ VAT payable decreases","equity":"↓ Retained earnings decrease by the loss","pl":"↓ Revenue decreases (reduces net sales); ↓ COGS also decreases"}}'::jsonb
WHERE page_key = 'sales_returns';

-- ── Purchase Bills ────────────────────────────────────────────────────────────
UPDATE public.page_guides SET
  accounting_pattern_ar = '{"event":"عند ترحيل فاتورة الشراء يُرفَع المخزون وتُسجَّل الذمم الدائنة للمورد وضريبة المدخلات","entries":[{"account":"المخزون","side":"debit"},{"account":"ضريبة القيمة المضافة — مدخلات","side":"debit"},{"account":"الذمم الدائنة (المورد)","side":"credit"}],"impact":{"assets":"↑ المخزون يرتفع بتكلفة الشراء","liabilities":"↑ الذمم الدائنة ترتفع حتى السداد","equity":"لا تأثير مباشر — COGS تظهر عند البيع","pl":"لا تأثير مباشر — التكلفة تُرحَّل عند بيع البضاعة لاحقاً"}}'::jsonb,
  accounting_pattern_en = '{"event":"Posting a purchase bill increases inventory and records the supplier payable and input VAT","entries":[{"account":"Inventory","side":"debit"},{"account":"VAT — Input Tax","side":"debit"},{"account":"Accounts Payable (Supplier)","side":"credit"}],"impact":{"assets":"↑ Inventory increases at purchase cost","liabilities":"↑ Accounts payable increases until settlement","equity":"No direct impact — COGS recognized when goods are sold","pl":"No direct impact — cost flows to COGS upon sale"}}'::jsonb
WHERE page_key = 'bills';

-- ── Purchase Returns ──────────────────────────────────────────────────────────
UPDATE public.page_guides SET
  accounting_pattern_ar = '{"event":"مرتجع الشراء يعكس فاتورة الشراء: ينخفض المخزون وتنخفض الذمم الدائنة للمورد","entries":[{"account":"الذمم الدائنة (المورد)","side":"debit"},{"account":"المخزون","side":"credit"},{"account":"ضريبة القيمة المضافة — مدخلات","side":"credit"}],"impact":{"assets":"↓ المخزون ينخفض بكمية المرتجع","liabilities":"↓ الذمم الدائنة تنخفض (تُخصَم من المستحق للمورد)","equity":"لا تأثير مباشر","pl":"لا تأثير مباشر — يُعدَّل رصيد المخزون فقط"}}'::jsonb,
  accounting_pattern_en = '{"event":"A purchase return reverses the purchase bill: inventory decreases and the supplier payable is reduced","entries":[{"account":"Accounts Payable (Supplier)","side":"debit"},{"account":"Inventory","side":"credit"},{"account":"VAT — Input Tax","side":"credit"}],"impact":{"assets":"↓ Inventory decreases by the returned quantity","liabilities":"↓ Accounts payable decreases (deducted from amount owed)","equity":"No direct impact","pl":"No direct impact — only the inventory balance is adjusted"}}'::jsonb
WHERE page_key = 'purchase_returns';

-- ── Expenses ──────────────────────────────────────────────────────────────────
UPDATE public.page_guides SET
  accounting_pattern_ar = '{"event":"تسجيل مصروف يُثقِّل حساب المصروف المناسب ويُقابله النقد أو الدائنون","entries":[{"account":"حساب المصروف (إيجار / مرافق / تسويق...)","side":"debit"},{"account":"النقدية / البنك (إن دُفع فوراً)","side":"credit"},{"account":"الدائنون / المستحقات (إن لم يُدفع)","side":"credit"}],"impact":{"assets":"↓ النقدية تنخفض عند الدفع الفوري","liabilities":"↑ المستحقات ترتفع قبل السداد","equity":"↓ حقوق الملكية تنخفض بمقدار المصروف","pl":"↑ المصروفات ترتفع → صافي الربح ينخفض"}}'::jsonb,
  accounting_pattern_en = '{"event":"Recording an expense debits the appropriate expense account and credits cash or payables","entries":[{"account":"Expense Account (rent / utilities / marketing...)","side":"debit"},{"account":"Cash / Bank (if paid immediately)","side":"credit"},{"account":"Payables / Accruals (if not yet paid)","side":"credit"}],"impact":{"assets":"↓ Cash decreases if paid immediately","liabilities":"↑ Accrued liabilities increase before settlement","equity":"↓ Equity decreases by the expense amount","pl":"↑ Expenses increase → net profit decreases"}}'::jsonb
WHERE page_key = 'expenses';

-- ── Payroll ───────────────────────────────────────────────────────────────────
UPDATE public.page_guides SET
  accounting_pattern_ar = '{"event":"معالجة كشف الرواتب تُسجِّل مصروف الرواتب ومستحقات الموظفين؛ الدفعة الفعلية تُسوِّي المستحقات","entries":[{"account":"مصروف الرواتب والأجور","side":"debit"},{"account":"مستحقات الموظفين","side":"credit"},{"account":"مستحقات الموظفين (عند الدفع)","side":"debit"},{"account":"النقدية / البنك","side":"credit"}],"impact":{"assets":"↓ النقدية تنخفض عند صرف الرواتب","liabilities":"↑ مستحقات ترتفع قبل الدفع؛ ↓ تنخفض بعده","equity":"↓ حقوق الملكية تنخفض بمقدار مصروف الرواتب","pl":"↑ مصروف رواتب يرتفع → صافي الربح ينخفض"}}'::jsonb,
  accounting_pattern_en = '{"event":"Payroll processing records salary expense and employee payables; the actual payment settles the payable","entries":[{"account":"Salaries & Wages Expense","side":"debit"},{"account":"Employee Payables","side":"credit"},{"account":"Employee Payables (upon payment)","side":"debit"},{"account":"Cash / Bank","side":"credit"}],"impact":{"assets":"↓ Cash decreases when salaries are paid","liabilities":"↑ Payables increase before payment; ↓ decrease after","equity":"↓ Equity decreases by total salary expense","pl":"↑ Salary expense increases → net profit decreases"}}'::jsonb
WHERE page_key = 'payroll';

-- ── Shareholders (Profit Distribution) ───────────────────────────────────────
UPDATE public.page_guides SET
  accounting_pattern_ar = '{"event":"توزيع الأرباح يُخصَم من الأرباح المرحلة ويُقيَّد كتوزيعات مستحقة؛ الدفعة الفعلية تُصفِّي الالتزام","entries":[{"account":"الأرباح المرحلة","side":"debit"},{"account":"توزيعات أرباح مستحقة","side":"credit"},{"account":"توزيعات أرباح مستحقة (عند الدفع)","side":"debit"},{"account":"النقدية / البنك","side":"credit"}],"impact":{"assets":"↓ النقدية تنخفض عند الدفع الفعلي","liabilities":"↑ توزيعات مستحقة قبل الدفع؛ ↓ بعده","equity":"↓ الأرباح المرحلة تنخفض مباشرة","pl":"لا تأثير على ق&خ — التوزيعات خارج حساب الربح"}}'::jsonb,
  accounting_pattern_en = '{"event":"Profit distribution debits retained earnings and records a dividend payable; actual payment settles the liability","entries":[{"account":"Retained Earnings","side":"debit"},{"account":"Dividends Payable","side":"credit"},{"account":"Dividends Payable (upon payment)","side":"debit"},{"account":"Cash / Bank","side":"credit"}],"impact":{"assets":"↓ Cash decreases upon actual payment","liabilities":"↑ Dividends payable before payment; ↓ after","equity":"↓ Retained earnings decrease directly","pl":"No impact on P&L — dividends are outside profit calculation"}}'::jsonb
WHERE page_key = 'shareholders';

-- ── Annual Closing ────────────────────────────────────────────────────────────
UPDATE public.page_guides SET
  accounting_pattern_ar = '{"event":"قيد الإقفال السنوي يُصفِّر حسابات الإيرادات والمصروفات ويُرحِّل صافي الربح إلى الأرباح المرحلة","entries":[{"account":"حسابات الإيرادات (إقفال)","side":"debit"},{"account":"ملخص الدخل","side":"credit"},{"account":"ملخص الدخل","side":"debit"},{"account":"حسابات المصروفات (إقفال)","side":"credit"},{"account":"ملخص الدخل — صافي الربح","side":"debit"},{"account":"الأرباح المرحلة","side":"credit"}],"impact":{"assets":"لا تأثير على الأصول","liabilities":"لا تأثير على الخصوم","equity":"↑ الأرباح المرحلة ترتفع بصافي ربح الفترة","pl":"تصفير حسابات الإيرادات والمصروفات للفترة الجديدة"}}'::jsonb,
  accounting_pattern_en = '{"event":"The annual closing entry zeros out all revenue and expense accounts and transfers net profit to retained earnings","entries":[{"account":"Revenue Accounts (closing)","side":"debit"},{"account":"Income Summary","side":"credit"},{"account":"Income Summary","side":"debit"},{"account":"Expense Accounts (closing)","side":"credit"},{"account":"Income Summary — Net Profit","side":"debit"},{"account":"Retained Earnings","side":"credit"}],"impact":{"assets":"No impact on assets","liabilities":"No impact on liabilities","equity":"↑ Retained earnings increase by the period net profit","pl":"Revenue and expense accounts reset to zero for the new period"}}'::jsonb
WHERE page_key = 'annual_closing';

-- ── Payments ──────────────────────────────────────────────────────────────────
UPDATE public.page_guides SET
  accounting_pattern_ar = '{"event":"المدفوعات والمقبوضات تُسوِّي الذمم مقابل النقدية أو البنك دون تأثير على الأرباح والخسائر","entries":[{"account":"النقدية / البنك (قبض من عميل)","side":"debit"},{"account":"الذمم المدينة","side":"credit"},{"account":"الذمم الدائنة (دفع لمورد)","side":"debit"},{"account":"النقدية / البنك","side":"credit"}],"impact":{"assets":"↑ النقدية ترتفع عند القبض؛ ↓ الذمم المدينة تنخفض","liabilities":"↓ الذمم الدائنة تنخفض عند الدفع للمورد","equity":"لا تأثير مباشر على حقوق الملكية","pl":"لا تأثير — الإيرادات سُجِّلت عند الفاتورة"}}'::jsonb,
  accounting_pattern_en = '{"event":"Payments and receipts settle receivables/payables against cash or bank with no direct P&L impact","entries":[{"account":"Cash / Bank (receipt from customer)","side":"debit"},{"account":"Accounts Receivable","side":"credit"},{"account":"Accounts Payable (payment to supplier)","side":"debit"},{"account":"Cash / Bank","side":"credit"}],"impact":{"assets":"↑ Cash increases on receipt; ↓ Receivables decrease","liabilities":"↓ Accounts payable decreases when paying supplier","equity":"No direct impact on equity","pl":"No impact — revenue was recorded at invoice date"}}'::jsonb
WHERE page_key = 'payments';

-- ── Banking ───────────────────────────────────────────────────────────────────
UPDATE public.page_guides SET
  accounting_pattern_ar = '{"event":"التحويلات البنكية تُعيد توزيع النقدية بين الحسابات؛ إيداع أو سحب يُعدِّل رصيد البنك","entries":[{"account":"البنك — حساب المستلِم","side":"debit"},{"account":"البنك — حساب المُرسِل","side":"credit"},{"account":"النقدية / البنك (إيداع)","side":"debit"},{"account":"مصدر الإيداع","side":"credit"}],"impact":{"assets":"تغيير توزيع النقدية بين الحسابات فقط","liabilities":"لا تأثير","equity":"لا تأثير مباشر","pl":"لا تأثير إلا إذا كانت هناك رسوم بنكية (مصروف)"}}'::jsonb,
  accounting_pattern_en = '{"event":"Bank transfers redistribute cash between accounts; deposits or withdrawals adjust the bank balance","entries":[{"account":"Bank — Receiving Account","side":"debit"},{"account":"Bank — Sending Account","side":"credit"},{"account":"Cash / Bank (deposit)","side":"debit"},{"account":"Source of Deposit","side":"credit"}],"impact":{"assets":"Only redistribution of cash between accounts","liabilities":"No impact","equity":"No direct impact","pl":"No impact unless bank fees apply (expense)"}}'::jsonb
WHERE page_key = 'banking';

-- ── Journal Entries ───────────────────────────────────────────────────────────
UPDATE public.page_guides SET
  accounting_pattern_ar = '{"event":"القيد اليدوي يتيح تسجيل أي حدث مالي مباشرةً في دفتر الأستاذ؛ مجموع المدين = مجموع الدائن دائماً","entries":[{"account":"حساب مدين (حسب طبيعة العملية)","side":"debit"},{"account":"حساب دائن (حسب طبيعة العملية)","side":"credit"}],"impact":{"assets":"يعتمد على الحسابات المختارة","liabilities":"يعتمد على الحسابات المختارة","equity":"يعتمد على الحسابات المختارة","pl":"يعتمد على الحسابات المختارة — إيرادات ومصروفات تؤثر على الربح"}}'::jsonb,
  accounting_pattern_en = '{"event":"Manual journal entries allow recording any financial event directly in the General Ledger; total debits must always equal total credits","entries":[{"account":"Debit Account (per transaction nature)","side":"debit"},{"account":"Credit Account (per transaction nature)","side":"credit"}],"impact":{"assets":"Depends on the accounts selected","liabilities":"Depends on the accounts selected","equity":"Depends on the accounts selected","pl":"Revenue and expense accounts affect net profit"}}'::jsonb
WHERE page_key = 'journal';

-- ── Customers ────────────────────────────────────────────────────────────────
UPDATE public.page_guides SET
  accounting_pattern_ar = '{"event":"الذمم المدينة تتراكم من الفواتير غير المدفوعة وتنخفض عند الاستلام — صافي الرصيد = ما يستحق التحصيل","entries":[{"account":"الذمم المدينة (عند إصدار الفاتورة)","side":"debit"},{"account":"إيرادات المبيعات","side":"credit"},{"account":"النقدية / البنك (عند القبض)","side":"debit"},{"account":"الذمم المدينة","side":"credit"}],"impact":{"assets":"↑ عند كل فاتورة؛ ↓ عند كل تحصيل","liabilities":"لا تأثير مباشر","equity":"↑ بمقدار الأرباح الناتجة عن المبيعات","pl":"الإيرادات المسجَّلة تُحرِّك صافي الربح"}}'::jsonb,
  accounting_pattern_en = '{"event":"Accounts receivable accumulates from unpaid invoices and decreases upon collection — net balance = outstanding collections","entries":[{"account":"Accounts Receivable (upon invoice)","side":"debit"},{"account":"Sales Revenue","side":"credit"},{"account":"Cash / Bank (upon collection)","side":"debit"},{"account":"Accounts Receivable","side":"credit"}],"impact":{"assets":"↑ With each invoice; ↓ with each collection","liabilities":"No direct impact","equity":"↑ By the profit generated from sales","pl":"Recorded revenue drives net profit"}}'::jsonb
WHERE page_key = 'customers';

-- ── Suppliers ────────────────────────────────────────────────────────────────
UPDATE public.page_guides SET
  accounting_pattern_ar = '{"event":"الذمم الدائنة تتراكم من فواتير الشراء وتنخفض عند السداد — صافي الرصيد = ما يستحق الدفع للموردين","entries":[{"account":"المخزون / المصروف (عند فاتورة الشراء)","side":"debit"},{"account":"الذمم الدائنة","side":"credit"},{"account":"الذمم الدائنة (عند السداد)","side":"debit"},{"account":"النقدية / البنك","side":"credit"}],"impact":{"assets":"↑ مخزون عند الفاتورة؛ ↓ نقدية عند السداد","liabilities":"↑ عند كل فاتورة؛ ↓ عند كل دفعة","equity":"لا تأثير مباشر — COGS يظهر عند البيع","pl":"لا تأثير مباشر على ق&خ في وقت الشراء"}}'::jsonb,
  accounting_pattern_en = '{"event":"Accounts payable accumulates from purchase bills and decreases upon payment — net balance = amounts owed to suppliers","entries":[{"account":"Inventory / Expense (upon purchase bill)","side":"debit"},{"account":"Accounts Payable","side":"credit"},{"account":"Accounts Payable (upon payment)","side":"debit"},{"account":"Cash / Bank","side":"credit"}],"impact":{"assets":"↑ Inventory at invoice; ↓ Cash upon payment","liabilities":"↑ With each invoice; ↓ with each payment","equity":"No direct impact — COGS recognized upon sale","pl":"No direct P&L impact at purchase time"}}'::jsonb
WHERE page_key = 'suppliers';

-- ── Fixed Assets ──────────────────────────────────────────────────────────────
UPDATE public.page_guides SET
  accounting_pattern_ar = '{"event":"اقتناء أصل ثابت يُرفَع في الميزانية؛ الإهلاك الشهري يُقلِّل قيمته الدفترية ويُسجَّل كمصروف","entries":[{"account":"الأصل الثابت (الاقتناء)","side":"debit"},{"account":"النقدية / البنك / الدائنون","side":"credit"},{"account":"مصروف الإهلاك (شهري)","side":"debit"},{"account":"مجمع إهلاك الأصل","side":"credit"}],"impact":{"assets":"↑ أصول ثابتة عند الاقتناء؛ ↓ تُستهلَك شهرياً بالإهلاك","liabilities":"↑ إن اشتُري بالأجل","equity":"↓ تنخفض شهرياً بمقدار الإهلاك","pl":"↑ مصروف إهلاك يُضاف شهرياً → يُقلِّل صافي الربح"}}'::jsonb,
  accounting_pattern_en = '{"event":"Acquiring a fixed asset capitalizes it on the balance sheet; monthly depreciation reduces its book value and is recorded as an expense","entries":[{"account":"Fixed Asset (acquisition)","side":"debit"},{"account":"Cash / Bank / Payables","side":"credit"},{"account":"Depreciation Expense (monthly)","side":"debit"},{"account":"Accumulated Depreciation","side":"credit"}],"impact":{"assets":"↑ Fixed assets increase at acquisition; ↓ depreciated monthly","liabilities":"↑ If purchased on credit","equity":"↓ Decreases monthly by depreciation amount","pl":"↑ Depreciation expense added monthly → reduces net profit"}}'::jsonb
WHERE page_key = 'fixed_assets';

-- ── Drawings ──────────────────────────────────────────────────────────────────
UPDATE public.page_guides SET
  accounting_pattern_ar = '{"event":"السحوبات الشخصية للملاك تُخفِّض حقوق الملكية مباشرةً دون المرور بحساب الأرباح والخسائر","entries":[{"account":"حساب السحوبات / رأس المال","side":"debit"},{"account":"النقدية / البنك","side":"credit"}],"impact":{"assets":"↓ النقدية أو أصل آخر ينخفض بقيمة السحب","liabilities":"لا تأثير","equity":"↓ حقوق الملكية تنخفض مباشرة بقيمة السحب","pl":"لا تأثير — السحوبات ليست مصروفاً للشركة"}}'::jsonb,
  accounting_pattern_en = '{"event":"Owner drawings directly reduce equity without passing through the profit & loss account","entries":[{"account":"Drawings / Capital Account","side":"debit"},{"account":"Cash / Bank","side":"credit"}],"impact":{"assets":"↓ Cash or other asset decreases by the withdrawal amount","liabilities":"No impact","equity":"↓ Equity decreases directly by the withdrawal amount","pl":"No impact — drawings are not a company expense"}}'::jsonb
WHERE page_key = 'drawings';

-- ── Inventory ────────────────────────────────────────────────────────────────
UPDATE public.page_guides SET
  accounting_pattern_ar = '{"event":"المخزون يتأثر بكل عملية شراء أو بيع أو تسوية — قيمته في الميزانية = الكمية × تكلفة FIFO","entries":[{"account":"المخزون (عند الشراء)","side":"debit"},{"account":"الذمم الدائنة / النقدية","side":"credit"},{"account":"COGS (عند البيع)","side":"debit"},{"account":"المخزون","side":"credit"},{"account":"خسارة إهلاك مخزون (عند التالف)","side":"debit"},{"account":"المخزون","side":"credit"}],"impact":{"assets":"↑ عند الشراء؛ ↓ عند البيع أو التالف","liabilities":"لا تأثير مباشر","equity":"تتأثر بصافي الربح الناتج عن المبيعات","pl":"COGS يرتفع عند البيع؛ خسارة إهلاك عند التالف"}}'::jsonb,
  accounting_pattern_en = '{"event":"Inventory is affected by every purchase, sale, or write-off — its balance sheet value = quantity × FIFO cost","entries":[{"account":"Inventory (on purchase)","side":"debit"},{"account":"Payables / Cash","side":"credit"},{"account":"COGS (on sale)","side":"debit"},{"account":"Inventory","side":"credit"},{"account":"Inventory Write-off Loss","side":"debit"},{"account":"Inventory","side":"credit"}],"impact":{"assets":"↑ On purchase; ↓ on sale or write-off","liabilities":"No direct impact","equity":"Affected by net profit from sales","pl":"COGS increases on sale; write-off loss on damaged goods"}}'::jsonb
WHERE page_key = 'inventory';

-- ── Inventory Transfers ───────────────────────────────────────────────────────
UPDATE public.page_guides SET
  accounting_pattern_ar = '{"event":"تحويلات المخزون نقل داخلي بين مخازن — لا يُنشئ قيوداً في دفتر الأستاذ لأن إجمالي الأصول لا يتغير","entries":[{"account":"لا قيود محاسبية في GL","side":"debit"}],"impact":{"assets":"لا تغيير في إجمالي الأصول — فقط إعادة توزيع بين مخازن","liabilities":"لا تأثير","equity":"لا تأثير","pl":"لا تأثير"}}'::jsonb,
  accounting_pattern_en = '{"event":"Inventory transfers are internal movements between warehouses — no GL journal entries since total assets remain unchanged","entries":[{"account":"No General Ledger journal entries","side":"debit"}],"impact":{"assets":"No change in total assets — only redistribution between warehouses","liabilities":"No impact","equity":"No impact","pl":"No impact"}}'::jsonb
WHERE page_key = 'inventory_transfers';

-- ── Sales Orders ──────────────────────────────────────────────────────────────
UPDATE public.page_guides SET
  accounting_pattern_ar = '{"event":"طلبات المبيعات التزامات مستقبلية — لا يُنشئ قيوداً في GL حتى يتحوَّل لفاتورة مرحَّلة","entries":[{"account":"لا قيود محاسبية — الالتزام خارج الميزانية","side":"debit"}],"impact":{"assets":"لا تأثير","liabilities":"التزام خارج الميزانية (Commitment) — لا يظهر في GL","equity":"لا تأثير","pl":"لا تأثير حتى إصدار الفاتورة"}}'::jsonb,
  accounting_pattern_en = '{"event":"Sales orders are future commitments — no GL entries until converted to a posted invoice","entries":[{"account":"No accounting entries — off-balance-sheet commitment","side":"debit"}],"impact":{"assets":"No impact","liabilities":"Off-balance-sheet commitment — does not appear in GL","equity":"No impact","pl":"No impact until invoice is posted"}}'::jsonb
WHERE page_key = 'sales_orders';

-- ── Purchase Orders ───────────────────────────────────────────────────────────
UPDATE public.page_guides SET
  accounting_pattern_ar = '{"event":"أوامر الشراء التزامات مستقبلية — لا تُنشئ قيوداً في GL حتى تُحوَّل لفاتورة شراء مرحَّلة","entries":[{"account":"لا قيود محاسبية — الالتزام خارج الميزانية","side":"debit"}],"impact":{"assets":"لا تأثير حتى استلام البضاعة وترحيل الفاتورة","liabilities":"التزام خارج الميزانية فقط","equity":"لا تأثير","pl":"لا تأثير"}}'::jsonb,
  accounting_pattern_en = '{"event":"Purchase orders are future commitments — no GL entries until converted to a posted purchase bill","entries":[{"account":"No accounting entries — off-balance-sheet commitment","side":"debit"}],"impact":{"assets":"No impact until goods received and bill posted","liabilities":"Off-balance-sheet commitment only","equity":"No impact","pl":"No impact"}}'::jsonb
WHERE page_key = 'purchase_orders';

-- ── Estimates / Quotations ────────────────────────────────────────────────────
UPDATE public.page_guides SET
  accounting_pattern_ar = '{"event":"عروض الأسعار لا تُنشئ أي قيود محاسبية — هي مجرد عرض غير ملزِم حتى قبول العميل","entries":[{"account":"لا قيود محاسبية في أي مرحلة","side":"debit"}],"impact":{"assets":"لا تأثير","liabilities":"لا تأثير","equity":"لا تأثير","pl":"لا تأثير — الإيراد يُسجَّل عند إصدار الفاتورة لاحقاً"}}'::jsonb,
  accounting_pattern_en = '{"event":"Quotations create no accounting entries — they are non-binding offers until the customer accepts","entries":[{"account":"No accounting entries at any stage","side":"debit"}],"impact":{"assets":"No impact","liabilities":"No impact","equity":"No impact","pl":"No impact — revenue recognized upon later invoice posting"}}'::jsonb
WHERE page_key = 'estimates';

-- ── Balance Sheet ─────────────────────────────────────────────────────────────
UPDATE public.page_guides SET
  accounting_pattern_ar = '{"event":"الميزانية العمومية تعكس المعادلة المحاسبية: الأصول = الخصوم + حقوق الملكية في لحظة زمنية معينة","entries":[{"account":"الأصول = النقدية + المخزون + الذمم المدينة + أصول أخرى","side":"debit"},{"account":"الخصوم + حقوق الملكية (يجب أن تساوي الأصول دائماً)","side":"credit"}],"impact":{"assets":"يجمع جميع الأصول من GL بتاريخ التقرير","liabilities":"يجمع جميع الخصوم من GL","equity":"رأس المال + الأرباح المرحلة - التوزيعات","pl":"صافي الربح من ق&خ ينتقل إلى حقوق الملكية"}}'::jsonb,
  accounting_pattern_en = '{"event":"The balance sheet reflects the accounting equation: Assets = Liabilities + Equity at a specific point in time","entries":[{"account":"Assets = Cash + Inventory + Receivables + Other Assets","side":"debit"},{"account":"Liabilities + Equity (must always equal Assets)","side":"credit"}],"impact":{"assets":"Aggregates all assets from GL at the report date","liabilities":"Aggregates all liabilities from GL","equity":"Capital + Retained Earnings - Dividends","pl":"Net profit from P&L flows into equity"}}'::jsonb
WHERE page_key = 'balance_sheet';

-- ── Income Statement ──────────────────────────────────────────────────────────
UPDATE public.page_guides SET
  accounting_pattern_ar = '{"event":"قائمة الأرباح والخسائر تجمع إيرادات ومصروفات الفترة من GL لاحتساب صافي الربح أو الخسارة","entries":[{"account":"الإيرادات (مجموع الدائن في حسابات الإيراد)","side":"credit"},{"account":"المصروفات + COGS (مجموع المدين في حسابات المصروفات)","side":"debit"}],"impact":{"assets":"لا تأثير مباشر — النتيجة تنتقل للميزانية","liabilities":"لا تأثير مباشر","equity":"صافي الربح يُضاف إلى الأرباح المرحلة","pl":"صافي الربح = إجمالي الإيرادات - إجمالي المصروفات - COGS"}}'::jsonb,
  accounting_pattern_en = '{"event":"The income statement aggregates revenues and expenses from the GL for the period to compute net profit or loss","entries":[{"account":"Revenue (sum of credit in revenue accounts)","side":"credit"},{"account":"Expenses + COGS (sum of debit in expense accounts)","side":"debit"}],"impact":{"assets":"No direct impact — result transfers to balance sheet","liabilities":"No direct impact","equity":"Net profit is added to retained earnings","pl":"Net Profit = Total Revenue - Total Expenses - COGS"}}'::jsonb
WHERE page_key = 'income_statement';

-- ── Chart of Accounts ─────────────────────────────────────────────────────────
UPDATE public.page_guides SET
  accounting_pattern_ar = '{"event":"دليل الحسابات هو العمود الفقري للنظام — كل قيد يستخدم حسابات من هذا الدليل فقط","entries":[{"account":"حسابات الأصول (تزيد بالمدين)","side":"debit"},{"account":"حسابات الخصوم وحقوق الملكية (تزيد بالدائن)","side":"credit"},{"account":"حسابات المصروفات (تزيد بالمدين)","side":"debit"},{"account":"حسابات الإيرادات (تزيد بالدائن)","side":"credit"}],"impact":{"assets":"حسابات رقم 1xxx","liabilities":"حسابات رقم 2xxx","equity":"حسابات رقم 3xxx","pl":"إيرادات 4xxx؛ مصروفات 5xxx"}}'::jsonb,
  accounting_pattern_en = '{"event":"The chart of accounts is the system backbone — every journal entry uses only accounts from this list","entries":[{"account":"Asset Accounts (increase with debit)","side":"debit"},{"account":"Liability & Equity Accounts (increase with credit)","side":"credit"},{"account":"Expense Accounts (increase with debit)","side":"debit"},{"account":"Revenue Accounts (increase with credit)","side":"credit"}],"impact":{"assets":"Account range 1xxx","liabilities":"Account range 2xxx","equity":"Account range 3xxx","pl":"Revenue 4xxx; Expenses 5xxx"}}'::jsonb
WHERE page_key = 'chart_of_accounts';

-- ── Products ──────────────────────────────────────────────────────────────────
UPDATE public.page_guides SET
  accounting_pattern_ar = '{"event":"المنتجات تُربَط بحسابات المخزون وCOGS — تكلفة كل منتج تُحدِّد قيمة المخزون وهامش الربح","entries":[{"account":"المخزون (يرتفع عند الشراء بتكلفة FIFO)","side":"debit"},{"account":"COGS (يُسجَّل عند بيع المنتج)","side":"debit"}],"impact":{"assets":"قيمة المخزون = مجموع تكاليف الوحدات غير المباعة","liabilities":"لا تأثير مباشر","equity":"هامش الربح يؤثر على الأرباح المرحلة","pl":"سعر البيع - تكلفة FIFO = هامش الربح الإجمالي"}}'::jsonb,
  accounting_pattern_en = '{"event":"Products are linked to inventory and COGS accounts — each product cost determines inventory value and profit margin","entries":[{"account":"Inventory (increases at purchase using FIFO cost)","side":"debit"},{"account":"COGS (recorded when product is sold)","side":"debit"}],"impact":{"assets":"Inventory value = total cost of unsold units","liabilities":"No direct impact","equity":"Profit margin affects retained earnings","pl":"Selling price - FIFO cost = gross profit margin"}}'::jsonb
WHERE page_key = 'products';

-- ── Accounting Periods ────────────────────────────────────────────────────────
UPDATE public.page_guides SET
  accounting_pattern_ar = '{"event":"إقفال الفترة المحاسبية يُجمِّد القيود — لا يمكن إضافة أو تعديل قيود في فترة مقفلة","entries":[{"account":"جميع القيود في الفترة المقفلة (محمية)","side":"debit"}],"impact":{"assets":"تجميد — لا تعديل بعد الإقفال","liabilities":"تجميد — لا تعديل بعد الإقفال","equity":"تجميد — أرقام الفترة محمية من التعديل","pl":"نتائج الفترة المقفلة نهائية وغير قابلة للتغيير"}}'::jsonb,
  accounting_pattern_en = '{"event":"Closing an accounting period locks entries — no additions or modifications are allowed in a closed period","entries":[{"account":"All entries in the closed period (protected)","side":"debit"}],"impact":{"assets":"Locked — no modifications after closing","liabilities":"Locked — no modifications after closing","equity":"Locked — period figures are protected","pl":"Closed period results are final and immutable"}}'::jsonb
WHERE page_key = 'accounting_periods';

SELECT page_key, 
       accounting_pattern_ar IS NOT NULL as has_ar,
       accounting_pattern_en IS NOT NULL as has_en
FROM public.page_guides
ORDER BY page_key;
