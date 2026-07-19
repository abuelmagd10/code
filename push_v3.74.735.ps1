$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.734.ps1") { Remove-Item -LiteralPath "push_v3.74.734.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.735"') {
    Write-Host "+ 3.74.735" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.735]")) { Write-Host "X CHANGELOG missing [3.74.735]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

# The whole point of this release. TRIGGER is also a table privilege, so every
# GRANT line contains it; matching the bare word counted tables as triggers and
# wrote 1359 into the snapshot header.
$js = Get-Content -LiteralPath "scripts/dump-db-schema.js" -Raw
if ($js -notmatch [regex]::Escape('CREATE (?:CONSTRAINT )?TRIGGER ')) {
    Write-Host "X the trigger counter no longer matches the statement - it will miscount again" -ForegroundColor Red; exit 1
}
if ($js -match 'count\("TRIGGER"\)') {
    Write-Host "X the bare-word TRIGGER count is back - GRANT lines will inflate it" -ForegroundColor Red; exit 1
}
Write-Host "+ trigger counter matches statements, not the word" -ForegroundColor Green

Write-Host "Regenerating snapshot..." -ForegroundColor Cyan
node scripts/dump-db-schema.js
if ($LASTEXITCODE -ne 0) { Write-Host "X schema dump failed" -ForegroundColor Red; exit 1 }

$snap = Get-Content -LiteralPath "supabase/schema/schema.sql" -Raw

# Verify the header states the truth, since stating the truth is this file's job.
$trg = ([regex]::Matches($snap, "CREATE (CONSTRAINT )?TRIGGER ")).Count
if ($snap -notmatch "Triggers: $trg\b") {
    Write-Host "X the snapshot header disagrees with its own contents (counted $trg)" -ForegroundColor Red; exit 1
}
if ($trg -lt 450 -or $trg -gt 900) {
    Write-Host "X trigger count $trg is outside the plausible range - counting is wrong again" -ForegroundColor Red; exit 1
}
$pol = ([regex]::Matches($snap, "CREATE POLICY")).Count
Write-Host "  triggers=$trg policies=$pol chars=$($snap.Length)" -ForegroundColor DarkGray
Write-Host "+ header matches contents" -ForegroundColor Green

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
    "scripts/dump-db-schema.js" `
    "supabase/schema/schema.sql" `
    "push_v3.74.735.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.734.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_735.txt"
    $msgLines = @(
        'fix(db): v3.74.735 - the trigger count in the baseline header was wrong',
        '',
        'v3.74.734 reported triggers=1359. The database has 501.',
        '',
        'I introduced this while fixing the opposite error. Counting "CREATE',
        'TRIGGER" gave 499 against 501; I checked, found two CONSTRAINT triggers',
        'emitted as "CREATE CONSTRAINT TRIGGER", and wrote that up as an example of',
        'verifying rather than assuming. Then I corrected it by matching the bare',
        'word TRIGGER.',
        '',
        'TRIGGER is also a table privilege. Every grant line reads "GRANT DELETE,',
        'INSERT, REFERENCES, SELECT, TRIGGER, ..." - so the fix counted tables as',
        'triggers.',
        '',
        'This matters more than a bad statistic because the number was written into',
        'the header of schema.sql, a file whose only job is to state what production',
        'contains. A reference that lies in its first line. Anyone reading it next',
        'year to size the system would have believed 1359.',
        '',
        'Fourth instance of the same mistake today: v3.74.726 matched a function',
        'NAME and rejected its own comment; v3.74.727 matched cost_price and',
        'rejected its own explanation; v3.74.733 matched an API path and rejected',
        'its own documentation; this matched a keyword and counted privileges. The',
        'word is not the meaning - match the statement.',
        '',
        'The push guard now also checks the header against the file contents, so a',
        'snapshot that misdescribes itself cannot be committed.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.735 pushed - baseline header now tells the truth" -ForegroundColor Green
}
