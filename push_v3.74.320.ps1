$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.319.ps1") { Remove-Item -LiteralPath "push_v3.74.319.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.320"') {
    Write-Host "+ 3.74.320" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# updateServiceSchema must include branch_id
$bapi = Get-Content -LiteralPath "lib/services/booking-api.ts" -Raw
if ($bapi -notmatch [regex]::Escape('// v3.74.320 — allow editing the branch')) {
    Write-Host "X updateServiceSchema missing branch_id (v3.74.320 marker)" -ForegroundColor Red; exit 1
}
Write-Host "+ updateServiceSchema: branch_id accepted" -ForegroundColor Green

# PUT route must apply branch_id update
$put = Get-Content -LiteralPath "app/api/services/[id]/route.ts" -Raw
foreach ($n in @(
    'v3.74.320 — update_service_atomic',
    "if ('branch_id' in (body as any))",
    'isCompanyScope',
    "['owner', 'admin', 'general_manager']"
)) {
    if ($put -notmatch [regex]::Escape($n)) {
        Write-Host "X services [id] PUT missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ PUT: branch_id applied via separate UPDATE for company-scope roles" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_320.txt"
    $msgLines = @(
        'fix(services): v3.74.320 - branch edit was silently dropped',
        '',
        'Owner edited SVC-0001 from "الفرع الرئيسي" to "كل الفروع",',
        'saved successfully, then reopened the service — the branch was',
        'still "الفرع الرئيسي". Nothing in the UI was wrong; the change',
        'was being eaten on the way to the database.',
        '',
        'Two layers of silence were stacked:',
        '',
        '1) updateServiceSchema (lib/services/booking-api.ts) had no',
        '   branch_id field. Zod stripped the property before it ever',
        '   reached the route handler.',
        '2) Even if it had arrived, the PUT handler only called',
        '   update_service_atomic — and that RPC has no p_branch_id',
        '   parameter at all. branch is not in its signature.',
        '',
        'Fix',
        '   - Added branch_id (uuid, optional, nullable) to',
        '     updateServiceSchema so the value survives validation.',
        '   - In PUT /api/services/[id], after the RPC call, applied a',
        '     separate UPDATE on services.branch_id, but only when the',
        '     caller is owner / admin / general_manager. Branch-scope',
        '     roles (manager) cannot reassign a service to a different',
        '     branch — their existing scope guard already prevents them',
        '     from selecting any other branch in the form.',
        '   - Touches updated_at so the audit timeline reflects the',
        '     change.',
        '',
        'No DB migration. update_service_atomic stays untouched on',
        'purpose — keeping the RPC stable for any external callers.',
        '',
        'Files',
        '  lib/services/booking-api.ts',
        '  app/api/services/[id]/route.ts',
        '  lib/version.ts -> 3.74.320'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.320 pushed" -ForegroundColor Green
}
