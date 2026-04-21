import { NextRequest, NextResponse } from "next/server"
import {
  explosionPreviewSchema,
  getManufacturingApiContext,
  handleManufacturingApiError,
  loadBomVersionSnapshot,
  parseJsonBody,
} from "@/lib/manufacturing/bom-api"

function isEffectiveAtDate(
  effectiveFrom: string | null,
  effectiveTo: string | null,
  asOfDate: string
) {
  const asOf = new Date(asOfDate).getTime()
  const fromOk = !effectiveFrom || new Date(effectiveFrom).getTime() <= asOf
  const toOk = !effectiveTo || asOf < new Date(effectiveTo).getTime()
  return fromOk && toOk
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, companyId } = await getManufacturingApiContext(request, "read")
    const payload = await parseJsonBody(request, explosionPreviewSchema)
    const snapshot = await loadBomVersionSnapshot(supabase, companyId, id)

    const asOfDate = payload.as_of_date || new Date().toISOString()
    const scaleFactor = payload.input_quantity / Number(snapshot.version.base_output_qty || 1)

    const componentLines = snapshot.lines.filter((line) => line.line_type === "component")
    const coProductLines = snapshot.lines.filter((line) => line.line_type === "co_product")
    const byProductLines = snapshot.lines.filter((line) => line.line_type === "by_product")

    const components = componentLines.map((line) => {
      const requiredQuantity = Number(line.quantity_per) * scaleFactor
      const grossRequiredQuantity = requiredQuantity * (1 + Number(line.scrap_percent || 0) / 100)

      let substitutes = payload.include_substitutes ? [...(line.substitutes || [])] : []
      if (payload.respect_effective_dates) {
        substitutes = substitutes.filter((substitute) =>
          isEffectiveAtDate(substitute.effective_from, substitute.effective_to, asOfDate)
        )
      }
      substitutes.sort((a, b) => Number(a.priority || 0) - Number(b.priority || 0))
      if (payload.substitute_strategy === "primary_only") {
        substitutes = substitutes.slice(0, 1)
      }
      if (payload.substitute_strategy === "none") {
        substitutes = []
      }

      return {
        line_id: line.id,
        line_no: line.line_no,
        component_product_id: line.component_product_id,
        component_name: line.product?.name || null,
        component_sku: line.product?.sku || null,
        line_type: line.line_type,
        quantity_per: Number(line.quantity_per),
        required_quantity: Number(requiredQuantity.toFixed(4)),
        scrap_percent: Number(line.scrap_percent || 0),
        gross_required_quantity: Number(grossRequiredQuantity.toFixed(4)),
        issue_uom: line.issue_uom,
        is_optional: Boolean(line.is_optional),
        substitutes: substitutes.map((substitute) => ({
          substitute_id: substitute.id,
          substitute_product_id: substitute.substitute_product_id,
          substitute_name: substitute.product?.name || null,
          substitute_sku: substitute.product?.sku || null,
          substitute_quantity: Number((Number(substitute.substitute_quantity) * scaleFactor).toFixed(4)),
          priority: substitute.priority,
          effective: !payload.respect_effective_dates || isEffectiveAtDate(substitute.effective_from, substitute.effective_to, asOfDate),
        })),
      }
    })

    const mapOutputLine = (line: any) => ({
      line_id: line.id,
      line_no: line.line_no,
      product_id: line.component_product_id,
      product_name: line.product?.name || null,
      product_sku: line.product?.sku || null,
      quantity_per: Number(line.quantity_per),
      output_quantity: Number((Number(line.quantity_per) * scaleFactor).toFixed(4)),
      notes: line.notes || null,
    })

    const warnings: string[] = []
    if (components.length === 0) {
      warnings.push("This BOM version has no component lines")
    }

    return NextResponse.json({
      success: true,
      data: {
        bom_id: snapshot.bom.id,
        bom_code: snapshot.bom.bom_code,
        bom_name: snapshot.bom.bom_name,
        bom_version_id: snapshot.version.id,
        version_no: snapshot.version.version_no,
        product_id: snapshot.bom.product_id,
        product_name: snapshot.productsById[snapshot.bom.product_id]?.name || null,
        product_sku: snapshot.productsById[snapshot.bom.product_id]?.sku || null,
        input_quantity: payload.input_quantity,
        base_output_qty: Number(snapshot.version.base_output_qty),
        scale_factor: Number(scaleFactor.toFixed(6)),
        as_of_date: asOfDate,
        components,
        co_products: payload.include_co_products ? coProductLines.map(mapOutputLine) : [],
        by_products: payload.include_by_products ? byProductLines.map(mapOutputLine) : [],
        warnings,
        limitations: [
          "Single-level explosion only",
          "No stock availability or reservation check",
          "No automatic substitute optimization",
          "Read-only preview without transactional effects",
        ],
      },
    })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}
