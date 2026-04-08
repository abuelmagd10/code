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
  toolAudit: AIToolCallAudit
}

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"

export async function generateCopilotReply(params: {
  context: AICopilotContext
  messages: CopilotChatMessage[]
  userMessage: string
}): Promise<CopilotChatResult> {
  const { context, messages, userMessage } = params

  if (!process.env.OPENAI_API_KEY) {
    return buildFallbackResult(context, userMessage)
  }

  const model = process.env.OPENAI_AI_COPILOT_MODEL || "gpt-5.4-mini"
  const instructions = buildInstructions(context)
  const input = [
    {
      role: "system",
      content: [{ type: "input_text", text: instructions }],
    },
    ...messages.map((message) => ({
      role: message.role,
      content: [{ type: "input_text", text: message.content }],
    })),
  ]

  const body = {
    model,
    input,
    max_output_tokens: 900,
  }

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    return buildFallbackResult(
      context,
      userMessage,
      context.language === "ar"
        ? `تعذر الوصول إلى نموذج الذكاء الاصطناعي حالياً. تم استخدام رد بديل آمن.`
        : "The AI model is currently unavailable. A safe fallback response was used.",
      {
        toolName: "openai.responses.create",
        input: {
          model,
          error: errorText,
        },
      }
    )
  }

  const data = await response.json()
  const answer = extractResponseText(data)

  return {
    answer,
    usedModel: model,
    fallbackUsed: false,
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
  toolAuditOverride?: Partial<AIToolCallAudit>
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
