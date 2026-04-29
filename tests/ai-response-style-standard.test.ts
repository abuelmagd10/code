import { describe, expect, it } from "vitest"
import {
  buildEasySummary,
  buildResponseStyleInstructions,
} from "@/lib/ai/response-style-standard"

describe("AI response style standard", () => {
  it("defines the Arabic end-user explanation frame", () => {
    const standard = buildResponseStyleInstructions("ar")

    expect(standard).toContain("مستخدم أعمال")
    expect(standard).toContain("ما وظيفة هذا الشيء؟")
    expect(standard).toContain("لماذا هو موجود؟")
    expect(standard).toContain("ماذا يحدث بعد الحفظ أو الإرسال أو الاعتماد؟")
    expect(standard).toContain("خلاصة سهلة")
    expect(standard).toContain("لا تدّعِ تنفيذ أي عملية فعلية")
  })

  it("defines the English end-user explanation frame", () => {
    const standard = buildResponseStyleInstructions("en")

    expect(standard).toContain("business user")
    expect(standard).toContain("What is it for?")
    expect(standard).toContain("Why does it exist?")
    expect(standard).toContain("What happens after saving, submitting, or approving?")
    expect(standard).toContain("An easy summary")
    expect(standard).toContain("Never claim that you executed a real action")
  })

  it("keeps compact instructions bilingual and non-technical", () => {
    const arabic = buildResponseStyleInstructions("ar", "compact")
    const english = buildResponseStyleInstructions("en", "compact")

    expect(arabic).toContain("حوّله لمعناه للمستخدم")
    expect(arabic).toContain("خلاصة سهلة")
    expect(english).toContain("translate it into user meaning")
    expect(english).toContain("easy summary")
  })

  it("formats easy summaries consistently", () => {
    expect(buildEasySummary("ar", "راجع البيانات ثم احفظ.")).toBe(
      "خلاصة سهلة: راجع البيانات ثم احفظ."
    )
    expect(buildEasySummary("en", "Review the data, then save.")).toBe(
      "Easy summary: Review the data, then save."
    )
  })
})
