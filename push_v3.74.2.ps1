# v3.74.2 hotfix - Landing page price truth ($10 USD, billed in EGP)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.2"') { Write-Host "+ APP_VERSION = 3.74.2" -ForegroundColor Green }
else { Write-Host "X APP_VERSION not 3.74.2" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match '\[3.74.2\]') { Write-Host "+ CHANGELOG entry for 3.74.2 present" -ForegroundColor Green }
else { Write-Host "X CHANGELOG missing 3.74.2 entry" -ForegroundColor Red; exit 1 }

$pg = Get-Content -LiteralPath "app/page.tsx" -Raw
if ($pg -match "price: '\`$10'" -and $pg -match 'يُحاسَب بالجنيه المصرى بسعر الصرف اللحظى') {
    Write-Host "+ landing page: USD 10 + EGP subtext present" -ForegroundColor Green
} else { Write-Host "X landing page price markers missing" -ForegroundColor Red; exit 1 }

# JSON-LD must use USD now
$lay = Get-Content -LiteralPath "app/layout.tsx" -Raw
if ($lay -match 'price: "10"' -and $lay -match 'priceCurrency: "USD"') {
    Write-Host "+ JSON-LD: USD 10 present" -ForegroundColor Green
} else { Write-Host "X JSON-LD still references wrong currency/price" -ForegroundColor Red; exit 1 }

# Old 500 EGP references in blog must be cleaned (own-pricing only,
# competitor cross-reference like "$10-50 شهر = 500-2500 ج.م" is allowed)
$blog1 = Get-Content -LiteralPath "app/blog/best-arabic-accounting-software-egypt-2026/page.tsx" -Raw
if ($blog1 -match '500 ج\.م/مستخدم إضافى') {
    Write-Host "X blog 1 still claims own price is 500 EGP/user" -ForegroundColor Red; exit 1
}
Write-Host "+ blog 1: own-pricing wording cleaned" -ForegroundColor Green

$blog2 = Get-Content -LiteralPath "app/blog/excel-to-erp-migration-guide/page.tsx" -Raw
if ($blog2 -match 'اشتراك 500 ج\.م/شَهر') {
    Write-Host "X blog 2 still has 'اشتراك 500 ج.م/شَهر' wording" -ForegroundColor Red; exit 1
}
Write-Host "+ blog 2: own-pricing wording cleaned" -ForegroundColor Green

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host ($tsc | Out-String) -ForegroundColor Red; exit 1 }
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add lib/version.ts `
        app/page.tsx `
        app/layout.tsx `
        app/blog/best-arabic-accounting-software-egypt-2026/page.tsx `
        app/blog/excel-to-erp-migration-guide/page.tsx `
        app/api/checkout/route.ts `
        CHANGELOG.md 2>&1 | Out-Null
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "fix(marketing): v3.74.2 - landing page price truth (10 USD, billed in EGP)

Ahmed flagged: landing page advertised '500 ج.م/مستخدم/شهر'
hardcoded, but actual billing in pricing-engine.ts uses
BASE_PRICE_USD = 10/seat converted to EGP at live Paymob rate
at checkout. The marketing was contradicting the system of
record.

Fixed:
  - app/page.tsx pricing card -> '10 / مستخدم / شهر' headline
    with subtext: 'يُحاسَب بالجنيه المصرى بسعر الصرف اللحظى
    عند الدفع عبر Paymob'
  - app/layout.tsx JSON-LD: both offers use USD now
    (was 'EGP 500', now '10 USD' + description explaining EGP
    billing at live rate)
  - app/blog/best-arabic-accounting-software-egypt-2026/page.tsx
    replaced two stale price mentions
  - app/blog/excel-to-erp-migration-guide/page.tsx generalized
    the example
  - app/api/checkout/route.ts marked DEPRECATED (legacy route
    with hardcoded 500 EGP, no longer called from anywhere
    active in the app)

Why this matters:
  - Search engine snippets pulled '500 EGP' from JSON-LD,
    confusing users coming from Google
  - Blog SEO articles need honest pricing for credibility
  - Pricing engine itself was correct the whole time - this was
    purely a marketing-page truth gap

Files:
  Modified: app/page.tsx
  Modified: app/layout.tsx
  Modified: app/blog/best-arabic-accounting-software-egypt-2026/page.tsx
  Modified: app/blog/excel-to-erp-migration-guide/page.tsx
  Modified: app/api/checkout/route.ts (deprecation header)
  Modified: lib/version.ts (3.74.1 -> 3.74.2)
  Modified: CHANGELOG.md

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.2 pushed" -ForegroundColor Green
}
