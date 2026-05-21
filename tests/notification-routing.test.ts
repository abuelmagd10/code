import { describe, expect, it } from "vitest"
import { getNotificationRoute } from "../lib/notification-routing"

describe("notification routing", () => {
  it("routes manufacturing warehouse approvals to inventory approval pages", () => {
    const approvalId = "11111111-1111-1111-1111-111111111111"

    expect(
      getNotificationRoute(
        "manufacturing_material_issue_approval",
        approvalId,
        `mmia_request_wm_${approvalId}`
      )
    ).toBe(`/inventory/dispatch-approvals/${approvalId}`)

    expect(getNotificationRoute("manufacturing_product_receive_approval", approvalId)).toBe(
      `/inventory/goods-receipt?type=manufacturing&approvalId=${approvalId}`
    )
  })

  // v3.15.0 — invoice ready for shipping notification must route to dispatch approvals
  it("routes invoice 'ready for shipping' notification to dispatch-approvals page", () => {
    const invoiceId = "22222222-2222-2222-2222-222222222222"

    // Old-style event_key (sent:)
    expect(getNotificationRoute("invoice", invoiceId, "invoice:sent:warehouse_manager")).toBe(
      `/inventory/dispatch-approvals?invoiceId=${invoiceId}`
    )

    // New-style event_key from sales-invoice-posting-command.service
    expect(
      getNotificationRoute("invoice", invoiceId, `sales:invoice:${invoiceId}:warehouse_dispatch_pending:role:warehouse_manager`)
    ).toBe(`/inventory/dispatch-approvals?invoiceId=${invoiceId}`)

    // Regular invoice (no dispatch event_key) still goes to /invoices/:id
    expect(getNotificationRoute("invoice", invoiceId)).toBe(`/invoices/${invoiceId}`)
    expect(getNotificationRoute("invoice", invoiceId, "invoice:created")).toBe(`/invoices/${invoiceId}`)
  })
})
