$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.240.ps1") { Remove-Item -LiteralPath "push_v3.74.240.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.241"') {
    Write-Host "+ 3.74.241" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

$sh = Get-Content -LiteralPath "app/shareholders/page.tsx" -Raw
if ($sh -notmatch 'لِلمُساهِم') {
    Write-Host "X new delete-guard arabic message not present" -ForegroundColor Red; exit 1
}
if ($sh -notmatch 'capital_contributions') {
    Write-Host "X delete-guard does not check capital_contributions" -ForegroundColor Red; exit 1
}
Write-Host "+ handleDelete now blocks delete when shareholder has contributions" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_241.txt"
    $msgLines = @(
        "fix(shareholders): v3.74.241 - block delete when contributions exist",
        "",
        "Reported during the new-company sign-up test:",
        "  1. Owner created shareholder 'سيف الدين' with a 60 EGP capital",
        "     contribution. Treasury credited, capital account credited.",
        "  2. Owner deleted the shareholder to edit the amount.",
        "  3. Owner re-created the shareholder.",
        "  4. Re-adding the contribution returned 400 P0001",
        "     NO_ACTIVE_FINANCIAL_PERIOD from require_open_financial_period_db",
        "     and the books were now in an inconsistent state.",
        "",
        "Root cause: handleDelete did a plain DELETE on shareholders. The",
        "capital_contributions row was removed automatically by an",
        "ON DELETE CASCADE foreign key, but the journal_entries and the",
        "journal_entry_lines that contribution had produced were NOT, and",
        "neither was the auto-created 'رأس مال - <name>' capital account",
        "in chart_of_accounts. Treasury kept the 60 EGP with no shareholder",
        "on the credit side.",
        "",
        "When the owner re-created the shareholder with the same name, the",
        "create-capital-account step found a still-existing account by",
        "name (line 522 maybeSingle), so the new shareholder silently",
        "inherited the orphan capital balance.",
        "",
        "Fix: handleDelete now:",
        "  * counts capital_contributions + shareholder_drawings for that",
        "    shareholder. If either is > 0 the delete is refused with a",
        "    clear Arabic / English message asking the user to reverse the",
        "    contributions / drawings first.",
        "  * when delete is allowed (no movements), also drops the auto-",
        "    created capital account if it never received any lines, so a",
        "    later re-create starts from a clean slate.",
        "",
        "Cleanup already applied to the test company 'notniche': orphan",
        "JE-000001 deleted, empty 'رأس مال - سيف الدين' account dropped.",
        "Owner can re-test now.",
        "",
        "  app/shareholders/page.tsx",
        "  lib/version.ts -> 3.74.241"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.241 pushed" -ForegroundColor Green
}
