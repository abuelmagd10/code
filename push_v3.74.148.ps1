$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.147.ps1") { Remove-Item -LiteralPath "push_v3.74.147.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.148"') { Write-Host "+ 3.74.148" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

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
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "fix(payments): v3.74.148 - resubmit-after-reject returned 404 due to RLS

User report (continued from v3.74.144-147): accountant clicks the
'تَعديل وَإِعادَة الإِرسال' button on a rejected vendor payment,
fills out the correction form, hits submit, and sees 'الدَّفعَة غَير
مَوجودَة'. Browser console shows POST .../resubmit-after-reject 404.

Investigation: code in main, build succeeded on Vercel, route is
registered (verified via Vercel API). Runtime log confirmed the
request DID reach the route handler ('🔍 [Server] Reading company...'
fires from getActiveCompanyId), but the response was still 404.

Root cause: app/api/payments/[id]/resubmit-after-reject/route.ts
loaded the payment row with the user's RLS-restricted client:

  const { data: pay } = await supabase
    .from('payments')
    .select(...)
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle()

  if (!pay) return 404 'الدَّفعَة غَير مَوجودَة'

For an accountant role whose RLS policy on payments scopes them to
their branch + approved/pending statuses, a *rejected* row is
filtered out. pay comes back null, the guard fires, and the API
returns the misleading 404. The user saw 'payment not found' for a
payment they themselves had just created and seen on screen.

Fix: switch the initial SELECT (and the company_members role lookup
right after it) to the service client. The authorization check
immediately below — 'caller must be creator OR owner/manager/admin' —
is enforced in application code, not RLS, and we keep the company_id
filter so tenant isolation is intact. Removed the now-duplicate
serviceClient declaration further down.

Files:
  - app/api/payments/[id]/resubmit-after-reject/route.ts
  - lib/version.ts" 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.148 pushed" -ForegroundColor Green
}
