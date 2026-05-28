import { NextRequest, NextResponse } from "next/server"
import { secureApiRequest } from "@/lib/api-security-enhanced"
import { createClient } from "@/lib/supabase/server"
import {
  findRelevantPages,
  type GovernanceContext,
} from "@/lib/ai/cross-page-search"

/**
 * GET /api/ai/find-page?q=...&pageKey=...&language=ar|en
 *
 * Returns at most 3 page suggestions whose page_guides entries match
 * the user's query. The current page (pageKey) is excluded.
 *
 * Governance:
 *   - Owner / Admin / General Manager: see all pages.
 *   - Other roles: only pages whose `resource` is allowed for their role
 *     (defaults per-role + custom rows in company_role_permissions).
 *
 * Read-only. Respects RLS on page_guides + per-role permissions.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const security = await secureApiRequest(request, {
      requireAuth: true,
      requireCompany: true,
      supabase,
    })

    if (security.error) return security.error
    if (!security.user || !security.companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const query = (searchParams.get("q") || "").trim()
    const pageKey = searchParams.get("pageKey") || null
    const language = searchParams.get("language") === "en" ? "en" : "ar"

    if (!query) {
      return NextResponse.json({ success: true, matches: [] })
    }

    const governance = await buildGovernanceContext(
      supabase,
      security.companyId,
      security.user.id,
      security.member?.role || null
    )

    const matches = await findRelevantPages(
      supabase,
      query,
      pageKey,
      language,
      governance
    )

    return NextResponse.json({ success: true, matches })
  } catch (error: any) {
    console.error("[AI_FIND_PAGE][GET] Error:", error)
    return NextResponse.json(
      {
        error: error?.message || "Failed to search pages",
        matches: [],
      },
      { status: 500 }
    )
  }
}

/**
 * Build the GovernanceContext used to filter cross-page suggestions.
 *
 * Mirrors the access-context.tsx role logic on the server side:
 *   1. Full-access roles (owner/admin/general_manager) bypass the filter.
 *   2. Other roles get a default page set + customizations from
 *      company_role_permissions (can_access = true/false).
 */
async function buildGovernanceContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  userId: string,
  cachedRole: string | null
): Promise<GovernanceContext> {
  const role = String(cachedRole || "").trim().toLowerCase()
  const isFullAccess = ["owner", "admin", "general_manager"].includes(role)

  if (isFullAccess) {
    return {
      role,
      isFullAccess: true,
      allowedResources: new Set<string>(),
    }
  }

  const allowedResources = new Set<string>(
    DEFAULT_ROLE_PAGES[role] ?? []
  )

  try {
    const { data: permissions } = await supabase
      .from("company_role_permissions")
      .select("resource, can_access")
      .eq("company_id", companyId)
      .eq("role", role)

    if (Array.isArray(permissions)) {
      for (const perm of permissions as Array<{
        resource?: string | null
        can_access?: boolean | null
      }>) {
        if (!perm?.resource) continue
        if (perm.can_access === false) {
          allowedResources.delete(perm.resource)
        } else if (perm.can_access === true) {
          allowedResources.add(perm.resource)
        }
      }
    }
  } catch {
    // Silent: fall back to defaults only.
  }

  allowedResources.add("dashboard")

  return {
    role,
    isFullAccess: false,
    allowedResources,
  }
}

const DEFAULT_ROLE_PAGES: Record<string, string[]> = {
  manager: [
    "dashboard", "reports", "invoices", "customers", "estimates",
    "sales_orders", "sales_returns", "sent_invoice_returns",
    "customer_debit_notes", "bills", "suppliers", "purchase_orders",
    "purchase_returns", "vendor_credits", "manufacturing_boms",
    "products", "inventory", "inventory_transfers", "write_offs",
    "third_party_inventory", "product_availability",
    "inventory_goods_receipt", "payments", "expenses", "drawings",
    "journal_entries", "banking", "chart_of_accounts", "fixed_assets",
    "asset_categories", "fixed_assets_reports", "annual_closing",
    "hr", "employees", "attendance", "payroll", "instant_payouts",
    "branches", "cost_centers", "warehouses",
  ],
  accountant: [
    "dashboard", "reports", "invoices", "customers", "sales_returns",
    "customer_debit_notes", "bills", "suppliers", "purchase_returns",
    "vendor_credits", "payments", "expenses", "drawings",
    "journal_entries", "chart_of_accounts", "banking", "annual_closing",
    "accounting_periods", "shareholders", "fixed_assets",
    "asset_categories", "fixed_assets_reports", "taxes",
    "exchange_rates", "accounting_maintenance", "products", "inventory",
    "inventory_transfers", "write_offs", "third_party_inventory",
    "product_availability", "inventory_goods_receipt",
  ],
  store_manager: [
    "dashboard", "manufacturing_boms", "products", "inventory",
    "product_availability", "inventory_transfers",
    "third_party_inventory", "write_offs", "inventory_goods_receipt",
    "purchase_orders", "sales_orders", "shipping",
  ],
  manufacturing_officer: [
    "dashboard", "manufacturing_boms", "products", "inventory",
    "product_availability", "reports",
  ],
  booking_officer: [
    "dashboard", "bookings", "services", "customers", "payments",
    "reports",
  ],
  purchasing_officer: [
    "dashboard", "reports", "bills", "suppliers", "purchase_orders",
    "purchase_returns", "vendor_credits", "payments", "expenses",
    "drawings", "journal_entries", "chart_of_accounts", "banking",
    "annual_closing", "accounting_periods", "shareholders",
    "fixed_assets", "asset_categories", "fixed_assets_reports",
    "taxes", "exchange_rates", "accounting_maintenance", "products",
    "inventory", "inventory_transfers", "inventory_goods_receipt",
    "product_availability", "write_offs", "third_party_inventory",
  ],
  staff: [
    "dashboard", "customers", "estimates", "sales_orders", "invoices",
    "inventory", "product_availability", "attendance",
  ],
  sales: [
    "dashboard", "customers", "estimates", "sales_orders", "invoices",
    "product_availability",
  ],
  employee: [
    "dashboard", "attendance",
  ],
  viewer: [
    "dashboard", "reports",
  ],
}
