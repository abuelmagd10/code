$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.443.ps1") { Remove-Item -LiteralPath "push_v3.74.443.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.444"') {
    Write-Host "+ 3.74.444" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260630000444_v3_74_444_read_only_mode.sql"
if (-not (Test-Path -LiteralPath $mig)) { Write-Host "X migration missing" -ForegroundColor Red; exit 1 }
Write-Host "+ migration 444 present" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'AQ\. ?Read-only mode') {
    Write-Host "X CONTRACTS.md missing Section AQ" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section AQ" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 15 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_444.txt"
    $msgLines = @(
        'feat(billing): v3.74.444 - read-only mode for suspended subscriptions',
        '',
        'payment_failed used to be total lockout: users could not view,',
        'verify, or export their own data. Only support could unlock',
        'them. Bad for trust during grace periods where the owner is',
        'actively resolving payment.',
        '',
        'New behavior tied to subscription_status:',
        '   active         full read/write',
        '   past_due       full read/write + reminders + banner (grace)',
        '   payment_failed read-only: SELECTs work, INSERTs into',
        '                  transactional tables refused with Arabic',
        '                  pointer to /settings/billing',
        '   cancelled      same as payment_failed',
        '',
        'Implementation',
        '   can_write_to_company(company_id) helper returns false when',
        '     status is payment_failed or cancelled.',
        '   subscription_write_gate_trg BEFORE INSERT attached to 12',
        '     top-level transactional tables. Items inherit the guard',
        '     through the parent. UPDATEs on existing rows still work,',
        '     so owners can wind down in-flight work.',
        '',
        'Reactivation (v3.74.443) transparently disables the gate once',
        'seats are renewed.',
        '',
        'Baseline (Section AQ) wired via PERFORM in assert_baseline.',
        '',
        'Files',
        '   supabase/migrations/20260630000444_v3_74_444_read_only_mode.sql',
        '   CONTRACTS.md (Section AQ added)',
        '   lib/version.ts -> 3.74.444'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.444 pushed - read-only mode live" -ForegroundColor Green
}
