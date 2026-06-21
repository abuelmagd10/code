$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.260.ps1") { Remove-Item -LiteralPath "push_v3.74.260.ps1" -Force }

# ── 1. الإصدار ────────────────────────────────────────────────────
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.261"') {
    Write-Host "+ 3.74.261" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# ── 2. صفحة الـ Onboarding ─────────────────────────────────────────
$on = Get-Content -LiteralPath "app/onboarding/page.tsx" -Raw
$checks = @(
    'import { OPTIONAL_MODULES, MODULE_LABELS, type ModuleKey } from "@/lib/module-manifest"',
    'LayoutGrid',
    'selectedModules',
    'toggleModule',
    'enabled_modules: Array.from(selectedModules).sort()',
    'step === 4',
    'totalSteps = 4',
    'step4Title',
    '[1, 2, 3, 4]',
    'L.step4Title'
)
foreach ($c in $checks) {
    if ($on -notmatch [regex]::Escape($c)) { Write-Host "X /onboarding missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ /onboarding: 4 steps, Step 4 picks optional modules, insert writes enabled_modules" -ForegroundColor Green

# ── 3. فحص TypeScript ─────────────────────────────────────────────
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

# ── 4. git add / commit / push ───────────────────────────────────
git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_261.txt"
    $msgLines = @(
        "feat(onboarding): v3.74.261 - pick optional modules during company creation",
        "",
        "Adds Step 4 to the new-company wizard so the owner picks their",
        "optional modules from the start instead of having to open",
        "Settings -> Users right after onboarding. This is the Phase 3",
        "follow-up to v3.74.260 (Module Subscription Phase 1).",
        "",
        "Default is conservative: all four optional modules are pre-selected,",
        "so an owner who just clicks Next gets the same sidebar they would",
        "have gotten before this version. Unchecking a module on Step 4",
        "writes a shorter enabled_modules array into companies on insert.",
        "",
        "Phase contract is unchanged: the column only drives sidebar",
        "visibility. APIs, RPCs and triggers are untouched, so a user who",
        "types a direct URL to a 'disabled' module still gets the page.",
        "",
        "What changed",
        "  app/onboarding/page.tsx:",
        "    - imports OPTIONAL_MODULES, MODULE_LABELS, ModuleKey from",
        "      lib/module-manifest.",
        "    - adds selectedModules: Set<ModuleKey> state, initialised to",
        "      every optional module (conservative default).",
        "    - bumps totalSteps from 3 to 4 and extends the progress badge",
        "      strip + step-title fallback.",
        "    - adds Step 4 UI: a 2x2 grid of toggle cards (services_bookings,",
        "      manufacturing, fixed_assets, hr) with bilingual descriptions",
        "      from MODULE_LABELS.",
        "    - extends the companies INSERT body with:",
        "         enabled_modules: Array.from(selectedModules).sort(),",
        "      Empty array = 'owner deliberately chose nothing optional'.",
        "      null is reserved for legacy companies that pre-date the",
        "      v3.74.260 column.",
        "",
        "What didn't change",
        "  - No new pages. Wizard reuses the existing card + button shell.",
        "  - No backend changes: companies.enabled_modules already exists",
        "    from v3.74.260; this version just fills it on insert.",
        "  - Existing companies are untouched.",
        "",
        "Version",
        "  lib/version.ts -> 3.74.261",
        "",
        "Files",
        "  app/onboarding/page.tsx",
        "  lib/version.ts -> 3.74.261"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.261 pushed" -ForegroundColor Green
}
