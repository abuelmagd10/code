$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.731.ps1") { Remove-Item -LiteralPath "push_v3.74.731.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.732"') {
    Write-Host "+ 3.74.732" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.732]")) { Write-Host "X CHANGELOG missing [3.74.732]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

# Without this translation a refusal reads as a timeout - to the user, and to
# whoever investigates it later.
$em = Get-Content -LiteralPath "lib/error-messages.ts" -Raw
if ($em -notmatch "CROSS_TENANT_ERRCODE = '57014'") {
    Write-Host "X 57014 is no longer recognised - refusals surface as timeouts again" -ForegroundColor Red; exit 1
}
if ($em -notmatch "isCrossTenantRefusal") {
    Write-Host "X the cross-tenant check is gone" -ForegroundColor Red; exit 1
}
if ($em -notmatch "غير مصرح: هذه العملية تخص شركة أخرى") {
    Write-Host "X the Arabic refusal wording is missing" -ForegroundColor Red; exit 1
}
Write-Host "+ 57014 translated to a permission message" -ForegroundColor Green

# It must be handled in BOTH entry points. formatSupabaseError alone leaves
# handleSupabaseError titling it "Operation failed".
$fmtIdx = $em.IndexOf("export const formatSupabaseError")
$hdlIdx = $em.IndexOf("export const handleSupabaseError")
if ($fmtIdx -lt 0 -or $hdlIdx -lt 0) {
    Write-Host "X one of the error entry points is missing" -ForegroundColor Red; exit 1
}
$fmtBody = $em.Substring($fmtIdx, $hdlIdx - $fmtIdx)
$hdlBody = $em.Substring($hdlIdx)
if ($fmtBody -notmatch "isCrossTenantRefusal") {
    Write-Host "X formatSupabaseError does not handle the refusal" -ForegroundColor Red; exit 1
}
if ($hdlBody -notmatch "isCrossTenantRefusal") {
    Write-Host "X handleSupabaseError does not handle the refusal - it would title it 'Operation failed'" -ForegroundColor Red; exit 1
}
Write-Host "+ both entry points handle it" -ForegroundColor Green

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

git add -- "lib/version.ts" "CHANGELOG.md" "lib/error-messages.ts" "push_v3.74.732.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.731.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_732.txt"
    $msgLines = @(
        'fix(errors): v3.74.732 - a cross-tenant refusal was reading as a timeout',
        '',
        'v3.74.730 chose errcode 57014 over 42501 deliberately, because WHEN OTHERS',
        'swallows 42501 and 15 guarded functions carry such a handler. That choice',
        'left a debt, and this pays it: 57014 literally means "query cancelled", so',
        'a security refusal was arriving dressed as a performance fault.',
        '',
        'The damage runs both ways. The user is told the operation timed out when it',
        'was actually refused. And we would have gone looking for a slowdown that',
        'does not exist.',
        '',
        'formatSupabaseError and handleSupabaseError now recognise 57014 and return',
        'the refusal wording under a Permission Denied title. Handled in both, not',
        'just the formatter - handleSupabaseError would otherwise still title it',
        '"Operation failed". The trailing "(57014)" is dropped: a raw code next to',
        'an authorisation message is noise that invites the wrong diagnosis.',
        '',
        'Kept as its own release rather than folded into v3.74.731, so closing the',
        'hole and rewording the message stay separable if either needs revisiting.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.732 pushed - refusals now read as refusals" -ForegroundColor Green
}
