"use client"

/**
 * manufacturing-ui.ts
 * Shared copy/strings for all manufacturing module pages.
 * Follows the established AppLang pattern (ar/en via readAppLanguage).
 */

export type AppLang = "ar" | "en"

export function readAppLanguage(): AppLang {
  if (typeof window === "undefined") return "ar"
  try {
    const fromCookie = document.cookie
      .split("; ")
      .find((c) => c.startsWith("app_language="))
      ?.split("=")[1]
    const value = fromCookie || localStorage.getItem("app_language") || "ar"
    return value === "en" ? "en" : "ar"
  } catch {
    return "ar"
  }
}

export function getTextDirection(lang: AppLang) {
  return lang === "en" ? "ltr" : "rtl"
}

// ─────────────────────────────────────────────
// Work Centers
// ─────────────────────────────────────────────
export const WORK_CENTER_COPY = {
  ar: {
    page: {
      title: "مراكز العمل",
      description: "عرّف الآلات والأقسام التي تُنجز فيها عمليات التصنيع",
      pill: "التهيئة الهندسية",
      whatTitle: "ما هو مركز العمل؟",
      whatDesc:
        "مركز العمل هو أي آلة أو قسم أو محطة عمل تُنجز فيها عملية من عمليات التصنيع. يمكن أن يكون مركز العمل آلة واحدة، مجموعة آلات، أو حتى قسماً بالكامل كقسم التعبئة.",
      examplesTitle: "أمثلة على مراكز العمل",
      examples: [
        { icon: "⚙️", name: "آلة الخلط",       desc: "تخلط المكونات السائلة بنسب محددة" },
        { icon: "🔥", name: "فرن التجفيف",     desc: "يجفف المنتجات عند درجة حرارة محددة" },
        { icon: "📦", name: "خط التعبئة",       desc: "يعبئ المنتج النهائي في عبوات" },
        { icon: "🔬", name: "مختبر الجودة",     desc: "يفحص المنتج قبل الشحن" },
        { icon: "🏭", name: "قسم التصنيع",      desc: "منطقة إنتاج عامة" },
        { icon: "🤖", name: "روبوت التعبئة",    desc: "تعبئة آلية بدقة عالية" },
      ],
      whenTitle: "متى تستخدم مراكز العمل؟",
      whenDesc:
        "عرّف مراكز العمل قبل إنشاء مسارات التصنيع. كل عملية في مسار التصنيع تحتاج إلى ربطها بمركز عمل محدد حتى يتمكن النظام من حساب وقت الإنتاج والتكلفة.",
      relationTitle: "العلاقة بمسارات التصنيع",
      relationDesc:
        "مسار التصنيع → عمليات (خطوات) → كل خطوة مرتبطة بمركز عمل.\nمثال: منتج 'عصير برتقال' → مسار 'الإنتاج الرئيسي' → ١. عملية الضغط (مركز: آلة الضغط) → ٢. عملية الفلترة (مركز: خط الفلترة) → ٣. عملية التعبئة (مركز: خط التعبئة)",
      nextStepTitle: "الخطوة التالية",
      nextStepDesc:
        "بعد تعريف مراكز العمل، انتقل إلى مسارات التصنيع لربط كل عملية بمركزها.",
      comingSoon: "هذه الميزة قيد التطوير",
      comingSoonDesc:
        "صفحة إدارة مراكز العمل (إضافة / تعديل / حذف) ستُتاح قريباً. حالياً يمكن تعريف مراكز العمل مباشرةً عبر قاعدة البيانات أو من خلال مسؤول النظام.",
      goToRoutings: "مسارات التصنيع",
      goToOrders: "أوامر الإنتاج",
    },
  },
  en: {
    page: {
      title: "Work Centers",
      description: "Define machines and departments where manufacturing operations take place",
      pill: "Engineering Setup",
      whatTitle: "What is a Work Center?",
      whatDesc:
        "A work center is any machine, department, or workstation where a manufacturing operation is performed. It can be a single machine, a group of machines, or an entire department like a packaging line.",
      examplesTitle: "Work Center Examples",
      examples: [
        { icon: "⚙️", name: "Mixing Machine",    desc: "Blends liquid components in set ratios" },
        { icon: "🔥", name: "Drying Oven",        desc: "Dries products at a set temperature" },
        { icon: "📦", name: "Packaging Line",      desc: "Packages finished products in containers" },
        { icon: "🔬", name: "Quality Lab",         desc: "Inspects product before shipping" },
        { icon: "🏭", name: "Production Floor",    desc: "General manufacturing area" },
        { icon: "🤖", name: "Packaging Robot",     desc: "Automated high-precision packaging" },
      ],
      whenTitle: "When to Use Work Centers?",
      whenDesc:
        "Define work centers before creating routings. Each operation in a routing needs a work center assigned so the system can calculate production time and cost.",
      relationTitle: "Relationship with Routings",
      relationDesc:
        "Routing → Operations (steps) → Each step linked to a Work Center.\nExample: 'Orange Juice' → 'Main Production' routing → 1. Pressing (Work Center: Press Machine) → 2. Filtering (Work Center: Filter Line) → 3. Packaging (Work Center: Packaging Line)",
      nextStepTitle: "Next Step",
      nextStepDesc:
        "After defining work centers, go to Routings to link each operation to its work center.",
      comingSoon: "This feature is under development",
      comingSoonDesc:
        "The work center management page (add / edit / delete) will be available soon. Currently, work centers can be defined directly in the database or through the system administrator.",
      goToRoutings: "Manufacturing Routings",
      goToOrders: "Production Orders",
    },
  },
} as const

// ─────────────────────────────────────────────
// MRP (Material Requirements Planning)
// ─────────────────────────────────────────────
export const MRP_COPY = {
  ar: {
    page: {
      title: "تخطيط متطلبات المواد (MRP)",
      description: "احسب المواد المطلوبة لتلبية طلبات الإنتاج قبل إصدار الأوامر",
      pill: "التخطيط والإصدار",
      whatTitle: "ما هو تخطيط متطلبات المواد؟",
      whatDesc:
        "MRP هي عملية حساب المواد الخام والمكونات المطلوبة لإنتاج كميات محددة، مع مراعاة المخزون الحالي ومواعيد التسليم. تساعدك على معرفة 'ماذا تحتاج؟' و'متى تحتاجه؟' قبل بدء الإنتاج.",
      whenTitle: "متى تستخدم MRP؟",
      whenDesc:
        "قبل إصدار أوامر الإنتاج لطلبيات كبيرة، شغّل MRP لمعرفة ما إذا كانت المواد الخام متوفرة أم تحتاج لشراء. يمنعك من توقف الإنتاج بسبب نقص المواد.",
      comingSoon: "هذه الميزة قيد التطوير",
      comingSoonDesc:
        "صفحة تخطيط متطلبات المواد ستُتاح قريباً. ستتيح لك حساب احتياجات المواد تلقائياً بناءً على أوامر الإنتاج المخططة وقوائم المواد المعتمدة.",
      goToBoms: "قوائم المواد",
      goToOrders: "أوامر الإنتاج",
      nextStepDesc: "بعد تشغيل MRP وتأكيد توفر المواد، أنشئ أوامر الإنتاج.",
    },
  },
  en: {
    page: {
      title: "Material Requirements Planning (MRP)",
      description: "Calculate materials needed to fulfill production requests before issuing orders",
      pill: "Planning & Release",
      whatTitle: "What is MRP?",
      whatDesc:
        "MRP is the process of calculating raw materials and components needed to produce specific quantities, considering current inventory and lead times. It answers 'What do you need?' and 'When do you need it?' before production starts.",
      whenTitle: "When to Use MRP?",
      whenDesc:
        "Before releasing production orders for large batches, run MRP to verify if raw materials are available or need to be purchased. It prevents production stoppages due to material shortages.",
      comingSoon: "This feature is under development",
      comingSoonDesc:
        "The MRP page will be available soon. It will allow you to automatically calculate material needs based on planned production orders and approved bills of materials.",
      goToBoms: "Bills of Materials",
      goToOrders: "Production Orders",
      nextStepDesc: "After running MRP and confirming material availability, create production orders.",
    },
  },
} as const

// ─────────────────────────────────────────────
// BOM Versions redirect page
// ─────────────────────────────────────────────
export const BOM_VERSIONS_COPY = {
  ar: {
    page: {
      title: "إصدارات قوائم المواد",
      description: "أدر إصدارات قوائم المواد المعتمدة والمخططة",
      pill: "التهيئة الهندسية",
      infoTitle: "إصدارات قوائم المواد",
      infoDesc:
        "كل قائمة مواد يمكن أن يكون لها عدة إصدارات. الإصدار هو النسخة الرسمية المعتمدة التي تحدد المكونات والكميات. يمكنك إنشاء إصدار جديد عند تغيير الوصفة دون فقدان الإصدارات القديمة.",
      howToTitle: "كيفية إدارة الإصدارات",
      howToSteps: [
        "١. انتقل إلى صفحة قوائم المواد",
        "٢. افتح قائمة المواد المطلوبة",
        "٣. في تبويب 'الإصدارات'، أضف إصداراً جديداً",
        "٤. حدد المكونات والكميات",
        "٥. أرسل للاعتماد واجعله الإصدار الافتراضي",
      ],
      goToBoms: "الذهاب لقوائم المواد",
    },
  },
  en: {
    page: {
      title: "BOM Versions",
      description: "Manage approved and planned versions of Bills of Materials",
      pill: "Engineering Setup",
      infoTitle: "Bills of Materials Versions",
      infoDesc:
        "Each bill of materials can have multiple versions. A version is the approved official copy that defines components and quantities. You can create a new version when the recipe changes without losing old versions.",
      howToTitle: "How to Manage Versions",
      howToSteps: [
        "1. Go to the Bills of Materials page",
        "2. Open the required BOM",
        "3. In the 'Versions' tab, add a new version",
        "4. Define components and quantities",
        "5. Submit for approval and set as default",
      ],
      goToBoms: "Go to Bills of Materials",
    },
  },
} as const

// ─────────────────────────────────────────────
// Execution phase pages (material issue, product receive, close)
// ─────────────────────────────────────────────
export const EXECUTION_COPY = {
  ar: {
    materialIssue: {
      title: "صرف المواد الخام",
      description: "اخصم المواد الخام من المخزن لتغذية الإنتاج",
      pill: "التنفيذ",
      whatTitle: "ما هو صرف المواد؟",
      whatDesc:
        "عند إصدار أمر الإنتاج والبدء في التصنيع، يجب صرف المواد الخام من المخزن لتغذية خط الإنتاج. هذه العملية تخصم كميات المواد من مستودع الصرف وتسجلها في حركة مخزونية.",
      howToTitle: "كيفية صرف المواد",
      howToDesc:
        "افتح أمر الإنتاج المراد تنفيذه، ثم استخدم زر 'بدء التنفيذ' لإطلاق عملية الصرف. سيقوم النظام تلقائياً بخصم المواد المطلوبة وفق قائمة المواد المعتمدة.",
      goToOrders: "أوامر الإنتاج",
    },
    productReceive: {
      title: "استلام المنتج النهائي",
      description: "أضف المنتج المصنّع إلى المخزن بعد الانتهاء من الإنتاج",
      pill: "التنفيذ",
      whatTitle: "ما هو استلام المنتج النهائي؟",
      whatDesc:
        "بعد اكتمال التصنيع، يجب إضافة المنتج النهائي إلى مستودع الاستلام. هذه العملية ترفع رصيد المنتج في المخزن وتسجل الكمية المصنّعة فعلياً.",
      howToTitle: "كيفية استلام المنتج",
      howToDesc:
        "من صفحة تفاصيل أمر الإنتاج، استخدم زر 'إكمال الأمر' وأدخل الكمية المصنّعة فعلياً. سيضيف النظام المنتج النهائي لمستودع الاستلام تلقائياً.",
      goToOrders: "أوامر الإنتاج",
    },
    closeOrder: {
      title: "إغلاق أمر الإنتاج",
      description: "أنهِ دورة الإنتاج واحسب التكاليف الفعلية",
      pill: "التنفيذ",
      whatTitle: "ما هو إغلاق أمر الإنتاج؟",
      whatDesc:
        "إغلاق أمر الإنتاج هو الخطوة الأخيرة في دورة التصنيع. بعد استلام المنتج النهائي، يُغلق الأمر مما يُجمّد جميع الحركات المخزونية المرتبطة به ويُتيح احتساب التكلفة الفعلية للإنتاج.",
      howToTitle: "متى يُغلق الأمر؟",
      howToDesc:
        "يُغلق الأمر تلقائياً عند الضغط على 'إكمال الأمر' من صفحة التفاصيل وإدخال الكمية المصنّعة. تأكد من أن جميع عمليات الصرف والاستلام قد اكتملت قبل الإغلاق.",
      goToOrders: "أوامر الإنتاج",
    },
  },
  en: {
    materialIssue: {
      title: "Issue Raw Materials",
      description: "Deduct raw materials from warehouse to feed production",
      pill: "Execution",
      whatTitle: "What is Material Issue?",
      whatDesc:
        "When a production order is released and manufacturing begins, raw materials must be issued from the warehouse to feed the production line. This operation deducts material quantities from the issue warehouse and records an inventory movement.",
      howToTitle: "How to Issue Materials",
      howToDesc:
        "Open the production order you want to execute, then use the 'Start Execution' button to trigger the material issue. The system will automatically deduct the required materials based on the approved BOM.",
      goToOrders: "Production Orders",
    },
    productReceive: {
      title: "Receive Finished Product",
      description: "Add the manufactured product to warehouse inventory after production",
      pill: "Execution",
      whatTitle: "What is Product Receive?",
      whatDesc:
        "After manufacturing is complete, the finished product must be added to the receipt warehouse. This operation increases the product balance in inventory and records the actual manufactured quantity.",
      howToTitle: "How to Receive Product",
      howToDesc:
        "From the production order detail page, use the 'Complete Order' button and enter the actual manufactured quantity. The system will automatically add the finished product to the receipt warehouse.",
      goToOrders: "Production Orders",
    },
    closeOrder: {
      title: "Close Production Order",
      description: "End the production cycle and calculate actual costs",
      pill: "Execution",
      whatTitle: "What is Order Closure?",
      whatDesc:
        "Closing a production order is the final step in the manufacturing cycle. After receiving the finished product, closing the order freezes all related inventory movements and allows calculating the actual production cost.",
      howToTitle: "When to Close the Order?",
      howToDesc:
        "The order closes automatically when you click 'Complete Order' from the detail page and enter the manufactured quantity. Ensure all issue and receipt operations are complete before closing.",
      goToOrders: "Production Orders",
    },
  },
} as const
