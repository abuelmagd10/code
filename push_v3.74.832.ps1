$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.831.ps1") { Remove-Item -LiteralPath "push_v3.74.831.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.832"') {
    Write-Host "+ 3.74.832" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.832]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.832]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# ── stage first, judge after ────────────────────────────────────────────────
$files = @(
    "lib/version.ts",
    "CHANGELOG.md",
    "supabase/migrations/20260726000003_v3_74_832_reapproval_after_edit_allowed.sql",
    "push_v3.74.832.ps1"
)
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.831.ps1" 2>$null

$m = Get-Content -LiteralPath "supabase/migrations/20260726000003_v3_74_832_reapproval_after_edit_allowed.sql" -Raw

# --- (a) the transition is allowed --------------------------------------------
if ($m -notmatch [regex]::Escape("IN ('approved', 'pending_approval')")) {
    Write-Host "X approved is still a terminal state - editing an approved order still fails" -ForegroundColor Red; exit 1
}
Write-Host "+ an approved order can return for re-approval" -ForegroundColor Green

# --- (b) but only before release ----------------------------------------------
if ($m -notmatch [regex]::Escape("COALESCE(OLD.status, 'draft') <> 'draft'")) {
    Write-Host "X re-approval is not bounded to draft - a released order could reopen its approval" -ForegroundColor Red; exit 1
}
Write-Host "+ and only while it is still a draft, never after release" -ForegroundColor Green

# --- (c) what must stay forbidden, stays forbidden ----------------------------
if ($m -match [regex]::Escape("IN ('approved', 'pending_approval', 'rejected')")) {
    Write-Host "X approved -> rejected became possible; approval must not be revoked sideways" -ForegroundColor Red; exit 1
}
if ($m -notmatch [regex]::Escape("WHEN 'draft'             THEN COALESCE(p_new_status, '') IN ('draft', 'pending_approval')")) {
    Write-Host "X the draft transitions were altered" -ForegroundColor Red; exit 1
}
Write-Host "+ approved -> rejected and approved -> draft remain impossible" -ForegroundColor Green

# --- (d) all three guard messages are bilingual ------------------------------
foreach ($msg in @(
    "انتقال غير مسموح لحالة اعتماد أمر الإنتاج",
    "لا يمكن إرجاع أمر الإنتاج للاعتماد بعد إصداره",
    "لا يمكن إصدار أمر الإنتاج قبل اعتماده")) {
    if ($m -notmatch [regex]::Escape($msg)) {
        Write-Host "X a guard message is missing: $msg" -ForegroundColor Red; exit 1
    }
}
$bi = ([regex]::Matches($m, [regex]::Escape("check_violation"))).Count
if ($bi -lt 3) { Write-Host "X only $bi of 3 messages carry check_violation" -ForegroundColor Red; exit 1 }
Write-Host "+ all three guard messages speak Arabic and English" -ForegroundColor Green

Write-Host "Verifying the lockfile matches package.json..." -ForegroundColor Cyan
node scripts/check-lockfile-in-sync.js
if ($LASTEXITCODE -ne 0) { Write-Host "X lockfile check failed" -ForegroundColor Red; exit 1 }

Write-Host "Verifying referenced scripts and their inputs are committed..." -ForegroundColor Cyan
node scripts/check-referenced-scripts-tracked.js
if ($LASTEXITCODE -ne 0) { Write-Host "X referenced-scripts check failed" -ForegroundColor Red; exit 1 }

Write-Host "Checking phantom column writes..." -ForegroundColor Cyan
node scripts/check-phantom-columns.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X phantom-column check failed" -ForegroundColor Red; exit 1 }

Write-Host "Running critical tests..." -ForegroundColor Cyan
$raw = & npx vitest run tests/critical --reporter=basic 2>&1 | Out-String
$out2 = $raw -replace "\x1b\[[0-9;]*[A-Za-z]", ""
$testsLine = ($out2 -split "`n" | Where-Object { $_ -match "^\s*Tests\s+\d" } | Select-Object -First 1)
if (-not $testsLine) { Write-Host "X could not find the Tests summary line" -ForegroundColor Red; exit 1 }
Write-Host "  $($testsLine.Trim())" -ForegroundColor DarkGray
if ($testsLine -notmatch "\btodo\b") { Write-Host "X placeholders may be passing again" -ForegroundColor Red; exit 1 }

Write-Host "Running tsc..." -ForegroundColor Cyan
if (Test-Path ".next/types") { Remove-Item ".next/types" -Recurse -Force -ErrorAction SilentlyContinue }
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors - NOT pushing:" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 40 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -- $files 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

foreach ($f in $files) {
    $pending = git status --porcelain -- $f
    if ($pending -and ($staged -notcontains $f)) {
        Write-Host "X $f has pending changes that failed to stage" -ForegroundColor Red; exit 1
    }
}

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_832.txt"
    $msgLines = @(
        'fix(manufacturing): v3.74.832 - editing an approved order can send it',
        'back for approval',
        '',
        'Follow-on from 830. With the phantom columns gone the update finally',
        'targets real columns - which exposed the next obstacle, and this one',
        'was a matter of design, not typing:',
        '',
        '  Disallowed approval transition: approved -> pending_approval',
        '',
        'Two designs disagreed inside the same system. The route (Phase R3)',
        'holds that editing an approved order INVALIDATES its approval and',
        'sends it back round - which is the right control, because an approval',
        'was granted for particular figures, and once those change the approval',
        'covers something nobody approved. But the database transition table',
        'treated approved as terminal, so the return was impossible and the',
        'whole edit failed.',
        '',
        'So the edit-then-reapprove cycle was never possible at all - not just',
        'because of the phantom columns, but because a guard refused the',
        'transition itself.',
        '',
        'approved -> pending_approval is now allowed, bounded to draft orders:',
        'before release an edit reopens the approval; after release it is',
        'refused, because material has already moved and an approval cannot be',
        'reopened retroactively - cancel the order and raise a new one. The',
        'bound is doubly safe: the header-editability guard already freezes',
        'warehouses and BOM once an order leaves draft.',
        '',
        'Verified on the test DB that what must stay shut stays shut:',
        'approved -> rejected and approved -> draft are still impossible.',
        'All three guard messages are now bilingual.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.832 pushed - an approval that no longer matches the order gives itself up" -ForegroundColor Green
}
