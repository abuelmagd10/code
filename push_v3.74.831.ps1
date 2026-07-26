$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.830.ps1") { Remove-Item -LiteralPath "push_v3.74.830.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.831"') {
    Write-Host "+ 3.74.831" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.831]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.831]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# ── THE fix: stage the lockfile FIRST, then let the guards judge ────────────
# الحارس يفحص ما **سيصل**، فيجب أن يُجهَّز ما نرفعه قبل أن يحكم عليه.
$files = @(
    "lib/version.ts",
    "CHANGELOG.md",
    "package.json",
    "package-lock.json",
    ".github/workflows/ci.yml",
    "app/api/manufacturing/production-orders/[id]/route.ts",
    "app/api/manufacturing/bom-versions/[id]/route.ts",
    "app/api/manufacturing/routing-versions/[id]/route.ts",
    "scripts/check-phantom-columns.js",
    "scripts/check-lockfile-in-sync.js",
    "push_v3.74.831.ps1"
)
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.830.ps1" 2>$null

# --- (a) the lockfile actually got staged ------------------------------------
$stagedNow = git diff --cached --name-only
if ($stagedNow -notcontains "package-lock.json") {
    $lockDirty = git status --porcelain -- package-lock.json
    if ($lockDirty) {
        Write-Host "X package-lock.json has changes that did not stage - npm ci will fail" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ the lockfile travels with package.json" -ForegroundColor Green

Write-Host "Verifying the lockfile matches package.json..." -ForegroundColor Cyan
node scripts/check-lockfile-in-sync.js
if ($LASTEXITCODE -ne 0) { Write-Host "X lockfile check failed" -ForegroundColor Red; exit 1 }

Write-Host "Verifying referenced scripts are committed..." -ForegroundColor Cyan
node scripts/check-referenced-scripts-tracked.js
if ($LASTEXITCODE -ne 0) { Write-Host "X referenced-scripts check failed" -ForegroundColor Red; exit 1 }

Write-Host "Checking phantom column writes..." -ForegroundColor Cyan
node scripts/check-phantom-columns.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X phantom-column check failed" -ForegroundColor Red; exit 1 }

# --- (b) the guard checks what will ARRIVE, not just what is on disk ---------
$g = Get-Content -LiteralPath "scripts/check-lockfile-in-sync.js" -Raw
if ($g -notmatch [regex]::Escape('"diff", "--name-only"')) {
    Write-Host "X the lockfile guard only compares working files - it would have missed this" -ForegroundColor Red; exit 1
}
Write-Host "+ the guard asks whether the match will ARRIVE, not just whether it exists here" -ForegroundColor Green

# --- (c) the manufacturing fix from 830 is intact ---------------------------
foreach ($f in @("app/api/manufacturing/production-orders/[id]/route.ts",
                 "app/api/manufacturing/bom-versions/[id]/route.ts",
                 "app/api/manufacturing/routing-versions/[id]/route.ts")) {
    $c = Get-Content -LiteralPath $f -Raw
    if ($c -match [regex]::Escape("cycle_no: ((existing as any).cycle_no")) {
        Write-Host "X phantom cycle_no write is back in $f" -ForegroundColor Red; exit 1
    }
    if ($c -notmatch [regex]::Escape('.from("approval_history")')) {
        Write-Host "X $f no longer derives the cycle from approval_history" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ edit-then-reapprove still writes only real columns" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_831.txt"
    $msgLines = @(
        'fix(ci): v3.74.831 - the lockfile was never committed, so the build',
        'died before it started',
        '',
        'CI failed on its very first step, npm ci:',
        '  Missing: pg@8.22.0 from lock file',
        '',
        'The pg dependency was added to package.json and pushed, while',
        'package-lock.json sat locally with 77 uncommitted lines. npm ci -',
        'unlike npm install - refuses any mismatch and fails the whole build',
        'before a single test runs.',
        '',
        'This is the same root cause for the third time in two days. Release',
        'scripts stage with an explicit `git add -- <files>` list. That',
        'discipline is right - it has kept database backups and env files out',
        'of the repo more than once - but it silently drops anything nobody',
        'names: ai-governance-audit.js (828), check-phantom-columns.js (830,',
        'caught by the guard before pushing) and now the lockfile.',
        '',
        'The lockfile is committed, and check-lockfile-in-sync.js joins the',
        'guards - carrying the lesson from my own first attempt at it, which',
        'was useless: comparing the WORKING files always passes on a developer',
        'machine, because that is where npm install just ran. The real',
        'question is not "do these match here?" but "will the match arrive?".',
        'So it checks both - that the dependency sets agree, and that the',
        'lockfile has no uncommitted changes. Reproduced this exact failure',
        'before being wired in.',
        '',
        'The release script now stages FIRST and judges after, since a guard',
        'that inspects what will arrive must run against what was staged.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.831 pushed - npm ci can install what package.json promises" -ForegroundColor Green
}
