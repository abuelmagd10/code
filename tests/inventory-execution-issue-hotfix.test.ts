import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

const issueHotfixSql = readFileSync(
  path.resolve(
    process.cwd(),
    "supabase/migrations/20260425000100_inventory_execution_issue_fifo_consumption_hotfix.sql"
  ),
  "utf8"
)

describe("Inventory execution issue hotfix regression guard", () => {
  it("writes the required fifo_lot_consumptions columns in the issue path", () => {
    expect(issueHotfixSql).toMatch(
      /INSERT INTO public\.fifo_lot_consumptions\s*\(\s*company_id,\s*lot_id,\s*product_id,\s*consumption_type,\s*reference_type,\s*reference_id,\s*quantity_consumed,\s*unit_cost,\s*total_cost,\s*consumption_date,\s*notes,\s*created_at/s
    )
  })

  it("uses production issue semantics for fifo lot consumptions", () => {
    expect(issueHotfixSql).toContain("'production_issue'")
    expect(issueHotfixSql).toContain("v_posted_at::DATE")
  })
})
