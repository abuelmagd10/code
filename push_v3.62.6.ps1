# v3.62.6 - Legal pages: Terms + Privacy + Refund (P0-3)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Checking files ===" -ForegroundColor Cyan

$files = @(
    "lib/version.ts",
    "app/legal/layout.tsx",
    "app/legal/page.tsx",
    "app/legal/terms/page.tsx",
    "app/legal/privacy/page.tsx",
    "app/legal/refund/page.tsx"
)
foreach ($f in $files) {
    if (-not (Test-Path -LiteralPath $f)) { Write-Host "X $f MISSING" -ForegroundColor Red; exit 1 }
    Write-Host "+ $f" -ForegroundColor Green
}

Write-Host "`n=== Verify markers ===" -ForegroundColor Cyan
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.62.6"') { Write-Host "  + APP_VERSION = 3.62.6" -ForegroundColor Green }
else { Write-Host "  X APP_VERSION not 3.62.6" -ForegroundColor Red; exit 1 }

$terms = Get-Content -LiteralPath "app/legal/terms/page.tsx" -Raw
if ($terms -match 'شروط الاستخدام' -and $terms -match 'القانون المصرى') {
    Write-Host "  + Terms page complete (Arabic + Egyptian law)" -ForegroundColor Green
} else { Write-Host "  X Terms missing Egyptian content" -ForegroundColor Red; exit 1 }

$privacy = Get-Content -LiteralPath "app/legal/privacy/page.tsx" -Raw
if ($privacy -match 'PDPL' -and $privacy -match 'GDPR' -and $privacy -match 'مسؤول حماية البيانات') {
    Write-Host "  + Privacy aligned with PDPL + GDPR" -ForegroundColor Green
} else { Write-Host "  X Privacy missing required sections" -ForegroundColor Red; exit 1 }

$refund = Get-Content -LiteralPath "app/legal/refund/page.tsx" -Raw
if ($refund -match '14 يوماً' -and $refund -match 'Paymob') {
    Write-Host "  + Refund covers cooling-off + Paymob" -ForegroundColor Green
} else { Write-Host "  X Refund incomplete" -ForegroundColor Red; exit 1 }

$layout = Get-Content -LiteralPath "app/legal/layout.tsx" -Raw
if ($layout -match 'info@7esab.com' -and $layout -match 'dir="rtl"') {
    Write-Host "  + Layout has RTL + contact link" -ForegroundColor Green
} else { Write-Host "  X Layout incomplete" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ($tsc | Out-String) -ForegroundColor Red
    exit 1
}
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add lib/version.ts app/legal CHANGELOG.md 2>&1 | Out-Null
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "feat(legal): v3.62.6 - Terms, Privacy, Refund pages (P0-3)

Three public-route legal pages required before paid users.

/legal/terms - Terms of Service (13 sections, Arabic, Egyptian law +
  Cairo jurisdiction). Covers eligibility, account responsibility,
  allowed/prohibited use, subscription billing, data ownership,
  SLA (99% monthly uptime), liability limits, termination, amendments.

/legal/privacy - Privacy Policy aligned with both Egyptian PDPL
  (Law 151/2020) and GDPR. Discloses data collection, sharing
  (Supabase, Vercel, Paymob, Resend, Sentry - no resellers/ads),
  protection (TLS 1.3, AES-256, RLS, audit log, AES-256-GCM for
  backups), retention (30-day grace + 90-day purge), data-subject
  rights, DPO contact, complaint path.

/legal/refund - Refund Policy. 14-day cooling-off (cap: 50 invoices),
  tiered partial refund for annual plans (90% / 60% / 40% / 20% / 0%),
  monthly plans non-refundable after day 14, guaranteed full refund
  for outages > 7 days, data loss, double charges, or service
  mismatch. Aligned with Egyptian Consumer Protection Law 181/2018.

/legal - landing page with three illustrated cards.

Shared RTL layout with top-nav (desktop) and bottom-nav (mobile),
prose typography, single source for contact addresses
(info / privacy / billing / support / dpo @ 7esab.com).

Disclaimer at the end of each page: written carefully but a sensible
default, not legal advice for the specific business - have a lawyer
review before relying on it for paying customers.

Files:
  New: app/legal/layout.tsx, app/legal/page.tsx
  New: app/legal/{terms,privacy,refund}/page.tsx
  Modified: lib/version.ts (3.62.5 -> 3.62.6)

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.62.6 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Verify after Vercel deploys (~2 min):" -ForegroundColor Cyan
    Write-Host "  1. https://7esab.com/legal - 3 cards rendered" -ForegroundColor White
    Write-Host "  2. /legal/terms - Arabic content, RTL, headers" -ForegroundColor White
    Write-Host "  3. /legal/privacy - PDPL + GDPR sections" -ForegroundColor White
    Write-Host "  4. /legal/refund - cooling-off + tiered table" -ForegroundColor White
    Write-Host "  5. Mobile: top-nav collapses, bottom-nav appears" -ForegroundColor White
}
