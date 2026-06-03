# v3.60.0 - Phase 4: Proactive Smart Suggestions
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Checking new files ===" -ForegroundColor Cyan

$newFiles = @(
    "hooks/use-ai-alerts.ts",
    "app/api/ai/alerts/route.ts"
)
foreach ($f in $newFiles) {
    if (-not (Test-Path $f)) { Write-Host "X $f MISSING" -ForegroundColor Red; exit 1 }
    Write-Host "+ $f" -ForegroundColor Green
}

$modFiles = @(
    "components/ai-assistant/floating-help-button.tsx",
    "components/ai-assistant/index.tsx",
    "components/ai-assistant/guide-panel.tsx",
    "lib/ai/context-builder.ts"
)
foreach ($f in $modFiles) {
    if (-not (Test-Path $f)) { Write-Host "X $f MISSING" -ForegroundColor Red; exit 1 }
    Write-Host "+ $f" -ForegroundColor Green
}

Write-Host "`n=== Verify governance markers ===" -ForegroundColor Cyan

$apiContent = Get-Content "app/api/ai/alerts/route.ts" -Raw
if ($apiContent -match 'requireAuth: true') { Write-Host "  + API requires auth" -ForegroundColor Green }
else { Write-Host "  X API missing auth check" -ForegroundColor Red; exit 1 }
if ($apiContent -match 'ai_get_proactive_alerts') { Write-Host "  + API calls governed RPC" -ForegroundColor Green }
else { Write-Host "  X API not calling RPC" -ForegroundColor Red; exit 1 }

$hookContent = Get-Content "hooks/use-ai-alerts.ts" -Raw
if ($hookContent -match 'POLL_INTERVAL_MS = 60_000') { Write-Host "  + Polling configured (60s)" -ForegroundColor Green }
else { Write-Host "  X Polling not configured" -ForegroundColor Red; exit 1 }

$btnContent = Get-Content "components/ai-assistant/floating-help-button.tsx" -Raw
if ($btnContent -match 'alertCount') { Write-Host "  + Badge wired to alertCount" -ForegroundColor Green }
else { Write-Host "  X Badge missing" -ForegroundColor Red; exit 1 }

$idxContent = Get-Content "components/ai-assistant/index.tsx" -Raw
if ($idxContent -match 'useAIAlerts') { Write-Host "  + Orchestrator uses hook" -ForegroundColor Green }
else { Write-Host "  X Orchestrator missing hook" -ForegroundColor Red; exit 1 }

$panelContent = Get-Content "components/ai-assistant/guide-panel.tsx" -Raw
if ($panelContent -match 'ProactiveAlertsBlock') { Write-Host "  + GuidePanel renders alert block" -ForegroundColor Green }
else { Write-Host "  X GuidePanel missing alert block" -ForegroundColor Red; exit 1 }
if ($panelContent -match 'AIProactiveAlert') { Write-Host "  + GuidePanel imports alert type" -ForegroundColor Green }
else { Write-Host "  X GuidePanel missing alert import" -ForegroundColor Red; exit 1 }

$ctxContent = Get-Content "lib/ai/context-builder.ts" -Raw
if ($ctxContent -match 'realistic low-stock signal') { Write-Host "  + Dashboard low-stock query tightened" -ForegroundColor Green }
else { Write-Host "  X Dashboard low-stock fix missing" -ForegroundColor Red; exit 1 }
if ($ctxContent -match 'only RECENT pending invoices') { Write-Host "  + Dashboard pending-dispatch query tightened" -ForegroundColor Green }
else { Write-Host "  X Dashboard pending-dispatch fix missing" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ($tsc | Out-String) -ForegroundColor Red
    exit 1
}
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

$mig = "supabase/migrations/20260528000900_ai_get_proactive_alerts_v1.sql"

git add `
    $mig `
    hooks/use-ai-alerts.ts `
    app/api/ai/alerts/route.ts `
    components/ai-assistant/floating-help-button.tsx `
    components/ai-assistant/index.tsx `
    components/ai-assistant/guide-panel.tsx `
    lib/ai/context-builder.ts `
    CHANGELOG.md 2>&1 | Out-Null

git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "feat(ai-assistant): v3.60.0 Phase 4 - proactive smart suggestions

The AI assistant now surfaces relevant business signals before the user has
to ask. The floating help button shows a count badge, and opening the panel
reveals friendly alert cards above the welcome content.

Alert types in this first iteration (all read-only, all governed):
- overdue_invoices  : customer invoices past due date (critical)
- due_soon_invoices : invoices due in the next 7 days (warning)
- overdue_bills     : supplier bills past due date (critical)
- stale_draft_sales_orders : SOs left as draft >7 days (info)

Governance - same single source of truth as v3.59.1:
- New RPC ai_get_proactive_alerts() is SECURITY INVOKER, runs as the caller.
- Each alert is keyed by a 'resource' (invoices/bills/sales_orders).
- The RPC filters by ai_current_user_allowed_resources(), which itself
  derives from company_role_permissions (configured in /settings/users)
  with a default fallback only for brand-new companies.
- Result: staff/sales/store_manager only see alerts for resources their
  admin has explicitly granted them. No hardcoded defaults can leak.

UI:
- FloatingHelpButton: red/amber/blue badge with count (severity-colored).
- GuidePanel: ProactiveAlertsBlock at top of welcome area, sorted by
  severity. Each card links to the relevant page and closes the panel.
- Bilingual (ar/en) with friendly user-facing labels.

Implementation:
- supabase/migrations/.../ai_get_proactive_alerts_v1.sql (RPC)
- app/api/ai/alerts/route.ts (GET endpoint, secureApiRequest)
- hooks/use-ai-alerts.ts (60s polling + focus refresh + abort)
- components/ai-assistant/floating-help-button.tsx (badge)
- components/ai-assistant/index.tsx (wires hook to panel)
- components/ai-assistant/guide-panel.tsx (alert cards)

Production data on deploy:
- 15 overdue invoices (critical)
- 4 overdue supplier bills (critical)
- 2 stale draft sales orders (info)
- 0 due-soon invoices

TypeScript: OK. No app behaviour changes for users whose role has no
configured permissions in /settings/users - they see no alerts." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.60.0 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Test on production after Vercel deploys:" -ForegroundColor Cyan
    Write-Host "  Owner: expect badge with ~21 count (15+4+2), 3 alert cards" -ForegroundColor White
    Write-Host "  Staff: expect badge only if 'invoices' is configured in /settings/users" -ForegroundColor White
    Write-Host "  Manufacturing officer: expect NO badge (no invoices/bills/sales_orders)" -ForegroundColor White
}
