-- ============================================================
-- Manufacturing Module: AI Guide Content (6 page_keys)
-- Covers: BOM list, BOM detail, Routing list, Routing detail,
--         Production Order list, Production Order detail
-- Style: user-friendly, action-oriented, non-technical
-- ============================================================

INSERT INTO public.page_guides (page_key, title_ar, title_en, description_ar, description_en, steps_ar, steps_en, tips_ar, tips_en)
VALUES

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. BOM LIST PAGE
-- ──────────────────────────────────────────────────────────────────────────────
(
  'manufacturing_boms',
  'هياكل المواد — مكتبة وصفات التصنيع',
  'Bill of Materials — Production Recipe Library',

  'هذه هي المكتبة الرئيسية لجميع وصفات التصنيع في شركتك. كل منتج تصنّعه يجب أن يكون له "هيكل مواد" يُحدّد بالضبط المكونات والكميات المطلوبة لإنتاج وحدة واحدة منه.',
  'This is the central library of all your production recipes. Every manufactured product must have a Bill of Materials that precisely defines the components and quantities needed to produce one unit.',

  '["استعرض القائمة لرؤية جميع هياكل المواد المسجلة وحالة كل منها (تشغيلي / موقف)",
    "ابحث عن هيكل مواد محدد باسم المنتج أو الكود المرجعي باستخدام خانة البحث",
    "اضغط «إنشاء هيكل مواد جديد» لإضافة وصفة إنتاجية لمنتج جديد",
    "اضغط على أي هيكل في القائمة لفتح صفحة تفاصيله وإدارة مكوناته ومراجعة إصداراته",
    "راجع بطاقات الإحصائيات في الأعلى لمعرفة إجمالي الهياكل والنشطة منها"]',

  '["Browse the list to see all registered BOMs and each one'\''s status (active / inactive)",
    "Search for a specific BOM by product name or reference code",
    "Click «Create New BOM» to add a production recipe for a new product",
    "Click any BOM in the list to open its detail page and manage components and versions",
    "Review the statistics cards at the top for total BOMs and active count"]',

  ARRAY[
    'كل منتج تصنيعي يجب أن يكون له هيكل مواد واحد على الأقل في حالة "تشغيلي" قبل إنشاء أوامر الإنتاج',
    'الهيكل الموقف لا يظهر في خيارات أوامر التصنيع — فعّله أولاً إذا أردت استخدامه'
  ],
  ARRAY[
    'Every manufactured product must have at least one active BOM before production orders can be created',
    'Inactive BOMs do not appear in production order options — activate them first if needed'
  ]
),

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. BOM DETAIL PAGE
-- ──────────────────────────────────────────────────────────────────────────────
(
  'manufacturing_bom_detail',
  'تفاصيل هيكل المواد — إدارة مكونات المنتج',
  'BOM Details — Product Component Management',

  'هذه هي صفحة "وصفة المنتج" التفصيلية. هنا تُحدّد بالضبط كل مادة خام ستدخل في تصنيع هذا المنتج، والكمية الدقيقة المطلوبة منها لإنتاج وحدة واحدة. دقة ما تدخله هنا تؤثر مباشرة على المخزون وتكلفة الإنتاج.',
  'This is the detailed recipe page for a specific product. Here you define exactly which raw materials are needed and the precise quantity of each to produce one unit. The accuracy of what you enter here directly affects inventory and production cost.',

  '["راجع البيانات الأساسية في الأعلى: اسم المنتج، الفرع، الكود المرجعي، والحالة الحالية",
    "انتقل لقسم «المكونات» واضغط «إضافة مكون» لإضافة مادة خام",
    "لكل مكون: اختر المادة الخام من قائمة المنتجات وأدخل الكمية اللازمة لإنتاج وحدة واحدة",
    "كرّر الخطوة السابقة حتى تُضيف جميع المواد الخام التي تدخل في الوصفة",
    "إذا تغيرت الوصفة لاحقاً: أنشئ «إصداراً جديداً» من الزر المخصص له بدلاً من تعديل الإصدار القديم",
    "فعّل الهيكل أو أوقفه حسب جاهزيته للاستخدام في أوامر التصنيع"]',

  '["Review the header details: product name, branch, reference code, and current status",
    "Go to the «Components» section and click «Add Component» to add a raw material",
    "For each component: select the raw material from the product list and enter the required quantity per unit produced",
    "Repeat until all raw materials needed for the recipe are added",
    "If the recipe changes later: create a «New Version» using its dedicated button — do not edit the existing version",
    "Activate or deactivate the BOM based on its readiness for use in production orders"]',

  ARRAY[
    'الكميات المدخلة هي لإنتاج وحدة واحدة فقط — النظام يضربها تلقائياً في عدد الوحدات المطلوبة عند إنشاء أمر الإنتاج',
    'لا تعدّل إصداراً تم استخدامه في أوامر إنتاج سابقة — أنشئ إصداراً جديداً للحفاظ على سجل التاريخ',
    'يمكنك رؤية أوامر الإنتاج التي استخدمت هذا الهيكل من خلال صفحة التفاصيل'
  ],
  ARRAY[
    'Quantities entered are per one unit produced — the system multiplies them automatically by the order quantity',
    'Never edit a version that has been used in past production orders — create a new version to preserve history',
    'You can see which production orders have used this BOM from the detail page'
  ]
),

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. ROUTING LIST PAGE
-- ──────────────────────────────────────────────────────────────────────────────
(
  'manufacturing_routings',
  'مسارات العمل — خطوات التصنيع التشغيلية',
  'Work Routings — Operational Production Steps',

  'هذه القائمة تعرض جميع مسارات العمل المسجلة. مسار العمل هو "الخريطة التشغيلية" التي تُحدّد الخطوات المتسلسلة التي يمر بها المنتج خلال عملية التصنيع — من أول خطوة في خط الإنتاج حتى آخرها.',
  'This list shows all registered work routings. A routing is the operational roadmap that defines the sequential steps a product goes through during manufacturing — from the first step on the production line to the last.',

  '["استعرض قائمة مسارات العمل وحالة كل مسار (تشغيلي / موقف)",
    "ابحث عن مسار معين بالاسم أو الكود المرجعي",
    "اضغط «إنشاء مسار عمل جديد» لإضافة خطوات إنتاج لمنتج",
    "افتح أي مسار من القائمة لعرض عملياته التفصيلية أو تعديل خطواته",
    "راجع الإحصائيات لمعرفة إجمالي المسارات المسجلة والنشطة"]',

  '["Browse the routing list and check each routing'\''s status (active / inactive)",
    "Search for a specific routing by name or reference code",
    "Click «Create New Routing» to add production steps for a product",
    "Open any routing to view its detailed operations or modify its steps",
    "Review the statistics for total and active routing counts"]',

  ARRAY[
    'المسار الموقف لا يمكن اختياره في أوامر التصنيع الجديدة — فعّله أولاً إذا احتجته',
    'بعض المنتجات البسيطة لا تحتاج مسار عمل، لكنه ضروري لتتبع تقدم الإنتاج خطوة بخطوة'
  ],
  ARRAY[
    'Inactive routings cannot be selected in new production orders — activate them first if needed',
    'Some simple products may not need a routing, but it is required for step-by-step production tracking'
  ]
),

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. ROUTING DETAIL PAGE
-- ──────────────────────────────────────────────────────────────────────────────
(
  'manufacturing_routing_detail',
  'تفاصيل مسار العمل — إدارة خطوات الإنتاج',
  'Routing Details — Production Step Management',

  'هنا تُضيف وترتب الخطوات الفعلية التي يمر بها المنتج داخل خط الإنتاج. كل خطوة (تُسمى "عملية") تُحدّد ماذا يحدث تحديداً في تلك المرحلة، ومن يقوم بها، وكم تستغرق من الوقت. هذه المعلومات تُستخدم لتتبع تقدم الإنتاج وحساب التكاليف.',
  'Here you add and sequence the actual steps a product goes through on the production line. Each step (called an "operation") defines what specifically happens at that stage, who performs it, and how long it takes. This data is used for tracking production progress and calculating costs.',

  '["راجع معلومات المسار الأساسية: الاسم، الكود، والمنتج المرتبط به",
    "انتقل لقسم «العمليات» واضغط «إضافة عملية» لإضافة خطوة إنتاج جديدة",
    "لكل عملية: أدخل اسماً واضحاً يصف ما يحدث فيها (مثال: خلط المكونات، تعبئة، تغليف)",
    "حدد الوقت المقدر لتنفيذ كل عملية بالدقائق أو الساعات",
    "رتّب العمليات بالترتيب الصحيح الذي تحدث فيه فعلياً داخل المصنع",
    "فعّل المسار بعد الانتهاء لجعله متاحاً في أوامر التصنيع"]',

  '["Review the routing header: name, code, and linked product",
    "Go to the «Operations» section and click «Add Operation» to add a new production step",
    "For each operation: enter a clear name describing what happens (e.g., Mixing, Filling, Packaging)",
    "Specify the estimated time to complete each operation in minutes or hours",
    "Order the operations in the correct sequence they actually occur in the factory",
    "Activate the routing once complete to make it available in production orders"]',

  ARRAY[
    'ترتيب العمليات مهم جداً — النظام يتتبع تقدم الإنتاج خطوة بخطوة بناءً على هذا الترتيب',
    'وقت كل عملية يُستخدم في حساب التكلفة التشغيلية الإجمالية للمنتج — تأكد من دقته'
  ],
  ARRAY[
    'Operation order is critical — the system tracks production progress step-by-step based on this sequence',
    'Each operation'\''s time is used to calculate the total operational cost of the product — ensure accuracy'
  ]
),

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. PRODUCTION ORDER LIST PAGE
-- ──────────────────────────────────────────────────────────────────────────────
(
  'manufacturing_production_orders',
  'أوامر التصنيع — لوحة متابعة الإنتاج',
  'Production Orders — Production Monitoring Dashboard',

  'هذه هي لوحة تحكم الإنتاج الرئيسية — تعرض جميع أوامر التصنيع الحالية والسابقة مع حالة كل منها. من هنا تستطيع معرفة ما يجري في خط الإنتاج بنظرة واحدة: ما الذي قيد التنفيذ، ما الذي اكتمل، وما الذي لم يبدأ بعد.',
  'This is your main production control panel — showing all current and past production orders with each one'\''s status. From here you get a bird'\''s eye view of your production line: what is in progress, what is completed, and what hasn'\''t started yet.',

  '["استعرض بطاقات الإحصائيات في الأعلى: إجمالي الأوامر، النشطة منها، والمكتملة",
    "راجع قائمة الأوامر ولاحظ حالة كل أمر: مسودة / جاهز / قيد التنفيذ / مكتمل / ملغى",
    "استخدم فلاتر البحث لتصفية الأوامر حسب المنتج أو الحالة أو الفرع أو تاريخ الإنشاء",
    "اضغط «إنشاء أمر إنتاج جديد» لبدء دورة إنتاج لمنتج معين بكمية محددة",
    "اضغط على أي أمر في القائمة لفتح صفحة تفاصيله ومتابعة تقدمه أو تنفيذ الإجراءات عليه"]',

  '["Review the statistics cards at the top: total orders, active, and completed",
    "Look at the order list and note each order'\''s status: draft / ready / in progress / completed / cancelled",
    "Use the search filters to filter orders by product, status, branch, or creation date",
    "Click «Create New Production Order» to start a production cycle for a product and quantity",
    "Click any order to open its detail page, track progress, or perform actions on it"]',

  ARRAY[
    'الأوامر في حالة "مسودة" لم تبدأ بعد ولا تؤثر على أرصدة المخزون — يمكن تعديلها أو إلغاؤها بحرية',
    'تابع الأوامر في حالة "قيد التنفيذ" بانتظام لضمان سير الإنتاج في الوقت المحدد'
  ],
  ARRAY[
    'Orders in "draft" status have not started yet and do not affect inventory — they can be freely edited or cancelled',
    'Monitor "in progress" orders regularly to ensure production stays on schedule'
  ]
),

-- ──────────────────────────────────────────────────────────────────────────────
-- 6. PRODUCTION ORDER DETAIL PAGE
-- ──────────────────────────────────────────────────────────────────────────────
(
  'manufacturing_production_order_detail',
  'تفاصيل أمر التصنيع — تنفيذ ومتابعة الإنتاج',
  'Production Order Details — Production Execution & Tracking',

  'هذه الصفحة هي المكان الذي تُدار فيه دورة حياة أمر الإنتاج كاملاً. من هنا تُصدر الأمر رسمياً، وتبدأ التنفيذ، وتتابع خطوات الإنتاج خطوةً بخطوة، وتُسجّل الاكتمال. كل إجراء تقوم به هنا له أثر مباشر وفوري على أرصدة المخزون.',
  'This page is where the full production order lifecycle is managed. From here you officially issue the order, start execution, track production steps one by one, and record completion. Every action you take here has a direct and immediate effect on inventory balances.',

  '["راجع ملخص الأمر في الأعلى: المنتج، الكمية المطلوبة، هيكل المواد، ومسار العمل المرتبط",
    "تحقق من بطاقات الحالة: الكمية المخططة، المنجزة، والمتبقية",
    "راجع قسم «المكونات» للتأكد من توفر المواد الخام المطلوبة في المخزن",
    "اضغط «إصدار» عندما تتأكد من جاهزية المواد والفريق للبدء — الأمر يصبح رسمياً بعدها",
    "اضغط «بدء التنفيذ» عندما يبدأ فريق الإنتاج فعلياً في العمل",
    "تابع تقدم العمليات من تبويب «العمليات» وحدّث حالة كل خطوة",
    "عند الانتهاء من التصنيع: اضغط «اكتمال» لتسجيل النتيجة وتحديث المخزون تلقائياً"]',

  '["Review the order summary at the top: product, required quantity, BOM, and linked routing",
    "Check the status cards: planned quantity, completed, and remaining",
    "Review the «Components» section to confirm required raw materials are available in stock",
    "Click «Release» when materials and team are ready to start — the order becomes official",
    "Click «Start Execution» when the production team actually begins working",
    "Track operation progress from the «Operations» tab and update each step'\''s status",
    "When manufacturing is done: click «Complete» to record the result and automatically update inventory"]',

  ARRAY[
    'الضغط على «اكتمال» يُنشئ حركة مخزون تلقائية: يُخصم مخزون المواد الخام ويُضاف مخزون المنتج النهائي — هذه الخطوة لا رجعة فيها',
    'يمكن إلغاء الأمر فقط قبل الضغط على «بدء التنفيذ» — بعد البدء يجب إكماله أو إيقافه رسمياً',
    'إذا تغيرت وصفة الإنتاج، تحقق من إمكانية تحديث هيكل المواد قبل الضغط على «اكتمال»'
  ],
  ARRAY[
    'Clicking «Complete» creates an automatic inventory movement: raw materials are consumed and finished product is added — this step is irreversible',
    'You can only cancel an order before clicking «Start Execution» — after that, it must be completed or formally stopped',
    'If the production recipe has changed, verify you can update the BOM before clicking «Complete»'
  ]
)

ON CONFLICT (page_key) DO UPDATE SET
  title_ar          = EXCLUDED.title_ar,
  title_en          = EXCLUDED.title_en,
  description_ar    = EXCLUDED.description_ar,
  description_en    = EXCLUDED.description_en,
  steps_ar          = EXCLUDED.steps_ar,
  steps_en          = EXCLUDED.steps_en,
  tips_ar           = EXCLUDED.tips_ar,
  tips_en           = EXCLUDED.tips_en,
  updated_at        = now();
