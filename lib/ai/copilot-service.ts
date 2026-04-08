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

  const sections = [
    buildLead(context, intents),
    buildCapabilitiesSection(context, intents),
    buildLiveSummarySection(context, intents, interactivePayload),
    buildWorkflowSection(context, intents),
    buildGovernanceSection(context, intents, interactivePayload),
    buildAccountingSection(context, intents),
    buildPredictionSection(context, intents, interactivePayload),
    buildActionGuardSection(context, intents),
    buildNextStepsSection(context, intents, interactivePayload),
  ].filter(Boolean)

  if (
    sections.length === 0 ||
    (!context.guide && interactivePayload.metrics.length === 0 && interactivePayload.insights.length === 0)
  ) {
    return buildFallbackResult(context, userMessage, "limited_local_context", interactivePayload)
  }

  const answer = sections.join("\n\n")
  return {
    answer,
    usedModel: LOCAL_COPILOT_MODEL,
    fallbackUsed: false,
    fallbackReason: null,
    interactivePayload,
    toolAudit: {
      toolName: "ai.local_copilot.generate",
      input: {
        pageKey: context.scope.pageKey,
        domain: context.domain,
        intent: intents,
        metricsCount: interactivePayload.metrics.length,
        messageCount: messages.length,
        insightsCount: interactivePayload.insights.length,
        predictionsCount: interactivePayload.predictedActions.length,
      },
      outputHash: createHash("sha256").update(answer).digest("hex"),
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

function analyzeIntent(message: string, language: "ar" | "en"): IntentAnalysis {
  const text = normalizeIntentText(message)
  const workflowWords =
    language === "ar"
      ? ["اشرح", "خطوات", "كيف", "طريقه", "مسار", "اعمل", "تنفيذ", "استخدام", "شرح", "العمل"]
      : ["explain", "steps", "how", "workflow", "process", "use", "operate"]
  const reportWords =
    language === "ar"
      ? ["تقرير", "ملخص", "ارقام", "احص", "مؤشر", "حاله", "وضع", "احصاء", "لوحه"]
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
      ? ["خطا", "ناقصه", "ناقص", "اكتمال", "تحقق", "مشكله", "مراجعه", "تحذير"]
      : ["error", "missing", "incomplete", "validate", "issue", "review", "warning"]
  const capabilityWords =
    language === "ar"
      ? ["امكاني", "اكني", "قدرات", "تستطيع", "تقدر", "ماذا تفعل", "كيف تساعد", "ساعدني", "مساعدتك", "فهم العمل", "شرح التطبيق"]
      : ["capabilities", "what can you do", "how can you help", "help me", "assist", "support"]
  const greetingWords =
    language === "ar"
      ? ["السلام", "مرحبا", "اهلا", "اهلن", "صباح الخير", "مساء الخير", "مساء النور", "هاي", "السلام عليكم"]
      : ["hello", "hi", "good morning", "good evening", "hey"]

  const askGreeting = includesAny(text, greetingWords)
  const askCapabilities = includesAny(text, capabilityWords)
  const askWorkflow = includesAny(text, workflowWords)
  const askReport = includesAny(text, reportWords)
  const askGovernance = includesAny(text, governanceWords)
  const askAccounting = includesAny(text, accountingWords)
  const askAction = includesAny(text, actionWords)
  const askPrediction = includesAny(text, predictionWords)
  const askValidation = includesAny(text, validationWords)

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
  }
}

function buildLead(context: AICopilotContext, intents: IntentAnalysis) {
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
    if (intents.askGreeting && isPureGreetingIntent(intents)) {
      return [
        "مساء النور. أنا المساعد المحلي التفاعلي داخل التطبيق.",
        title ? `أنا موجود الآن داخل ${pageLabel}.` : "أستطيع إرشادك داخل الصفحة الحالية حسب السياق المتاح.",
      ].join("\n")
    }

    if (intents.askCapabilities) {
      return `أستطيع مساعدتك في فهم العمل داخل ${pageLabel} اعتمادًا على دليل الصفحة، صلاحياتك الحالية، وبيانات النظام الحية.`
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

  if (intents.askGreeting && isPureGreetingIntent(intents)) {
    return [
      "Hello. I am the interactive local copilot inside the ERP.",
      title ? `I am currently focused on ${pageLabel}.` : "I can guide you inside the current page using local context.",
    ].join("\n")
  }

  if (intents.askCapabilities) {
    return `I can help you understand the work on ${pageLabel} using the page guide, your current permissions, and live ERP data.`
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

function buildLiveSummarySection(
  context: AICopilotContext,
  intents: IntentAnalysis,
  payload: AICopilotInteractivePayload
) {
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

function buildWorkflowSection(context: AICopilotContext, intents: IntentAnalysis) {
  if (!intents.askWorkflow) return ""
  if (!context.guide) return ""

  const steps = context.guide.steps.slice(0, 5)
  const tips = context.guide.tips.slice(0, 3)
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
  const blockers =
    payload.nextActions.length > 0
      ? [
          context.language === "ar" ? "أفضل إجراء مسموح لك الآن:" : "Best allowed next action right now:",
          `- ${payload.nextActions[0].title}: ${payload.nextActions[0].summary}`,
        ].join("\n")
      : ""

  return [capabilityLine, domainRule, blockers].filter(Boolean).join("\n")
}

function buildDomainRule(context: AICopilotContext) {
  if (context.language === "ar") {
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

  return dedupeByLabel(prompts).slice(0, 5)
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
    !intents.askValidation
  )
}

function buildDomainCapabilityLine(context: AICopilotContext) {
  if (context.language === "ar") {
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
