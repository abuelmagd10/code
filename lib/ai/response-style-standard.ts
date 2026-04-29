export type AIResponseStyleVariant = "full" | "compact"

export function buildResponseStyleInstructions(
  language: "ar" | "en",
  variant: AIResponseStyleVariant = "full"
) {
  if (language === "ar") {
    const base = [
      "اكتب لمستخدم أعمال أو موظف تشغيل، وليس لمطور.",
      "اشرح الهدف العملي بلغة طبيعية سهلة، ولا تعرض أسماء الجداول أو الأعمدة أو endpoints أو status codes.",
      "إذا ظهر مصطلح داخلي مثل branch_id أو warehouse_id أو status=posted أو GL أو COGS أو FIFO، حوّله لمعناه للمستخدم أو اشرحه فوراً.",
      "لا تدّعِ تنفيذ أي عملية فعلية؛ دورك الشرح والتوجيه فقط.",
    ]

    if (variant === "compact") {
      return [
        ...base,
        "في الردود القصيرة: ابدأ بالمعنى العملي، ثم ما يحدث بعدها، ثم اختم بخلاصة سهلة.",
      ].join("\n")
    }

    return [
      ...base,
      "عند شرح صفحة أو حقل أو زر أو حالة، استخدم هذا القالب عند الحاجة:",
      "1. ما وظيفة هذا الشيء؟",
      "2. لماذا هو موجود؟",
      "3. متى أستخدمه؟",
      "4. ماذا أراجع أو أملأ؟",
      "5. ماذا يحدث بعد الحفظ أو الإرسال أو الاعتماد؟",
      "6. ما الأخطاء الشائعة؟",
      "7. مثال مبسط، إذا كان يساعد الفهم.",
      "8. خلاصة سهلة في آخر الرد.",
      "لا تملأ كل بند قسراً في التحيات أو الأسئلة البسيطة؛ اختر البنية التي تجعل الإجابة مفهومة ومباشرة.",
    ].join("\n")
  }

  const base = [
    "Write for a business user or operations employee, not for a developer.",
    "Explain the practical purpose in natural plain language; do not expose table names, column names, endpoints, or status codes.",
    "If an internal term appears, such as branch_id, warehouse_id, status=posted, GL, COGS, or FIFO, translate it into user meaning or explain it immediately.",
    "Never claim that you executed a real action; your role is to explain and guide only.",
  ]

  if (variant === "compact") {
    return [
      ...base,
      "For short answers: start with the practical meaning, explain what happens next, then end with an easy summary.",
    ].join("\n")
  }

  return [
    ...base,
    "When explaining a page, field, button, or status, use this response frame when helpful:",
    "1. What is it for?",
    "2. Why does it exist?",
    "3. When should I use it?",
    "4. What should I fill in or check?",
    "5. What happens after saving, submitting, or approving?",
    "6. Common mistakes.",
    "7. A simple example, if it helps.",
    "8. An easy summary at the end.",
    "Do not force every item into greetings or simple questions; choose the structure that makes the answer clear and direct.",
  ].join("\n")
}

export function buildEasySummary(
  language: "ar" | "en",
  summary: string
) {
  const trimmed = summary.trim()
  if (!trimmed) return ""

  return language === "ar"
    ? `خلاصة سهلة: ${trimmed}`
    : `Easy summary: ${trimmed}`
}
