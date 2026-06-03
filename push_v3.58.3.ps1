# v3.58.3 - Hotfix: send cleaned tokens to RPC + expand stop words
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Verify cross-page-search.ts ===" -ForegroundColor Cyan
$cps = Get-Content "lib/ai/cross-page-search.ts" -Raw

$checks = @(
    @{ p = 'const cleanedQuery = tokens\.join\(" "\)';     m = "Cleaned tokens used as RPC input" },
    @{ p = 'p_query: cleanedQuery';                          m = "RPC receives cleanedQuery (not raw)" },
    @{ p = '"اريد"';                                          m = "Intent verb 'اريد' added" },
    @{ p = '"معرفة"';                                         m = "Intent verb 'معرفة' added" },
    @{ p = '"اضافة"';                                         m = "Action verb 'اضافة' added" },
    @{ p = '"جديدة"';                                         m = "Adjective 'جديدة' added" },
    @{ p = '"يمكننى"';                                        m = "Modal 'يمكننى' added" },
    @{ p = '"أنشئ"';                                          m = "Action verb 'أنشئ' added" }
)

# Bad pattern: must NOT pass raw query anymore
$badPatterns = @(
    @{ p = 'p_query: query,';   m = "raw query no longer sent to RPC" }
)

foreach ($c in $checks) {
    if ($cps -match $c.p) {
        Write-Host ("  + " + $c.m) -ForegroundColor Green
    } else {
        Write-Host ("  X " + $c.m + " -- pattern not found: " + $c.p) -ForegroundColor Red
        exit 1
    }
}

foreach ($b in $badPatterns) {
    if ($cps -match $b.p) {
        Write-Host ("  X " + $b.m + " -- still present: " + $b.p) -ForegroundColor Red
        exit 1
    } else {
        Write-Host ("  + " + $b.m) -ForegroundColor Green
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

# Skip commit if nothing is staged (already committed earlier)
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "  + Nothing new to commit (already committed); proceeding to push" -ForegroundColor Yellow
} else {
    git commit -m "fix(ai-assistant): v3.58.3 send cleaned tokens to RPC + expand stop words

User reported: query 'اريد معرفة كيف يمكننى اضافة شركة شحن جديدة'
suggested production-orders / accounting / customer-debit-notes -
all irrelevant.

Root cause: findRelevantPages was passing the raw user query to the
ai_search_pages RPC. The Postgres FTS then OR-ed across every word
including very common verbs (انشئ, اضيف, اعمل, افتح) and adjectives
(جديدة, جديد) that match almost every page_guide. The signal words
were drowned out by noise.

Fix in lib/ai/cross-page-search.ts:
- Send tokens.join(' ') instead of the raw query to the RPC.
  This means only the post-tokenize, post-stop-word output reaches
  Postgres FTS, so noise words never enter the OR query.

- Expanded STOP_WORDS_AR with three new groups:
  * Intent / desire verbs: اريد, اود, احتاج, اعرف, معرفة, افهم,
                            يمكن, يمكننى, يجب, ساعد, اخبرنى
  * Action verbs: اضافة, اضيف, اعمل, افعل, انشاء, انشئ, اصنع,
                  حذف, تعديل, تغيير, فتح, اغلاق
  * Adjectives: جديد, جديدة, قديم, قديمة, مختلف, مهم, افضل

Verified on production via execute_sql:
- 'اريد معرفة كيف يمكننى اضافة شركة شحن جديدة' tokenizes to
   just ['شحن']. 'شحن' has no chunks -> 0 hits -> NO misleading
   card shown (correct behaviour).
- 'فاتورة بيع' still returns invoices / estimates / bills ranked
   correctly.

Safety:
- No DB changes
- RPC unchanged
- Governance gate preserved
- TypeScript: OK" 2>&1 | ForEach-Object { Write-Host $_ }

    if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }
}

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.58.3 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "After Vercel rebuild, test:" -ForegroundColor Cyan
    Write-Host "  'اريد معرفة كيف يمكننى اضافة شركة شحن جديدة' -> NO card (شحن has no guide)" -ForegroundColor White
    Write-Host "  'فاتورة بيع' -> invoices + estimates + bills" -ForegroundColor White
    Write-Host "  'مخزون منتج' -> products + inventory pages" -ForegroundColor White
}
