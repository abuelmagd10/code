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
})
