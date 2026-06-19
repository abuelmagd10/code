$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.233.ps1") { Remove-Item -LiteralPath "push_v3.74.233.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.234"') {
    Write-Host "+ 3.74.234" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

# Guard 1: Volume2/VolumeX removed from imports + UI
$demo = Get-Content -LiteralPath "app/demo/page.tsx" -Raw
if ($demo -match 'Volume2' -or $demo -match 'VolumeX') {
    Write-Host "X audio toggle icons still referenced in /demo" -ForegroundColor Red; exit 1
}
Write-Host "+ Volume2 / VolumeX removed - no more sound on/off button" -ForegroundColor Green

# Guard 2: audioEnabled is no longer a useState (always-on derivation)
if ($demo -match 'useState\(false\).*audioEnabled' -or $demo -match 'setAudioEnabled\(') {
    Write-Host "X audioEnabled is still mutable - should be a constant" -ForegroundColor Red; exit 1
}
if ($demo -notmatch 'const audioEnabled = audioSupported') {
    Write-Host "X audioEnabled is not derived from audioSupported" -ForegroundColor Red; exit 1
}
Write-Host "+ audioEnabled now constant-true on supported browsers" -ForegroundColor Green

# Guard 3: unlock-on-first-interaction listener present (autoplay workaround)
if ($demo -notmatch 'unlockKey') {
    Write-Host "X autoplay unlock-on-first-interaction listener missing" -ForegroundColor Red; exit 1
}
Write-Host "+ autoplay re-trigger on first interaction installed" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_234.txt"
    $msgLines = @(
        "feat(demo): v3.74.234 - narration always on, remove sound-on/off toggle",
        "",
        "User asked to drop the Volume2/VolumeX button and have the demo",
        "narration always play.",
        "",
        "Changes in app/demo/page.tsx:",
        "  - Remove the audioOn/Off toolbar button and the lucide-react",
        "    Volume2/VolumeX imports.",
        "  - audioEnabled is no longer a useState - it is now",
        "      const audioEnabled = audioSupported",
        "    so it's constant-true on capable browsers and constant-false",
        "    on the rare browser without speechSynthesis.",
        "  - Remove the demo_audio_enabled localStorage read on init - no",
        "    longer relevant.",
        "",
        "Autoplay handling:",
        "  Most browsers block audio autoplay until the page receives a",
        "  user gesture. Next.js client navigation from the landing page",
        "  CTA doesn't always carry that gesture. To make sure narration",
        "  starts as soon as the user interacts, we install one-shot",
        "  pointerdown/keydown/touchstart listeners that bump an unlockKey",
        "  state; the speak effect lists unlockKey in its deps and re-",
        "  triggers play() at that moment. After the first click the demo",
        "  speaks for the rest of the visit without further nudging.",
        "",
        "Voice picker (Mic2 button) and the global Pause/Restart controls",
        "stay; the user can still mute by hitting the OS volume.",
        "",
        "  app/demo/page.tsx",
        "  lib/version.ts -> 3.74.234"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.234 pushed" -ForegroundColor Green
}
