-- ============================================================
-- AI Page Guides Content Cleanup
-- Scope: wording only. No page_key, schema, permission, or workflow changes.
-- Goal: replace raw developer/accounting shorthand with user-facing guidance.
-- ============================================================

INSERT INTO public.page_guides
  (page_key, title_ar, title_en, description_ar, description_en, steps_ar, steps_en, tips_ar, tips_en)
VALUES
(
  'dashboard',
  'لوحة التحكم',
  'Dashboard',
  'لوحة التحكم هي نقطة البداية لمتابعة أداء الشركة. تساعدك على فهم الإيرادات والمصروفات والربحية وحالة التشغيل من نظرة واحدة.',
  'The Dashboard is the starting point for monitoring company performance. It helps you understand revenue, expenses, profit, and operating health at a glance.',
  jsonb_build_array(
    'اختر نطاق العرض المناسب، مثل الشركة كلها أو فرع محدد.',
    'ابدأ ببطاقات المؤشرات الرئيسية لمعرفة الوضع العام.',
    'راجع الرسوم البيانية لمعرفة اتجاه الأداء خلال الفترة.',
    'اضغط على التقرير أو البطاقة المناسبة عندما تحتاج تفاصيل أكثر.'
  ),
  jsonb_build_array(
    'Choose the right scope, such as the whole company or a specific branch.',
    'Start with the main indicator cards to understand the overall position.',
    'Review the charts to see how performance is moving over time.',
    'Open the related report or card when you need more detail.'
  ),
  ARRAY[
    'الأرقام المالية تعتمد على العمليات التي تم اعتمادها وترحيلها للتقارير.',
    'الفواتير الملغاة لا تدخل ضمن الإيرادات.',
    'إذا لم يظهر رقم متوقع، تأكد أن العملية اكتملت واعتمدت في مكانها الصحيح.'
  ],
  ARRAY[
    'Financial figures rely on transactions that have been approved and included in reports.',
    'Cancelled invoices are not counted as revenue.',
    'If an expected number is missing, confirm that the transaction was completed and approved in the right place.'
  ]
),
(
  'invoices',
  'فواتير المبيعات',
  'Sales Invoices',
  'صفحة فواتير المبيعات مخصصة لإصدار فواتير العملاء ومتابعة السداد والتسليم والمرتجعات المرتبطة بها.',
  'The Sales Invoices page is used to issue customer invoices and follow payment, delivery, and related returns.',
  jsonb_build_array(
    'أنشئ فاتورة جديدة أو افتح فاتورة قائمة للمراجعة.',
    'اختر العميل والفرع والمنتجات والكميات والأسعار.',
    'راجع الإجمالي والضرائب والخصومات قبل الحفظ أو الإرسال.',
    'بعد الإرسال، تابع السداد والتسليم وأي مرتجع من نفس الفاتورة.'
  ),
  jsonb_build_array(
    'Create a new invoice or open an existing one for review.',
    'Select the customer, branch, products, quantities, and prices.',
    'Review totals, taxes, and discounts before saving or sending.',
    'After sending, follow payment, delivery, and any return from the same invoice.'
  ),
  ARRAY[
    'إرسال الفاتورة ينقلها من مجرد مسودة إلى مستند يؤثر على المتابعة المالية.',
    'إذا كانت الفاتورة تحتوي على منتجات مخزنية، راجع حالة التسليم أو اعتماد المخزن.',
    'المرتجع يقلل مبيعات العميل ويعالج أثر المخزون حسب الكميات التي رجعت.'
  ],
  ARRAY[
    'Sending an invoice moves it from draft work into a document that affects financial follow-up.',
    'If the invoice includes stocked products, review delivery or warehouse approval state.',
    'A return reduces the customer sale and handles the stock effect according to the returned quantities.'
  ]
),
(
  'bills',
  'فواتير المشتريات',
  'Purchase Bills',
  'صفحة فواتير المشتريات تساعدك على تسجيل مشتريات البضاعة أو الخدمات من الموردين ومتابعة ما يستحق لهم.',
  'The Purchase Bills page helps you enter goods or service purchases from suppliers and follow what is owed to them.',
  jsonb_build_array(
    'ابدأ فاتورة شراء جديدة وحدد المورد.',
    'اختر المخزن عند وجود بضاعة، ثم أضف المنتجات أو الخدمات.',
    'راجع الكميات والأسعار والضرائب قبل الاعتماد.',
    'بعد الاعتماد، تابع السداد أو التسوية مع المورد.'
  ),
  jsonb_build_array(
    'Start a new purchase bill and select the supplier.',
    'Choose the warehouse when goods are involved, then add products or services.',
    'Review quantities, prices, and taxes before approval.',
    'After approval, follow payment or settlement with the supplier.'
  ),
  ARRAY[
    'اعتماد فاتورة البضاعة يزيد المخزون ويظهر مبلغًا مستحقًا للمورد.',
    'تسجيل السداد يقلل المبلغ المتبقي على الشركة تجاه المورد.',
    'اختيار المخزن الصحيح مهم قبل الاعتماد لأن أثر البضاعة سيظهر عليه.'
  ],
  ARRAY[
    'Approving a goods bill increases stock and shows an amount owed to the supplier.',
    'Adding a payment reduces the remaining amount owed by the company.',
    'Choosing the correct warehouse before approval matters because the goods effect appears there.'
  ]
),
(
  'customers',
  'العملاء',
  'Customers',
  'صفحة العملاء تجمع بيانات العميل وحركاته ورصيده في مكان واحد حتى يسهل متابعة البيع والتحصيل.',
  'The Customers page brings customer details, activity, and balance into one place so sales and collection are easier to follow.',
  jsonb_build_array(
    'أضف عميلًا جديدًا أو افتح بيانات عميل قائم.',
    'راجع بيانات الاتصال والفرع والحد الائتماني إن وجد.',
    'افتح سجل العميل لمتابعة الفواتير والمدفوعات والمرتجعات.',
    'استخدم كشف الحساب عند الحاجة لفهم الرصيد الحالي.'
  ),
  jsonb_build_array(
    'Add a new customer or open an existing customer profile.',
    'Review contact details, branch, and credit limit when available.',
    'Open the customer activity to follow invoices, payments, and returns.',
    'Use the account statement when you need to understand the current balance.'
  ),
  ARRAY[
    'رصيد العميل يتكون من الفواتير والمدفوعات والمرتجعات والتسويات.',
    'تحديث بيانات العميل لا يغير المستندات القديمة، لكنه يساعد في المستندات الجديدة.',
    'إذا كان الرصيد غير واضح، راجع كشف الحساب بدل الاعتماد على فاتورة واحدة فقط.'
  ],
  ARRAY[
    'A customer balance comes from invoices, payments, returns, and settlements.',
    'Updating customer details does not change old documents, but it helps future ones.',
    'If the balance is unclear, review the account statement rather than one invoice only.'
  ]
),
(
  'products',
  'المنتجات والخدمات',
  'Products & Services',
  'صفحة المنتجات والخدمات هي كتالوج ما تبيعه أو تشتريه الشركة، وتشمل الأسعار والتكاليف ونوع التعامل مع المخزون.',
  'The Products & Services page is the catalog of what the company sells or buys, including prices, costs, and how each item works with inventory.',
  jsonb_build_array(
    'أضف منتجًا أو خدمة جديدة من زر الإضافة.',
    'حدد هل الصنف منتجًا مخزنيًا أم خدمة أم صنفًا غير مخزني.',
    'أدخل سعر البيع والتكلفة ووحدة القياس وأي كود داخلي واضح للمستخدمين.',
    'عطّل الصنف بدل حذفه إذا لم تعد تريد استخدامه في مستندات جديدة.'
  ),
  jsonb_build_array(
    'Add a new product or service using the add button.',
    'Choose whether the item is stocked, a service, or non-stock.',
    'Enter selling price, cost, unit of measure, and any clear internal code for users.',
    'Deactivate the item instead of deleting it if it should not be used in new documents.'
  ),
  ARRAY[
    'تكلفة المنتج تساعد النظام على حساب ربحية البيع.',
    'المنتجات المخزنية تؤثر على الكميات، أما الخدمات فلا تخصم من المخزون.',
    'استخدم أسماء وأكواد واضحة حتى يجدها فريق البيع والمخزن بسهولة.'
  ],
  ARRAY[
    'Product cost helps the system calculate sales profitability.',
    'Stocked products affect quantities, while services do not reduce stock.',
    'Use clear names and codes so sales and warehouse teams can find items easily.'
  ]
),
(
  'inventory',
  'المخزون',
  'Inventory',
  'صفحة المخزون تعرض الكميات المتاحة وحركة المنتجات بين المخازن حتى تعرف ما يمكن بيعه أو تحويله أو مراجعته.',
  'The Inventory page shows available quantities and product movement across warehouses so you know what can be sold, transferred, or reviewed.',
  jsonb_build_array(
    'اعرض أرصدة المنتجات الحالية حسب المخزن أو الفرع.',
    'استخدم الفلاتر للوصول إلى منتج أو مخزن محدد.',
    'افتح حركة المنتج عندما تحتاج معرفة سبب الزيادة أو النقص.',
    'راجع المنتجات منخفضة أو منتهية الكمية قبل قبول طلبات جديدة.'
  ),
  jsonb_build_array(
    'View current product balances by warehouse or branch.',
    'Use filters to reach a specific product or warehouse.',
    'Open product movement when you need to understand why quantity increased or decreased.',
    'Review low or out-of-stock items before accepting new requests.'
  ),
  ARRAY[
    'الكميات تتغير من الشراء والبيع والتحويلات والتسويات والمرتجعات.',
    'تكلفة المخزون تُحسب حسب ترتيب دخول الكميات للمخزن، بحيث تُستخدم الكميات الأقدم أولًا عند الاحتساب.',
    'أي فرق بين الواقع والنظام يحتاج مراجعة حركة المنتج قبل اتخاذ قرار.'
  ],
  ARRAY[
    'Quantities change through purchases, sales, transfers, adjustments, and returns.',
    'Stock cost is calculated by the order quantities entered the warehouse, using older quantities first for costing.',
    'Any difference between physical stock and the system should be reviewed through product movement before action.'
  ]
),
(
  'expenses',
  'المصروفات',
  'Expenses',
  'صفحة المصروفات مخصصة لتسجيل تكاليف التشغيل اليومية مثل الإيجار والكهرباء والنقل وأي مصروف لا يدخل كفاتورة شراء مباشرة.',
  'The Expenses page is used to enter daily operating costs such as rent, utilities, delivery, and expenses that are not direct purchase bills.',
  jsonb_build_array(
    'أنشئ مصروفًا جديدًا وحدد التاريخ والمبلغ.',
    'اختر نوع المصروف أو الحساب المناسب حتى يظهر في التقارير بشكل صحيح.',
    'أضف وصفًا أو مرفقًا عند وجود إيصال أو مستند داعم.',
    'احفظ المصروف بعد مراجعة المبلغ وطريقة الدفع.'
  ),
  jsonb_build_array(
    'Create a new expense and enter the date and amount.',
    'Choose the right expense type or account so it appears correctly in reports.',
    'Add a description or attachment when a receipt or supporting document exists.',
    'Save the expense after reviewing the amount and payment method.'
  ),
  ARRAY[
    'اختيار التصنيف الصحيح يساعد الإدارة على فهم أين تُصرف الأموال.',
    'المصروفات تظهر في تقارير الربح والخسارة بعد اعتمادها أو ترحيلها.',
    'اربط المصروف بمركز تكلفة عند الحاجة لمعرفة تكلفة قسم أو مشروع محدد.'
  ],
  ARRAY[
    'Choosing the right category helps management understand where money is spent.',
    'Expenses appear in profit and loss reports after approval or posting.',
    'Link the expense to a cost center when you need to understand the cost of a department or project.'
  ]
),
(
  'journal',
  'القيود اليومية',
  'Journal Entries',
  'صفحة القيود اليومية يستخدمها فريق الحسابات لتسجيل التسويات والتصحيحات المالية يدويًا عند الحاجة.',
  'The Journal Entries page is used by the accounting team to enter manual financial adjustments and corrections when needed.',
  jsonb_build_array(
    'أنشئ قيدًا جديدًا عندما تحتاج لتسوية أو تصحيح مالي.',
    'أضف السطور المالية وتأكد أن إجمالي الجانب المدين يساوي إجمالي الجانب الدائن.',
    'اكتب وصفًا واضحًا يشرح سبب القيد.',
    'احفظ القيد كمسودة للمراجعة أو رحّله إذا كان جاهزًا حسب صلاحيتك.'
  ),
  jsonb_build_array(
    'Create a new entry when a financial adjustment or correction is needed.',
    'Add financial lines and make sure total debits equal total credits.',
    'Write a clear description explaining why the entry exists.',
    'Save as draft for review or post it when ready, according to your permission.'
  ),
  ARRAY[
    'القيد غير المتوازن لا يجب ترحيله لأنه يجعل التقارير غير صحيحة.',
    'القيد المرحّل يؤثر على التقارير، أما المسودة فتظل للمراجعة.',
    'استخدم وصفًا واضحًا لأن القيود تُراجع لاحقًا في التدقيق.'
  ],
  ARRAY[
    'An unbalanced entry should not be finalized because it makes reports incorrect.',
    'A finalized entry affects reports, while a draft remains for review.',
    'Use a clear description because entries are reviewed later during audit.'
  ]
),
(
  'payments',
  'المدفوعات',
  'Payments',
  'صفحة المدفوعات تساعدك على متابعة ما تم تحصيله من العملاء وما تم سداده للموردين وتسوية الأرصدة المفتوحة.',
  'The Payments page helps you follow what was collected from customers, what was paid to suppliers, and how open balances are settled.',
  jsonb_build_array(
    'راجع قائمة المدفوعات الحالية وتفاصيل كل حركة.',
    'سجّل دفعة جديدة وحدد هل هي من عميل أم إلى مورد.',
    'اربط الدفعة بالفاتورة المناسبة عندما يكون ذلك متاحًا.',
    'راجع الرصيد بعد الحفظ للتأكد أن التسوية ظهرت بالشكل الصحيح.'
  ),
  jsonb_build_array(
    'Review the current payment list and each movement detail.',
    'Add a new payment and choose whether it is from a customer or to a supplier.',
    'Apply the payment to the right invoice when available.',
    'Review the balance after saving to confirm the settlement appears correctly.'
  ),
  ARRAY[
    'الدفعة غير المرتبطة قد تبقى كدفعة مقدمة حتى يتم تطبيقها على فاتورة.',
    'اختيار حساب النقدية أو البنك الصحيح مهم لمعرفة مصدر أو وجهة المال.',
    'الدفع الجزئي يقلل الرصيد المتبقي ولا يغلق الفاتورة بالكامل إلا بعد اكتمال السداد.'
  ],
  ARRAY[
    'An unapplied payment may remain as an advance until it is applied to an invoice.',
    'Choosing the correct cash or bank account matters for knowing where money came from or went.',
    'A partial payment reduces the remaining balance and closes the invoice only after full settlement.'
  ]
),
(
  'income_statement',
  'قائمة الدخل (الأرباح والخسائر)',
  'Income Statement (Profit and Loss)',
  'قائمة الدخل توضح إيرادات الشركة ومصروفاتها وصافي الربح أو الخسارة خلال فترة محددة.',
  'The Income Statement shows company revenue, expenses, and net profit or loss for a selected period.',
  jsonb_build_array(
    'حدد الفترة التي تريد تحليلها.',
    'اختر الفرع أو نطاق الشركة بالكامل حسب الحاجة.',
    'راجع الإيرادات ثم تكلفة المبيعات ثم المصروفات.',
    'اقرأ صافي الربح في نهاية التقرير لمعرفة النتيجة النهائية للفترة.'
  ),
  jsonb_build_array(
    'Select the period you want to analyze.',
    'Choose a branch or the whole company scope as needed.',
    'Review revenue, then cost of sales, then expenses.',
    'Read net profit at the end of the report to understand the final result for the period.'
  ),
  ARRAY[
    'التقرير يعتمد على العمليات المالية التي تم اعتمادها وترحيلها.',
    'المرتجعات والخصومات تؤثر على صافي المبيعات.',
    'تكلفة البضاعة المباعة تساعدك على فهم هامش الربح الحقيقي.'
  ],
  ARRAY[
    'The report relies on financial transactions that have been approved and included in reporting.',
    'Returns and discounts affect net sales.',
    'Cost of goods sold helps you understand the real profit margin.'
  ]
),
(
  'balance_sheet',
  'الميزانية العمومية',
  'Balance Sheet',
  'الميزانية العمومية تعرض الوضع المالي للشركة في تاريخ محدد: ما تملكه الشركة، وما عليها، وحقوق الملكية.',
  'The Balance Sheet shows the company financial position on a specific date: what the company owns, what it owes, and owner equity.',
  jsonb_build_array(
    'حدد تاريخ عرض الميزانية.',
    'راجع الأصول مثل النقدية والمخزون والذمم المدينة.',
    'راجع الالتزامات مثل مستحقات الموردين وأي مبالغ واجبة السداد.',
    'راجع حقوق الملكية وتأكد أن الصورة المالية متوازنة.'
  ),
  jsonb_build_array(
    'Select the balance sheet date.',
    'Review assets such as cash, stock, and customer receivables.',
    'Review liabilities such as supplier payables and other amounts due.',
    'Review equity and confirm the financial picture is balanced.'
  ),
  ARRAY[
    'الأرقام تأتي من العمليات المالية المعتمدة حتى التاريخ المختار.',
    'أي فرق في التوازن يحتاج مراجعة القيود أو العمليات غير المكتملة.',
    'استخدم هذا التقرير لفهم الوضع المالي، وليس لتنفيذ عمليات جديدة.'
  ],
  ARRAY[
    'Figures come from approved financial transactions up to the selected date.',
    'Any balance difference should be reviewed through entries or incomplete transactions.',
    'Use this report to understand financial position, not to execute new transactions.'
  ]
),
(
  'accounting_validation',
  'اختبارات التحقق المحاسبي',
  'Accounting Validation',
  'هذه الصفحة تساعد فريق الحسابات على فحص سلامة البيانات المالية قبل التقارير أو الإقفال.',
  'This page helps the accounting team check financial data health before reporting or closing.',
  jsonb_build_array(
    'اضغط تشغيل الاختبارات لبدء الفحص.',
    'راجع نتيجة كل اختبار لمعرفة هل توجد مشكلة تحتاج متابعة.',
    'ابدأ بالمشكلات الحرجة لأنها قد تمنع الإقفال أو تؤثر على التقارير.',
    'بعد الإصلاح، أعد تشغيل الفحص للتأكد أن النتيجة أصبحت سليمة.'
  ),
  jsonb_build_array(
    'Run the checks to start validation.',
    'Review each result to see whether an issue needs follow-up.',
    'Start with critical issues because they may block closing or affect reports.',
    'After fixing, run validation again to confirm the result is clean.'
  ),
  ARRAY[
    'هذه الصفحة لا تصلح الأخطاء وحدها، لكنها توجهك إلى موضع المشكلة.',
    'فحص المخزون يقارن قيمة المخزون المالية مع الكميات والتكلفة المتاحة في النظام.',
    'استخدمها قبل الإقفال أو قبل تسليم تقارير مهمة.'
  ],
  ARRAY[
    'This page does not fix issues by itself, but it points you to where the problem is.',
    'The inventory check compares financial stock value with available quantities and cost in the system.',
    'Use it before closing or before sharing important reports.'
  ]
),
(
  'payroll',
  'الرواتب',
  'Payroll',
  'صفحة الرواتب تساعدك على حساب رواتب الموظفين واعتمادها ثم متابعة صرفها حسب الفترة.',
  'The Payroll page helps you calculate employee salaries, approve them, and follow payment by period.',
  jsonb_build_array(
    'حدد فترة الرواتب التي تريد إعدادها.',
    'راجع الموظفين والراتب الأساسي والبدلات والاستقطاعات.',
    'اعتمد المسير بعد التأكد من صحة الأرقام.',
    'تابع الصرف بعد الاعتماد حسب صلاحياتك وإجراءات الشركة.'
  ),
  jsonb_build_array(
    'Select the payroll period you want to prepare.',
    'Review employees, base salary, allowances, and deductions.',
    'Approve the payroll after confirming the figures.',
    'Follow payment after approval according to your permissions and company process.'
  ),
  ARRAY[
    'صافي الراتب هو الناتج بعد إضافة المستحقات وخصم الاستقطاعات.',
    'الحضور والغياب قد يؤثران على حساب الراتب حسب إعدادات الشركة.',
    'اعتماد المسير قبل الصرف يقلل أخطاء السداد.'
  ],
  ARRAY[
    'Net salary is the result after adding earnings and subtracting deductions.',
    'Attendance and absence may affect salary calculation according to company settings.',
    'Approving payroll before payment reduces payout mistakes.'
  ]
),
(
  'chart_of_accounts',
  'الشجرة المحاسبية',
  'Chart of Accounts',
  'الشجرة المحاسبية هي قائمة الحسابات التي يستخدمها النظام لتصنيف كل حركة مالية في مكانها الصحيح.',
  'The Chart of Accounts is the list of accounts the system uses to classify every financial movement correctly.',
  jsonb_build_array(
    'راجع الحسابات حسب نوعها، مثل أصول أو التزامات أو إيرادات أو مصروفات.',
    'أضف حسابًا فرعيًا تحت التصنيف المناسب عند الحاجة.',
    'حدد طبيعة الحساب بشكل صحيح حتى تظهر الأرصدة في التقارير كما يجب.',
    'لا توقف أو تحذف حسابًا مستخدمًا في عمليات سابقة إلا بعد مراجعة المحاسب المسؤول.'
  ),
  jsonb_build_array(
    'Review accounts by type, such as assets, liabilities, revenue, or expenses.',
    'Add a sub-account under the right category when needed.',
    'Set the account nature correctly so balances appear properly in reports.',
    'Do not deactivate or delete an account used before without review by the responsible accountant.'
  ),
  ARRAY[
    'الحسابات الرئيسية للتجميع، والحسابات الفرعية هي التي تُستخدم غالبًا في العمليات.',
    'وجود حسابات العملاء والموردين والمخزون وتكلفة المبيعات ضروري لسلامة التقارير.',
    'تغيير الحسابات يؤثر على التصنيف المالي، لذلك يحتاج حذرًا ومراجعة.'
  ],
  ARRAY[
    'Parent accounts are for grouping, while sub-accounts are usually used in transactions.',
    'Customer, supplier, inventory, and cost-of-sales accounts are essential for reliable reports.',
    'Changing accounts affects financial classification, so it needs care and review.'
  ]
),
(
  'trial_balance',
  'ميزان المراجعة',
  'Trial Balance',
  'ميزان المراجعة يعرض أرصدة الحسابات خلال فترة محددة ويساعد المحاسب على اكتشاف أي عدم توازن.',
  'The Trial Balance shows account balances for a selected period and helps the accountant detect any imbalance.',
  jsonb_build_array(
    'حدد الفترة التي تريد مراجعتها.',
    'راجع أرصدة الحسابات وتأكد أنها منطقية.',
    'تأكد أن إجمالي المدين يساوي إجمالي الدائن.',
    'افتح تفاصيل الحساب إذا احتجت معرفة مصدر الرصيد.'
  ),
  jsonb_build_array(
    'Select the period you want to review.',
    'Review account balances and confirm they make sense.',
    'Confirm total debits equal total credits.',
    'Open account details if you need to understand where a balance came from.'
  ),
  ARRAY[
    'يعتمد التقرير على القيود المالية التي تم ترحيلها.',
    'عدم تساوي المدين والدائن يعني أن هناك قيدًا يحتاج مراجعة.',
    'ميزان المراجعة خطوة مهمة قبل إعداد القوائم المالية.'
  ],
  ARRAY[
    'The report relies on finalized financial entries.',
    'If debits and credits do not match, an entry needs review.',
    'The trial balance is an important step before preparing financial statements.'
  ]
),
(
  'banking',
  'الأعمال المصرفية',
  'Banking',
  'صفحة الأعمال المصرفية تساعدك على متابعة حسابات البنك والنقدية والحركات والتسويات.',
  'The Banking page helps you follow bank and cash accounts, movements, and reconciliations.',
  jsonb_build_array(
    'راجع أرصدة الحسابات البنكية والنقدية.',
    'أدخل حركة إيداع أو سحب أو تحويل عند الحاجة.',
    'قارن حركات النظام مع كشف البنك عند التسوية.',
    'راجع الفروق حتى تعرف هل توجد حركة ناقصة أو مدخلة مرتين.'
  ),
  jsonb_build_array(
    'Review bank and cash account balances.',
    'Enter deposits, withdrawals, or transfers when needed.',
    'Compare system movements with the bank statement during reconciliation.',
    'Review differences to see whether a movement is missing or duplicated.'
  ),
  ARRAY[
    'رصيد البنك في النظام يعتمد على الحركات المالية التي تم تسجيلها واعتمادها.',
    'التسوية البنكية تساعد على اكتشاف الفروق بين النظام وكشف البنك.',
    'التحويل بين حسابين يجب أن يظهر على الحسابين حتى تظل الصورة واضحة.'
  ],
  ARRAY[
    'The bank balance in the system depends on financial movements that were entered and approved.',
    'Bank reconciliation helps find differences between the system and the bank statement.',
    'A transfer between two accounts should appear on both accounts so the picture stays clear.'
  ]
),
(
  'sales_returns',
  'مرتجعات المبيعات',
  'Sales Returns',
  'صفحة مرتجعات المبيعات تساعدك على معالجة البضاعة أو القيمة التي ترجع من العميل بعد الفاتورة.',
  'The Sales Returns page helps you handle goods or value returned by the customer after invoicing.',
  jsonb_build_array(
    'ابدأ من الفاتورة الأصلية حتى تكون الكميات والأسعار واضحة.',
    'حدد الأصناف والكميات المرتجعة وسبب الإرجاع.',
    'راجع هل المرتجع كامل أم جزئي.',
    'اعتمد المرتجع بعد التأكد من صحة البيانات حسب صلاحيتك.'
  ),
  jsonb_build_array(
    'Start from the original invoice so quantities and prices are clear.',
    'Select returned items, quantities, and reason.',
    'Review whether the return is full or partial.',
    'Approve the return after confirming the data, according to your permission.'
  ),
  ARRAY[
    'المرتجع يقلل مبيعات العميل ويعالج أثر المخزون للكميات التي رجعت.',
    'المرتجع الجزئي لا يلغي الفاتورة كلها، بل يخفض الجزء المرتجع فقط.',
    'إذا رُفض المرتجع، لا يحدث أثر مالي أو مخزني.'
  ],
  ARRAY[
    'A return reduces the customer sale and handles the stock effect for returned quantities.',
    'A partial return does not cancel the whole invoice; it reduces only the returned part.',
    'If the return is rejected, no financial or inventory effect happens.'
  ]
),
(
  'inventory_transfers',
  'تحويلات المخزون',
  'Inventory Transfers',
  'صفحة تحويلات المخزون تنقل البضاعة بين المخازن أو الفروع مع متابعة الكمية من المصدر إلى الوجهة.',
  'The Inventory Transfers page moves goods between warehouses or branches while tracking quantity from source to destination.',
  jsonb_build_array(
    'أنشئ تحويلًا جديدًا وحدد المخزن المصدر والمخزن المستلم.',
    'أضف المنتجات والكميات المراد نقلها.',
    'راجع الكميات المتاحة قبل التأكيد.',
    'تابع حالة الاستلام حتى تظهر الكمية في المخزن المستلم.'
  ),
  jsonb_build_array(
    'Create a new transfer and select the source and receiving warehouses.',
    'Add the products and quantities to move.',
    'Review available quantities before confirming.',
    'Follow receiving state until the quantity appears in the destination warehouse.'
  ),
  ARRAY[
    'التحويل ينقل الكمية داخليًا ولا يعني بيعًا أو شراءً.',
    'تأكد من توفر الكمية في المخزن المصدر قبل بدء التحويل.',
    'إذا لم يتم تأكيد الاستلام، قد تظهر الكمية في مرحلة انتقالية.'
  ],
  ARRAY[
    'A transfer moves quantity internally; it is not a sale or purchase.',
    'Confirm the source warehouse has enough quantity before starting the transfer.',
    'If receiving is not confirmed, the quantity may appear as in transit.'
  ]
),
(
  'fixed_assets',
  'الأصول الثابتة',
  'Fixed Assets',
  'صفحة الأصول الثابتة تساعدك على متابعة أصول الشركة مثل الأجهزة والسيارات والمعدات وقيمتها الحالية.',
  'The Fixed Assets page helps you follow company assets such as equipment, vehicles, and machinery and their current value.',
  jsonb_build_array(
    'أضف أصلًا جديدًا مع بيانات الشراء والتكلفة.',
    'حدد فئة الأصل وطريقة الإهلاك المناسبة.',
    'راجع قيمة الأصل وجدول الإهلاك خلال عمره.',
    'عند البيع أو الاستبعاد، راجع القيمة الحالية قبل اتخاذ القرار.'
  ),
  jsonb_build_array(
    'Add a new asset with purchase details and cost.',
    'Select the asset category and suitable depreciation method.',
    'Review asset value and depreciation schedule over its life.',
    'When selling or disposing, review the current value before deciding.'
  ),
  ARRAY[
    'الإهلاك يعني توزيع تكلفة الأصل على الفترات التي تستفيد منه الشركة.',
    'بيع الأصل قد ينتج عنه مكسب أو خسارة حسب الفرق بين سعر البيع والقيمة الحالية.',
    'تصنيف الأصل بشكل صحيح يساعد التقارير والإهلاك على الظهور بدقة.'
  ],
  ARRAY[
    'Depreciation means spreading the asset cost over the periods that benefit from it.',
    'Selling an asset may create a gain or loss depending on the difference between sale price and current value.',
    'Correct asset classification helps reports and depreciation appear accurately.'
  ]
),
(
  'reports',
  'التقارير',
  'Reports',
  'مركز التقارير يجمع تقارير المبيعات والمشتريات والمخزون والحسابات حتى تستطيع قراءة الأداء واتخاذ قرارات أفضل.',
  'The Reports center brings sales, purchases, inventory, and accounting reports together so you can read performance and make better decisions.',
  jsonb_build_array(
    'اختر التقرير المناسب للسؤال الذي تريد الإجابة عنه.',
    'حدد الفترة والنطاق مثل الفرع أو المخزن أو العميل عند توفرها.',
    'راجع النتائج ثم افتح الصفحة التشغيلية إذا احتجت تفاصيل المستندات.',
    'صدّر التقرير عند الحاجة للمشاركة أو المراجعة.'
  ),
  jsonb_build_array(
    'Choose the report that matches the question you want to answer.',
    'Select the period and scope such as branch, warehouse, or customer when available.',
    'Review results, then open the operational page if you need document details.',
    'Export the report when needed for sharing or review.'
  ),
  ARRAY[
    'التقارير تشرح النتائج، لكنها لا تستبدل شاشة تنفيذ العملية نفسها.',
    'الأرقام المالية تعتمد على العمليات المكتملة والمعتمدة.',
    'استخدم الفلاتر بعناية لأن الفترة أو الفرع قد يغيران قراءة التقرير.'
  ],
  ARRAY[
    'Reports explain results, but they do not replace the screen where the operation is performed.',
    'Financial numbers rely on completed and approved transactions.',
    'Use filters carefully because period or branch can change how the report should be read.'
  ]
),
(
  'manufacturing_production_order_detail',
  'تفاصيل أمر التصنيع - تنفيذ ومتابعة الإنتاج',
  'Production Order Details - Production Execution and Tracking',
  'هذه الصفحة تدير دورة حياة أمر الإنتاج بالكامل: إصدار الأمر، بدء التنفيذ، متابعة خطوات الإنتاج، ثم تسجيل الاكتمال وتحديث المخزون.',
  'This page manages the full production order lifecycle: releasing the order, starting execution, tracking production steps, then logging completion and updating inventory.',
  jsonb_build_array(
    'راجع ملخص الأمر: المنتج والكمية المطلوبة وقائمة المواد ومسار العمل.',
    'تحقق من البطاقات التي تعرض الكمية المخططة والمنجزة والمتبقية.',
    'راجع قسم المكونات للتأكد من توفر المواد الخام المطلوبة.',
    'استخدم إصدار الأمر عندما تصبح المواد والفريق جاهزين.',
    'استخدم بدء التنفيذ عندما يبدأ فريق الإنتاج فعليًا.',
    'تابع العمليات خطوة بخطوة حتى تكتمل.',
    'عند الانتهاء، استخدم اكتمال لتسجيل النتيجة وتحديث المخزون.'
  ),
  jsonb_build_array(
    'Review the order summary: product, required quantity, bill of materials, and routing.',
    'Check the cards showing planned, completed, and remaining quantity.',
    'Review the components section to confirm required raw materials are available.',
    'Use Release when materials and team are ready.',
    'Use Start Execution when the production team actually begins work.',
    'Follow operations step by step until they are complete.',
    'When finished, use Complete to log the result and update stock.'
  ),
  ARRAY[
    'اكتمال أمر الإنتاج يخصم المواد الخام ويضيف المنتج النهائي إلى المخزون.',
    'راجع المواد المتاحة قبل بدء التنفيذ حتى لا يتوقف الإنتاج في المنتصف.',
    'إلغاء أمر بدأ تنفيذه يحتاج مراجعة أثر المواد التي تم صرفها بالفعل.'
  ],
  ARRAY[
    'Completing a production order consumes raw materials and adds the finished product to stock.',
    'Review available materials before starting so production does not stop midway.',
    'Cancelling an order after execution starts requires reviewing the effect of materials already issued.'
  ]
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
