$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.226.ps1") { Remove-Item -LiteralPath "push_v3.74.226.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.227"') {
    Write-Host "+ 3.74.227" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

# Guard 1: interactive demo page exists
if (-not (Test-Path "app/demo/page.tsx")) {
    Write-Host "X app/demo/page.tsx missing" -ForegroundColor Red; exit 1
}
Write-Host "+ /demo page created" -ForegroundColor Green

# Guard 2: Watch Demo button no longer points at the dead #demo anchor
$hero = Get-Content -LiteralPath "components/landing/HeroSection.tsx" -Raw
if ($hero -match 'href="#demo"') {
    Write-Host "X HeroSection still points at #demo anchor" -ForegroundColor Red; exit 1
}
if ($hero -notmatch '/demo\?lang=') {
    Write-Host "X HeroSection 'Watch Demo' button not pointing at /demo" -ForegroundColor Red; exit 1
}
Write-Host "+ 'Watch Demo' button routes to /demo with language" -ForegroundColor Green

# Guard 3: mobile menu now includes a language switcher
$page = Get-Content -LiteralPath "app/page.tsx" -Raw
if ($page -notmatch 'تَغيير اللُّغَة' -or $page -notmatch 'Change language') {
    Write-Host "X mobile menu language switcher not surfaced" -ForegroundColor Red; exit 1
}
Write-Host "+ mobile menu shows language switcher" -ForegroundColor Green

# Guard 4: video script exists
if (-not (Test-Path "docs/DEMO_VIDEO_SCRIPT.md")) {
    Write-Host "X docs/DEMO_VIDEO_SCRIPT.md missing" -ForegroundColor Red; exit 1
}
Write-Host "+ demo video script + storyboard committed" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_227.txt"
    $msgLines = @(
        "feat(landing): v3.74.227 - interactive demo + mobile language switcher",
        "",
        "Two observations on the public 7esab.com landing page:",
        "",
        "1) The 'Watch Demo' (شاهد العرض التوضيحى) button pointed at #demo,",
        "   which was a dead anchor - no such section existed on the page.",
        "   Clicking it did nothing.",
        "",
        "   Fix: created app/demo/page.tsx - an auto-playing, bilingual",
        "   walkthrough of the sales+accounting cycle:",
        "     hero -> modules -> multi-currency invoice -> credit refund",
        "     -> live dashboard -> CTA",
        "   Six scenes, ~6 seconds each, with onscreen captions in the",
        "   user's language. Pause / restart / scene jump controls. Audio-",
        "   free so it plays under autoplay restrictions. Language picked",
        "   from ?lang= query string then localStorage. The hero CTA now",
        "   routes to /demo?lang=<current> instead of the dead anchor.",
        "",
        "   For users who want a real MP4 later, docs/DEMO_VIDEO_SCRIPT.md",
        "   contains a 60-75 second bilingual script + storyboard +",
        "   recording checklist + post-production guide. Drop the recorded",
        "   MP4s into public/demo/ and we can swap the interactive walk-",
        "   through for the video.",
        "",
        "2) The language switcher (EN / عربى) was inside the desktop nav's",
        "   'hidden md:flex' container. Mobile visitors had no way to",
        "   switch language without opening DevTools or clearing storage.",
        "",
        "   Fix in app/page.tsx mobile menu: added a clear",
        "   'تَغيير اللُّغَة' / 'Change language' button that persists the",
        "   choice to localStorage and closes the menu after switching.",
        "",
        "  app/demo/page.tsx (new)",
        "  components/landing/HeroSection.tsx",
        "  app/page.tsx",
        "  docs/DEMO_VIDEO_SCRIPT.md (new)",
        "  lib/version.ts -> 3.74.227"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.227 pushed" -ForegroundColor Green
}
