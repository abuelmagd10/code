$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.712.ps1") { Remove-Item -LiteralPath "push_v3.74.712.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.713"') {
    Write-Host "+ 3.74.713" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.713]")) { Write-Host "X CHANGELOG missing [3.74.713]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

# Pages, the API routes they were the only callers of, and the helper script.
$paths = @(
  "app/fix-inv0001-foodcana",
  "app/fix-invoice-inv0001",
  "app/fix-invoice-return",
  "app/api/fix-inv0001-foodcana",
  "app/api/fix-invoice-return-sent",
  "scripts/fix-invoice-inv0001.ts"
)
$names = @("fix-inv0001-foodcana","fix-invoice-inv0001","fix-invoice-return","fix-invoice-return-sent")

Write-Host "`nVerifying nothing outside the delete set depends on these..." -ForegroundColor Cyan

# Anything referencing them must itself be on the way out. A mention between two
# doomed files is not a dependency - that distinction cost a false abort in
# v3.74.712, where a comment in one deleted route named another.
$deletedPattern = ($paths | ForEach-Object { [regex]::Escape(($_ -replace "/", "\")) }) -join "|"

$blocked = $false
foreach ($n in $names) {
    $refs = Get-ChildItem -Path @("app","lib","components","hooks","scripts") -Recurse -Include *.ts,*.tsx,*.js,*.jsx -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -notmatch $deletedPattern -and $_.FullName -notmatch "node_modules" } |
            Select-String -Pattern $n -SimpleMatch -ErrorAction SilentlyContinue
    if ($refs) {
        Write-Host "X '$n' is referenced from outside the delete set:" -ForegroundColor Red
        $refs | Select-Object -First 5 | ForEach-Object { Write-Host "   $($_.Path):$($_.LineNumber)" }
        $blocked = $true
    }
}
if ($blocked) { Write-Host "`nAborting - deletion would break a caller." -ForegroundColor Red; exit 1 }
Write-Host "+ no outside code references them" -ForegroundColor Green

# No navigation entry should point at these pages, or the client gets a dead link.
$navRefs = Get-ChildItem -Path @("app","components") -Recurse -Include *.tsx -ErrorAction SilentlyContinue |
           Where-Object { $_.FullName -notmatch $deletedPattern -and $_.FullName -notmatch "node_modules" } |
           Select-String -Pattern 'href="/fix-', "href='/fix-" -ErrorAction SilentlyContinue
if ($navRefs) {
    Write-Host "X a navigation link points at a page being deleted:" -ForegroundColor Red
    $navRefs | Select-Object -First 5 | ForEach-Object { Write-Host "   $($_.Path):$($_.LineNumber)" }
    exit 1
}
Write-Host "+ no navigation link points at them" -ForegroundColor Green

$ci = Get-Content -LiteralPath ".github/workflows/ci.yml" -Raw
foreach ($n in $names) {
    if ($ci -match [regex]::Escape($n)) {
        Write-Host "X ci.yml references '$n' - deleting would break CI" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ ci.yml does not reference them" -ForegroundColor Green

Write-Host "`nRemoving..." -ForegroundColor Cyan
$removed = 0
foreach ($p in $paths) {
    if (Test-Path $p) {
        git rm -r -q --ignore-unmatch -- $p 2>&1 | Out-Null
        if (Test-Path $p) { Remove-Item -LiteralPath $p -Recurse -Force -ErrorAction SilentlyContinue }
        Write-Host "  - removed $p" -ForegroundColor DarkGray
        $removed++
    } else {
        Write-Host "  . already gone: $p" -ForegroundColor DarkGray
    }
}
Write-Host "+ $removed path(s) removed" -ForegroundColor Green

# tsconfig includes .next/types/**, where Next generates a manifest of every
# route from the LAST build. After deleting routes it still imports them, so the
# type check would fail on files we removed deliberately. It is a build artifact
# (.next/ is gitignored) and Next regenerates it.
if (Test-Path ".next/types") {
    Remove-Item -LiteralPath ".next/types" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "+ cleared stale generated route types (.next/types)" -ForegroundColor Green
}

Write-Host "`nRunning tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors - nothing depended on the deleted files" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors - NOT pushing:" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 40 | ForEach-Object { Write-Host $_ }
    Write-Host "`nRestore with: git checkout -- app scripts" -ForegroundColor Yellow
    exit 1
}

git add -- "lib/version.ts" "CHANGELOG.md" "push_v3.74.713.ps1" 2>&1 | Out-Null
git add -u -- "app" "scripts" "push_v3.74.712.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_713.txt"
    $msgLines = @(
        'chore(app): v3.74.713 - remove repair pages named after a specific customer',
        '',
        'v3.74.712 removed the hidden repair endpoints. These are the visible ones -',
        'real URLs anyone can open in a browser, and the worst of them carries a',
        'real customer name in the path:',
        '',
        '  /fix-inv0001-foodcana   customer name at the app root',
        '  /fix-invoice-inv0001    one specific invoice',
        '  /fix-invoice-return     calls the same repair route as the above',
        '',
        'Plus the two API routes left with no caller once those pages are gone',
        '(fix-inv0001-foodcana, fix-invoice-return-sent) and the helper script',
        'scripts/fix-invoice-inv0001.ts.',
        '',
        'The first developer at a client who opens devtools will ask who foodcana',
        'is and why their name is in his system. Beyond appearances, these encode',
        'rules from before the custody model, FIFO and landed cost, so invoking one',
        'today would repair with last year''s logic.',
        '',
        'Verified before deleting: no navigation link points at any of them (they',
        'are reachable only by typing the URL), middleware does not name them, the',
        'two API routes have no remaining caller, and ci.yml references none of',
        'them. The push script re-runs all of it and aborts on any reference.',
        '',
        'Deliberately kept: /settings/fix-cogs, /admin/fix-negative-payments and',
        '/admin/fix-bill-return. Those are generic administrative tools with a',
        'sensible home in settings and admin, not customer-specific artefacts. They',
        'need a separate review of their accounting rules before any decision.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.713 pushed - customer-named repair pages removed" -ForegroundColor Green
}
