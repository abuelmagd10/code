# v3.56.5 - Governance gate for cross-page suggestions
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Verify cross-page-search.ts markers ===" -ForegroundColor Cyan
$cps = Get-Content "lib/ai/cross-page-search.ts" -Raw

$cpsChecks = @(
    @{ p = 'interface GovernanceContext';            m = "GovernanceContext interface present" },
    @{ p = 'allowedResources: Set<string>';          m = "allowedResources field" },
    @{ p = 'isFullAccess: boolean';                   m = "isFullAccess flag" },
    @{ p = 'resource: string \| null';                m = "PageSuggestion has resource field" },
    @{ p = 'governance\?: GovernanceContext';         m = "findRelevantPages accepts governance" },
    @{ p = 'governance && !governance\.isFullAccess'; m = "governance gate present in loop" },
    @{ p = 'governance\.allowedResources\.has'; m = "uses allowedResources for filtering" }
)

foreach ($c in $cpsChecks) {
    if ($cps -match $c.p) {
        Write-Host ("  + " + $c.m) -ForegroundColor Green
    } else {
        Write-Host ("  X " + $c.m + " -- pattern not found: " + $c.p) -ForegroundColor Red
        exit 1
    }
}

Write-Host "`n=== Verify find-page route markers ===" -ForegroundColor Cyan
$route = Get-Content "app/api/ai/find-page/route.ts" -Raw

$routeChecks = @(
    @{ p = 'buildGovernanceContext';                  m = "buildGovernanceContext function present" },
    @{ p = 'DEFAULT_ROLE_PAGES';                       m = "DEFAULT_ROLE_PAGES map present" },
    @{ p = 'company_role_permissions';                 m = "queries company_role_permissions" },
    @{ p = '"owner", "admin", "general_manager"';      m = "full-access role list correct" },
    @{ p = 'manager:';                                 m = "manager role mapped" },
    @{ p = 'accountant:';                              m = "accountant role mapped" },
    @{ p = 'staff:';                                   m = "staff role mapped" },
    @{ p = 'sales:';                                   m = "sales role mapped" },
    @{ p = 'employee:';                                m = "employee role mapped" }
)

foreach ($c in $routeChecks) {
    if ($route -match $c.p) {
        Write-Host ("  + " + $c.m) -ForegroundColor Green
    } else {
        Write-Host ("  X " + $c.m + " -- pattern not found: " + $c.p) -ForegroundColor Red
        exit 1
    }
}

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tscOutput = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "TypeScript errors:" -ForegroundColor Red
    Write-Host ($tscOutput | Out-String)
    exit 1
}
Write-Host "+ TypeScript: OK" -ForegroundColor Green

Write-Host "`n=== Cleanup stale git locks ===" -ForegroundColor Cyan
if (Test-Path ".git/index.lock") {
    Remove-Item ".git/index.lock" -Force
    Write-Host "  + Removed stale .git/index.lock" -ForegroundColor Green
} else {
    Write-Host "  + No stale lock" -ForegroundColor Green
}

Write-Host "`n=== Stage + commit ===" -ForegroundColor Cyan
git add lib/ai/cross-page-search.ts app/api/ai/find-page/route.ts CHANGELOG.md
git --no-pager diff --cached --stat
git commit -m "fix(ai-assistant): v3.56.5 governance gate for cross-page suggestions

Closes information-leakage gap discovered after v3.56.3:
The page_guides table has open RLS (auth.role() = 'authenticated'),
so staff/sales/accountant could see suggestions for restricted
pages (chart_of_accounts, payroll, journal_entries) - even if the
middleware blocks the actual navigation, exposing the title +
snippet still leaks domain knowledge.

lib/ai/cross-page-search.ts:
- Add 'resource' field to PageSuggestion (read from page-key-registry)
- Add GovernanceContext { role, allowedResources, isFullAccess }
- findRelevantPages accepts optional governance arg
- Inside the scoring loop: if governance is supplied AND user is
  not full-access AND resource is missing from allowedResources,
  skip the candidate entirely. Owner/Admin/GM bypass.

app/api/ai/find-page/route.ts:
- buildGovernanceContext() server-side helper:
  * Owner/Admin/General Manager -> isFullAccess: true
  * Other roles -> defaults from DEFAULT_ROLE_PAGES +
    company_role_permissions overrides
  * 'dashboard' always added (matches sidebar)
- DEFAULT_ROLE_PAGES mirrors lib/access-context.tsx exactly:
  manager, accountant, store_manager, manufacturing_officer,
  booking_officer, purchasing_officer, staff, sales, employee,
  viewer

Defense in depth: governance is enforced server-side only, the
client cannot bypass it by forging a request. Middleware still
blocks any direct navigation as a second layer.

Zero changes to: existing /api/ai/chat, page_guides RLS, DB
migrations, lib/ai/copilot-service.ts. TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.56.5 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "After Vercel rebuild, test:" -ForegroundColor Cyan
    Write-Host "  Owner account -> sees all suggestions (no change)" -ForegroundColor White
    Write-Host "  Staff/Sales account -> sees ONLY pages they can access" -ForegroundColor White
    Write-Host "  No suggestions for chart_of_accounts, payroll, etc. for non-accountants" -ForegroundColor White
}
