$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.236.ps1") { Remove-Item -LiteralPath "push_v3.74.236.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.237"') {
    Write-Host "+ 3.74.237" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

$demo = Get-Content -LiteralPath "app/demo/page.tsx" -Raw
if (([regex]::Matches($demo, 'audioDrivenProgress')).Count -ne 0) {
    Write-Host "X audioDrivenProgress still referenced - should be removed" -ForegroundColor Red; exit 1
}
Write-Host "+ audioDrivenProgress removed - progress drives both bar and canvas" -ForegroundColor Green

if ($demo -notmatch 'setProgress\(Math\.min\(1, a\.currentTime / a\.duration\)\)') {
    Write-Host "X timeupdate not feeding setProgress" -ForegroundColor Red; exit 1
}
Write-Host "+ audio timeupdate writes directly into progress state" -ForegroundColor Green

$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $err TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 10 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_237.txt"
    $msgLines = @(
        "fix(demo): v3.74.237 - keep mockups visible when audio drives the scene",
        "",
        "User reported the right-side mockup canvas (HeroMock, ModulesMock,",
        "InvoiceMock, ...) was rendering empty after v3.74.236.",
        "",
        "Root cause: v3.74.236 stopped the RAF tick from incrementing the",
        "`progress` state while the audio drove the scene. But every mock",
        "component reads `progress` to compute its opacity and",
        "translate-Y (e.g. const fade = Math.min(1, progress * 3)). With",
        "progress frozen at 0, the mockups stayed invisible. The audio-",
        "only progress state (audioDrivenProgress) was wired into the top",
        "bar but not into the mockups.",
        "",
        "Fix: the audio's timeupdate handler now writes directly into the",
        "main `progress` state (audio.currentTime / audio.duration), so",
        "the scene canvas animations and the top bar both follow the",
        "audio in lock-step. audioDrivenProgress was removed; one source",
        "of truth is enough.",
        "",
        "Behaviour:",
        "  - Scenes WITH a Higgsfield clip: progress + animations + scene",
        "    advance all driven by the audio.",
        "  - Scenes WITHOUT one: RAF tick advances progress as before",
        "    (audioActiveRef stays false), 6 s default duration.",
        "  - Pause / restart / scene jump / language switch all still work.",
        "",
        "  app/demo/page.tsx",
        "  lib/version.ts -> 3.74.237"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.237 pushed" -ForegroundColor Green
}
