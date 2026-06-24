$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.343.ps1") { Remove-Item -LiteralPath "push_v3.74.343.ps1" -Force }

# ---- version stamp -----------------------------------------------------------
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.344"') {
    Write-Host "+ 3.74.344" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# ---- ServiceForm: requires_approval UI removed -------------------------------
$sf = Get-Content -LiteralPath "components/services/ServiceForm.tsx" -Raw
# The Switch + FormField for requires_approval must be gone.
if ($sf -match 'name="requires_approval"') {
    Write-Host "X ServiceForm still wires a UI control for requires_approval" -ForegroundColor Red; exit 1
}
if ($sf -notmatch 'v3.74.344') {
    Write-Host "X ServiceForm missing v3.74.344 marker" -ForegroundColor Red; exit 1
}
# The default value should still exist so DB-bound logic keeps a stable false.
if ($sf -notmatch 'requires_approval: false') {
    Write-Host "X ServiceForm should still keep requires_approval: false default" -ForegroundColor Red; exit 1
}
Write-Host "+ ServiceForm: requires_approval UI hidden, default kept false" -ForegroundColor Green

# ---- type-check --------------------------------------------------------------
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

# ---- commit + push -----------------------------------------------------------
git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_344.txt"
    $msgLines = @(
        'feat(services): v3.74.344 - drop "Requires approval" switch from service form',
        '',
        'Owner does not want the approval workflow on services. The Switch',
        'on the new-service form was confusing because there is no actual',
        'approval queue UI for it, and leaving it visible suggested a flow',
        'that is not wired up.',
        '',
        'Change',
        '  Removed the requires_approval FormField from ServiceForm. The',
        '  default in form defaults stays false so every newly created',
        '  service is implicitly auto-approved and any downstream code',
        '  that reads services.requires_approval keeps reading the same',
        '  stable false value. The DB column is untouched.',
        '',
        'Files',
        '  components/services/ServiceForm.tsx',
        '  lib/version.ts -> 3.74.344'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.344 pushed" -ForegroundColor Green
}
