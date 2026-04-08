import type { SupabaseClient } from "@supabase/supabase-js"
import type { AIContextScope } from "@/lib/ai/contracts"
import type { AISettings, PageGuide } from "@/lib/page-guides"
import { fetchAISettings, fetchPageGuide } from "@/lib/page-guides"

export interface AICopilotContext {
  scope: AIContextScope
  language: "ar" | "en"
  settings: AISettings
  guide: PageGuide | null
  governanceSummary: string
}

export interface BuildAICopilotContextParams {
  supabase: SupabaseClient
  companyId: string
  userId: string
  role?: string | null
  branchId?: string | null
  costCenterId?: string | null
  warehouseId?: string | null
  pageKey?: string | null
  language: "ar" | "en"
}

export async function buildAICopilotContext(
  params: BuildAICopilotContextParams
): Promise<AICopilotContext> {
  const {
    supabase,
    companyId,
    userId,
    role,
    branchId,
    costCenterId,
    warehouseId,
    pageKey,
    language,
  } = params

  const [settings, guide] = await Promise.all([
    fetchAISettings(supabase, companyId),
    pageKey ? fetchPageGuide(supabase, pageKey, language) : Promise.resolve(null),
  ])

  const scope: AIContextScope = {
    companyId,
    userId,
    role: role || null,
    branchId: branchId || null,
    costCenterId: costCenterId || null,
    warehouseId: warehouseId || null,
    pageKey: pageKey || null,
  }

  return {
    scope,
    language,
    settings,
    guide,
    governanceSummary: buildGovernanceSummary(scope, language),
  }
}

export function buildGuideContextBlock(
  guide: PageGuide | null,
  language: "ar" | "en"
): string {
  if (!guide) {
    return language === "ar"
      ? "لا يوجد دليل صفحة محدد متاح لهذه الصفحة حالياً."
      : "No page-specific guide is available for this page yet."
  }

  const steps = guide.steps.length > 0
    ? guide.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")
    : language === "ar"
      ? "لا توجد خطوات محددة."
      : "No specific steps available."

  const tips = guide.tips.length > 0
    ? guide.tips.map((tip) => `- ${tip}`).join("\n")
    : language === "ar"
      ? "- لا توجد نصائح إضافية."
      : "- No additional tips."

  const accountingPattern = guide.accounting_pattern
    ? [
        `${language === "ar" ? "الحدث المالي" : "Financial event"}: ${guide.accounting_pattern.event}`,
        `${language === "ar" ? "القيود" : "Entries"}:`,
        ...guide.accounting_pattern.entries.map(
          (entry) =>
            `- ${entry.side === "debit" ? (language === "ar" ? "مدين" : "Dr") : (language === "ar" ? "دائن" : "Cr")}: ${entry.account}`
        ),
      ].join("\n")
    : language === "ar"
      ? "لا يوجد نمط محاسبي محدد لهذه الصفحة."
      : "No accounting pattern is defined for this page."

  return [
    `${language === "ar" ? "اسم الصفحة" : "Page"}: ${guide.title}`,
    `${language === "ar" ? "الوصف" : "Description"}: ${guide.description}`,
    `${language === "ar" ? "الخطوات" : "Steps"}:\n${steps}`,
    `${language === "ar" ? "النصائح" : "Tips"}:\n${tips}`,
    `${language === "ar" ? "النمط المحاسبي" : "Accounting pattern"}:\n${accountingPattern}`,
  ].join("\n\n")
}

function buildGovernanceSummary(
  scope: AIContextScope,
  language: "ar" | "en"
): string {
  if (language === "ar") {
    return [
      `الشركة: ${scope.companyId}`,
      `الدور: ${scope.role || "غير محدد"}`,
      `الفرع: ${scope.branchId || "غير محدد"}`,
      `مركز التكلفة: ${scope.costCenterId || "غير محدد"}`,
      `المخزن: ${scope.warehouseId || "غير محدد"}`,
      "يجب احترام الحوكمة الحالية والصلاحيات الفعلية للمستخدم.",
    ].join("\n")
  }

  return [
    `Company: ${scope.companyId}`,
    `Role: ${scope.role || "unknown"}`,
    `Branch: ${scope.branchId || "not set"}`,
    `Cost center: ${scope.costCenterId || "not set"}`,
    `Warehouse: ${scope.warehouseId || "not set"}`,
    "Current governance and user permissions must be respected at all times.",
  ].join("\n")
}
