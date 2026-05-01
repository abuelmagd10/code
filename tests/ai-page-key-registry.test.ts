import { describe, expect, it } from "vitest"
import {
  AI_PAGE_KEY_REGISTRY,
  getGuideKeyForPageKey,
  getPageKeyEntry,
  getPageKeyFromRegistry,
} from "@/lib/ai/page-key-registry"

describe("AI page key registry", () => {
  it("maps high-priority uncovered routes to AI page keys", () => {
    expect(getPageKeyFromRegistry("/customer-credits")).toBe("customer_credits")
    expect(getPageKeyFromRegistry("/customer-credits/123")).toBe("customer_credits")
    expect(getPageKeyFromRegistry("/customer-refund-requests")).toBe("customer_refund_requests")
    expect(getPageKeyFromRegistry("/sales-return-requests")).toBe("sales_return_requests")
    expect(getPageKeyFromRegistry("/inventory/goods-receipt")).toBe("inventory_goods_receipt")
    expect(getPageKeyFromRegistry("/inventory/dispatch-approvals")).toBe("inventory_dispatch_approvals")
    expect(getPageKeyFromRegistry("/hr/attendance/daily")).toBe("attendance_daily")
    expect(getPageKeyFromRegistry("/settings/users")).toBe("settings_users")
  })

  it("keeps manufacturing page guide, context, and question-bank keys canonical", () => {
    const expected = [
      ["/manufacturing/boms", "manufacturing_boms"],
      ["/manufacturing/boms/123", "manufacturing_bom_detail"],
      ["/manufacturing/routings", "manufacturing_routings"],
      ["/manufacturing/routings/123", "manufacturing_routing_detail"],
      ["/manufacturing/production-orders", "manufacturing_production_orders"],
      ["/manufacturing/production-orders/123", "manufacturing_production_order_detail"],
    ] as const

    for (const [path, key] of expected) {
      expect(getPageKeyFromRegistry(path)).toBe(key)
      expect(getPageKeyEntry(key)?.domain).toBe("manufacturing")
      expect(getPageKeyEntry(key)?.questionBankModule).toBe("manufacturing")
      expect(getGuideKeyForPageKey(key)).toBe(key)
    }
  })

  it("keeps first Accounting rollout routes mapped to existing page keys", () => {
    expect(getPageKeyFromRegistry("/journal-entries/123")).toBe("journal")
    expect(getPageKeyFromRegistry("/chart-of-accounts")).toBe("chart_of_accounts")
    expect(getPageKeyFromRegistry("/reports/trial-balance")).toBe("trial_balance")

    expect(getPageKeyEntry("journal")?.domain).toBe("accounting")
    expect(getPageKeyEntry("chart_of_accounts")?.questionBankModule).toBe("accounting")
    expect(getGuideKeyForPageKey("trial_balance")).toBe("trial_balance")
  })

  it("keeps first Fixed Assets rollout routes mapped to existing page keys", () => {
    expect(getPageKeyFromRegistry("/fixed-assets")).toBe("fixed_assets")
    expect(getPageKeyFromRegistry("/fixed-assets/new")).toBe("fixed_assets")
    expect(getPageKeyFromRegistry("/fixed-assets/123")).toBe("fixed_assets")
    expect(getPageKeyFromRegistry("/fixed-assets/reports")).toBe("fixed_assets_reports")
    expect(getPageKeyFromRegistry("/fixed-assets/categories")).toBe("asset_categories")

    expect(getPageKeyEntry("fixed_assets")?.domain).toBe("fixed_assets")
    expect(getPageKeyEntry("fixed_assets")?.questionBankModule).toBe("fixedAssets")
    expect(getGuideKeyForPageKey("fixed_assets_reports")).toBe("fixed_assets")
  })

  it("has unique keys and route prefixes", () => {
    const keys = AI_PAGE_KEY_REGISTRY.map((entry) => entry.key)
    expect(new Set(keys).size).toBe(keys.length)

    const prefixes = AI_PAGE_KEY_REGISTRY.flatMap((entry) => entry.prefixes)
    expect(new Set(prefixes).size).toBe(prefixes.length)
  })

  it("documents intentionally excluded pages", () => {
    expect(getPageKeyFromRegistry("/auth/login")).toBeNull()
    expect(getPageKeyFromRegistry("/onboarding")).toBeNull()
    expect(getPageKeyFromRegistry("/admin/apply-governance")).toBeNull()
    expect(getPageKeyFromRegistry("/no-access")).toBeNull()
    expect(getPageKeyFromRegistry("/system-status")).toBeNull()
  })
})
