# v3.65.0 - Blog SEO foundation + 3 long-form Arabic articles
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Checking files ===" -ForegroundColor Cyan
$files = @(
    "lib/version.ts",
    "lib/blog-posts.ts",
    "components/blog/BlogPostLayout.tsx",
    "app/blog/page.tsx",
    "app/blog/best-arabic-accounting-software-egypt-2026/page.tsx",
    "app/blog/vat-14-egypt-small-business-guide/page.tsx",
    "app/blog/excel-to-erp-migration-guide/page.tsx",
    "app/sitemap.ts",
    "app/robots.ts",
    "lib/supabase/middleware.ts",
    "components/app-shell.tsx",
    "components/SidebarLayoutProvider.tsx"
)
foreach ($f in $files) {
    if (-not (Test-Path -LiteralPath $f)) { Write-Host "X $f MISSING" -ForegroundColor Red; exit 1 }
    Write-Host "+ $f" -ForegroundColor Green
}

Write-Host "`n=== Verify markers ===" -ForegroundColor Cyan
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.65.0"') { Write-Host "  + APP_VERSION = 3.65.0" -ForegroundColor Green }
else { Write-Host "  X APP_VERSION not 3.65.0" -ForegroundColor Red; exit 1 }

$idx = Get-Content -LiteralPath "lib/blog-posts.ts" -Raw
if ($idx -match 'BLOG_POSTS' -and $idx -match 'best-arabic-accounting' -and $idx -match 'vat-14-egypt' -and $idx -match 'excel-to-erp') {
    Write-Host "  + blog-posts.ts has 3 entries" -ForegroundColor Green
} else { Write-Host "  X blog-posts.ts incomplete" -ForegroundColor Red; exit 1 }

$blogIdx = Get-Content -LiteralPath "app/blog/page.tsx" -Raw
if ($blogIdx -match 'getAllPosts' -and $blogIdx -match 'BlogIndexPage') {
    Write-Host "  + /blog index renders post list" -ForegroundColor Green
} else { Write-Host "  X /blog index incomplete" -ForegroundColor Red; exit 1 }

$sm = Get-Content -LiteralPath "app/sitemap.ts" -Raw
if ($sm -match 'getAllPosts' -and $sm -match 'blogUrls') {
    Write-Host "  + sitemap includes blog posts dynamically" -ForegroundColor Green
} else { Write-Host "  X sitemap not wired to blog" -ForegroundColor Red; exit 1 }

$mw = Get-Content -LiteralPath "lib/supabase/middleware.ts" -Raw
if ($mw -match 'isBlogPage') { Write-Host "  + middleware allows /blog" -ForegroundColor Green }
else { Write-Host "  X middleware not patched" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ($tsc | Out-String) -ForegroundColor Red
    exit 1
}
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add lib/version.ts lib/blog-posts.ts components/blog app/blog app/sitemap.ts app/robots.ts lib/supabase/middleware.ts components/app-shell.tsx components/SidebarLayoutProvider.tsx CHANGELOG.md 2>&1 | Out-Null
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "feat(blog): v3.65.0 - blog hub + 3 long-form Arabic SEO articles

/blog        - public Arabic hub, server-rendered, lists every post
/blog/[slug] - dynamic article pages, three launched today:
  - best-arabic-accounting-software-egypt-2026 (Excel/Hadoota/
    Onyx/Zoho/7esab honest comparison)
  - vat-14-egypt-small-business-guide (worked examples, filing
    windows, penalty thresholds, ERP automation)
  - excel-to-erp-migration-guide (6-step playbook, timelines by
    company size, vendor questions)

Infrastructure:
  - lib/blog-posts.ts            single source of truth for posts
  - components/blog/BlogPostLayout shared shell, prose typography,
                                  end-of-article CTA, related posts
  - JSON-LD Article schema on every post page
  - Per-post title/description/OG/canonical
  - app/sitemap.ts dynamically appends blog posts (now 13 URLs)
  - app/robots.ts /blog added to allow list
  - middleware + AppShell + SidebarLayoutProvider treat /blog as
    public (same pattern as /legal and /contact)

Why this matters: the SEO infrastructure in v3.64.0 was a road with
no cars. These three articles are the cars. Each compounds: draws
traffic for as long as it stays useful, costs nothing to keep
running, ends with a CTA back to sign-up.

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.65.0 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Verify after Vercel deploys (~2 min):" -ForegroundColor Cyan
    Write-Host "  1. https://7esab.com/blog - 3 cards" -ForegroundColor White
    Write-Host "  2. https://7esab.com/sitemap.xml - 13 URLs" -ForegroundColor White
    Write-Host "  3. Share any article URL in WhatsApp - Arabic preview" -ForegroundColor White
    Write-Host "  4. Google Search Console - submit sitemap, request re-indexing" -ForegroundColor White
}
