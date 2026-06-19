$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.229.ps1") { Remove-Item -LiteralPath "push_v3.74.229.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.230"') {
    Write-Host "+ 3.74.230" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

# Guard 1: HeroLoopVideo removed
$demo = Get-Content -LiteralPath "app/demo/page.tsx" -Raw
if ($demo -match 'HeroLoopVideo' -or $demo -match 'hero-loop\.mp4') {
    Write-Host "X HeroLoopVideo still referenced in /demo" -ForegroundColor Red; exit 1
}
Write-Host "+ HeroLoopVideo removed" -ForegroundColor Green

# Guard 2: new scenes added
$expected = @("purchases","inventory","banking","reports","payroll","manufacturing")
foreach ($k in $expected) {
    if ($demo -notmatch "kind:\s*`"$k`"") {
        Write-Host "X scene '$k' missing from SCENES array" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ 6 new scenes added (purchases / inventory / banking / reports / payroll / manufacturing)" -ForegroundColor Green

# Guard 3: matching SceneCanvas cases
$mocks = @("PurchasesMock","InventoryMock","BankingMock","ReportsMock","PayrollMock","ManufacturingMock")
foreach ($m in $mocks) {
    if ($demo -notmatch "$m") {
        Write-Host "X mock component '$m' not defined" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ all 6 mock components defined" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_230.txt"
    $msgLines = @(
        "feat(demo): v3.74.230 - revert hero video, expand walkthrough to cover all modules",
        "",
        "User feedback on v3.74.229: the Higgsfield AI hero loop didn't feel",
        "right ('لم يعجبنى الفيديو خلينا ذى ما احنا'). User asked instead",
        "to broaden the interactive walkthrough to cover more of the app's",
        "modules.",
        "",
        "Changes:",
        "  - Remove HeroLoopVideo component + the cinematic_studio_video MP4",
        "    embed from /demo (back to v3.74.228 layout).",
        "  - Expand SCENES from 6 to 12, inserting 6 new mocks between the",
        "    Dashboard scene and the CTA:",
        "      * Purchases & Bills    (PO + multi-level approval workflow)",
        "      * Inventory & FIFO     (stock balances table with lot costing)",
        "      * Banking & Recon      (multi-currency accounts + reconciliation)",
        "      * Reports              (P&L / BS / AR aging / cash flow tiles)",
        "      * HR & Payroll         (monthly payroll run with employees)",
        "      * Manufacturing        (work order + BOM consumption + unit cost)",
        "  - Side-panel scene picker auto-handles the longer list.",
        "  - Full cycle now ~72 seconds (12 scenes x 6s) instead of 36s.",
        "",
        "  app/demo/page.tsx",
        "  lib/version.ts -> 3.74.230"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.230 pushed" -ForegroundColor Green
}
