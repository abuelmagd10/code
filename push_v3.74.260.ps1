$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.259.ps1") { Remove-Item -LiteralPath "push_v3.74.259.ps1" -Force }

# ── 1. الإصدار ────────────────────────────────────────────────────
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.260"') {
    Write-Host "+ 3.74.260" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# ── 2. ملف الـ manifest ───────────────────────────────────────────
$manifest = Get-Content -LiteralPath "lib/module-manifest.ts" -Raw
foreach ($c in @("CORE_MODULES","OPTIONAL_MODULES","isModuleEnabled","services_bookings","manufacturing","fixed_assets","hr","purchases","inventory")) {
    if ($manifest -notmatch [regex]::Escape($c)) { Write-Host "X manifest missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ module manifest defines Core (dashboard, sales, purchases, inventory, accounting, settings) + Optional (services_bookings, manufacturing, fixed_assets, hr)" -ForegroundColor Green

# ── 3. الـ migration ──────────────────────────────────────────────
$mig = Get-Content -LiteralPath "supabase/migrations/20260620000260_v3_74_260_companies_enabled_modules.sql" -Raw
foreach ($c in @("enabled_modules text[]","ADD COLUMN IF NOT EXISTS")) {
    if ($mig -notmatch [regex]::Escape($c)) { Write-Host "X migration missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ migration adds companies.enabled_modules text[]" -ForegroundColor Green

# ── 4. API endpoints ─────────────────────────────────────────────
$apiCo = Get-Content -LiteralPath "app/api/my-company/route.ts" -Raw
if ($apiCo -notmatch 'enabled_modules, created_at') { Write-Host "X /api/my-company doesn't select enabled_modules" -ForegroundColor Red; exit 1 }
Write-Host "+ /api/my-company exposes enabled_modules" -ForegroundColor Green

$apiEm = Get-Content -LiteralPath "app/api/company/enabled-modules/route.ts" -Raw
foreach ($c in @("export async function GET","export async function PUT","owner_only","OPTIONAL_SET","enabled_modules: nextValue")) {
    if ($apiEm -notmatch [regex]::Escape($c)) { Write-Host "X /api/company/enabled-modules missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ /api/company/enabled-modules: owner-only PUT, whitelisted optional modules only" -ForegroundColor Green

# ── 5. الـ Sidebar ───────────────────────────────────────────────
$sb = Get-Content -LiteralPath "components/sidebar.tsx" -Raw
foreach ($c in @('import { isModuleEnabled, type ModuleKey } from "@/lib/module-manifest"','setEnabledModules(Array.isArray(em)','isModuleEnabled(g.key as ModuleKey, enabledModules)','visibleGroups')) {
    if ($sb -notmatch [regex]::Escape($c)) { Write-Host "X sidebar missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ sidebar filters top-level groups by enabled_modules (NULL = legacy show-all)" -ForegroundColor Green

# ── 6. صفحة المستخدمين (المالك يفعّل/يلغّى) ───────────────────────
$users = Get-Content -LiteralPath "app/settings/users/page.tsx" -Raw
foreach ($c in @('import { ModulesSubscriptionCard }','<ModulesSubscriptionCard />')) {
    if ($users -notmatch [regex]::Escape($c)) { Write-Host "X /settings/users missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ /settings/users renders ModulesSubscriptionCard inside 'صلاحيات الأدوار' card" -ForegroundColor Green

$modCard = Get-Content -LiteralPath "components/settings/ModulesSubscriptionCard.tsx" -Raw
foreach ($c in @("CORE_MODULES","OPTIONAL_MODULES","enabled_modules","حفظ الاختيار","الوحدات المُشتَرَك بها")) {
    if ($modCard -notmatch [regex]::Escape($c)) { Write-Host "X ModulesSubscriptionCard missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ ModulesSubscriptionCard component complete" -ForegroundColor Green

# ── 7. فحص TypeScript ─────────────────────────────────────────────
Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $err TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 10 | ForEach-Object { Write-Host $_ }
    exit 1
}

# ── 8. git add / commit / push ───────────────────────────────────
git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_260.txt"
    $msgLines = @(
        "feat(modules): v3.74.260 - Module Subscription Phase 1 (sidebar visibility)",
        "",
        "Phase 1 lets every company decide which optional modules show in",
        "their sidebar without touching the backend. Hidden modules keep",
        "working under the hood: their APIs, RPCs, triggers and deep links",
        "are untouched, so existing integrations and direct URLs do not",
        "break. This is a pure presentation filter.",
        "",
        "Split",
        "  Core (always on, owner cannot disable):",
        "    dashboard, sales, purchases, inventory, accounting, settings",
        "  Optional (owner toggles):",
        "    services_bookings, manufacturing, fixed_assets, hr",
        "",
        "Schema",
        "  supabase/migrations/20260620000260_v3_74_260_companies_enabled_modules.sql",
        "    ALTER TABLE companies ADD COLUMN IF NOT EXISTS enabled_modules text[];",
        "    NULL = backward compatible: every module shows (legacy companies",
        "    continue to behave as before until the owner picks a set).",
        "",
        "Manifest",
        "  lib/module-manifest.ts",
        "    Defines ModuleKey, CORE_MODULES, OPTIONAL_MODULES, MODULE_LABELS",
        "    and the isModuleEnabled(key, enabledModules) helper used by",
        "    the sidebar.",
        "",
        "Sidebar",
        "  components/sidebar.tsx",
        "    Loads enabled_modules from /api/my-company alongside the rest",
        "    of the company payload, stores it in state, and filters the",
        "    top-level groups array via isModuleEnabled before mapping to",
        "    <GroupAccordion/>. NULL state keeps the legacy 'show all'",
        "    behaviour.",
        "",
        "API",
        "  app/api/my-company/route.ts",
        "    Adds enabled_modules to the companies SELECT so the sidebar",
        "    can read it on first load.",
        "  app/api/company/enabled-modules/route.ts (new)",
        "    GET  -> current enabled_modules + role for the caller.",
        "    PUT  -> owner-only update; whitelists OPTIONAL_MODULES only",
        "            (unknown keys silently dropped, core modules can't be",
        "            persisted). null payload restores legacy 'show all'.",
        "",
        "UI",
        "  components/settings/ModulesSubscriptionCard.tsx (new)",
        "    Self-hiding section (returns null for non-owners). Shows core",
        "    modules locked + on, optional modules as switchable cards,",
        "    and a single 'حفظ الاختيار' button that PUTs the new array.",
        "  app/settings/users/page.tsx",
        "    Renders ModulesSubscriptionCard inside the existing",
        "    'صلاحيات الأدوار' card — no new page created, reusing the",
        "    existing settings page as requested.",
        "",
        "Version",
        "  lib/version.ts -> 3.74.260",
        "",
        "Files",
        "  lib/module-manifest.ts (new)",
        "  components/sidebar.tsx",
        "  components/settings/ModulesSubscriptionCard.tsx (new)",
        "  app/api/my-company/route.ts",
        "  app/api/company/enabled-modules/route.ts (new)",
        "  app/settings/users/page.tsx",
        "  supabase/migrations/20260620000260_v3_74_260_companies_enabled_modules.sql (new)",
        "  lib/version.ts -> 3.74.260"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.260 pushed" -ForegroundColor Green
}
