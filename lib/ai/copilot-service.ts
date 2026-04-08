import { createHash } from "node:crypto"
import type { AIToolCallAudit } from "@/lib/ai/contracts"
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
  toolAudit: AIToolCallAudit
}

interface IntentAnalysis {
  askWorkflow: boolean
  askReport: boolean
  askGovernance: boolean
  askAccounting: boolean
  askAction: boolean
}

const LOCAL_COPILOT_MODEL = "local-erp-copilot-v1"

export async function generateCopilotReply(params: {
  context: AICopilotContext
  messages: CopilotChatMessage[]
  userMessage: string
}): Promise<CopilotChatResult> {
  const { context, messages, userMessage } = params

  const intents = analyzeIntent(userMessage, context.language)
  const sections = [
    buildLead(context, userMessage),
    buildLiveSummarySection(context, intents),
    buildWorkflowSection(context, intents),
    buildGovernanceSection(context, intents),
    buildAccountingSection(context, intents),
    buildActionGuardSection(context, intents),
    buildNextStepsSection(context),
  ].filter(Boolean)

  if (sections.length === 0 || (!context.guide && context.liveContext.metrics.length === 0)) {
    return buildFallbackResult(context, userMessage, "limited_local_context")
  }

  const answer = sections.join("\n\n")
  return {
    answer,
    usedModel: LOCAL_COPILOT_MODEL,
    fallbackUsed: false,
    fallbackReason: null,
    toolAudit: {
      toolName: "ai.local_copilot.generate",
      input: {
        pageKey: context.scope.pageKey,
        domain: context.domain,
        intent: intents,
        metricsCount: context.liveContext.metrics.length,
        messageCount: messages.length,
      },
      outputHash: createHash("sha256").update(answer).digest("hex"),
    },
  }
}

function analyzeIntent(message: string, language: "ar" | "en"): IntentAnalysis {
  const text = message.toLowerCase()
  const workflowWords =
    language === "ar"
      ? ["اشرح", "خطوات", "كيف", "طريقة", "مسار", "اعمل", "تنفيذ", "استخدام"]
      : ["explain", "steps", "how", "workflow", "process", "use", "operate"]
  const reportWords =
    language === "ar"
      ? ["تقرير", "ملخص", "أرقام", "احص", "مؤشر", "حالة", "وضع", "إحصاء"]
      : ["report", "summary", "numbers", "metrics", "status", "overview", "dashboard"]
  const governanceWords =
    language === "ar"
      ? ["صلاح", "دور", "اعتماد", "موافقة", "رفض", "من يقدر", "من يمكن", "حوكمة"]
      : ["permission", "role", "approval", "approve", "reject", "governance", "who can"]
  const accountingWords =
    language === "ar"
      ? ["محاسب", "محاسبي", "قيد", "قيود", "ذمم", "حساب", "دفتر"]
      : ["accounting", "journal", "entry", "ledger", "receivable", "payable", "account"]
  const actionWords =
    language === "ar"
      ? ["نفذ", "أنشئ", "اعتمد", "ارفض", "احذف", "عدّل", "رحّل"]
      : ["execute", "create", "approve", "reject", "delete", "update", "post"]

  return {
    askWorkflow: includesAny(text, workflowWords) || !includesAny(text, reportWords),
    askReport: includesAny(text, reportWords),
    askGovernance: includesAny(text, governanceWords),
    askAccounting: includesAny(text, accountingWords),
    askAction: includesAny(text, actionWords),
  }
}

function buildLead(context: AICopilotContext, userMessage: string) {
  const title = context.guide?.title
  if (context.language === "ar") {
    return [
      title ? `أعمل الآن عبر المساعد المحلي المجاني داخل صفحة ${title}.` : "أعمل الآن عبر المساعد المحلي المجاني داخل النظام.",
      context.liveContext.summary,
      `سؤالك الحالي: ${userMessage}`,
    ].join("\n")
  }

  return [
    title
      ? `I am answering through the free local copilot inside the ${title} page.`
      : "I am answering through the free local copilot inside the ERP.",
    context.liveContext.summary,
    `Current question: ${userMessage}`,
  ].join("\n")
}

function buildLiveSummarySection(
  context: AICopilotContext,
  intents: IntentAnalysis
) {
  if (!intents.askReport && context.domain !== "dashboard") return ""
  if (context.liveContext.metrics.length === 0) return ""

  const header = context.language === "ar" ? "ملخص حي من النظام:" : "Live ERP summary:"
  const rows = context.liveContext.metrics
    .slice(0, 7)
    .map((item) => `- ${item.label}: ${item.value}`)
    .join("\n")

  const alerts =
    context.liveContext.alerts.length > 0
      ? [
          context.language === "ar" ? "تنبيهات حالية:" : "Current alerts:",
          ...context.liveContext.alerts.map((alert) => `- ${alert}`),
        ].join("\n")
      : ""

  return [header, rows, alerts].filter(Boolean).join("\n")
}

function buildWorkflowSection(
  context: AICopilotContext,
  intents: IntentAnalysis
) {
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
  intents: IntentAnalysis
) {
  if (!intents.askGovernance && context.domain !== "governance" && context.domain !== "returns") {
    return ""
  }

  const permission = context.permissionSnapshot
  const capabilityLine =
    context.language === "ar"
      ? `صلاحياتك الحالية على ${permission.resource || "هذه الصفحة"}: قراءة ${boolAr(permission.canRead)}, كتابة ${boolAr(permission.canWrite)}, تحديث ${boolAr(permission.canUpdate)}, حذف ${boolAr(permission.canDelete)}.`
      : `Your current permissions on ${permission.resource || "this page"}: read ${boolEn(permission.canRead)}, write ${boolEn(permission.canWrite)}, update ${boolEn(permission.canUpdate)}, delete ${boolEn(permission.canDelete)}.`

  const domainRule = buildDomainRule(context)
  return [capabilityLine, domainRule].filter(Boolean).join("\n")
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

function buildAccountingSection(
  context: AICopilotContext,
  intents: IntentAnalysis
) {
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

function buildActionGuardSection(
  context: AICopilotContext,
  intents: IntentAnalysis
) {
  if (!intents.askAction) return ""

  return context.language === "ar"
    ? "تنبيه حوكمة: أستطيع شرح الإجراء فقط، لكن لا يمكنني تنفيذ إنشاء أو اعتماد أو ترحيل أو حذف من داخل هذا الموديول المحلي."
    : "Governance note: I can explain the action, but I cannot execute creation, approval, posting, or deletion from this local module."
}

function buildNextStepsSection(context: AICopilotContext) {
  if (context.liveContext.suggestions.length === 0) return ""

  return [
    context.language === "ar" ? "الخطوة التالية الأنسب:" : "Best next step:",
    ...context.liveContext.suggestions.slice(0, 2).map((item) => `- ${item}`),
  ].join("\n")
}

function buildFallbackResult(
  context: AICopilotContext,
  userMessage: string,
  fallbackReason: string
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

function includesAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word))
}

function boolAr(value: boolean) {
  return value ? "مسموح" : "غير مسموح"
}

function boolEn(value: boolean) {
  return value ? "allowed" : "not allowed"
}
