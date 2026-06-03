# v3.63.0 - Public support: /contact + form + email + WhatsApp (P0-5)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Checking files ===" -ForegroundColor Cyan
$files = @(
    "lib/version.ts",
    "app/contact/page.tsx",
    "app/api/contact/route.ts",
    "components/contact/ContactForm.tsx",
    "lib/supabase/middleware.ts",
    "components/app-shell.tsx",
    "components/SidebarLayoutProvider.tsx",
    "app/legal/layout.tsx"
)
foreach ($f in $files) {
    if (-not (Test-Path -LiteralPath $f)) { Write-Host "X $f MISSING" -ForegroundColor Red; exit 1 }
    Write-Host "+ $f" -ForegroundColor Green
}

Write-Host "`n=== Verify markers ===" -ForegroundColor Cyan
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.63.0"') { Write-Host "  + APP_VERSION = 3.63.0" -ForegroundColor Green }
else { Write-Host "  X APP_VERSION not 3.63.0" -ForegroundColor Red; exit 1 }

$page = Get-Content -LiteralPath "app/contact/page.tsx" -Raw
if ($page -match 'تواصل معنا' -and $page -match 'ContactForm') {
    Write-Host "  + Contact page renders form" -ForegroundColor Green
} else { Write-Host "  X Contact page incomplete" -ForegroundColor Red; exit 1 }

$api = Get-Content -LiteralPath "app/api/contact/route.ts" -Raw
if ($api -match 'rateLimited' -and $api -match 'honeypot|website' -and $api -match 'nodemailer') {
    Write-Host "  + API has rate limit + honeypot + SMTP" -ForegroundColor Green
} else { Write-Host "  X API incomplete" -ForegroundColor Red; exit 1 }

$mw = Get-Content -LiteralPath "lib/supabase/middleware.ts" -Raw
if ($mw -match 'isContactPage') {
    Write-Host "  + middleware allows /contact" -ForegroundColor Green
} else { Write-Host "  X middleware not patched" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ($tsc | Out-String) -ForegroundColor Red
    exit 1
}
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add lib/version.ts app/contact app/api/contact components/contact lib/supabase/middleware.ts components/app-shell.tsx components/SidebarLayoutProvider.tsx app/legal/layout.tsx CHANGELOG.md 2>&1 | Out-Null
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "feat(support): v3.63.0 - public /contact page + form + email + WhatsApp (P0-5)

Customers and prospects can now reach support without an account.

/contact - public landing page
  - Three cards on top (Email / WhatsApp / Form callout)
  - Full bilingual form (name, email, subject, message) with live
    character count and inline validation
  - RTL throughout, no sidebar, no auth required

/api/contact - POST endpoint
  - Delivers inquiry to SUPPORT_EMAIL (default info@7esab.com) via
    the existing SMTP transport (same one used for renewal emails)
  - Auto-reply confirmation sent to the submitter
  - Rate limit: 5 submissions per IP per hour (in-memory bucket)
  - Honeypot field (website) silently absorbs bots
  - Strict server-side validation; client mirrors for UX only
  - Embeds IP / UA / referer / timestamp in the support email body
    for forensics

WhatsApp button - opt-in via NEXT_PUBLIC_SUPPORT_WHATSAPP_NUMBER
  When set, renders click-to-chat card. When unset, shows a polite
  coming-soon placeholder rather than a dead button.

Public-route plumbing (same pattern as /legal in v3.62.7):
  - middleware: /contact + /api/contact bypass auth gate
  - AppShell: /contact in PUBLIC_PATHS
  - SidebarLayoutProvider: /contact in PREFIX_HIDE_PATHS

Footer link added to every /legal/* page.

Optional env vars:
  SUPPORT_EMAIL - destination (defaults to info@7esab.com)
  NEXT_PUBLIC_SUPPORT_WHATSAPP_NUMBER - international format, digits only

Files:
  New: app/contact/page.tsx
  New: app/api/contact/route.ts
  New: components/contact/ContactForm.tsx
  Modified: lib/supabase/middleware.ts
  Modified: components/app-shell.tsx
  Modified: components/SidebarLayoutProvider.tsx
  Modified: app/legal/layout.tsx (footer link)
  Modified: lib/version.ts (3.62.8 -> 3.63.0)

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.63.0 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Verify after Vercel deploys (~2 min):" -ForegroundColor Cyan
    Write-Host "  1. https://7esab.com/contact - 3 cards, no sidebar" -ForegroundColor White
    Write-Host "  2. Submit a test message - check info@7esab.com" -ForegroundColor White
    Write-Host "  3. Submitter receives auto-reply" -ForegroundColor White
    Write-Host "  4. Optional: set NEXT_PUBLIC_SUPPORT_WHATSAPP_NUMBER on Vercel" -ForegroundColor White
}
