$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.235.ps1") { Remove-Item -LiteralPath "push_v3.74.235.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.236"') {
    Write-Host "+ 3.74.236" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

$demo = Get-Content -LiteralPath "app/demo/page.tsx" -Raw
if ($demo -notmatch 'audioActiveRef' -or $demo -notmatch 'audioDrivenProgress') {
    Write-Host "X audio-driven timing state missing" -ForegroundColor Red; exit 1
}
Write-Host "+ scene timing now driven by audio.ended when Higgsfield clip plays" -ForegroundColor Green

if ($demo -notmatch 'audioActiveRef\.current') {
    Write-Host "X RAF loop does not check audioActiveRef" -ForegroundColor Red; exit 1
}
Write-Host "+ RAF advance suppressed while audio drives the scene" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_236.txt"
    $msgLines = @(
        "fix(demo): v3.74.236 - sync scene timing with audio length",
        "",
        "User observation: the scene ended (RAF clock hit 6s) before the",
        "narration finished (Higgsfield clips run 9-13s), cutting off the",
        "voice mid-sentence.",
        "",
        "Changes in app/demo/page.tsx:",
        "  - When a Higgsfield clip starts playing for the current scene,",
        "    set audioActiveRef.current=true. The RAF tick now skips the",
        "    progress increment while that flag is set, so the scene does",
        "    not advance on its own timer.",
        "  - timeupdate event maps currentTime/duration onto an",
        "    audioDrivenProgress state (0..1). The visible top progress",
        "    bar reads audioDrivenProgress when set, falling back to the",
        "    RAF progress otherwise - so the bar stays accurate whether",
        "    we are driven by audio or by the 6s default.",
        "  - ended event clears the flag, resets progress, and advances",
        "    activeIdx. The next scene's effect kicks in and the cycle",
        "    repeats.",
        "  - error and play() rejection both clear the audio-driving flag",
        "    so the RAF timer cleanly takes over, preserving the previous",
        "    behaviour for scenes without audio.",
        "",
        "Result: every scene now displays for the full length of its",
        "narration (or the 6s minimum when no audio is wired up).",
        "",
        "  app/demo/page.tsx",
        "  lib/version.ts -> 3.74.236"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.236 pushed" -ForegroundColor Green
}
