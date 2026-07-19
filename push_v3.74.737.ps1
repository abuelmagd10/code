$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.736.ps1") { Remove-Item -LiteralPath "push_v3.74.736.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.737"') {
    Write-Host "+ 3.74.737" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.737]")) { Write-Host "X CHANGELOG missing [3.74.737]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$b = Get-Content -LiteralPath "app/api/bonuses/route.ts" -Raw

# GET must derive the company from the session. Reading it from the query
# string is the hole itself: employee compensation for any company id.
if ($b -match 'searchParams\.get\(\s*"companyId"\s*\)') {
    Write-Host "X bonuses reads companyId from the URL again - any company's bonus records become readable" -ForegroundColor Red; exit 1
}
# Both handlers must be secured, not just POST. That asymmetry WAS the bug.
$getIdx  = $b.IndexOf("export async function GET")
$postIdx = $b.IndexOf("export async function POST")
if ($getIdx -lt 0 -or $postIdx -lt 0) {
    Write-Host "X could not locate both handlers in bonuses/route.ts" -ForegroundColor Red; exit 1
}
$getBody = if ($postIdx -gt $getIdx) { $b.Substring($getIdx, $postIdx - $getIdx) } else { $b.Substring($getIdx) }
if ($getBody -notmatch "secureApiRequest") {
    Write-Host "X bonuses GET is unauthenticated again - POST was always fine, GET was the hole" -ForegroundColor Red; exit 1
}
Write-Host "+ bonuses GET derives the company from the session" -ForegroundColor Green

# The ratchet must have actually moved.
$js = Get-Content -LiteralPath "scripts/check-service-role-scoping.js" -Raw
if ($js -match '"bonuses/route\.ts"') {
    Write-Host "X bonuses is still listed as unreviewed after being fixed" -ForegroundColor Red; exit 1
}
if ($js -notmatch "subscription/create") {
    Write-Host "X subscription/create lost its documented exemption" -ForegroundColor Red; exit 1
}
Write-Host "+ ratchet updated" -ForegroundColor Green

Write-Host "Running the scoping check..." -ForegroundColor Cyan
node scripts/check-service-role-scoping.js
if ($LASTEXITCODE -ne 0) { Write-Host "X scoping check failed" -ForegroundColor Red; exit 1 }
Write-Host "+ check passes" -ForegroundColor Green

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

git add -- `
    "lib/version.ts" `
    "CHANGELOG.md" `
    "app/api/bonuses/route.ts" `
    "scripts/check-service-role-scoping.js" `
    "push_v3.74.737.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.736.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_737.txt"
    $msgLines = @(
        'security: v3.74.737 - bonuses GET exposed any company''s compensation data',
        '',
        'The check added yesterday found this on its first run.',
        '',
        'GET /api/bonuses read companyId straight from the query string with no',
        'authentication of any kind, then queried user_bonuses with the',
        'service-role client. Anyone who could reach the URL could read any',
        'company''s bonus records - employee compensation - for a company id they',
        'guessed or had seen elsewhere.',
        '',
        'POST in the same file was already correct: secureApiRequest, a permission',
        'check and an allowRoles list. Only GET was open, and the comment above the',
        'line read "fetch companyId from URL parameters directly", written as though',
        'it were a feature.',
        '',
        'GET now derives the company from the session exactly as POST does, and the',
        'companyId query parameter is ignored outright - callers do not choose whose',
        'data they read.',
        '',
        'This is the difference the generic check buys. Nobody found this by',
        'reading; a rule written yesterday found it in one pass. And the list',
        'described it as "awaiting review", not "safe" - a distinction that turned',
        'out not to be pedantic.',
        '',
        'Also reviewed subscription/create and moved it to the allowlist: it is',
        'public signup, creating a NEW tenant and touching no existing one. Noted',
        'separately rather than conflated: it calls auth.admin.createUser with no',
        'rate limit, which is an abuse vector, not a cross-tenant one.',
        '',
        'Ratchet: 13 -> 11.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.737 pushed - bonuses GET closed" -ForegroundColor Green
}
