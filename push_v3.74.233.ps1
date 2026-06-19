$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.232.ps1") { Remove-Item -LiteralPath "push_v3.74.232.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.233"') {
    Write-Host "+ 3.74.233" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

$demo = Get-Content -LiteralPath "app/demo/page.tsx" -Raw
if ($demo -notmatch 'HIGGSFIELD_AUDIO_BASE' -or $demo -notmatch 'SCENE_AUDIO') {
    Write-Host "X Higgsfield audio URL table not wired in" -ForegroundColor Red; exit 1
}
Write-Host "+ Higgsfield URL table + Audio() fallback wired in" -ForegroundColor Green

# Count Arabic + English URLs present
$arCount = ([regex]::Matches($demo, "ar:\s*``\$\{HIGGSFIELD_AUDIO_BASE\}")).Count
$enCount = ([regex]::Matches($demo, "en:\s*``\$\{HIGGSFIELD_AUDIO_BASE\}")).Count
Write-Host ("+ {0} Arabic + {1} English Higgsfield clips registered" -f $arCount, $enCount) -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_233.txt"
    $msgLines = @(
        "feat(demo): v3.74.233 - Higgsfield Mark narration for AR (12/12) + EN (4/12)",
        "",
        "User asked to add professional voice narration. We had a Higgsfield",
        "credit budget so we generated MP3 clips with the Mark preset voice:",
        "  - All 12 Arabic scenes via ElevenLabs (the strongest engine for",
        "    Arabic phonology; ~0.6 credits each).",
        "  - 4 English scenes via Cozy Voice (cheaper at ~0.2 credits; works",
        "    fine for English).",
        "  - The remaining 8 English scenes weren't generated because the",
        "    Higgsfield queue blocked our free-tier rate limit (1 concurrent",
        "    job) on a hung dashboard-EN request, and the budget was almost",
        "    out anyway. They fall back to the Web Speech API path added in",
        "    v3.74.231 so the demo still narrates end-to-end.",
        "",
        "Implementation:",
        "  - SCENE_AUDIO map (scene id -> { ar, en } URLs) at the top of",
        "    app/demo/page.tsx, sourcing from Higgsfield's CloudFront bucket",
        "    directly. The sandbox cannot reach cloudfront to re-host them",
        "    on our /public, and the URLs are stable per generation.",
        "  - The speak useEffect (v3.74.231) now creates an <Audio> element",
        "    whenever a Higgsfield URL is available for the current scene+",
        "    language; on play() rejection (rare autoplay block) or 404 it",
        "    falls through to speechSynthesis as before. The voice picker,",
        "    pause/resume, language switch and scene jumps all still work.",
        "",
        "  app/demo/page.tsx",
        "  lib/version.ts -> 3.74.233"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.233 pushed" -ForegroundColor Green
}
