import { createHash } from "node:crypto"
import type { AIToolCallAudit } from "@/lib/ai/contracts"
import type { AICopilotContext } from "@/lib/ai/context-builder"
import { buildGuideContextBlock } from "@/lib/ai/context-builder"

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

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
const OPENAI_DEFAULT_COPILOT_MODEL = "gpt-5.4-mini"
const OPENAI_DEFAULT_FALLBACK_MODEL = "gpt-4.1-mini"

interface ModelAttemptError {
  model: string
  status: number
  code: string | null
  message: string
}

export async function generateCopilotReply(params: {
  context: AICopilotContext
  messages: CopilotChatMessage[]
  userMessage: string
}): Promise<CopilotChatResult> {
  const { context, messages, userMessage } = params

  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    return buildFallbackResult(
      context,
      userMessage,
      context.language === "ar"
        ? "تعذر استخدام نموذج الذكاء الاصطناعي لأن مفتاح OPENAI_API_KEY غير مضبوط على الخادم. تم استخدام رد بديل آمن."
        : "The AI model could not be used because OPENAI_API_KEY is not configured on the server. A safe fallback response was used.",
      {
        toolName: "openai.config.missing_key",
        input: {
          envVar: "OPENAI_API_KEY",
        },
      },
      "missing_openai_api_key"
    )
  }

  const preferredModel =
    process.env.OPENAI_AI_COPILOT_MODEL?.trim() || OPENAI_DEFAULT_COPILOT_MODEL
  const fallbackModel =
    process.env.OPENAI_AI_COPILOT_FALLBACK_MODEL?.trim() ||
    OPENAI_DEFAULT_FALLBACK_MODEL
  const modelsToTry = Array.from(new Set([preferredModel, fallbackModel]))

  const instructions = buildInstructions(context)
  const input: OpenAIRequestInput = [
    {
      role: "system",
      content: [{ type: "input_text" as const, text: instructions }],
    },
    ...messages.map((message) => ({
      role: message.role,
      content: [{ type: "input_text" as const, text: message.content }],
    })),
  ]

  const attemptErrors: ModelAttemptError[] = []
  for (const model of modelsToTry) {
    const modelResult = await requestOpenAIResponses({
      apiKey,
      model,
      input,
    })

    if (modelResult.success) {
      const answer = extractResponseText(modelResult.data)
      return {
        answer,
        usedModel: model,
        fallbackUsed: false,
        fallbackReason: null,
        toolAudit: {
          toolName: "openai.responses.create",
          input: {
            model,
            messageCount: messages.length,
          },
          outputHash: createHash("sha256").update(answer).digest("hex"),
        },
      }
    }

    attemptErrors.push(modelResult.error)
    if (!shouldRetryWithAnotherModel(modelResult.error)) {
      break
    }
  }

  const latestError = attemptErrors[attemptErrors.length - 1]
  return buildFallbackResult(
    context,
    userMessage,
    buildUnavailableNotice(context.language, latestError),
    {
      toolName: "openai.responses.create",
      input: {
        attemptedModels: modelsToTry,
        latestError,
      },
    },
    latestError?.code || `openai_http_${latestError?.status || "unknown"}`
  )
}

type OpenAIRequestInput = Array<{
  role: "system" | "user" | "assistant"
  content: Array<{ type: "input_text"; text: string }>
}>

async function requestOpenAIResponses(params: {
  apiKey: string
  model: string
  input: OpenAIRequestInput
}): Promise<
  | { success: true; data: any }
  | { success: false; error: ModelAttemptError }
> {
  const { apiKey, model, input } = params

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input,
        max_output_tokens: 900,
      }),
    })

    if (response.ok) {
      return {
        success: true,
        data: await response.json(),
      }
    }

    const rawBody = await response.text()
    let parsedBody: any = null
    try {
      parsedBody = JSON.parse(rawBody)
    } catch {}

    const parsedCode = parsedBody?.error?.code
    const parsedMessage =
      parsedBody?.error?.message || parsedBody?.message || rawBody

    return {
      success: false,
      error: {
        model,
        status: response.status,
        code: typeof parsedCode === "string" ? parsedCode : null,
        message:
          typeof parsedMessage === "string" && parsedMessage.trim()
            ? parsedMessage.trim().slice(0, 1200)
            : `OpenAI request failed with status ${response.status}`,
      },
    }
  } catch (error: any) {
    return {
      success: false,
      error: {
        model,
        status: 0,
        code: "network_error",
        message:
          typeof error?.message === "string" && error.message.trim()
            ? error.message
            : "Network error while calling OpenAI",
      },
    }
  }
}

function shouldRetryWithAnotherModel(error: ModelAttemptError): boolean {
  if (error.status === 404) return true
  if (error.status === 400 && error.code === "model_not_found") return true
  return false
}

function buildUnavailableNotice(
  language: "ar" | "en",
  error?: ModelAttemptError
): string {
  if (!error) {
    return language === "ar"
      ? "تعذر الوصول إلى نموذج الذكاء الاصطناعي حالياً. تم استخدام رد بديل آمن."
      : "The AI model is currently unavailable. A safe fallback response was used."
  }

  if (error.status === 401 || error.status === 403) {
    return language === "ar"
      ? "تعذر استخدام نموذج الذكاء الاصطناعي لأن مفتاح OpenAI غير صالح أو غير مخوّل. تم استخدام رد بديل آمن."
      : "The AI model could not be used because the OpenAI key is invalid or unauthorized. A safe fallback response was used."
  }

  if (error.status === 429) {
    return language === "ar"
      ? "تعذر استخدام نموذج الذكاء الاصطناعي بسبب تجاوز حد الاستخدام أو المعدل. تم استخدام رد بديل آمن."
      : "The AI model could not be used due to usage or rate limits. A safe fallback response was used."
  }

  if (error.code === "model_not_found" || error.status === 404) {
    return language === "ar"
      ? `تعذر استخدام الموديل ${error.model} لأنه غير متاح للحساب الحالي. تم استخدام رد بديل آمن.`
      : `The model ${error.model} is not available for the current account. A safe fallback response was used.`
  }

  if (error.code === "network_error" || error.status === 0) {
    return language === "ar"
      ? "تعذر الوصول إلى OpenAI بسبب مشكلة اتصال من الخادم. تم استخدام رد بديل آمن."
      : "The server could not reach OpenAI due to a network error. A safe fallback response was used."
  }

  return language === "ar"
    ? "تعذر الوصول إلى نموذج الذكاء الاصطناعي حالياً. تم استخدام رد بديل آمن."
    : "The AI model is currently unavailable. A safe fallback response was used."
}

function buildInstructions(context: AICopilotContext): string {
  const isArabic = context.language === "ar"
  const guideBlock = buildGuideContextBlock(context.guide, context.language)

  return [
    isArabic
      ? "أنت مساعد ERP ذكي داخل نظام مؤسسي. دورك في هذه المرحلة هو الإرشاد والتفسير فقط."
      : "You are an intelligent ERP copilot inside an enterprise system. In this phase you are guidance-only and explanation-only.",
    isArabic
      ? "لا تنفذ أي عملية مالية أو مخزنية أو تعتمد أي طلب. لا تدّعِ أنك قمت بتعديل البيانات."
      : "Do not execute financial or inventory actions and do not approve anything. Never claim you changed data.",
    isArabic
      ? "إذا طلب المستخدم إجراءً تنفيذياً، اشرح له الخطوات داخل النظام ومن المسؤول المناسب."
      : "If the user asks for an action, explain the correct ERP steps and the responsible role.",
    isArabic
      ? "استخدم سياق الصفحة الحالية والدليل المتاح للإجابة. إذا لم تكن المعلومة مؤكدة فقل ذلك بوضوح."
      : "Use the current page context and the available guide to answer. If something is uncertain, say so clearly.",
    isArabic
      ? "أعطِ إجابات عملية ومباشرة وقابلة للتنفيذ داخل النظام الحالي."
      : "Give practical, direct answers that map to the current ERP system.",
    isArabic
      ? "التزم بحدود الحوكمة الحالية للمستخدم."
      : "Respect the user's current governance boundaries.",
    "",
    isArabic ? "سياق الحوكمة:" : "Governance context:",
    context.governanceSummary,
    "",
    isArabic ? "دليل الصفحة الحالي:" : "Current page guide:",
    guideBlock,
  ].join("\n")
}

function buildFallbackResult(
  context: AICopilotContext,
  userMessage: string,
  unavailableNotice?: string,
  toolAuditOverride?: Partial<AIToolCallAudit>,
  fallbackReason?: string | null
): CopilotChatResult {
  const isArabic = context.language === "ar"
  const guide = context.guide
  const steps = (guide?.steps || []).slice(0, 4)
  const tips = (guide?.tips || []).slice(0, 3)

  const answer = [
    unavailableNotice ||
      (isArabic
        ? "أعمل حالياً في وضع المساعد الآمن للقراءة فقط."
        : "I am currently operating in safe read-only copilot mode."),
    guide?.description
      ? guide.description
      : isArabic
        ? "يمكنني مساعدتك في شرح الصفحة الحالية والخطوات المتوقعة داخل النظام."
        : "I can help explain the current page and the expected ERP steps.",
    steps.length > 0
      ? [
          isArabic ? "الخطوات المقترحة:" : "Suggested steps:",
          ...steps.map((step, index) => `${index + 1}. ${step}`),
        ].join("\n")
      : "",
    tips.length > 0
      ? [
          isArabic ? "نصائح مهمة:" : "Important tips:",
          ...tips.map((tip) => `- ${tip}`),
        ].join("\n")
      : "",
    isArabic
      ? `سؤالك: ${userMessage}`
      : `Your question: ${userMessage}`,
    isArabic
      ? "إذا أردت، أعد صياغة السؤال بشكل أكثر تحديداً داخل نفس الصفحة وسأعطيك خطوات أدق."
      : "If you want, ask a more page-specific question and I will give more precise steps.",
  ]
    .filter(Boolean)
    .join("\n\n")

  return {
    answer,
    usedModel: "fallback",
    fallbackUsed: true,
    fallbackReason: fallbackReason || null,
    toolAudit: {
      toolName: toolAuditOverride?.toolName || "ai.fallback",
      input: toolAuditOverride?.input || {
        pageKey: context.scope.pageKey,
      },
      outputHash: createHash("sha256").update(answer).digest("hex"),
    },
  }
}

function extractResponseText(data: any): string {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim()
  }

  const output = Array.isArray(data?.output) ? data.output : []
  const textParts: string[] = []

  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : []
    for (const part of content) {
      if (typeof part?.text === "string" && part.text.trim()) {
        textParts.push(part.text.trim())
      }
    }
  }

  return textParts.join("\n\n").trim() || "No response returned."
}
