$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.342.ps1") { Remove-Item -LiteralPath "push_v3.74.342.ps1" -Force }

# ---- version stamp -----------------------------------------------------------
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.343"') {
    Write-Host "+ 3.74.343" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# ---- ServiceForm: tax dropdown wiring ----------------------------------------
$sf = Get-Content -LiteralPath "components/services/ServiceForm.tsx" -Raw
foreach ($n in @(
    'v3.74.343 — Tax rate dropdown sourced from /settings/taxes',
    'import { listTaxCodes, ensureDefaultsIfEmpty, type TaxCode }',
    'const [taxCodes, setTaxCodes] = useState<TaxCode[]>',
    'await ensureDefaultsIfEmpty(supabase)',
    'await listTaxCodes(supabase)',
    'v3.74.343: dropdown sourced from /settings/taxes',
    'القائمة تستمد من إعدادات الضرائب'
)) {
    if ($sf -notmatch [regex]::Escape($n)) {
        Write-Host "X ServiceForm missing: $n" -ForegroundColor Red; exit 1
    }
}
# Sanity: the old number Input should no longer be there for tax_rate
if ($sf -match 'name="tax_rate"[\s\S]{0,200}type="number"') {
    Write-Host "X ServiceForm still uses number Input for tax_rate" -ForegroundColor Red; exit 1
}
Write-Host "+ ServiceForm: tax_rate -> dropdown (taxCodes from /settings/taxes)" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_343.txt"
    $msgLines = @(
        'feat(services): v3.74.343 - tax rate is now a dropdown from /settings/taxes',
        '',
        'Owner: the new-service form had a free-number Tax Rate field even',
        'though /settings/taxes already defines a canonical list of tax',
        'codes for the company. The two screens were drifting apart - a',
        'manager could type "7" on a service and have nothing to do with',
        'it on the Taxes page.',
        '',
        'Change',
        '  ServiceForm reads tax_codes via the existing listTaxCodes helper',
        '  (same source the Tax Settings page uses), filtered to is_active',
        '  AND scope IN (sales, both). The Tax Rate input becomes a Select',
        '  whose options are "<name> - <rate>%". The form still stores a',
        '  numeric rate so the DB schema and downstream invoicing code are',
        '  untouched.',
        '',
        'Edge cases',
        '  * Empty companies get the {0%, VAT 5%, VAT 15%} defaults seeded',
        '    by ensureDefaultsIfEmpty, so the dropdown is never empty.',
        '  * Legacy services whose tax_rate does not match any defined',
        '    code (older free-typed values) get a synthetic "Legacy: N%"',
        '    option so the user sees what is saved and can switch later.',
        '  * Purchase-only codes are hidden because services are sales-',
        '    facing.',
        '',
        'Files',
        '  components/services/ServiceForm.tsx',
        '  lib/version.ts -> 3.74.343'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.343 pushed" -ForegroundColor Green
}
