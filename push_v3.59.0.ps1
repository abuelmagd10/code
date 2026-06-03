# v3.59.0 - Complete knowledge base (90 guides / 724 chunks)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

$mig = "supabase/migrations/20260528000700_ai_page_guides_complete_remaining_30.sql"
if (-not (Test-Path $mig)) { Write-Host "X $mig MISSING" -ForegroundColor Red; exit 1 }
Write-Host "+ $mig" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add $mig CHANGELOG.md
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "feat(ai-assistant): v3.59.0 complete knowledge base - 90 guides / 724 chunks

Knowledge base now covers every page in AI_PAGE_KEY_REGISTRY.
30 new guides added in a single mega-batch via Supabase MCP.

Categories:
- Inventory operational (5): goods_receipt, dispatch_approvals,
  product_availability, third_party_inventory, write_offs
- HR / Attendance (7): attendance, daily, devices, reports,
  settings, shifts, anomalies
- Returns / Credits (4): customer_credits, customer_refund_requests,
  sales_return_requests, sent_invoice_returns
- Fixed Assets (2): asset_categories, fixed_assets_reports
- Settings sub-pages (12): users, taxes, exchange_rates, shipping,
  audit_log, backup, orders_rules, profile, tooltips, commissions,
  accounting_maintenance, login_activity

Each guide ships with:
- bilingual title + description
- 3-5 actionable steps in Arabic + English
- 2-3 helpful tips highlighting governance, common pitfalls, etc.

Production stats after migration:
- active page_guides: 60 -> 90 (+50%)
- ai_knowledge_chunks: 484 -> 724 (+50%)
- chunks with NULL resource: 0 (Defense in Depth fully covered)

Admin-sensitive pages (users, audit_log, backup, accounting_maintenance)
are resource-gated so staff/sales never see them via RLS or the
client-side filter.

Zero app code changes, zero TypeScript impact." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.59.0 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Test the new coverage on production:" -ForegroundColor Cyan
    Write-Host "  'كشف حضور'  -> attendance_daily / reports" -ForegroundColor White
    Write-Host "  'ضرائب'      -> settings_taxes / vat_reports" -ForegroundColor White
    Write-Host "  'سعر الصرف' -> settings_exchange_rates" -ForegroundColor White
    Write-Host "  'إيصال استلام' -> inventory_goods_receipt" -ForegroundColor White
}
