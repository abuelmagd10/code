import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  AI_FIELD_HELP_REGISTRY,
  buildFieldHelpContextBlock,
  getFieldHelpForPage,
  getFieldHelpItem,
} from "@/lib/ai/field-help-registry"

describe("AI field help registry", () => {
  it("keeps help item ids unique", () => {
    const ids = AI_FIELD_HELP_REGISTRY.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("provides bilingual field, button, status, and message help for invoices", () => {
    const invoiceHelp = getFieldHelpForPage("invoices")

    expect(invoiceHelp.some((item) => item.kind === "field")).toBe(true)
    expect(invoiceHelp.some((item) => item.kind === "button")).toBe(true)
    expect(invoiceHelp.some((item) => item.kind === "status")).toBe(true)
    expect(invoiceHelp.some((item) => item.kind === "message")).toBe(true)

    const customer = getFieldHelpItem("invoices.customer")
    expect(customer?.label.ar).toBe("العميل")
    expect(customer?.label.en).toBe("Customer")
    expect(customer?.summary.ar).toContain("اختيار العميل الصحيح")
    expect(customer?.summary.en).toContain("Choosing the right customer")
  })

  it("provides focused Sales rollout help for order and return request pages", () => {
    const salesOrderHelp = getFieldHelpForPage("sales_orders")
    const returnRequestHelp = getFieldHelpForPage("sales_return_requests")

    expect(salesOrderHelp.some((item) => item.id === "sales_orders.linked_invoices_tab")).toBe(true)
    expect(salesOrderHelp.some((item) => item.kind === "status")).toBe(true)
    expect(salesOrderHelp.some((item) => item.kind === "button")).toBe(true)

    expect(returnRequestHelp.some((item) => item.id === "sales_return_requests.management_approve_button")).toBe(true)
    expect(returnRequestHelp.some((item) => item.id === "sales_return_requests.warehouse_approve_button")).toBe(true)
    expect(returnRequestHelp.some((item) => item.kind === "status")).toBe(true)
  })

  it("provides focused Purchasing rollout help for order, bill, and return pages", () => {
    const purchaseOrderHelp = getFieldHelpForPage("purchase_orders")
    const billHelp = getFieldHelpForPage("bills")
    const purchaseReturnHelp = getFieldHelpForPage("purchase_returns")

    expect(purchaseOrderHelp.some((item) => item.id === "purchase_orders.create_bill_button")).toBe(true)
    expect(purchaseOrderHelp.some((item) => item.id === "purchase_orders.linked_bills_tab")).toBe(true)
    expect(purchaseOrderHelp.some((item) => item.kind === "status")).toBe(true)

    expect(billHelp.some((item) => item.id === "bills.add_payment_button")).toBe(true)
    expect(billHelp.some((item) => item.id === "bills.submit_return_button")).toBe(true)
    expect(billHelp.some((item) => item.kind === "status")).toBe(true)

    expect(purchaseReturnHelp.some((item) => item.id === "purchase_returns.admin_approve_button")).toBe(true)
    expect(purchaseReturnHelp.some((item) => item.id === "purchase_returns.warehouse_confirm_button")).toBe(true)
    expect(purchaseReturnHelp.some((item) => item.kind === "message")).toBe(true)
  })

  it("provides focused Inventory rollout help for availability, transfers, and stock pages", () => {
    const availabilityHelp = getFieldHelpForPage("product_availability")
    const transferHelp = getFieldHelpForPage("inventory_transfers")
    const inventoryHelp = getFieldHelpForPage("inventory")

    expect(availabilityHelp.some((item) => item.id === "product_availability.available_quantity")).toBe(true)
    expect(availabilityHelp.some((item) => item.id === "product_availability.search_button")).toBe(true)
    expect(availabilityHelp.some((item) => item.kind === "status")).toBe(true)

    expect(transferHelp.some((item) => item.id === "inventory_transfers.receive_button")).toBe(true)
    expect(transferHelp.some((item) => item.id === "inventory_transfers.source_warehouse")).toBe(true)
    expect(transferHelp.some((item) => item.kind === "message")).toBe(true)

    expect(inventoryHelp.some((item) => item.id === "inventory.movements_table")).toBe(true)
    expect(inventoryHelp.some((item) => item.id === "inventory.available_stock")).toBe(true)
    expect(inventoryHelp.some((item) => item.kind === "status")).toBe(true)
  })

  it("provides focused Accounting rollout help for journal, account chart, and trial balance pages", () => {
    const journalHelp = getFieldHelpForPage("journal")
    const chartHelp = getFieldHelpForPage("chart_of_accounts")
    const trialBalanceHelp = getFieldHelpForPage("trial_balance")

    expect(journalHelp.some((item) => item.id === "journal.debit_amount")).toBe(true)
    expect(journalHelp.some((item) => item.id === "journal.credit_amount")).toBe(true)
    expect(journalHelp.some((item) => item.id === "journal.edit_reason")).toBe(true)
    expect(journalHelp.some((item) => item.kind === "status")).toBe(true)

    expect(chartHelp.some((item) => item.id === "chart_of_accounts.account_code")).toBe(true)
    expect(chartHelp.some((item) => item.id === "chart_of_accounts.account_nature")).toBe(true)
    expect(chartHelp.some((item) => item.id === "chart_of_accounts.current_balance")).toBe(true)
    expect(chartHelp.some((item) => item.kind === "button")).toBe(true)

    expect(trialBalanceHelp.some((item) => item.id === "trial_balance.report_status")).toBe(true)
    expect(trialBalanceHelp.some((item) => item.id === "trial_balance.difference")).toBe(true)
    expect(trialBalanceHelp.some((item) => item.id === "trial_balance.export_csv_button")).toBe(true)
    expect(trialBalanceHelp.some((item) => item.kind === "message")).toBe(true)
  })

  it("provides focused Manufacturing rollout help for production order, material list, and routing detail pages", () => {
    const productionOrderHelp = getFieldHelpForPage("manufacturing_production_order_detail")
    const bomHelp = getFieldHelpForPage("manufacturing_bom_detail")
    const routingHelp = getFieldHelpForPage("manufacturing_routing_detail")

    expect(productionOrderHelp.some((item) => item.id === "manufacturing_production_order_detail.release_button")).toBe(true)
    expect(productionOrderHelp.some((item) => item.id === "manufacturing_production_order_detail.operations_table")).toBe(true)
    expect(productionOrderHelp.some((item) => item.kind === "message")).toBe(true)

    expect(bomHelp.some((item) => item.id === "manufacturing_bom_detail.components_table")).toBe(true)
    expect(bomHelp.some((item) => item.id === "manufacturing_bom_detail.approve_button")).toBe(true)
    expect(bomHelp.some((item) => item.id === "manufacturing_bom_detail.explosion_preview_button")).toBe(true)
    expect(bomHelp.some((item) => item.kind === "status")).toBe(true)

    expect(routingHelp.some((item) => item.id === "manufacturing_routing_detail.operations_table")).toBe(true)
    expect(routingHelp.some((item) => item.id === "manufacturing_routing_detail.work_center")).toBe(true)
    expect(routingHelp.some((item) => item.id === "manufacturing_routing_detail.activate_button")).toBe(true)
    expect(routingHelp.some((item) => item.kind === "status")).toBe(true)
  })

  it("builds user-facing context without raw internal terms", () => {
    const arabicBlock = buildFieldHelpContextBlock("invoices", "ar")
    const englishBlock = buildFieldHelpContextBlock("invoices", "en")

    expect(arabicBlock).toContain("مساعدة عناصر الصفحة")
    expect(arabicBlock).toContain("حقل: العميل")
    expect(englishBlock).toContain("Page element help")
    expect(englishBlock).toContain("Field: Customer")

    for (const pageKey of [
      "invoices",
      "sales_orders",
      "sales_return_requests",
      "purchase_orders",
      "bills",
      "purchase_returns",
      "product_availability",
      "inventory_transfers",
      "inventory",
      "journal",
      "chart_of_accounts",
      "trial_balance",
      "manufacturing_production_order_detail",
      "manufacturing_bom_detail",
      "manufacturing_routing_detail",
    ]) {
      const blocks = [
        buildFieldHelpContextBlock(pageKey, "ar", 80),
        buildFieldHelpContextBlock(pageKey, "en", 80),
      ]

      for (const block of blocks) {
        expect(block).not.toMatch(/\b(branch_id|warehouse_id|supplier_id|approval_status|transaction_type|quantity_change|journal_entry_lines|account_id|reference_id|normal_balance|debit_amount|credit_amount|bom_id|bom_version_id|routing_id|routing_version_id|issue_warehouse_id|receipt_warehouse_id|endpoint|record|status=posted|status=draft|FIFO|GL|AP)\b/i)
      }
    }
  })

  it("keeps Sales, Purchasing, Inventory, Accounting, and Manufacturing data-ai-help attributes backed by registry items", () => {
    const rolloutPages = [
      "app/invoices/new/page.tsx",
      "app/invoices/[id]/page.tsx",
      "app/sales-orders/[id]/page.tsx",
      "app/sales-return-requests/page.tsx",
      "app/purchase-orders/[id]/page.tsx",
      "app/bills/[id]/page.tsx",
      "app/purchase-returns/page.tsx",
      "app/inventory/product-availability/page.tsx",
      "app/inventory-transfers/[id]/page.tsx",
      "app/inventory/page.tsx",
      "app/journal-entries/[id]/page.tsx",
      "app/chart-of-accounts/ClientPage.tsx",
      "app/reports/trial-balance/page.tsx",
      "components/manufacturing/production-order/production-order-detail-page.tsx",
      "components/manufacturing/bom/bom-detail-page.tsx",
      "components/manufacturing/routing/routing-detail-page.tsx",
    ]

    const helpIds = rolloutPages.flatMap((pagePath) => {
      const source = readFileSync(join(process.cwd(), pagePath), "utf8")
      const literalIds = Array.from(source.matchAll(/data-ai-help="([^"]+)"/g)).map((match) => ({
        id: match[1],
        pagePath,
      }))
      const dynamicIds = Array.from(source.matchAll(/data-ai-help=\{([^}]+)\}/g)).flatMap((match) =>
        Array.from(match[1].matchAll(/"([^"]+)"/g)).map((idMatch) => ({
          id: idMatch[1],
          pagePath,
        }))
      )

      return [...literalIds, ...dynamicIds].filter(({ id }) => id.includes("."))
    })

    expect(helpIds.length).toBeGreaterThan(0)
    for (const { id, pagePath } of helpIds) {
      expect(getFieldHelpItem(id), `${id} in ${pagePath} should exist in AI_FIELD_HELP_REGISTRY`).toBeTruthy()
    }
  })
})
