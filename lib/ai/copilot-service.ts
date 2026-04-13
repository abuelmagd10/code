import { createHash } from "node:crypto"
import type {
  AICopilotInteractivePayload,
  AIInsight,
  AINextAction,
  AIPredictedAction,
  AIQuickPrompt,
  AISeverity,
  AIToolCallAudit,
} from "@/lib/ai/contracts"
import type { AICopilotContext } from "@/lib/ai/context-builder"
import { generateAIProviderReply } from "@/lib/ai/provider-layer"
import { buildERPQuestionBankPrompts } from "@/lib/ai/question-bank"

export interface CopilotChatMessage {
  role: "user" | "assistant"
  content: string
}

export interface CopilotChatResult {
  answer: string
  usedModel: string
  fallbackUsed: boolean
  fallbackReason?: string | null
  interactivePayload: AICopilotInteractivePayload
  toolAudit: AIToolCallAudit
}

interface IntentAnalysis {
  askWorkflow: boolean
  askReport: boolean
  askGovernance: boolean
  askAccounting: boolean
  askAction: boolean
  askPrediction: boolean
  askValidation: boolean
  askCapabilities: boolean
  askGreeting: boolean
  askDefinition: boolean
  askDashboardCardMeaning: boolean
  askPageContents: boolean
  askSalesCycle: boolean
  askPurchaseCycle: boolean
}

const LOCAL_COPILOT_MODEL = "local-erp-copilot-v2"

export async function generateCopilotReply(params: {
  context: AICopilotContext
  messages: CopilotChatMessage[]
  userMessage: string
}): Promise<CopilotChatResult> {
  const { context, messages, userMessage } = params

  const intents = analyzeIntent(userMessage, context.language)
  const interactivePayload = buildCopilotInteractivePayload({
    context,
    messages,
    userMessage,
  })

  const sections = buildLocalAnswerSections({
    context,
    intents,
    userMessage,
    interactivePayload,
  })

  if (
    sections.length === 0 ||
    (!context.guide && interactivePayload.metrics.length === 0 && interactivePayload.insights.length === 0)
  ) {
    return buildFallbackResult(context, userMessage, "limited_local_context", interactivePayload)
  }

  const fallbackAnswer = sections.join("\n\n")
  const providerReply = await generateAIProviderReply({
    context,
    messages,
    userMessage,
    interactivePayload,
    fallbackAnswer,
  })

  return {
    answer: providerReply.answer,
    usedModel: providerReply.usedModel,
    fallbackUsed: providerReply.fallbackUsed,
    fallbackReason: providerReply.fallbackReason || null,
    interactivePayload,
    toolAudit: {
      toolName: providerReply.toolName,
      input: {
        pageKey: context.scope.pageKey,
        domain: context.domain,
        intent: intents,
        metricsCount: interactivePayload.metrics.length,
        messageCount: messages.length,
        insightsCount: interactivePayload.insights.length,
        predictionsCount: interactivePayload.predictedActions.length,
        provider: providerReply.auditMeta.provider,
        providerModel: providerReply.usedModel,
        fallbackUsed: providerReply.fallbackUsed,
        fallbackReason: providerReply.fallbackReason || null,
        ...providerReply.auditMeta,
      },
      outputHash: createHash("sha256").update(providerReply.answer).digest("hex"),
    },
  }
}

export function buildCopilotInteractivePayload(params: {
  context: AICopilotContext
  messages?: CopilotChatMessage[]
  userMessage?: string | null
}): AICopilotInteractivePayload {
  const { context, messages = [], userMessage = null } = params

  const metrics = context.liveContext.metrics.map((item) => ({
    label: item.label,
    value: item.value,
    severity: inferMetricSeverity(item),
  }))

  const insights = buildInsights(context, userMessage)
  const nextActions = buildNextActions(context, userMessage)
  const predictedActions = buildPredictedActions(context)
  const quickPrompts = buildQuickPrompts(context, userMessage, messages)

  return {
    domain: context.domain,
    summary: context.liveContext.summary,
    governanceSummary: context.governanceSummary,
    metrics,
    insights,
    nextActions,
    predictedActions,
    quickPrompts,
  }
}

function buildLocalAnswerSections(params: {
  context: AICopilotContext
  intents: IntentAnalysis
  userMessage: string
  interactivePayload: AICopilotInteractivePayload
}) {
  const { context, intents, userMessage, interactivePayload } = params

  return [
    buildLead(context, intents, userMessage),
    buildCapabilitiesSection(context, intents),
    buildPageContentsSection(context, intents),
    buildBusinessCycleSection(context, intents),
    buildDashboardCardMeaningSection(context, intents, userMessage),
    buildLiveSummarySection(context, intents, interactivePayload),
    buildWorkflowSection(context, intents),
    buildGovernanceSection(context, intents, interactivePayload),
    buildAccountingSection(context, intents),
    buildPredictionSection(context, intents, interactivePayload),
    buildActionGuardSection(context, intents),
    buildNextStepsSection(context, intents, interactivePayload),
  ].filter(Boolean)
}

function analyzeIntent(message: string, language: "ar" | "en"): IntentAnalysis {
  const text = normalizeIntentText(message)
  const workflowWords =
    language === "ar"
      ? ["اشرح", "خطوات", "كيف", "طريقه", "مسار", "اعمل", "تنفيذ", "استخدام", "شرح", "العمل"]
      : ["explain", "steps", "how", "workflow", "process", "use", "operate"]
  const reportWords =
    language === "ar"
      ? ["تقرير", "ملخص", "ارقام", "احص", "مؤشر", "حاله", "وضع", "احصاء", "ملخص حي", "رصيد", "مديونيه", "اخر العمليات", "اكثر المنتجات", "اكثر العملاء", "نشاط"]
      : ["report", "summary", "numbers", "metrics", "status", "overview", "dashboard"]
  const governanceWords =
    language === "ar"
      ? ["صلاح", "دور", "اعتماد", "موافقه", "رفض", "من يقدر", "من يمكن", "حوكمه", "قيود", "مسموح"]
      : ["permission", "role", "approval", "approve", "reject", "governance", "who can"]
  const accountingWords =
    language === "ar"
      ? ["محاسب", "محاسبي", "قيد", "قيود", "ذمم", "حساب", "دفتر"]
      : ["accounting", "journal", "entry", "ledger", "receivable", "payable", "account"]
  const actionWords =
    language === "ar"
      ? ["نفذ", "انشئ", "اعتمد", "ارفض", "احذف", "عدل", "رحل", "احفظ"]
      : ["execute", "create", "approve", "reject", "delete", "update", "post", "save"]
  const predictionWords =
    language === "ar"
      ? ["الخطوه التاليه", "متوقع", "توقع", "بعد ذلك", "ما التالي", "تنبيه"]
      : ["next step", "predict", "prediction", "after that", "what next", "warning"]
  const validationWords =
    language === "ar"
      ? ["خطا", "ناقصه", "ناقص", "اكتمال", "تحقق", "مشكله", "مراجعه", "تحذير", "مخاطره", "مخالفه", "سياسات", "اخطاء شائعه"]
      : ["error", "missing", "incomplete", "validate", "issue", "review", "warning"]
  const capabilityWords =
    language === "ar"
      ? ["امكاني", "اكني", "قدرات", "تستطيع", "تقدر", "ماذا تفعل", "كيف تساعد", "ساعدني", "مساعدتك", "فهم العمل", "شرح التطبيق", "وظيفتك", "مهمتك", "دورك", "مين انت", "من انت"]
      : ["capabilities", "what can you do", "how can you help", "help me", "assist", "support", "your job", "your role", "who are you"]
  const greetingWords =
    language === "ar"
      ? ["السلام", "مرحبا", "اهلا", "اهلن", "صباح الخير", "مساء الخير", "مساء النور", "هاي", "السلام عليكم"]
      : ["hello", "hi", "good morning", "good evening", "hey"]
  const definitionWords =
    language === "ar"
      ? ["ما معنى", "مايعني", "يعني ايه", "يعني ماذا", "ما المقصود", "ما داخل", "ماذا داخل", "ماذا يحتوي", "ما محتوى", "يفهم منه", "يوجد كارت", "هذا الكارت"]
      : ["what does", "what is meant", "what does this mean", "what is inside", "what does this card mean", "what does this widget mean", "what is included"]
  const pageContentWords =
    language === "ar"
      ? ["ما الذي يوجد", "ماذا يوجد", "ما الموجود", "محتويات الصفحه", "محتويات الصفحة", "ماذا تحتوي", "ما الذي تحتويه", "ما الذي بداخل", "ما داخل الصفحة"]
      : ["what is on this page", "what is inside this page", "what does this page contain", "page contents", "what can i find here"]
  const salesCycleWords =
    language === "ar"
      ? ["دوره البيع", "دورة البيع", "مسار البيع", "المبيعات", "طلبات المبيعات", "الفواتير", "التحصيل", "الذمم المدينه"]
      : ["sales cycle", "sales flow", "sales order", "invoice flow", "collection flow", "receivables flow"]
  const purchaseCycleWords =
    language === "ar"
      ? ["دوره الشراء", "دورة الشراء", "مسار الشراء", "المشتريات", "اوامر الشراء", "أوامر الشراء", "فاتوره مورد", "فواتير الموردين", "مرتجع مشتريات", "اشعار دائن المورد", "ذمم دائنه"]
      : ["purchase cycle", "purchasing cycle", "purchase flow", "purchase order flow", "supplier bill flow", "vendor credit flow", "payables flow"]
  const dashboardCardWords =
    language === "ar"
      ? [
          "كارت",
          "بطاقه",
          "تكلفه مصروفات",
          "تكلفه + مصروفات",
          "صافي الربح",
          "الايرادات",
          "عدد الفواتير",
          "ذمم مدينه",
          "ذمم دائنه",
          "ايرادات الشهر",
          "مصروفات الشهر",
        ]
      : [
          "card",
          "widget",
          "cogs expenses",
          "cogs & expenses",
          "net profit",
          "revenue",
          "invoices count",
          "receivables",
          "payables",
          "revenue this month",
          "expenses this month",
        ]

  const askGreeting = includesAny(text, greetingWords)
  const askCapabilities = includesAny(text, capabilityWords)
  const askWorkflow = includesAny(text, workflowWords)
  const askReport = includesAny(text, reportWords)
  const askGovernance = includesAny(text, governanceWords)
  const askAccounting = includesAny(text, accountingWords)
  const askAction = includesAny(text, actionWords)
  const askPrediction = includesAny(text, predictionWords)
  const askValidation = includesAny(text, validationWords)
  const askDefinition = includesAny(text, definitionWords)
  const askPageContents = includesAny(text, pageContentWords)
  const askSalesCycle = includesAny(text, salesCycleWords)
  const askPurchaseCycle = includesAny(text, purchaseCycleWords)
  const askDashboardCardMeaning =
    askDefinition && includesAny(text, dashboardCardWords)

  return {
    askWorkflow,
    askReport,
    askGovernance,
    askAccounting,
    askAction,
    askPrediction,
    askValidation,
    askCapabilities,
    askGreeting,
    askDefinition,
    askDashboardCardMeaning,
    askPageContents,
    askSalesCycle,
    askPurchaseCycle,
  }
}

function buildLead(
  context: AICopilotContext,
  intents: IntentAnalysis,
  userMessage: string
) {
  const title = context.guide?.title
  const pageLabel =
    context.language === "ar"
      ? title
        ? `صفحة ${title}`
        : "هذه الصفحة"
      : title
        ? `the ${title} page`
        : "this page"

  if (context.language === "ar") {
    if (intents.askDashboardCardMeaning) {
      const card = detectDashboardCard(userMessage)
      if (card?.labelAr) {
        return `بالنسبة لكارت "${card.labelAr}" في ${pageLabel}:`
      }
    }

    if (intents.askGreeting && isPureGreetingIntent(intents)) {
      return [
        "مساء النور. أنا المساعد المحلي التفاعلي داخل التطبيق.",
        title ? `أنا موجود الآن داخل ${pageLabel}.` : "أستطيع إرشادك داخل الصفحة الحالية حسب السياق المتاح.",
      ].join("\n")
    }

    if (intents.askCapabilities) {
      return `أستطيع مساعدتك في فهم العمل داخل ${pageLabel} اعتمادًا على دليل الصفحة، صلاحياتك الحالية، وبيانات النظام الحية.`
    }

    if (intents.askPageContents) {
      return `سأشرح لك ما الذي ستجده داخل ${pageLabel} وكيف تقرأ مكوناته عمليًا.`
    }

    if (intents.askSalesCycle) {
      return `سأشرح لك دورة البيع المرتبطة بـ ${pageLabel} وكيف تنتقل من مستند لآخر داخل التطبيق.`
    }

    if (intents.askPurchaseCycle) {
      return `سأشرح لك دورة الشراء المرتبطة بـ ${pageLabel} وكيف ترتبط أوامر الشراء والفواتير والذمم والتسويات.`
    }

    if (intents.askGovernance && !intents.askWorkflow) {
      return `سأوضح لك ما الذي يمكنك فعله داخل ${pageLabel} وفق صلاحياتك الحالية ودون تجاوز الحوكمة.`
    }

    if (intents.askReport) {
      return `هذا ملخص حي للمؤشرات المرتبطة بـ ${pageLabel} مع أهم ما يحتاج متابعة.`
    }

    if (intents.askWorkflow) {
      return `في ${pageLabel}، هذه هي الخطوات العملية الأهم حسب دليل الصفحة الحالي والسياق المرتبط بها.`
    }

    return [
      title ? `أعمل الآن عبر المساعد المحلي التفاعلي داخل ${pageLabel}.` : "أعمل الآن عبر المساعد المحلي التفاعلي داخل النظام.",
      context.liveContext.summary,
    ].join("\n")
  }

  if (intents.askDashboardCardMeaning) {
    const card = detectDashboardCard(userMessage)
    if (card?.labelEn) {
      return `About the "${card.labelEn}" card on ${pageLabel}:`
    }
  }

  if (intents.askGreeting && isPureGreetingIntent(intents)) {
    return [
      "Hello. I am the interactive local copilot inside the ERP.",
      title ? `I am currently focused on ${pageLabel}.` : "I can guide you inside the current page using local context.",
    ].join("\n")
  }

  if (intents.askCapabilities) {
    return `I can help you understand the work on ${pageLabel} using the page guide, your current permissions, and live ERP data.`
  }

  if (intents.askPageContents) {
    return `I will explain what you can typically find on ${pageLabel} and how to read its main parts in practice.`
  }

  if (intents.askSalesCycle) {
    return `I will explain the sales cycle related to ${pageLabel} and how documents move from one stage to another in the ERP.`
  }

  if (intents.askPurchaseCycle) {
    return `I will explain the purchasing cycle related to ${pageLabel} and how orders, supplier bills, payables, and settlements fit together.`
  }

  if (intents.askGovernance && !intents.askWorkflow) {
    return `I will explain what you can do on ${pageLabel} based on your current permissions without bypassing governance.`
  }

  if (intents.askReport) {
    return `This is a live summary of the indicators related to ${pageLabel}, with the key items that need follow-up.`
  }

  if (intents.askWorkflow) {
    return `On ${pageLabel}, these are the most relevant operating steps based on the current guide and live context.`
  }

  return [
    title
      ? `I am answering through the interactive local copilot inside ${pageLabel}.`
      : "I am answering through the interactive local copilot inside the ERP.",
    context.liveContext.summary,
  ].join("\n")
}

function buildCapabilitiesSection(
  context: AICopilotContext,
  intents: IntentAnalysis
) {
  if (!intents.askCapabilities && !(intents.askGreeting && isPureGreetingIntent(intents))) {
    return ""
  }

  if (context.language === "ar") {
    const lines = [
      "يمكنني مساعدتك هنا في:",
      "- شرح خطوات العمل داخل الصفحة الحالية خطوة بخطوة.",
      "- توضيح ما الذي يسمح به دورك وصلاحياتك الحالية.",
      "- شرح الاعتمادات والقيود والحوكمة المرتبطة بالعملية.",
      "- تلخيص المؤشرات الحية والتنبيهات والبيانات التي تحتاج مراجعة.",
      "- اقتراح الخطوة التالية المتوقعة داخل نفس الدورة التشغيلية.",
    ]

    const domainLine = buildDomainCapabilityLine(context)
    if (domainLine) {
      lines.push(`- ${domainLine}`)
    }

    lines.push("ما لا أفعله: لا أنشئ أو أعتمد أو أحذف أو أرحّل أي عملية فعلية من داخل هذا المساعد.")
    return lines.join("\n")
  }

  const lines = [
    "I can help here by:",
    "- Explaining the workflow on the current page step by step.",
    "- Clarifying what your current role and permissions allow.",
    "- Explaining approvals, controls, and governance constraints.",
    "- Summarizing live indicators, warnings, and incomplete data points.",
    "- Suggesting the most likely next step in the current operating cycle.",
  ]

  const domainLine = buildDomainCapabilityLine(context)
  if (domainLine) {
    lines.push(`- ${domainLine}`)
  }

  lines.push("What I do not do: I do not create, approve, delete, or post any real transaction from inside this copilot.")
  return lines.join("\n")
}

function buildPageContentsSection(
  context: AICopilotContext,
  intents: IntentAnalysis
) {
  if (!intents.askPageContents) return ""

  const playbook = getPagePlaybook(context)
  if (!playbook) {
    return context.language === "ar"
      ? "أستطيع شرح هذه الصفحة إذا ذكرت اسم الجزء الذي تراه أمامك: نموذج، جدول، بطاقة مؤشر، حالة مستند، أو زر إجراء."
      : "I can explain this page if you mention the part you see: form, table, KPI card, document status, or action button."
  }

  const header =
    context.language === "ar"
      ? "أهم ما ستجده عادة داخل هذه الصفحة:"
      : "What you will typically find on this page:"
  const rows = (context.language === "ar" ? playbook.contentsAr : playbook.contentsEn)
    .slice(0, 5)
    .map((item) => `- ${item}`)
    .join("\n")

  return [header, rows].join("\n")
}

function buildBusinessCycleSection(
  context: AICopilotContext,
  intents: IntentAnalysis
) {
  const shouldExplainCycle =
    intents.askSalesCycle ||
    intents.askPurchaseCycle ||
    (intents.askCapabilities && hasBusinessCycle(context)) ||
    (intents.askDefinition && hasBusinessCycle(context))

  if (!shouldExplainCycle) return ""

  const playbook = getPagePlaybook(context)
  const cycle = context.language === "ar" ? playbook?.cycleAr : playbook?.cycleEn
  if (!cycle || cycle.length === 0) return ""

  const header =
    context.language === "ar"
      ? "الدورة التشغيلية المرتبطة بهذه الصفحة:"
      : "The operating cycle related to this page:"

  return [header, ...cycle.map((item) => `- ${item}`)].join("\n")
}

function buildLiveSummarySection(
  context: AICopilotContext,
  intents: IntentAnalysis,
  payload: AICopilotInteractivePayload
) {
  if (intents.askDashboardCardMeaning) return ""
  if (!intents.askReport && !intents.askValidation && context.domain !== "dashboard") return ""
  if (payload.metrics.length === 0) return ""

  const header = context.language === "ar" ? "ملخص حي من النظام:" : "Live ERP summary:"
  const rows = payload.metrics
    .slice(0, 8)
    .map((item) => `- ${item.label}: ${item.value}`)
    .join("\n")

  const alerts =
    payload.insights.length > 0
      ? [
          context.language === "ar" ? "تحذيرات أو ملاحظات ذكية:" : "Smart warnings and observations:",
          ...payload.insights.slice(0, 3).map((insight) => `- ${insight.title}: ${insight.summary}`),
        ].join("\n")
      : ""

  return [header, rows, alerts].filter(Boolean).join("\n")
}

function buildDashboardCardMeaningSection(
  context: AICopilotContext,
  intents: IntentAnalysis,
  userMessage: string
) {
  if (!intents.askDashboardCardMeaning || context.domain !== "dashboard") {
    return ""
  }

  const card = detectDashboardCard(userMessage)
  if (!card) {
    return context.language === "ar"
      ? "إذا كنت تقصد كارتًا محددًا في لوحة التحكم، اذكر اسمه كما يظهر أمامك وسأشرح معناه ومصدره وطريقة قراءته."
      : "If you mean a specific dashboard card, mention its displayed label and I will explain its meaning, source, and how to read it."
  }

  return context.language === "ar"
    ? buildDashboardCardMeaningArabic(card)
    : buildDashboardCardMeaningEnglish(card)
}

function buildWorkflowSection(context: AICopilotContext, intents: IntentAnalysis) {
  if (!intents.askWorkflow) return ""

  const guideSteps = context.guide?.steps.slice(0, 5) || []
  const guideTips = context.guide?.tips.slice(0, 3) || []
  const playbook = getPagePlaybook(context)
  const fallbackSteps = context.language === "ar" ? playbook?.workflowAr || [] : playbook?.workflowEn || []
  const fallbackTips = context.language === "ar" ? playbook?.tipsAr || [] : playbook?.tipsEn || []
  const steps = guideSteps.length > 0 ? guideSteps : fallbackSteps
  const tips = guideTips.length > 0 ? guideTips : fallbackTips

  const stepsBlock =
    steps.length > 0
      ? [
          context.language === "ar" ? "خطوات العمل المقترحة:" : "Suggested workflow steps:",
          ...steps.map((step, index) => `${index + 1}. ${step}`),
        ].join("\n")
      : ""

  const tipsBlock =
    tips.length > 0
      ? [
          context.language === "ar" ? "نقاط تشغيل مهمة:" : "Important operating notes:",
          ...tips.map((tip) => `- ${tip}`),
        ].join("\n")
      : ""

  return [stepsBlock, tipsBlock].filter(Boolean).join("\n\n")
}

function buildGovernanceSection(
  context: AICopilotContext,
  intents: IntentAnalysis,
  payload: AICopilotInteractivePayload
) {
  if (!intents.askGovernance && !intents.askAction && !intents.askValidation) {
    return ""
  }

  const permission = context.permissionSnapshot
  const capabilityLine =
    context.language === "ar"
      ? [
          `صلاحياتك الحالية على ${permission.resource || "هذه الصفحة"}:`,
          `- الدور: ${context.scope.role || "غير محدد"}`,
          `- القراءة: ${boolAr(permission.canRead)}`,
          `- الكتابة: ${boolAr(permission.canWrite)}`,
          `- التحديث: ${boolAr(permission.canUpdate)}`,
          `- الحذف: ${boolAr(permission.canDelete)}`,
        ].join("\n")
      : [
          `Your current permissions on ${permission.resource || "this page"}:`,
          `- Role: ${context.scope.role || "unknown"}`,
          `- Read: ${boolEn(permission.canRead)}`,
          `- Write: ${boolEn(permission.canWrite)}`,
          `- Update: ${boolEn(permission.canUpdate)}`,
          `- Delete: ${boolEn(permission.canDelete)}`,
        ].join("\n")

  const domainRule = buildDomainRule(context)
  const approvalFlow = buildApprovalFlowSection(context, intents)
  const blockers =
    payload.nextActions.length > 0
      ? [
          context.language === "ar" ? "أفضل إجراء مسموح لك الآن:" : "Best allowed next action right now:",
          `- ${payload.nextActions[0].title}: ${payload.nextActions[0].summary}`,
        ].join("\n")
      : ""

  return [capabilityLine, domainRule, approvalFlow, blockers].filter(Boolean).join("\n\n")
}

function buildDomainRule(context: AICopilotContext) {
  const pageKey = String(context.scope.pageKey || "").toLowerCase()

  if (context.language === "ar") {
    if (isPurchasePageKey(pageKey)) {
      return "في دورة الشراء: القراءة الصحيحة تكون عبر حالة المستند الحالية، والاستلام أو التأكيد، ثم الذمم الدائنة أو التسوية مع المورد."
    }
    if (pageKey === "payments") {
      return "في المدفوعات: ربط الحركة بالمستند الصحيح وحالة الفترة المحاسبية يحدد ما إذا كانت الحركة تفسيرية فقط أم قابلة للتنفيذ للمستخدم."
    }
    if (context.domain === "returns") {
      return "في المرتجعات: التنفيذ الفعلي لا يتم إلا بعد اكتمال سلسلة الاعتماد المطلوبة وفق السياسة الحالية."
    }
    if (context.domain === "sales" || context.scope.pageKey === "invoices") {
      return "في الفواتير: اعتماد التسليم من المخزن يبقى جزءًا حاكمًا قبل اكتمال بعض آثار دورة البيع."
    }
    if (context.domain === "inventory") {
      return "في المخزون: أي استفسار عن الإخراج أو الإرجاع يجب قراءته مع حالة الاعتماد وحالة الحركة المرتبطة."
    }
  } else {
    if (isPurchasePageKey(pageKey)) {
      return "In the purchase cycle, the correct reading starts with current document status, then receipt or confirmation, and then payables or supplier settlement."
    }
    if (pageKey === "payments") {
      return "In payments, the link between the movement, the source document, and the accounting period determines whether the step is only explanatory or actually allowed for the user."
    }
    if (context.domain === "returns") {
      return "For returns, final execution happens only after the required approval chain is completed."
    }
    if (context.domain === "sales" || context.scope.pageKey === "invoices") {
      return "For invoices, warehouse delivery approval remains a governing step before some sales-cycle effects are considered complete."
    }
    if (context.domain === "inventory") {
      return "For inventory, dispatch and return questions must be read together with approval state and linked movement status."
    }
  }

  return ""
}

function buildAccountingSection(context: AICopilotContext, intents: IntentAnalysis) {
  if (!intents.askAccounting || !context.guide?.accounting_pattern) return ""

  const pattern = context.guide.accounting_pattern
  const header =
    context.language === "ar"
      ? `الأثر المحاسبي في هذه الصفحة: ${pattern.event}`
      : `Accounting impact on this page: ${pattern.event}`
  const entries = pattern.entries
    .slice(0, 4)
    .map((entry) => {
      const side =
        entry.side === "debit"
          ? context.language === "ar"
            ? "مدين"
            : "Dr"
          : context.language === "ar"
            ? "دائن"
            : "Cr"
      return `- ${side}: ${entry.account}`
    })
    .join("\n")

  return [header, entries].filter(Boolean).join("\n")
}

function buildPredictionSection(
  context: AICopilotContext,
  intents: IntentAnalysis,
  payload: AICopilotInteractivePayload
) {
  if (!intents.askPrediction && !intents.askValidation && !intents.askAction) return ""
  if (payload.predictedActions.length === 0) return ""

  return [
    context.language === "ar" ? "الخطوة التالية المتوقعة:" : "Predicted next step:",
    ...payload.predictedActions.slice(0, 2).map((item) => {
      const confidence =
        typeof item.confidenceScore === "number"
          ? context.language === "ar"
            ? ` (ثقة ${Math.round(item.confidenceScore)}%)`
            : ` (${Math.round(item.confidenceScore)}% confidence)`
          : ""
      return `- ${item.title}${confidence}: ${item.summary}`
    }),
  ].join("\n")
}

function buildActionGuardSection(context: AICopilotContext, intents: IntentAnalysis) {
  if (!intents.askAction) return ""

  return context.language === "ar"
    ? "تنبيه حوكمة: أستطيع شرح الإجراء وتوجيهك للخطوة الصحيحة، لكن لا يمكنني تنفيذ إنشاء أو اعتماد أو ترحيل أو حذف من داخل هذا الموديول المحلي."
    : "Governance note: I can explain the action and guide you to the right step, but I cannot execute creation, approval, posting, or deletion from this local module."
}

function buildNextStepsSection(
  context: AICopilotContext,
  intents: IntentAnalysis,
  payload: AICopilotInteractivePayload
) {
  if (payload.nextActions.length === 0 && payload.quickPrompts.length === 0) return ""

  const orientationMode = intents.askGreeting || intents.askCapabilities

  const nextActionsBlock =
    !orientationMode && payload.nextActions.length > 0
      ? [
          context.language === "ar" ? "أفضل خطوة تفاعلية الآن:" : "Best interactive next step:",
          ...payload.nextActions.slice(0, 2).map((item) => `- ${item.title}: ${item.summary}`),
        ].join("\n")
      : ""

  const promptBlock =
    payload.quickPrompts.length > 0
      ? [
          context.language === "ar"
            ? orientationMode
              ? "يمكننا البدء مباشرة بأي من هذه الأسئلة:"
              : "يمكنك أيضًا سؤالي مباشرة عن:"
            : orientationMode
              ? "We can start right away with any of these questions:"
              : "You can also ask me directly about:",
          ...payload.quickPrompts.slice(0, 3).map((item) => `- ${item.label}`),
        ].join("\n")
      : ""

  return [nextActionsBlock, promptBlock].filter(Boolean).join("\n\n")
}

interface PagePlaybook {
  contentsAr: string[]
  contentsEn: string[]
  workflowAr: string[]
  workflowEn: string[]
  tipsAr: string[]
  tipsEn: string[]
  approvalsAr?: string[]
  approvalsEn?: string[]
  cycleAr?: string[]
  cycleEn?: string[]
}

function buildApprovalFlowSection(
  context: AICopilotContext,
  intents: IntentAnalysis
) {
  if (!intents.askGovernance && !intents.askValidation && !intents.askAction) return ""

  const playbook = getPagePlaybook(context)
  const approvals = context.language === "ar" ? playbook?.approvalsAr : playbook?.approvalsEn
  if (!approvals || approvals.length === 0) return ""

  const header =
    context.language === "ar"
      ? "تسلسل الاعتمادات أو القيود التشغيلية:"
      : "Approvals or operating constraints:"

  return [header, ...approvals.map((item) => `- ${item}`)].join("\n")
}

function hasBusinessCycle(context: AICopilotContext) {
  const playbook = getPagePlaybook(context)
  return Boolean((playbook?.cycleAr && playbook.cycleAr.length > 0) || (playbook?.cycleEn && playbook.cycleEn.length > 0))
}

function isPurchasePageKey(pageKey: string) {
  return ["bills", "purchase_orders", "purchase_returns", "vendor_credits", "suppliers"].includes(pageKey)
}

function isFixedAssetsPageKey(pageKey: string) {
  return ["fixed_assets", "asset_categories", "fixed_assets_reports"].includes(pageKey)
}

function isHRPageKey(pageKey: string) {
  return ["hr", "employees", "attendance", "payroll", "instant_payouts"].includes(pageKey)
}

function getPagePlaybook(context: AICopilotContext): PagePlaybook | null {
  const pageKey = String(context.scope.pageKey || "").toLowerCase()

  switch (pageKey) {
    case "dashboard":
      return {
        contentsAr: [
          "بطاقات مؤشرات رئيسية مثل الإيرادات والربحية والمصروفات أو المخزون.",
          "ملخصات تنبيهية لما يحتاج متابعة سريعة.",
          "فلاتر للفترة أو الفرع أو نطاق العرض.",
          "مدخلات انتقال سريعة إلى التقارير أو الصفحات التفصيلية.",
        ],
        contentsEn: [
          "Main KPI cards such as revenue, profitability, expenses, or stock.",
          "Alert summaries for items that need quick follow-up.",
          "Filters for period, branch, or scope.",
          "Quick drill-down links into detailed reports or operational pages.",
        ],
        workflowAr: [
          "اختر الفترة أو النطاق الذي تريد قراءته.",
          "ابدأ ببطاقات الإيرادات والربحية والتكلفة ثم راجع التنبيهات.",
          "حدد الكارت أو المؤشر غير الطبيعي ثم انتقل للتفاصيل من الصفحة المرتبطة.",
          "استخدم لوحة التحكم للمتابعة واتخاذ قرار، لا كبديل عن شاشة التنفيذ نفسها.",
        ],
        workflowEn: [
          "Select the period or scope you want to review.",
          "Start with revenue, profit, and cost cards, then review alerts.",
          "Identify the unusual KPI and drill down into the linked page.",
          "Use the dashboard for follow-up and decisions, not as a substitute for execution screens.",
        ],
        tipsAr: [
          "الأرقام تعتمد على البيانات المرحّلة أو الحالات النهائية حسب تصميم الصفحة.",
          "اقرأ الكروت دائمًا مع الفترة الزمنية والنطاق المختار.",
        ],
        tipsEn: [
          "Figures depend on posted data or final states according to the page design.",
          "Always read the cards together with the selected period and scope.",
        ],
      }
    case "sales_orders":
      return {
        contentsAr: [
          "بيانات العميل والتاريخ والحالة المرجعية لطلب البيع.",
          "بنود الطلب: المنتجات والكميات والأسعار والخصومات.",
          "حالات المتابعة والتحويل إلى فاتورة أو التنفيذ الجزئي.",
          "مرجع العلاقة بين الطلب والفاتورة والتحصيل اللاحق.",
        ],
        contentsEn: [
          "Customer, date, and reference status for the sales order.",
          "Order lines: products, quantities, prices, and discounts.",
          "Tracking states and conversion into invoice or partial execution.",
          "The link between the order, the invoice, and later collection.",
        ],
        workflowAr: [
          "أنشئ الطلب وحدد العميل والمنتجات والأسعار.",
          "راجع الحالة والاعتماد الداخلي أو موافقة العميل إن كانت مطلوبة.",
          "حوّل الطلب إلى فاتورة أو نفّذ جزءًا منه حسب السياسة.",
          "تابع ما بعد الفاتورة: التسليم والتحصيل أو المرتجع إن وجد.",
        ],
        workflowEn: [
          "Create the order and select the customer, products, and prices.",
          "Review status and any internal or customer approval if required.",
          "Convert the order into an invoice or execute it partially if needed.",
          "Then follow delivery, collection, or returns after invoicing.",
        ],
        tipsAr: [
          "طلب البيع غالبًا مستند تشغيلي يسبق الأثر المالي النهائي.",
          "التحويل الجزئي أو الكلي يغيّر قراءة الحالة الحالية للطلب.",
        ],
        tipsEn: [
          "A sales order is usually an operational document that precedes the final financial effect.",
          "Partial or full conversion changes how the current order status should be read.",
        ],
        approvalsAr: [
          "الاعتماد الفعلي يحكمه دورك والصلاحيات الحالية وحالة الطلب.",
          "الأثر المالي النهائي يرتبط غالبًا بالفاتورة ثم التسليم والتحصيل، لا بطلب البيع وحده.",
        ],
        approvalsEn: [
          "Actual approval depends on your role, permissions, and current order state.",
          "The final financial effect is usually tied to the invoice, then delivery and collection, not to the sales order alone.",
        ],
        cycleAr: [
          "طلب بيع -> فاتورة -> اعتماد أو تأكيد التسليم -> تحصيل -> مرتجع عند الحاجة.",
        ],
        cycleEn: [
          "Sales order -> invoice -> delivery approval or confirmation -> collection -> return when needed.",
        ],
      }
    case "invoices":
      return {
        contentsAr: [
          "بيانات العميل والفاتورة وتاريخ الاستحقاق والحالة.",
          "البنود والضرائب والإجمالي والمدفوع والمتبقي.",
          "حالة التسليم أو اعتماد المخزن عند ارتباطها بالمخزون.",
          "المدفوعات أو المرتجعات أو الذمم المرتبطة بالفاتورة.",
        ],
        contentsEn: [
          "Customer, invoice, due date, and status details.",
          "Lines, tax, total, paid, and outstanding values.",
          "Delivery or warehouse-approval status when inventory is involved.",
          "Payments, returns, and receivable implications linked to the invoice.",
        ],
        workflowAr: [
          "أنشئ الفاتورة أو راجع المسودة الحالية.",
          "تحقق من البنود والضرائب والإجماليات.",
          "راجع حالة التسليم أو اعتماد المخزن إذا كانت الفاتورة مخزنية.",
          "تابع التحصيل، الرصيد المفتوح، أو أي مرتجع مرتبط.",
        ],
        workflowEn: [
          "Create the invoice or review the current draft.",
          "Validate lines, taxes, and totals.",
          "Review delivery or warehouse approval if the invoice affects stock.",
          "Then follow payment, open balance, or related returns.",
        ],
        tipsAr: [
          "الفاتورة هي نقطة محورية بين التشغيل والمحاسبة والتحصيل.",
          "قراءة الحالة تحتاج الجمع بين حالة الفاتورة والتسليم والسداد.",
        ],
        tipsEn: [
          "The invoice is the bridge between operations, accounting, and collection.",
          "Status interpretation requires reading invoice state together with delivery and payment state.",
        ],
        approvalsAr: [
          "إذا كانت الفاتورة مخزنية فاعتماد أو تأكيد التسليم قد يكون جزءًا حاكمًا من الدورة.",
          "التحصيل أو الإلغاء أو المرتجع يخضع أيضًا لصلاحيات المستخدم والفترة المحاسبية.",
        ],
        approvalsEn: [
          "If the invoice affects stock, delivery approval or confirmation may be a governing step in the cycle.",
          "Collection, cancellation, or return also depend on user permissions and the accounting period.",
        ],
        cycleAr: [
          "فاتورة -> تسليم أو اعتماد مخزني -> تحصيل أو تسوية ذمم -> مرتجع عند الحاجة.",
        ],
        cycleEn: [
          "Invoice -> delivery or warehouse approval -> collection or receivable settlement -> return when needed.",
        ],
      }
    case "customers":
      return {
        contentsAr: [
          "بيانات العميل وحالة الحساب والرصيد المفتوح إن وجد.",
          "الفواتير والمدفوعات والمرتجعات المرتبطة بسجل العميل.",
          "مؤشرات النشاط أو المديونية أو الحاجة لمراجعة التعامل.",
        ],
        contentsEn: [
          "Customer profile, account state, and open balance when available.",
          "Invoices, payments, and returns linked to the customer record.",
          "Signals about activity, receivables, or whether the relationship needs review.",
        ],
        workflowAr: [
          "ابدأ من بيانات العميل الأساسية وحالة التفعيل.",
          "راجع الرصيد والفواتير والمدفوعات المفتوحة.",
          "اربط أي قرار تعامل بالصلاحيات وسياسة الشركة وحالة الذمم.",
        ],
        workflowEn: [
          "Start with the customer profile and active status.",
          "Review balance, invoices, and open payments.",
          "Connect any relationship decision to permissions, company policy, and receivable state.",
        ],
        tipsAr: [
          "سؤال رصيد عميل محدد يحتاج تحديد العميل أو فتح سجله حتى تكون القراءة أدق.",
          "المديونية تتأثر بالفواتير والمدفوعات والمرتجعات، وليس بالمبيعات فقط.",
        ],
        tipsEn: [
          "A specific customer balance question needs the customer record or name for better precision.",
          "Receivables are shaped by invoices, payments, and returns, not sales alone.",
        ],
        approvalsAr: [
          "إيقاف التعامل أو تغيير حالة العميل قرار حوكمي يعتمد على دورك وسياسة الشركة.",
        ],
        approvalsEn: [
          "Stopping or changing customer status is a governed decision based on your role and company policy.",
        ],
        cycleAr: [
          "عميل -> عرض أو طلب بيع -> فاتورة -> تحصيل -> رصيد مفتوح أو مرتجع.",
        ],
        cycleEn: [
          "Customer -> estimate or sales order -> invoice -> collection -> open balance or return.",
        ],
      }
    case "purchase_orders":
      return {
        contentsAr: [
          "بيانات المورد والتواريخ والحالة المرجعية لأمر الشراء.",
          "بنود الشراء والكميات والأسعار ومواعيد الاستلام المتوقعة.",
          "العلاقة بين أمر الشراء والاستلام وفاتورة المورد.",
          "مؤشرات ما إذا كان الأمر ما زال مفتوحًا أو تم تنفيذه جزئيًا أو كليًا.",
        ],
        contentsEn: [
          "Supplier, dates, and reference status for the purchase order.",
          "Purchase lines, quantities, prices, and expected receipt timing.",
          "The link between the purchase order, receipt, and supplier bill.",
          "Signals showing whether the order is still open or partially or fully executed.",
        ],
        workflowAr: [
          "أنشئ أمر الشراء وحدد المورد والبنود والأسعار.",
          "راجع الطلب قبل الإرسال أو الاعتماد الداخلي إن وجد.",
          "تابع الاستلام الفعلي أو التحويل إلى فاتورة مورد حسب الإجراء المعتمد.",
          "بعد ذلك راقب الذمم الدائنة والسداد أو المرتجع إن حصلت تسوية عكسية.",
        ],
        workflowEn: [
          "Create the purchase order with supplier, lines, and prices.",
          "Review it before sending or any internal approval if applicable.",
          "Track physical receipt or conversion into a supplier bill according to the approved flow.",
          "Then follow payables, payment, or any reverse settlement if needed.",
        ],
        tipsAr: [
          "أمر الشراء عادة بداية دورة الشراء وليس نهايتها.",
          "الوضع الحالي يتضح من الربط بين الأمر والاستلام والفاتورة.",
        ],
        tipsEn: [
          "The purchase order is usually the beginning of the purchase cycle, not the end.",
          "Its current state becomes clear only when read together with receipt and billing progress.",
        ],
        approvalsAr: [
          "قد توجد موافقة إدارية أو تشغيلية قبل الإرسال أو التنفيذ حسب سياسة الشركة.",
          "الأثر المالي النهائي لا يكتمل عادة على أمر الشراء وحده، بل عند الفاتورة أو الاستلام المؤكد.",
        ],
        approvalsEn: [
          "There may be management or operational approval before sending or executing the order depending on company policy.",
          "The final financial effect is usually not complete on the purchase order alone, but on billing or confirmed receipt.",
        ],
        cycleAr: [
          "أمر شراء -> استلام أو تأكيد -> فاتورة مورد -> ذمم دائنة -> سداد أو إشعار دائن.",
        ],
        cycleEn: [
          "Purchase order -> receipt or confirmation -> supplier bill -> payables -> payment or vendor credit.",
        ],
      }
    case "bills":
      return {
        contentsAr: [
          "بيانات المورد والفاتورة وتاريخ الاستحقاق والحالة.",
          "بنود الفاتورة وقيمتها والضرائب والإجمالي.",
          "حالة الاستلام أو التأكيد إن كانت مرتبطة بمخزون أو استلام فعلي.",
          "الرصيد المستحق والسداد وإشعارات الدائن أو التسويات المرتبطة.",
        ],
        contentsEn: [
          "Supplier bill details, due date, and current status.",
          "Bill lines, value, tax, and total.",
          "Receipt or confirmation status when inventory or physical receipt is involved.",
          "Outstanding balance, payment, vendor credits, or related settlements.",
        ],
        workflowAr: [
          "أنشئ أو راجع فاتورة المورد الحالية.",
          "تحقق من البنود والضرائب وتطابقها مع أمر الشراء أو الاستلام إن وجد.",
          "راجع الاستلام أو التأكيد قبل اعتبار الدورة مكتملة.",
          "تابع الذمم الدائنة ثم السداد أو التعويض عبر إشعار دائن المورد.",
        ],
        workflowEn: [
          "Create or review the current supplier bill.",
          "Validate lines and taxes against the purchase order or receipt when applicable.",
          "Review receipt or confirmation before treating the cycle as complete.",
          "Then follow payables and payment or compensation through vendor credits.",
        ],
        tipsAr: [
          "فاتورة المورد هي نقطة الربط بين المشتريات والذمم الدائنة.",
          "الاستلام أو التأكيد قد يغيّر تفسير الحالة الحالية للفواتير المرتبطة بالمخزون.",
        ],
        tipsEn: [
          "The supplier bill is the bridge between purchasing and payables.",
          "Receipt or confirmation may change how the current status should be interpreted for inventory-related bills.",
        ],
        approvalsAr: [
          "اعتماد المستند يرتبط بدورك، وحالة الفاتورة، وحالة الاستلام أو الفترة المحاسبية.",
          "التسوية المالية أو السداد لا تُقرأ بمعزل عن الرصيد المفتوح وإشعارات الدائن المرتبطة.",
        ],
        approvalsEn: [
          "Document approval depends on your role, bill status, and receipt state or accounting period.",
          "Financial settlement or payment should not be read separately from the open balance and any linked vendor credits.",
        ],
        cycleAr: [
          "فاتورة مورد -> استلام أو تأكيد -> ذمم دائنة -> سداد أو إشعار دائن أو مرتجع مشتريات.",
        ],
        cycleEn: [
          "Supplier bill -> receipt or confirmation -> payables -> payment, vendor credit, or purchase return.",
        ],
      }
    case "purchase_returns":
      return {
        contentsAr: [
          "المورد والأصناف المرتجعة والكميات والأسباب.",
          "حالة المرتجع: طلب، اعتماد، تنفيذ، أو تسوية.",
          "العلاقة بين المرتجع والمخزون أو فاتورة المورد أو إشعار الدائن.",
          "ما إذا كان الأثر المتبقي مخزنيًا أو ماليًا أو كليهما.",
        ],
        contentsEn: [
          "Supplier, returned items, quantities, and reasons.",
          "Return state: request, approval, execution, or settlement.",
          "The link between the return, stock, the supplier bill, and vendor credit.",
          "Whether the remaining impact is inventory, financial, or both.",
        ],
        workflowAr: [
          "أنشئ طلب مرتجع المشتريات وحدد البنود والسبب.",
          "راجع المرحلة الحالية: هل هو بانتظار اعتماد أم نُفذ فعليًا؟",
          "تابع أثره على المخزون وعلى فاتورة المورد أو الذمم.",
          "أغلق الدورة عبر التعويض أو إشعار الدائن أو تسوية المورد.",
        ],
        workflowEn: [
          "Create the purchase return request with lines and reason.",
          "Review the current stage: is it pending approval or already executed?",
          "Track its effect on stock and on the supplier bill or payables.",
          "Close the cycle through compensation, vendor credit, or supplier settlement.",
        ],
        tipsAr: [
          "بعض المرتجعات تنتهي بأثر مخزني وبعضها بتسوية مالية وبعضها بالاثنين معًا.",
          "ذكر المرحلة الحالية يجعل الشرح أدق بكثير.",
        ],
        tipsEn: [
          "Some purchase returns end as inventory impact, some as financial settlement, and some as both.",
          "Mentioning the current stage makes the explanation much more precise.",
        ],
        approvalsAr: [
          "اقرأ المرتجع مع حالة الاعتماد الحالية لا مع النتيجة النهائية فقط.",
          "التنفيذ المالي أو المخزني النهائي يعتمد على حالة المرتجع وسياسة الشركة.",
        ],
        approvalsEn: [
          "Read the return together with its current approval state, not only the final outcome.",
          "Final financial or inventory execution depends on the return state and company policy.",
        ],
        cycleAr: [
          "مرتجع مشتريات -> اعتماد أو مراجعة -> أثر مخزني أو إشعار دائن -> تسوية مورد.",
        ],
        cycleEn: [
          "Purchase return -> approval or review -> inventory impact or vendor credit -> supplier settlement.",
        ],
      }
    case "vendor_credits":
      return {
        contentsAr: [
          "إشعارات دائن المورد وقيمتها والمورد المرتبط بها.",
          "الفواتير أو الأرصدة التي يمكن تطبيق الإشعار عليها.",
          "صلة الإشعار بمرتجع المشتريات أو تسوية المورد.",
        ],
        contentsEn: [
          "Vendor credits, their value, and the linked supplier.",
          "Bills or balances that the credit can be applied against.",
          "The connection between the credit, purchase return, and supplier settlement.",
        ],
        workflowAr: [
          "راجع سبب إشعار الدائن ومصدره.",
          "حدد الفاتورة أو الرصيد الذي سيُطبّق عليه.",
          "تابع ما إذا كانت الذمم الدائنة انخفضت أو بقي رصيد معلق.",
        ],
        workflowEn: [
          "Review the reason and source of the vendor credit.",
          "Choose the bill or balance it should be applied against.",
          "Track whether payables were reduced or whether a residual balance remains.",
        ],
        tipsAr: [
          "إشعار الدائن ليس مجرد مستند مستقل، بل جزء من تسوية دورة الشراء.",
        ],
        tipsEn: [
          "A vendor credit is not just a standalone document, but part of purchase-cycle settlement.",
        ],
        approvalsAr: [
          "التطبيق أو التعديل يخضع لصلاحيات المستخدم وحالة المستندات المرتبطة.",
        ],
        approvalsEn: [
          "Application or adjustment depends on user permissions and linked-document state.",
        ],
        cycleAr: [
          "مرتجع أو تسوية -> إشعار دائن مورد -> تخفيض ذمم أو تطبيق على فاتورة.",
        ],
        cycleEn: [
          "Return or settlement -> vendor credit -> reduce payables or apply against a bill.",
        ],
      }
    case "payments":
      return {
        contentsAr: [
          "نوع الحركة: مقبوض أو مدفوع وطريقة السداد أو التحصيل.",
          "الطرف المقابل والمستند المرتبط مثل فاتورة عميل أو فاتورة مورد.",
          "التخصيص أو المطابقة على الأرصدة المفتوحة.",
          "القيود أو حالة الفترة المحاسبية المرتبطة بالحركة.",
        ],
        contentsEn: [
          "Movement type: receipt or payment, and the payment method.",
          "The counterparty and linked document such as customer invoice or supplier bill.",
          "Allocation or matching against open balances.",
          "The constraints or accounting-period state related to the movement.",
        ],
        workflowAr: [
          "حدد هل الحركة مقبوض أم مدفوع.",
          "اربطها بالمستند أو الرصيد المفتوح الصحيح.",
          "راجع المتبقي بعد التخصيص أو التسوية.",
          "تحقق من الفترة المحاسبية والصلاحيات قبل اعتبار الخطوة مكتملة.",
        ],
        workflowEn: [
          "Decide whether the movement is a receipt or disbursement.",
          "Link it to the correct document or open balance.",
          "Review the remaining amount after allocation or settlement.",
          "Check the accounting period and permissions before treating the step as complete.",
        ],
        tipsAr: [
          "الحركة المالية لا تُقرأ بمعزل عن المستند الذي أغلقت أو خفّضت رصيده.",
          "الفترة المحاسبية قد تمنع بعض الإجراءات حتى لو ظهرت الصفحة متاحة.",
        ],
        tipsEn: [
          "A cash movement should not be read separately from the document whose balance it closed or reduced.",
          "The accounting period may block actions even if the page itself is visible.",
        ],
        approvalsAr: [
          "التنفيذ الفعلي يعتمد على نوع الحركة وصلاحية المستخدم وحالة الفترة المحاسبية.",
        ],
        approvalsEn: [
          "Actual execution depends on movement type, user permission, and accounting-period state.",
        ],
      }
    case "fixed_assets":
      return {
        contentsAr: [
          "بيانات الأصل مثل الاسم والتكلفة وتاريخ الاقتناء والحسابات المرتبطة.",
          "حالة الأصل وجدول الإهلاك والقيمة الدفترية إن كانت متاحة.",
          "الربط بين الأصل وقيد الإضافة أو الإهلاك أو الاستبعاد.",
        ],
        contentsEn: [
          "Asset details such as name, cost, acquisition date, and linked accounts.",
          "Asset status, depreciation schedule, and book value when available.",
          "The link between the asset and acquisition, depreciation, or disposal entries.",
        ],
        workflowAr: [
          "أضف بيانات الأصل الأساسية والتكلفة وتاريخ التشغيل.",
          "راجع حساب الأصل وحساب مجمع الإهلاك ومصروف الإهلاك.",
          "تابع الإهلاك الدوري أو حالة الأصل قبل أي استبعاد أو تعديل.",
        ],
        workflowEn: [
          "Enter the asset basics, cost, and in-service date.",
          "Review the asset, accumulated depreciation, and depreciation expense accounts.",
          "Track periodic depreciation and asset status before disposal or adjustment.",
        ],
        tipsAr: [
          "الإهلاك يعتمد على بيانات الأصل وسياسة الشركة وليس على اسم الأصل فقط.",
        ],
        tipsEn: [
          "Depreciation depends on asset data and company policy, not only on the asset name.",
        ],
        approvalsAr: [
          "إضافة أو تعديل أو استبعاد الأصل يخضع للصلاحيات وحالة الفترة المحاسبية.",
        ],
        approvalsEn: [
          "Adding, changing, or disposing of an asset depends on permissions and accounting-period state.",
        ],
        cycleAr: [
          "إضافة أصل -> إعداد حسابات وإهلاك -> تشغيل -> إهلاك دوري -> استبعاد أو بيع عند الحاجة.",
        ],
        cycleEn: [
          "Asset addition -> account and depreciation setup -> in service -> periodic depreciation -> disposal or sale when needed.",
        ],
      }
    case "employees":
    case "payroll":
      return {
        contentsAr: [
          "بيانات الموظف أو مسير الرواتب والحالة التشغيلية الحالية.",
          "عناصر الراتب مثل الأساسي والبدلات والاستقطاعات والصافي.",
          "حالة الصرف أو الاعتماد والقيود المرتبطة عند الترحيل.",
        ],
        contentsEn: [
          "Employee or payroll-run details and the current operating state.",
          "Payroll components such as base salary, allowances, deductions, and net pay.",
          "Payment or approval status and related entries when posted.",
        ],
        workflowAr: [
          "ابدأ من بيانات الموظف أو فترة الرواتب.",
          "راجع عناصر الراتب والاستقطاعات قبل الاعتماد.",
          "تابع حالة الصرف أو الترحيل حسب الصلاحيات والفترة المحاسبية.",
        ],
        workflowEn: [
          "Start with the employee record or payroll period.",
          "Review salary components and deductions before approval.",
          "Track payment or posting status according to permissions and the accounting period.",
        ],
        tipsAr: [
          "صافي الراتب ينتج من عناصر الراتب ناقص الاستقطاعات، وقد يتأثر بالحضور والسياسات.",
        ],
        tipsEn: [
          "Net salary comes from payroll components minus deductions and may be affected by attendance and policies.",
        ],
        approvalsAr: [
          "اعتماد أو صرف الرواتب إجراء حوكمي ولا ينفذه المساعد مباشرة.",
        ],
        approvalsEn: [
          "Payroll approval or payment is a governed action and is never executed by the copilot directly.",
        ],
        cycleAr: [
          "موظف -> حضور أو بيانات راتب -> حساب المسير -> اعتماد -> صرف -> قيد عند الترحيل.",
        ],
        cycleEn: [
          "Employee -> attendance or salary data -> payroll calculation -> approval -> payment -> entry when posted.",
        ],
      }
    case "reports":
      return {
        contentsAr: [
          "تقارير تشغيلية أو مالية تعرض ملخصات ومؤشرات حسب الفترة والنطاق.",
          "فلاتر للتحليل مثل الفرع أو الفترة أو العميل أو المورد حسب التقرير.",
          "مدخلات لفهم الأداء أو اكتشاف مشاكل تحتاج متابعة.",
        ],
        contentsEn: [
          "Operational or financial reports showing summaries and KPIs by period and scope.",
          "Analysis filters such as branch, period, customer, or supplier depending on the report.",
          "Signals for understanding performance or finding issues that need follow-up.",
        ],
        workflowAr: [
          "حدد التقرير والفترة والنطاق.",
          "اقرأ المؤشرات الأساسية ثم انتقل للتفاصيل أو المستندات المصدر.",
          "اربط النتيجة بالصفحة التشغيلية المناسبة قبل اتخاذ قرار.",
        ],
        workflowEn: [
          "Select the report, period, and scope.",
          "Read the key metrics, then drill into details or source documents.",
          "Connect the result to the relevant operating page before making a decision.",
        ],
        tipsAr: [
          "التقارير تشرح النتائج، لكنها لا تستبدل صفحة التنفيذ أو الاعتماد.",
        ],
        tipsEn: [
          "Reports explain outcomes but do not replace execution or approval pages.",
        ],
      }
    default:
      if (context.domain === "sales") {
        return {
          contentsAr: [
            "بيانات المستند أو العملية البيعية الحالية.",
            "حالة الفاتورة أو الطلب وما يرتبط بها من تسليم أو تحصيل.",
            "مؤشرات الذمم أو المرتجعات إن كانت مرتبطة بالدورة.",
          ],
          contentsEn: [
            "The current sales document or workflow details.",
            "Order or invoice status together with delivery or collection state.",
            "Receivable or return indicators linked to the cycle when relevant.",
          ],
          workflowAr: [
            "ابدأ من حالة المستند الحالي.",
            "اربطه بالتسليم أو التحصيل أو المرتجع عند الحاجة.",
            "ثم راقب أثره على الذمم أو الإغلاق النهائي للدورة.",
          ],
          workflowEn: [
            "Start with the current document state.",
            "Connect it to delivery, collection, or return when relevant.",
            "Then review its effect on receivables or final cycle closure.",
          ],
          tipsAr: [
            "قراءة دورة البيع تحتاج دائمًا الجمع بين المستند والحالة والذمم.",
          ],
          tipsEn: [
            "Reading the sales cycle always requires combining document, status, and receivable context.",
          ],
          approvalsAr: [
            "الاعتماد الفعلي يرتبط بالحالة الحالية وصلاحياتك الفعلية داخل الدورة.",
          ],
          approvalsEn: [
            "Actual approval depends on the current state and your effective permissions in the cycle.",
          ],
          cycleAr: [
            "طلب أو مستند بيع -> فاتورة -> تسليم -> تحصيل -> مرتجع عند الحاجة.",
          ],
          cycleEn: [
            "Sales document -> invoice -> delivery -> collection -> return when needed.",
          ],
        }
      }

      if (context.domain === "inventory") {
        return {
          contentsAr: [
            "الأصناف والكميات والمخازن والحركات المرتبطة بها.",
            "مؤشرات النقص أو النفاد أو الحركات المعلقة.",
            "الربط مع الفواتير أو المرتجعات أو التحويلات المخزنية.",
          ],
          contentsEn: [
            "Items, quantities, warehouses, and related movements.",
            "Low-stock, out-of-stock, or pending-movement signals.",
            "Links to invoices, returns, or inventory transfers.",
          ],
          workflowAr: [
            "ابدأ بفهم الكمية المتاحة والحالة الحالية.",
            "راجع الحركة المرتبطة: استلام، صرف، تحويل، أو مرتجع.",
            "اربط ذلك بالمستند المالي أو التشغيلي المرتبط إن وجد.",
          ],
          workflowEn: [
            "Start by understanding the available quantity and current state.",
            "Review the linked movement: receipt, issue, transfer, or return.",
            "Then connect it to any financial or operational source document.",
          ],
          tipsAr: [
            "المخزون يتأثر بالدورة التشغيلية كاملة وليس بعرض الصنف فقط.",
          ],
          tipsEn: [
            "Inventory is shaped by the full operating cycle, not only by the item card.",
          ],
        }
      }

      if (context.domain === "accounting" || context.domain === "receivables") {
        return {
          contentsAr: [
            "المستندات أو الأرصدة أو القيود المرتبطة بالأثر المالي الحالي.",
            "الحالة المحاسبية أو حالة السداد أو الرصيد المفتوح.",
            "الربط بين المستند التشغيلي والذمم أو القيود أو التسويات.",
          ],
          contentsEn: [
            "The documents, balances, or entries linked to the current financial effect.",
            "The accounting, payment, or open-balance state.",
            "The link between the operational document and entries, receivables, or settlements.",
          ],
          workflowAr: [
            "حدد أولًا نوع المستند أو الرصيد الذي تنظر إليه.",
            "راجع حالته الحالية: مسودة، مرحّل، مفتوح، مدفوع جزئيًا، أو مغلق.",
            "ثم اربطه بالمستندات الأخرى أو القيود أو التسويات لفهم الدورة كاملة.",
          ],
          workflowEn: [
            "First identify the type of document or balance you are reviewing.",
            "Review its current state: draft, posted, open, partially paid, or closed.",
            "Then connect it to related documents, entries, or settlements to understand the full cycle.",
          ],
          tipsAr: [
            "السؤال الأدق يعطي شرحًا أدق: اذكر نوع المستند أو اسم العملية أو الرصيد.",
          ],
          tipsEn: [
            "A more specific question leads to a more precise explanation: mention the document type, workflow, or balance.",
          ],
          approvalsAr: [
            "النتيجة النهائية تتأثر بصلاحياتك والفترة المحاسبية وحالة المستند الحالي.",
          ],
          approvalsEn: [
            "The final result is shaped by your permissions, the accounting period, and the current document state.",
          ],
        }
      }

      if (context.domain === "governance") {
        return {
          contentsAr: [
            "إعدادات الأدوار والصلاحيات والنطاقات مثل الفرع أو المخزن.",
            "قيود الوصول والسماح أو المنع حسب المورد أو الصفحة.",
            "أثر الحوكمة على ما يمكن للمستخدم رؤيته أو تنفيذه.",
          ],
          contentsEn: [
            "Role, permission, and scope settings such as branch or warehouse.",
            "Access constraints and allow or deny rules by resource or page.",
            "How governance shapes what the user can view or execute.",
          ],
          workflowAr: [
            "حدد المورد أو الصفحة أو الإجراء الذي تريد فحصه.",
            "راجع الدور والنطاق أولًا.",
            "ثم اربط ذلك بما هو مسموح أو محجوب فعليًا للمستخدم.",
          ],
          workflowEn: [
            "Identify the resource, page, or action you want to inspect.",
            "Review role and scope first.",
            "Then connect that to what is actually allowed or blocked for the user.",
          ],
          tipsAr: [
            "الرؤية وحدها لا تعني السماح بالتنفيذ.",
          ],
          tipsEn: [
            "Visibility alone does not mean execution is allowed.",
          ],
        }
      }

      return null
  }
}

function buildFallbackResult(
  context: AICopilotContext,
  userMessage: string,
  fallbackReason: string,
  interactivePayload: AICopilotInteractivePayload
): CopilotChatResult {
  const answer =
    context.language === "ar"
      ? [
          "أعمل حالياً في وضع الرد المحلي الآمن بسبب محدودية السياق المحلي المتاح لهذا السؤال.",
          context.guide?.description ||
            "يمكنني ما زلت شرح الصفحة الحالية وإعطاؤك خطوات تشغيل عامة داخل النظام.",
          `سؤالك: ${userMessage}`,
        ].join("\n\n")
      : [
          "I am currently using a safe local fallback because the available local context for this question is limited.",
          context.guide?.description ||
            "I can still explain the current page and provide general operating guidance inside the ERP.",
          `Your question: ${userMessage}`,
        ].join("\n\n")

  return {
    answer,
    usedModel: LOCAL_COPILOT_MODEL,
    fallbackUsed: true,
    fallbackReason,
    interactivePayload,
    toolAudit: {
      toolName: "ai.local_copilot.fallback",
      input: {
        pageKey: context.scope.pageKey,
        domain: context.domain,
        fallbackReason,
      },
      outputHash: createHash("sha256").update(answer).digest("hex"),
    },
  }
}

function buildInsights(
  context: AICopilotContext,
  userMessage?: string | null
): AIInsight[] {
  const language = context.language
  const insights: AIInsight[] = context.liveContext.alerts.map((alert, index) => ({
    domain: context.domain,
    severity: inferAlertSeverity(alert),
    title:
      language === "ar"
        ? `ملاحظة تشغيلية ${index + 1}`
        : `Operating insight ${index + 1}`,
    summary: alert,
    confidenceScore: 82,
    entityType: context.scope.pageKey || context.domain,
    entityId: null,
    recommendedAction: context.liveContext.suggestions[index] || null,
    evidence: {
      pageKey: context.scope.pageKey,
      role: context.scope.role,
    },
  }))

  if (!context.permissionSnapshot.canRead) {
    insights.unshift({
      domain: context.domain,
      severity: "critical",
      title: language === "ar" ? "صلاحية القراءة غير متاحة" : "Read permission unavailable",
      summary:
        language === "ar"
          ? "صلاحياتك الحالية لا تسمح بقراءة هذه الصفحة بشكل كامل، لذلك يجب مراجعة الدور أو المورد المرتبط."
          : "Your current permissions do not allow full access to this page, so the role or resource mapping should be reviewed.",
      confidenceScore: 98,
      entityType: "resource",
      entityId: context.pageResource,
      recommendedAction:
        language === "ar"
          ? "راجع مسؤول النظام أو صفحة الصلاحيات."
          : "Review permissions with an administrator.",
    })
  }

  if (
    userMessage &&
    includesAny(userMessage.toLowerCase(), context.language === "ar" ? ["خطأ", "ناقصة", "تحذير"] : ["error", "missing", "warning"]) &&
    context.liveContext.alerts.length === 0
  ) {
    insights.push({
      domain: context.domain,
      severity: "info",
      title:
        language === "ar"
          ? "لم يتم رصد تحذير حي مباشر"
          : "No immediate live warning detected",
      summary:
        language === "ar"
          ? "لم يرصد المساعد المحلي تعارضًا مباشرًا في المؤشرات الحالية، لكن يمكنني فحص الخطوات والحوكمة معك."
          : "The local copilot did not detect a direct issue in the current live indicators, but I can still inspect the workflow and governance with you.",
      confidenceScore: 74,
      entityType: context.scope.pageKey || context.domain,
    })
  }

  return insights.slice(0, 4)
}

function buildNextActions(
  context: AICopilotContext,
  userMessage?: string | null
): AINextAction[] {
  const language = context.language
  const actions: AINextAction[] = []
  const canWrite = context.permissionSnapshot.canWrite || context.permissionSnapshot.canUpdate
  const pageKey = String(context.scope.pageKey || "").toLowerCase()

  if (!canWrite) {
    actions.push({
      title:
        language === "ar"
          ? "مراجعة الصلاحيات أولاً"
          : "Review permissions first",
      summary:
        language === "ar"
          ? "قدرتك الحالية تقتصر على القراءة أو الشرح، لذا ابدأ بفهم الصلاحية المتاحة قبل أي خطوة تشغيلية."
          : "Your current access is read-only or explanatory, so start by confirming the available permission before any operational step.",
      prompt:
        language === "ar"
          ? "اشرح لي ما الذي يمكنني فعله هنا حسب صلاحيتي الحالية؟"
          : "Explain what I can do here with my current permissions.",
      severity: "warning",
      confidenceScore: 95,
    })
  }

  switch (context.domain) {
    case "sales":
      actions.push({
        title:
          language === "ar"
            ? "مراجعة حالة دورة البيع"
            : "Review sales-cycle status",
        summary:
          language === "ar"
            ? "ابدأ من حالة الفاتورة، ثم اعتماد المخزن، ثم التحصيل أو الذمم."
            : "Start with invoice status, then warehouse approval, then collection or receivables.",
        prompt:
          language === "ar"
            ? "ما الخطوة التالية الصحيحة في دورة البيع الحالية؟"
            : "What is the correct next step in the current sales cycle?",
        severity: "info",
        confidenceScore: 90,
      })
      break
    case "returns":
      actions.push({
        title:
          language === "ar"
            ? "تحديد مرحلة الاعتماد الحالية"
            : "Identify the current approval stage",
        summary:
          language === "ar"
            ? "تحقق أولاً هل الطلب بانتظار الإدارة أم المخزن قبل تفسير سبب عدم التنفيذ."
            : "Check whether the request is waiting on management or warehouse before explaining why it is not executed.",
        prompt:
          language === "ar"
            ? "ما مرحلة الاعتماد الحالية لطلبات المرتجع وما الإجراء التالي؟"
            : "What is the current approval stage for return requests and what comes next?",
        severity: "warning",
        confidenceScore: 92,
      })
      break
    case "inventory":
      actions.push({
        title:
          language === "ar"
            ? "مراجعة أثر المخزون الحي"
            : "Review live inventory impact",
        summary:
          language === "ar"
            ? "ابدأ بالمنتجات منخفضة المخزون والحركات المعلقة قبل أي قرار تشغيلي."
            : "Start with low-stock products and pending movements before taking any operating decision.",
        prompt:
          language === "ar"
            ? "ما أهم تحذيرات المخزون والخطوة التالية المقترحة؟"
            : "What are the top inventory warnings and the suggested next step?",
        severity: "warning",
        confidenceScore: 88,
      })
      break
    case "accounting":
      if (isPurchasePageKey(pageKey)) {
        actions.push({
          title:
            language === "ar"
              ? "مراجعة مرحلة دورة الشراء الحالية"
              : "Review the current purchasing stage",
          summary:
            language === "ar"
              ? "ابدأ من حالة أمر الشراء أو فاتورة المورد، ثم الاستلام أو التأكيد، ثم الذمم أو التعويض."
              : "Start with purchase order or supplier bill status, then receipt or confirmation, then payables or compensation.",
          prompt:
            language === "ar"
              ? "ما المرحلة الحالية في دورة الشراء وما الخطوة التالية؟"
              : "What is the current purchasing stage and what comes next?",
          severity: "info",
          confidenceScore: 90,
        })
        break
      }
      if (pageKey === "payments") {
        actions.push({
          title:
            language === "ar"
              ? "تحديد المستند المرتبط بالحركة المالية"
              : "Identify the document linked to the cash movement",
          summary:
            language === "ar"
              ? "ابدأ بتحديد هل الحركة مرتبطة بفاتورة عميل أم فاتورة مورد أم تسوية مستقلة."
              : "Start by identifying whether the movement is linked to a customer invoice, supplier bill, or a standalone settlement.",
          prompt:
            language === "ar"
              ? "كيف أحدد المستند الصحيح المرتبط بهذه الدفعة أو المقبوض؟"
              : "How do I identify the correct document linked to this payment or receipt?",
          severity: "info",
          confidenceScore: 88,
        })
        break
      }
      actions.push({
        title:
          language === "ar"
            ? "مراجعة القيود قبل الترحيل"
            : "Review entries before posting",
        summary:
          language === "ar"
            ? "راجع المسودات والذمم المفتوحة أولاً قبل أي تفسير محاسبي نهائي."
            : "Review drafts and open receivables before any final accounting interpretation.",
        prompt:
          language === "ar"
            ? "ما القيود أو الذمم التي تحتاج مراجعة أولاً؟"
            : "Which entries or receivables need review first?",
        severity: "info",
        confidenceScore: 87,
      })
      break
    default:
      actions.push({
        title:
          language === "ar"
            ? "ابدأ بسؤال تشغيلي أدق"
            : "Start with a more precise operational question",
        summary:
          language === "ar"
            ? "اذكر العملية أو الصفحة أو الخطوة التي تريدها وسأربطها بالسياق الحي والصلاحيات."
            : "Mention the workflow, page, or step you need and I will connect it to live context and permissions.",
        prompt:
          language === "ar"
            ? "اشرح لي أهم ما يجب أن أراجعه الآن في هذه الصفحة"
            : "Explain the main thing I should review now on this page.",
        severity: "info",
        confidenceScore: 80,
      })
  }

  if (userMessage && includesAny(userMessage.toLowerCase(), ["عميل", "customer"])) {
    actions.unshift({
      title:
        language === "ar"
          ? "تحديد العميل المعني"
          : "Identify the related customer",
      summary:
        language === "ar"
          ? "اذكر اسم العميل أو الفاتورة لتحصل على توجيه أدق بشأن الذمم أو المرتجع أو التحصيل."
          : "Mention the customer or invoice to get more precise guidance on receivables, returns, or collection.",
      prompt:
        language === "ar"
          ? "كيف أراجع ذمة عميل محدد من داخل النظام؟"
          : "How do I review a specific customer's receivable inside the ERP?",
      severity: "info",
      confidenceScore: 76,
    })
  }

  return dedupeByTitle(actions).slice(0, 3)
}

function buildPredictedActions(context: AICopilotContext): AIPredictedAction[] {
  const language = context.language
  const predictions: AIPredictedAction[] = []
  const pageKey = String(context.scope.pageKey || "").toLowerCase()

  const pendingDispatch = readMetricCount(context, [
    "بانتظار اعتماد التسليم",
    "Pending delivery approval",
    "اعتمادات تسليم معلقة",
    "Pending dispatch approvals",
  ])
  const lowStock = readMetricCount(context, ["مخزون منخفض", "Low stock", "منتجات منخفضة المخزون"])
  const outOfStock = readMetricCount(context, ["نفاد مخزون", "Out of stock"])
  const pendingLevel1 = readMetricCount(context, ["بانتظار الإدارة", "Pending management approval"])
  const pendingWarehouse = readMetricCount(context, ["بانتظار المخزن", "Pending warehouse approval"])
  const draftEntries = readMetricCount(context, ["قيود مسودة", "Draft journal entries"])

  switch (context.domain) {
    case "sales":
      if (pendingDispatch > 0) {
        predictions.push({
          title:
            language === "ar"
              ? "المتوقع التالي: مراجعة اعتماد التسليم"
              : "Predicted next step: review delivery approval",
          summary:
            language === "ar"
              ? "توجد فواتير ما زالت بانتظار اعتماد المخزن، لذلك هذه غالباً الخطوة التشغيلية التالية."
              : "Some invoices are still waiting for warehouse approval, so this is likely the next operating step.",
          prompt:
            language === "ar"
              ? "ما الفواتير التي تنتظر اعتماد التسليم الآن؟"
              : "Which invoices are waiting for delivery approval now?",
          confidenceScore: 91,
        })
      } else {
        predictions.push({
          title:
            language === "ar"
              ? "المتوقع التالي: متابعة التحصيل أو الذمم"
              : "Predicted next step: follow up on collection or receivables",
          summary:
            language === "ar"
              ? "بعد اكتمال الفواتير والتسليم، يميل الاستخدام التالي إلى مراجعة المدفوعات أو الذمم المفتوحة."
              : "After invoices and delivery are complete, the next usage trend is usually payments or open receivables follow-up.",
          prompt:
            language === "ar"
              ? "ما أهم الذمم المفتوحة أو الدفعات التي تحتاج متابعة؟"
              : "What are the main open receivables or payments that need follow-up?",
          confidenceScore: 78,
        })
      }
      break
    case "returns":
      if (pendingLevel1 > 0) {
        predictions.push({
          title:
            language === "ar"
              ? "المتوقع التالي: اعتماد إداري"
              : "Predicted next step: management approval",
          summary:
            language === "ar"
              ? "بعض طلبات المرتجع ما زالت عند المرحلة الإدارية، وبالتالي هذا هو المسار التالي المرجح."
              : "Some return requests are still at the management stage, so this is the most likely next path.",
          prompt:
            language === "ar"
              ? "ما طلبات المرتجع التي تنتظر اعتماد الإدارة؟"
              : "Which return requests are waiting for management approval?",
          confidenceScore: 94,
        })
      }
      if (pendingWarehouse > 0) {
        predictions.push({
          title:
            language === "ar"
              ? "المتوقع التالي: تأكيد المخزن"
              : "Predicted next step: warehouse confirmation",
          summary:
            language === "ar"
              ? "بعض الطلبات تجاوزت الإدارة وتنتظر استلام المرتجع فعلياً من المخزن."
              : "Some requests have passed management and are now waiting for physical warehouse confirmation.",
          prompt:
            language === "ar"
              ? "ما الطلبات التي تنتظر اعتماد المخزن الآن؟"
              : "Which requests are waiting for warehouse approval now?",
          confidenceScore: 93,
        })
      }
      break
    case "inventory":
      if (outOfStock > 0 || lowStock > 0) {
        predictions.push({
          title:
            language === "ar"
              ? "المتوقع التالي: معالجة النقص في المخزون"
              : "Predicted next step: resolve stock shortage",
          summary:
            language === "ar"
              ? "مؤشرات المخزون توحي بأن المراجعة التالية ستكون حول المنتجات الحرجة أو المنخفضة."
              : "Inventory indicators suggest the next review will be around critical or low-stock items.",
          prompt:
            language === "ar"
              ? "ما المنتجات الحرجة التي تحتاج تدخلًا الآن؟"
              : "Which critical products need attention now?",
          confidenceScore: outOfStock > 0 ? 96 : 84,
        })
      }
      break
    case "accounting":
      if (isPurchasePageKey(pageKey)) {
        predictions.push({
          title:
            language === "ar"
              ? "المتوقع التالي: متابعة الذمم أو تسوية المورد"
              : "Predicted next step: follow up on payables or supplier settlement",
          summary:
            language === "ar"
              ? "بعد مراجعة فاتورة المورد أو المرتجع، يميل الاستخدام التالي إلى الذمم الدائنة أو إشعار الدائن أو السداد."
              : "After reviewing the supplier bill or return, the next likely move is payables, vendor credit, or payment follow-up.",
          prompt:
            language === "ar"
              ? "ما الذمم أو التسويات المرتبطة بالمورد التي تحتاج متابعة الآن؟"
              : "Which supplier payables or settlements need follow-up now?",
          confidenceScore: 82,
        })
        break
      }
      if (pageKey === "payments") {
        predictions.push({
          title:
            language === "ar"
              ? "المتوقع التالي: مطابقة الحركة مع المستند المفتوح"
              : "Predicted next step: match the movement to the open document",
          summary:
            language === "ar"
              ? "الاستخدام التالي عادة يكون ربط المقبوض أو المدفوع بالفاتورة أو التسوية الصحيحة."
              : "The next likely step is usually linking the receipt or payment to the correct invoice or settlement.",
          prompt:
            language === "ar"
              ? "ما المستندات المفتوحة التي يجب أن أربط بها هذه الحركة؟"
              : "Which open documents should this movement be linked to?",
          confidenceScore: 85,
        })
        break
      }
      if (draftEntries > 0) {
        predictions.push({
          title:
            language === "ar"
              ? "المتوقع التالي: مراجعة القيود المسودة"
              : "Predicted next step: review draft entries",
          summary:
            language === "ar"
              ? "وجود قيود مسودة يجعل المراجعة أو الترحيل هي الحركة المنطقية التالية."
              : "The presence of draft entries makes review or posting the logical next move.",
          prompt:
            language === "ar"
              ? "ما القيود المسودة التي تحتاج مراجعة الآن؟"
              : "Which draft journal entries need review now?",
          confidenceScore: 89,
        })
      }
      break
    default:
      predictions.push({
        title:
          language === "ar"
            ? "المتوقع التالي: توضيح السؤال"
            : "Predicted next step: clarify the question",
        summary:
          language === "ar"
            ? "أفضل نتيجة تأتي عادة بعد تحديد العملية أو الصفحة أو المستند المقصود بشكل أدق."
            : "The best result usually comes after clarifying the target workflow, page, or document.",
        prompt:
          language === "ar"
            ? "ساعدني في تحديد أفضل سؤال أبدأ به في هذه الصفحة"
            : "Help me pick the best first question for this page.",
        confidenceScore: 70,
      })
  }

  return predictions.slice(0, 3)
}

function buildQuickPrompts(
  context: AICopilotContext,
  userMessage?: string | null,
  messages: CopilotChatMessage[] = []
): AIQuickPrompt[] {
  const language = context.language
  const prompts: AIQuickPrompt[] = []
  const guideTitle = context.guide?.title
  const pageKey = String(context.scope.pageKey || "").toLowerCase()

  prompts.push(
    {
      label:
        language === "ar"
          ? guideTitle
            ? `اشرح لي الخطوات العملية في ${guideTitle}`
            : "اشرح لي خطوات العمل هنا"
          : guideTitle
            ? `Explain the operating steps on ${guideTitle}`
            : "Explain the workflow here",
      prompt:
        language === "ar"
          ? guideTitle
            ? `اشرح لي خطوات العمل في صفحة ${guideTitle}`
            : "اشرح لي خطوات العمل في هذه الصفحة"
          : guideTitle
            ? `Explain the workflow on the ${guideTitle} page`
            : "Explain the workflow on this page",
      category: "workflow",
    },
    {
      label:
        language === "ar"
          ? "ما الصلاحيات أو القيود الحالية؟"
          : "What permissions or constraints apply now?",
      prompt:
        language === "ar"
          ? "ما الذي يمكنني فعله هنا حسب صلاحيتي الحالية؟"
          : "What can I do here with my current permissions?",
      category: "governance",
    }
  )

  prompts.push(
    ...buildERPQuestionBankPrompts({
      language,
      domain: context.domain,
      pageKey,
      includeGlobal: false,
      includeAdvanced: true,
      limit: 4,
    })
  )

  if (isPurchasePageKey(pageKey)) {
    prompts.push({
      label:
        language === "ar"
          ? "اشرح لي دورة الشراء في هذه الصفحة"
          : "Explain the purchase cycle on this page",
      prompt:
        language === "ar"
          ? "اشرح لي دورة الشراء والاعتمادات المرتبطة بهذه الصفحة"
          : "Explain the purchase cycle and approvals related to this page.",
      category: "workflow",
    })
  } else if (context.domain === "sales") {
    prompts.push({
      label:
        language === "ar"
          ? "اشرح لي دورة البيع في هذه الصفحة"
          : "Explain the sales cycle on this page",
      prompt:
        language === "ar"
          ? "اشرح لي دورة البيع والاعتمادات المرتبطة بهذه الصفحة"
          : "Explain the sales cycle and approvals related to this page.",
      category: "workflow",
    })
  }

  if (context.liveContext.metrics.length > 0) {
    prompts.push({
      label:
        language === "ar"
          ? "اعرض لي أهم المؤشرات الحالية"
          : "Show the most important live metrics",
      prompt:
        language === "ar"
          ? "اعرض لي ملخصًا حيًا لأهم المؤشرات في هذه الصفحة"
          : "Show me a live summary of the most important metrics on this page.",
      category: "analytics",
    })
  }

  if (context.liveContext.alerts.length > 0) {
    prompts.push({
      label:
        language === "ar"
          ? "ما أبرز التحذيرات الحالية؟"
          : "What are the main current warnings?",
      prompt:
        language === "ar"
          ? "ما أبرز التحذيرات أو البيانات غير المكتملة التي يجب أن أراجعها؟"
          : "What are the main warnings or incomplete data points I should review?",
      category: "compliance",
    })
  }

  if (messages.length > 2 || userMessage) {
    prompts.push({
      label:
        language === "ar"
          ? "ما الخطوة التالية المتوقعة؟"
          : "What is the predicted next step?",
      prompt:
        language === "ar"
          ? "ما الخطوة التالية المتوقعة لي داخل هذه الصفحة؟"
          : "What is the predicted next step for me on this page?",
      category: "prediction",
    })
  }

  return dedupeByLabel(prompts).slice(0, 7)
}

function inferMetricSeverity(metric: { label: string; value: string }): AISeverity | null {
  const text = `${metric.label} ${metric.value}`.toLowerCase()
  if (includesAny(text, ["نفاد", "out of stock", "critical"])) return "critical"
  if (includesAny(text, ["معلق", "pending", "منخفض", "low"])) return "warning"
  return null
}

function inferAlertSeverity(alert: string): AISeverity {
  const text = alert.toLowerCase()
  if (includesAny(text, ["نفاد", "out of stock", "critical", "غير مسموح"])) return "critical"
  if (includesAny(text, ["معلق", "pending", "تحذير", "warning", "needs review", "تحتاج"])) {
    return "warning"
  }
  return "info"
}

function readMetricCount(context: AICopilotContext, labels: string[]) {
  const match = context.liveContext.metrics.find((item) =>
    labels.some((label) => item.label.toLowerCase() === label.toLowerCase())
  )
  if (!match) return 0
  return parseLocalizedNumber(match.value)
}

function parseLocalizedNumber(value: string) {
  const normalized = normalizeDigits(value).replace(/[^\d.-]/g, "")
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeDigits(value: string) {
  const map: Record<string, string> = {
    "٠": "0",
    "١": "1",
    "٢": "2",
    "٣": "3",
    "٤": "4",
    "٥": "5",
    "٦": "6",
    "٧": "7",
    "٨": "8",
    "٩": "9",
  }

  return value.replace(/[٠-٩]/g, (digit) => map[digit] || digit)
}

function dedupeByTitle<T extends { title: string }>(items: T[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = item.title.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function dedupeByLabel<T extends { label: string }>(items: T[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = item.label.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function includesAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word))
}

function normalizeIntentText(value: string) {
  return value
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[ؤئ]/g, "ء")
    .replace(/ـ/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function isPureGreetingIntent(intents: IntentAnalysis) {
  return (
    intents.askGreeting &&
    !intents.askCapabilities &&
    !intents.askWorkflow &&
    !intents.askReport &&
    !intents.askGovernance &&
    !intents.askAccounting &&
    !intents.askAction &&
    !intents.askPrediction &&
    !intents.askValidation &&
    !intents.askDefinition &&
    !intents.askDashboardCardMeaning &&
    !intents.askPageContents &&
    !intents.askSalesCycle &&
    !intents.askPurchaseCycle
  )
}

type DashboardCardKey =
  | "revenue"
  | "cogs_expenses"
  | "net_profit"
  | "invoices_count"
  | "receivables"
  | "payables"
  | "monthly_revenue"
  | "monthly_expenses"

interface DashboardCardDefinition {
  key: DashboardCardKey
  labelAr: string
  labelEn: string
}

function detectDashboardCard(userMessage: string): DashboardCardDefinition | null {
  const normalized = normalizeIntentText(userMessage)

  const definitions: Array<{
    card: DashboardCardDefinition
    needles: string[]
  }> = [
    {
      card: { key: "cogs_expenses", labelAr: "تكلفة + مصروفات", labelEn: "COGS & Expenses" },
      needles: ["تكلفه + مصروفات", "تكلفه مصروفات", "cogs expenses", "cogs & expenses"],
    },
    {
      card: { key: "net_profit", labelAr: "صافي الربح", labelEn: "Net Profit" },
      needles: ["صافي الربح", "net profit"],
    },
    {
      card: { key: "revenue", labelAr: "الإيرادات", labelEn: "Revenue" },
      needles: ["الايرادات", "revenue"],
    },
    {
      card: { key: "invoices_count", labelAr: "عدد الفواتير", labelEn: "Invoices Count" },
      needles: ["عدد الفواتير", "invoices count"],
    },
    {
      card: { key: "receivables", labelAr: "ذمم مدينة", labelEn: "Receivables" },
      needles: ["ذمم مدينه", "receivables"],
    },
    {
      card: { key: "payables", labelAr: "ذمم دائنة", labelEn: "Payables" },
      needles: ["ذمم دائنه", "payables"],
    },
    {
      card: { key: "monthly_revenue", labelAr: "إيرادات الشهر", labelEn: "Revenue This Month" },
      needles: ["ايرادات الشهر", "revenue this month"],
    },
    {
      card: { key: "monthly_expenses", labelAr: "مصروفات الشهر", labelEn: "Expenses This Month" },
      needles: ["مصروفات الشهر", "expenses this month"],
    },
  ]

  for (const definition of definitions) {
    if (definition.needles.some((needle) => normalized.includes(needle))) {
      return definition.card
    }
  }

  return null
}

function buildDashboardCardMeaningArabic(card: DashboardCardDefinition) {
  switch (card.key) {
    case "cogs_expenses":
      return [
        'هذا الكارت يجمع بندين ماليين من دفتر الأستاذ العام (GL):',
        '- تكلفة البضاعة المباعة (COGS): وهي تكلفة المنتجات التي تم بيعها فعليًا.',
        '- المصروفات التشغيلية: مثل الإيجار والرواتب والتسويق والمرافق والمصروفات الإدارية ونحوها.',
        'إذن قيمة الكارت = تكلفة البضاعة المباعة + المصروفات التشغيلية، وليست المشتريات فقط.',
        'إذا ظهر داخل الكارت سطر صغير مثل `COGS: ...` فهو يوضح جزء تكلفة البضاعة داخل الإجمالي.',
        'هذا الكارت يساعدك على قراءة ما يستهلك الربح قبل الوصول إلى صافي الربح.',
      ].join("\n")
    case "revenue":
      return [
        'كارت "الإيرادات" يعرض الإيراد المعترف به محاسبيًا من دفتر الأستاذ العام (GL).',
        'هو لا يعتمد فقط على عدد الفواتير، بل على القيود المرحّلة التي سجلت الإيراد فعليًا.',
        'عمليًا: هذا الرقم يمثل ما دخل ضمن إيرادات الشركة في الفترة الحالية.',
      ].join("\n")
    case "net_profit":
      return [
        'كارت "صافي الربح" يوضح الربح النهائي بعد خصم تكلفة البضاعة والمصروفات من الإيرادات.',
        'بصيغة مبسطة: صافي الربح = الإيرادات - تكلفة البضاعة المباعة - المصروفات التشغيلية.',
        'إذا كان موجبًا فهذا ربح، وإذا كان سالبًا فهذا يعني خسارة خلال الفترة المختارة.',
      ].join("\n")
    case "invoices_count":
      return [
        'كارت "عدد الفواتير" هو عدّاد تشغيلي، وليس رقمًا ماليًا.',
        'يعرض عدد الفواتير المرتبطة بالفترة أو السياق الحالي، ليس قيمتها المالية.',
        'تستخدمه لمعرفة حجم النشاط، بينما الإيرادات والربح تأتي من كروت GL الأخرى.',
      ].join("\n")
    case "receivables":
      return [
        'كارت "ذمم مدينة" يوضح المبالغ التي ما زالت مستحقة للشركة على العملاء.',
        'يعني فواتير أو أرصدة لم يتم تحصيلها بالكامل بعد.',
        'هذا الكارت مهم لمتابعة التحصيل والسيولة وليس فقط حجم المبيعات.',
      ].join("\n")
    case "payables":
      return [
        'كارت "ذمم دائنة" يوضح المبالغ المستحقة على الشركة للموردين أو الدائنين.',
        'يمثل التزامات لم تُسدَّد بالكامل بعد.',
        'يفيدك في متابعة الالتزامات القريبة وتأثيرها على النقدية.',
      ].join("\n")
    case "monthly_revenue":
      return [
        'كارت "إيرادات الشهر" يركز على الإيرادات المعترف بها خلال هذا الشهر فقط.',
        'هو نسخة شهرية من كارت الإيرادات لتسهيل المتابعة الدورية.',
        'يُستخدم للمقارنة السريعة بين أداء هذا الشهر والشهور السابقة.',
      ].join("\n")
    case "monthly_expenses":
      return [
        'كارت "مصروفات الشهر" يوضح تكلفة ومصروفات هذا الشهر في العرض الشهري.',
        'غالبًا يُستخدم لمقارنة عبء المصروفات الحالي مقابل الإيرادات الشهرية.',
        'اقرأه مع "إيرادات الشهر" و"صافي الربح" للحصول على صورة أوضح عن الأداء الشهري.',
      ].join("\n")
  }
}

function buildDashboardCardMeaningEnglish(card: DashboardCardDefinition) {
  switch (card.key) {
    case "cogs_expenses":
      return [
        'This card combines two GL-based amounts:',
        '- Cost of goods sold (COGS): the actual cost of products that were sold.',
        '- Operating expenses: such as rent, payroll, marketing, utilities, and administrative expenses.',
        'So the card value = COGS + operating expenses. It is not just purchases.',
        'If you see a small `COGS: ...` line inside the card, it is showing the COGS portion within the total.',
        'This card helps you understand what is consuming profit before net profit is calculated.',
      ].join("\n")
    case "revenue":
      return [
        'The "Revenue" card shows revenue recognized in the general ledger.',
        'It is not based only on invoice count, but on posted accounting entries that actually recognized revenue.',
        'In practice, it represents what was booked as company revenue in the selected period.',
      ].join("\n")
    case "net_profit":
      return [
        'The "Net Profit" card shows the final profit after subtracting COGS and operating expenses from revenue.',
        'In simple terms: net profit = revenue - COGS - operating expenses.',
        'A positive value means profit, while a negative value means loss for the selected period.',
      ].join("\n")
    case "invoices_count":
      return [
        'The "Invoices Count" card is an operational counter, not a financial amount.',
        'It shows how many invoices exist in the current period or scope, not their monetary value.',
        'Use it to read activity volume, while revenue and profit come from the GL-based cards.',
      ].join("\n")
    case "receivables":
      return [
        'The "Receivables" card shows amounts still owed to the company by customers.',
        'It means invoices or balances that have not been fully collected yet.',
        'It is useful for tracking collections and liquidity, not just sales volume.',
      ].join("\n")
    case "payables":
      return [
        'The "Payables" card shows amounts the company still owes to suppliers or creditors.',
        'It represents liabilities that have not been fully paid yet.',
        'It helps track upcoming obligations and their impact on cash.',
      ].join("\n")
    case "monthly_revenue":
      return [
        'The "Revenue This Month" card focuses only on revenue recognized during the current month.',
        'It is the monthly view of the revenue card for easier periodic follow-up.',
        'Use it for quick comparison between this month and previous months.',
      ].join("\n")
    case "monthly_expenses":
      return [
        'The "Expenses This Month" card shows this month’s cost and expense burden in the monthly view.',
        'It is typically used alongside monthly revenue to understand current-period performance.',
        'Read it together with "Revenue This Month" and "Net Profit" for a clearer monthly picture.',
      ].join("\n")
  }
}

function buildDomainCapabilityLine(context: AICopilotContext) {
  const pageKey = String(context.scope.pageKey || "").toLowerCase()

  if (context.language === "ar") {
    if (isPurchasePageKey(pageKey)) {
      return "داخل دورة الشراء أشرح لك الفرق بين أمر الشراء، فاتورة المورد، الاستلام أو التأكيد، الذمم الدائنة، ومرتجع المشتريات أو إشعار الدائن."
    }
    if (pageKey === "payments") {
      return "داخل المدفوعات أشرح لك الفرق بين المقبوضات والمدفوعات والربط مع الفواتير والتسويات والفترات المحاسبية."
    }
    if (isFixedAssetsPageKey(pageKey)) {
      return "داخل الأصول الثابتة أشرح لك الإضافة، الإهلاك، حالة الأصل، والأثر المحاسبي دون تنفيذ أي ترحيل."
    }
    if (isHRPageKey(pageKey)) {
      return "داخل الموظفين والمرتبات أشرح لك عناصر الراتب والاستقطاعات وحالة الصرف أو الاعتماد حسب الصلاحيات."
    }
    switch (context.domain) {
      case "sales":
        return "داخل دورة المبيعات أشرح لك الفرق بين طلب البيع، الفاتورة، اعتماد التسليم، التحصيل، والمرتجع."
      case "returns":
        return "داخل المرتجعات أشرح لك مرحلة الاعتماد الحالية ولماذا تم أو لم يتم التنفيذ."
      case "inventory":
        return "داخل المخزون أساعدك على فهم أثر الحركات المعلقة، النواقص، والارتباط بالفواتير والمرتجعات."
      case "accounting":
        return "داخل المحاسبة أوضح الأثر المحاسبي، القيود، والذمم المرتبطة بالعملية."
      case "governance":
        return "داخل الحوكمة أوضح من يستطيع ماذا، وما هي حدود الدور والفرع والمخزن."
      default:
        return "أربط لك سؤال الصفحة الحالية بالصلاحيات والبيانات الحية الموجودة داخل النظام."
    }
  }

  if (isPurchasePageKey(pageKey)) {
    return "Inside the purchase cycle, I can explain the difference between purchase orders, supplier bills, receipt or confirmation, payables, purchase returns, and vendor credits."
  }
  if (pageKey === "payments") {
    return "Inside payments, I can explain receipts, disbursements, invoice allocation, settlements, and accounting-period constraints."
  }
  if (isFixedAssetsPageKey(pageKey)) {
    return "Inside fixed assets, I can explain additions, depreciation, asset status, and accounting impact without posting anything."
  }
  if (isHRPageKey(pageKey)) {
    return "Inside HR and payroll, I can explain salary components, deductions, payment status, and approval constraints."
  }

  switch (context.domain) {
    case "sales":
      return "Inside the sales cycle, I can explain the difference between sales orders, invoices, delivery approval, collection, and returns."
    case "returns":
      return "Inside returns, I can explain the current approval stage and why execution did or did not happen."
    case "inventory":
      return "Inside inventory, I can help you understand pending movements, shortages, and links to invoices and returns."
    case "accounting":
      return "Inside accounting, I can explain accounting impact, journal behavior, and receivable implications."
    case "governance":
      return "Inside governance, I can clarify who can do what and how role, branch, and warehouse scope apply."
    default:
      return "I connect the current page question to real permissions and live ERP data."
  }
}

function boolAr(value: boolean) {
  return value ? "مسموح" : "غير مسموح"
}

function boolEn(value: boolean) {
  return value ? "allowed" : "not allowed"
}
