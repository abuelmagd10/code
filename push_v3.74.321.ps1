$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.320.ps1") { Remove-Item -LiteralPath "push_v3.74.320.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.321"') {
    Write-Host "+ 3.74.321" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# تأكد إن schedules PUT بقى upsert
$sched = Get-Content -LiteralPath "app/api/services/[id]/schedules/route.ts" -Raw
foreach ($n in @(
    'v3.74.321 — switched from "DELETE + INSERT" to "UPSERT + DELETE',
    '.upsert(rows, { onConflict: ',
    'submittedDays',
    "not('day_of_week', 'in',"
)) {
    if ($sched -notmatch [regex]::Escape($n)) {
        Write-Host "X schedules route missing: $n" -ForegroundColor Red; exit 1
    }
}
# الـ pattern القديم (delete then insert) لازم يكون اتشال
if ($sched -match "const \{ error: delErr \} = await supabase\s*[\r\n]+\s*\.from\('service_schedules'\)\s*[\r\n]+\s*\.delete\(\)\s*[\r\n]+\s*\.eq\('service_id', serviceId\)\s*[\r\n]+\s*\.eq\('company_id', companyId\)\s*[\r\n]+\s*[\r\n]*if \(delErr\) throw delErr") {
    Write-Host "X old DELETE-then-INSERT pattern still present" -ForegroundColor Red; exit 1
}
Write-Host "+ schedules PUT: UPSERT + prune (no more 409 on branch change)" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_321.txt"
    $msgLines = @(
        'fix(services): v3.74.321 - schedules save 409 after branch change',
        '',
        'Owner edited SVC-0001 to change its branch. The service itself',
        'updated correctly (v3.74.320 wiring is fine), but the follow-up',
        'request that rewrites the weekly schedule grid came back as',
        'HTTP 409 (PostgREST error 23505, unique violation on',
        'uq_service_schedules_service_day).',
        '',
        'Cause',
        '   PUT /api/services/[id]/schedules used a "DELETE everything',
        '   for this service, then INSERT the new rows" pattern. The two',
        '   statements are independent requests against Supabase — not',
        '   one transaction. When the service branch_id has just',
        '   changed, the old schedule rows still carry the OLD branch_id',
        '   on disk, and the SELECT-side RLS policy on service_schedules',
        '   evaluates can_access_record_branch against THAT old branch.',
        '   The DELETE only affects rows the SELECT policy can see, so',
        '   if the policy hides the old rows from the caller, DELETE',
        '   returns zero affected rows without raising — and the next',
        '   INSERT then trips the unique constraint on',
        '   (service_id, day_of_week).',
        '',
        'Fix',
        '   Switched to UPSERT keyed on (service_id, day_of_week) which',
        '   matches the existing unique index exactly. The same call',
        '   updates branch_id along with start/end/active state, so the',
        '   schedule rows track the parent service correctly regardless',
        '   of which branch they used to live under. After the upsert,',
        '   any day that was removed in the request gets pruned with a',
        '   .not("day_of_week", "in", ...) filter.',
        '',
        'Also: backfilled SVC-0001 in production so its schedule rows',
        'point at the current service branch.',
        '',
        'Files',
        '  app/api/services/[id]/schedules/route.ts',
        '  lib/version.ts -> 3.74.321'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.321 pushed" -ForegroundColor Green
}
