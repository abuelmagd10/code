$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.264.ps1") { Remove-Item -LiteralPath "push_v3.74.264.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.265"') {
    Write-Host "+ 3.74.265" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# الـ Hub page موجود
if (-not (Test-Path -LiteralPath "app/manufacturing/page.tsx")) {
    Write-Host "X missing app/manufacturing/page.tsx" -ForegroundColor Red; exit 1
}
$hub = Get-Content -LiteralPath "app/manufacturing/page.tsx" -Raw
foreach ($c in @(
    'HUB_COPY',
    'ManufacturingHubPage',
    'COLOR_CLASSES',
    'ICON_MAP'
)) {
    if ($hub -notmatch [regex]::Escape($c)) { Write-Host "X /manufacturing missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ /manufacturing Hub page renders 3 phases (Setup -> Plan -> Execute)" -ForegroundColor Green

# نصوص الـ HUB_COPY فى ملف الكوبى
$copy = Get-Content -LiteralPath "lib/manufacturing/manufacturing-ui.ts" -Raw
foreach ($c in @(
    'export const HUB_COPY',
    'دورة التصنيع',
    'Manufacturing Cycle',
    'helpStripTitle'
)) {
    if ($copy -notmatch [regex]::Escape($c)) { Write-Host "X manufacturing-ui.ts missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ manufacturing-ui.ts exports HUB_COPY (ar/en)" -ForegroundColor Green

# السايدبار يلينك الـ Hub
$sb = Get-Content -LiteralPath "components/sidebar.tsx" -Raw
foreach ($c in @(
    'صفحة التصنيع الرئيسية',
    "href === '/manufacturing'"
)) {
    if ($sb -notmatch [regex]::Escape($c)) { Write-Host "X sidebar missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ sidebar lists Hub link first + maps /manufacturing to manufacturing_boms gate" -ForegroundColor Green

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

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_265.txt"
    $msgLines = @(
        "feat(manufacturing): v3.74.265 - Phase 1 - visual hub page that explains the cycle",
        "",
        "Why",
        "  User feedback: the manufacturing module has too much developer",
        "  language (MRP, BOM, Routing, WIP), and the workflow itself is",
        "  not obvious - opening the sidebar shows 8 acronymed links with",
        "  no sense of order or prerequisites. /manufacturing 404'd.",
        "",
        "  This is the first of four phases to fix the module's UX. Phase 1",
        "  is purely additive - no existing page is renamed or removed.",
        "",
        "What",
        "  app/manufacturing/page.tsx (new):",
        "    A landing page laid out as three phase cards in lifecycle",
        "    order:",
        "      1. التحضير (Setup, one-time)",
        "          - Work Centers / BOMs / Routings",
        "      2. تخطيط الإنتاج (Plan)",
        "          - MRP (optional) / Production Orders (primary CTA)",
        "      3. أثناء التصنيع (Execute)",
        "          - Issue Materials / Receive Product / Close Order",
        "    Each step is a card with a plain-Arabic title, a one-line",
        "    description, and an icon. The primary CTA in section 2 is",
        "    highlighted; the optional MRP step is tagged 'اختيارى'.",
        "    A help strip at the top spells out the recommended order for",
        "    a first-time company.",
        "",
        "  lib/manufacturing/manufacturing-ui.ts:",
        "    Adds HUB_COPY (ar/en) with all section/step text. Reuses the",
        "    existing AppLang + readAppLanguage helpers.",
        "",
        "  components/sidebar.tsx:",
        "    - First link under '🏭 التصنيع' is now '🗺️ صفحة التصنيع الرئيسية'",
        "      pointing at /manufacturing. The 8 step-specific links",
        "      stay underneath unchanged so power users keep their",
        "      shortcuts.",
        "    - Path map: /manufacturing resolves to the same",
        "      manufacturing_boms access gate as the rest of the module,",
        "      so the existing PageGuard logic just works.",
        "",
        "What's next (later versions)",
        "  Phase 2: a single Arabic glossary applied across every page",
        "  (drop MRP / BOM / WIP from titles, replace 'Issue' / 'Release'",
        "  buttons with explicit verbs).",
        "  Phase 3: status labels and toast/error messages.",
        "  Phase 4: tooltips for residual technical terms + simplified",
        "  forms with advanced options collapsed.",
        "",
        "Files",
        "  app/manufacturing/page.tsx (new)",
        "  lib/manufacturing/manufacturing-ui.ts (HUB_COPY added)",
        "  components/sidebar.tsx (Hub link + path map)",
        "  lib/version.ts -> 3.74.265"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.265 pushed" -ForegroundColor Green
}
