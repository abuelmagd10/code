import { describe, expect, it } from "vitest"
import {
  bomSnapshotToDraftLines,
  buildProductLabel,
  canApproveVersion,
  canDeleteVersion,
  canRejectVersion,
  canSetDefaultVersion,
  canSubmitVersion,
  formatQuantity,
  getVersionStatusLabel,
  getVersionStatusVariant,
  isVersionHeaderEditable,
  isVersionStructureEditable,
  type BomLine,
  type BomVersionStatus,
} from "../lib/manufacturing/bom-ui"
import { getResourceFromPath } from "../lib/permissions-context"

describe("manufacturing BOM UI helpers", () => {
  it("maps version labels and badge variants consistently", () => {
    expect(getVersionStatusLabel("approved")).toBe("معتمد")
    expect(getVersionStatusLabel("pending_approval", "en")).toBe("Pending Approval")
    expect(getVersionStatusVariant("approved")).toBe("default")
    expect(getVersionStatusVariant("rejected")).toBe("destructive")
  })

  it("enforces the BOM version action matrix in the UI", () => {
    const statuses: BomVersionStatus[] = [
      "draft",
      "pending_approval",
      "approved",
      "rejected",
      "superseded",
      "archived",
    ]

    const expectations: Record<BomVersionStatus, {
      headerEditable: boolean
      structureEditable: boolean
      canSubmit: boolean
      canApprove: boolean
      canReject: boolean
      canDelete: boolean
    }> = {
      draft: {
        headerEditable: true,
        structureEditable: true,
        canSubmit: true,
        canApprove: false,
        canReject: false,
        canDelete: true,
      },
      pending_approval: {
        headerEditable: false,
        structureEditable: false,
        canSubmit: false,
        canApprove: true,
        canReject: true,
        canDelete: false,
      },
      approved: {
        headerEditable: false,
        structureEditable: false,
        canSubmit: false,
        canApprove: false,
        canReject: false,
        canDelete: false,
      },
      rejected: {
        headerEditable: true,
        structureEditable: true,
        canSubmit: true,
        canApprove: false,
        canReject: false,
        canDelete: true,
      },
      superseded: {
        headerEditable: false,
        structureEditable: false,
        canSubmit: false,
        canApprove: false,
        canReject: false,
        canDelete: false,
      },
      archived: {
        headerEditable: false,
        structureEditable: false,
        canSubmit: false,
        canApprove: false,
        canReject: false,
        canDelete: false,
      },
    }

    statuses.forEach((status) => {
      expect(isVersionHeaderEditable(status)).toBe(expectations[status].headerEditable)
      expect(isVersionStructureEditable(status)).toBe(expectations[status].structureEditable)
      expect(canSubmitVersion(status)).toBe(expectations[status].canSubmit)
      expect(canApproveVersion(status)).toBe(expectations[status].canApprove)
      expect(canRejectVersion(status)).toBe(expectations[status].canReject)
      expect(canDeleteVersion(status)).toBe(expectations[status].canDelete)
    })

    expect(canSetDefaultVersion("approved", false)).toBe(true)
    expect(canSetDefaultVersion("approved", true)).toBe(false)
    expect(canSetDefaultVersion("draft", false)).toBe(false)
  })

  it("hydrates structure draft lines from a BOM version snapshot payload", () => {
    const lines: BomLine[] = [
      {
        id: "line-1",
        company_id: "company-1",
        branch_id: "branch-1",
        bom_version_id: "version-1",
        line_no: 10,
        component_product_id: "product-1",
        line_type: "component",
        quantity_per: 2.5,
        scrap_percent: 4,
        issue_uom: "kg",
        is_optional: false,
        notes: "primary material",
        product: {
          id: "product-1",
          sku: "RM-001",
          name: "Raw Material 1",
          branch_id: "branch-1",
          item_type: "product",
        },
        substitutes: [
          {
            id: "sub-1",
            company_id: "company-1",
            branch_id: "branch-1",
            bom_line_id: "line-1",
            substitute_product_id: "product-2",
            substitute_quantity: 2.75,
            priority: 1,
            effective_from: "2026-04-21T08:00:00.000Z",
            effective_to: null,
            notes: "fallback option",
            product: {
              id: "product-2",
              sku: "RM-002",
              name: "Raw Material 2",
              branch_id: null,
              item_type: "product",
            },
          },
        ],
      },
    ]

    const result = bomSnapshotToDraftLines(lines)

    expect(result).toEqual([
      {
        line_no: 10,
        component_product_id: "product-1",
        line_type: "component",
        quantity_per: 2.5,
        scrap_percent: 4,
        issue_uom: "kg",
        is_optional: false,
        notes: "primary material",
        substitutes: [
          {
            substitute_product_id: "product-2",
            substitute_quantity: 2.75,
            priority: 1,
            effective_from: "2026-04-21T08:00:00.000Z",
            effective_to: "",
            notes: "fallback option",
          },
        ],
      },
    ])
  })

  it("formats product labels and quantity output predictably", () => {
    expect(buildProductLabel({ id: "p1", sku: "FG-001", name: "Finished Good" })).toBe("FG-001 — Finished Good")
    expect(buildProductLabel({ id: "p2", name: "Unnamed SKU" })).toBe("Unnamed SKU")
    expect(buildProductLabel(undefined)).toBe("—")
    expect(formatQuantity(12.34567)).toBe("12.3457")
  })

  it("maps manufacturing BOM routes to the correct guarded resource", () => {
    expect(getResourceFromPath("/manufacturing/boms")).toBe("manufacturing_boms")
    expect(getResourceFromPath("/manufacturing/boms/123?tab=structure")).toBe("manufacturing_boms")
  })
})
