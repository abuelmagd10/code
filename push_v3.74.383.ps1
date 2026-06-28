$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.382.ps1") { Remove-Item -LiteralPath "push_v3.74.382.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.383"') {
    Write-Host "+ 3.74.383" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260628000383_v3_74_383_invitation_flow_per_license.sql"
if (Test-Path -LiteralPath $mig) {
    Write-Host "+ migration 383" -ForegroundColor Green
} else { Write-Host "X missing migration 383" -ForegroundColor Red; exit 1 }

$migContent = Get-Content -LiteralPath $mig -Raw
foreach ($n in @(
    'get_seat_status',
    'assign_next_seat_number',
    'activate_seat',
    'license_count',
    'empty_active',
    'assigned_user_id IS NULL',
    'expires_at > NOW()'
)) {
    if ($migContent -notmatch [regex]::Escape($n)) {
        Write-Host "X migration missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ migration covers all three invitation-flow RPCs" -ForegroundColor Green

$susp = Get-Content -LiteralPath "app/suspended/page.tsx" -Raw
foreach ($n in @(
    'export const revalidate = 0',
    'fetchCache = "force-no-store"'
)) {
    if ($susp -notmatch [regex]::Escape($n)) {
        Write-Host "X suspended page missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ suspended page set to never cache" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $err TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 15 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_383.txt"
    $msgLines = @(
        'feat(seats): v3.74.383 - invitation flow per-license (Stage 6 of 6)',
        '',
        'Final stage of the per-seat license rollout. The buy / renew /',
        'swap flows already spoke the new model; the invitation flow',
        '(invite -> reserve -> accept -> activate) still ran against',
        'the legacy total_paid_seats counter. Three RPCs needed to',
        'become license-aware:',
        '',
        '1. get_seat_status',
        '   - available_seats was total_paid_seats - active_members.',
        '   - now: count of seats where assigned_user_id IS NULL AND',
        '     expires_at > NOW(), minus pending invitations.',
        '   - exposes license_count + empty_active for diagnostics.',
        '   - falls back to the legacy math when a company has zero',
        '     license rows (free tier / pre-migration).',
        '',
        '2. assign_next_seat_number',
        '   - was MAX(seat_number)+1 on company_members.',
        '   - could place a fresh invitee on an expired seat.',
        '   - now: lowest seat_number of an empty active license that',
        '     isnt already reserved by a pending invitation.',
        '   - same legacy fallback.',
        '',
        '3. activate_seat',
        '   - only wrote company_members.seat_number on accept.',
        '   - new model also needs company_seat_licenses.assigned_user',
        '     _id stamped, or the per-license access check would block',
        '     the brand-new member from their first request.',
        '   - now also UPDATEs the license row for the seat number,',
        '     setting assigned_user_id + assigned_at.',
        '',
        '/suspended page polish',
        '   - added export const revalidate = 0 and fetchCache =',
        '     "force-no-store" so a renewed/swapped member sees the',
        '     fresh result on the next request instead of a stale',
        '     suspended snapshot served from a cache.',
        '',
        'Rollout complete',
        '  v3.74.377 - foundation (table + backfill + test seed)',
        '  v3.74.378 - read-only UI shows per-seat dates',
        '  v3.74.379 - arrows move users between seats + per-license',
        '              suspension',
        '  v3.74.380 - /suspended redirect-loop hotfix',
        '  v3.74.381 - buying creates per-seat licenses',
        '  v3.74.382 - renewal flow (one / many / all-expired)',
        '  v3.74.383 - invitation flow per-license + polish <- this',
        '',
        'Files',
        '  supabase/migrations/20260628000383_v3_74_383_invitation_flow_per_license.sql',
        '  app/suspended/page.tsx',
        '  lib/version.ts -> 3.74.383',
        '',
        'Note',
        '  Migration applied to live DB via Supabase MCP.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.383 pushed - seat license rollout COMPLETE" -ForegroundColor Green
}
