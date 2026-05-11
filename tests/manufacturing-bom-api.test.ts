import { describe, expect, it } from "vitest"
import {
  handleManufacturingApiError,
  isBomInputProductTypeAllowed,
  mapDbErrorToStatus,
} from "../lib/manufacturing/bom-api"

describe("manufacturing BOM API errors", () => {
  it("treats generic Postgres raise exceptions as validation errors", () => {
    expect(mapDbErrorToStatus({ code: "P0001" })).toBe(400)
  })

  it("returns a clear message when cloning would copy the owner product as a component", async () => {
    const response = handleManufacturingApiError({
      code: "P0001",
      message: "Owner product cannot be used as a direct component in the same BOM version. bom_version_id=abc, product_id=def",
    })

    expect(response.status).toBe(400)
    const payload = await response.json()
    expect(payload.details.code).toBe("BOM_OWNER_AS_COMPONENT")
    expect(payload.error).toContain("المنتج النهائي")
  })

  it("keeps approved effective-window conflicts as HTTP 409", async () => {
    const response = handleManufacturingApiError({
      code: "P0001",
      message: "Approved BOM version effective window overlaps another approved version. bom_id=abc",
    })

    expect(response.status).toBe(409)
    const payload = await response.json()
    expect(payload.details.code).toBe("BOM_APPROVED_EFFECTIVE_WINDOW_OVERLAP")
  })

  it("returns an Arabic validation message for empty BOM version approval submissions", async () => {
    const response = handleManufacturingApiError({
      code: "P0001",
      message: "BOM version must contain at least one line before approval submission. bom_version_id=abc",
    })

    expect(response.status).toBe(400)
    const payload = await response.json()
    expect(payload.details.code).toBe("BOM_VERSION_EMPTY_STRUCTURE")
    expect(payload.error).toContain("مكوّن واحد")
  })

  it("allows only raw materials as BOM component inputs", () => {
    expect(isBomInputProductTypeAllowed("raw_material")).toBe(true)
    expect(isBomInputProductTypeAllowed("purchased")).toBe(false)
    expect(isBomInputProductTypeAllowed("manufactured")).toBe(false)
    expect(isBomInputProductTypeAllowed("service")).toBe(false)
  })
})
