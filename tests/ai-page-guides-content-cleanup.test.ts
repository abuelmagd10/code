import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const migrationPath = path.resolve(
  process.cwd(),
  "supabase/migrations/20260428_001_ai_page_guides_content_cleanup.sql"
)

function readMigrationContent() {
  return readFileSync(migrationPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
}

describe("AI page guides content cleanup", () => {
  it("does not reintroduce raw internal shorthand into cleaned guide content", () => {
    const content = readMigrationContent()
    const bannedPatterns = [
      /\bGL\b/,
      /\bCOGS\b/,
      /\bFIFO\b/,
      /status=posted/i,
      /\bendpoint\b/i,
      /\brecord\b/i,
      /\bbranch_id\b/i,
      /\bwarehouse_id\b/i,
      /Soft Delete/i,
      /\bAP\b/,
      /\bAR\b/,
    ]

    for (const pattern of bannedPatterns) {
      expect(content).not.toMatch(pattern)
    }
  })

  it("keeps the cleanup content tied to existing page guide keys", () => {
    const content = readMigrationContent()

    expect(content).toContain("'dashboard'")
    expect(content).toContain("'invoices'")
    expect(content).toContain("'inventory'")
    expect(content).toContain("'income_statement'")
    expect(content).toContain("'manufacturing_production_order_detail'")
    expect(content).toContain("ON CONFLICT (page_key) DO UPDATE")
  })
})
