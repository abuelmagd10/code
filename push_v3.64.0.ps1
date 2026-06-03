# v3.64.0 - Honest landing page + SEO foundation
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Checking files ===" -ForegroundColor Cyan
foreach ($f in @("lib/version.ts", "app/page.tsx", "app/layout.tsx", "app/sitemap.ts", "app/robots.ts")) {
    if (-not (Test-Path -LiteralPath $f)) { Write-Host "X $f MISSING" -ForegroundColor Red; exit 1 }
    Write-Host "+ $f" -ForegroundColor Green
}

Write-Host "`n=== Verify markers ===" -ForegroundColor Cyan
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.64.0"') { Write-Host "  + APP_VERSION = 3.64.0" -ForegroundColor Green }
else { Write-Host "  X APP_VERSION not 3.64.0" -ForegroundColor Red; exit 1 }

$p = Get-Content -LiteralPath "app/page.tsx" -Raw
# Should NOT contain fake claims anymore
if ($p -notmatch '500\+.+شركة تثق' -and $p -notmatch 'أحمد محمد' -and $p -notmatch 'SOC 2') {
    Write-Host "  + landing page purged of fake claims" -ForegroundColor Green
} else { Write-Host "  X landing page still has fakes" -ForegroundColor Red; exit 1 }

if ($p -match 'ج\.م' -or $p -match 'EGP') {
    Write-Host "  + pricing in EGP" -ForegroundColor Green
} else { Write-Host "  X pricing not converted to EGP" -ForegroundColor Red; exit 1 }

$l = Get-Content -LiteralPath "app/layout.tsx" -Raw
if ($l -match 'application/ld\+json' -and $l -match 'SoftwareApplication') {
    Write-Host "  + JSON-LD structured data present" -ForegroundColor Green
} else { Write-Host "  X JSON-LD missing" -ForegroundColor Red; exit 1 }

if ($l -match 'openGraph' -and $l -match 'twitter') {
    Write-Host "  + Open Graph + Twitter Card configured" -ForegroundColor Green
} else { Write-Host "  X OG/Twitter missing" -ForegroundColor Red; exit 1 }

$sm = Get-Content -LiteralPath "app/sitemap.ts" -Raw
if ($sm -match 'sitemap' -and $sm -match '/legal') { Write-Host "  + sitemap.ts ready" -ForegroundColor Green }
else { Write-Host "  X sitemap.ts incomplete" -ForegroundColor Red; exit 1 }

$rb = Get-Content -LiteralPath "app/robots.ts" -Raw
if ($rb -match 'disallow' -and $rb -match 'dashboard') { Write-Host "  + robots.ts disallows auth routes" -ForegroundColor Green }
else { Write-Host "  X robots.ts incomplete" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ($tsc | Out-String) -ForegroundColor Red
    exit 1
}
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add lib/version.ts app/page.tsx app/layout.tsx app/sitemap.ts app/robots.ts CHANGELOG.md 2>&1 | Out-Null
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "feat(landing): v3.64.0 - honest landing page + SEO foundation

Removed:
  - Fabricated stats (500+ companies / 50K+ transactions / 99.9% uptime
    / 24/7 support). Replaced with verifiable technical facts: 150+
    features, IAS 21 multi-currency, AES-256 backup encryption, Paymob
    EGP payments.
  - Fabricated testimonials with made-up Egyptian names and companies.
    Egyptian SMB community is small enough that a single prospect
    Googling the fake company and finding nothing would never trust
    us. Replaced with a transparent 'Founding Customer' CTA: 30%
    lifetime discount, direct WhatsApp line, feature influence, opt-in
    'Founding' badge.
  - Fake SOC 2 footer badge. Not a certification we hold; claiming it
    is misrepresentation. Replaced with real claims: IAS 21, IFRS,
    PDPL (Egyptian law we align with), AES-256, RLS.

Fixed:
  - Pricing was in USD (\$0 / \$10) mismatching actual Paymob/EGP
    billing. Now reads 0 ج.م and 500 ج.م.
  - Footer 'Support' column had dead links. Now /contact + email.
  - Footer 'Company' column was a graveyard of href='#'. Replaced
    with 'Legal' column linking the three policy pages.

Added (SEO):
  - app/sitemap.ts -> /sitemap.xml with 7 public URLs (landing,
    /contact, /legal/*, /auth/sign-up, /auth/login). Authenticated
    routes intentionally excluded.
  - app/robots.ts -> /robots.txt allowlisting public URLs and
    disallowing every authenticated prefix (/dashboard, /settings,
    /customers, etc.). Sitemap declared.
  - Open Graph + Twitter Card metadata in Arabic so Facebook /
    WhatsApp / Twitter previews look professional.
  - JSON-LD structured data (SoftwareApplication + Organization)
    in the document head with both EGP offers and brand contact info.
    Google can now show rich results.
  - alternates.canonical + languages.
  - Egyptian SMB keywords in metadata.

Why this matters:
  A landing page that fakes social proof scares serious prospects
  and exposes us legally. One that says 'we just launched, here is
  what we built, join us early and shape what comes next' is what
  actually converts in the Egyptian SMB market - where word travels
  fast and honest founders are remembered. SEO foundation means
  every channel from here on compounds into Google instead of
  vanishing.

Files:
  Modified: app/page.tsx, app/layout.tsx, lib/version.ts
  New: app/sitemap.ts, app/robots.ts

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.64.0 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Verify after Vercel deploys (~2 min):" -ForegroundColor Cyan
    Write-Host "  1. https://7esab.com/robots.txt - allow/disallow list" -ForegroundColor White
    Write-Host "  2. https://7esab.com/sitemap.xml - 7 URLs" -ForegroundColor White
    Write-Host "  3. https://developers.facebook.com/tools/debug/ - Arabic OG card" -ForegroundColor White
    Write-Host "  4. https://search.google.com/test/rich-results - SoftwareApplication detected" -ForegroundColor White
    Write-Host "  5. Landing - no fake testimonials, EGP pricing, 'Founding' callout" -ForegroundColor White
}
