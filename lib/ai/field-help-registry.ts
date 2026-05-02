export type AIHelpLanguage = "ar" | "en"

export type AIFieldHelpKind = "field" | "button" | "status" | "message"

export type AILocalizedText = Record<AIHelpLanguage, string>

export interface AIFieldHelpItem {
  id: string
  pageKey: string
  kind: AIFieldHelpKind
  label: AILocalizedText
  purpose: AILocalizedText
  whyItExists?: AILocalizedText
  whenToUse?: AILocalizedText
  whatToCheck?: AILocalizedText
  afterAction?: AILocalizedText
  commonMistakes?: AILocalizedText[]
  example?: AILocalizedText
  summary: AILocalizedText
  aliases?: string[]
}

export const AI_HELP_ATTRIBUTE = "data-ai-help" as const

export const AI_FIELD_HELP_REGISTRY = [
  {
    id: "invoices.sales_order",
    pageKey: "invoices",
    kind: "field",
    label: {
      ar: "أمر البيع",
      en: "Sales order",
    },
    purpose: {
      ar: "يربط الفاتورة بطلب البيع الأصلي حتى يعرف النظام أن الفاتورة مبنية على طلب حقيقي من العميل.",
      en: "Links the invoice to the original sales request so the system knows the invoice is based on a real customer order.",
    },
    whyItExists: {
      ar: "يساعدك على تتبع العملية من أول طلب العميل حتى الفاتورة والتحصيل والشحن.",
      en: "It helps track the process from the customer order through invoicing, collection, and delivery.",
    },
    whenToUse: {
      ar: "اختر أمر البيع قبل إنشاء الفاتورة، خصوصًا عندما تكون الشركة تعتمد دورة بيع تبدأ بطلب ثم فاتورة.",
      en: "Select it before creating the invoice, especially when your sales cycle starts with an order and then moves to an invoice.",
    },
    whatToCheck: {
      ar: "تأكد أن العميل والإجمالي والبنود في أمر البيع هي نفس العملية التي تريد إصدار فاتورة لها.",
      en: "Check that the customer, total, and order items match the sale you want to invoice.",
    },
    commonMistakes: [
      {
        ar: "اختيار أمر بيع لعميل مختلف عن العميل المقصود.",
        en: "Selecting an order that belongs to a different customer.",
      },
      {
        ar: "إنشاء فاتورة قبل التأكد من أن أمر البيع هو النسخة الصحيحة.",
        en: "Creating the invoice before confirming that the order is the correct version.",
      },
    ],
    summary: {
      ar: "ابدأ من أمر البيع الصحيح حتى تكون الفاتورة مرتبطة بالعملية الصحيحة.",
      en: "Start from the correct sales order so the invoice stays connected to the right transaction.",
    },
    aliases: ["sales order", "order", "أمر", "طلب البيع"],
  },
  {
    id: "invoices.customer",
    pageKey: "invoices",
    kind: "field",
    label: {
      ar: "العميل",
      en: "Customer",
    },
    purpose: {
      ar: "يحدد الشخص أو الجهة التي ستصدر لها الفاتورة والتي ستظهر عليها المديونية أو السداد.",
      en: "Identifies the person or organization receiving the invoice and carrying the amount due or payment history.",
    },
    whyItExists: {
      ar: "بدون اختيار العميل لا يمكن ربط الفاتورة بالحساب الصحيح أو متابعة التحصيل والرصيد.",
      en: "Without a customer, the invoice cannot be tied to the right account, collection follow-up, or balance.",
    },
    whenToUse: {
      ar: "اختر العميل عند بداية إنشاء الفاتورة، أو أضف عميلًا جديدًا إذا لم يكن موجودًا بعد.",
      en: "Choose the customer when starting the invoice, or add a new one if they are not listed yet.",
    },
    whatToCheck: {
      ar: "راجع الاسم ورقم الهاتف عند وجود أكثر من عميل متشابه.",
      en: "Review the name and phone number when several customers look similar.",
    },
    example: {
      ar: "إذا كان البيع للعميل أحمد علي، اختر أحمد علي حتى تظهر الفاتورة في حسابه وتاريخه.",
      en: "If the sale is for Ahmed Ali, select Ahmed Ali so the invoice appears in his account and history.",
    },
    summary: {
      ar: "اختيار العميل الصحيح هو أساس الفاتورة والتحصيل والمتابعة.",
      en: "Choosing the right customer is the base for invoicing, collection, and follow-up.",
    },
    aliases: ["customer", "client", "عميل", "العميل"],
  },
  {
    id: "invoices.new_customer_button",
    pageKey: "invoices",
    kind: "button",
    label: {
      ar: "زر عميل جديد",
      en: "New customer button",
    },
    purpose: {
      ar: "يفتح نافذة صغيرة لإضافة عميل غير موجود في القائمة أثناء إنشاء الفاتورة.",
      en: "Opens a small form to add a customer who is not already listed while creating the invoice.",
    },
    whenToUse: {
      ar: "استخدمه عندما لا تجد العميل في البحث، بشرط أن تكون لديك صلاحية إضافة العملاء.",
      en: "Use it when you cannot find the customer in search, if your role is allowed to add customers.",
    },
    whatToCheck: {
      ar: "تأكد من الاسم ورقم الهاتف والعنوان حتى لا يتم إنشاء عميل مكرر أو ناقص البيانات.",
      en: "Check the name, phone, and address to avoid creating a duplicate or incomplete customer.",
    },
    afterAction: {
      ar: "بعد الإضافة سيتم اختيار العميل الجديد في الفاتورة لتكمل باقي البيانات.",
      en: "After adding the customer, they will be selected on the invoice so you can continue.",
    },
    summary: {
      ar: "استخدمه فقط عند الحاجة لإضافة عميل غير موجود بالفعل.",
      en: "Use it only when you need to add a customer who is not already available.",
    },
    aliases: ["new customer", "add customer", "عميل جديد", "إضافة عميل"],
  },
  {
    id: "invoices.issue_date",
    pageKey: "invoices",
    kind: "field",
    label: {
      ar: "تاريخ الفاتورة",
      en: "Issue date",
    },
    purpose: {
      ar: "يوضح تاريخ إصدار الفاتورة وبداية احتسابها في المتابعة والتقارير.",
      en: "Shows when the invoice is issued and when it starts appearing in follow-up and reports.",
    },
    whatToCheck: {
      ar: "راجع أن التاريخ يعبر عن يوم البيع الفعلي وليس يوم إدخال البيانات فقط.",
      en: "Check that the date reflects the actual sale day, not only the day of data entry.",
    },
    summary: {
      ar: "هذا التاريخ يحدد توقيت الفاتورة في التقارير والمتابعة.",
      en: "This date places the invoice correctly in reports and follow-up.",
    },
    aliases: ["issue date", "invoice date", "تاريخ الفاتورة"],
  },
  {
    id: "invoices.due_date",
    pageKey: "invoices",
    kind: "field",
    label: {
      ar: "تاريخ الاستحقاق",
      en: "Due date",
    },
    purpose: {
      ar: "يحدد آخر موعد متوقع لسداد الفاتورة إذا لم تكن مدفوعة فورًا.",
      en: "Sets the expected latest payment date when the invoice is not paid immediately.",
    },
    whenToUse: {
      ar: "استخدمه للفواتير الآجلة أو التي لها مدة سماح متفق عليها مع العميل.",
      en: "Use it for credit invoices or invoices with an agreed payment term.",
    },
    whatToCheck: {
      ar: "تأكد من توافقه مع اتفاق البيع أو سياسة التحصيل الخاصة بالشركة.",
      en: "Make sure it matches the sales agreement or your collection policy.",
    },
    summary: {
      ar: "يساعد فريق التحصيل على معرفة متى يجب متابعة السداد.",
      en: "It helps the collection team know when payment should be followed up.",
    },
    aliases: ["due date", "payment date", "تاريخ الاستحقاق"],
  },
  {
    id: "invoices.branch_context",
    pageKey: "invoices",
    kind: "field",
    label: {
      ar: "الفرع ومركز التكلفة والمخزن",
      en: "Branch, cost center, and warehouse",
    },
    purpose: {
      ar: "تحدد أين حدث البيع، وأي فريق أو فرع يتحمل العملية، ومن أي مخزن ستخرج البضاعة.",
      en: "Defines where the sale belongs, which team or branch carries it, and which warehouse supplies the goods.",
    },
    whyItExists: {
      ar: "هذه البيانات تجعل التقارير والمخزون والمتابعة موزعة بشكل صحيح بين الفروع والمخازن.",
      en: "These details keep reports, stock, and follow-up correctly separated by branch and warehouse.",
    },
    whatToCheck: {
      ar: "راجع أن المخزن تابع للفرع الصحيح وأنه هو المخزن الذي سيجهز البضاعة فعليًا.",
      en: "Check that the warehouse belongs to the right branch and is the one that will actually prepare the goods.",
    },
    summary: {
      ar: "هذا الجزء يربط الفاتورة بالمكان التشغيلي الصحيح داخل الشركة.",
      en: "This area connects the invoice to the correct operating location in the company.",
    },
    aliases: ["branch", "warehouse", "cost center", "فرع", "مخزن", "مركز التكلفة"],
  },
  {
    id: "invoices.items",
    pageKey: "invoices",
    kind: "field",
    label: {
      ar: "عناصر الفاتورة",
      en: "Invoice items",
    },
    purpose: {
      ar: "تعرض المنتجات أو الخدمات التي يشتريها العميل مع الكمية والسعر والضريبة والخصم.",
      en: "Lists the products or services the customer is buying, with quantity, price, tax, and discount.",
    },
    whenToUse: {
      ar: "أضف كل بند يمثل شيئًا سيتم بيعه أو تحصيل قيمته من العميل.",
      en: "Add every line that represents something being sold or charged to the customer.",
    },
    whatToCheck: {
      ar: "راجع المنتج والكمية والسعر قبل الحفظ لأن هذه البنود تبني إجمالي الفاتورة.",
      en: "Review product, quantity, and price before saving because these lines build the invoice total.",
    },
    commonMistakes: [
      {
        ar: "نسيان إضافة بند أو إدخال كمية غير صحيحة.",
        en: "Forgetting an item or entering an incorrect quantity.",
      },
      {
        ar: "تعديل السعر دون الانتباه لتأثيره على الإجمالي.",
        en: "Changing the price without checking its effect on the total.",
      },
    ],
    summary: {
      ar: "بنود الفاتورة هي ما سيحاسب عليه العميل فعليًا.",
      en: "Invoice items are what the customer will actually be charged for.",
    },
    aliases: ["items", "lines", "products", "بنود", "عناصر", "منتجات"],
  },
  {
    id: "invoices.add_item_button",
    pageKey: "invoices",
    kind: "button",
    label: {
      ar: "زر إضافة عنصر",
      en: "Add item button",
    },
    purpose: {
      ar: "يضيف سطرًا جديدًا داخل الفاتورة لاختيار منتج أو خدمة وكتابة الكمية والسعر.",
      en: "Adds a new invoice line where you can choose a product or service and enter quantity and price.",
    },
    afterAction: {
      ar: "بعد الضغط سيظهر سطر جديد، ثم تختار المنتج وتراجع الكمية والسعر والضريبة.",
      en: "After clicking, a new line appears; then choose the item and review quantity, price, and tax.",
    },
    summary: {
      ar: "استخدمه لكل منتج أو خدمة تريد إضافتها للفاتورة.",
      en: "Use it for each product or service you want to include on the invoice.",
    },
    aliases: ["add item", "add line", "إضافة عنصر", "إضافة بند"],
  },
  {
    id: "invoices.discount",
    pageKey: "invoices",
    kind: "field",
    label: {
      ar: "خصم الفاتورة",
      en: "Invoice discount",
    },
    purpose: {
      ar: "يقلل قيمة الفاتورة بالكامل، إما بمبلغ ثابت أو بنسبة مئوية.",
      en: "Reduces the whole invoice total, either by a fixed amount or by a percentage.",
    },
    whenToUse: {
      ar: "استخدمه عندما يكون الخصم على الفاتورة كلها وليس على منتج واحد فقط.",
      en: "Use it when the discount applies to the whole invoice, not only one item.",
    },
    whatToCheck: {
      ar: "راجع هل الخصم قبل الضريبة أم بعدها، وهل هو مبلغ أم نسبة.",
      en: "Check whether the discount is before or after tax, and whether it is an amount or a percentage.",
    },
    example: {
      ar: "إذا كان إجمالي الفاتورة 1000 ويوجد خصم عام 50، أدخل 50 كقيمة خصم.",
      en: "If the invoice total is 1000 and there is a general discount of 50, enter 50 as the discount amount.",
    },
    summary: {
      ar: "هذا الخصم يؤثر على إجمالي الفاتورة، لذلك راجع نوعه ومكان تطبيقه.",
      en: "This discount affects the invoice total, so review its type and where it applies.",
    },
    aliases: ["discount", "invoice discount", "خصم", "خصم الفاتورة"],
  },
  {
    id: "invoices.shipping_provider",
    pageKey: "invoices",
    kind: "field",
    label: {
      ar: "شركة الشحن",
      en: "Shipping company",
    },
    purpose: {
      ar: "تحدد الجهة التي ستتولى توصيل الطلب للعميل إذا كانت الفاتورة تحتاج شحنًا.",
      en: "Identifies the company responsible for delivering the order when the invoice requires shipping.",
    },
    whyItExists: {
      ar: "اختيار شركة الشحن يساعد على متابعة التسليم وربط الفاتورة بخطوة تجهيز البضاعة.",
      en: "Choosing a shipping company helps track delivery and connect the invoice to goods preparation.",
    },
    whatToCheck: {
      ar: "راجع أن شركة الشحن مناسبة للمنطقة وتكلفة الشحن قبل إنشاء الفاتورة.",
      en: "Check that the shipping company is suitable for the area and review the shipping cost before creating the invoice.",
    },
    summary: {
      ar: "هذا الاختيار يوضح من سيتولى توصيل الطلب بعد إصدار الفاتورة.",
      en: "This choice clarifies who will deliver the order after the invoice is issued.",
    },
    aliases: ["shipping", "delivery", "شركة الشحن", "الشحن"],
  },
  {
    id: "invoices.create_invoice_button",
    pageKey: "invoices",
    kind: "button",
    label: {
      ar: "زر إنشاء الفاتورة",
      en: "Create invoice button",
    },
    purpose: {
      ar: "يحفظ بيانات الفاتورة والبنود ويحول ما أدخلته إلى فاتورة يمكن متابعتها داخل النظام.",
      en: "Saves the invoice details and lines, turning your entries into an invoice that can be followed in the system.",
    },
    whatToCheck: {
      ar: "قبل الضغط راجع أمر البيع والعميل والبنود والإجمالي والشحن.",
      en: "Before clicking, review the sales order, customer, items, total, and shipping.",
    },
    afterAction: {
      ar: "بعد الإنشاء ستنتقل الفاتورة للمتابعة حسب حالتها وصلاحيات الاعتماد والشحن والتحصيل.",
      en: "After creation, the invoice moves into follow-up according to its status, approvals, delivery, and collection steps.",
    },
    commonMistakes: [
      {
        ar: "الحفظ قبل مراجعة البنود أو اختيار أمر البيع الصحيح.",
        en: "Saving before reviewing the lines or selecting the right sales order.",
      },
    ],
    summary: {
      ar: "هذا هو زر تحويل البيانات المدخلة إلى فاتورة فعلية داخل النظام.",
      en: "This button turns the entered details into an actual invoice in the system.",
    },
    aliases: ["create invoice", "save invoice", "إنشاء الفاتورة", "حفظ الفاتورة"],
  },
  {
    id: "invoices.record_payment_button",
    pageKey: "invoices",
    kind: "button",
    label: {
      ar: "زر تسجيل دفعة",
      en: "Payment entry button",
    },
    purpose: {
      ar: "يستخدم لإثبات أن العميل دفع جزءًا من الفاتورة أو قيمتها بالكامل.",
      en: "Confirms that the customer paid part or all of the invoice amount.",
    },
    whenToUse: {
      ar: "استخدمه عندما تستلم مبلغًا من العميل مقابل هذه الفاتورة.",
      en: "Use it when you receive money from the customer for this invoice.",
    },
    whatToCheck: {
      ar: "راجع المبلغ وتاريخ الدفع وطريقة السداد قبل الحفظ.",
      en: "Review the amount, payment date, and payment method before saving.",
    },
    afterAction: {
      ar: "بعد الحفظ سيتم تحديث حالة السداد ورصيد العميل حسب قيمة الدفعة.",
      en: "After saving, payment status and the customer balance are updated based on the amount.",
    },
    summary: {
      ar: "هذا الزر يربط التحصيل بالفاتورة حتى يظهر ما تم سداده وما تبقى.",
      en: "This button connects collection to the invoice so paid and remaining amounts are clear.",
    },
    aliases: ["payment", "record payment", "دفعة", "تسجيل دفعة"],
  },
  {
    id: "invoices.partial_return_button",
    pageKey: "invoices",
    kind: "button",
    label: {
      ar: "زر مرتجع جزئي",
      en: "Partial return button",
    },
    purpose: {
      ar: "يبدأ طلب إرجاع جزء من الفاتورة بدل إلغاء الفاتورة بالكامل.",
      en: "Starts a request to return part of the invoice instead of canceling the whole invoice.",
    },
    whenToUse: {
      ar: "استخدمه عندما يريد العميل إرجاع كمية أو بند محدد فقط.",
      en: "Use it when the customer wants to return only a specific quantity or item.",
    },
    whatToCheck: {
      ar: "راجع الكمية المرتجعة وسبب المرتجع وتأثيره على رصيد العميل.",
      en: "Review the returned quantity, return reason, and effect on the customer balance.",
    },
    afterAction: {
      ar: "بعد الإرسال يدخل الطلب في مسار الاعتماد قبل تنفيذ أي أثر مالي أو مخزني.",
      en: "After submission, the request follows approval before any financial or stock effect happens.",
    },
    summary: {
      ar: "هذا الزر مخصص لمرتجع جزء من الفاتورة مع مراجعة واعتماد لاحق.",
      en: "This button is for returning part of an invoice with review and approval afterward.",
    },
    aliases: ["partial return", "return request", "مرتجع جزئي", "طلب مرتجع"],
  },
  {
    id: "invoices.status.draft",
    pageKey: "invoices",
    kind: "status",
    label: {
      ar: "مسودة",
      en: "Draft",
    },
    purpose: {
      ar: "تعني أن الفاتورة ما زالت في مرحلة التجهيز ولم تصبح خطوة نهائية للمتابعة بعد.",
      en: "Means the invoice is still being prepared and has not become a final follow-up step yet.",
    },
    afterAction: {
      ar: "بعد مراجعتها يمكن إرسالها أو اعتمادها حسب دورة العمل والصلاحيات.",
      en: "After review, it can be sent or approved according to workflow and permissions.",
    },
    summary: {
      ar: "المسودة قابلة للمراجعة قبل الانتقال للخطوة التالية.",
      en: "A draft is still available for review before moving forward.",
    },
    aliases: ["draft", "مسودة"],
  },
  {
    id: "invoices.status.sent",
    pageKey: "invoices",
    kind: "status",
    label: {
      ar: "مرسلة",
      en: "Sent",
    },
    purpose: {
      ar: "تعني أن الفاتورة خرجت من مرحلة التجهيز وأصبحت جاهزة للمتابعة أو التحصيل أو التجهيز حسب حالتها.",
      en: "Means the invoice has moved beyond preparation and is ready for follow-up, collection, or delivery steps depending on its state.",
    },
    summary: {
      ar: "الفاتورة المرسلة تحتاج متابعة الخطوة التالية بدل اعتبارها مجرد مسودة.",
      en: "A sent invoice needs next-step follow-up rather than draft review.",
    },
    aliases: ["sent", "مرسلة"],
  },
  {
    id: "invoices.status.paid",
    pageKey: "invoices",
    kind: "status",
    label: {
      ar: "مدفوعة",
      en: "Paid",
    },
    purpose: {
      ar: "تعني أن قيمة الفاتورة تم سدادها بالكامل حسب المدفوعات المسجلة.",
      en: "Means the full invoice amount has been paid according to recorded payments.",
    },
    summary: {
      ar: "الفاتورة المدفوعة غالبًا تحتاج متابعة تسليم أو إغلاق ملف العملية.",
      en: "A paid invoice usually moves to delivery follow-up or transaction closure.",
    },
    aliases: ["paid", "مدفوعة"],
  },
  {
    id: "invoices.warehouse_status.pending",
    pageKey: "invoices",
    kind: "status",
    label: {
      ar: "بانتظار تجهيز المخزن",
      en: "Waiting for warehouse preparation",
    },
    purpose: {
      ar: "تعني أن الفاتورة تحتاج متابعة من المخزن قبل اعتبار البضاعة جاهزة أو مسلمة.",
      en: "Means the invoice needs warehouse follow-up before the goods are considered ready or delivered.",
    },
    summary: {
      ar: "هذه الحالة تنبهك أن خطوة المخزن لم تكتمل بعد.",
      en: "This status tells you the warehouse step is not complete yet.",
    },
    aliases: ["warehouse pending", "pending delivery", "بانتظار المخزن"],
  },
  {
    id: "invoices.validation.missing_customer",
    pageKey: "invoices",
    kind: "message",
    label: {
      ar: "رسالة اختيار العميل",
      en: "Customer selection message",
    },
    purpose: {
      ar: "تظهر عندما تحاول المتابعة بدون تحديد العميل الذي تخصه الفاتورة.",
      en: "Appears when you try to continue without choosing which customer the invoice belongs to.",
    },
    afterAction: {
      ar: "اختر العميل الصحيح ثم حاول الحفظ مرة أخرى.",
      en: "Choose the correct customer and try saving again.",
    },
    summary: {
      ar: "لا يمكن متابعة الفاتورة بدون عميل واضح.",
      en: "The invoice cannot move forward without a clear customer.",
    },
    aliases: ["missing customer", "please select customer", "يرجى اختيار عميل"],
  },
  {
    id: "invoices.validation.out_of_stock",
    pageKey: "invoices",
    kind: "message",
    label: {
      ar: "رسالة عدم كفاية الكمية",
      en: "Insufficient stock message",
    },
    purpose: {
      ar: "تنبهك أن الكمية المطلوبة قد لا تكون متاحة للتجهيز من المخزن المحدد.",
      en: "Warns that the requested quantity may not be available for preparation from the selected warehouse.",
    },
    whatToCheck: {
      ar: "راجع المخزن والكمية أو اختر منتجًا/كمية متاحة قبل المتابعة.",
      en: "Review the warehouse and quantity, or choose an available product or quantity before continuing.",
    },
    summary: {
      ar: "المقصود هو منع إنشاء عملية بيع لا يمكن تجهيزها من المخزون الحالي.",
      en: "The goal is to prevent creating a sale that cannot be prepared from current stock.",
    },
    aliases: ["out of stock", "stock warning", "الكمية غير متاحة"],
  },
  {
    id: "invoices.detail_customer_snapshot",
    pageKey: "invoices",
    kind: "field",
    label: {
      ar: "بيانات العميل في الفاتورة",
      en: "Invoice customer details",
    },
    purpose: {
      ar: "تعرض بيانات العميل المستخدمة في هذه الفاتورة مثل الاسم والهاتف والعنوان، حتى تراجع أن المستند يخص العميل الصحيح.",
      en: "Shows the customer details used on this invoice, such as name, phone, and address, so you can confirm the invoice belongs to the right customer.",
    },
    whyItExists: {
      ar: "وجودها يقلل أخطاء التحصيل أو التسليم عندما تتشابه أسماء العملاء.",
      en: "It reduces collection and delivery mistakes when customer names are similar.",
    },
    whatToCheck: {
      ar: "راجع الاسم ورقم الهاتف والعنوان قبل الطباعة أو تسجيل دفعة أو عمل مرتجع.",
      en: "Check the name, phone, and address before printing, entering a payment, or starting a return.",
    },
    summary: {
      ar: "هذا الجزء يؤكد أن الفاتورة مرتبطة بالعميل الصحيح.",
      en: "This area confirms that the invoice is tied to the correct customer.",
    },
    aliases: ["bill to", "customer details", "بيانات العميل", "فاتورة إلى"],
  },
  {
    id: "invoices.detail_status",
    pageKey: "invoices",
    kind: "status",
    label: {
      ar: "حالة الفاتورة",
      en: "Invoice status",
    },
    purpose: {
      ar: "توضح المرحلة الحالية للفاتورة: هل ما زالت مسودة، مرسلة، مدفوعة، أو عليها مرتجع.",
      en: "Shows the current invoice stage: draft, sent, paid, or affected by a return.",
    },
    whyItExists: {
      ar: "تحدد الحالة ما الخطوة المناسبة التالية وما الأزرار التي تظهر للمستخدم.",
      en: "The status guides the next suitable step and which buttons are available to the user.",
    },
    whatToCheck: {
      ar: "راجع الحالة قبل تسجيل دفعة أو عمل مرتجع لأن بعض الخطوات لا تظهر إلا في حالات معينة.",
      en: "Check the status before entering payment or starting a return because some steps appear only in certain stages.",
    },
    summary: {
      ar: "الحالة تخبرك أين وصلت الفاتورة وما الذي يمكن فعله بعدها.",
      en: "The status tells you where the invoice stands and what can happen next.",
    },
    aliases: ["invoice status", "status", "حالة الفاتورة", "الحالة"],
  },
  {
    id: "invoices.status.partially_paid",
    pageKey: "invoices",
    kind: "status",
    label: {
      ar: "مدفوعة جزئيًا",
      en: "Partially paid",
    },
    purpose: {
      ar: "تعني أن العميل سدد جزءًا من قيمة الفاتورة وما زال هناك مبلغ متبقٍ.",
      en: "Means the customer has paid part of the invoice and there is still an amount remaining.",
    },
    whatToCheck: {
      ar: "راجع إجمالي المدفوع وصافي المتبقي قبل طلب دفعة جديدة أو عمل تسوية.",
      en: "Review the paid amount and remaining balance before requesting another payment or making a settlement.",
    },
    summary: {
      ar: "الفاتورة ليست مغلقة بعد؛ ما زال هناك مبلغ يحتاج متابعة.",
      en: "The invoice is not closed yet; there is still an amount to follow up.",
    },
    aliases: ["partially paid", "partial payment", "مدفوعة جزئيا", "مدفوعة جزئيًا"],
  },
  {
    id: "invoices.status.cancelled",
    pageKey: "invoices",
    kind: "status",
    label: {
      ar: "ملغاة",
      en: "Cancelled",
    },
    purpose: {
      ar: "تعني أن الفاتورة لم تعد مستندًا نشطًا للتحصيل أو التسليم.",
      en: "Means the invoice is no longer an active document for collection or delivery.",
    },
    whatToCheck: {
      ar: "راجع سبب الإلغاء أو المستند البديل قبل اتخاذ أي خطوة جديدة.",
      en: "Check the cancellation reason or replacement document before taking a new step.",
    },
    summary: {
      ar: "الفاتورة الملغاة تُراجع فقط ولا تُستخدم كخطوة تشغيل نشطة.",
      en: "A cancelled invoice is mainly for review and is not used as an active operating step.",
    },
    aliases: ["cancelled", "canceled", "ملغاة", "ملغي"],
  },
  {
    id: "invoices.status.fully_returned",
    pageKey: "invoices",
    kind: "status",
    label: {
      ar: "مرتجع بالكامل",
      en: "Fully returned",
    },
    purpose: {
      ar: "تعني أن كامل قيمة الفاتورة أو كمياتها تم إرجاعها عبر مسار مرتجع.",
      en: "Means the full invoice value or quantities have been returned through a return process.",
    },
    whatToCheck: {
      ar: "راجع جدول المرتجعات والرصيد الدائن للعميل لمعرفة أثر العملية.",
      en: "Review the returns table and customer credit to understand the effect.",
    },
    summary: {
      ar: "هذه الفاتورة انتهت عمليًا كبيع، وبقيت للرجوع والمتابعة.",
      en: "This invoice is effectively closed as a sale and remains for reference and follow-up.",
    },
    aliases: ["fully returned", "full return", "مرتجع بالكامل"],
  },
  {
    id: "invoices.status.partially_returned",
    pageKey: "invoices",
    kind: "status",
    label: {
      ar: "مرتجع جزئيًا",
      en: "Partially returned",
    },
    purpose: {
      ar: "تعني أن جزءًا من البنود أو الكميات تم إرجاعه، بينما بقي جزء من الفاتورة قائمًا.",
      en: "Means some items or quantities were returned while part of the invoice remains active.",
    },
    whatToCheck: {
      ar: "راجع صافي الفاتورة بعد المرتجع والكمية المتبقية.",
      en: "Review the net invoice after returns and the remaining quantity.",
    },
    summary: {
      ar: "الفاتورة تغيرت بسبب المرتجع، لذلك اقرأ الصافي بدل الإجمالي الأصلي فقط.",
      en: "The invoice changed because of the return, so read the net amount rather than only the original total.",
    },
    aliases: ["partially returned", "partial return", "مرتجع جزئيا", "مرتجع جزئيًا"],
  },
  {
    id: "invoices.mark_sent_button",
    pageKey: "invoices",
    kind: "button",
    label: {
      ar: "زر تحديد كمرسلة",
      en: "Mark as sent button",
    },
    purpose: {
      ar: "ينقل الفاتورة من مرحلة التجهيز إلى مرحلة المتابعة، بحيث تصبح جاهزة للخطوات التالية مثل التجهيز أو التحصيل حسب الدورة.",
      en: "Moves the invoice from preparation into follow-up, so it can continue to delivery or collection steps depending on the workflow.",
    },
    whatToCheck: {
      ar: "راجع العميل والبنود والإجمالي قبل الضغط، لأن هذه الخطوة تجعل الفاتورة أكثر رسمية في المتابعة.",
      en: "Review customer, items, and total before clicking because this step makes the invoice more official for follow-up.",
    },
    afterAction: {
      ar: "بعد الضغط ستظهر خطوات متابعة مناسبة مثل الدفع أو تجهيز التسليم حسب الحالة والصلاحيات.",
      en: "After clicking, relevant follow-up steps such as payment or delivery preparation may appear based on status and permissions.",
    },
    summary: {
      ar: "استخدمه بعد التأكد أن الفاتورة جاهزة للخروج من المسودة.",
      en: "Use it after confirming the invoice is ready to leave draft preparation.",
    },
    aliases: ["mark as sent", "send invoice", "تحديد كمرسلة", "إرسال الفاتورة"],
  },
  {
    id: "invoices.print_button",
    pageKey: "invoices",
    kind: "button",
    label: {
      ar: "زر الطباعة",
      en: "Print button",
    },
    purpose: {
      ar: "يجهز نسخة قابلة للطباعة من الفاتورة لمشاركتها أو حفظها ورقيًا.",
      en: "Prepares a printable invoice copy for sharing or paper filing.",
    },
    whatToCheck: {
      ar: "راجع بيانات العميل والإجمالي والحالة قبل الطباعة.",
      en: "Check customer details, total, and status before printing.",
    },
    summary: {
      ar: "الطباعة تعرض نسخة من الفاتورة ولا تغيّر بياناتها.",
      en: "Printing shows a copy of the invoice and does not change its data.",
    },
    aliases: ["print", "طباعة"],
  },
  {
    id: "invoices.download_pdf_button",
    pageKey: "invoices",
    kind: "button",
    label: {
      ar: "زر تنزيل PDF",
      en: "Download PDF button",
    },
    purpose: {
      ar: "ينشئ ملف PDF من الفاتورة للاحتفاظ به أو إرساله للعميل.",
      en: "Creates a PDF copy of the invoice for storage or sharing with the customer.",
    },
    summary: {
      ar: "ينزل نسخة ملف فقط ولا يعتمد أو يغير الفاتورة.",
      en: "It downloads a file copy only and does not approve or change the invoice.",
    },
    aliases: ["download pdf", "pdf", "تنزيل PDF", "تحميل PDF"],
  },
  {
    id: "invoices.apply_credit_button",
    pageKey: "invoices",
    kind: "button",
    label: {
      ar: "زر تطبيق الرصيد",
      en: "Apply credit button",
    },
    purpose: {
      ar: "يستخدم رصيدًا دائنًا متاحًا للعميل لتقليل المبلغ المتبقي على الفاتورة.",
      en: "Uses available customer credit to reduce the remaining invoice amount.",
    },
    whenToUse: {
      ar: "استخدمه عندما يكون للعميل رصيد من مرتجع أو تسوية وتريد خصمه من هذه الفاتورة.",
      en: "Use it when the customer has credit from a return or settlement and you want to apply it to this invoice.",
    },
    whatToCheck: {
      ar: "راجع الرصيد المتاح والمبلغ المتبقي قبل التطبيق.",
      en: "Review available credit and the remaining invoice amount before applying it.",
    },
    afterAction: {
      ar: "بعد التطبيق سينخفض المتبقي على الفاتورة حسب المبلغ المستخدم.",
      en: "After applying it, the remaining invoice balance decreases by the applied amount.",
    },
    summary: {
      ar: "هذا الزر يخصم من رصيد العميل المتاح بدل تحصيل مبلغ جديد.",
      en: "This button uses available customer credit instead of collecting new money.",
    },
    aliases: ["apply credit", "customer credit", "تطبيق الرصيد", "رصيد العميل"],
  },
  {
    id: "invoices.credit_apply_amount",
    pageKey: "invoices",
    kind: "field",
    label: {
      ar: "مبلغ الرصيد المراد تطبيقه",
      en: "Credit amount to apply",
    },
    purpose: {
      ar: "يحدد قيمة الرصيد الدائن التي ستُستخدم لتقليل متبقي الفاتورة.",
      en: "Sets how much available credit will be used to reduce the invoice balance.",
    },
    whatToCheck: {
      ar: "لا تدخل مبلغًا أكبر من الرصيد المتاح أو أكبر من المتبقي على الفاتورة.",
      en: "Do not enter more than the available credit or more than the invoice balance.",
    },
    summary: {
      ar: "هذا المبلغ يحدد مقدار ما سيُخصم من رصيد العميل لصالح هذه الفاتورة.",
      en: "This amount controls how much customer credit is applied to this invoice.",
    },
    aliases: ["amount to apply", "credit amount", "مبلغ الرصيد", "المبلغ المراد تطبيقه"],
  },
  {
    id: "invoices.payments_table",
    pageKey: "invoices",
    kind: "field",
    label: {
      ar: "جدول المدفوعات",
      en: "Payments table",
    },
    purpose: {
      ar: "يعرض الدفعات التي تم ربطها بهذه الفاتورة، مع التاريخ والطريقة والمبلغ.",
      en: "Shows payments linked to this invoice, including date, method, and amount.",
    },
    whyItExists: {
      ar: "يساعدك على معرفة ما تم تحصيله وما المتبقي دون الرجوع لصفحات أخرى.",
      en: "It helps you see what has been collected and what remains without leaving the invoice.",
    },
    summary: {
      ar: "هذا الجدول هو سجل متابعة التحصيل الخاص بالفاتورة.",
      en: "This table is the invoice collection follow-up history.",
    },
    aliases: ["payments table", "payments", "جدول المدفوعات", "المدفوعات"],
  },
  {
    id: "invoices.payment_amount",
    pageKey: "invoices",
    kind: "field",
    label: {
      ar: "مبلغ الدفعة",
      en: "Payment amount",
    },
    purpose: {
      ar: "يحدد المبلغ الذي استلمته من العميل مقابل هذه الفاتورة.",
      en: "Sets the amount received from the customer for this invoice.",
    },
    whatToCheck: {
      ar: "راجع أن المبلغ لا يتجاوز المتبقي وأنه يطابق الإيصال أو التحويل.",
      en: "Check that the amount does not exceed the remaining balance and matches the receipt or transfer.",
    },
    summary: {
      ar: "هذا هو مبلغ التحصيل الذي سيقلل المتبقي على الفاتورة.",
      en: "This is the collected amount that reduces the invoice balance.",
    },
    aliases: ["payment amount", "amount", "مبلغ الدفعة", "المبلغ"],
  },
  {
    id: "invoices.payment_account",
    pageKey: "invoices",
    kind: "field",
    label: {
      ar: "حساب النقد أو البنك",
      en: "Cash or bank account",
    },
    purpose: {
      ar: "يحدد أين تم استلام الدفعة: خزنة، بنك، أو حساب تحصيل مناسب.",
      en: "Shows where the payment was received: cash, bank, or another collection account.",
    },
    whatToCheck: {
      ar: "اختر الحساب الذي دخلت فيه الدفعة فعليًا حتى تكون المتابعة المالية واضحة.",
      en: "Choose the account where the payment actually arrived so financial follow-up stays clear.",
    },
    summary: {
      ar: "هذا الحقل يربط الدفعة بمكان التحصيل الصحيح.",
      en: "This field ties the payment to the correct collection place.",
    },
    aliases: ["payment account", "cash account", "bank account", "حساب الدفع", "الحساب"],
  },
  {
    id: "invoices.save_payment_button",
    pageKey: "invoices",
    kind: "button",
    label: {
      ar: "زر حفظ الدفعة",
      en: "Save payment button",
    },
    purpose: {
      ar: "يحفظ بيانات الدفعة ويربطها بالفاتورة حتى يظهر ما تم سداده وما تبقى.",
      en: "Saves the payment details and links them to the invoice so paid and remaining amounts are clear.",
    },
    whatToCheck: {
      ar: "راجع المبلغ والتاريخ وطريقة الدفع والحساب قبل الحفظ.",
      en: "Review amount, date, method, and account before saving.",
    },
    afterAction: {
      ar: "بعد الحفظ ستتغير متابعة السداد حسب قيمة الدفعة.",
      en: "After saving, payment follow-up changes based on the amount.",
    },
    summary: {
      ar: "هذا الزر يثبت الدفعة على الفاتورة.",
      en: "This button confirms the payment on the invoice.",
    },
    aliases: ["save payment", "حفظ الدفعة"],
  },
  {
    id: "invoices.full_return_button",
    pageKey: "invoices",
    kind: "button",
    label: {
      ar: "زر مرتجع كامل",
      en: "Full return button",
    },
    purpose: {
      ar: "يبدأ طلب إرجاع كامل الفاتورة عندما تكون العملية كلها بحاجة للإلغاء عبر مسار مرتجع.",
      en: "Starts a request to return the whole invoice when the entire sale needs to be reversed through the return process.",
    },
    whatToCheck: {
      ar: "راجع أن العميل يريد إرجاع كل البنود وليس جزءًا فقط.",
      en: "Check that the customer wants to return all items, not only part of the invoice.",
    },
    afterAction: {
      ar: "بعد الإرسال ينتقل الطلب للاعتماد قبل تنفيذ الأثر المالي أو المخزني.",
      en: "After submission, the request goes through approval before any financial or stock effect happens.",
    },
    summary: {
      ar: "استخدمه عندما يكون المرتجع على الفاتورة بالكامل.",
      en: "Use it when the return covers the whole invoice.",
    },
    aliases: ["full return", "مرتجع كامل"],
  },
  {
    id: "invoices.returns_table",
    pageKey: "invoices",
    kind: "field",
    label: {
      ar: "جدول المرتجعات",
      en: "Returns table",
    },
    purpose: {
      ar: "يعرض المرتجعات المرتبطة بالفاتورة وقيمتها ونوعها والبنود التي تم إرجاعها.",
      en: "Shows returns linked to the invoice, including value, type, and returned items.",
    },
    summary: {
      ar: "هذا الجدول يوضح كيف أثرت المرتجعات على الفاتورة.",
      en: "This table shows how returns affected the invoice.",
    },
    aliases: ["returns table", "returns", "جدول المرتجعات", "المرتجعات"],
  },
  {
    id: "invoices.refund_customer_credit_button",
    pageKey: "invoices",
    kind: "button",
    label: {
      ar: "زر صرف رصيد العميل",
      en: "Refund customer credit button",
    },
    purpose: {
      ar: "يفتح خطوة رد الرصيد الدائن للعميل عندما يكون لديه مبلغ مستحق للصرف.",
      en: "Starts the step to refund available customer credit when the customer has an amount to receive back.",
    },
    whatToCheck: {
      ar: "راجع قيمة الرصيد وسبب الصرف قبل المتابعة.",
      en: "Review the credit value and refund reason before continuing.",
    },
    summary: {
      ar: "هذا الزر يخص الأموال المستحقة للعميل وليس تحصيل دفعة منه.",
      en: "This button is for money owed back to the customer, not for collecting a payment from them.",
    },
    aliases: ["refund customer credit", "refund credit", "صرف رصيد العميل"],
  },
  {
    id: "sales_orders.detail_status",
    pageKey: "sales_orders",
    kind: "status",
    label: {
      ar: "حالة أمر البيع",
      en: "Sales order status",
    },
    purpose: {
      ar: "توضح هل أمر البيع ما زال قيد التجهيز، تم تحويله لفاتورة، أو لم يعد نشطًا.",
      en: "Shows whether the sales order is still being prepared, has been invoiced, or is no longer active.",
    },
    whyItExists: {
      ar: "تساعدك الحالة على فهم المرحلة بين طلب العميل والفاتورة والتحصيل.",
      en: "The status helps you understand the stage between the customer order, invoice, and collection.",
    },
    summary: {
      ar: "حالة أمر البيع تحدد أين تقف العملية قبل أو بعد الفوترة.",
      en: "The sales order status shows where the transaction stands before or after invoicing.",
    },
    aliases: ["sales order status", "order status", "حالة أمر البيع", "حالة الطلب"],
  },
  {
    id: "sales_orders.print_button",
    pageKey: "sales_orders",
    kind: "button",
    label: {
      ar: "زر طباعة أمر البيع",
      en: "Print sales order button",
    },
    purpose: {
      ar: "يعرض نسخة قابلة للطباعة من أمر البيع للمراجعة أو المشاركة.",
      en: "Shows a printable sales order copy for review or sharing.",
    },
    summary: {
      ar: "الطباعة لا تغير حالة أمر البيع.",
      en: "Printing does not change the sales order status.",
    },
    aliases: ["print sales order", "print order", "طباعة أمر البيع"],
  },
  {
    id: "sales_orders.edit_button",
    pageKey: "sales_orders",
    kind: "button",
    label: {
      ar: "زر تعديل أمر البيع",
      en: "Edit sales order button",
    },
    purpose: {
      ar: "يفتح صفحة تعديل أمر البيع عندما يكون ما زال قابلًا للتعديل حسب الحالة والصلاحية.",
      en: "Opens the sales order edit page when the order is still editable based on status and permissions.",
    },
    whatToCheck: {
      ar: "راجع أن التعديل مطلوب قبل تحويل الأمر إلى فاتورة أو متابعة الخطوات التالية.",
      en: "Check that the change is needed before the order moves to invoicing or later steps.",
    },
    summary: {
      ar: "استخدمه لتصحيح أمر البيع قبل أن يصبح مرتبطًا بخطوات لاحقة.",
      en: "Use it to correct the sales order before later steps depend on it.",
    },
    aliases: ["edit sales order", "edit order", "تعديل أمر البيع"],
  },
  {
    id: "sales_orders.summary_cards",
    pageKey: "sales_orders",
    kind: "field",
    label: {
      ar: "ملخص أمر البيع",
      en: "Sales order summary",
    },
    purpose: {
      ar: "يعرض إجمالي الفواتير والمدفوعات والمرتجعات وصافي المتبقي المرتبط بأمر البيع.",
      en: "Shows total invoices, payments, returns, and remaining balance linked to the sales order.",
    },
    whyItExists: {
      ar: "يجمع لك أثر أمر البيع في مكان واحد بدل قراءة كل تبويب منفصلًا.",
      en: "It brings the order impact into one place instead of reading each tab separately.",
    },
    summary: {
      ar: "هذا الملخص يوضح هل أمر البيع تم تحصيله أو عليه مرتجعات أو متبقي.",
      en: "This summary shows whether the order has been collected, returned, or still has a balance.",
    },
    aliases: ["sales order summary", "order summary", "ملخص أمر البيع", "صافي المتبقي"],
  },
  {
    id: "sales_orders.order_information",
    pageKey: "sales_orders",
    kind: "field",
    label: {
      ar: "معلومات أمر البيع",
      en: "Sales order information",
    },
    purpose: {
      ar: "تعرض رقم الأمر والتاريخ والعملة وشركة الشحن والإجمالي.",
      en: "Shows the order number, date, currency, shipping company, and total.",
    },
    whatToCheck: {
      ar: "راجع هذه البيانات عند مقارنة أمر البيع بالفاتورة المرتبطة.",
      en: "Review this information when comparing the sales order with linked invoices.",
    },
    summary: {
      ar: "هذا القسم هو بطاقة تعريف أمر البيع.",
      en: "This section is the sales order identity card.",
    },
    aliases: ["order information", "order details", "معلومات الأمر", "معلومات أمر البيع"],
  },
  {
    id: "sales_orders.customer",
    pageKey: "sales_orders",
    kind: "field",
    label: {
      ar: "عميل أمر البيع",
      en: "Sales order customer",
    },
    purpose: {
      ar: "يوضح العميل الذي صدر له أمر البيع وتظهر له الفواتير والمدفوعات اللاحقة.",
      en: "Shows the customer this sales order belongs to and who receives the later invoices and payments.",
    },
    summary: {
      ar: "اختيار العميل الصحيح يربط كل الدورة من الطلب حتى التحصيل.",
      en: "The correct customer links the whole cycle from order to collection.",
    },
    aliases: ["sales order customer", "customer", "عميل أمر البيع", "العميل"],
  },
  {
    id: "sales_orders.items_tab",
    pageKey: "sales_orders",
    kind: "field",
    label: {
      ar: "تبويب العناصر",
      en: "Items tab",
    },
    purpose: {
      ar: "يعرض المنتجات أو الخدمات الموجودة في أمر البيع مع الكمية والسعر والإجمالي.",
      en: "Shows the products or services in the sales order with quantity, price, and total.",
    },
    summary: {
      ar: "هذا التبويب يوضح ما طلبه العميل فعليًا.",
      en: "This tab shows what the customer actually ordered.",
    },
    aliases: ["items tab", "order items", "تبويب العناصر", "عناصر الأمر"],
  },
  {
    id: "sales_orders.linked_invoices_tab",
    pageKey: "sales_orders",
    kind: "field",
    label: {
      ar: "تبويب الفواتير المرتبطة",
      en: "Linked invoices tab",
    },
    purpose: {
      ar: "يعرض الفواتير التي تم إنشاؤها من أمر البيع وحالتها وقيمتها.",
      en: "Shows invoices created from this sales order, including their status and amount.",
    },
    afterAction: {
      ar: "من هنا تفهم هل تم تحويل الطلب إلى فاتورة وما المرحلة التي وصلت لها.",
      en: "From here you can see whether the order has been invoiced and what stage it reached.",
    },
    summary: {
      ar: "هذا التبويب هو الرابط بين أمر البيع والفاتورة.",
      en: "This tab connects the sales order to its invoice.",
    },
    aliases: ["linked invoices", "invoices tab", "الفواتير المرتبطة", "تبويب الفواتير"],
  },
  {
    id: "sales_orders.payments_tab",
    pageKey: "sales_orders",
    kind: "field",
    label: {
      ar: "تبويب المدفوعات",
      en: "Payments tab",
    },
    purpose: {
      ar: "يعرض المبالغ التي تم تحصيلها ضمن دورة أمر البيع.",
      en: "Shows payments collected within this sales order cycle.",
    },
    summary: {
      ar: "يساعدك على مقارنة ما تم تحصيله بما تم فوترته.",
      en: "It helps compare collected amounts with invoiced amounts.",
    },
    aliases: ["payments tab", "payments", "تبويب المدفوعات", "المدفوعات"],
  },
  {
    id: "sales_orders.returns_tab",
    pageKey: "sales_orders",
    kind: "field",
    label: {
      ar: "تبويب المرتجعات",
      en: "Returns tab",
    },
    purpose: {
      ar: "يعرض المرتجعات التي أثرت على أمر البيع أو فواتيره.",
      en: "Shows returns that affected the sales order or its invoices.",
    },
    summary: {
      ar: "هذا التبويب يوضح أثر المرتجعات على دورة البيع.",
      en: "This tab explains how returns affected the sales cycle.",
    },
    aliases: ["returns tab", "returns", "تبويب المرتجعات", "المرتجعات"],
  },
  {
    id: "sales_return_requests.status_filter",
    pageKey: "sales_return_requests",
    kind: "field",
    label: {
      ar: "فلتر حالة طلب المرتجع",
      en: "Return request status filter",
    },
    purpose: {
      ar: "يساعدك على عرض طلبات المرتجع حسب مرحلتها: بانتظار الإدارة، بانتظار المخزن، مكتملة، أو مرفوضة.",
      en: "Helps you view return requests by stage: waiting for management, waiting for warehouse, completed, or rejected.",
    },
    summary: {
      ar: "استخدمه للتركيز على الطلبات التي تحتاج متابعة الآن.",
      en: "Use it to focus on requests that need follow-up now.",
    },
    aliases: ["status filter", "filter", "فلتر الحالة", "حالة الطلب"],
  },
  {
    id: "sales_return_requests.summary_cards",
    pageKey: "sales_return_requests",
    kind: "field",
    label: {
      ar: "بطاقات ملخص المرتجعات",
      en: "Return request summary cards",
    },
    purpose: {
      ar: "تعرض عدد الطلبات في كل مرحلة حتى تعرف أين يوجد الضغط التشغيلي.",
      en: "Shows how many requests are in each stage so you can see where operational follow-up is needed.",
    },
    summary: {
      ar: "هذه البطاقات تعطيك نظرة سريعة على حالة طلبات المرتجع.",
      en: "These cards give a quick view of return request status.",
    },
    aliases: ["summary cards", "return summary", "بطاقات الملخص", "ملخص المرتجعات"],
  },
  {
    id: "sales_return_requests.requests_table",
    pageKey: "sales_return_requests",
    kind: "field",
    label: {
      ar: "جدول طلبات المرتجع",
      en: "Return requests table",
    },
    purpose: {
      ar: "يعرض كل طلب مرتجع مع الفاتورة والعميل والنوع والقيمة والحالة والإجراء المتاح.",
      en: "Shows each return request with invoice, customer, type, amount, status, and available action.",
    },
    whatToCheck: {
      ar: "راجع الفاتورة والعميل والنوع والقيمة قبل الاعتماد أو الرفض.",
      en: "Review invoice, customer, type, and amount before approving or rejecting.",
    },
    summary: {
      ar: "هذا الجدول هو مكان متابعة طلبات المرتجع واتخاذ القرار المناسب.",
      en: "This table is where return requests are reviewed and acted on.",
    },
    aliases: ["requests table", "return requests", "جدول الطلبات", "طلبات المرتجع"],
  },
  {
    id: "sales_return_requests.status.pending_management",
    pageKey: "sales_return_requests",
    kind: "status",
    label: {
      ar: "بانتظار الإدارة",
      en: "Waiting for management",
    },
    purpose: {
      ar: "تعني أن الطلب ما زال يحتاج مراجعة واعتمادًا إداريًا قبل انتقاله للمخزن.",
      en: "Means the request still needs management review before moving to warehouse confirmation.",
    },
    summary: {
      ar: "هذه هي أول بوابة اعتماد لطلب المرتجع.",
      en: "This is the first approval gate for the return request.",
    },
    aliases: ["waiting for management", "management approval", "بانتظار الإدارة"],
  },
  {
    id: "sales_return_requests.status.pending_warehouse",
    pageKey: "sales_return_requests",
    kind: "status",
    label: {
      ar: "بانتظار المخزن",
      en: "Waiting for warehouse",
    },
    purpose: {
      ar: "تعني أن الإدارة وافقت، والطلب ينتظر تأكيد المخزن لاستلام أو مراجعة البضاعة.",
      en: "Means management approved the request and the warehouse must confirm the goods step.",
    },
    summary: {
      ar: "هذه المرحلة تربط قرار المرتجع بحركة البضاعة.",
      en: "This stage connects the return decision to the goods movement.",
    },
    aliases: ["waiting for warehouse", "warehouse confirmation", "بانتظار المخزن"],
  },
  {
    id: "sales_return_requests.status.completed",
    pageKey: "sales_return_requests",
    kind: "status",
    label: {
      ar: "مكتمل",
      en: "Completed",
    },
    purpose: {
      ar: "تعني أن طلب المرتجع تم اعتماده وتنفيذه حسب مساره.",
      en: "Means the return request was approved and completed through its process.",
    },
    summary: {
      ar: "الطلب اكتمل ولم يعد ينتظر إجراءً أساسيًا.",
      en: "The request is complete and no longer waiting for a main action.",
    },
    aliases: ["completed", "مكتمل"],
  },
  {
    id: "sales_return_requests.status.rejected",
    pageKey: "sales_return_requests",
    kind: "status",
    label: {
      ar: "مرفوض",
      en: "Rejected",
    },
    purpose: {
      ar: "تعني أن الطلب توقف بسبب رفض من الإدارة أو المخزن مع سبب يجب مراجعته.",
      en: "Means the request stopped because management or warehouse rejected it, with a reason to review.",
    },
    summary: {
      ar: "راجع سبب الرفض قبل إعادة المحاولة أو التواصل مع المسؤول.",
      en: "Review the rejection reason before trying again or contacting the responsible person.",
    },
    aliases: ["rejected", "مرفوض"],
  },
  {
    id: "sales_return_requests.management_approve_button",
    pageKey: "sales_return_requests",
    kind: "button",
    label: {
      ar: "زر اعتماد الإدارة",
      en: "Management approve button",
    },
    purpose: {
      ar: "ينقل طلب المرتجع من مراجعة الإدارة إلى خطوة المخزن دون تنفيذ الأثر النهائي بعد.",
      en: "Moves the return request from management review to the warehouse step without completing the final effect yet.",
    },
    whatToCheck: {
      ar: "راجع الفاتورة والعميل ونوع المرتجع والقيمة قبل الاعتماد.",
      en: "Review invoice, customer, return type, and amount before approval.",
    },
    afterAction: {
      ar: "بعد الاعتماد ينتظر الطلب إجراء المخزن.",
      en: "After approval, the request waits for the warehouse action.",
    },
    summary: {
      ar: "اعتماد الإدارة يسمح للطلب بالانتقال للمرحلة التالية فقط.",
      en: "Management approval lets the request move to the next stage only.",
    },
    aliases: ["management approve", "approve return", "اعتماد الإدارة"],
  },
  {
    id: "sales_return_requests.management_reject_button",
    pageKey: "sales_return_requests",
    kind: "button",
    label: {
      ar: "زر رفض الإدارة",
      en: "Management reject button",
    },
    purpose: {
      ar: "يرفض طلب المرتجع من مرحلة الإدارة ويوقف انتقاله للمخزن.",
      en: "Rejects the return request at management review and stops it from moving to the warehouse step.",
    },
    whatToCheck: {
      ar: "اكتب سببًا واضحًا حتى يعرف صاحب الطلب ما الذي يحتاج مراجعة.",
      en: "Write a clear reason so the requester knows what needs review.",
    },
    summary: {
      ar: "الرفض يحتاج سببًا واضحًا لأنه يوقف الطلب.",
      en: "Rejection needs a clear reason because it stops the request.",
    },
    aliases: ["management reject", "reject return", "رفض الإدارة", "رفض"],
  },
  {
    id: "sales_return_requests.warehouse_approve_button",
    pageKey: "sales_return_requests",
    kind: "button",
    label: {
      ar: "زر اعتماد المخزن",
      en: "Warehouse approve button",
    },
    purpose: {
      ar: "يؤكد خطوة المخزن ويستكمل تنفيذ المرتجع بعد موافقة الإدارة.",
      en: "Confirms the warehouse step and completes the return after management approval.",
    },
    whatToCheck: {
      ar: "راجع البنود والكميات المستلمة قبل التأكيد.",
      en: "Review returned items and quantities before confirming.",
    },
    afterAction: {
      ar: "بعد التأكيد تكتمل عملية المرتجع حسب الدورة.",
      en: "After confirmation, the return process is completed according to the workflow.",
    },
    summary: {
      ar: "هذه خطوة المخزن النهائية في طلب المرتجع.",
      en: "This is the warehouse final step in the return request.",
    },
    aliases: ["warehouse approve", "approve warehouse", "اعتماد المخزن"],
  },
  {
    id: "sales_return_requests.warehouse_reject_button",
    pageKey: "sales_return_requests",
    kind: "button",
    label: {
      ar: "زر رفض المخزن",
      en: "Warehouse reject button",
    },
    purpose: {
      ar: "يرفض طلب المرتجع من جهة المخزن إذا كانت البضاعة أو الكمية غير مناسبة للاستلام.",
      en: "Rejects the return request from the warehouse side when goods or quantities are not acceptable.",
    },
    whatToCheck: {
      ar: "اكتب سببًا واضحًا مثل اختلاف الكمية أو عدم استلام البضاعة.",
      en: "Write a clear reason such as quantity mismatch or goods not received.",
    },
    summary: {
      ar: "رفض المخزن يوضح أن خطوة البضاعة لم تكتمل.",
      en: "Warehouse rejection means the goods step could not be completed.",
    },
    aliases: ["warehouse reject", "reject warehouse", "رفض المخزن"],
  },
  {
    id: "sales_return_requests.rejection_reason",
    pageKey: "sales_return_requests",
    kind: "field",
    label: {
      ar: "سبب الرفض",
      en: "Rejection reason",
    },
    purpose: {
      ar: "يوضح لماذا تم رفض طلب المرتجع حتى يستطيع صاحب الطلب معرفة ما يلزم تصحيحه.",
      en: "Explains why the return request was rejected so the requester knows what needs correction.",
    },
    whatToCheck: {
      ar: "اكتب سببًا مهنيًا ومحددًا بدل عبارة عامة.",
      en: "Write a professional and specific reason instead of a generic phrase.",
    },
    summary: {
      ar: "سبب الرفض يجعل القرار مفهومًا وقابلًا للمتابعة.",
      en: "The rejection reason makes the decision understandable and followable.",
    },
    aliases: ["rejection reason", "reason", "سبب الرفض"],
  },
  {
    id: "sales_return_requests.confirm_action_button",
    pageKey: "sales_return_requests",
    kind: "button",
    label: {
      ar: "زر تأكيد إجراء المرتجع",
      en: "Confirm return action button",
    },
    purpose: {
      ar: "يثبت القرار الذي اخترته في نافذة طلب المرتجع: اعتماد أو رفض.",
      en: "Confirms the decision selected in the return request dialog: approve or reject.",
    },
    whatToCheck: {
      ar: "راجع عنوان النافذة والطلب والسبب قبل التأكيد.",
      en: "Review the dialog title, request details, and reason before confirming.",
    },
    summary: {
      ar: "هذا الزر هو آخر خطوة قبل حفظ قرارك على طلب المرتجع.",
      en: "This button is the last step before saving your decision on the return request.",
    },
    aliases: ["confirm", "confirm action", "تأكيد", "تأكيد الرفض"],
  },
  {
    id: "purchase_orders.detail_status",
    pageKey: "purchase_orders",
    kind: "status",
    label: {
      ar: "حالة أمر الشراء",
      en: "Purchase order status",
    },
    purpose: {
      ar: "توضح أين وصل أمر الشراء: هل ما زال مسودة، ينتظر اعتمادًا، أرسل للمورد، تم استلامه، أو تمت فوترته.",
      en: "Shows where the purchase order stands: draft, waiting for approval, sent to the supplier, received, or billed.",
    },
    whatToCheck: {
      ar: "راجع الحالة قبل اتخاذ أي إجراء حتى تعرف هل الخطوة التالية هي الإرسال أو الاستلام أو إنشاء فاتورة المورد.",
      en: "Check the status before acting so you know whether the next step is sending, receiving, or creating the supplier bill.",
    },
    summary: {
      ar: "الحالة تساعدك تعرف الخطوة الحالية وما الذي يمكن عمله بعدها.",
      en: "The status helps you understand the current step and what can happen next.",
    },
    aliases: ["po status", "purchase order status", "حالة أمر الشراء"],
  },
  {
    id: "purchase_orders.supplier",
    pageKey: "purchase_orders",
    kind: "field",
    label: {
      ar: "المورد",
      en: "Supplier",
    },
    purpose: {
      ar: "يوضح الجهة التي سيتم الشراء منها والتي سترتبط بها الفاتورة والمدفوعات والمرتجعات لاحقًا.",
      en: "Shows the party you are buying from, which later connects to the bill, payments, and returns.",
    },
    whatToCheck: {
      ar: "تأكد من اسم المورد وبيانات التواصل قبل إرسال الأمر أو إنشاء الفاتورة.",
      en: "Confirm the supplier name and contact details before sending the order or creating the bill.",
    },
    summary: {
      ar: "اختيار المورد الصحيح يحافظ على تتبع دورة الشراء بالكامل.",
      en: "Choosing the right supplier keeps the purchasing cycle traceable.",
    },
    aliases: ["supplier", "vendor", "المورد"],
  },
  {
    id: "purchase_orders.order_information",
    pageKey: "purchase_orders",
    kind: "field",
    label: {
      ar: "معلومات أمر الشراء",
      en: "Purchase order information",
    },
    purpose: {
      ar: "يجمع بيانات الأمر الأساسية مثل الرقم والتاريخ والعملة وشركة الشحن وإجمالي الأمر.",
      en: "Collects the order basics such as number, date, currency, shipping company, and order total.",
    },
    whatToCheck: {
      ar: "راجع التاريخ والإجمالي والعملة وأي سبب رفض ظاهر قبل متابعة الدورة.",
      en: "Review the date, total, currency, and any visible rejection reason before moving forward.",
    },
    summary: {
      ar: "هذا القسم هو بطاقة تعريف أمر الشراء ومراجعة أرقامه الرئيسية.",
      en: "This section is the purchase order identity card and main-number review.",
    },
    aliases: ["order information", "po information", "معلومات الأمر"],
  },
  {
    id: "purchase_orders.summary_cards",
    pageKey: "purchase_orders",
    kind: "field",
    label: {
      ar: "ملخص الفوترة والسداد والمرتجعات",
      en: "Billing, payment, and return summary",
    },
    purpose: {
      ar: "يعرض بسرعة ما تم تحويله إلى فواتير، وما تم دفعه، وما تم إرجاعه، وما تبقى على العملية.",
      en: "Quickly shows what has been billed, paid, returned, and what remains on the transaction.",
    },
    whatToCheck: {
      ar: "استخدمه لمعرفة هل أمر الشراء ما زال يحتاج فاتورة أو دفع أو متابعة مرتجع.",
      en: "Use it to see whether the purchase order still needs a bill, payment, or return follow-up.",
    },
    summary: {
      ar: "الملخص يعطيك صورة مالية مختصرة لأمر الشراء.",
      en: "The summary gives a short financial picture of the purchase order.",
    },
    aliases: ["summary", "totals", "ملخص", "الإجماليات"],
  },
  {
    id: "purchase_orders.items_tab",
    pageKey: "purchase_orders",
    kind: "field",
    label: {
      ar: "تبويب البنود",
      en: "Items tab",
    },
    purpose: {
      ar: "يعرض المنتجات أو الخدمات المطلوبة وكمياتها وأسعارها وما تم فوترته منها.",
      en: "Shows requested products or services, their quantities, prices, and how much has already been billed.",
    },
    whatToCheck: {
      ar: "راجع الكميات والأسعار والكميات المفوترة قبل إنشاء فاتورة مورد أو متابعة الاستلام.",
      en: "Review quantities, prices, and billed quantities before creating a supplier bill or following receipt.",
    },
    summary: {
      ar: "تبويب البنود يوضح ما طلبته فعليًا من المورد.",
      en: "The items tab shows what you actually requested from the supplier.",
    },
    aliases: ["items tab", "بنود", "items"],
  },
  {
    id: "purchase_orders.linked_bills_tab",
    pageKey: "purchase_orders",
    kind: "field",
    label: {
      ar: "تبويب فواتير المورد المرتبطة",
      en: "Linked supplier bills tab",
    },
    purpose: {
      ar: "يعرض الفواتير التي تم إنشاؤها بناءً على أمر الشراء حتى لا تتكرر الفوترة لنفس البنود.",
      en: "Shows bills created from the purchase order so the same items are not billed twice.",
    },
    whatToCheck: {
      ar: "راجع رقم الفاتورة والمبلغ والحالة لمعرفة ما تم تسجيله بالفعل.",
      en: "Review bill number, amount, and status to see what has already been entered.",
    },
    summary: {
      ar: "هذا التبويب يربط أمر الشراء بفواتير المورد التابعة له.",
      en: "This tab connects the purchase order to its supplier bills.",
    },
    aliases: ["linked bills", "bills tab", "الفواتير"],
  },
  {
    id: "purchase_orders.payments_tab",
    pageKey: "purchase_orders",
    kind: "field",
    label: {
      ar: "تبويب المدفوعات",
      en: "Payments tab",
    },
    purpose: {
      ar: "يعرض الدفعات المرتبطة بفواتير هذا الأمر حتى تعرف ما دفع للمورد.",
      en: "Shows payments connected to this order's bills so you know what was paid to the supplier.",
    },
    whatToCheck: {
      ar: "راجع تاريخ الدفع والمبلغ والطريقة عند متابعة المتبقي للمورد.",
      en: "Review payment date, amount, and method when following up on what remains for the supplier.",
    },
    summary: {
      ar: "تبويب المدفوعات يساعدك تتابع ما دفع وما لا يزال مستحقًا.",
      en: "The payments tab helps track what has been paid and what is still due.",
    },
    aliases: ["payments tab", "payments", "المدفوعات"],
  },
  {
    id: "purchase_orders.returns_tab",
    pageKey: "purchase_orders",
    kind: "field",
    label: {
      ar: "تبويب المرتجعات",
      en: "Returns tab",
    },
    purpose: {
      ar: "يعرض مرتجعات المشتريات المرتبطة بأمر الشراء، مع المبلغ والسبب والتاريخ.",
      en: "Shows purchase returns connected to the order, including amount, reason, and date.",
    },
    whatToCheck: {
      ar: "راجع المرتجعات قبل الحكم على المتبقي أو قبل إنشاء متابعة مالية للمورد.",
      en: "Review returns before judging the remaining balance or creating supplier financial follow-up.",
    },
    summary: {
      ar: "هذا التبويب يوضح أثر المرتجعات على أمر الشراء.",
      en: "This tab shows the effect of returns on the purchase order.",
    },
    aliases: ["returns tab", "returns", "المرتجعات"],
  },
  {
    id: "purchase_orders.print_button",
    pageKey: "purchase_orders",
    kind: "button",
    label: {
      ar: "زر طباعة أمر الشراء",
      en: "Print purchase order button",
    },
    purpose: {
      ar: "يفتح نسخة مناسبة للطباعة أو المشاركة الورقية من أمر الشراء.",
      en: "Opens a print-friendly version of the purchase order.",
    },
    whatToCheck: {
      ar: "راجع المورد والبنود والإجمالي قبل الطباعة.",
      en: "Review supplier, items, and total before printing.",
    },
    summary: {
      ar: "استخدمه عندما تحتاج نسخة رسمية أو ورقية من أمر الشراء.",
      en: "Use it when you need an official or paper copy of the purchase order.",
    },
    aliases: ["print purchase order", "print po", "طباعة"],
  },
  {
    id: "purchase_orders.create_bill_button",
    pageKey: "purchase_orders",
    kind: "button",
    label: {
      ar: "زر إنشاء فاتورة مورد",
      en: "Create supplier bill button",
    },
    purpose: {
      ar: "ينشئ فاتورة مورد من البنود المتبقية في أمر الشراء حتى تبدأ متابعة الاستحقاق والدفع.",
      en: "Creates a supplier bill from the remaining order items so the payable and payment follow-up can start.",
    },
    whatToCheck: {
      ar: "تأكد أن البضاعة أو الخدمة مرتبطة بهذا الأمر وأن البنود لم تتم فوترتها بالكامل من قبل.",
      en: "Confirm the goods or service belongs to this order and that the items have not already been fully billed.",
    },
    afterAction: {
      ar: "بعد الضغط ستنتقل إلى إنشاء فاتورة مورد مرتبطة بأمر الشراء.",
      en: "After pressing it, you move to creating a supplier bill linked to the purchase order.",
    },
    summary: {
      ar: "هذا الزر يحول أمر الشراء إلى فاتورة مورد قابلة للمتابعة والدفع.",
      en: "This button turns the purchase order into a supplier bill for follow-up and payment.",
    },
    aliases: ["create bill", "supplier bill", "إنشاء فاتورة"],
  },
  {
    id: "purchase_orders.edit_button",
    pageKey: "purchase_orders",
    kind: "button",
    label: {
      ar: "زر تعديل أمر الشراء",
      en: "Edit purchase order button",
    },
    purpose: {
      ar: "يسمح بتعديل أمر الشراء عندما تكون الدورة ما زالت تقبل التغيير أو عند الحاجة لتصحيح طلب مرفوض.",
      en: "Allows editing the purchase order when the cycle still accepts changes or a rejected order needs correction.",
    },
    whatToCheck: {
      ar: "لا تعدل إلا بعد مراجعة البنود والمورد والإجماليات حتى لا تتغير عملية شراء تم الاعتماد عليها.",
      en: "Only edit after reviewing items, supplier, and totals so a relied-on purchase process is not changed by mistake.",
    },
    summary: {
      ar: "التعديل مخصص للتصحيح قبل اكتمال الدورة أو بعد الرفض.",
      en: "Editing is for correction before the cycle is completed or after rejection.",
    },
    aliases: ["edit po", "edit purchase order", "تعديل"],
  },
  {
    id: "purchase_orders.mark_sent_button",
    pageKey: "purchase_orders",
    kind: "button",
    label: {
      ar: "زر تحديد كمرسل",
      en: "Mark as sent button",
    },
    purpose: {
      ar: "يوضح أن أمر الشراء خرج من مرحلة التحضير وأصبح مرسلًا للمورد للمتابعة.",
      en: "Shows that the purchase order has moved from preparation to being sent to the supplier.",
    },
    whatToCheck: {
      ar: "راجع المورد والبنود والكميات قبل اعتباره مرسلًا.",
      en: "Review supplier, items, and quantities before marking it as sent.",
    },
    afterAction: {
      ar: "بعد ذلك تصبح الخطوة التالية عادة متابعة الاستلام أو الفاتورة حسب دورة العمل.",
      en: "After that, the next step is usually following receipt or billing based on the workflow.",
    },
    summary: {
      ar: "هذا الزر ينقل أمر الشراء من التحضير إلى المتابعة مع المورد.",
      en: "This button moves the purchase order from preparation to supplier follow-up.",
    },
    aliases: ["mark as sent", "sent to supplier", "مرسل"],
  },
  {
    id: "purchase_orders.receive_items_button",
    pageKey: "purchase_orders",
    kind: "button",
    label: {
      ar: "زر استلام البضاعة",
      en: "Receive items button",
    },
    purpose: {
      ar: "يسجل أن البضاعة المطلوبة وصلت أو أصبحت جاهزة للمتابعة داخل دورة الشراء.",
      en: "Marks that the requested goods arrived or are ready to continue in the purchase cycle.",
    },
    whatToCheck: {
      ar: "راجع الكميات المستلمة مقابل البنود المطلوبة قبل التأكيد.",
      en: "Review received quantities against requested items before confirming.",
    },
    summary: {
      ar: "الاستلام يثبت خطوة وصول البضاعة قبل إكمال الفاتورة أو الدفع.",
      en: "Receiving confirms the goods step before completing billing or payment.",
    },
    aliases: ["receive items", "goods received", "استلام"],
  },
  {
    id: "purchase_orders.approve_button",
    pageKey: "purchase_orders",
    kind: "button",
    label: {
      ar: "زر اعتماد أمر الشراء",
      en: "Approve purchase order button",
    },
    purpose: {
      ar: "يعتمد أمر الشراء حتى ينتقل من طلب ينتظر مراجعة إلى عملية يمكن متابعتها مع المورد.",
      en: "Approves the purchase order so it moves from review into a process that can be followed with the supplier.",
    },
    whatToCheck: {
      ar: "راجع المورد والبنود والإجمالي وسبب الشراء قبل الاعتماد.",
      en: "Review supplier, items, total, and purchase reason before approval.",
    },
    afterAction: {
      ar: "بعد الاعتماد يمكن إرسال الأمر أو متابعة الاستلام والفوترة حسب الصلاحيات والدورة.",
      en: "After approval, the order can be sent or followed through receipt and billing based on permissions and workflow.",
    },
    summary: {
      ar: "الاعتماد يعني أن أمر الشراء مقبول للتنفيذ.",
      en: "Approval means the purchase order is accepted for execution.",
    },
    aliases: ["approve po", "approve purchase order", "اعتماد"],
  },
  {
    id: "purchase_orders.reject_button",
    pageKey: "purchase_orders",
    kind: "button",
    label: {
      ar: "زر رفض أمر الشراء",
      en: "Reject purchase order button",
    },
    purpose: {
      ar: "يرفض أمر الشراء إذا كانت بياناته غير مناسبة أو تحتاج تصحيحًا قبل التنفيذ.",
      en: "Rejects the purchase order when its details are not suitable or need correction before execution.",
    },
    whatToCheck: {
      ar: "اكتب سببًا واضحًا يشرح ما يحتاج تعديله مثل المورد أو الكمية أو السعر.",
      en: "Write a clear reason explaining what needs change, such as supplier, quantity, or price.",
    },
    summary: {
      ar: "الرفض يوقف الأمر ويطلب تصحيحًا مفهومًا.",
      en: "Rejection stops the order and asks for a clear correction.",
    },
    aliases: ["reject po", "reject purchase order", "رفض"],
  },
  {
    id: "purchase_orders.rejection_reason",
    pageKey: "purchase_orders",
    kind: "field",
    label: {
      ar: "سبب رفض أمر الشراء",
      en: "Purchase order rejection reason",
    },
    purpose: {
      ar: "يوضح لماذا تم رفض الأمر حتى يعرف صاحب الطلب ما الذي يجب مراجعته.",
      en: "Explains why the order was rejected so the requester knows what to review.",
    },
    whatToCheck: {
      ar: "اكتب سببًا محددًا ومهنيًا بدل عبارة عامة.",
      en: "Write a specific and professional reason instead of a generic phrase.",
    },
    summary: {
      ar: "سبب الرفض يجعل القرار قابلًا للفهم والمتابعة.",
      en: "The rejection reason makes the decision understandable and followable.",
    },
    aliases: ["rejection reason", "reason", "سبب الرفض"],
  },
  {
    id: "purchase_orders.confirm_rejection_button",
    pageKey: "purchase_orders",
    kind: "button",
    label: {
      ar: "زر تأكيد رفض أمر الشراء",
      en: "Confirm purchase order rejection button",
    },
    purpose: {
      ar: "يحفظ قرار الرفض والسبب المكتوب على أمر الشراء.",
      en: "Saves the rejection decision and written reason on the purchase order.",
    },
    whatToCheck: {
      ar: "راجع السبب قبل التأكيد لأنه سيظهر لصاحب الطلب عند المتابعة.",
      en: "Review the reason before confirming because it will be visible to the requester during follow-up.",
    },
    summary: {
      ar: "هذا آخر تأكيد قبل إيقاف أمر الشراء بسبب الرفض.",
      en: "This is the final confirmation before stopping the purchase order due to rejection.",
    },
    aliases: ["confirm rejection", "تأكيد الرفض"],
  },
  {
    id: "bills.detail_status",
    pageKey: "bills",
    kind: "status",
    label: {
      ar: "حالة فاتورة المورد",
      en: "Supplier bill status",
    },
    purpose: {
      ar: "توضح مرحلة الفاتورة: مسودة، بانتظار اعتماد، معتمدة، بانتظار الاستلام، مدفوعة جزئيًا، مدفوعة، أو مرفوضة.",
      en: "Shows the bill stage: draft, waiting for approval, approved, waiting for receipt, partially paid, paid, or rejected.",
    },
    whatToCheck: {
      ar: "استخدم الحالة لمعرفة هل الخطوة التالية اعتماد، استلام، دفع، أو مراجعة سبب رفض.",
      en: "Use the status to know whether the next step is approval, receipt, payment, or reviewing a rejection reason.",
    },
    summary: {
      ar: "حالة الفاتورة تختصر لك أين تقف فاتورة المورد الآن.",
      en: "The bill status summarizes where the supplier bill stands now.",
    },
    aliases: ["bill status", "supplier bill status", "حالة الفاتورة"],
  },
  {
    id: "bills.receipt_status",
    pageKey: "bills",
    kind: "status",
    label: {
      ar: "حالة استلام البضاعة",
      en: "Goods receipt status",
    },
    purpose: {
      ar: "توضح هل تم تأكيد استلام البضاعة، أو ما زالت تنتظر مراجعة المخزن، أو تم رفض الاستلام.",
      en: "Shows whether goods receipt has been confirmed, is waiting for warehouse review, or was rejected.",
    },
    whatToCheck: {
      ar: "راجعها قبل الدفع أو إنشاء مرتجع لأنها تؤكد خطوة وصول البضاعة.",
      en: "Review it before payment or return creation because it confirms the goods arrival step.",
    },
    summary: {
      ar: "هذه الحالة تربط فاتورة المورد بخطوة استلام البضاعة.",
      en: "This status connects the supplier bill to the goods receipt step.",
    },
    aliases: ["receipt status", "goods receipt", "حالة الاستلام"],
  },
  {
    id: "bills.supplier",
    pageKey: "bills",
    kind: "field",
    label: {
      ar: "المورد",
      en: "Supplier",
    },
    purpose: {
      ar: "يوضح المورد الذي صدرت منه الفاتورة والذي ستظهر له المبالغ المستحقة أو المدفوعة.",
      en: "Shows the supplier who issued the bill and carries the due or paid amounts.",
    },
    whatToCheck: {
      ar: "تأكد أن المورد يطابق أمر الشراء والمستند الورقي أو الإلكتروني من المورد.",
      en: "Confirm the supplier matches the purchase order and the supplier document.",
    },
    summary: {
      ar: "المورد الصحيح يعني أن المديونية والمدفوعات ستذهب للحساب الصحيح.",
      en: "The correct supplier means the payable and payments go to the right account.",
    },
    aliases: ["supplier", "vendor", "المورد"],
  },
  {
    id: "bills.bill_information",
    pageKey: "bills",
    kind: "field",
    label: {
      ar: "معلومات فاتورة المورد",
      en: "Supplier bill information",
    },
    purpose: {
      ar: "يعرض تاريخ الفاتورة وتاريخ الاستحقاق والعملة وطريقة احتساب الضريبة.",
      en: "Shows bill date, due date, currency, and how tax is treated.",
    },
    whatToCheck: {
      ar: "راجع تاريخ الاستحقاق والعملة قبل الاعتماد أو الدفع.",
      en: "Review due date and currency before approval or payment.",
    },
    summary: {
      ar: "هذه المعلومات تحدد متى وكم ستدفع للمورد.",
      en: "This information defines when and how much you pay the supplier.",
    },
    aliases: ["bill information", "bill details", "معلومات الفاتورة"],
  },
  {
    id: "bills.items",
    pageKey: "bills",
    kind: "field",
    label: {
      ar: "بنود فاتورة المورد",
      en: "Supplier bill items",
    },
    purpose: {
      ar: "يعرض ما تمت فوترته من منتجات أو خدمات مع الكمية والسعر والضريبة والمرتجع إن وجد.",
      en: "Shows billed products or services with quantity, price, tax, and any returned quantity.",
    },
    whatToCheck: {
      ar: "قارن البنود مع أمر الشراء والاستلام قبل الاعتماد أو إنشاء مرتجع.",
      en: "Compare items with the purchase order and receipt before approval or creating a return.",
    },
    summary: {
      ar: "بنود الفاتورة هي التفاصيل العملية لما يطالب به المورد.",
      en: "Bill items are the practical detail of what the supplier is charging for.",
    },
    aliases: ["bill items", "items", "بنود"],
  },
  {
    id: "bills.financial_summary",
    pageKey: "bills",
    kind: "field",
    label: {
      ar: "ملخص فاتورة المورد",
      en: "Supplier bill summary",
    },
    purpose: {
      ar: "يوضح إجمالي الفاتورة والمدفوع والمرتجعات والصافي المتبقي أو الرصيد الدائن.",
      en: "Shows bill total, paid amount, returns, and the net remaining or credit balance.",
    },
    whatToCheck: {
      ar: "راجعه قبل إضافة دفعة أو إنشاء مرتجع حتى تعرف أثر العملية على المتبقي.",
      en: "Review it before adding a payment or creating a return so you understand the effect on the remaining amount.",
    },
    summary: {
      ar: "الملخص المالي يوضح ما تم دفعه وما تبقى للمورد.",
      en: "The financial summary shows what has been paid and what remains for the supplier.",
    },
    aliases: ["financial summary", "summary", "المتبقي", "الإجمالي"],
  },
  {
    id: "bills.add_payment_button",
    pageKey: "bills",
    kind: "button",
    label: {
      ar: "زر إضافة دفعة للمورد",
      en: "Add supplier payment button",
    },
    purpose: {
      ar: "ينقلك إلى تسجيل مبلغ تم دفعه للمورد مقابل هذه الفاتورة.",
      en: "Takes you to enter an amount paid to the supplier for this bill.",
    },
    whatToCheck: {
      ar: "راجع المتبقي وطريقة الدفع والمرجع قبل تسجيل الدفعة.",
      en: "Review the remaining amount, payment method, and reference before adding the payment.",
    },
    afterAction: {
      ar: "بعد حفظ الدفعة يتغير المدفوع والمتبقي حسب المبلغ.",
      en: "After saving the payment, paid and remaining amounts change based on the amount.",
    },
    summary: {
      ar: "استخدمه عندما تدفع جزءًا أو كامل مستحقات المورد.",
      en: "Use it when you pay part or all of what is due to the supplier.",
    },
    aliases: ["add payment", "pay supplier", "إضافة دفعة"],
  },
  {
    id: "bills.payments_table",
    pageKey: "bills",
    kind: "field",
    label: {
      ar: "جدول المدفوعات",
      en: "Payments table",
    },
    purpose: {
      ar: "يعرض الدفعات المسجلة على فاتورة المورد وتاريخ كل دفعة وطريقتها ومبلغها.",
      en: "Shows payments entered against the supplier bill, including date, method, and amount.",
    },
    whatToCheck: {
      ar: "راجع الجدول عند التحقق من سبب وجود مبلغ متبق أو رصيد دائن.",
      en: "Review the table when checking why a remaining amount or credit balance exists.",
    },
    summary: {
      ar: "جدول المدفوعات يشرح كيف وصلنا إلى إجمالي المدفوع.",
      en: "The payments table explains how the total paid amount was reached.",
    },
    aliases: ["payments table", "payments", "المدفوعات"],
  },
  {
    id: "bills.returns_table",
    pageKey: "bills",
    kind: "field",
    label: {
      ar: "قسم المرتجعات والإشعارات الدائنة",
      en: "Returns and supplier credits section",
    },
    purpose: {
      ar: "يعرض مرتجعات الفاتورة أو أي رصيد دائن من المورد ناتج عن إرجاع بضاعة أو تسوية.",
      en: "Shows bill returns or any supplier credit created from returned goods or a settlement.",
    },
    whatToCheck: {
      ar: "راجع نوع المرتجع والمبلغ قبل حساب المتبقي أو متابعة استرداد من المورد.",
      en: "Review return type and amount before calculating what remains or following supplier refund.",
    },
    summary: {
      ar: "هذا القسم يوضح أثر المرتجعات على فاتورة المورد.",
      en: "This section shows how returns affect the supplier bill.",
    },
    aliases: ["returns", "vendor credits", "supplier credits", "المرتجعات"],
  },
  {
    id: "bills.submit_for_receipt_button",
    pageKey: "bills",
    kind: "button",
    label: {
      ar: "زر إرسال للاستلام المخزني",
      en: "Submit for goods receipt button",
    },
    purpose: {
      ar: "يرسل فاتورة المورد لخطوة المخزن حتى يتم تأكيد استلام البضاعة.",
      en: "Sends the supplier bill to the warehouse step so goods receipt can be confirmed.",
    },
    whatToCheck: {
      ar: "تأكد أن الفاتورة معتمدة وأن البنود والكميات جاهزة للمراجعة المخزنية.",
      en: "Confirm the bill is approved and the items and quantities are ready for warehouse review.",
    },
    summary: {
      ar: "هذا الزر يبدأ خطوة تأكيد استلام البضاعة.",
      en: "This button starts the goods receipt confirmation step.",
    },
    aliases: ["submit for receipt", "receipt", "إرسال للاستلام"],
  },
  {
    id: "bills.approve_button",
    pageKey: "bills",
    kind: "button",
    label: {
      ar: "زر اعتماد فاتورة المورد",
      en: "Approve supplier bill button",
    },
    purpose: {
      ar: "يعتمد فاتورة المورد بعد مراجعتها حتى تنتقل للخطوة التالية في الاستلام أو الدفع.",
      en: "Approves the supplier bill after review so it can move to receipt or payment follow-up.",
    },
    whatToCheck: {
      ar: "راجع المورد ورقم الفاتورة والتاريخ والبنود والإجمالي قبل الاعتماد.",
      en: "Review supplier, bill number, date, items, and total before approval.",
    },
    summary: {
      ar: "اعتماد الفاتورة يعني أنها مقبولة للمتابعة التشغيلية والمالية.",
      en: "Approving the bill means it is accepted for operational and financial follow-up.",
    },
    aliases: ["approve bill", "اعتماد الفاتورة"],
  },
  {
    id: "bills.reject_button",
    pageKey: "bills",
    kind: "button",
    label: {
      ar: "زر رفض فاتورة المورد",
      en: "Reject supplier bill button",
    },
    purpose: {
      ar: "يرفض الفاتورة عندما تحتاج تصحيحًا أو لا تطابق أمر الشراء أو المستندات.",
      en: "Rejects the bill when it needs correction or does not match the purchase order or documents.",
    },
    whatToCheck: {
      ar: "اكتب سببًا واضحًا يشرح المشكلة حتى يستطيع المنشئ تصحيحها.",
      en: "Write a clear reason explaining the issue so the creator can correct it.",
    },
    summary: {
      ar: "الرفض يوقف الفاتورة حتى يتم فهم المشكلة وتصحيحها.",
      en: "Rejection pauses the bill until the issue is understood and corrected.",
    },
    aliases: ["reject bill", "رفض الفاتورة"],
  },
  {
    id: "bills.approve_receipt_button",
    pageKey: "bills",
    kind: "button",
    label: {
      ar: "زر اعتماد الاستلام",
      en: "Approve receipt button",
    },
    purpose: {
      ar: "يؤكد من جهة المخزن أن البضاعة المرتبطة بفاتورة المورد تم استلامها.",
      en: "Confirms from the warehouse side that goods connected to the supplier bill were received.",
    },
    whatToCheck: {
      ar: "راجع الكميات والبنود قبل التأكيد لأنها خطوة تؤثر على متابعة المخزون والفاتورة.",
      en: "Review quantities and items before confirming because this step affects inventory and bill follow-up.",
    },
    summary: {
      ar: "اعتماد الاستلام يثبت أن خطوة البضاعة اكتملت.",
      en: "Approving receipt confirms the goods step is complete.",
    },
    aliases: ["approve receipt", "استلام"],
  },
  {
    id: "bills.reject_receipt_button",
    pageKey: "bills",
    kind: "button",
    label: {
      ar: "زر رفض الاستلام",
      en: "Reject receipt button",
    },
    purpose: {
      ar: "يرفض استلام البضاعة إذا كانت الكميات أو البنود غير مطابقة لما يجب استلامه.",
      en: "Rejects goods receipt when quantities or items do not match what should be received.",
    },
    whatToCheck: {
      ar: "اكتب سببًا واضحًا مثل اختلاف الكمية أو عدم وصول البضاعة.",
      en: "Write a clear reason such as quantity mismatch or goods not arriving.",
    },
    summary: {
      ar: "رفض الاستلام يعني أن خطوة المخزن تحتاج مراجعة قبل المتابعة.",
      en: "Receipt rejection means the warehouse step needs review before continuing.",
    },
    aliases: ["reject receipt", "رفض الاستلام"],
  },
  {
    id: "bills.partial_return_button",
    pageKey: "bills",
    kind: "button",
    label: {
      ar: "زر مرتجع مشتريات جزئي",
      en: "Partial purchase return button",
    },
    purpose: {
      ar: "يفتح نافذة إرجاع جزء من بنود فاتورة المورد فقط.",
      en: "Opens a dialog to return only part of the supplier bill items.",
    },
    whatToCheck: {
      ar: "حدد الكميات المرتجعة بدقة وتأكد أن السبب مناسب قبل الإرسال.",
      en: "Select returned quantities carefully and confirm the reason is suitable before submitting.",
    },
    summary: {
      ar: "المرتجع الجزئي مناسب عندما لا تريد إرجاع كل الفاتورة.",
      en: "A partial return is for when you do not want to return the whole bill.",
    },
    aliases: ["partial return", "مرتجع جزئي"],
  },
  {
    id: "bills.full_return_button",
    pageKey: "bills",
    kind: "button",
    label: {
      ar: "زر مرتجع مشتريات كامل",
      en: "Full purchase return button",
    },
    purpose: {
      ar: "يفتح نافذة إرجاع جميع البنود المتاحة من فاتورة المورد.",
      en: "Opens a dialog to return all available items from the supplier bill.",
    },
    whatToCheck: {
      ar: "تأكد أن قرار الإرجاع الكامل صحيح لأن أثره سيكون على كل الفاتورة.",
      en: "Confirm a full return is correct because it affects the whole bill.",
    },
    summary: {
      ar: "المرتجع الكامل يعني إرجاع كامل ما يمكن إرجاعه من الفاتورة.",
      en: "A full return means returning everything available from the bill.",
    },
    aliases: ["full return", "مرتجع كامل"],
  },
  {
    id: "bills.return_quantity",
    pageKey: "bills",
    kind: "field",
    label: {
      ar: "كمية المرتجع",
      en: "Return quantity",
    },
    purpose: {
      ar: "تحدد كمية كل بند ستتم إعادتها للمورد في هذا المرتجع.",
      en: "Sets how much of each item will be returned to the supplier in this return.",
    },
    whatToCheck: {
      ar: "لا تدخل كمية أكبر من المتاح للإرجاع، وراجع الكميات قبل الإرسال.",
      en: "Do not enter more than the available return quantity, and review quantities before submitting.",
    },
    summary: {
      ar: "كمية المرتجع هي أساس حساب قيمة المرتجع.",
      en: "Return quantity is the basis for calculating the return value.",
    },
    aliases: ["return qty", "quantity", "كمية المرتجع"],
  },
  {
    id: "bills.return_method",
    pageKey: "bills",
    kind: "field",
    label: {
      ar: "طريقة تسوية المرتجع",
      en: "Return settlement method",
    },
    purpose: {
      ar: "تحدد هل سيتم استرداد المبلغ نقدًا أو بنكيًا أو تحويله إلى رصيد على حساب المورد.",
      en: "Defines whether the amount will be refunded in cash, by bank, or kept as credit on the supplier account.",
    },
    whatToCheck: {
      ar: "اختر الطريقة التي تطابق اتفاقك مع المورد وحالة الدفع السابقة.",
      en: "Choose the method that matches the agreement with the supplier and the previous payment status.",
    },
    summary: {
      ar: "طريقة التسوية تحدد كيف سيظهر أثر المرتجع ماليًا.",
      en: "The settlement method defines how the return affects the financial follow-up.",
    },
    aliases: ["return method", "refund method", "طريقة الاسترداد"],
  },
  {
    id: "bills.return_notes",
    pageKey: "bills",
    kind: "field",
    label: {
      ar: "ملاحظات المرتجع",
      en: "Return notes",
    },
    purpose: {
      ar: "تضيف توضيحًا اختياريًا عن سبب المرتجع أو تفاصيل الاتفاق مع المورد.",
      en: "Adds an optional explanation about the return reason or supplier agreement details.",
    },
    whatToCheck: {
      ar: "اكتب ملاحظة قصيرة مفيدة إذا كان السبب غير واضح من البنود وحدها.",
      en: "Write a short useful note if the reason is not clear from the items alone.",
    },
    summary: {
      ar: "الملاحظات تساعد من يراجع المرتجع لاحقًا على فهم السياق.",
      en: "Notes help later reviewers understand the return context.",
    },
    aliases: ["return notes", "notes", "ملاحظات"],
  },
  {
    id: "bills.submit_return_button",
    pageKey: "bills",
    kind: "button",
    label: {
      ar: "زر إرسال المرتجع للاعتماد",
      en: "Submit return for approval button",
    },
    purpose: {
      ar: "يرسل طلب مرتجع المشتريات للمراجعة بدل تنفيذ الأثر النهائي مباشرة.",
      en: "Sends the purchase return request for review instead of applying the final effect immediately.",
    },
    whatToCheck: {
      ar: "راجع الكميات وطريقة التسوية والملاحظات قبل الإرسال.",
      en: "Review quantities, settlement method, and notes before submitting.",
    },
    afterAction: {
      ar: "بعد الإرسال ينتقل المرتجع إلى دورة الاعتماد في صفحة مرتجعات المشتريات.",
      en: "After submission, the return moves to the approval cycle on the purchase returns page.",
    },
    summary: {
      ar: "الإرسال يبدأ دورة اعتماد مرتجع المشتريات.",
      en: "Submitting starts the purchase return approval cycle.",
    },
    aliases: ["submit return", "send for approval", "إرسال للاعتماد"],
  },
  {
    id: "bills.print_button",
    pageKey: "bills",
    kind: "button",
    label: {
      ar: "زر طباعة فاتورة المورد",
      en: "Print supplier bill button",
    },
    purpose: {
      ar: "يفتح نسخة مناسبة للطباعة من فاتورة المورد.",
      en: "Opens a print-friendly version of the supplier bill.",
    },
    whatToCheck: {
      ar: "راجع المورد والتاريخ والبنود والإجمالي قبل الطباعة.",
      en: "Review supplier, date, items, and total before printing.",
    },
    summary: {
      ar: "استخدمه عند الحاجة لنسخة ورقية أو رسمية من الفاتورة.",
      en: "Use it when you need a paper or official copy of the bill.",
    },
    aliases: ["print bill", "طباعة"],
  },
  {
    id: "bills.download_pdf_button",
    pageKey: "bills",
    kind: "button",
    label: {
      ar: "زر تنزيل فاتورة المورد",
      en: "Download supplier bill button",
    },
    purpose: {
      ar: "ينشئ نسخة ملف من فاتورة المورد للاحتفاظ أو المشاركة.",
      en: "Creates a file copy of the supplier bill for saving or sharing.",
    },
    whatToCheck: {
      ar: "تأكد أن بيانات الفاتورة نهائية أو مناسبة للمشاركة قبل التنزيل.",
      en: "Confirm the bill details are final or suitable for sharing before downloading.",
    },
    summary: {
      ar: "التنزيل مفيد للأرشفة أو إرسال نسخة من الفاتورة.",
      en: "Downloading is useful for archiving or sending a copy of the bill.",
    },
    aliases: ["download pdf", "pdf", "تنزيل"],
  },
  {
    id: "bills.rejection_reason",
    pageKey: "bills",
    kind: "field",
    label: {
      ar: "سبب رفض فاتورة المورد",
      en: "Supplier bill rejection reason",
    },
    purpose: {
      ar: "يوضح لماذا تم رفض الفاتورة أو رفض الاستلام حتى يعرف المسؤول ما يحتاج تصحيحًا.",
      en: "Explains why the bill or receipt was rejected so the responsible user knows what needs correction.",
    },
    whatToCheck: {
      ar: "اكتب سببًا عمليًا مثل اختلاف الكمية أو السعر أو المستند.",
      en: "Write a practical reason such as quantity, price, or document mismatch.",
    },
    summary: {
      ar: "سبب الرفض يحول القرار من مجرد رفض إلى توجيه قابل للتصحيح.",
      en: "The rejection reason turns the decision from a simple rejection into actionable guidance.",
    },
    aliases: ["bill rejection reason", "receipt rejection reason", "سبب الرفض"],
  },
  {
    id: "bills.confirm_rejection_button",
    pageKey: "bills",
    kind: "button",
    label: {
      ar: "زر تأكيد الرفض",
      en: "Confirm rejection button",
    },
    purpose: {
      ar: "يحفظ قرار الرفض والسبب المكتوب على فاتورة المورد أو خطوة الاستلام.",
      en: "Saves the rejection decision and written reason on the supplier bill or receipt step.",
    },
    whatToCheck: {
      ar: "راجع السبب قبل التأكيد لأن القرار سيظهر في متابعة الفاتورة.",
      en: "Review the reason before confirming because it will appear in bill follow-up.",
    },
    summary: {
      ar: "هذا الزر هو آخر خطوة قبل تثبيت قرار الرفض.",
      en: "This button is the last step before saving the rejection decision.",
    },
    aliases: ["confirm rejection", "تأكيد الرفض"],
  },
  {
    id: "purchase_returns.new_return_button",
    pageKey: "purchase_returns",
    kind: "button",
    label: {
      ar: "زر مرتجع جديد",
      en: "New purchase return button",
    },
    purpose: {
      ar: "ينقلك لإنشاء طلب مرتجع مشتريات جديد مرتبط بمورد ومستند شراء.",
      en: "Takes you to create a new purchase return linked to a supplier and purchasing document.",
    },
    whatToCheck: {
      ar: "استخدمه عندما توجد بضاعة أو قيمة تحتاج إرجاعها للمورد.",
      en: "Use it when goods or an amount need to be returned to the supplier.",
    },
    summary: {
      ar: "هذا هو مدخل إنشاء مرتجع مشتريات جديد.",
      en: "This is the entry point for creating a new purchase return.",
    },
    aliases: ["new purchase return", "new return", "مرتجع جديد"],
  },
  {
    id: "purchase_returns.pending_approval_banner",
    pageKey: "purchase_returns",
    kind: "message",
    label: {
      ar: "تنبيه مرتجعات بانتظار اعتمادك",
      en: "Returns awaiting your approval alert",
    },
    purpose: {
      ar: "ينبه المستخدم أن هناك مرتجعات تحتاج إجراءً منه قبل خصم البضاعة أو إكمال الدورة.",
      en: "Alerts the user that returns need their action before goods are deducted or the cycle is completed.",
    },
    whatToCheck: {
      ar: "راجع عدد الطلبات ثم افتح الجدول لاعتماد أو رفض الطلبات المناسبة.",
      en: "Review the count, then use the table to approve or reject the relevant requests.",
    },
    summary: {
      ar: "التنبيه يساعدك على عدم ترك مرتجعات معلقة.",
      en: "The alert helps avoid leaving returns waiting.",
    },
    aliases: ["pending approval", "approval alert", "بانتظار اعتمادك"],
  },
  {
    id: "purchase_returns.search",
    pageKey: "purchase_returns",
    kind: "field",
    label: {
      ar: "البحث في المرتجعات",
      en: "Search purchase returns",
    },
    purpose: {
      ar: "يساعدك في العثور بسرعة على مرتجع حسب الرقم أو المورد أو الفاتورة.",
      en: "Helps you quickly find a return by number, supplier, or bill.",
    },
    whenToUse: {
      ar: "استخدمه عندما تكون القائمة طويلة أو تريد متابعة طلب محدد.",
      en: "Use it when the list is long or you want to follow a specific request.",
    },
    summary: {
      ar: "البحث يقلل وقت الوصول للمرتجع المطلوب.",
      en: "Search reduces the time needed to reach the needed return.",
    },
    aliases: ["search returns", "بحث"],
  },
  {
    id: "purchase_returns.returns_table",
    pageKey: "purchase_returns",
    kind: "field",
    label: {
      ar: "قائمة مرتجعات المشتريات",
      en: "Purchase returns list",
    },
    purpose: {
      ar: "تعرض طلبات المرتجعات مع المورد والمستند والكمية والمبلغ والحالة والإجراءات المتاحة.",
      en: "Shows return requests with supplier, document, quantity, amount, status, and available actions.",
    },
    whatToCheck: {
      ar: "راجع الحالة والإجراء المتاح في كل صف لمعرفة الخطوة التالية.",
      en: "Review the status and available action on each row to understand the next step.",
    },
    summary: {
      ar: "القائمة هي مركز متابعة مرتجعات المشتريات.",
      en: "The list is the follow-up center for purchase returns.",
    },
    aliases: ["returns list", "purchase returns table", "قائمة المرتجعات"],
  },
  {
    id: "purchase_returns.status.pending_admin",
    pageKey: "purchase_returns",
    kind: "status",
    label: {
      ar: "بانتظار اعتماد الإدارة",
      en: "Waiting for management approval",
    },
    purpose: {
      ar: "تعني أن طلب المرتجع يحتاج مراجعة إدارية قبل أن ينتقل للمخزن.",
      en: "Means the return request needs management review before moving to the warehouse step.",
    },
    whatToCheck: {
      ar: "راجع المورد والفاتورة والسبب والمبلغ قبل الاعتماد أو الرفض.",
      en: "Review supplier, bill, reason, and amount before approving or rejecting.",
    },
    summary: {
      ar: "هذه أول بوابة مراجعة في مرتجع المشتريات.",
      en: "This is the first review gate in a purchase return.",
    },
    aliases: ["pending admin", "management approval", "اعتماد الإدارة"],
  },
  {
    id: "purchase_returns.status.pending_warehouse",
    pageKey: "purchase_returns",
    kind: "status",
    label: {
      ar: "بانتظار المخزن",
      en: "Waiting for warehouse",
    },
    purpose: {
      ar: "تعني أن الإدارة وافقت، والطلب ينتظر تأكيد المخزن أن البضاعة ستسلم أو سلمت للمورد.",
      en: "Means management approved, and the request is waiting for the warehouse to confirm goods handover to the supplier.",
    },
    whatToCheck: {
      ar: "راجع الكمية والبضاعة والمخزن قبل التأكيد.",
      en: "Review quantity, goods, and warehouse before confirming.",
    },
    summary: {
      ar: "هذه مرحلة تأكيد البضاعة قبل اكتمال المرتجع.",
      en: "This is the goods confirmation stage before the return is completed.",
    },
    aliases: ["pending warehouse", "warehouse approval", "المخزن"],
  },
  {
    id: "purchase_returns.status.returned",
    pageKey: "purchase_returns",
    kind: "status",
    label: {
      ar: "تم الإرجاع",
      en: "Returned",
    },
    purpose: {
      ar: "تعني أن خطوة إرجاع البضاعة أو اعتمادها تمت، وقد يحتاج الطلب متابعة التسوية المالية حسب طريقة المرتجع.",
      en: "Means the goods return or confirmation step is complete, and financial settlement may still need follow-up depending on the return method.",
    },
    summary: {
      ar: "المرتجع تم تشغيله، والمرحلة التالية قد تكون متابعة الاسترداد أو الإغلاق.",
      en: "The return has been processed, and the next step may be refund follow-up or closing.",
    },
    aliases: ["returned", "تم الإرجاع"],
  },
  {
    id: "purchase_returns.status.closed",
    pageKey: "purchase_returns",
    kind: "status",
    label: {
      ar: "مغلق",
      en: "Closed",
    },
    purpose: {
      ar: "تعني أن طلب المرتجع اكتمل ولا ينتظر إجراءً أساسيًا آخر.",
      en: "Means the return request is complete and no longer waiting for a main action.",
    },
    summary: {
      ar: "المرتجع المغلق جاهز للأرشفة أو المراجعة فقط.",
      en: "A closed return is ready for reference or review only.",
    },
    aliases: ["closed", "مغلق"],
  },
  {
    id: "purchase_returns.status.rejected",
    pageKey: "purchase_returns",
    kind: "status",
    label: {
      ar: "مرفوض",
      en: "Rejected",
    },
    purpose: {
      ar: "تعني أن طلب مرتجع المشتريات توقف بسبب رفض من الإدارة أو المخزن، ويحتاج مراجعة سبب الرفض.",
      en: "Means the purchase return stopped because management or warehouse rejected it, and the rejection reason needs review.",
    },
    whatToCheck: {
      ar: "راجع سبب الرفض قبل تعديل الطلب أو إعادة إرساله.",
      en: "Review the rejection reason before editing or resubmitting the request.",
    },
    summary: {
      ar: "الحالة المرفوضة تخبرك أن الطلب يحتاج تصحيحًا قبل المتابعة.",
      en: "Rejected status tells you the request needs correction before continuing.",
    },
    aliases: ["rejected", "warehouse rejected", "مرفوض"],
  },
  {
    id: "purchase_returns.admin_approve_button",
    pageKey: "purchase_returns",
    kind: "button",
    label: {
      ar: "زر اعتماد الإدارة للمرتجع",
      en: "Management approve return button",
    },
    purpose: {
      ar: "ينقل طلب مرتجع المشتريات من مراجعة الإدارة إلى خطوة المخزن.",
      en: "Moves the purchase return request from management review to the warehouse step.",
    },
    whatToCheck: {
      ar: "راجع المورد والفاتورة ونوع المرتجع والسبب والمبلغ قبل الاعتماد.",
      en: "Review supplier, bill, return type, reason, and amount before approval.",
    },
    summary: {
      ar: "اعتماد الإدارة يسمح للمرتجع بالانتقال للمرحلة التالية.",
      en: "Management approval lets the return move to the next stage.",
    },
    aliases: ["admin approve", "approve return", "اعتماد"],
  },
  {
    id: "purchase_returns.admin_reject_button",
    pageKey: "purchase_returns",
    kind: "button",
    label: {
      ar: "زر رفض الإدارة للمرتجع",
      en: "Management reject return button",
    },
    purpose: {
      ar: "يرفض طلب المرتجع من مرحلة الإدارة ويطلب توضيح سبب القرار.",
      en: "Rejects the return request at management review and requires explaining the decision.",
    },
    whatToCheck: {
      ar: "اكتب سببًا واضحًا حتى يعرف صاحب الطلب ما يلزم تعديله.",
      en: "Write a clear reason so the requester knows what needs adjustment.",
    },
    summary: {
      ar: "رفض الإدارة يوقف الطلب حتى تتم مراجعته أو تصحيحه.",
      en: "Management rejection stops the request until it is reviewed or corrected.",
    },
    aliases: ["admin reject", "reject return", "رفض الإدارة"],
  },
  {
    id: "purchase_returns.warehouse_confirm_button",
    pageKey: "purchase_returns",
    kind: "button",
    label: {
      ar: "زر اعتماد المخزن للمرتجع",
      en: "Warehouse confirm return button",
    },
    purpose: {
      ar: "يؤكد خطوة المخزن في تسليم البضاعة المرتجعة للمورد أو اعتمادها.",
      en: "Confirms the warehouse step for handing returned goods to the supplier or approving them.",
    },
    whatToCheck: {
      ar: "راجع الكمية والبنود قبل التأكيد، خصوصًا إذا كان المرتجع موزعًا على أكثر من مخزن.",
      en: "Review quantity and items before confirming, especially when the return involves more than one warehouse.",
    },
    summary: {
      ar: "اعتماد المخزن يكمل خطوة البضاعة في المرتجع.",
      en: "Warehouse confirmation completes the goods step in the return.",
    },
    aliases: ["warehouse confirm", "confirm return", "اعتماد المخزن"],
  },
  {
    id: "purchase_returns.warehouse_reject_button",
    pageKey: "purchase_returns",
    kind: "button",
    label: {
      ar: "زر رفض المخزن للمرتجع",
      en: "Warehouse reject return button",
    },
    purpose: {
      ar: "يرفض المرتجع من جهة المخزن إذا كانت البضاعة أو الكمية غير مناسبة للتسليم للمورد.",
      en: "Rejects the return from the warehouse side when goods or quantities are not suitable for supplier handover.",
    },
    whatToCheck: {
      ar: "وضح سبب الرفض مثل اختلاف الكمية أو عدم جاهزية البضاعة.",
      en: "Explain the rejection reason, such as quantity mismatch or goods not being ready.",
    },
    summary: {
      ar: "رفض المخزن يعيد الطلب للتصحيح قبل تكرار الدورة.",
      en: "Warehouse rejection sends the request back for correction before repeating the cycle.",
    },
    aliases: ["warehouse reject", "reject warehouse", "رفض المخزن"],
  },
  {
    id: "purchase_returns.supplier_refund_button",
    pageKey: "purchase_returns",
    kind: "button",
    label: {
      ar: "زر إثبات استلام استرداد المورد",
      en: "Confirm supplier refund receipt button",
    },
    purpose: {
      ar: "يفتح نافذة لتأكيد أن المورد أعاد المبلغ نقدًا أو بنكيًا بعد اكتمال المرتجع.",
      en: "Opens a dialog to confirm the supplier returned the amount in cash or by bank after the return is completed.",
    },
    whatToCheck: {
      ar: "راجع المبلغ وطريقة التسوية وأي مرجع دفع قبل التأكيد.",
      en: "Review amount, settlement method, and any payment reference before confirming.",
    },
    summary: {
      ar: "هذا الإجراء يغلق متابعة الاسترداد المالي من المورد.",
      en: "This action closes the supplier refund follow-up.",
    },
    aliases: ["supplier refund", "refund received", "استرداد"],
  },
  {
    id: "purchase_returns.edit_resubmit_button",
    pageKey: "purchase_returns",
    kind: "button",
    label: {
      ar: "زر تعديل وإعادة إرسال",
      en: "Edit and resubmit button",
    },
    purpose: {
      ar: "يسمح لصاحب الطلب بتصحيح مرتجع مرفوض ثم إرساله مرة أخرى للاعتماد.",
      en: "Lets the requester correct a rejected return and submit it again for approval.",
    },
    whatToCheck: {
      ar: "راجع سبب الرفض وعدل البيانات المطلوبة فقط قبل إعادة الإرسال.",
      en: "Review the rejection reason and adjust only what is needed before resubmitting.",
    },
    summary: {
      ar: "هذا الزر يعيد تشغيل دورة الاعتماد بعد التصحيح.",
      en: "This button restarts the approval cycle after correction.",
    },
    aliases: ["edit and resubmit", "resubmit", "إعادة إرسال"],
  },
  {
    id: "purchase_returns.view_details_button",
    pageKey: "purchase_returns",
    kind: "button",
    label: {
      ar: "زر عرض تفاصيل المرتجع",
      en: "View return details button",
    },
    purpose: {
      ar: "يفتح صفحة تفاصيل مرتجع المشتريات لمراجعة البنود والاعتمادات والمعلومات الكاملة.",
      en: "Opens the purchase return detail page to review items, approvals, and full information.",
    },
    summary: {
      ar: "استخدمه عندما تحتاج فهم المرتجع بعمق قبل القرار.",
      en: "Use it when you need to understand the return in detail before deciding.",
    },
    aliases: ["view details", "details", "عرض التفاصيل"],
  },
  {
    id: "purchase_returns.view_bill_button",
    pageKey: "purchase_returns",
    kind: "button",
    label: {
      ar: "زر عرض فاتورة المورد",
      en: "View supplier bill button",
    },
    purpose: {
      ar: "يفتح فاتورة المورد المرتبطة بالمرتجع لمراجعة أصل العملية.",
      en: "Opens the supplier bill linked to the return to review the original transaction.",
    },
    summary: {
      ar: "العودة للفاتورة تساعدك تتأكد من سبب وقيمة المرتجع.",
      en: "Going back to the bill helps confirm the return reason and value.",
    },
    aliases: ["view bill", "supplier bill", "عرض الفاتورة"],
  },
  {
    id: "purchase_returns.rejection_reason",
    pageKey: "purchase_returns",
    kind: "field",
    label: {
      ar: "سبب رفض مرتجع المشتريات",
      en: "Purchase return rejection reason",
    },
    purpose: {
      ar: "يوضح سبب رفض الإدارة أو المخزن حتى يستطيع صاحب الطلب تصحيح المرتجع.",
      en: "Explains why management or warehouse rejected the return so the requester can correct it.",
    },
    whatToCheck: {
      ar: "اكتب سببًا محددًا مثل اختلاف الكمية أو نقص المستندات أو عدم جاهزية البضاعة.",
      en: "Write a specific reason such as quantity mismatch, missing documents, or goods not being ready.",
    },
    summary: {
      ar: "سبب الرفض يجعل الخطوة التالية واضحة لصاحب الطلب.",
      en: "The rejection reason makes the next step clear for the requester.",
    },
    aliases: ["return rejection reason", "reason", "سبب الرفض"],
  },
  {
    id: "purchase_returns.confirm_rejection_button",
    pageKey: "purchase_returns",
    kind: "button",
    label: {
      ar: "زر تأكيد رفض المرتجع",
      en: "Confirm return rejection button",
    },
    purpose: {
      ar: "يحفظ قرار الرفض والسبب على طلب مرتجع المشتريات.",
      en: "Saves the rejection decision and reason on the purchase return request.",
    },
    whatToCheck: {
      ar: "راجع السبب قبل التأكيد لأنه سيحدد ما يجب تصحيحه لاحقًا.",
      en: "Review the reason before confirming because it defines what needs correction later.",
    },
    summary: {
      ar: "هذا الزر يثبت قرار الرفض على طلب المرتجع.",
      en: "This button saves the rejection decision on the return request.",
    },
    aliases: ["confirm rejection", "تأكيد الرفض"],
  },
  {
    id: "purchase_returns.supplier_refund_dialog",
    pageKey: "purchase_returns",
    kind: "field",
    label: {
      ar: "نافذة استلام استرداد المورد",
      en: "Supplier refund receipt dialog",
    },
    purpose: {
      ar: "تعرض بيانات المرتجع والمورد والمبلغ وطريقة التسوية قبل تأكيد استلام الاسترداد.",
      en: "Shows return, supplier, amount, and settlement method before confirming refund receipt.",
    },
    whatToCheck: {
      ar: "راجع المبلغ والمورد وأضف ملاحظة مفيدة إذا كان لديك مرجع دفع.",
      en: "Review amount and supplier, and add a useful note if you have a payment reference.",
    },
    summary: {
      ar: "هذه النافذة تساعدك تغلق متابعة المبلغ المسترد من المورد.",
      en: "This dialog helps close the refund amount follow-up with the supplier.",
    },
    aliases: ["refund dialog", "supplier refund dialog", "استرداد"],
  },
  {
    id: "product_availability.product",
    pageKey: "product_availability",
    kind: "field",
    label: {
      ar: "المنتج",
      en: "Product",
    },
    purpose: {
      ar: "يحدد الصنف الذي تريد معرفة توفره في الفروع والمخازن.",
      en: "Selects the item whose availability you want to check across branches and warehouses.",
    },
    whatToCheck: {
      ar: "ابحث بالاسم أو الكود وتأكد أن المنتج هو المطلوب قبل تشغيل البحث.",
      en: "Search by name or code and confirm it is the correct product before searching.",
    },
    summary: {
      ar: "اختيار المنتج الصحيح هو بداية معرفة أين توجد الكمية.",
      en: "Choosing the right product is the first step to knowing where quantity exists.",
    },
    aliases: ["product", "item", "المنتج", "الصنف"],
  },
  {
    id: "product_availability.search_button",
    pageKey: "product_availability",
    kind: "button",
    label: {
      ar: "زر البحث عن التوفر",
      en: "Search availability button",
    },
    purpose: {
      ar: "يعرض أماكن وجود المنتج والكميات المتاحة في الفروع والمخازن.",
      en: "Shows where the product exists and the available quantities in branches and warehouses.",
    },
    whatToCheck: {
      ar: "تأكد من اختيار المنتج أولًا، ثم استخدم النتائج للمقارنة بين المخازن.",
      en: "Make sure a product is selected first, then use the results to compare warehouses.",
    },
    afterAction: {
      ar: "بعد البحث تظهر قائمة بالمخازن التي تحتوي على المنتج وكميته المتاحة.",
      en: "After searching, a list appears showing warehouses that contain the product and its available quantity.",
    },
    summary: {
      ar: "هذا الزر يجيب على سؤال: أين توجد الكمية؟",
      en: "This button answers: where is the quantity available?",
    },
    aliases: ["search availability", "search", "بحث التوفر"],
  },
  {
    id: "product_availability.results",
    pageKey: "product_availability",
    kind: "field",
    label: {
      ar: "نتائج التوفر",
      en: "Availability results",
    },
    purpose: {
      ar: "تعرض كل فرع ومخزن يوجد فيه المنتج، مع الكمية المتاحة وحالة التوفر.",
      en: "Shows each branch and warehouse where the product exists, with available quantity and availability status.",
    },
    whatToCheck: {
      ar: "راجع المخزن والكمية قبل وعد العميل أو طلب تحويل من مخزن آخر.",
      en: "Review warehouse and quantity before committing to a customer or requesting a transfer.",
    },
    summary: {
      ar: "النتائج تساعدك تختار أقرب أو أنسب مخزن تتوفر فيه الكمية.",
      en: "Results help you choose the nearest or most suitable warehouse with available quantity.",
    },
    aliases: ["results", "availability", "نتائج"],
  },
  {
    id: "product_availability.branch",
    pageKey: "product_availability",
    kind: "field",
    label: {
      ar: "الفرع",
      en: "Branch",
    },
    purpose: {
      ar: "يوضح الفرع الذي يتبع له المخزن الذي يحتوي على المنتج.",
      en: "Shows the branch connected to the warehouse that has the product.",
    },
    summary: {
      ar: "الفرع يساعدك تعرف مكان المخزون على مستوى الشركة.",
      en: "Branch helps you locate stock across the company.",
    },
    aliases: ["branch", "فرع"],
  },
  {
    id: "product_availability.warehouse",
    pageKey: "product_availability",
    kind: "field",
    label: {
      ar: "المخزن",
      en: "Warehouse",
    },
    purpose: {
      ar: "يوضح المكان الفعلي أو التشغيلي الذي توجد فيه الكمية.",
      en: "Shows the physical or operational place where the quantity exists.",
    },
    whatToCheck: {
      ar: "قارن بين المخازن عند تجهيز طلب بيع أو تحويل مخزون.",
      en: "Compare warehouses when preparing a sale or stock transfer.",
    },
    summary: {
      ar: "المخزن هو المكان الذي ستخرج منه الكمية أو تنتقل منه.",
      en: "Warehouse is where the quantity will be issued from or moved from.",
    },
    aliases: ["warehouse", "store", "مخزن"],
  },
  {
    id: "product_availability.cost_center",
    pageKey: "product_availability",
    kind: "field",
    label: {
      ar: "مركز التكلفة",
      en: "Cost center",
    },
    purpose: {
      ar: "يوضح الجهة أو النشاط الذي تُنسب له حركة المخزون عند الحاجة للتقارير.",
      en: "Shows the team or activity the stock movement may be connected to for reporting.",
    },
    summary: {
      ar: "مركز التكلفة يساعد على قراءة المخزون حسب النشاط أو القسم.",
      en: "Cost center helps read stock by activity or department.",
    },
    aliases: ["cost center", "مركز التكلفة"],
  },
  {
    id: "product_availability.available_quantity",
    pageKey: "product_availability",
    kind: "field",
    label: {
      ar: "الكمية المتاحة",
      en: "Available quantity",
    },
    purpose: {
      ar: "توضح الكمية التي يمكن الاعتماد عليها حاليًا في المخزن لهذا المنتج.",
      en: "Shows the quantity currently available to rely on in the warehouse for this product.",
    },
    whatToCheck: {
      ar: "قارنها بالكمية المطلوبة قبل البيع أو التحويل أو الحجز.",
      en: "Compare it with the needed quantity before selling, transferring, or reserving.",
    },
    summary: {
      ar: "الكمية المتاحة هي الرقم العملي لاتخاذ قرار البيع أو التحويل.",
      en: "Available quantity is the practical number for a sale or transfer decision.",
    },
    aliases: ["available quantity", "available stock", "الكمية المتاحة"],
  },
  {
    id: "product_availability.availability_status",
    pageKey: "product_availability",
    kind: "status",
    label: {
      ar: "حالة التوفر",
      en: "Availability status",
    },
    purpose: {
      ar: "تلخص هل المنتج متوفر في هذا المخزن أم غير متوفر.",
      en: "Summarizes whether the product is available in this warehouse or not.",
    },
    summary: {
      ar: "الحالة تختصر قراءة الكمية إلى متوفر أو غير متوفر.",
      en: "The status turns the quantity into a simple available or unavailable signal.",
    },
    aliases: ["availability status", "available", "out of stock", "حالة التوفر"],
  },
  {
    id: "product_availability.total_available",
    pageKey: "product_availability",
    kind: "field",
    label: {
      ar: "إجمالي الكمية المتاحة",
      en: "Total available quantity",
    },
    purpose: {
      ar: "يجمع كل الكميات المتاحة للمنتج عبر المخازن الظاهرة في النتائج.",
      en: "Adds all available quantities for the product across the warehouses shown in the results.",
    },
    whatToCheck: {
      ar: "استخدمه لفهم إجمالي ما لدى الشركة من المنتج، ثم راجع توزيع الكمية حسب المخزن.",
      en: "Use it to understand the company's total quantity, then review how it is distributed by warehouse.",
    },
    summary: {
      ar: "الإجمالي يعطيك الصورة العامة، والجدول يوضح أين توجد الكمية.",
      en: "The total gives the overall picture, and the table shows where the quantity is located.",
    },
    aliases: ["total available", "إجمالي الكمية"],
  },
  {
    id: "product_availability.no_stock_message",
    pageKey: "product_availability",
    kind: "message",
    label: {
      ar: "رسالة عدم وجود مخزون",
      en: "No stock message",
    },
    purpose: {
      ar: "تخبرك أن المنتج المختار لا توجد له كمية ظاهرة في أي فرع ضمن نتائج البحث.",
      en: "Tells you the selected product has no visible quantity in any branch within the search results.",
    },
    whatToCheck: {
      ar: "راجع اختيار المنتج أو ابحث عن بديل أو تحقق من آخر حركات المخزون.",
      en: "Review the selected product, look for an alternative, or check recent stock movements.",
    },
    summary: {
      ar: "هذه الرسالة تعني أن البحث لم يجد كمية يمكن الاعتماد عليها.",
      en: "This message means the search did not find a quantity to rely on.",
    },
    aliases: ["no stock", "no results", "لا توجد كمية"],
  },
  {
    id: "inventory_transfers.detail_status",
    pageKey: "inventory_transfers",
    kind: "status",
    label: {
      ar: "حالة طلب النقل",
      en: "Transfer request status",
    },
    purpose: {
      ar: "توضح أين وصل طلب نقل المخزون: ينتظر اعتمادًا، قيد الانتظار، قيد النقل، تم الاستلام، أو مرفوض.",
      en: "Shows where the stock transfer stands: waiting for approval, waiting to start, in transit, received, or rejected.",
    },
    whatToCheck: {
      ar: "راجع الحالة لتعرف هل الخطوة التالية اعتماد أو بدء نقل أو استلام أو تعديل.",
      en: "Review the status to know whether the next step is approval, starting, receiving, or editing.",
    },
    summary: {
      ar: "الحالة تحدد الخطوة الحالية في رحلة النقل بين المخازن.",
      en: "The status defines the current step in the warehouse transfer journey.",
    },
    aliases: ["transfer status", "status", "حالة النقل"],
  },
  {
    id: "inventory_transfers.source_warehouse",
    pageKey: "inventory_transfers",
    kind: "field",
    label: {
      ar: "المخزن المصدر",
      en: "Source warehouse",
    },
    purpose: {
      ar: "هو المخزن الذي ستخرج منه الكمية عند بدء النقل.",
      en: "The warehouse the quantity will leave when the transfer starts.",
    },
    whatToCheck: {
      ar: "تأكد أن الكمية متاحة في هذا المخزن قبل بدء النقل.",
      en: "Confirm the quantity is available in this warehouse before starting the transfer.",
    },
    summary: {
      ar: "المخزن المصدر هو نقطة خروج البضاعة.",
      en: "The source warehouse is where goods leave from.",
    },
    aliases: ["source warehouse", "source", "المخزن المصدر"],
  },
  {
    id: "inventory_transfers.destination_warehouse",
    pageKey: "inventory_transfers",
    kind: "field",
    label: {
      ar: "المخزن الوجهة",
      en: "Destination warehouse",
    },
    purpose: {
      ar: "هو المخزن الذي ستدخل إليه الكمية بعد تأكيد الاستلام.",
      en: "The warehouse the quantity will enter after receipt is confirmed.",
    },
    whatToCheck: {
      ar: "تأكد أن هذا هو المخزن المطلوب استلام البضاعة فيه.",
      en: "Confirm this is the warehouse that should receive the goods.",
    },
    summary: {
      ar: "المخزن الوجهة هو نقطة وصول البضاعة.",
      en: "The destination warehouse is where goods arrive.",
    },
    aliases: ["destination warehouse", "destination", "المخزن الوجهة"],
  },
  {
    id: "inventory_transfers.items_table",
    pageKey: "inventory_transfers",
    kind: "field",
    label: {
      ar: "جدول منتجات النقل",
      en: "Transfer products table",
    },
    purpose: {
      ar: "يعرض المنتجات المطلوب نقلها والكميات المطلوبة والمرسلة والمستلمة.",
      en: "Shows products to transfer and their requested, sent, and received quantities.",
    },
    whatToCheck: {
      ar: "راجع كل منتج وكمياته قبل الاعتماد أو الاستلام.",
      en: "Review each product and its quantities before approval or receipt.",
    },
    summary: {
      ar: "هذا الجدول هو تفاصيل ما سيتحرك بين المخازن.",
      en: "This table is the detail of what will move between warehouses.",
    },
    aliases: ["transfer items", "products table", "جدول المنتجات"],
  },
  {
    id: "inventory_transfers.requested_quantity",
    pageKey: "inventory_transfers",
    kind: "field",
    label: {
      ar: "الكمية المطلوبة",
      en: "Requested quantity",
    },
    purpose: {
      ar: "توضح الكمية التي طلب المستخدم نقلها من المخزن المصدر.",
      en: "Shows the quantity the user requested to move from the source warehouse.",
    },
    summary: {
      ar: "الكمية المطلوبة هي نقطة البداية في طلب النقل.",
      en: "Requested quantity is the starting point of the transfer request.",
    },
    aliases: ["requested quantity", "requested", "الكمية المطلوبة"],
  },
  {
    id: "inventory_transfers.sent_quantity",
    pageKey: "inventory_transfers",
    kind: "field",
    label: {
      ar: "الكمية المرسلة",
      en: "Sent quantity",
    },
    purpose: {
      ar: "توضح الكمية التي خرجت فعليًا من المخزن المصدر بعد بدء النقل.",
      en: "Shows the quantity that actually left the source warehouse after the transfer started.",
    },
    summary: {
      ar: "الكمية المرسلة توضح ما أصبح في الطريق إلى المخزن الوجهة.",
      en: "Sent quantity shows what is now on the way to the destination warehouse.",
    },
    aliases: ["sent quantity", "sent", "الكمية المرسلة"],
  },
  {
    id: "inventory_transfers.received_quantity",
    pageKey: "inventory_transfers",
    kind: "field",
    label: {
      ar: "الكمية المستلمة",
      en: "Received quantity",
    },
    purpose: {
      ar: "توضح الكمية التي أكد مخزن الوجهة استلامها.",
      en: "Shows the quantity the destination warehouse confirmed as received.",
    },
    whatToCheck: {
      ar: "طابقها مع الكمية التي وصلت فعليًا قبل تأكيد الاستلام.",
      en: "Match it with the quantity that actually arrived before confirming receipt.",
    },
    summary: {
      ar: "الكمية المستلمة هي ما سيدخل فعليًا إلى مخزن الوجهة.",
      en: "Received quantity is what will actually enter the destination warehouse.",
    },
    aliases: ["received quantity", "received", "الكمية المستلمة"],
  },
  {
    id: "inventory_transfers.approve_button",
    pageKey: "inventory_transfers",
    kind: "button",
    label: {
      ar: "زر اعتماد النقل",
      en: "Approve transfer button",
    },
    purpose: {
      ar: "يعتمد طلب النقل حتى يمكن بدء تحريك الكمية من المخزن المصدر.",
      en: "Approves the transfer request so quantity can start moving from the source warehouse.",
    },
    whatToCheck: {
      ar: "راجع المصدر والوجهة والكميات قبل الاعتماد.",
      en: "Review source, destination, and quantities before approval.",
    },
    afterAction: {
      ar: "بعد الاعتماد يصبح طلب النقل جاهزًا للبدء حسب الدورة.",
      en: "After approval, the transfer becomes ready to start according to the workflow.",
    },
    summary: {
      ar: "الاعتماد يسمح للنقل بالانتقال من طلب إلى عملية تشغيلية.",
      en: "Approval lets the transfer move from request to operation.",
    },
    aliases: ["approve transfer", "اعتماد النقل"],
  },
  {
    id: "inventory_transfers.reject_button",
    pageKey: "inventory_transfers",
    kind: "button",
    label: {
      ar: "زر رفض النقل",
      en: "Reject transfer button",
    },
    purpose: {
      ar: "يرفض طلب النقل إذا كانت الكميات أو المخازن غير مناسبة.",
      en: "Rejects the transfer request when quantities or warehouses are not suitable.",
    },
    whatToCheck: {
      ar: "اكتب سببًا واضحًا مثل عدم توفر الكمية أو اختيار مخزن غير مناسب.",
      en: "Write a clear reason such as insufficient quantity or an unsuitable warehouse.",
    },
    summary: {
      ar: "الرفض يوقف النقل حتى يتم تصحيح السبب.",
      en: "Rejection stops the transfer until the reason is corrected.",
    },
    aliases: ["reject transfer", "رفض النقل"],
  },
  {
    id: "inventory_transfers.start_button",
    pageKey: "inventory_transfers",
    kind: "button",
    label: {
      ar: "زر بدء النقل",
      en: "Start transfer button",
    },
    purpose: {
      ar: "يبدأ تحريك الكمية من المخزن المصدر إلى مرحلة الطريق.",
      en: "Starts moving the quantity from the source warehouse into the in-transit stage.",
    },
    whatToCheck: {
      ar: "راجع توفر الكمية في المخزن المصدر قبل البدء.",
      en: "Review available quantity in the source warehouse before starting.",
    },
    afterAction: {
      ar: "بعد البدء تظهر الكمية كمرسلة وتنتظر تأكيد الاستلام في المخزن الوجهة.",
      en: "After starting, the quantity appears as sent and waits for receipt confirmation at the destination warehouse.",
    },
    summary: {
      ar: "بدء النقل يعني خروج الكمية من المصدر وانتظار وصولها للوجهة.",
      en: "Starting means the quantity leaves the source and waits to arrive at the destination.",
    },
    aliases: ["start transfer", "بدء النقل"],
  },
  {
    id: "inventory_transfers.receive_button",
    pageKey: "inventory_transfers",
    kind: "button",
    label: {
      ar: "زر اعتماد الاستلام",
      en: "Confirm receipt button",
    },
    purpose: {
      ar: "يؤكد أن المخزن الوجهة استلم الكمية حتى تدخل في رصيده.",
      en: "Confirms the destination warehouse received the quantity so it enters its balance.",
    },
    whatToCheck: {
      ar: "راجع الكمية المستلمة فعليًا قبل التأكيد.",
      en: "Review the actually received quantity before confirming.",
    },
    afterAction: {
      ar: "بعد التأكيد تضاف الكمية للمخزن الوجهة وتكتمل عملية النقل.",
      en: "After confirmation, the quantity is added to the destination warehouse and the transfer is completed.",
    },
    summary: {
      ar: "اعتماد الاستلام هو خطوة إغلاق النقل في المخزن الوجهة.",
      en: "Confirming receipt is the closing step at the destination warehouse.",
    },
    aliases: ["confirm receipt", "receive transfer", "اعتماد الاستلام"],
  },
  {
    id: "inventory_transfers.cancel_button",
    pageKey: "inventory_transfers",
    kind: "button",
    label: {
      ar: "زر إلغاء النقل",
      en: "Cancel transfer button",
    },
    purpose: {
      ar: "يلغي طلب نقل قيد الحركة عندما تسمح الدورة بذلك ويعيد متابعة الكمية للمصدر.",
      en: "Cancels an in-progress transfer when the workflow allows it and returns quantity follow-up to the source.",
    },
    whatToCheck: {
      ar: "استخدمه فقط عندما لم يعد النقل صحيحًا أو لم يصل كما هو متوقع.",
      en: "Use it only when the transfer is no longer correct or did not proceed as expected.",
    },
    summary: {
      ar: "الإلغاء يوقف النقل بدل إكمال الاستلام.",
      en: "Cancellation stops the transfer instead of completing receipt.",
    },
    aliases: ["cancel transfer", "إلغاء النقل"],
  },
  {
    id: "inventory_transfers.edit_button",
    pageKey: "inventory_transfers",
    kind: "button",
    label: {
      ar: "زر تعديل النقل",
      en: "Edit transfer button",
    },
    purpose: {
      ar: "يسمح بتصحيح طلب نقل في المسودة أو بعد الرفض.",
      en: "Allows correcting a draft or rejected transfer request.",
    },
    summary: {
      ar: "التعديل يستخدم لتصحيح الطلب قبل إرساله أو بعد رفضه.",
      en: "Editing is used to correct the request before sending or after rejection.",
    },
    aliases: ["edit transfer", "تعديل النقل"],
  },
  {
    id: "inventory_transfers.resubmit_button",
    pageKey: "inventory_transfers",
    kind: "button",
    label: {
      ar: "زر إعادة إرسال النقل للاعتماد",
      en: "Resubmit transfer for approval button",
    },
    purpose: {
      ar: "يعيد طلب النقل المصحح إلى دورة الاعتماد.",
      en: "Sends the corrected transfer request back to the approval cycle.",
    },
    whatToCheck: {
      ar: "راجع سبب الرفض وعدل المصدر أو الوجهة أو الكميات قبل إعادة الإرسال.",
      en: "Review the rejection reason and adjust source, destination, or quantities before resubmitting.",
    },
    summary: {
      ar: "إعادة الإرسال تعني أن الطلب جاهز للمراجعة مرة أخرى.",
      en: "Resubmitting means the request is ready for review again.",
    },
    aliases: ["resubmit transfer", "إعادة إرسال"],
  },
  {
    id: "inventory_transfers.pending_approval_message",
    pageKey: "inventory_transfers",
    kind: "message",
    label: {
      ar: "رسالة انتظار اعتماد الإدارة",
      en: "Waiting for management approval message",
    },
    purpose: {
      ar: "توضح أن طلب النقل لا يمكن تشغيله قبل موافقة المسؤولين.",
      en: "Explains that the transfer cannot be processed before responsible approval.",
    },
    summary: {
      ar: "هذه الرسالة تعني أن الطلب ما زال في مرحلة المراجعة.",
      en: "This message means the request is still in review.",
    },
    aliases: ["pending approval message", "بانتظار الاعتماد"],
  },
  {
    id: "inventory_transfers.rejected_message",
    pageKey: "inventory_transfers",
    kind: "message",
    label: {
      ar: "رسالة طلب نقل مرفوض",
      en: "Rejected transfer message",
    },
    purpose: {
      ar: "توضح أن الطلب رُفض ويمكن تعديله وإرساله مرة أخرى إذا كان ذلك متاحًا.",
      en: "Explains that the request was rejected and can be edited and sent again if available.",
    },
    summary: {
      ar: "هذه الرسالة تساعد صاحب الطلب على فهم سبب التوقف والخطوة التالية.",
      en: "This message helps the requester understand why it stopped and what to do next.",
    },
    aliases: ["rejected message", "transfer rejected", "مرفوض"],
  },
  {
    id: "inventory_transfers.rejection_reason",
    pageKey: "inventory_transfers",
    kind: "field",
    label: {
      ar: "سبب رفض النقل",
      en: "Transfer rejection reason",
    },
    purpose: {
      ar: "يوضح لماذا تم رفض طلب النقل حتى يتم تصحيحه بشكل صحيح.",
      en: "Explains why the transfer request was rejected so it can be corrected properly.",
    },
    whatToCheck: {
      ar: "اكتب سببًا محددًا مثل كمية غير كافية أو اختيار مخزن غير مناسب.",
      en: "Write a specific reason such as insufficient quantity or unsuitable warehouse selection.",
    },
    summary: {
      ar: "سبب الرفض يحول القرار إلى توجيه واضح للتصحيح.",
      en: "The rejection reason turns the decision into clear correction guidance.",
    },
    aliases: ["rejection reason", "سبب الرفض"],
  },
  {
    id: "inventory_transfers.confirm_rejection_button",
    pageKey: "inventory_transfers",
    kind: "button",
    label: {
      ar: "زر تأكيد رفض النقل",
      en: "Confirm transfer rejection button",
    },
    purpose: {
      ar: "يحفظ قرار رفض طلب النقل مع السبب المكتوب.",
      en: "Saves the transfer rejection decision with the written reason.",
    },
    whatToCheck: {
      ar: "راجع السبب قبل التأكيد لأنه سيظهر لصاحب الطلب.",
      en: "Review the reason before confirming because it will be visible to the requester.",
    },
    summary: {
      ar: "هذا آخر تأكيد قبل إيقاف طلب النقل.",
      en: "This is the last confirmation before stopping the transfer request.",
    },
    aliases: ["confirm rejection", "تأكيد الرفض"],
  },
  {
    id: "inventory.branch_filter",
    pageKey: "inventory",
    kind: "field",
    label: {
      ar: "فلتر الفرع",
      en: "Branch filter",
    },
    purpose: {
      ar: "يحدد الفرع الذي تريد قراءة مخزونه وحركاته.",
      en: "Selects the branch whose stock and movements you want to view.",
    },
    whatToCheck: {
      ar: "اختر الفرع الصحيح قبل مقارنة الكميات أو المخازن.",
      en: "Choose the correct branch before comparing quantities or warehouses.",
    },
    summary: {
      ar: "فلتر الفرع يحدد نطاق قراءة المخزون.",
      en: "The branch filter defines the scope of the inventory view.",
    },
    aliases: ["branch filter", "فرع"],
  },
  {
    id: "inventory.warehouse_filter",
    pageKey: "inventory",
    kind: "field",
    label: {
      ar: "فلتر المخزن",
      en: "Warehouse filter",
    },
    purpose: {
      ar: "يحدد المخزن الذي تظهر له الكميات والحركات.",
      en: "Selects the warehouse whose quantities and movements are shown.",
    },
    whatToCheck: {
      ar: "تأكد من اختيار المخزن الصحيح قبل قراءة الكمية المتاحة.",
      en: "Confirm the correct warehouse before reading available quantity.",
    },
    summary: {
      ar: "فلتر المخزن يغير الأرقام لتخص مخزنًا محددًا.",
      en: "The warehouse filter changes the numbers to a specific warehouse.",
    },
    aliases: ["warehouse filter", "مخزن"],
  },
  {
    id: "inventory.summary_cards",
    pageKey: "inventory",
    kind: "field",
    label: {
      ar: "بطاقات ملخص المخزون",
      en: "Inventory summary cards",
    },
    purpose: {
      ar: "تعطي نظرة سريعة على عدد المنتجات وإجمالي المخزون والمشتريات والمبيعات.",
      en: "Give a quick view of product count, total stock, purchases, and sales.",
    },
    summary: {
      ar: "البطاقات تلخص وضع المخزون قبل الدخول في التفاصيل.",
      en: "Cards summarize inventory before you inspect details.",
    },
    aliases: ["summary cards", "inventory summary", "ملخص"],
  },
  {
    id: "inventory.available_stock",
    pageKey: "inventory",
    kind: "field",
    label: {
      ar: "المخزون المتاح",
      en: "Available stock",
    },
    purpose: {
      ar: "يوضح الكمية الحالية التي تظهر للمنتج في المخزن أو النطاق المختار.",
      en: "Shows the current quantity for the product in the selected warehouse or scope.",
    },
    whatToCheck: {
      ar: "قارنها بالمبيعات والمرتجعات والتحويلات لمعرفة سبب الرقم.",
      en: "Compare it with sales, returns, and transfers to understand the number.",
    },
    summary: {
      ar: "المخزون المتاح هو الرقم الأساسي لاتخاذ قرار البيع أو التحويل.",
      en: "Available stock is the main number for sales or transfer decisions.",
    },
    aliases: ["available stock", "stock", "المخزون المتاح"],
  },
  {
    id: "inventory.stock_table",
    pageKey: "inventory",
    kind: "field",
    label: {
      ar: "جدول حالة المخزون",
      en: "Inventory status table",
    },
    purpose: {
      ar: "يعرض لكل منتج الكميات الداخلة والخارجة والتحويلات والمخزون المتاح والحالة.",
      en: "Shows incoming and outgoing quantities, transfers, available stock, and status for each product.",
    },
    whatToCheck: {
      ar: "اقرأ أعمدة الجدول معًا لفهم لماذا زادت أو نقصت كمية المنتج.",
      en: "Read the table columns together to understand why a product quantity increased or decreased.",
    },
    summary: {
      ar: "هذا الجدول هو الصورة العملية لحالة المنتجات في المخزون.",
      en: "This table is the practical picture of product inventory status.",
    },
    aliases: ["stock table", "inventory status", "حالة المخزون"],
  },
  {
    id: "inventory.total_purchased",
    pageKey: "inventory",
    kind: "field",
    label: {
      ar: "إجمالي المشتريات",
      en: "Total purchased",
    },
    purpose: {
      ar: "يوضح الكميات التي دخلت للمخزون من عمليات الشراء.",
      en: "Shows quantities that entered stock through purchases.",
    },
    summary: {
      ar: "المشتريات تزيد الكمية المتاحة عادة بعد اعتماد الاستلام.",
      en: "Purchases usually increase available quantity after receipt approval.",
    },
    aliases: ["total purchased", "purchases", "المشتريات"],
  },
  {
    id: "inventory.total_sold",
    pageKey: "inventory",
    kind: "field",
    label: {
      ar: "إجمالي المبيعات",
      en: "Total sold",
    },
    purpose: {
      ar: "يوضح الكميات التي خرجت من المخزون بسبب البيع.",
      en: "Shows quantities that left stock because of sales.",
    },
    summary: {
      ar: "المبيعات تقلل الكمية المتاحة.",
      en: "Sales reduce available quantity.",
    },
    aliases: ["total sold", "sales", "المبيعات"],
  },
  {
    id: "inventory.sales_returns",
    pageKey: "inventory",
    kind: "field",
    label: {
      ar: "مرتجعات المبيعات",
      en: "Sales returns",
    },
    purpose: {
      ar: "توضح الكميات التي رجعت من العملاء وقد تزيد المخزون حسب اعتماد المرتجع.",
      en: "Shows quantities returned by customers and may increase stock depending on return approval.",
    },
    summary: {
      ar: "مرتجع البيع يعكس عودة بضاعة من العميل.",
      en: "A sales return reflects goods coming back from a customer.",
    },
    aliases: ["sales returns", "مرتجعات المبيعات"],
  },
  {
    id: "inventory.purchase_returns",
    pageKey: "inventory",
    kind: "field",
    label: {
      ar: "مرتجعات المشتريات",
      en: "Purchase returns",
    },
    purpose: {
      ar: "توضح الكميات التي خرجت من المخزون بسبب إرجاعها للمورد.",
      en: "Shows quantities that left stock because they were returned to the supplier.",
    },
    summary: {
      ar: "مرتجع الشراء يقلل المخزون لأنه يعيد بضاعة للمورد.",
      en: "A purchase return reduces stock because goods go back to the supplier.",
    },
    aliases: ["purchase returns", "مرتجعات المشتريات"],
  },
  {
    id: "inventory.write_offs",
    pageKey: "inventory",
    kind: "field",
    label: {
      ar: "الشطب أو الهالك",
      en: "Write-offs",
    },
    purpose: {
      ar: "يوضح الكميات التي خرجت من المخزون لأنها تالفة أو مفقودة أو غير صالحة للاستخدام.",
      en: "Shows quantities removed from stock because they are damaged, missing, or no longer usable.",
    },
    summary: {
      ar: "الشطب يقلل المخزون لأسباب تشغيلية غير البيع.",
      en: "Write-offs reduce stock for operational reasons other than sales.",
    },
    aliases: ["write-offs", "damaged", "الهالك", "الشطب"],
  },
  {
    id: "inventory.incoming_transfers",
    pageKey: "inventory",
    kind: "field",
    label: {
      ar: "التحويلات الواردة",
      en: "Incoming transfers",
    },
    purpose: {
      ar: "توضح الكميات التي وصلت أو في طريقها إلى المخزن المختار من مخازن أخرى.",
      en: "Shows quantities received or moving into the selected warehouse from other warehouses.",
    },
    summary: {
      ar: "التحويلات الواردة تزيد كمية المخزن عند اكتمال الاستلام.",
      en: "Incoming transfers increase warehouse quantity when receipt is complete.",
    },
    aliases: ["incoming transfers", "الواردة"],
  },
  {
    id: "inventory.outgoing_transfers",
    pageKey: "inventory",
    kind: "field",
    label: {
      ar: "التحويلات الصادرة",
      en: "Outgoing transfers",
    },
    purpose: {
      ar: "توضح الكميات التي خرجت أو في طريقها للخروج من المخزن المختار إلى مخازن أخرى.",
      en: "Shows quantities that left or are moving out of the selected warehouse to other warehouses.",
    },
    summary: {
      ar: "التحويلات الصادرة تقلل كمية المخزن المصدر عند بدء النقل.",
      en: "Outgoing transfers reduce the source warehouse quantity when the transfer starts.",
    },
    aliases: ["outgoing transfers", "الصادرة"],
  },
  {
    id: "inventory.stock_status",
    pageKey: "inventory",
    kind: "status",
    label: {
      ar: "حالة المخزون",
      en: "Stock status",
    },
    purpose: {
      ar: "تلخص هل المنتج متوفر، منخفض، أو نفد من المخزن.",
      en: "Summarizes whether the product is available, low, or out of stock.",
    },
    summary: {
      ar: "الحالة تساعدك تنتبه للمنتجات التي تحتاج متابعة.",
      en: "Status helps you notice products that need follow-up.",
    },
    aliases: ["stock status", "low stock", "out of stock", "حالة المخزون"],
  },
  {
    id: "inventory.movements_table",
    pageKey: "inventory",
    kind: "field",
    label: {
      ar: "جدول حركات المخزون",
      en: "Inventory movements table",
    },
    purpose: {
      ar: "يعرض سبب تغير الكميات عبر عمليات الشراء والبيع والمرتجعات والتسويات.",
      en: "Shows why quantities changed through purchases, sales, returns, and adjustments.",
    },
    whatToCheck: {
      ar: "استخدمه عندما تريد تفسير زيادة أو نقص في كمية منتج.",
      en: "Use it when you want to explain an increase or decrease in a product quantity.",
    },
    summary: {
      ar: "الحركات هي سجل يشرح لماذا تغير المخزون.",
      en: "Movements are the history that explains why stock changed.",
    },
    aliases: ["movements", "inventory movements", "حركات المخزون"],
  },
  {
    id: "inventory.movement_filters",
    pageKey: "inventory",
    kind: "field",
    label: {
      ar: "فلاتر حركات المخزون",
      en: "Inventory movement filters",
    },
    purpose: {
      ar: "تساعدك تضييق الحركات حسب النوع أو المنتج أو التاريخ.",
      en: "Help narrow movements by type, product, or date.",
    },
    summary: {
      ar: "الفلاتر تجعل تفسير الحركة أسرع وأكثر دقة.",
      en: "Filters make movement explanation faster and more precise.",
    },
    aliases: ["movement filters", "filters", "فلاتر"],
  },
  {
    id: "inventory.movement_type",
    pageKey: "inventory",
    kind: "field",
    label: {
      ar: "نوع الحركة",
      en: "Movement type",
    },
    purpose: {
      ar: "يوضح هل الحركة شراء أو بيع أو مرتجع أو تسوية أو شطب.",
      en: "Shows whether the movement is a purchase, sale, return, adjustment, or write-off.",
    },
    summary: {
      ar: "نوع الحركة يشرح سبب دخول أو خروج الكمية.",
      en: "Movement type explains why quantity went in or out.",
    },
    aliases: ["movement type", "نوع الحركة"],
  },
  {
    id: "inventory.movement_quantity",
    pageKey: "inventory",
    kind: "field",
    label: {
      ar: "الكمية الداخلة أو الخارجة",
      en: "Incoming or outgoing quantity",
    },
    purpose: {
      ar: "توضح مقدار الزيادة أو النقص في المخزون بسبب الحركة.",
      en: "Shows how much stock increased or decreased because of the movement.",
    },
    summary: {
      ar: "الإشارة الموجبة تعني دخول كمية، والسالبة تعني خروج كمية.",
      en: "A positive sign means quantity entered, and a negative sign means quantity left.",
    },
    aliases: ["movement quantity", "quantity", "الكمية"],
  },
  {
    id: "inventory.movement_totals",
    pageKey: "inventory",
    kind: "field",
    label: {
      ar: "إجمالي الداخل والخارج",
      en: "Total in and out",
    },
    purpose: {
      ar: "يلخص كمية الحركات الداخلة والخارجة والصافي حسب الفلاتر الحالية.",
      en: "Summarizes incoming quantity, outgoing quantity, and net change based on current filters.",
    },
    summary: {
      ar: "الإجماليات تساعدك ترى أثر الحركات المختارة بسرعة.",
      en: "Totals help you quickly see the effect of selected movements.",
    },
    aliases: ["movement totals", "in out totals", "إجماليات الحركات"],
  },
  {
    id: "journal.entry_date",
    pageKey: "journal",
    kind: "field",
    label: {
      ar: "تاريخ القيد",
      en: "Journal entry date",
    },
    purpose: {
      ar: "يوضح اليوم الذي يظهر فيه أثر القيد داخل الحسابات والتقارير المالية.",
      en: "Shows the date when this journal entry affects accounts and financial reports.",
    },
    whatToCheck: {
      ar: "راجع أن التاريخ يخص فترة العمل الصحيحة قبل الحفظ أو المراجعة.",
      en: "Check that the date belongs to the correct accounting period before saving or reviewing.",
    },
    summary: {
      ar: "التاريخ يحدد متى يظهر أثر القيد في الأرقام المالية.",
      en: "The date controls when the entry appears in financial numbers.",
    },
    aliases: ["entry date", "journal date", "تاريخ"],
  },
  {
    id: "journal.description",
    pageKey: "journal",
    kind: "field",
    label: {
      ar: "وصف القيد",
      en: "Journal entry description",
    },
    purpose: {
      ar: "يشرح سبب القيد أو العملية التي يمثلها حتى يسهل فهمه لاحقًا.",
      en: "Explains why the entry exists or which business action it represents.",
    },
    whatToCheck: {
      ar: "اكتب وصفًا واضحًا يربط القيد بالعملية الفعلية مثل فاتورة أو دفعة أو تصحيح.",
      en: "Use a clear description that connects the entry to the real action, such as an invoice, payment, or correction.",
    },
    summary: {
      ar: "الوصف الجيد يجعل مراجعة القيود أسهل وأوضح.",
      en: "A good description makes journal review easier and clearer.",
    },
    aliases: ["description", "memo", "وصف", "بيان"],
  },
  {
    id: "journal.source_document",
    pageKey: "journal",
    kind: "field",
    label: {
      ar: "المستند المرتبط",
      en: "Linked source document",
    },
    purpose: {
      ar: "يبين العملية الأصلية التي أنشأت القيد، مثل فاتورة أو دفعة أو مرتجع.",
      en: "Shows the original business document that created the entry, such as an invoice, payment, or return.",
    },
    whyItExists: {
      ar: "يساعدك على الرجوع للمستند الأصلي بدل تعديل الأثر المالي بمعزل عن العملية.",
      en: "It helps you go back to the original document instead of changing the financial effect in isolation.",
    },
    summary: {
      ar: "المستند المرتبط هو طريقك لفهم مصدر القيد.",
      en: "The linked source document tells you where the entry came from.",
    },
    aliases: ["source document", "reference", "مرجع", "المستند"],
  },
  {
    id: "journal.detail_status",
    pageKey: "journal",
    kind: "status",
    label: {
      ar: "حالة القيد",
      en: "Journal entry status",
    },
    purpose: {
      ar: "توضح هل القيد ما زال قابلًا للمراجعة أم أصبح معتمدًا ضمن التقارير.",
      en: "Shows whether the entry is still reviewable or already included in financial reports.",
    },
    whatToCheck: {
      ar: "إذا كان القيد معتمدًا، يكون التصحيح عادة بقيد عكسي أو من المستند الأصلي.",
      en: "If the entry is already posted, corrections usually happen through a reversal or the source document.",
    },
    summary: {
      ar: "الحالة تساعدك تعرف هل تراجع القيد أم تصححه بطريقة محاسبية مناسبة.",
      en: "The status helps you know whether to review the entry or correct it properly.",
    },
    aliases: ["status", "posted", "حالة", "معتمد"],
  },
  {
    id: "journal.lines_table",
    pageKey: "journal",
    kind: "field",
    label: {
      ar: "بنود القيد",
      en: "Journal entry lines",
    },
    purpose: {
      ar: "تعرض الحسابات والمبالغ التي تأثرت بهذه العملية.",
      en: "Shows the accounts and amounts affected by this transaction.",
    },
    whyItExists: {
      ar: "كل قيد يحتاج طرفًا مدينًا وطرفًا دائنًا حتى يوضح من أين جاءت القيمة وأين ذهبت.",
      en: "Every entry needs debit and credit sides to explain where the value came from and where it went.",
    },
    summary: {
      ar: "بنود القيد هي تفاصيل الأثر المالي للعملية.",
      en: "Entry lines are the detailed financial effect of the transaction.",
    },
    aliases: ["lines", "entry lines", "بنود", "سطور القيد"],
  },
  {
    id: "journal.account",
    pageKey: "journal",
    kind: "field",
    label: {
      ar: "الحساب",
      en: "Account",
    },
    purpose: {
      ar: "يحدد الحساب المالي الذي سيتأثر بهذا السطر، مثل النقدية أو المبيعات أو المصروفات.",
      en: "Identifies the financial account affected by this line, such as cash, sales, or expenses.",
    },
    whatToCheck: {
      ar: "راجع اسم الحساب وكوده حتى لا يتم تحميل المبلغ على حساب غير مقصود.",
      en: "Check the account name and code so the amount is not assigned to the wrong account.",
    },
    summary: {
      ar: "اختيار الحساب الصحيح هو أساس قراءة القيد بشكل صحيح.",
      en: "Choosing the right account is the base for reading the entry correctly.",
    },
    aliases: ["account", "الحساب", "اسم الحساب"],
  },
  {
    id: "journal.line_description",
    pageKey: "journal",
    kind: "field",
    label: {
      ar: "وصف السطر",
      en: "Line description",
    },
    purpose: {
      ar: "يوضح سبب المبلغ داخل هذا السطر تحديدًا، خاصة عندما يحتوي القيد على أكثر من حساب.",
      en: "Explains the reason for this specific line, especially when the entry includes multiple accounts.",
    },
    summary: {
      ar: "وصف السطر يساعد على فهم كل جزء من القيد.",
      en: "The line description helps explain each part of the entry.",
    },
    aliases: ["line description", "line memo", "وصف السطر"],
  },
  {
    id: "journal.debit_amount",
    pageKey: "journal",
    kind: "field",
    label: {
      ar: "المبلغ المدين",
      en: "Debit amount",
    },
    purpose: {
      ar: "يمثل الطرف الذي يستقبل القيمة أو يزيد حسب طبيعة الحساب.",
      en: "Represents the side receiving value or increasing depending on the account type.",
    },
    example: {
      ar: "عند تحصيل نقدية من عميل، غالبًا تظهر النقدية في الطرف المدين لأنها زادت.",
      en: "When cash is collected from a customer, cash often appears on the debit side because it increased.",
    },
    summary: {
      ar: "المدين لا يعني دائمًا خطأ أو دين؛ هو جانب من طريقة تسجيل الأثر المالي.",
      en: "Debit does not always mean a problem or debt; it is one side of recording financial impact.",
    },
    aliases: ["debit", "debit amount", "مدين"],
  },
  {
    id: "journal.credit_amount",
    pageKey: "journal",
    kind: "field",
    label: {
      ar: "المبلغ الدائن",
      en: "Credit amount",
    },
    purpose: {
      ar: "يمثل الطرف المقابل في القيد، ويشرح من أين جاءت القيمة أو أي حساب تأثر في الاتجاه الآخر.",
      en: "Represents the opposite side of the entry and explains where the value came from or which account moved the other way.",
    },
    example: {
      ar: "عند بيع منتج، غالبًا يظهر إيراد المبيعات في الطرف الدائن لأنه زاد.",
      en: "When a product is sold, sales revenue often appears on the credit side because it increased.",
    },
    summary: {
      ar: "الدائن هو الطرف المكمل للمدين حتى يكون القيد متوازنًا.",
      en: "Credit completes the debit side so the entry stays balanced.",
    },
    aliases: ["credit", "credit amount", "دائن"],
  },
  {
    id: "journal.totals",
    pageKey: "journal",
    kind: "field",
    label: {
      ar: "إجمالي المدين والدائن",
      en: "Debit and credit totals",
    },
    purpose: {
      ar: "يجمع طرفي القيد حتى تتأكد أن الأثر المالي متساوٍ من الجانبين.",
      en: "Adds both sides of the entry so you can confirm the financial effect is balanced.",
    },
    whatToCheck: {
      ar: "يجب أن يكون إجمالي المدين مساويًا لإجمالي الدائن قبل حفظ قيد يدوي.",
      en: "Debit total should equal credit total before saving a manual entry.",
    },
    summary: {
      ar: "تساوي الإجماليات يعني أن القيد متوازن.",
      en: "Equal totals mean the entry is balanced.",
    },
    aliases: ["totals", "total debit", "total credit", "الإجماليات"],
  },
  {
    id: "journal.balance_difference",
    pageKey: "journal",
    kind: "status",
    label: {
      ar: "الفرق بين الطرفين",
      en: "Difference between sides",
    },
    purpose: {
      ar: "ينبهك إذا كان هناك فرق بين إجمالي المدين وإجمالي الدائن.",
      en: "Alerts you when debit and credit totals do not match.",
    },
    whatToCheck: {
      ar: "إذا ظهر فرق، راجع الحسابات والمبالغ قبل الحفظ.",
      en: "If a difference appears, review the accounts and amounts before saving.",
    },
    summary: {
      ar: "أي فرق يعني أن القيد يحتاج مراجعة قبل اعتماده.",
      en: "Any difference means the entry needs review before it is accepted.",
    },
    aliases: ["difference", "imbalance", "فرق", "غير متوازن"],
  },
  {
    id: "journal.branch_cost_center",
    pageKey: "journal",
    kind: "field",
    label: {
      ar: "الفرع ومركز التكلفة",
      en: "Branch and cost center",
    },
    purpose: {
      ar: "يربط القيد بالمكان أو النشاط الذي يخصه حتى تظهر التقارير حسب الفرع أو مركز التكلفة.",
      en: "Links the entry to the location or activity it belongs to so reports can be viewed by branch or cost center.",
    },
    summary: {
      ar: "استخدمه لتوزيع الأثر المالي على المكان أو النشاط الصحيح.",
      en: "Use it to assign the financial effect to the right location or activity.",
    },
    aliases: ["branch", "cost center", "فرع", "مركز تكلفة"],
  },
  {
    id: "journal.edit_button",
    pageKey: "journal",
    kind: "button",
    label: {
      ar: "زر تعديل القيد",
      en: "Edit entry button",
    },
    purpose: {
      ar: "يفتح وضع التعديل للقيود المسموح بتعديلها فقط.",
      en: "Opens edit mode only for entries that are allowed to be changed.",
    },
    afterAction: {
      ar: "بعد الضغط ستظهر حقول التعديل، ثم يحتاج الحفظ إلى سبب واضح للمراجعة.",
      en: "After clicking, editable fields appear and saving requires a clear review reason.",
    },
    summary: {
      ar: "استخدمه فقط عندما تحتاج تصحيح قيد مسموح بتعديله.",
      en: "Use it only when you need to correct an entry that can be edited.",
    },
    aliases: ["edit", "edit entry", "تعديل"],
  },
  {
    id: "journal.save_button",
    pageKey: "journal",
    kind: "button",
    label: {
      ar: "زر حفظ القيد",
      en: "Save entry button",
    },
    purpose: {
      ar: "يحفظ التعديلات بعد التأكد من توازن القيد ووجود سبب للتعديل.",
      en: "Saves changes after confirming the entry is balanced and an edit reason is provided.",
    },
    whatToCheck: {
      ar: "راجع التاريخ والوصف والحسابات والمبالغ قبل الحفظ.",
      en: "Review the date, description, accounts, and amounts before saving.",
    },
    afterAction: {
      ar: "بعد الحفظ يتم تحديث القيد وتسجيل سبب التعديل للمراجعة.",
      en: "After saving, the entry is updated and the edit reason is kept for review.",
    },
    summary: {
      ar: "الحفظ يثبت التعديل المحاسبي، لذلك راجعه جيدًا أولًا.",
      en: "Saving confirms the accounting change, so review it carefully first.",
    },
    aliases: ["save", "save entry", "حفظ"],
  },
  {
    id: "journal.edit_reason",
    pageKey: "journal",
    kind: "field",
    label: {
      ar: "سبب التعديل",
      en: "Edit reason",
    },
    purpose: {
      ar: "يوثق لماذا تم تعديل القيد حتى يستطيع المراجع فهم سبب التصحيح لاحقًا.",
      en: "Documents why the entry was changed so reviewers can understand the correction later.",
    },
    whatToCheck: {
      ar: "اكتب سببًا عمليًا واضحًا مثل تصحيح مبلغ أو اختيار حساب أدق.",
      en: "Write a clear business reason, such as correcting an amount or choosing a more accurate account.",
    },
    summary: {
      ar: "سبب التعديل يحافظ على وضوح المراجعة المحاسبية.",
      en: "The edit reason keeps accounting review clear.",
    },
    aliases: ["edit reason", "reason", "سبب التعديل"],
  },
  {
    id: "journal.source_document_message",
    pageKey: "journal",
    kind: "message",
    label: {
      ar: "رسالة القيد المرتبط بمستند",
      en: "Source-linked entry message",
    },
    purpose: {
      ar: "توضح أن القيد جاء من مستند تشغيلي، وأن التصحيح الأفضل يكون من ذلك المستند.",
      en: "Explains that the entry came from an operational document and should usually be corrected from that document.",
    },
    summary: {
      ar: "عند ظهور هذه الرسالة، ابدأ بالمستند الأصلي قبل تعديل القيد.",
      en: "When this message appears, start with the original document before changing the entry.",
    },
    aliases: ["linked message", "source message", "رسالة المستند"],
  },
  {
    id: "journal.generate_lines_button",
    pageKey: "journal",
    kind: "button",
    label: {
      ar: "زر إنشاء بنود القيد",
      en: "Generate entry lines button",
    },
    purpose: {
      ar: "يوضح للمستخدم أن بنود القيد الخاصة بالمستندات يجب أن تأتي من المستند الأصلي.",
      en: "Shows that lines for document-based entries should come from the original source document.",
    },
    afterAction: {
      ar: "إذا لم يتم الإنشاء هنا، ارجع إلى الفاتورة أو الدفعة أو المستند الذي أنشأ القيد.",
      en: "If lines are not generated here, return to the invoice, payment, or source document that created the entry.",
    },
    summary: {
      ar: "بنود القيود المرتبطة تُدار من المستند الأصلي.",
      en: "Linked entry lines are managed from the source document.",
    },
    aliases: ["generate lines", "create lines", "إنشاء البنود"],
  },
  {
    id: "chart_of_accounts.as_of_date",
    pageKey: "chart_of_accounts",
    kind: "field",
    label: {
      ar: "تاريخ عرض الرصيد",
      en: "Balance as-of date",
    },
    purpose: {
      ar: "يحدد التاريخ الذي تريد رؤية أرصدة الحسابات عنده.",
      en: "Sets the date used to show account balances.",
    },
    summary: {
      ar: "غيّر التاريخ لترى الرصيد كما كان في يوم معين.",
      en: "Change the date to see balances as they were on a specific day.",
    },
    aliases: ["as of date", "balance date", "تاريخ الرصيد"],
  },
  {
    id: "chart_of_accounts.new_account_button",
    pageKey: "chart_of_accounts",
    kind: "button",
    label: {
      ar: "زر حساب جديد",
      en: "New account button",
    },
    purpose: {
      ar: "يفتح نموذج إضافة حساب جديد داخل الشجرة المحاسبية.",
      en: "Opens the form to add a new account to the chart of accounts.",
    },
    whatToCheck: {
      ar: "تأكد من نوع الحساب ومكانه في الشجرة قبل الإضافة.",
      en: "Check the account type and its place in the hierarchy before adding it.",
    },
    afterAction: {
      ar: "بعد الإضافة سيظهر الحساب ويمكن استخدامه في القيود والتقارير.",
      en: "After adding it, the account appears and can be used in entries and reports.",
    },
    summary: {
      ar: "أضف حسابًا جديدًا فقط عندما تحتاج تصنيفًا ماليًا واضحًا.",
      en: "Add a new account only when you need a clear financial category.",
    },
    aliases: ["new account", "add account", "حساب جديد"],
  },
  {
    id: "chart_of_accounts.quick_bank_button",
    pageKey: "chart_of_accounts",
    kind: "button",
    label: {
      ar: "زر حساب بنكي سريع",
      en: "Quick bank account button",
    },
    purpose: {
      ar: "يساعدك على إنشاء حساب بنكي أساسي بسرعة عند الحاجة لتسجيل مدفوعات أو تحصيلات بنكية.",
      en: "Helps create a basic bank account quickly when you need to track bank payments or collections.",
    },
    summary: {
      ar: "استخدمه لتجهيز حساب بنكي شائع بسرعة.",
      en: "Use it to prepare a common bank account quickly.",
    },
    aliases: ["quick bank", "bank account", "حساب بنكي"],
  },
  {
    id: "chart_of_accounts.quick_cash_button",
    pageKey: "chart_of_accounts",
    kind: "button",
    label: {
      ar: "زر خزينة سريعة",
      en: "Quick cash account button",
    },
    purpose: {
      ar: "يساعدك على إنشاء حساب نقدية للصندوق عند الحاجة لتسجيل تحصيل أو صرف نقدي.",
      en: "Helps create a cash account when you need to track cash collection or spending.",
    },
    summary: {
      ar: "استخدمه لتجهيز حساب نقدية أساسي بسرعة.",
      en: "Use it to prepare a basic cash account quickly.",
    },
    aliases: ["quick cash", "cash account", "خزينة"],
  },
  {
    id: "chart_of_accounts.account_code",
    pageKey: "chart_of_accounts",
    kind: "field",
    label: {
      ar: "كود الحساب",
      en: "Account code",
    },
    purpose: {
      ar: "يعطي الحساب رقمًا أو رمزًا منظمًا يسهل البحث والترتيب داخل الشجرة.",
      en: "Gives the account an organized code that makes searching and sorting easier.",
    },
    whatToCheck: {
      ar: "اختر كودًا متسقًا مع نوع الحساب ومكانه في الشجرة.",
      en: "Choose a code that matches the account type and its place in the hierarchy.",
    },
    summary: {
      ar: "الكود هو عنوان الحساب المختصر داخل النظام.",
      en: "The code is the account's short address in the system.",
    },
    aliases: ["account code", "code", "كود الحساب", "رمز الحساب"],
  },
  {
    id: "chart_of_accounts.account_name",
    pageKey: "chart_of_accounts",
    kind: "field",
    label: {
      ar: "اسم الحساب",
      en: "Account name",
    },
    purpose: {
      ar: "يوضح معنى الحساب للمستخدمين عند تسجيل القيود أو قراءة التقارير.",
      en: "Explains what the account means when users create entries or read reports.",
    },
    whatToCheck: {
      ar: "استخدم اسمًا مفهومًا مثل مبيعات محلية أو بنك الشركة بدل اسم مبهم.",
      en: "Use a clear name such as Local Sales or Company Bank instead of a vague label.",
    },
    summary: {
      ar: "اسم الحساب يجب أن يشرح استخدامه العملي.",
      en: "The account name should explain its practical use.",
    },
    aliases: ["account name", "name", "اسم الحساب"],
  },
  {
    id: "chart_of_accounts.account_type",
    pageKey: "chart_of_accounts",
    kind: "field",
    label: {
      ar: "نوع الحساب",
      en: "Account type",
    },
    purpose: {
      ar: "يصنف الحساب ضمن أصول أو التزامات أو حقوق ملكية أو إيرادات أو مصروفات.",
      en: "Classifies the account as asset, liability, equity, income, or expense.",
    },
    whyItExists: {
      ar: "نوع الحساب يحدد أين يظهر في التقارير وكيف تُقرأ زيادته أو نقصانه.",
      en: "The type controls where the account appears in reports and how increases or decreases are read.",
    },
    summary: {
      ar: "نوع الحساب هو التصنيف المالي الأساسي له.",
      en: "The account type is its main financial category.",
    },
    aliases: ["account type", "type", "نوع الحساب"],
  },
  {
    id: "chart_of_accounts.subtype",
    pageKey: "chart_of_accounts",
    kind: "field",
    label: {
      ar: "التصنيف الفرعي",
      en: "Account category",
    },
    purpose: {
      ar: "يعطي الحساب معنى أدق داخل نوعه، مثل بنك أو نقدية أو مخزون أو مصروفات تشغيل.",
      en: "Gives the account a more specific meaning within its type, such as bank, cash, inventory, or operating expense.",
    },
    summary: {
      ar: "التصنيف الفرعي يساعد التقارير على قراءة الحساب بشكل أدق.",
      en: "The category helps reports interpret the account more accurately.",
    },
    aliases: ["category", "subtype", "تصنيف", "فئة"],
  },
  {
    id: "chart_of_accounts.parent_account",
    pageKey: "chart_of_accounts",
    kind: "field",
    label: {
      ar: "الحساب الأب",
      en: "Parent account",
    },
    purpose: {
      ar: "يحدد مكان الحساب داخل الشجرة وتحت أي مجموعة يظهر.",
      en: "Sets where the account appears in the hierarchy and under which group.",
    },
    example: {
      ar: "يمكن أن يكون حساب بنك الشركة داخل مجموعة النقدية والبنوك.",
      en: "A Company Bank account can sit under a Cash and Banks group.",
    },
    summary: {
      ar: "الحساب الأب ينظم الحسابات في مجموعات مفهومة.",
      en: "The parent account organizes accounts into understandable groups.",
    },
    aliases: ["parent account", "parent", "حساب أب", "حساب فرعي"],
  },
  {
    id: "chart_of_accounts.account_nature",
    pageKey: "chart_of_accounts",
    kind: "field",
    label: {
      ar: "طبيعة الحساب",
      en: "Account nature",
    },
    purpose: {
      ar: "توضح الجانب المعتاد للحساب: هل يزيد غالبًا في المدين أم في الدائن.",
      en: "Shows the account's usual side: whether it normally increases on the debit or credit side.",
    },
    whyItExists: {
      ar: "تساعد المستخدم على فهم لماذا يظهر الرصيد في جانب معين داخل التقارير.",
      en: "It helps users understand why a balance appears on a certain side in reports.",
    },
    summary: {
      ar: "طبيعة الحساب تساعدك تقرأ الرصيد بدون تعقيد.",
      en: "Account nature helps you read the balance without complexity.",
    },
    aliases: ["nature", "normal side", "طبيعة الحساب"],
  },
  {
    id: "chart_of_accounts.opening_balance",
    pageKey: "chart_of_accounts",
    kind: "field",
    label: {
      ar: "الرصيد الافتتاحي",
      en: "Opening balance",
    },
    purpose: {
      ar: "يمثل رصيد الحساب عند بدء استخدام النظام أو بداية الفترة.",
      en: "Represents the account balance when starting to use the system or at the beginning of a period.",
    },
    whatToCheck: {
      ar: "تأكد من الرقم قبل الحفظ لأنه يؤثر على قراءة الرصيد الحالي.",
      en: "Confirm the amount before saving because it affects the current balance.",
    },
    summary: {
      ar: "الرصيد الافتتاحي هو نقطة البداية للحساب.",
      en: "The opening balance is the account's starting point.",
    },
    aliases: ["opening balance", "opening", "رصيد افتتاحي"],
  },
  {
    id: "chart_of_accounts.current_balance",
    pageKey: "chart_of_accounts",
    kind: "field",
    label: {
      ar: "الرصيد الحالي",
      en: "Current balance",
    },
    purpose: {
      ar: "يوضح قيمة الحساب بعد احتساب الحركات حتى التاريخ المحدد.",
      en: "Shows the account value after movements up to the selected date.",
    },
    summary: {
      ar: "الرصيد الحالي هو الصورة العملية لموقف الحساب الآن أو في التاريخ المختار.",
      en: "The current balance is the practical view of the account at the selected date.",
    },
    aliases: ["current balance", "balance", "الرصيد الحالي"],
  },
  {
    id: "chart_of_accounts.search",
    pageKey: "chart_of_accounts",
    kind: "field",
    label: {
      ar: "البحث عن حساب",
      en: "Account search",
    },
    purpose: {
      ar: "يساعدك على الوصول بسرعة إلى حساب بالاسم أو الكود.",
      en: "Helps you quickly find an account by name or code.",
    },
    summary: {
      ar: "استخدم البحث عندما تكون الشجرة كبيرة أو الحساب غير ظاهر أمامك.",
      en: "Use search when the chart is large or the account is not visible.",
    },
    aliases: ["search", "account search", "بحث"],
  },
  {
    id: "chart_of_accounts.type_filter",
    pageKey: "chart_of_accounts",
    kind: "field",
    label: {
      ar: "فلتر نوع الحساب",
      en: "Account type filter",
    },
    purpose: {
      ar: "يعرض حسابات نوع معين فقط حتى تراجع جزءًا محددًا من الشجرة.",
      en: "Shows only one account type so you can review a focused part of the chart.",
    },
    summary: {
      ar: "الفلتر يقلل الضوضاء عندما تبحث داخل نوع حساب محدد.",
      en: "The filter reduces noise when reviewing one account type.",
    },
    aliases: ["type filter", "filter", "فلتر النوع"],
  },
  {
    id: "chart_of_accounts.hierarchy_toggle",
    pageKey: "chart_of_accounts",
    kind: "button",
    label: {
      ar: "عرض الشجرة",
      en: "Tree view toggle",
    },
    purpose: {
      ar: "يبدل بين عرض الحسابات كشجرة مرتبة أو كجدول مباشر.",
      en: "Switches between a hierarchy view and a direct table view.",
    },
    summary: {
      ar: "عرض الشجرة يساعدك ترى علاقة الحسابات ببعضها.",
      en: "Tree view helps you see how accounts relate to each other.",
    },
    aliases: ["tree view", "hierarchy", "عرض الشجرة"],
  },
  {
    id: "chart_of_accounts.groups_only_toggle",
    pageKey: "chart_of_accounts",
    kind: "button",
    label: {
      ar: "إظهار المجموعات فقط",
      en: "Show groups only toggle",
    },
    purpose: {
      ar: "يعرض الحسابات الرئيسية التي تجمع تحتها حسابات فرعية.",
      en: "Shows only group accounts that contain subaccounts.",
    },
    summary: {
      ar: "استخدمه لفهم هيكل الشجرة قبل الدخول في التفاصيل.",
      en: "Use it to understand the chart structure before viewing details.",
    },
    aliases: ["groups only", "account groups", "المجموعات فقط"],
  },
  {
    id: "chart_of_accounts.accounts_table",
    pageKey: "chart_of_accounts",
    kind: "field",
    label: {
      ar: "جدول الحسابات",
      en: "Accounts table",
    },
    purpose: {
      ar: "يعرض الحسابات وأنواعها وأرصدة البداية والأرصدة الحالية في مكان واحد.",
      en: "Shows accounts, types, opening balances, and current balances in one place.",
    },
    summary: {
      ar: "الجدول هو العرض العملي لقاموس الحسابات.",
      en: "The table is the practical view of the account dictionary.",
    },
    aliases: ["accounts table", "accounts", "جدول الحسابات"],
  },
  {
    id: "chart_of_accounts.edit_button",
    pageKey: "chart_of_accounts",
    kind: "button",
    label: {
      ar: "زر تعديل حساب",
      en: "Edit account button",
    },
    purpose: {
      ar: "يفتح بيانات الحساب لتعديل اسمه أو تصنيفه أو تفاصيله المسموح بتغييرها.",
      en: "Opens the account details to update its name, category, or editable information.",
    },
    summary: {
      ar: "استخدمه لتصحيح بيانات الحساب بدون تغيير العمليات نفسها.",
      en: "Use it to correct account details without changing transactions.",
    },
    aliases: ["edit account", "edit", "تعديل حساب"],
  },
  {
    id: "chart_of_accounts.delete_button",
    pageKey: "chart_of_accounts",
    kind: "button",
    label: {
      ar: "زر حذف حساب",
      en: "Delete account button",
    },
    purpose: {
      ar: "يطلب حذف حساب غير مستخدم أو غير مطلوب، حسب الصلاحيات والقواعد الحالية.",
      en: "Requests deletion of an unused or unnecessary account, depending on permissions and current rules.",
    },
    whatToCheck: {
      ar: "تأكد أن الحساب ليس مستخدمًا في قيود أو مجموعة فرعية قبل الحذف.",
      en: "Confirm the account is not used in entries or as a parent group before deleting.",
    },
    summary: {
      ar: "الحذف مناسب للحسابات غير المستخدمة فقط.",
      en: "Deletion is suitable only for unused accounts.",
    },
    aliases: ["delete account", "delete", "حذف حساب"],
  },
  {
    id: "trial_balance.report_date",
    pageKey: "trial_balance",
    kind: "field",
    label: {
      ar: "تاريخ التقرير",
      en: "Report date",
    },
    purpose: {
      ar: "يحدد اليوم الذي يعرض ميزان المراجعة الأرصدة حتى نهايته.",
      en: "Sets the date through which the trial balance shows account balances.",
    },
    summary: {
      ar: "غيّر التاريخ لترى ميزان المراجعة كما في يوم معين.",
      en: "Change the date to view the trial balance as of a specific day.",
    },
    aliases: ["report date", "as of date", "تاريخ التقرير"],
  },
  {
    id: "trial_balance.report_status",
    pageKey: "trial_balance",
    kind: "status",
    label: {
      ar: "حالة ميزان المراجعة",
      en: "Trial balance status",
    },
    purpose: {
      ar: "توضح هل إجمالي المدين يساوي إجمالي الدائن في نهاية الفترة المختارة.",
      en: "Shows whether total debit equals total credit for the selected period end.",
    },
    whatToCheck: {
      ar: "إذا كان غير متوازن، راجع القيود أو الفترات التي يظهر فيها الفرق.",
      en: "If it is unbalanced, review the entries or periods where the difference appears.",
    },
    summary: {
      ar: "الحالة المتوازنة تعني أن الحسابات متسقة من حيث الطرفين.",
      en: "A balanced status means both sides of the accounts are consistent.",
    },
    aliases: ["balanced", "unbalanced", "status", "متوازن", "غير متوازن"],
  },
  {
    id: "trial_balance.warning_message",
    pageKey: "trial_balance",
    kind: "message",
    label: {
      ar: "رسالة التحذير",
      en: "Warning message",
    },
    purpose: {
      ar: "تنبهك إلى وجود فرق أو مشكلة تمنع قراءة التقرير بثقة كاملة.",
      en: "Alerts you to a difference or issue that affects confidence in the report.",
    },
    summary: {
      ar: "التحذير يعني أن التقرير يحتاج مراجعة قبل الاعتماد عليه.",
      en: "A warning means the report needs review before relying on it.",
    },
    aliases: ["warning", "error", "تحذير", "خطأ"],
  },
  {
    id: "trial_balance.charts",
    pageKey: "trial_balance",
    kind: "field",
    label: {
      ar: "الرسوم البيانية",
      en: "Charts",
    },
    purpose: {
      ar: "تعطي صورة سريعة عن توزيع مبالغ المدين والدائن بين الحسابات.",
      en: "Gives a quick visual view of debit and credit amounts across accounts.",
    },
    summary: {
      ar: "الرسوم تساعدك تلاحظ الحسابات الأكبر تأثيرًا بسرعة.",
      en: "Charts help you quickly spot the accounts with the largest impact.",
    },
    aliases: ["charts", "graphs", "رسوم"],
  },
  {
    id: "trial_balance.accounts_table",
    pageKey: "trial_balance",
    kind: "field",
    label: {
      ar: "جدول ميزان المراجعة",
      en: "Trial balance table",
    },
    purpose: {
      ar: "يعرض كل حساب مع أرصدة البداية وحركة الفترة ورصيد النهاية.",
      en: "Lists each account with opening balances, period movement, and ending balance.",
    },
    summary: {
      ar: "الجدول هو التفاصيل الأساسية للتقرير.",
      en: "The table is the core detail of the report.",
    },
    aliases: ["trial balance table", "accounts table", "جدول ميزان المراجعة"],
  },
  {
    id: "trial_balance.account_row",
    pageKey: "trial_balance",
    kind: "field",
    label: {
      ar: "صف الحساب",
      en: "Account row",
    },
    purpose: {
      ar: "يعرض حركة ورصيد حساب واحد، ويمكن فتح القيود المرتبطة به للمراجعة.",
      en: "Shows movement and balance for one account, with access to related entries for review.",
    },
    summary: {
      ar: "صف الحساب يساعدك تنتقل من الرقم الإجمالي إلى تفاصيل الحساب.",
      en: "An account row helps you move from the total number to account details.",
    },
    aliases: ["account row", "account line", "صف الحساب"],
  },
  {
    id: "trial_balance.opening_balance",
    pageKey: "trial_balance",
    kind: "field",
    label: {
      ar: "رصيد أول الفترة",
      en: "Opening balance",
    },
    purpose: {
      ar: "يوضح رصيد الحساب قبل حركة الفترة المعروضة.",
      en: "Shows the account balance before the displayed period movement.",
    },
    summary: {
      ar: "رصيد أول الفترة هو نقطة البداية في التقرير.",
      en: "Opening balance is the report's starting point.",
    },
    aliases: ["opening debit", "opening credit", "رصيد أول الفترة"],
  },
  {
    id: "trial_balance.period_movement",
    pageKey: "trial_balance",
    kind: "field",
    label: {
      ar: "حركة الفترة",
      en: "Period movement",
    },
    purpose: {
      ar: "توضح ما زاد أو نقص على الحساب خلال الفترة حتى تاريخ التقرير.",
      en: "Shows what increased or decreased on the account during the period up to the report date.",
    },
    summary: {
      ar: "حركة الفترة تشرح سبب تغير الرصيد.",
      en: "Period movement explains why the balance changed.",
    },
    aliases: ["period debit", "period credit", "movement", "حركة الفترة"],
  },
  {
    id: "trial_balance.closing_balance",
    pageKey: "trial_balance",
    kind: "field",
    label: {
      ar: "رصيد نهاية الفترة",
      en: "Closing balance",
    },
    purpose: {
      ar: "يعرض الرصيد النهائي للحساب بعد رصيد البداية وحركة الفترة.",
      en: "Shows the final account balance after opening balance and period movement.",
    },
    summary: {
      ar: "رصيد النهاية هو الرقم الذي تعتمد عليه في قراءة موقف الحساب.",
      en: "Closing balance is the number used to read the account's position.",
    },
    aliases: ["closing balance", "ending balance", "الرصيد الختامي"],
  },
  {
    id: "trial_balance.debit_total",
    pageKey: "trial_balance",
    kind: "field",
    label: {
      ar: "إجمالي المدين",
      en: "Total debit",
    },
    purpose: {
      ar: "يجمع كل المبالغ التي ظهرت في جانب المدين داخل التقرير.",
      en: "Adds all amounts shown on the debit side of the report.",
    },
    summary: {
      ar: "إجمالي المدين يجب أن يقابله إجمالي دائن مساوٍ في تقرير متوازن.",
      en: "Total debit should be matched by equal total credit in a balanced report.",
    },
    aliases: ["total debit", "debit total", "إجمالي المدين"],
  },
  {
    id: "trial_balance.credit_total",
    pageKey: "trial_balance",
    kind: "field",
    label: {
      ar: "إجمالي الدائن",
      en: "Total credit",
    },
    purpose: {
      ar: "يجمع كل المبالغ التي ظهرت في جانب الدائن داخل التقرير.",
      en: "Adds all amounts shown on the credit side of the report.",
    },
    summary: {
      ar: "إجمالي الدائن هو الطرف المقابل لإجمالي المدين.",
      en: "Total credit is the matching side for total debit.",
    },
    aliases: ["total credit", "credit total", "إجمالي الدائن"],
  },
  {
    id: "trial_balance.difference",
    pageKey: "trial_balance",
    kind: "status",
    label: {
      ar: "الفرق",
      en: "Difference",
    },
    purpose: {
      ar: "يوضح قيمة عدم التوازن بين إجمالي المدين وإجمالي الدائن إذا وُجدت.",
      en: "Shows any imbalance between total debit and total credit.",
    },
    whatToCheck: {
      ar: "إذا لم يكن الفرق صفرًا، ابدأ بمراجعة القيود الحديثة أو غير المكتملة.",
      en: "If the difference is not zero, start by reviewing recent or incomplete entries.",
    },
    summary: {
      ar: "الفرق صفر هو الوضع الطبيعي لميزان مراجعة سليم.",
      en: "A zero difference is the normal result for a healthy trial balance.",
    },
    aliases: ["difference", "imbalance", "فرق"],
  },
  {
    id: "trial_balance.print_button",
    pageKey: "trial_balance",
    kind: "button",
    label: {
      ar: "زر الطباعة",
      en: "Print button",
    },
    purpose: {
      ar: "ينشئ نسخة قابلة للطباعة من التقرير للمراجعة أو المشاركة.",
      en: "Creates a printable version of the report for review or sharing.",
    },
    summary: {
      ar: "استخدم الطباعة عندما تحتاج نسخة رسمية أو ورقية.",
      en: "Use print when you need an official or paper copy.",
    },
    aliases: ["print", "طباعة"],
  },
  {
    id: "trial_balance.export_csv_button",
    pageKey: "trial_balance",
    kind: "button",
    label: {
      ar: "زر تصدير CSV",
      en: "Export CSV button",
    },
    purpose: {
      ar: "ينزل بيانات التقرير في ملف يمكن فتحه في الجداول للتحليل أو المشاركة.",
      en: "Downloads the report data in a spreadsheet-friendly file for analysis or sharing.",
    },
    summary: {
      ar: "استخدم التصدير عندما تريد تحليل الأرقام خارج النظام.",
      en: "Use export when you want to analyze the numbers outside the system.",
    },
    aliases: ["export", "csv", "تصدير"],
  },
  {
    id: "trial_balance.retry_button",
    pageKey: "trial_balance",
    kind: "button",
    label: {
      ar: "زر المحاولة مرة أخرى",
      en: "Try again button",
    },
    purpose: {
      ar: "يعيد تحميل التقرير إذا حدث خطأ مؤقت أثناء جلب البيانات.",
      en: "Reloads the report if a temporary loading error occurs.",
    },
    summary: {
      ar: "استخدمه بعد التأكد من الاتصال أو اختيار تاريخ صحيح.",
      en: "Use it after checking the connection or selected date.",
    },
    aliases: ["retry", "try again", "حاول مرة أخرى"],
  },
  {
    id: "manufacturing_production_order_detail.status",
    pageKey: "manufacturing_production_order_detail",
    kind: "status",
    label: {
      ar: "حالة أمر التصنيع",
      en: "Production order status",
    },
    purpose: {
      ar: "توضح المرحلة الحالية لأمر التصنيع: هل ما زال قيد الإعداد، جاهزًا للتنفيذ، تحت التشغيل، مكتملًا، أو ملغيًا.",
      en: "Shows the current stage of the production order: preparation, ready for execution, in progress, completed, or cancelled.",
    },
    whatToCheck: {
      ar: "راجع الحالة قبل الضغط على أي إجراء لأن الأزرار المتاحة تعتمد على مرحلة الأمر.",
      en: "Check the status before taking action because available buttons depend on the order stage.",
    },
    summary: {
      ar: "الحالة تخبرك ما الخطوة المسموح بها الآن في أمر التصنيع.",
      en: "The status tells you which production step is allowed now.",
    },
    aliases: ["production status", "order status", "حالة أمر التصنيع"],
  },
  {
    id: "manufacturing_production_order_detail.finished_product",
    pageKey: "manufacturing_production_order_detail",
    kind: "field",
    label: {
      ar: "المنتج النهائي",
      en: "Finished product",
    },
    purpose: {
      ar: "يوضح المنتج الذي سيتم تصنيعه وإضافته للمخزون بعد اكتمال الأمر.",
      en: "Shows the item that will be produced and added to inventory when the order is completed.",
    },
    summary: {
      ar: "هذا هو الناتج النهائي المتوقع من أمر التصنيع.",
      en: "This is the expected output of the production order.",
    },
    aliases: ["finished product", "product", "المنتج النهائي"],
  },
  {
    id: "manufacturing_production_order_detail.planned_quantity",
    pageKey: "manufacturing_production_order_detail",
    kind: "field",
    label: {
      ar: "الكمية المخططة",
      en: "Planned quantity",
    },
    purpose: {
      ar: "تحدد عدد الوحدات المطلوب تصنيعها في هذا الأمر.",
      en: "Defines how many units this production order is expected to produce.",
    },
    whatToCheck: {
      ar: "تأكد أن الكمية مناسبة للطلب أو الحاجة قبل إصدار الأمر أو إعادة توليد بياناته.",
      en: "Confirm the quantity matches demand before releasing or regenerating the order.",
    },
    summary: {
      ar: "الكمية المخططة هي هدف الإنتاج لهذا الأمر.",
      en: "Planned quantity is the production target for this order.",
    },
    aliases: ["planned quantity", "planned qty", "الكمية المخططة"],
  },
  {
    id: "manufacturing_production_order_detail.completed_quantity",
    pageKey: "manufacturing_production_order_detail",
    kind: "field",
    label: {
      ar: "الكمية المكتملة",
      en: "Completed quantity",
    },
    purpose: {
      ar: "توضح ما تم إنتاجه فعليًا من الكمية المخططة.",
      en: "Shows how much has actually been produced from the planned quantity.",
    },
    summary: {
      ar: "الكمية المكتملة تقيس تقدم الإنتاج الفعلي.",
      en: "Completed quantity measures actual production progress.",
    },
    aliases: ["completed quantity", "completed qty", "الكمية المكتملة"],
  },
  {
    id: "manufacturing_production_order_detail.remaining_quantity",
    pageKey: "manufacturing_production_order_detail",
    kind: "field",
    label: {
      ar: "الكمية المتبقية",
      en: "Remaining quantity",
    },
    purpose: {
      ar: "تساعدك على معرفة الفرق بين المطلوب إنتاجه وما تم إنجازه حتى الآن.",
      en: "Helps you understand the gap between what should be produced and what is already completed.",
    },
    summary: {
      ar: "المتبقي يوضح حجم العمل الذي لم يكتمل بعد.",
      en: "Remaining quantity shows the production work still pending.",
    },
    aliases: ["remaining quantity", "remaining", "المتبقي"],
  },
  {
    id: "manufacturing_production_order_detail.bill_of_materials",
    pageKey: "manufacturing_production_order_detail",
    kind: "field",
    label: {
      ar: "قائمة المواد المستخدمة",
      en: "Bill of materials",
    },
    purpose: {
      ar: "تحدد المواد أو المكونات التي يعتمد عليها تصنيع المنتج النهائي.",
      en: "Defines the materials or components used to make the finished product.",
    },
    whyItExists: {
      ar: "بدون قائمة مواد صحيحة قد يتم صرف مواد غير مناسبة أو بكميات غير دقيقة.",
      en: "Without the right material list, production may consume the wrong items or quantities.",
    },
    summary: {
      ar: "قائمة المواد تجيب عن سؤال: مم نصنع المنتج؟",
      en: "The bill of materials answers: what is the product made from?",
    },
    aliases: ["bill of materials", "materials", "قائمة المواد"],
  },
  {
    id: "manufacturing_production_order_detail.routing",
    pageKey: "manufacturing_production_order_detail",
    kind: "field",
    label: {
      ar: "مسار التشغيل",
      en: "Routing",
    },
    purpose: {
      ar: "يوضح خطوات التصنيع التي سيمر بها المنتج وترتيب تنفيذها.",
      en: "Shows the production steps the item should pass through and their order.",
    },
    summary: {
      ar: "مسار التشغيل يجيب عن سؤال: كيف نصنع المنتج؟",
      en: "Routing answers: how is the product made?",
    },
    aliases: ["routing", "operations route", "مسار التشغيل"],
  },
  {
    id: "manufacturing_production_order_detail.issue_warehouse",
    pageKey: "manufacturing_production_order_detail",
    kind: "field",
    label: {
      ar: "مخزن صرف المواد",
      en: "Material issue warehouse",
    },
    purpose: {
      ar: "يحدد المخزن الذي ستخرج منه المواد الخام عند بدء أو تنفيذ الإنتاج.",
      en: "Defines the warehouse from which raw materials are issued for production.",
    },
    summary: {
      ar: "هذا هو مصدر المواد الخام لأمر التصنيع.",
      en: "This is the source warehouse for production materials.",
    },
    aliases: ["issue warehouse", "material warehouse", "مخزن الصرف"],
  },
  {
    id: "manufacturing_production_order_detail.receipt_warehouse",
    pageKey: "manufacturing_production_order_detail",
    kind: "field",
    label: {
      ar: "مخزن استلام المنتج النهائي",
      en: "Finished goods receipt warehouse",
    },
    purpose: {
      ar: "يحدد المخزن الذي سيدخل إليه المنتج النهائي بعد اكتمال الإنتاج.",
      en: "Defines the warehouse where the finished product will be received after completion.",
    },
    summary: {
      ar: "هذا هو مكان دخول المنتج النهائي بعد التصنيع.",
      en: "This is where the finished product enters inventory after production.",
    },
    aliases: ["receipt warehouse", "finished goods warehouse", "مخزن الاستلام"],
  },
  {
    id: "manufacturing_production_order_detail.operations_table",
    pageKey: "manufacturing_production_order_detail",
    kind: "field",
    label: {
      ar: "جدول خطوات التشغيل",
      en: "Production operations table",
    },
    purpose: {
      ar: "يعرض خطوات تنفيذ أمر التصنيع، مركز العمل، الحالة، الكمية، والتوقيت.",
      en: "Shows production steps, work center, status, quantity, and timing.",
    },
    summary: {
      ar: "جدول العمليات هو متابعة تنفيذ التصنيع خطوة بخطوة.",
      en: "The operations table tracks production execution step by step.",
    },
    aliases: ["operations table", "production steps", "خطوات التشغيل"],
  },
  {
    id: "manufacturing_production_order_detail.operation_status",
    pageKey: "manufacturing_production_order_detail",
    kind: "status",
    label: {
      ar: "حالة خطوة التشغيل",
      en: "Operation status",
    },
    purpose: {
      ar: "توضح هل خطوة التشغيل لم تبدأ بعد، جاهزة، تحت التنفيذ، أو اكتملت.",
      en: "Shows whether an operation has not started, is ready, in progress, or completed.",
    },
    summary: {
      ar: "حالة الخطوة تساعدك تعرف أين توقف التنفيذ.",
      en: "Operation status helps you see where execution currently stands.",
    },
    aliases: ["operation status", "step status", "حالة الخطوة"],
  },
  {
    id: "manufacturing_production_order_detail.operation_quantity",
    pageKey: "manufacturing_production_order_detail",
    kind: "field",
    label: {
      ar: "كمية خطوة التشغيل",
      en: "Operation quantity",
    },
    purpose: {
      ar: "تقارن بين الكمية المخططة لهذه الخطوة وما تم إنجازه فيها.",
      en: "Compares the planned quantity for the operation with what was completed.",
    },
    summary: {
      ar: "كمية الخطوة توضح تقدم التشغيل داخل مرحلة محددة.",
      en: "Operation quantity shows progress within one production step.",
    },
    aliases: ["operation quantity", "step quantity", "كمية الخطوة"],
  },
  {
    id: "manufacturing_production_order_detail.release_button",
    pageKey: "manufacturing_production_order_detail",
    kind: "button",
    label: {
      ar: "زر إصدار أمر التصنيع",
      en: "Release production order button",
    },
    purpose: {
      ar: "ينقل أمر التصنيع من الإعداد إلى مرحلة الجاهزية للتنفيذ.",
      en: "Moves the production order from preparation to ready-for-execution.",
    },
    whatToCheck: {
      ar: "راجع المنتج والكمية وقائمة المواد ومسار التشغيل قبل الإصدار.",
      en: "Review the product, quantity, material list, and routing before release.",
    },
    afterAction: {
      ar: "بعد الإصدار يصبح الأمر جاهزًا لبدء التنفيذ حسب الحالة والصلاحيات.",
      en: "After release, the order becomes ready to start based on status and permissions.",
    },
    summary: {
      ar: "الإصدار يعني أن الأمر أصبح جاهزًا للتنفيذ.",
      en: "Release means the order is ready for execution.",
    },
    aliases: ["release", "إصدار"],
  },
  {
    id: "manufacturing_production_order_detail.start_button",
    pageKey: "manufacturing_production_order_detail",
    kind: "button",
    label: {
      ar: "زر بدء التنفيذ",
      en: "Start execution button",
    },
    purpose: {
      ar: "يسجل أن فريق الإنتاج بدأ العمل فعليًا على هذا الأمر.",
      en: "Records that the production team has actually started work on this order.",
    },
    summary: {
      ar: "استخدمه عند بداية التصنيع الفعلية.",
      en: "Use it when production actually begins.",
    },
    aliases: ["start", "start production", "بدء التنفيذ"],
  },
  {
    id: "manufacturing_production_order_detail.complete_button",
    pageKey: "manufacturing_production_order_detail",
    kind: "button",
    label: {
      ar: "زر إكمال الإنتاج",
      en: "Complete production button",
    },
    purpose: {
      ar: "يسجل الكمية التي اكتمل تصنيعها ويجهز أثرها على المخزون حسب النظام.",
      en: "Records the quantity produced and prepares its inventory effect according to the system.",
    },
    whatToCheck: {
      ar: "راجع الكمية المكتملة وتاريخ الاكتمال قبل التأكيد.",
      en: "Review completed quantity and completion date before confirming.",
    },
    afterAction: {
      ar: "بعد الإكمال تظهر نتيجة الإنتاج في متابعة الأمر والمخزون حسب الإعدادات الحالية.",
      en: "After completion, production results appear in order tracking and inventory according to current setup.",
    },
    summary: {
      ar: "الإكمال يثبت نتيجة التصنيع الفعلية.",
      en: "Completion confirms the actual production result.",
    },
    aliases: ["complete", "complete production", "إكمال الإنتاج"],
  },
  {
    id: "manufacturing_production_order_detail.cancel_button",
    pageKey: "manufacturing_production_order_detail",
    kind: "button",
    label: {
      ar: "زر إلغاء أمر التصنيع",
      en: "Cancel production order button",
    },
    purpose: {
      ar: "يوقف أمر التصنيع عندما لا يجب الاستمرار في تنفيذه.",
      en: "Stops the production order when it should no longer continue.",
    },
    whatToCheck: {
      ar: "راجع هل تم صرف مواد أو تنفيذ خطوات قبل الإلغاء حتى تفهم الأثر التشغيلي.",
      en: "Check whether materials were issued or steps were performed before cancellation to understand the operational effect.",
    },
    summary: {
      ar: "الإلغاء مناسب عندما يتوقف القرار الإنتاجي ويحتاج سببًا واضحًا.",
      en: "Cancellation is used when production should stop and needs a clear reason.",
    },
    aliases: ["cancel", "cancel production", "إلغاء"],
  },
  {
    id: "manufacturing_production_order_detail.progress_button",
    pageKey: "manufacturing_production_order_detail",
    kind: "button",
    label: {
      ar: "زر تحديث تقدم خطوة التشغيل",
      en: "Update operation progress button",
    },
    purpose: {
      ar: "يفتح نافذة لتحديث حالة خطوة تشغيل واحدة والكمية المنجزة فيها.",
      en: "Opens a dialog to update one operation step and the quantity completed in it.",
    },
    summary: {
      ar: "استخدمه لمتابعة التنفيذ على مستوى خطوة واحدة.",
      en: "Use it to track execution at the individual step level.",
    },
    aliases: ["progress", "update progress", "تحديث التقدم"],
  },
  {
    id: "manufacturing_production_order_detail.frozen_snapshot_message",
    pageKey: "manufacturing_production_order_detail",
    kind: "message",
    label: {
      ar: "رسالة تجميد بيانات الأمر",
      en: "Frozen order data message",
    },
    purpose: {
      ar: "توضح متى تصبح بيانات الأمر مقفلة أو للقراءة فقط بسبب مرحلة التنفيذ.",
      en: "Explains when order data is locked or read-only because of the execution stage.",
    },
    summary: {
      ar: "عند ظهور هذه الرسالة، ركز على متابعة التنفيذ بدل تعديل أساس الأمر.",
      en: "When this message appears, focus on execution follow-up instead of changing the order base.",
    },
    aliases: ["frozen snapshot", "locked order", "تجميد"],
  },
  {
    id: "manufacturing_production_order_detail.regenerate_button",
    pageKey: "manufacturing_production_order_detail",
    kind: "button",
    label: {
      ar: "زر إعادة توليد بيانات الأمر",
      en: "Regenerate order data button",
    },
    purpose: {
      ar: "يعيد بناء بيانات أمر التصنيع من قائمة المواد ومسار التشغيل والكمية المختارة عندما تسمح الحالة بذلك.",
      en: "Rebuilds order data from the selected material list, routing, and quantity when the status allows it.",
    },
    summary: {
      ar: "إعادة التوليد مناسبة قبل بدء التنفيذ لتحديث أساس الأمر.",
      en: "Regeneration is useful before execution starts to refresh the order base.",
    },
    aliases: ["regenerate", "rebuild", "إعادة توليد"],
  },
  {
    id: "manufacturing_production_order_detail.cancellation_reason",
    pageKey: "manufacturing_production_order_detail",
    kind: "field",
    label: {
      ar: "سبب الإلغاء",
      en: "Cancellation reason",
    },
    purpose: {
      ar: "يوثق سبب إيقاف أمر التصنيع حتى يستطيع الفريق فهم القرار لاحقًا.",
      en: "Documents why the production order was stopped so the team can understand the decision later.",
    },
    summary: {
      ar: "سبب الإلغاء يحافظ على وضوح متابعة الإنتاج.",
      en: "The cancellation reason keeps production follow-up clear.",
    },
    aliases: ["cancellation reason", "سبب الإلغاء"],
  },
  {
    id: "manufacturing_bom_detail.finished_product",
    pageKey: "manufacturing_bom_detail",
    kind: "field",
    label: {
      ar: "المنتج النهائي",
      en: "Finished product",
    },
    purpose: {
      ar: "يوضح المنتج الذي تصفه قائمة المواد الحالية.",
      en: "Shows the finished product described by this bill of materials.",
    },
    summary: {
      ar: "هذه القائمة تخص تصنيع هذا المنتج.",
      en: "This material list belongs to this finished product.",
    },
    aliases: ["finished product", "owner product", "المنتج النهائي"],
  },
  {
    id: "manufacturing_bom_detail.bom_code",
    pageKey: "manufacturing_bom_detail",
    kind: "field",
    label: {
      ar: "كود قائمة المواد",
      en: "Bill of materials code",
    },
    purpose: {
      ar: "يعطي قائمة المواد رمزًا منظمًا يسهل البحث عنها والتمييز بينها.",
      en: "Gives the bill of materials a structured code for search and identification.",
    },
    summary: {
      ar: "الكود هو تعريف مختصر لقائمة المواد.",
      en: "The code is a short identifier for the bill of materials.",
    },
    aliases: ["material list code", "bom code", "كود قائمة المواد"],
  },
  {
    id: "manufacturing_bom_detail.bom_name",
    pageKey: "manufacturing_bom_detail",
    kind: "field",
    label: {
      ar: "اسم قائمة المواد",
      en: "Bill of materials name",
    },
    purpose: {
      ar: "يشرح للمستخدم أي وصف أو إصدار إنتاجي تمثله هذه القائمة.",
      en: "Explains which production setup or product structure this bill of materials represents.",
    },
    summary: {
      ar: "الاسم الجيد يجعل قائمة المواد مفهومة للفريق.",
      en: "A clear name makes the material list understandable for the team.",
    },
    aliases: ["material list name", "bom name", "اسم قائمة المواد"],
  },
  {
    id: "manufacturing_bom_detail.version_selector",
    pageKey: "manufacturing_bom_detail",
    kind: "field",
    label: {
      ar: "نسخ قائمة المواد",
      en: "Bill of materials versions",
    },
    purpose: {
      ar: "يعرض النسخ المختلفة لقائمة المواد حتى تراجع أو تعتمد النسخة المناسبة للإنتاج.",
      en: "Shows different versions of the bill of materials so you can review or approve the right production version.",
    },
    summary: {
      ar: "النسخ تسمح بتطوير وصفة التصنيع بدون فقد التاريخ.",
      en: "Versions let the production recipe evolve without losing history.",
    },
    aliases: ["versions", "material versions", "نسخ قائمة المواد"],
  },
  {
    id: "manufacturing_bom_detail.version_status",
    pageKey: "manufacturing_bom_detail",
    kind: "status",
    label: {
      ar: "حالة نسخة قائمة المواد",
      en: "Bill of materials version status",
    },
    purpose: {
      ar: "توضح هل النسخة قيد الإعداد، في انتظار الاعتماد، معتمدة، مرفوضة، أو مؤرشفة.",
      en: "Shows whether the version is being prepared, waiting for approval, approved, rejected, or archived.",
    },
    summary: {
      ar: "الحالة تحدد هل يمكن تعديل النسخة أو اعتمادها أو استخدامها.",
      en: "The status controls whether the version can be edited, approved, or used.",
    },
    aliases: ["version status", "حالة النسخة"],
  },
  {
    id: "manufacturing_bom_detail.default_version",
    pageKey: "manufacturing_bom_detail",
    kind: "status",
    label: {
      ar: "النسخة الافتراضية",
      en: "Default version",
    },
    purpose: {
      ar: "تحدد النسخة التي سيعتمد عليها النظام تلقائيًا عند إنشاء أوامر تصنيع جديدة.",
      en: "Identifies the version the system uses by default when creating new production orders.",
    },
    summary: {
      ar: "النسخة الافتراضية هي وصفة الإنتاج الرئيسية حاليًا.",
      en: "The default version is the current main production recipe.",
    },
    aliases: ["default version", "افتراضية"],
  },
  {
    id: "manufacturing_bom_detail.components_table",
    pageKey: "manufacturing_bom_detail",
    kind: "field",
    label: {
      ar: "جدول المكونات",
      en: "Components table",
    },
    purpose: {
      ar: "يعرض المواد أو المنتجات الداخلة في تصنيع المنتج النهائي والكميات المطلوبة.",
      en: "Lists the materials or products needed to manufacture the finished product and required quantities.",
    },
    summary: {
      ar: "جدول المكونات هو قلب قائمة المواد.",
      en: "The components table is the heart of the bill of materials.",
    },
    aliases: ["components", "components table", "جدول المكونات"],
  },
  {
    id: "manufacturing_bom_detail.component_product",
    pageKey: "manufacturing_bom_detail",
    kind: "field",
    label: {
      ar: "المادة أو المنتج",
      en: "Material or product",
    },
    purpose: {
      ar: "يحدد المادة الخام أو المنتج الذي يدخل في تصنيع المنتج النهائي.",
      en: "Identifies the raw material or item used to make the finished product.",
    },
    summary: {
      ar: "هذا هو المكوّن الذي سيحتاجه التصنيع.",
      en: "This is the component production will need.",
    },
    aliases: ["component product", "material", "المادة"],
  },
  {
    id: "manufacturing_bom_detail.quantity_per_unit",
    pageKey: "manufacturing_bom_detail",
    kind: "field",
    label: {
      ar: "الكمية لكل وحدة منتج",
      en: "Quantity per finished unit",
    },
    purpose: {
      ar: "تحدد كمية هذا المكون اللازمة لإنتاج وحدة واحدة من المنتج النهائي.",
      en: "Defines how much of this component is needed to produce one finished unit.",
    },
    whatToCheck: {
      ar: "راجع الرقم جيدًا لأنه يؤثر مباشرة على احتياج المواد والتكلفة.",
      en: "Review the amount carefully because it directly affects material requirements and cost.",
    },
    summary: {
      ar: "هذه الكمية هي أساس حساب احتياج المواد.",
      en: "This quantity is the base for material requirement calculation.",
    },
    aliases: ["quantity per", "quantity per unit", "الكمية لكل وحدة"],
  },
  {
    id: "manufacturing_bom_detail.scrap_percent",
    pageKey: "manufacturing_bom_detail",
    kind: "field",
    label: {
      ar: "نسبة الهالك",
      en: "Scrap percentage",
    },
    purpose: {
      ar: "تضيف هامشًا للفاقد المتوقع أثناء التصنيع حتى تكون الكميات المطلوبة واقعية.",
      en: "Adds an allowance for expected production loss so required quantities are realistic.",
    },
    summary: {
      ar: "الهالك يساعد على تقدير احتياج المواد بدقة أكبر.",
      en: "Scrap helps estimate material needs more accurately.",
    },
    aliases: ["scrap", "scrap percent", "هالك"],
  },
  {
    id: "manufacturing_bom_detail.issue_uom",
    pageKey: "manufacturing_bom_detail",
    kind: "field",
    label: {
      ar: "وحدة القياس عند الصرف",
      en: "Issue unit of measure",
    },
    purpose: {
      ar: "توضح الوحدة التي يتم بها صرف المادة للمصنع، مثل قطعة أو كيلوجرام أو لتر.",
      en: "Shows the unit used when issuing the material to production, such as piece, kilogram, or liter.",
    },
    summary: {
      ar: "الوحدة تجعل الكمية مفهومة عند الصرف الفعلي.",
      en: "The unit makes the quantity clear during actual issue.",
    },
    aliases: ["unit", "uom", "وحدة القياس"],
  },
  {
    id: "manufacturing_bom_detail.effective_dates",
    pageKey: "manufacturing_bom_detail",
    kind: "field",
    label: {
      ar: "تواريخ السريان",
      en: "Effective dates",
    },
    purpose: {
      ar: "تحدد الفترة التي تكون فيها هذه النسخة مناسبة للاستخدام في الإنتاج.",
      en: "Defines the period when this version is valid for production use.",
    },
    summary: {
      ar: "تواريخ السريان تمنع استخدام وصفة تصنيع في فترة غير مناسبة.",
      en: "Effective dates prevent using a production recipe outside its valid period.",
    },
    aliases: ["effective dates", "valid from", "سريان"],
  },
  {
    id: "manufacturing_bom_detail.notes",
    pageKey: "manufacturing_bom_detail",
    kind: "field",
    label: {
      ar: "الملاحظات",
      en: "Notes",
    },
    purpose: {
      ar: "تسجل تعليمات أو توضيحات تساعد فريق التصنيع عند استخدام هذه النسخة.",
      en: "Stores instructions or clarifications that help the production team use this version.",
    },
    summary: {
      ar: "الملاحظات تحفظ التفاصيل التي لا تظهر في الأرقام وحدها.",
      en: "Notes capture details that numbers alone do not explain.",
    },
    aliases: ["notes", "ملاحظات"],
  },
  {
    id: "manufacturing_bom_detail.substitutes",
    pageKey: "manufacturing_bom_detail",
    kind: "field",
    label: {
      ar: "المواد البديلة",
      en: "Alternative materials",
    },
    purpose: {
      ar: "تحدد مواد يمكن استخدامها بدل المادة الأساسية عند عدم توفرها أو حسب سياسة الإنتاج.",
      en: "Defines materials that can replace the primary component when it is unavailable or based on production policy.",
    },
    summary: {
      ar: "البدائل تقلل توقف الإنتاج عند نقص مادة أساسية.",
      en: "Alternatives reduce production stoppage when a primary material is short.",
    },
    aliases: ["substitutes", "alternatives", "بدائل"],
  },
  {
    id: "manufacturing_bom_detail.create_version_button",
    pageKey: "manufacturing_bom_detail",
    kind: "button",
    label: {
      ar: "زر إنشاء نسخة جديدة",
      en: "Create new version button",
    },
    purpose: {
      ar: "ينشئ نسخة جديدة من قائمة المواد حتى تعدّل الوصفة بدون تغيير النسخ السابقة.",
      en: "Creates a new material-list version so you can change the recipe without changing older versions.",
    },
    summary: {
      ar: "استخدمه عند تغيير تركيبة المنتج أو تحديث كمياته.",
      en: "Use it when the product structure or quantities need to change.",
    },
    aliases: ["create version", "new version", "إنشاء نسخة"],
  },
  {
    id: "manufacturing_bom_detail.submit_approval_button",
    pageKey: "manufacturing_bom_detail",
    kind: "button",
    label: {
      ar: "زر إرسال للاعتماد",
      en: "Submit for approval button",
    },
    purpose: {
      ar: "يرسل النسخة للمراجعة قبل اعتمادها للاستخدام في الإنتاج.",
      en: "Sends the version for review before it can be approved for production use.",
    },
    whatToCheck: {
      ar: "راجع المكونات والكميات والهالك وتواريخ السريان قبل الإرسال.",
      en: "Review components, quantities, scrap, and effective dates before submitting.",
    },
    summary: {
      ar: "الإرسال للاعتماد يعني أن النسخة جاهزة للمراجعة.",
      en: "Submitting for approval means the version is ready for review.",
    },
    aliases: ["submit approval", "send approval", "إرسال للاعتماد"],
  },
  {
    id: "manufacturing_bom_detail.approve_button",
    pageKey: "manufacturing_bom_detail",
    kind: "button",
    label: {
      ar: "زر اعتماد النسخة",
      en: "Approve version button",
    },
    purpose: {
      ar: "يعتمد نسخة قائمة المواد حتى تصبح جاهزة للاستخدام التشغيلي.",
      en: "Approves the material-list version so it becomes ready for operational use.",
    },
    afterAction: {
      ar: "بعد الاعتماد تصبح النسخة عادة للقراءة فقط ويمكن تعيينها كنسخة افتراضية.",
      en: "After approval, the version is usually read-only and can be set as default.",
    },
    summary: {
      ar: "الاعتماد يجعل النسخة صالحة للاستخدام في التصنيع.",
      en: "Approval makes the version valid for production use.",
    },
    aliases: ["approve", "اعتماد"],
  },
  {
    id: "manufacturing_bom_detail.reject_button",
    pageKey: "manufacturing_bom_detail",
    kind: "button",
    label: {
      ar: "زر رفض النسخة",
      en: "Reject version button",
    },
    purpose: {
      ar: "يرفض النسخة عندما تحتاج تعديلًا قبل استخدامها في الإنتاج.",
      en: "Rejects the version when it needs changes before production use.",
    },
    whatToCheck: {
      ar: "اكتب سبب رفض واضح حتى يعرف الفريق ما المطلوب تعديله.",
      en: "Write a clear rejection reason so the team knows what must be changed.",
    },
    summary: {
      ar: "الرفض يعيد النسخة للمراجعة والتحسين.",
      en: "Rejection sends the version back for review and improvement.",
    },
    aliases: ["reject", "رفض"],
  },
  {
    id: "manufacturing_bom_detail.set_default_button",
    pageKey: "manufacturing_bom_detail",
    kind: "button",
    label: {
      ar: "زر تعيين كنسخة افتراضية",
      en: "Set default version button",
    },
    purpose: {
      ar: "يجعل هذه النسخة هي النسخة التي يعتمد عليها النظام تلقائيًا في أوامر التصنيع الجديدة.",
      en: "Makes this version the one used automatically for new production orders.",
    },
    summary: {
      ar: "النسخة الافتراضية هي المرجع الرئيسي للإنتاج الجديد.",
      en: "The default version is the main reference for new production.",
    },
    aliases: ["set default", "default version", "افتراضية"],
  },
  {
    id: "manufacturing_bom_detail.explosion_preview_button",
    pageKey: "manufacturing_bom_detail",
    kind: "button",
    label: {
      ar: "زر معاينة احتياج المواد",
      en: "Material requirements preview button",
    },
    purpose: {
      ar: "يعرض احتياج المواد المتوقع لكمية إنتاج معينة بدون حجز أو صرف فعلي.",
      en: "Shows expected material requirements for a production quantity without reserving or issuing stock.",
    },
    summary: {
      ar: "المعاينة تساعدك تفهم الاحتياج قبل التنفيذ.",
      en: "The preview helps you understand requirements before execution.",
    },
    aliases: ["preview", "material preview", "معاينة"],
  },
  {
    id: "manufacturing_bom_detail.preview_quantity",
    pageKey: "manufacturing_bom_detail",
    kind: "field",
    label: {
      ar: "كمية الإدخال للمعاينة",
      en: "Preview input quantity",
    },
    purpose: {
      ar: "تحدد كمية المنتج النهائي التي تريد حساب احتياج المواد لها في المعاينة.",
      en: "Sets the finished-product quantity used to calculate material requirements in the preview.",
    },
    summary: {
      ar: "غيّر الكمية لترى كيف يتغير احتياج المواد.",
      en: "Change the quantity to see how material needs change.",
    },
    aliases: ["preview quantity", "input quantity", "كمية المعاينة"],
  },
  {
    id: "manufacturing_bom_detail.preview_results",
    pageKey: "manufacturing_bom_detail",
    kind: "field",
    label: {
      ar: "نتائج معاينة احتياج المواد",
      en: "Material requirements preview results",
    },
    purpose: {
      ar: "تعرض المواد المطلوبة والكميات والهالك والبدائل المتوقعة لكمية الإنتاج المختارة.",
      en: "Shows expected materials, quantities, scrap, and alternatives for the selected production quantity.",
    },
    summary: {
      ar: "النتائج قراءة تقديرية ولا تنفذ حركة مخزون.",
      en: "Results are an estimate and do not create inventory movement.",
    },
    aliases: ["preview results", "requirements", "نتائج المعاينة"],
  },
  {
    id: "manufacturing_routing_detail.finished_product",
    pageKey: "manufacturing_routing_detail",
    kind: "field",
    label: {
      ar: "المنتج المرتبط بالمسار",
      en: "Product linked to routing",
    },
    purpose: {
      ar: "يوضح المنتج الذي ينطبق عليه مسار التشغيل الحالي.",
      en: "Shows the product this routing applies to.",
    },
    summary: {
      ar: "هذا المسار يشرح طريقة تصنيع هذا المنتج.",
      en: "This routing explains how this product is manufactured.",
    },
    aliases: ["routing product", "product", "المنتج المرتبط"],
  },
  {
    id: "manufacturing_routing_detail.routing_code",
    pageKey: "manufacturing_routing_detail",
    kind: "field",
    label: {
      ar: "كود مسار التشغيل",
      en: "Routing code",
    },
    purpose: {
      ar: "يعطي مسار التشغيل رمزًا منظمًا يسهل تمييزه والبحث عنه.",
      en: "Gives the routing a structured code for identification and search.",
    },
    summary: {
      ar: "الكود هو تعريف مختصر لمسار التشغيل.",
      en: "The code is a short identifier for the routing.",
    },
    aliases: ["routing code", "كود المسار"],
  },
  {
    id: "manufacturing_routing_detail.routing_name",
    pageKey: "manufacturing_routing_detail",
    kind: "field",
    label: {
      ar: "اسم مسار التشغيل",
      en: "Routing name",
    },
    purpose: {
      ar: "يشرح الغرض من المسار أو طريقة التصنيع التي يمثلها.",
      en: "Explains the purpose of the routing or manufacturing method it represents.",
    },
    summary: {
      ar: "الاسم الواضح يساعد الفريق على اختيار المسار الصحيح.",
      en: "A clear name helps the team choose the correct routing.",
    },
    aliases: ["routing name", "اسم المسار"],
  },
  {
    id: "manufacturing_routing_detail.routing_usage",
    pageKey: "manufacturing_routing_detail",
    kind: "field",
    label: {
      ar: "استخدام مسار التشغيل",
      en: "Routing usage",
    },
    purpose: {
      ar: "يوضح الغرض التشغيلي من المسار، مثل إنتاج قياسي أو استخدام خاص.",
      en: "Shows the operational purpose of the routing, such as standard production or a special use.",
    },
    summary: {
      ar: "الاستخدام يساعد على اختيار المسار المناسب للسياق.",
      en: "Usage helps select the right routing for the context.",
    },
    aliases: ["routing usage", "usage", "استخدام المسار"],
  },
  {
    id: "manufacturing_routing_detail.version_selector",
    pageKey: "manufacturing_routing_detail",
    kind: "field",
    label: {
      ar: "نسخ مسار التشغيل",
      en: "Routing versions",
    },
    purpose: {
      ar: "يعرض النسخ المختلفة لمسار التشغيل حتى تراجع الخطوات أو تفعل النسخة المناسبة.",
      en: "Shows different routing versions so you can review steps or activate the right version.",
    },
    summary: {
      ar: "النسخ تحفظ تاريخ تغييرات طريقة التصنيع.",
      en: "Versions preserve the history of manufacturing-method changes.",
    },
    aliases: ["routing versions", "versions", "نسخ المسار"],
  },
  {
    id: "manufacturing_routing_detail.version_status",
    pageKey: "manufacturing_routing_detail",
    kind: "status",
    label: {
      ar: "حالة نسخة المسار",
      en: "Routing version status",
    },
    purpose: {
      ar: "توضح هل النسخة قيد الإعداد، مفعلة، موقوفة، أو مؤرشفة.",
      en: "Shows whether the version is being prepared, active, inactive, or archived.",
    },
    summary: {
      ar: "الحالة تحدد هل تستخدم النسخة في التصنيع أم لا.",
      en: "The status tells whether the version is used for production.",
    },
    aliases: ["routing status", "version status", "حالة نسخة المسار"],
  },
  {
    id: "manufacturing_routing_detail.operations_table",
    pageKey: "manufacturing_routing_detail",
    kind: "field",
    label: {
      ar: "جدول العمليات",
      en: "Operations table",
    },
    purpose: {
      ar: "يعرض خطوات التصنيع بالترتيب مع مركز العمل والأزمنة والتعليمات.",
      en: "Lists production operations in order with work center, times, and instructions.",
    },
    summary: {
      ar: "جدول العمليات هو خطة التنفيذ التفصيلية للمنتج.",
      en: "The operations table is the detailed execution plan for the product.",
    },
    aliases: ["operations", "operations table", "جدول العمليات"],
  },
  {
    id: "manufacturing_routing_detail.operation_sequence",
    pageKey: "manufacturing_routing_detail",
    kind: "field",
    label: {
      ar: "ترتيب العملية",
      en: "Operation sequence",
    },
    purpose: {
      ar: "يحدد ترتيب تنفيذ هذه العملية داخل مسار التصنيع.",
      en: "Defines where this operation happens in the manufacturing sequence.",
    },
    summary: {
      ar: "الترتيب يمنع خلط خطوات التصنيع.",
      en: "Sequence prevents production steps from being mixed up.",
    },
    aliases: ["operation number", "sequence", "ترتيب العملية"],
  },
  {
    id: "manufacturing_routing_detail.operation_code",
    pageKey: "manufacturing_routing_detail",
    kind: "field",
    label: {
      ar: "كود العملية",
      en: "Operation code",
    },
    purpose: {
      ar: "يعطي خطوة التشغيل رمزًا مختصرًا لتسهيل التعرف عليها.",
      en: "Gives the operation a short code for easier identification.",
    },
    summary: {
      ar: "كود العملية يساعد في المتابعة والبحث.",
      en: "Operation code helps with tracking and lookup.",
    },
    aliases: ["operation code", "كود العملية"],
  },
  {
    id: "manufacturing_routing_detail.operation_name",
    pageKey: "manufacturing_routing_detail",
    kind: "field",
    label: {
      ar: "اسم العملية",
      en: "Operation name",
    },
    purpose: {
      ar: "يوضح ما يحدث في هذه الخطوة مثل خلط أو تعبئة أو فحص.",
      en: "Explains what happens in this step, such as mixing, packing, or inspection.",
    },
    summary: {
      ar: "اسم العملية يشرح العمل المطلوب في الخطوة.",
      en: "The operation name explains the work required in the step.",
    },
    aliases: ["operation name", "اسم العملية"],
  },
  {
    id: "manufacturing_routing_detail.work_center",
    pageKey: "manufacturing_routing_detail",
    kind: "field",
    label: {
      ar: "مركز العمل أو المورد التشغيلي",
      en: "Work center or production resource",
    },
    purpose: {
      ar: "يحدد المكان أو المورد الذي ستُنفذ عليه خطوة التشغيل.",
      en: "Identifies the location or resource where the operation will be performed.",
    },
    summary: {
      ar: "مركز العمل يربط العملية بقدرة تنفيذ حقيقية.",
      en: "The work center connects the operation to real execution capacity.",
    },
    aliases: ["work center", "resource", "مركز العمل"],
  },
  {
    id: "manufacturing_routing_detail.setup_time",
    pageKey: "manufacturing_routing_detail",
    kind: "field",
    label: {
      ar: "وقت التجهيز",
      en: "Setup time",
    },
    purpose: {
      ar: "يمثل الوقت المطلوب لتجهيز العملية قبل بدء الإنتاج الفعلي.",
      en: "Represents the time needed to prepare the operation before actual production starts.",
    },
    summary: {
      ar: "وقت التجهيز يساعد في تقدير مدة التصنيع.",
      en: "Setup time helps estimate production duration.",
    },
    aliases: ["setup time", "وقت التجهيز"],
  },
  {
    id: "manufacturing_routing_detail.run_time",
    pageKey: "manufacturing_routing_detail",
    kind: "field",
    label: {
      ar: "وقت التشغيل لكل وحدة",
      en: "Run time per unit",
    },
    purpose: {
      ar: "يوضح الوقت المتوقع لتشغيل أو إنتاج وحدة واحدة في هذه العملية.",
      en: "Shows the expected time to process or produce one unit in this operation.",
    },
    summary: {
      ar: "وقت التشغيل لكل وحدة يؤثر على خطة الإنتاج والطاقة.",
      en: "Run time per unit affects production planning and capacity.",
    },
    aliases: ["run time", "runtime", "وقت التشغيل"],
  },
  {
    id: "manufacturing_routing_detail.quality_checkpoint",
    pageKey: "manufacturing_routing_detail",
    kind: "field",
    label: {
      ar: "نقطة مراقبة الجودة",
      en: "Quality checkpoint",
    },
    purpose: {
      ar: "توضح أن هذه الخطوة تحتاج فحص جودة قبل المتابعة.",
      en: "Shows that this operation requires a quality check before continuing.",
    },
    summary: {
      ar: "نقطة الجودة تقلل مرور منتج غير مطابق للخطوة التالية.",
      en: "A quality checkpoint reduces the chance of nonconforming output moving forward.",
    },
    aliases: ["quality checkpoint", "quality", "مراقبة الجودة"],
  },
  {
    id: "manufacturing_routing_detail.instructions",
    pageKey: "manufacturing_routing_detail",
    kind: "field",
    label: {
      ar: "تعليمات التنفيذ",
      en: "Execution instructions",
    },
    purpose: {
      ar: "تسجل تعليمات عملية تساعد فريق الإنتاج على تنفيذ الخطوة بشكل صحيح.",
      en: "Stores practical instructions that help the production team perform the step correctly.",
    },
    summary: {
      ar: "التعليمات تحول الخطة إلى خطوات واضحة للفريق.",
      en: "Instructions turn the plan into clear steps for the team.",
    },
    aliases: ["instructions", "تعليمات"],
  },
  {
    id: "manufacturing_routing_detail.add_operation_button",
    pageKey: "manufacturing_routing_detail",
    kind: "button",
    label: {
      ar: "زر إضافة عملية",
      en: "Add operation button",
    },
    purpose: {
      ar: "يضيف خطوة تشغيل جديدة إلى نسخة مسار التصنيع الحالية.",
      en: "Adds a new operation step to the current routing version.",
    },
    summary: {
      ar: "استخدمه عندما تحتاج خطوة تصنيع إضافية.",
      en: "Use it when an additional manufacturing step is needed.",
    },
    aliases: ["add operation", "إضافة عملية"],
  },
  {
    id: "manufacturing_routing_detail.save_operations_button",
    pageKey: "manufacturing_routing_detail",
    kind: "button",
    label: {
      ar: "زر حفظ العمليات",
      en: "Save operations button",
    },
    purpose: {
      ar: "يحفظ تغييرات خطوات التشغيل في النسخة الحالية.",
      en: "Saves operation-step changes in the current routing version.",
    },
    whatToCheck: {
      ar: "راجع ترتيب العمليات ومراكز العمل والأزمنة قبل الحفظ.",
      en: "Review sequence, work centers, and times before saving.",
    },
    summary: {
      ar: "الحفظ يثبت خطة التشغيل لهذه النسخة.",
      en: "Saving confirms the execution plan for this version.",
    },
    aliases: ["save operations", "حفظ العمليات"],
  },
  {
    id: "manufacturing_routing_detail.activate_button",
    pageKey: "manufacturing_routing_detail",
    kind: "button",
    label: {
      ar: "زر تفعيل النسخة",
      en: "Activate version button",
    },
    purpose: {
      ar: "يجعل نسخة مسار التشغيل قابلة للاستخدام في التصنيع.",
      en: "Makes the routing version available for production use.",
    },
    summary: {
      ar: "التفعيل يعني أن هذه النسخة أصبحت صالحة للتشغيل.",
      en: "Activation means this version is valid for execution.",
    },
    aliases: ["activate", "تفعيل"],
  },
  {
    id: "manufacturing_routing_detail.deactivate_button",
    pageKey: "manufacturing_routing_detail",
    kind: "button",
    label: {
      ar: "زر إيقاف النسخة",
      en: "Deactivate version button",
    },
    purpose: {
      ar: "يوقف استخدام نسخة المسار دون حذف تاريخها.",
      en: "Stops use of the routing version without deleting its history.",
    },
    summary: {
      ar: "الإيقاف مناسب عندما لا تريد استخدام النسخة حاليًا.",
      en: "Deactivation is useful when the version should not be used now.",
    },
    aliases: ["deactivate", "إيقاف"],
  },
  {
    id: "manufacturing_routing_detail.archive_button",
    pageKey: "manufacturing_routing_detail",
    kind: "button",
    label: {
      ar: "زر أرشفة النسخة",
      en: "Archive version button",
    },
    purpose: {
      ar: "يقفل النسخة القديمة للرجوع إليها فقط ولا يجعلها متاحة للتعديل العادي.",
      en: "Locks an old version for reference and removes it from normal editing.",
    },
    summary: {
      ar: "الأرشفة تحفظ التاريخ وتمنع استخدام نسخة قديمة بالخطأ.",
      en: "Archiving preserves history and helps prevent using an old version by mistake.",
    },
    aliases: ["archive", "أرشفة"],
  },
  {
    id: "manufacturing_routing_detail.create_version_button",
    pageKey: "manufacturing_routing_detail",
    kind: "button",
    label: {
      ar: "زر إنشاء نسخة مسار",
      en: "Create routing version button",
    },
    purpose: {
      ar: "ينشئ نسخة جديدة من مسار التشغيل لتعديل الخطوات بدون تغيير النسخ السابقة.",
      en: "Creates a new routing version so steps can change without altering older versions.",
    },
    summary: {
      ar: "استخدمه عند تغيير طريقة التصنيع أو الأزمنة أو مراكز العمل.",
      en: "Use it when manufacturing steps, times, or work centers change.",
    },
    aliases: ["create routing version", "new routing version", "إنشاء نسخة مسار"],
  },
  {
    id: "fixed_assets.status",
    pageKey: "fixed_assets",
    kind: "status",
    label: {
      ar: "حالة الأصل",
      en: "Asset status",
    },
    purpose: {
      ar: "توضح المرحلة الحالية للأصل: هل هو نشط، متوقف، مباع، مستبعد، أو انتهى إهلاكه.",
      en: "Shows the asset's current stage: active, suspended, sold, disposed, or fully depreciated.",
    },
    whyItExists: {
      ar: "الحالة تساعدك تعرف هل يمكن استخدام الأصل أو تعديل إهلاكه أو استبعاده.",
      en: "The status helps you know whether the asset can be used, depreciated, or disposed.",
    },
    whatToCheck: {
      ar: "راجع الحالة قبل أي اعتماد أو ترحيل أو استبعاد حتى لا تتخذ إجراء على أصل غير مناسب.",
      en: "Review the status before approval, posting, or disposal so you do not act on an unsuitable asset.",
    },
    summary: {
      ar: "حالة الأصل تخبرك ما الإجراء المسموح أو المناسب الآن.",
      en: "Asset status tells you which action is allowed or appropriate now.",
    },
    aliases: ["asset status", "status", "حالة الأصل"],
  },
  {
    id: "fixed_assets.purchase_cost",
    pageKey: "fixed_assets",
    kind: "field",
    label: {
      ar: "قيمة الشراء",
      en: "Purchase cost",
    },
    purpose: {
      ar: "تمثل تكلفة اقتناء الأصل التي يبدأ منها حساب الإهلاك والقيمة الحالية.",
      en: "Represents the cost of acquiring the asset and is the starting point for depreciation and current value.",
    },
    whatToCheck: {
      ar: "تأكد أنها تشمل التكاليف التي تعتبرها الشركة جزءًا من تكلفة الأصل، حسب سياستها المحاسبية.",
      en: "Confirm it includes the costs your company treats as part of the asset cost, based on accounting policy.",
    },
    summary: {
      ar: "قيمة الشراء هي أساس حساب الإهلاك والقيمة الدفترية.",
      en: "Purchase cost is the base for depreciation and book value.",
    },
    aliases: ["purchase cost", "cost", "قيمة الشراء", "تكلفة الأصل"],
  },
  {
    id: "fixed_assets.accumulated_depreciation",
    pageKey: "fixed_assets",
    kind: "field",
    label: {
      ar: "مجمع الإهلاك",
      en: "Accumulated depreciation",
    },
    purpose: {
      ar: "يعرض إجمالي الإهلاك الذي تم احتسابه على الأصل منذ بدء استخدامه.",
      en: "Shows the total depreciation calculated for the asset since it started being used.",
    },
    whyItExists: {
      ar: "يساعدك على معرفة الجزء من تكلفة الأصل الذي تم تحميله على الفترات السابقة.",
      en: "It helps you see how much of the asset cost has already been allocated to past periods.",
    },
    summary: {
      ar: "مجمع الإهلاك يوضح مقدار ما تم استهلاكه محاسبيًا من الأصل.",
      en: "Accumulated depreciation shows how much of the asset has been used financially.",
    },
    aliases: ["accumulated depreciation", "depreciation total", "مجمع الإهلاك"],
  },
  {
    id: "fixed_assets.book_value",
    pageKey: "fixed_assets",
    kind: "field",
    label: {
      ar: "القيمة الدفترية",
      en: "Book value",
    },
    purpose: {
      ar: "توضح القيمة الحالية للأصل في الدفاتر بعد طرح الإهلاك المتراكم من تكلفة الشراء.",
      en: "Shows the asset's current accounting value after accumulated depreciation is deducted from purchase cost.",
    },
    whenToUse: {
      ar: "راجعها قبل بيع الأصل أو استبعاده أو تقييم أثره على التقارير.",
      en: "Review it before selling, disposing, or evaluating the asset's reporting impact.",
    },
    example: {
      ar: "إذا كانت تكلفة الأصل 10,000 ومجمع الإهلاك 3,000، فالقيمة الدفترية 7,000.",
      en: "If the asset cost is 10,000 and accumulated depreciation is 3,000, the book value is 7,000.",
    },
    summary: {
      ar: "القيمة الدفترية هي الرقم الأهم قبل قرار البيع أو الاستبعاد.",
      en: "Book value is the key number before a sale or disposal decision.",
    },
    aliases: ["book value", "current value", "القيمة الدفترية"],
  },
  {
    id: "fixed_assets.useful_life",
    pageKey: "fixed_assets",
    kind: "field",
    label: {
      ar: "العمر الإنتاجي",
      en: "Useful life",
    },
    purpose: {
      ar: "يحدد عدد الفترات التي تتوقع الشركة الاستفادة من الأصل خلالها.",
      en: "Defines how long the company expects to benefit from the asset.",
    },
    whatToCheck: {
      ar: "راجع أن العمر مناسب لطبيعة الأصل وسياسة الشركة، لأن تغييره يغير قيمة الإهلاك الدوري.",
      en: "Check that it matches the asset type and company policy because it changes periodic depreciation.",
    },
    summary: {
      ar: "العمر الإنتاجي يوزع تكلفة الأصل على مدة الاستفادة منه.",
      en: "Useful life spreads the asset cost across the period of benefit.",
    },
    aliases: ["useful life", "life", "العمر الإنتاجي"],
  },
  {
    id: "fixed_assets.depreciation_method",
    pageKey: "fixed_assets",
    kind: "field",
    label: {
      ar: "طريقة الإهلاك",
      en: "Depreciation method",
    },
    purpose: {
      ar: "تحدد كيف سيتم توزيع تكلفة الأصل على الفترات، مثل القسط الثابت أو القسط المتناقص.",
      en: "Defines how the asset cost is spread across periods, such as straight-line or declining balance.",
    },
    whyItExists: {
      ar: "كل طريقة تعطي نمطًا مختلفًا لمصروف الإهلاك، لذلك يجب أن تعكس سياسة الشركة وطبيعة الأصل.",
      en: "Each method creates a different depreciation pattern, so it should match company policy and asset nature.",
    },
    summary: {
      ar: "طريقة الإهلاك تحدد شكل توزيع تكلفة الأصل عبر عمره.",
      en: "The depreciation method controls how asset cost is spread over its life.",
    },
    aliases: ["depreciation method", "method", "طريقة الإهلاك"],
  },
  {
    id: "fixed_assets.depreciation_schedule",
    pageKey: "fixed_assets",
    kind: "field",
    label: {
      ar: "جدول الإهلاك",
      en: "Depreciation schedule",
    },
    purpose: {
      ar: "يعرض فترات الإهلاك المتوقعة أو المعتمدة، وقيمة الإهلاك في كل فترة، والقيمة المتبقية بعدها.",
      en: "Shows expected or approved depreciation periods, the depreciation amount for each period, and the value after it.",
    },
    whatToCheck: {
      ar: "راجع الفترات والقيم قبل الاعتماد أو الترحيل، خصوصًا عند وجود تعديل في الأصل أو عمره.",
      en: "Review periods and values before approval or posting, especially after changes to the asset or its life.",
    },
    summary: {
      ar: "جدول الإهلاك هو خطة توزيع تكلفة الأصل على الفترات.",
      en: "The depreciation schedule is the plan for spreading asset cost across periods.",
    },
    aliases: ["depreciation schedule", "schedule", "جدول الإهلاك"],
  },
  {
    id: "fixed_assets.depreciation_period_status",
    pageKey: "fixed_assets",
    kind: "status",
    label: {
      ar: "حالة فترة الإهلاك",
      en: "Depreciation period status",
    },
    purpose: {
      ar: "توضح هل فترة الإهلاك ما زالت معلقة، تم اعتمادها، تم ترحيلها للتقارير، أو تم إلغاؤها.",
      en: "Shows whether a depreciation period is pending, approved, posted to reports, or cancelled.",
    },
    afterAction: {
      ar: "بعد الاعتماد يمكن ترحيل الفترة إذا كانت الصلاحيات والفترة المحاسبية تسمح بذلك.",
      en: "After approval, the period can be posted if permissions and the accounting period allow it.",
    },
    summary: {
      ar: "حالة الفترة توضح أين وصل الإهلاك قبل ظهوره النهائي في التقارير.",
      en: "The period status shows how far depreciation has progressed before final reporting.",
    },
    aliases: ["period status", "depreciation status", "حالة فترة الإهلاك"],
  },
  {
    id: "fixed_assets.approve_depreciation_button",
    pageKey: "fixed_assets",
    kind: "button",
    label: {
      ar: "زر اعتماد الإهلاك",
      en: "Approve depreciation button",
    },
    purpose: {
      ar: "يعتمد فترات الإهلاك المعلقة بعد مراجعتها، حتى تصبح جاهزة للترحيل.",
      en: "Approves pending depreciation periods after review so they become ready for posting.",
    },
    whatToCheck: {
      ar: "راجع قيمة الإهلاك والفترة والقيمة الدفترية قبل الاعتماد.",
      en: "Review the depreciation amount, period, and book value before approval.",
    },
    afterAction: {
      ar: "بعد الاعتماد لن تكون الفترة مجرد مسودة متابعة، بل تصبح جاهزة للخطوة المالية التالية.",
      en: "After approval, the period is no longer just a draft for review; it is ready for the next financial step.",
    },
    summary: {
      ar: "اعتماد الإهلاك يعني أن القيم تمت مراجعتها وجاهزة للترحيل.",
      en: "Approving depreciation means the values were reviewed and are ready for posting.",
    },
    aliases: ["approve depreciation", "approve", "اعتماد الإهلاك"],
  },
  {
    id: "fixed_assets.post_depreciation_button",
    pageKey: "fixed_assets",
    kind: "button",
    label: {
      ar: "زر ترحيل الإهلاك",
      en: "Post depreciation button",
    },
    purpose: {
      ar: "يثبت الإهلاك المعتمد في الأثر المالي والتقارير حسب صلاحياتك والفترة المتاحة.",
      en: "Confirms approved depreciation in financial impact and reports based on your permissions and open period.",
    },
    whatToCheck: {
      ar: "تأكد أن الفترات المعتمدة صحيحة وأنك لا ترحل إهلاكًا لفترة غير مقصودة.",
      en: "Make sure the approved periods are correct and that you are not posting depreciation for the wrong period.",
    },
    afterAction: {
      ar: "بعد الترحيل تظهر قيمة الإهلاك ضمن متابعة الأصل والتقارير المالية المناسبة.",
      en: "After posting, depreciation appears in asset follow-up and relevant financial reports.",
    },
    summary: {
      ar: "الترحيل هو خطوة تثبيت الإهلاك ماليًا بعد الاعتماد.",
      en: "Posting is the step that financially confirms depreciation after approval.",
    },
    aliases: ["post depreciation", "post", "ترحيل الإهلاك"],
  },
  {
    id: "fixed_assets.add_capital_button",
    pageKey: "fixed_assets",
    kind: "button",
    label: {
      ar: "زر إضافة رأسمالية",
      en: "Add capital button",
    },
    purpose: {
      ar: "يسجل تكلفة إضافية على الأصل عندما يتم تحسينه أو رفع قدرته بدل اعتبارها مصروفًا عاديًا.",
      en: "Adds extra cost to the asset when it is improved or upgraded instead of treating the cost as a normal expense.",
    },
    whenToUse: {
      ar: "استخدمه عند إضافة قيمة تزيد منفعة الأصل أو عمره، وليس للصيانة اليومية البسيطة.",
      en: "Use it when a cost increases asset benefit or life, not for simple routine maintenance.",
    },
    summary: {
      ar: "الإضافة الرأسمالية تزيد قيمة الأصل وتؤثر على الإهلاك لاحقًا.",
      en: "A capital addition increases asset value and affects later depreciation.",
    },
    aliases: ["add capital", "capital addition", "إضافة رأسمالية"],
  },
  {
    id: "fixed_assets.dispose_button",
    pageKey: "fixed_assets",
    kind: "button",
    label: {
      ar: "زر استبعاد الأصل",
      en: "Dispose asset button",
    },
    purpose: {
      ar: "يسجل خروج الأصل من الاستخدام بسبب بيع أو تلف أو عدم حاجة الشركة له.",
      en: "Records that the asset is leaving use because it was sold, damaged, or no longer needed.",
    },
    whatToCheck: {
      ar: "راجع القيمة الدفترية وسبب الاستبعاد وأي مبلغ بيع قبل تأكيد الإجراء.",
      en: "Review book value, disposal reason, and any sale amount before confirming.",
    },
    afterAction: {
      ar: "بعد الاستبعاد تتغير حالة الأصل ويتوقف التعامل معه كأصل نشط.",
      en: "After disposal, the asset status changes and it is no longer treated as active.",
    },
    summary: {
      ar: "استبعاد الأصل ينهي استخدامه التشغيلي ويجب مراجعته بعناية.",
      en: "Disposing an asset ends its operational use and should be reviewed carefully.",
    },
    aliases: ["dispose", "disposal", "استبعاد الأصل"],
  },
  {
    id: "fixed_assets.asset_history",
    pageKey: "fixed_assets",
    kind: "field",
    label: {
      ar: "سجل الأصل",
      en: "Asset history",
    },
    purpose: {
      ar: "يعرض الحركات المهمة التي حدثت على الأصل مثل إضافة قيمة أو إهلاك أو استبعاد.",
      en: "Shows important asset events such as added value, depreciation, or disposal.",
    },
    summary: {
      ar: "السجل يساعدك تفهم كيف وصلت قيمة الأصل وحالته لما هي عليه الآن.",
      en: "History helps you understand how the asset value and status reached their current state.",
    },
    aliases: ["asset history", "history", "سجل الأصل"],
  },
  {
    id: "fixed_assets.category",
    pageKey: "fixed_assets",
    kind: "field",
    label: {
      ar: "فئة الأصل",
      en: "Asset category",
    },
    purpose: {
      ar: "تصنف الأصل ضمن مجموعة مثل معدات أو سيارات أو أجهزة، وغالبًا تحدد إعدادات الإهلاك الافتراضية.",
      en: "Classifies the asset into a group such as equipment, vehicles, or devices, and often sets default depreciation settings.",
    },
    whatToCheck: {
      ar: "اختر الفئة الأقرب لطبيعة الأصل حتى تكون التقارير والإهلاك أكثر دقة.",
      en: "Choose the category closest to the asset nature so reports and depreciation are more accurate.",
    },
    summary: {
      ar: "فئة الأصل تجعل الإعدادات والتقارير منظمة منذ البداية.",
      en: "Asset category keeps setup and reports organized from the start.",
    },
    aliases: ["asset category", "category", "فئة الأصل"],
  },
  {
    id: "fixed_assets.asset_code",
    pageKey: "fixed_assets",
    kind: "field",
    label: {
      ar: "كود الأصل",
      en: "Asset code",
    },
    purpose: {
      ar: "يعطي الأصل رقمًا أو رمزًا يسهل البحث عنه وتمييزه عن أصول مشابهة.",
      en: "Gives the asset a number or code that makes it easier to find and distinguish from similar assets.",
    },
    summary: {
      ar: "الكود يساعد على تتبع الأصل بسرعة.",
      en: "The code helps track the asset quickly.",
    },
    aliases: ["asset code", "code", "كود الأصل"],
  },
  {
    id: "fixed_assets.asset_name",
    pageKey: "fixed_assets",
    kind: "field",
    label: {
      ar: "اسم الأصل",
      en: "Asset name",
    },
    purpose: {
      ar: "يوضح الأصل المقصود بلغة مفهومة للفريق، مثل سيارة توصيل أو جهاز تعبئة.",
      en: "Describes the asset in a way the team understands, such as delivery car or packing machine.",
    },
    whatToCheck: {
      ar: "اكتب اسمًا واضحًا يميز الأصل عن غيره، خصوصًا عند وجود أصول متشابهة.",
      en: "Use a clear name that distinguishes the asset, especially when similar assets exist.",
    },
    summary: {
      ar: "اسم الأصل الجيد يسهل المتابعة والبحث.",
      en: "A good asset name makes follow-up and search easier.",
    },
    aliases: ["asset name", "name", "اسم الأصل"],
  },
  {
    id: "fixed_assets.purchase_date",
    pageKey: "fixed_assets",
    kind: "field",
    label: {
      ar: "تاريخ الشراء",
      en: "Purchase date",
    },
    purpose: {
      ar: "يوضح متى تم اقتناء الأصل، ويساعد على قراءة عمره وتاريخه.",
      en: "Shows when the asset was acquired and helps read its age and history.",
    },
    summary: {
      ar: "تاريخ الشراء يربط الأصل بفترة اقتنائه.",
      en: "Purchase date connects the asset to its acquisition period.",
    },
    aliases: ["purchase date", "date", "تاريخ الشراء"],
  },
  {
    id: "fixed_assets.depreciation_start_date",
    pageKey: "fixed_assets",
    kind: "field",
    label: {
      ar: "تاريخ بدء الإهلاك",
      en: "Depreciation start date",
    },
    purpose: {
      ar: "يحدد متى يبدأ تحميل تكلفة الأصل على الفترات، وقد يختلف عن تاريخ الشراء إذا لم يبدأ استخدام الأصل فورًا.",
      en: "Defines when the asset cost starts being allocated to periods, which may differ from purchase date if use starts later.",
    },
    whatToCheck: {
      ar: "تأكد أن التاريخ يعكس بداية استخدام الأصل فعليًا حسب سياسة الشركة.",
      en: "Make sure the date reflects when the asset actually starts being used according to company policy.",
    },
    summary: {
      ar: "هذا التاريخ يحدد أول فترة يبدأ فيها الإهلاك.",
      en: "This date sets the first period where depreciation begins.",
    },
    aliases: ["depreciation start", "start date", "تاريخ بدء الإهلاك"],
  },
  {
    id: "fixed_assets.salvage_value",
    pageKey: "fixed_assets",
    kind: "field",
    label: {
      ar: "القيمة المتبقية",
      en: "Salvage value",
    },
    purpose: {
      ar: "تمثل القيمة المتوقعة للأصل في نهاية عمره الإنتاجي، إن كانت الشركة تتوقع قيمة متبقية.",
      en: "Represents the expected value of the asset at the end of its useful life, if the company expects one.",
    },
    summary: {
      ar: "القيمة المتبقية تقلل الجزء الذي سيتم إهلاكه من تكلفة الأصل.",
      en: "Salvage value reduces the portion of asset cost that will be depreciated.",
    },
    aliases: ["salvage value", "residual value", "القيمة المتبقية"],
  },
  {
    id: "fixed_assets.asset_account",
    pageKey: "fixed_assets",
    kind: "field",
    label: {
      ar: "حساب الأصل",
      en: "Asset account",
    },
    purpose: {
      ar: "يحدد الحساب المالي الذي تظهر فيه قيمة الأصل ضمن التقارير.",
      en: "Defines the financial account where the asset value appears in reports.",
    },
    whatToCheck: {
      ar: "اختر حسابًا مناسبًا لنوع الأصل، مثل معدات أو سيارات أو مبانٍ.",
      en: "Choose an account that matches the asset type, such as equipment, vehicles, or buildings.",
    },
    summary: {
      ar: "حساب الأصل يحدد أين ستظهر قيمة الأصل ماليًا.",
      en: "The asset account determines where the asset value appears financially.",
    },
    aliases: ["asset account", "حساب الأصل"],
  },
  {
    id: "fixed_assets.accumulated_depreciation_account",
    pageKey: "fixed_assets",
    kind: "field",
    label: {
      ar: "حساب مجمع الإهلاك",
      en: "Accumulated depreciation account",
    },
    purpose: {
      ar: "يحدد الحساب الذي يتجمع فيه الإهلاك المحتسب على الأصل عبر الفترات.",
      en: "Defines the account where depreciation calculated for the asset accumulates over periods.",
    },
    summary: {
      ar: "هذا الحساب يوضح مقدار الإهلاك المتراكم على الأصل.",
      en: "This account shows the depreciation accumulated against the asset.",
    },
    aliases: ["accumulated depreciation account", "حساب مجمع الإهلاك"],
  },
  {
    id: "fixed_assets.depreciation_expense_account",
    pageKey: "fixed_assets",
    kind: "field",
    label: {
      ar: "حساب مصروف الإهلاك",
      en: "Depreciation expense account",
    },
    purpose: {
      ar: "يحدد الحساب الذي يظهر فيه مصروف الإهلاك لكل فترة.",
      en: "Defines the account where periodic depreciation expense appears.",
    },
    summary: {
      ar: "حساب مصروف الإهلاك يوضح أثر استخدام الأصل على أرباح الفترة.",
      en: "The depreciation expense account shows the period impact of using the asset.",
    },
    aliases: ["depreciation expense account", "حساب مصروف الإهلاك"],
  },
  {
    id: "fixed_assets.branch",
    pageKey: "fixed_assets",
    kind: "field",
    label: {
      ar: "الفرع",
      en: "Branch",
    },
    purpose: {
      ar: "يربط الأصل بالفرع الذي يستخدمه أو يتحمل مسؤوليته في التقارير.",
      en: "Connects the asset to the branch that uses it or carries responsibility for it in reports.",
    },
    summary: {
      ar: "الفرع يساعد على توزيع الأصول والتقارير حسب مكان الاستخدام.",
      en: "Branch helps separate assets and reports by place of use.",
    },
    aliases: ["branch", "الفرع"],
  },
  {
    id: "fixed_assets.cost_center",
    pageKey: "fixed_assets",
    kind: "field",
    label: {
      ar: "مركز التكلفة",
      en: "Cost center",
    },
    purpose: {
      ar: "يربط الأصل بفريق أو نشاط معين حتى يظهر أثره المالي في التحليل الداخلي.",
      en: "Links the asset to a team or activity so its financial impact appears in internal analysis.",
    },
    summary: {
      ar: "مركز التكلفة يساعد على معرفة من يستفيد من الأصل أو يتحمل أثره.",
      en: "Cost center helps show who benefits from the asset or carries its impact.",
    },
    aliases: ["cost center", "مركز التكلفة"],
  },
  {
    id: "fixed_assets.create_asset_button",
    pageKey: "fixed_assets",
    kind: "button",
    label: {
      ar: "زر إنشاء الأصل",
      en: "Create asset button",
    },
    purpose: {
      ar: "يحفظ بيانات الأصل ويبدأ ملف متابعته داخل النظام.",
      en: "Saves the asset details and starts its follow-up profile in the system.",
    },
    whatToCheck: {
      ar: "راجع الفئة والتكلفة والتواريخ والحسابات قبل الإنشاء، لأنها تؤثر على الإهلاك والتقارير.",
      en: "Review category, cost, dates, and accounts before creating because they affect depreciation and reports.",
    },
    afterAction: {
      ar: "بعد الإنشاء ستنتقل عادة إلى صفحة الأصل لمتابعة الإهلاك والحالة.",
      en: "After creation, you usually move to the asset page to follow depreciation and status.",
    },
    summary: {
      ar: "إنشاء الأصل يثبت بياناته الأساسية لبدء المتابعة.",
      en: "Creating the asset confirms its base data for follow-up.",
    },
    aliases: ["create asset", "save asset", "إنشاء الأصل"],
  },
  {
    id: "fixed_assets_reports.report_type",
    pageKey: "fixed_assets_reports",
    kind: "field",
    label: {
      ar: "نوع التقرير",
      en: "Report type",
    },
    purpose: {
      ar: "يحدد زاوية القراءة التي تريدها: قائمة أصول، إهلاك، قيمة قبل وبعد، أو عمر متبقٍ.",
      en: "Sets the view you want: asset list, depreciation, before-and-after value, or remaining life.",
    },
    summary: {
      ar: "ابدأ باختيار نوع التقرير المناسب للسؤال الذي تريد إجابته.",
      en: "Start by choosing the report type that matches the question you want answered.",
    },
    aliases: ["report type", "نوع التقرير"],
  },
  {
    id: "fixed_assets_reports.status_filter",
    pageKey: "fixed_assets_reports",
    kind: "field",
    label: {
      ar: "فلتر الحالة",
      en: "Status filter",
    },
    purpose: {
      ar: "يعرض الأصول حسب حالتها مثل نشط، مباع، مستبعد، أو مهلك بالكامل.",
      en: "Shows assets by status such as active, sold, disposed, or fully depreciated.",
    },
    summary: {
      ar: "فلتر الحالة يساعدك تركز على مجموعة أصول محددة.",
      en: "The status filter helps you focus on a specific group of assets.",
    },
    aliases: ["status filter", "فلتر الحالة"],
  },
  {
    id: "fixed_assets_reports.branch_filter",
    pageKey: "fixed_assets_reports",
    kind: "field",
    label: {
      ar: "فلتر الفرع",
      en: "Branch filter",
    },
    purpose: {
      ar: "يقصر التقرير على أصول فرع معين عند الحاجة لمراجعة موقع أو مسؤولية محددة.",
      en: "Limits the report to assets of a specific branch when you need to review a location or responsibility.",
    },
    summary: {
      ar: "فلتر الفرع يجعل التقرير مناسبًا لموقع محدد.",
      en: "The branch filter makes the report specific to one location.",
    },
    aliases: ["branch filter", "فلتر الفرع"],
  },
  {
    id: "fixed_assets_reports.year",
    pageKey: "fixed_assets_reports",
    kind: "field",
    label: {
      ar: "السنة",
      en: "Year",
    },
    purpose: {
      ar: "تحدد السنة التي تريد قراءة الإهلاك أو التقرير السنوي عنها.",
      en: "Sets the year you want to read depreciation or the annual report for.",
    },
    summary: {
      ar: "السنة تضبط التقرير على فترة مالية واضحة.",
      en: "The year keeps the report tied to a clear financial period.",
    },
    aliases: ["year", "السنة"],
  },
  {
    id: "fixed_assets_reports.assets_list",
    pageKey: "fixed_assets_reports",
    kind: "field",
    label: {
      ar: "قائمة الأصول",
      en: "Assets list",
    },
    purpose: {
      ar: "تعرض الأصول مع التكلفة ومجمع الإهلاك والقيمة الدفترية والحالة.",
      en: "Shows assets with cost, accumulated depreciation, book value, and status.",
    },
    summary: {
      ar: "قائمة الأصول تعطيك صورة عامة عن ممتلكات الشركة الثابتة.",
      en: "The assets list gives an overview of company fixed assets.",
    },
    aliases: ["assets list", "قائمة الأصول"],
  },
  {
    id: "fixed_assets_reports.depreciation_schedule",
    pageKey: "fixed_assets_reports",
    kind: "field",
    label: {
      ar: "تقرير جدول الإهلاك",
      en: "Depreciation schedule report",
    },
    purpose: {
      ar: "يعرض فترات الإهلاك لكل أصل والقيمة المحتسبة في كل فترة.",
      en: "Shows depreciation periods for each asset and the amount calculated in each period.",
    },
    summary: {
      ar: "هذا التقرير يساعدك تراجع الإهلاك فترة بفترة.",
      en: "This report helps you review depreciation period by period.",
    },
    aliases: ["depreciation schedule report", "جدول الإهلاك"],
  },
  {
    id: "fixed_assets_reports.monthly_depreciation",
    pageKey: "fixed_assets_reports",
    kind: "field",
    label: {
      ar: "الإهلاك الشهري",
      en: "Monthly depreciation",
    },
    purpose: {
      ar: "يوضح مقدار الإهلاك المتوقع أو المحتسب شهريًا للأصل.",
      en: "Shows the expected or calculated monthly depreciation for the asset.",
    },
    summary: {
      ar: "الإهلاك الشهري يوضح أثر الأصل على كل شهر.",
      en: "Monthly depreciation shows the asset's impact on each month.",
    },
    aliases: ["monthly depreciation", "الإهلاك الشهري"],
  },
  {
    id: "fixed_assets_reports.value_before_after",
    pageKey: "fixed_assets_reports",
    kind: "field",
    label: {
      ar: "القيمة قبل وبعد الإهلاك",
      en: "Value before and after depreciation",
    },
    purpose: {
      ar: "يقارن قيمة الأصل قبل احتساب الإهلاك وبعده حتى ترى أثر الإهلاك بوضوح.",
      en: "Compares asset value before and after depreciation so you can see the impact clearly.",
    },
    summary: {
      ar: "هذه القراءة توضح كيف ينخفض رقم الأصل بسبب الإهلاك.",
      en: "This view shows how the asset value changes because of depreciation.",
    },
    aliases: ["value before after", "before after", "القيمة قبل وبعد"],
  },
  {
    id: "fixed_assets_reports.remaining_useful_life",
    pageKey: "fixed_assets_reports",
    kind: "field",
    label: {
      ar: "العمر المتبقي",
      en: "Remaining useful life",
    },
    purpose: {
      ar: "يوضح كم بقي من عمر الأصل المتوقع قبل انتهاء الإهلاك أو الحاجة للمراجعة.",
      en: "Shows how much expected life remains before depreciation ends or review is needed.",
    },
    summary: {
      ar: "العمر المتبقي يساعد على التخطيط للاستبدال أو الاستمرار في الاستخدام.",
      en: "Remaining life helps plan replacement or continued use.",
    },
    aliases: ["remaining useful life", "remaining life", "العمر المتبقي"],
  },
  {
    id: "fixed_assets_reports.book_value",
    pageKey: "fixed_assets_reports",
    kind: "field",
    label: {
      ar: "القيمة الدفترية في التقرير",
      en: "Book value in report",
    },
    purpose: {
      ar: "تعرض القيمة الحالية للأصل داخل التقرير بعد احتساب الإهلاك.",
      en: "Shows the asset's current value in the report after depreciation is considered.",
    },
    summary: {
      ar: "القيمة الدفترية في التقرير تساعدك تقرأ أثر الأصل ماليًا.",
      en: "Book value in the report helps you read the asset's financial impact.",
    },
    aliases: ["book value report", "book value", "القيمة الدفترية"],
  },
  {
    id: "fixed_assets_reports.export_csv_button",
    pageKey: "fixed_assets_reports",
    kind: "button",
    label: {
      ar: "زر تصدير CSV",
      en: "Export CSV button",
    },
    purpose: {
      ar: "ينزل التقرير الحالي في ملف يمكن فتحه في برامج الجداول لمراجعته أو مشاركته.",
      en: "Downloads the current report into a file that can be opened in spreadsheet tools for review or sharing.",
    },
    whatToCheck: {
      ar: "تأكد من نوع التقرير والفلاتر قبل التصدير حتى يكون الملف مناسبًا لما تريد مشاركته.",
      en: "Check the report type and filters before exporting so the file matches what you want to share.",
    },
    summary: {
      ar: "التصدير يحول نتيجة التقرير الحالية إلى ملف للمراجعة خارج النظام.",
      en: "Export turns the current report result into a file for review outside the system.",
    },
    aliases: ["export csv", "download report", "تصدير"],
  },
  {
    id: "fixed_assets_reports.no_data_message",
    pageKey: "fixed_assets_reports",
    kind: "message",
    label: {
      ar: "رسالة لا توجد بيانات",
      en: "No data message",
    },
    purpose: {
      ar: "تظهر عندما لا يجد التقرير أصولًا أو فترات إهلاك تطابق الاختيارات الحالية.",
      en: "Appears when the report cannot find assets or depreciation periods matching the current selections.",
    },
    whatToCheck: {
      ar: "راجع نوع التقرير والفلاتر والسنة، أو تأكد من وجود أصول مسجلة.",
      en: "Review the report type, filters, and year, or confirm that assets exist.",
    },
    summary: {
      ar: "هذه الرسالة غالبًا تعني أن نطاق البحث ضيق أو لا توجد بيانات بعد.",
      en: "This message usually means the search scope is narrow or there is no data yet.",
    },
    aliases: ["no data", "empty report", "لا توجد بيانات"],
  },
  {
    id: "employees.full_name",
    pageKey: "employees",
    kind: "field",
    label: {
      ar: "الاسم الكامل",
      en: "Full name",
    },
    purpose: {
      ar: "يحدد اسم الموظف كما سيظهر في سجلات الموظفين والحضور والمرتبات.",
      en: "Identifies the employee as they will appear in employee records, attendance, and payroll.",
    },
    whatToCheck: {
      ar: "اكتب الاسم بشكل واضح حتى لا يختلط مع موظف آخر في التقارير أو مسير الرواتب.",
      en: "Enter a clear name so it is not confused with another employee in reports or payroll.",
    },
    summary: {
      ar: "الاسم الكامل هو أساس التعرف على الموظف في كل صفحات HR.",
      en: "The full name is the base for recognizing the employee across HR pages.",
    },
    aliases: ["employee name", "full name", "الاسم الكامل", "اسم الموظف"],
  },
  {
    id: "employees.contact_info",
    pageKey: "employees",
    kind: "field",
    label: {
      ar: "البريد والهاتف",
      en: "Email and phone",
    },
    purpose: {
      ar: "يحفظ بيانات التواصل الأساسية مع الموظف عند الحاجة للمتابعة أو الإشعارات.",
      en: "Stores the employee's basic contact details for follow-up or notifications when needed.",
    },
    summary: {
      ar: "بيانات التواصل تساعد الإدارة على الوصول للموظف بسرعة.",
      en: "Contact details help management reach the employee quickly.",
    },
    aliases: ["email", "phone", "contact", "البريد", "الهاتف"],
  },
  {
    id: "employees.job_title",
    pageKey: "employees",
    kind: "field",
    label: {
      ar: "الوظيفة",
      en: "Job title",
    },
    purpose: {
      ar: "يوضح دور الموظف داخل الشركة، مثل محاسب أو مندوب مبيعات أو عامل إنتاج.",
      en: "Shows the employee's role in the company, such as accountant, sales representative, or production worker.",
    },
    summary: {
      ar: "الوظيفة تساعد على فهم مسؤولية الموظف وتنظيم التقارير.",
      en: "Job title helps explain the employee's responsibility and organize reports.",
    },
    aliases: ["job title", "role", "الوظيفة"],
  },
  {
    id: "employees.department",
    pageKey: "employees",
    kind: "field",
    label: {
      ar: "القسم",
      en: "Department",
    },
    purpose: {
      ar: "يربط الموظف بالقسم أو الفريق الذي يعمل معه داخل الشركة.",
      en: "Connects the employee to the department or team they work with.",
    },
    summary: {
      ar: "القسم يجعل متابعة الموظفين حسب الفرق أسهل.",
      en: "Department makes it easier to follow employees by team.",
    },
    aliases: ["department", "team", "القسم"],
  },
  {
    id: "employees.joined_date",
    pageKey: "employees",
    kind: "field",
    label: {
      ar: "تاريخ التعيين",
      en: "Joined date",
    },
    purpose: {
      ar: "يوضح متى بدأ الموظف العمل، وقد يفيد في حساب الأقدمية أو مراجعة بيانات الرواتب.",
      en: "Shows when the employee started work and can help with tenure or payroll review.",
    },
    summary: {
      ar: "تاريخ التعيين يحدد بداية علاقة الموظف بالشركة.",
      en: "Joined date marks the start of the employee's relationship with the company.",
    },
    aliases: ["joined date", "start date", "تاريخ التعيين"],
  },
  {
    id: "employees.base_salary",
    pageKey: "employees",
    kind: "field",
    label: {
      ar: "الراتب الأساسي",
      en: "Base salary",
    },
    purpose: {
      ar: "يمثل الراتب الثابت الذي يبدأ منه حساب المرتب قبل إضافة البدلات أو خصم الاستقطاعات.",
      en: "Represents the fixed salary used before adding allowances or subtracting deductions.",
    },
    whatToCheck: {
      ar: "راجعه جيدًا لأنه يدخل مباشرة في حساب صافي راتب الموظف.",
      en: "Review it carefully because it directly affects the employee's final salary.",
    },
    summary: {
      ar: "الراتب الأساسي هو نقطة بداية حساب المرتبات.",
      en: "Base salary is the starting point for payroll calculation.",
    },
    aliases: ["base salary", "salary", "الراتب الأساسي"],
  },
  {
    id: "employees.list",
    pageKey: "employees",
    kind: "field",
    label: {
      ar: "قائمة الموظفين",
      en: "Employees list",
    },
    purpose: {
      ar: "تعرض الموظفين المسجلين وبياناتهم الأساسية لمراجعتها أو تعديلها.",
      en: "Shows registered employees and their key details for review or editing.",
    },
    summary: {
      ar: "القائمة هي المكان الرئيسي لمراجعة بيانات الموظفين.",
      en: "The list is the main place to review employee data.",
    },
    aliases: ["employees list", "list", "قائمة الموظفين"],
  },
  {
    id: "employees.add_button",
    pageKey: "employees",
    kind: "button",
    label: {
      ar: "زر إضافة موظف",
      en: "Add employee button",
    },
    purpose: {
      ar: "يحفظ موظفًا جديدًا حتى يظهر في الحضور والمرتبات وباقي صفحات HR.",
      en: "Saves a new employee so they appear in attendance, payroll, and other HR pages.",
    },
    whatToCheck: {
      ar: "تأكد من الاسم والراتب الأساسي وتاريخ التعيين قبل الإضافة.",
      en: "Check the name, base salary, and joined date before adding.",
    },
    afterAction: {
      ar: "بعد الإضافة سيظهر الموظف في قائمة الموظفين ويمكن استخدامه في الحضور والمرتبات.",
      en: "After adding, the employee appears in the list and can be used in attendance and payroll.",
    },
    summary: {
      ar: "إضافة الموظف تفتح له ملفًا داخل HR.",
      en: "Adding the employee creates their HR profile.",
    },
    aliases: ["add employee", "add", "إضافة موظف"],
  },
  {
    id: "employees.edit_button",
    pageKey: "employees",
    kind: "button",
    label: {
      ar: "زر تعديل بيانات الموظف",
      en: "Edit employee button",
    },
    purpose: {
      ar: "يفتح بيانات الموظف للتعديل عندما تحتاج تصحيح وظيفة أو راتب أو بيانات تواصل.",
      en: "Opens employee details for editing when a job, salary, or contact detail needs correction.",
    },
    summary: {
      ar: "استخدم التعديل لتصحيح بيانات الموظف قبل أن تؤثر على المتابعة أو الرواتب.",
      en: "Use edit to correct employee data before it affects follow-up or payroll.",
    },
    aliases: ["edit employee", "edit", "تعديل الموظف"],
  },
  {
    id: "employees.save_button",
    pageKey: "employees",
    kind: "button",
    label: {
      ar: "زر حفظ بيانات الموظف",
      en: "Save employee button",
    },
    purpose: {
      ar: "يثبت التعديلات التي أجريتها على بيانات الموظف.",
      en: "Confirms the changes you made to the employee details.",
    },
    afterAction: {
      ar: "بعد الحفظ ستظهر البيانات الجديدة في قائمة الموظفين وفي الصفحات المرتبطة بها.",
      en: "After saving, the new details appear in the employee list and related pages.",
    },
    summary: {
      ar: "الحفظ يثبت التعديل داخل ملف الموظف.",
      en: "Saving confirms the update in the employee profile.",
    },
    aliases: ["save employee", "save", "حفظ الموظف"],
  },
  {
    id: "employees.delete_button",
    pageKey: "employees",
    kind: "button",
    label: {
      ar: "زر حذف موظف",
      en: "Delete employee button",
    },
    purpose: {
      ar: "يحذف الموظف من القائمة عندما لا يجب أن يبقى ضمن سجلات HR الحالية.",
      en: "Removes the employee from the list when they should no longer remain in current HR records.",
    },
    whatToCheck: {
      ar: "راجع أثر الحذف على الحضور والمرتبات السابقة قبل التأكيد.",
      en: "Review the impact on attendance and previous payroll before confirming.",
    },
    summary: {
      ar: "الحذف إجراء حساس ويجب استخدامه فقط عند التأكد.",
      en: "Deletion is sensitive and should only be used when confirmed.",
    },
    aliases: ["delete employee", "delete", "حذف موظف"],
  },
  {
    id: "employees.no_employees_message",
    pageKey: "employees",
    kind: "message",
    label: {
      ar: "رسالة لا يوجد موظفون",
      en: "No employees message",
    },
    purpose: {
      ar: "تظهر عندما لا توجد بيانات موظفين مسجلة بعد.",
      en: "Appears when no employee data has been registered yet.",
    },
    summary: {
      ar: "ابدأ بإضافة موظف حتى تعمل الحضور والمرتبات بشكل صحيح.",
      en: "Start by adding an employee so attendance and payroll can work correctly.",
    },
    aliases: ["no employees", "empty employees", "لا يوجد موظفون"],
  },
  {
    id: "attendance_daily.date_range",
    pageKey: "attendance_daily",
    kind: "field",
    label: {
      ar: "من تاريخ / إلى تاريخ",
      en: "From date / To date",
    },
    purpose: {
      ar: "يحدد الفترة التي تريد مراجعة سجلات الحضور خلالها.",
      en: "Sets the period you want to review attendance records for.",
    },
    summary: {
      ar: "الفترة تساعدك تركز على أيام محددة بدل عرض كل السجلات.",
      en: "The date range helps you focus on specific days instead of all records.",
    },
    aliases: ["date range", "from date", "to date", "من تاريخ", "إلى تاريخ"],
  },
  {
    id: "attendance_daily.employee_filter",
    pageKey: "attendance_daily",
    kind: "field",
    label: {
      ar: "فلتر الموظف",
      en: "Employee filter",
    },
    purpose: {
      ar: "يعرض حضور موظف محدد أو كل الموظفين حسب ما تحتاج مراجعته.",
      en: "Shows attendance for one employee or all employees depending on what you need to review.",
    },
    summary: {
      ar: "فلتر الموظف يجعل مراجعة الحضور أسرع وأكثر تركيزًا.",
      en: "The employee filter makes attendance review faster and more focused.",
    },
    aliases: ["employee filter", "employee", "فلتر الموظف"],
  },
  {
    id: "attendance_daily.table",
    pageKey: "attendance_daily",
    kind: "field",
    label: {
      ar: "جدول الحضور",
      en: "Attendance table",
    },
    purpose: {
      ar: "يعرض سجلات الحضور حسب الفترة والموظف، مثل اليوم والحالة وأي دقائق تأخير.",
      en: "Shows attendance records by period and employee, such as day, status, and any late minutes.",
    },
    summary: {
      ar: "جدول الحضور هو المكان الرئيسي لمراجعة الالتزام اليومي.",
      en: "The attendance table is the main place to review daily attendance.",
    },
    aliases: ["attendance table", "records", "جدول الحضور"],
  },
  {
    id: "attendance_daily.status",
    pageKey: "attendance_daily",
    kind: "status",
    label: {
      ar: "حالة الحضور",
      en: "Attendance status",
    },
    purpose: {
      ar: "توضح حالة الموظف في اليوم المحدد: حضور، غياب، إجازة، مرضية، تأخير، أو انصراف مبكر.",
      en: "Shows the employee's state for the selected day: present, absent, leave, sick, late, or early leave.",
    },
    summary: {
      ar: "حالة الحضور تشرح ماذا حدث في يوم العمل.",
      en: "Attendance status explains what happened on the workday.",
    },
    aliases: ["attendance status", "status", "حالة الحضور"],
  },
  {
    id: "attendance_daily.record_button",
    pageKey: "attendance_daily",
    kind: "button",
    label: {
      ar: "زر تسجيل حضور",
      en: "Add attendance entry button",
    },
    purpose: {
      ar: "يفتح نافذة لإضافة سجل حضور أو غياب أو تأخير لموظف في يوم محدد.",
      en: "Opens a dialog to add a present, absent, late, or other attendance entry for an employee on a specific day.",
    },
    summary: {
      ar: "استخدمه لإضافة سجل حضور يدوي عند الحاجة.",
      en: "Use it to manually add an attendance entry when needed.",
    },
    aliases: ["record attendance", "تسجيل حضور"],
  },
  {
    id: "attendance_daily.record_employee",
    pageKey: "attendance_daily",
    kind: "field",
    label: {
      ar: "الموظف في سجل الحضور",
      en: "Employee in attendance entry",
    },
    purpose: {
      ar: "يحدد الموظف الذي سيتم تسجيل حالته في ذلك اليوم.",
      en: "Identifies the employee whose daily status will be recorded.",
    },
    whatToCheck: {
      ar: "تأكد من اختيار الموظف الصحيح قبل التسجيل حتى لا ينتقل الحضور لشخص آخر.",
      en: "Make sure the correct employee is selected before recording so attendance is not assigned to someone else.",
    },
    summary: {
      ar: "اختيار الموظف الصحيح هو أساس سجل الحضور.",
      en: "Choosing the correct employee is the base of the attendance entry.",
    },
    aliases: ["attendance employee", "employee", "الموظف"],
  },
  {
    id: "attendance_daily.record_date",
    pageKey: "attendance_daily",
    kind: "field",
    label: {
      ar: "تاريخ الحضور",
      en: "Attendance date",
    },
    purpose: {
      ar: "يحدد اليوم الذي سيتم تسجيل الحضور أو الغياب أو التأخير له.",
      en: "Sets the day for the attendance, absence, or late entry.",
    },
    summary: {
      ar: "تاريخ الحضور يربط الحالة باليوم الصحيح.",
      en: "Attendance date connects the status to the correct day.",
    },
    aliases: ["attendance date", "date", "تاريخ الحضور"],
  },
  {
    id: "attendance_daily.status_present",
    pageKey: "attendance_daily",
    kind: "status",
    label: {
      ar: "حضور",
      en: "Present",
    },
    purpose: {
      ar: "تعني أن الموظف حضر للعمل في اليوم المحدد.",
      en: "Means the employee attended work on the selected day.",
    },
    summary: {
      ar: "حضور يعني أن اليوم محسوب كحضور عادي.",
      en: "Present means the day is counted as normal attendance.",
    },
    aliases: ["present", "حضور"],
  },
  {
    id: "attendance_daily.status_absent",
    pageKey: "attendance_daily",
    kind: "status",
    label: {
      ar: "غياب",
      en: "Absent",
    },
    purpose: {
      ar: "تعني أن الموظف لم يحضر في اليوم المحدد.",
      en: "Means the employee did not attend on the selected day.",
    },
    summary: {
      ar: "غياب قد يؤثر على المتابعة أو الراتب حسب سياسة الشركة.",
      en: "Absence may affect follow-up or salary depending on company policy.",
    },
    aliases: ["absent", "absence", "غياب"],
  },
  {
    id: "attendance_daily.status_leave",
    pageKey: "attendance_daily",
    kind: "status",
    label: {
      ar: "إجازة",
      en: "Leave",
    },
    purpose: {
      ar: "تعني أن عدم حضور الموظف مرتبط بإجازة معروفة أو مسموح بها.",
      en: "Means the employee's absence is related to known or allowed leave.",
    },
    summary: {
      ar: "الإجازة تفرق بين الغياب غير المخطط والراحة المعتمدة.",
      en: "Leave separates unplanned absence from approved time off.",
    },
    aliases: ["leave", "إجازة"],
  },
  {
    id: "attendance_daily.status_sick",
    pageKey: "attendance_daily",
    kind: "status",
    label: {
      ar: "مرضية",
      en: "Sick",
    },
    purpose: {
      ar: "تعني أن حالة اليوم مرتبطة بمرض أو عذر صحي.",
      en: "Means the day status is related to illness or a medical reason.",
    },
    summary: {
      ar: "الحالة المرضية تساعد على تمييز العذر الصحي في سجلات الحضور.",
      en: "Sick status helps distinguish medical reasons in attendance records.",
    },
    aliases: ["sick", "sick leave", "مرضية"],
  },
  {
    id: "attendance_daily.status_late",
    pageKey: "attendance_daily",
    kind: "status",
    label: {
      ar: "تأخير",
      en: "Late",
    },
    purpose: {
      ar: "تعني أن الموظف حضر بعد وقت البداية المتوقع.",
      en: "Means the employee arrived after the expected start time.",
    },
    summary: {
      ar: "التأخير يساعد الإدارة على متابعة الالتزام بمواعيد العمل.",
      en: "Late status helps management follow work-time commitment.",
    },
    aliases: ["late", "delay", "تأخير"],
  },
  {
    id: "attendance_daily.status_early_leave",
    pageKey: "attendance_daily",
    kind: "status",
    label: {
      ar: "انصراف مبكر",
      en: "Early leave",
    },
    purpose: {
      ar: "تعني أن الموظف غادر قبل نهاية وقت العمل المتوقع.",
      en: "Means the employee left before the expected end of work.",
    },
    summary: {
      ar: "الانصراف المبكر يوضح أن اليوم لم يكتمل بنفس شكل الحضور العادي.",
      en: "Early leave shows the day did not finish like normal attendance.",
    },
    aliases: ["early leave", "انصراف مبكر"],
  },
  {
    id: "attendance_daily.refresh_button",
    pageKey: "attendance_daily",
    kind: "button",
    label: {
      ar: "زر تحديث الحضور",
      en: "Refresh attendance button",
    },
    purpose: {
      ar: "يعيد تحميل سجلات الحضور حسب الفلاتر الحالية.",
      en: "Reloads attendance records using the current filters.",
    },
    summary: {
      ar: "التحديث يعرض أحدث بيانات متاحة للحضور.",
      en: "Refresh shows the latest available attendance data.",
    },
    aliases: ["refresh", "reload", "تحديث"],
  },
  {
    id: "attendance_daily.export_csv_button",
    pageKey: "attendance_daily",
    kind: "button",
    label: {
      ar: "زر تصدير CSV",
      en: "Export CSV button",
    },
    purpose: {
      ar: "ينزل سجلات الحضور الحالية في ملف يمكن مراجعته أو مشاركته.",
      en: "Downloads the current attendance records into a file for review or sharing.",
    },
    whatToCheck: {
      ar: "راجع الفترة والموظف قبل التصدير حتى يكون الملف مناسبًا لما تريد.",
      en: "Check the period and employee before exporting so the file matches what you need.",
    },
    summary: {
      ar: "التصدير يحول نتيجة الحضور الحالية إلى ملف خارجي.",
      en: "Export turns the current attendance result into an external file.",
    },
    aliases: ["export csv", "attendance export", "تصدير"],
  },
  {
    id: "attendance_daily.no_records_message",
    pageKey: "attendance_daily",
    kind: "message",
    label: {
      ar: "رسالة لا توجد سجلات حضور",
      en: "No attendance records message",
    },
    purpose: {
      ar: "تظهر عندما لا توجد سجلات تطابق الفترة أو الموظف المختار.",
      en: "Appears when no records match the selected period or employee.",
    },
    whatToCheck: {
      ar: "راجع الفلاتر أو سجّل حضورًا جديدًا إذا لم تكن هناك بيانات بعد.",
      en: "Review the filters or add attendance if no data exists yet.",
    },
    summary: {
      ar: "الرسالة غالبًا تعني أن الفترة أو الفلتر لا يحتوي بيانات.",
      en: "The message usually means the period or filter has no data.",
    },
    aliases: ["no attendance", "empty attendance", "لا توجد سجلات"],
  },
  {
    id: "payroll.period",
    pageKey: "payroll",
    kind: "field",
    label: {
      ar: "السنة والشهر",
      en: "Year and month",
    },
    purpose: {
      ar: "يحددان فترة الرواتب التي تريد حسابها أو مراجعتها أو صرفها.",
      en: "Set the payroll period you want to calculate, review, or pay.",
    },
    summary: {
      ar: "الفترة تحدد أي شهر سيتم حساب المرتبات له.",
      en: "The period defines which month payroll belongs to.",
    },
    aliases: ["payroll period", "year", "month", "السنة", "الشهر"],
  },
  {
    id: "payroll.payment_account",
    pageKey: "payroll",
    kind: "field",
    label: {
      ar: "حساب الدفع",
      en: "Payment account",
    },
    purpose: {
      ar: "يحدد الحساب الذي ستخرج منه مبالغ صرف المرتبات، مثل النقدية أو البنك.",
      en: "Defines the account salaries will be paid from, such as cash or bank.",
    },
    whatToCheck: {
      ar: "تأكد من اختيار الحساب الصحيح قبل صرف المرتبات.",
      en: "Make sure the correct account is selected before paying salaries.",
    },
    summary: {
      ar: "حساب الدفع يحدد مصدر صرف المرتبات.",
      en: "The payment account defines where salary payments come from.",
    },
    aliases: ["payment account", "cash bank", "حساب الدفع"],
  },
  {
    id: "payroll.payment_date",
    pageKey: "payroll",
    kind: "field",
    label: {
      ar: "تاريخ الصرف",
      en: "Payment date",
    },
    purpose: {
      ar: "يحدد التاريخ الذي سيتم تسجيل صرف المرتبات عليه.",
      en: "Sets the date used for the salary payment entry.",
    },
    summary: {
      ar: "تاريخ الصرف يضع عملية دفع الرواتب في الفترة الصحيحة.",
      en: "Payment date places salary payment in the correct period.",
    },
    aliases: ["payment date", "pay date", "تاريخ الصرف"],
  },
  {
    id: "payroll.run_button",
    pageKey: "payroll",
    kind: "button",
    label: {
      ar: "زر تشغيل المرتبات",
      en: "Run payroll button",
    },
    purpose: {
      ar: "يحسب رواتب الموظفين للفترة المختارة بناءً على الراتب الأساسي والتعديلات.",
      en: "Calculates employee salaries for the selected period based on base salary and adjustments.",
    },
    whatToCheck: {
      ar: "راجع السنة والشهر والتعديلات قبل التشغيل.",
      en: "Review the year, month, and adjustments before running.",
    },
    afterAction: {
      ar: "بعد التشغيل تظهر قسائم المرتبات وصافي راتب كل موظف للمراجعة.",
      en: "After running, payslips and each employee's final salary appear for review.",
    },
    summary: {
      ar: "تشغيل المرتبات يحسب الأرقام ولا يعني بالضرورة أن الرواتب صُرفت.",
      en: "Running payroll calculates the figures; it does not necessarily mean salaries were paid.",
    },
    aliases: ["run payroll", "run", "تشغيل المرتبات"],
  },
  {
    id: "payroll.pay_salaries_button",
    pageKey: "payroll",
    kind: "button",
    label: {
      ar: "زر صرف المرتبات",
      en: "Pay salaries button",
    },
    purpose: {
      ar: "يسجل عملية دفع الرواتب من حساب الدفع المختار للفترة الحالية.",
      en: "Records salary payment from the selected payment account for the current period.",
    },
    whatToCheck: {
      ar: "تأكد من صافي الرواتب وحساب الدفع وتاريخ الصرف قبل الضغط.",
      en: "Confirm final salaries, payment account, and payment date before pressing it.",
    },
    afterAction: {
      ar: "بعد الصرف ستظهر العملية في جدول المرتبات المصروفة.",
      en: "After payment, the transaction appears in the paid salaries table.",
    },
    summary: {
      ar: "صرف المرتبات هو خطوة الدفع الفعلية بعد مراجعة الحساب.",
      en: "Paying salaries is the actual payment step after review.",
    },
    aliases: ["pay salaries", "salary payment", "صرف المرتبات"],
  },
  {
    id: "payroll.adjustments_table",
    pageKey: "payroll",
    kind: "field",
    label: {
      ar: "التعديلات لكل موظف",
      en: "Adjustments per employee",
    },
    purpose: {
      ar: "يسمح بإضافة أو خصم مبالغ خاصة بكل موظف قبل حساب المرتبات.",
      en: "Allows adding or subtracting employee-specific amounts before payroll calculation.",
    },
    summary: {
      ar: "التعديلات تجعل الراتب يعكس بدلات وخصومات الفترة.",
      en: "Adjustments make salary reflect the period's allowances and deductions.",
    },
    aliases: ["adjustments", "allowances deductions", "التعديلات"],
  },
  {
    id: "payroll.allowances",
    pageKey: "payroll",
    kind: "field",
    label: {
      ar: "البدلات",
      en: "Allowances",
    },
    purpose: {
      ar: "مبالغ تضاف على راتب الموظف مثل بدل مواصلات أو بدل طبيعة عمل.",
      en: "Amounts added to an employee's salary, such as transport or job-related allowances.",
    },
    summary: {
      ar: "البدلات تزيد صافي الراتب.",
      en: "Allowances increase the final salary.",
    },
    aliases: ["allowances", "بدلات"],
  },
  {
    id: "payroll.deductions",
    pageKey: "payroll",
    kind: "field",
    label: {
      ar: "الخصومات",
      en: "Deductions",
    },
    purpose: {
      ar: "مبالغ تخصم من راتب الموظف حسب سياسة الشركة أو أحداث الفترة.",
      en: "Amounts subtracted from an employee's salary based on company policy or period events.",
    },
    summary: {
      ar: "الخصومات تقلل صافي الراتب.",
      en: "Deductions reduce the final salary.",
    },
    aliases: ["deductions", "خصومات"],
  },
  {
    id: "payroll.bonuses",
    pageKey: "payroll",
    kind: "field",
    label: {
      ar: "المكافآت",
      en: "Bonuses",
    },
    purpose: {
      ar: "مبالغ إضافية تمنح للموظف فوق الراتب الأساسي خلال الفترة.",
      en: "Extra amounts granted to the employee above base salary during the period.",
    },
    summary: {
      ar: "المكافآت تزيد استحقاق الموظف في الفترة.",
      en: "Bonuses increase the employee's period entitlement.",
    },
    aliases: ["bonuses", "bonus", "مكافآت", "بونص"],
  },
  {
    id: "payroll.advances",
    pageKey: "payroll",
    kind: "field",
    label: {
      ar: "السلف",
      en: "Advances",
    },
    purpose: {
      ar: "مبالغ تم صرفها للموظف مسبقًا ويتم خصمها من مرتب الفترة.",
      en: "Amounts previously paid to the employee and deducted from the period salary.",
    },
    summary: {
      ar: "السلف تقلل المبلغ الذي سيُصرف الآن.",
      en: "Advances reduce the amount paid now.",
    },
    aliases: ["advances", "salary advance", "سلف"],
  },
  {
    id: "payroll.insurance",
    pageKey: "payroll",
    kind: "field",
    label: {
      ar: "التأمينات",
      en: "Insurance",
    },
    purpose: {
      ar: "تمثل مبالغ التأمينات أو الاستقطاعات المشابهة التي تؤثر على صافي الراتب.",
      en: "Represents insurance or similar withholdings that affect final salary.",
    },
    summary: {
      ar: "التأمينات جزء من الاستقطاعات التي يجب مراجعتها قبل الصرف.",
      en: "Insurance is part of withholdings that should be reviewed before payment.",
    },
    aliases: ["insurance", "تأمينات"],
  },
  {
    id: "payroll.base_salary",
    pageKey: "payroll",
    kind: "field",
    label: {
      ar: "الراتب الأساسي في قسيمة الراتب",
      en: "Base salary in payslip",
    },
    purpose: {
      ar: "يعرض الراتب الثابت للموظف قبل إضافة البدلات والمكافآت وخصم الاستقطاعات.",
      en: "Shows the employee's fixed salary before allowances, bonuses, and deductions.",
    },
    summary: {
      ar: "الراتب الأساسي هو بداية قراءة قسيمة الراتب.",
      en: "Base salary is the starting point for reading a payslip.",
    },
    aliases: ["base salary", "salary", "الراتب الأساسي"],
  },
  {
    id: "payroll.net_salary",
    pageKey: "payroll",
    kind: "field",
    label: {
      ar: "صافي الراتب",
      en: "Final salary",
    },
    purpose: {
      ar: "يعرض المبلغ النهائي المستحق للموظف بعد كل الإضافات والخصومات.",
      en: "Shows the final amount due to the employee after all additions and deductions.",
    },
    example: {
      ar: "إذا كان الراتب الأساسي 5,000 والبدلات 500 والخصومات 200، فالصافي 5,300.",
      en: "If base salary is 5,000, allowances are 500, and deductions are 200, the final salary is 5,300.",
    },
    summary: {
      ar: "صافي الراتب هو الرقم الذي يهم قبل الصرف.",
      en: "Final salary is the key number before payment.",
    },
    aliases: ["net salary", "final salary", "صافي الراتب"],
  },
  {
    id: "payroll.payslips_table",
    pageKey: "payroll",
    kind: "field",
    label: {
      ar: "قسائم المرتبات",
      en: "Payslips",
    },
    purpose: {
      ar: "تعرض نتيجة حساب الراتب لكل موظف وتفاصيل الإضافات والخصومات والصافي.",
      en: "Shows the payroll calculation result for each employee with additions, deductions, and final amount.",
    },
    summary: {
      ar: "قسائم المرتبات هي نتيجة التشغيل التي يجب مراجعتها قبل الصرف.",
      en: "Payslips are the run result that should be reviewed before payment.",
    },
    aliases: ["payslips", "salary slips", "قسائم المرتبات"],
  },
  {
    id: "payroll.attach_bonuses_button",
    pageKey: "payroll",
    kind: "button",
    label: {
      ar: "زر ربط البونصات بالمرتبات",
      en: "Attach bonuses to payroll button",
    },
    purpose: {
      ar: "ينقل البونصات المعلقة إلى قسائم المرتبات للفترة الحالية بعد تشغيل المرتبات.",
      en: "Moves pending bonuses into the current period payslips after payroll is run.",
    },
    summary: {
      ar: "ربط البونصات يضيف المكافآت المستحقة إلى قسائم المرتبات.",
      en: "Attaching bonuses adds eligible rewards to payslips.",
    },
    aliases: ["attach bonuses", "bonuses payroll", "ربط البونصات"],
  },
  {
    id: "payroll.attach_commissions_button",
    pageKey: "payroll",
    kind: "button",
    label: {
      ar: "زر ربط العمولات بالمرتبات",
      en: "Attach commissions to payroll button",
    },
    purpose: {
      ar: "يربط العمولات الجاهزة بقسائم المرتبات حتى تظهر ضمن مستحقات الموظفين.",
      en: "Links ready commissions to payslips so they appear in employee entitlements.",
    },
    summary: {
      ar: "ربط العمولات يجعلها جزءًا من قراءة راتب الفترة.",
      en: "Attaching commissions makes them part of the period payroll view.",
    },
    aliases: ["attach commissions", "commissions payroll", "ربط العمولات"],
  },
  {
    id: "payroll.paid_salaries_table",
    pageKey: "payroll",
    kind: "field",
    label: {
      ar: "جدول المرتبات المصروفة",
      en: "Paid salaries table",
    },
    purpose: {
      ar: "يعرض عمليات صرف المرتبات التي تم تسجيلها لهذه الفترة، مع التاريخ والحساب والمبلغ.",
      en: "Shows salary payment transactions recorded for this period, with date, account, and amount.",
    },
    summary: {
      ar: "جدول الصرف يوضح ما تم دفعه فعليًا.",
      en: "The payment table shows what was actually paid.",
    },
    aliases: ["paid salaries", "payments table", "المرتبات المصروفة"],
  },
  {
    id: "payroll.print_button",
    pageKey: "payroll",
    kind: "button",
    label: {
      ar: "زر الطباعة",
      en: "Print button",
    },
    purpose: {
      ar: "يطبع بيانات المرتبات الحالية للمراجعة أو الحفظ الورقي.",
      en: "Prints the current payroll data for review or paper filing.",
    },
    summary: {
      ar: "الطباعة تفيد عند مشاركة مسير الرواتب أو أرشفته.",
      en: "Printing helps share or archive the payroll run.",
    },
    aliases: ["print", "طباعة"],
  },
  {
    id: "payroll.no_payslips_message",
    pageKey: "payroll",
    kind: "message",
    label: {
      ar: "رسالة لا توجد قسائم مرتبات",
      en: "No payslips message",
    },
    purpose: {
      ar: "تظهر عندما لا توجد نتيجة تشغيل مرتبات للفترة المختارة.",
      en: "Appears when no payroll calculation result exists for the selected period.",
    },
    whatToCheck: {
      ar: "راجع السنة والشهر أو شغّل المرتبات إذا لم يتم حسابها بعد.",
      en: "Check the year and month or run payroll if it has not been calculated yet.",
    },
    summary: {
      ar: "هذه الرسالة تعني غالبًا أن المرتبات لم تُحسب لهذه الفترة.",
      en: "This message usually means payroll has not been calculated for this period.",
    },
    aliases: ["no payslips", "لا توجد قسائم"],
  },
  {
    id: "payroll.no_payments_message",
    pageKey: "payroll",
    kind: "message",
    label: {
      ar: "رسالة لا توجد عمليات صرف",
      en: "No payments message",
    },
    purpose: {
      ar: "تظهر عندما لا توجد عمليات صرف مرتبات مسجلة للفترة الحالية.",
      en: "Appears when no salary payment transactions are recorded for the current period.",
    },
    whatToCheck: {
      ar: "راجع هل تم صرف المرتبات بالفعل، وهل الفترة المختارة صحيحة.",
      en: "Check whether salaries were actually paid and whether the selected period is correct.",
    },
    summary: {
      ar: "هذه الرسالة تعني أن الحساب موجود لكن الصرف لم يظهر بعد لهذه الفترة.",
      en: "This message means the payroll may exist, but payment has not appeared for this period.",
    },
    aliases: ["no payments", "لا توجد عمليات صرف"],
  },
] as const satisfies readonly AIFieldHelpItem[]

export function getFieldHelpForPage(
  pageKey?: string | null,
  options: { kind?: AIFieldHelpKind; limit?: number } = {}
): AIFieldHelpItem[] {
  const normalizedPageKey = String(pageKey || "").trim().toLowerCase()
  if (!normalizedPageKey) return []

  const items = AI_FIELD_HELP_REGISTRY.filter((item) => {
    if (item.pageKey !== normalizedPageKey) return false
    return options.kind ? item.kind === options.kind : true
  })

  return typeof options.limit === "number" ? items.slice(0, options.limit) : [...items]
}

export function getFieldHelpItem(id?: string | null): AIFieldHelpItem | null {
  const normalizedId = String(id || "").trim()
  if (!normalizedId) return null
  return AI_FIELD_HELP_REGISTRY.find((item) => item.id === normalizedId) || null
}

export function buildFieldHelpContextBlock(
  pageKey: string | null | undefined,
  language: AIHelpLanguage,
  limit = 14
): string {
  const items = getFieldHelpForPage(pageKey, { limit })
  if (items.length === 0) return ""

  const kindLabel: Record<AIFieldHelpKind, AILocalizedText> = {
    field: { ar: "حقل", en: "Field" },
    button: { ar: "زر", en: "Button" },
    status: { ar: "حالة", en: "Status" },
    message: { ar: "رسالة", en: "Message" },
  }

  const sectionTitle =
    language === "ar"
      ? "مساعدة عناصر الصفحة"
      : "Page element help"
  const instruction =
    language === "ar"
      ? "استخدم هذه البيانات عند سؤال المستخدم عن معنى حقل أو زر أو حالة. اشرح المعنى العملي ولا تذكر أسماء تقنية داخلية."
      : "Use this data when the user asks about a field, button, or status. Explain the practical meaning and avoid internal technical names."

  const lines = items.map((item) => {
    const details = [
      `${language === "ar" ? "الهدف" : "Purpose"}: ${localize(item.purpose, language)}`,
      item.whenToUse
        ? `${language === "ar" ? "متى يستخدم" : "When to use"}: ${localize(item.whenToUse, language)}`
        : null,
      item.whatToCheck
        ? `${language === "ar" ? "ما الذي يراجعه المستخدم" : "What to check"}: ${localize(item.whatToCheck, language)}`
        : null,
      item.afterAction
        ? `${language === "ar" ? "ماذا يحدث بعدها" : "What happens next"}: ${localize(item.afterAction, language)}`
        : null,
      item.example
        ? `${language === "ar" ? "مثال مبسط" : "Simple example"}: ${localize(item.example, language)}`
        : null,
      `${language === "ar" ? "خلاصة سهلة" : "Easy summary"}: ${localize(item.summary, language)}`,
    ].filter(Boolean)

    return [
      `- ${localize(kindLabel[item.kind], language)}: ${localize(item.label, language)}`,
      ...details.map((detail) => `  ${detail}`),
    ].join("\n")
  })

  return [sectionTitle, instruction, ...lines].join("\n")
}

function localize(text: AILocalizedText, language: AIHelpLanguage) {
  return text[language] || text.ar || text.en
}
