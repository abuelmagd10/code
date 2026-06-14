$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.156.ps1") { Remove-Item -LiteralPath "push_v3.74.156.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.157"') { Write-Host "+ 3.74.157" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_157.txt"
    $msgLines = @(
        "feat(ai-alerts): v3.74.157 - outstanding totals + per-doc samples",
        "",
        "User feedback on the assistant's proactive alerts card. The bell",
        "showed '1 supplier bill past due - total 5.00' even after a 3.00",
        "partial payment, and carried no per-document context, so the user",
        "had no idea which bill was overdue or how much was actually owed.",
        "",
        "Three changes:",
        "",
        "1) Headline figure switches from gross total to OUTSTANDING.",
        "   ai_get_proactive_alerts now computes",
        "   GREATEST(total_amount - paid_amount, 0) per row and uses that",
        "   for the summed message and the total_amount return column.",
        "   A 5.00 bill paid 3.00 now reads 'outstanding 2.00'.",
        "",
        "2) Up to 5 sample documents in metadata.samples.",
        "   Each sample carries { id, number, party, due_date,",
        "   outstanding }, ordered by due_date ascending so the most",
        "   urgent row is on top. Includes the supplier name for bills",
        "   and the customer name for invoices, plus the due date.",
        "",
        "3) Sales-side coverage was already there (overdue_invoices,",
        "   due_soon_invoices) but used gross totals - same outstanding",
        "   fix applied. Governance is unchanged: the function still",
        "   gates each block behind ai_current_user_allowed_resources(),",
        "   so a user without 'invoices' access never sees the sales",
        "   alerts and a user without 'bills' never sees the purchase",
        "   alerts.",
        "",
        "Files:",
        "  Supabase migration: v3_74_157_ai_alerts_outstanding_and_samples",
        "    - Rewrites public.ai_get_proactive_alerts(text) with",
        "      outstanding calc + samples array per category.",
        "    - Skips rows where outstanding <= 0.01 so fully-paid bills",
        "      that haven't flipped to 'paid' yet don't pollute the list.",
        "",
        "  components/ai-assistant/guide-panel.tsx",
        "    - Alert card now reads metadata.samples and renders a small",
        "      list under the headline: number, party, due date,",
        "      outstanding. Shows a '+N and more' line when the count",
        "      exceeds the 5 we ship.",
        "    - Added proactiveDueLabel / proactiveOutstandingLabel /",
        "      proactiveMoreSuffix to the AR and EN label maps.",
        "",
        "  lib/version.ts",
        "    - Bumped to 3.74.157.",
        "",
        "How to verify after deploy:",
        "  - Open the assistant bell with at least one partially-paid",
        "    overdue bill or invoice.",
        "  - The card should now show:",
        "      Title  : 'فواتير موردين مُتأخّرة'",
        "      Headline: '1 فاتورة شراء تجاوزت الاستحقاق - المتبقى 2.00'",
        "      Sample : 'BILL-0002 . محمد الصاوى . الاستحقاق 2026-06-13 . المتبقى 2.00'",
        "      Button : 'افتح الصفحة' -> /bills",
        "",
        "Notes:",
        "  - The sample limit is hardcoded to 5 inside the RPC. Worth",
        "    making it a parameter if we add per-user preferences later.",
        "  - Stale-draft-sales-orders still uses count + gross total -",
        "    those drafts have no payment concept so outstanding doesn't",
        "    apply."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8

    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.157 pushed" -ForegroundColor Green
}
