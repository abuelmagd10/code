$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.230.ps1") { Remove-Item -LiteralPath "push_v3.74.230.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.231"') {
    Write-Host "+ 3.74.231" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

# Guard 1: audio toggle UI present
$demo = Get-Content -LiteralPath "app/demo/page.tsx" -Raw
if ($demo -notmatch 'audioEnabled' -or $demo -notmatch 'Volume2' -or $demo -notmatch 'VolumeX') {
    Write-Host "X audio toggle not wired into /demo toolbar" -ForegroundColor Red; exit 1
}
Write-Host "+ audio toggle (Volume2/VolumeX) present in /demo toolbar" -ForegroundColor Green

# Guard 2: speechSynthesis path
if ($demo -notmatch 'speechSynthesis' -or $demo -notmatch 'SpeechSynthesisUtterance' -or $demo -notmatch 'ar-EG' -or $demo -notmatch 'en-US') {
    Write-Host "X Web Speech API integration incomplete" -ForegroundColor Red; exit 1
}
Write-Host "+ Web Speech API picks ar-EG for Arabic and en-US for English" -ForegroundColor Green

# Guard 3: narration fields present on at least the 12 scenes
$count = ([regex]::Matches($demo, "narrationAr:")).Count
if ($count -lt 12) {
    Write-Host "X only $count narration lines found, expected >= 12" -ForegroundColor Red; exit 1
}
Write-Host "+ $count Arabic narration strings + matching English (one per scene)" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_231.txt"
    $msgLines = @(
        "feat(demo): v3.74.231 - narrated walkthrough via Web Speech API",
        "",
        "User asked for spoken narration on each /demo scene, Arabic when",
        "the page is in Arabic and English when in English.",
        "",
        "Implementation: the browser's built-in Web Speech API",
        "(window.speechSynthesis). No external service, no credits, no",
        "extra files to ship - free and instant.",
        "",
        "Changes:",
        "  - Scene type extended with optional narrationAr / narrationEn.",
        "  - Each of the 12 scenes given 1-3 sentence richer narration",
        "    written for spoken delivery (the existing captions stay as the",
        "    onscreen subtitle text).",
        "  - New toolbar button: Volume2/VolumeX with a clear label",
        "    ('Sound on' / 'تَشغيل الصَّوت'). Choice persists in",
        "    localStorage('demo_audio_enabled').",
        "  - useEffect re-speaks the right text on scene change, language",
        "    switch, or audio toggle. Cancels any in-flight utterance to",
        "    avoid overlap. Pauses speech when the visual playback is",
        "    paused.",
        "  - Voice selection: utter.lang plus best-match install voice",
        "    (some Android browsers ignore lang without an explicit voice).",
        "  - Graceful degradation: if speechSynthesis is missing the button",
        "    is hidden and the demo runs as before.",
        "",
        "  app/demo/page.tsx",
        "  lib/version.ts -> 3.74.231"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.231 pushed" -ForegroundColor Green
}
