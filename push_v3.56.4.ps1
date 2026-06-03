# v3.56.4 - Cross-Page Search precision improvements
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Verify markers ===" -ForegroundColor Cyan
$cps = Get-Content "lib/ai/cross-page-search.ts" -Raw

$checks = @(
    @{ p = 'Domain noise';            m = "Domain noise stop-word section present" },
    @{ p = '"الشركة"';                m = "ar:'الشركة' added to stop words" },
    @{ p = '"بيانات"';                m = "ar:'بيانات' added to stop words" },
    @{ p = '"إدارة"';                 m = "ar:'إدارة' added to stop words" },
    @{ p = 'score \+= 5';             m = "Title weight increased to +5" },
    @{ p = 'distinctTokensMatched';    m = "Distinct-token counter present" },
    @{ p = 'queryLc\.length >= 4';     m = "Phrase-bonus guard present" },
    @{ p = 'titleLc\.includes\(queryLc\)\) score \+= 10'; m = "Phrase bonus in title (+10)" },
    @{ p = 'tokens\.length >= 2 && distinctTokensMatched < 2'; m = "Multi-token gate present" },
    @{ p = 'MIN_SCORE = tokens\.length >= 2 \? 8 : 5'; m = "Score floor present" }
)

foreach ($c in $checks) {
    if ($cps -match $c.p) {
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
git add lib/ai/cross-page-search.ts CHANGELOG.md
git --no-pager diff --cached --stat
git commit -m "fix(ai-assistant): v3.56.4 - sharpen cross-page search

After v3.56.3 the user asked 'كيف اضيف شركة شحن' on /settings
and the assistant suggested Dashboard / Branches / Warehouses,
because the token 'شركة' (company) appears in almost every page
description, and 'شحن' (shipping) does not appear in any
page_guide at all.

Changes in lib/ai/cross-page-search.ts:

1) Expanded Arabic stop-words:
   - Function words: حسب, بعد, قبل, مع, بين, امام, خلف, فوق, تحت
   - Domain noise that appears everywhere:
     شركة, الشركة, شركتى, شركتك, شركات, بيانات, بياناتك,
     إدارة, ادارة, النظام, نظام, صفحة, الصفحة, صفحات,
     العملاء, العميل, العمليات, العملية, تسجيل

2) Higher title weight: +5 per token (was +3)

3) Phrase bonus:
   - Full query in title:       +10
   - Full query in description: +5

4) Multi-token requirement:
   When the user typed 2+ meaningful tokens, a candidate must
   match at least 2 distinct tokens. Single-token noise rejected.

5) Score floor:
   - 1-token query: score must be >= 5
   - 2+ token query: score must be >= 8
   No card shown when no strong match exists - better than
   misleading suggestions.

Zero backend / DB changes. TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.56.4 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "After Vercel rebuild, test on /settings:" -ForegroundColor Cyan
    Write-Host "  'كيف اضيف شركة شحن' -> NO card (no real شحن guide)" -ForegroundColor White
    Write-Host "  'فاتورة بيع'          -> card with /invoices or /sales-orders" -ForegroundColor White
    Write-Host "  'مخزون'              -> card with /products or /inventory" -ForegroundColor White
}
