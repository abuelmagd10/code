# v3.56.1 - Hotfix: visual fixes in AI assistant (duplicate numbers, bullets, UUID leak)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Verify markers ===" -ForegroundColor Cyan
$panel = Get-Content "components/ai-assistant/guide-panel.tsx" -Raw

$checks = @(
    @{ p = 'list-none space-y-2.5 p-0';      m = "<ol> uses list-none to remove duplicate numbering" },
    @{ p = 'list-none space-y-2 p-0';        m = "<ul> uses list-none to remove duplicate bullets" },
    @{ p = 'sanitizeUserFacingText';         m = "sanitizeUserFacingText function present" },
    @{ p = '\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}'; m = "UUID regex stripper present" },
    @{ p = 'الطبقة المحلية';                  m = "developer phrase replacement present" }
)

foreach ($c in $checks) {
    if ($panel -match $c.p) {
        Write-Host ("  + " + $c.m) -ForegroundColor Green
    } else {
        Write-Host ("  X " + $c.m + " -- pattern not found: " + $c.p) -ForegroundColor Red
        exit 1
    }
}

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tscOutput = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "TypeScript errors:" -ForegroundColor Red
    Write-Host ($tscOutput | Out-String)
    exit 1
}
Write-Host "+ TypeScript: OK" -ForegroundColor Green

Write-Host "`n=== Cleanup stale git locks ===" -ForegroundColor Cyan
if (Test-Path ".git/index.lock") {
    Remove-Item ".git/index.lock" -Force
    Write-Host "  + Removed stale .git/index.lock" -ForegroundColor Green
} else {
    Write-Host "  + No stale lock" -ForegroundColor Green
}

Write-Host "`n=== Stage + commit ===" -ForegroundColor Cyan
git add components/ai-assistant/guide-panel.tsx CHANGELOG.md
git --no-pager diff --cached --stat
git commit -m "fix(ai-assistant): v3.56.1 hotfix - visual bugs (duplicate markers, UUID leak)

User-reported issues after v3.56.0:

1) Duplicate numbering in StepsCard
   '1. 1', '2. 2', etc - <ol> default counter + custom badge
   Fix: list-none p-0 on <ol> + list-none on <li>

2) Duplicate bullets in TipsCard
   '* .' - <ul> default bullet + custom span
   Fix: list-none p-0 on <ul> + list-none on <li>

3) Raw UUID exposed in permissions row
   'الشركة: 8ef6338c-1713-4202-98ac-...' - dev language
   Fix: sanitizeUserFacingText() strips UUIDs + empty
   labels ('Company:', 'Branch:', etc) + collapses
   leftover separators

4) Developer phrases in summary text
   'الطبقة المحلية' -> 'المساعد'
   'the local layer' -> 'the assistant'
   'fallback layer' -> 'safe mode'
   'governance summary' -> 'permissions'

All changes are pure UI. Zero backend impact.
TypeScript: OK" 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.56.1 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Test after Vercel rebuild:" -ForegroundColor Cyan
    Write-Host "  Open AI assistant -> Steps should show ONLY one number per step" -ForegroundColor White
    Write-Host "  Tips should show ONLY one bullet per tip" -ForegroundColor White
    Write-Host "  Permissions row should NOT contain raw UUIDs" -ForegroundColor White
    Write-Host "  Summary text should NOT contain 'الطبقة المحلية'" -ForegroundColor White
}
