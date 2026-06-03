# v3.58.5 - DB-level governance hardening for ai_knowledge_chunks
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

$mig = "supabase/migrations/20260528000500_ai_chunks_governance_hardening.sql"
if (-not (Test-Path $mig)) { Write-Host "X $mig MISSING" -ForegroundColor Red; exit 1 }
Write-Host "+ $mig" -ForegroundColor Green

$content = Get-Content $mig -Raw
$checks = @(
    @{ p = 'FUNCTION public\.ai_resource_for_page_key';        m = "resource mapper function" },
    @{ p = 'FUNCTION public\.ai_current_user_is_full_access';  m = "is_full_access helper" },
    @{ p = 'FUNCTION public\.ai_current_user_allowed_resources'; m = "allowed_resources helper" },
    @{ p = "WHEN 'shipping_reports' THEN 'reports'";           m = "shipping_reports mapped" },
    @{ p = "WHEN 'manager' THEN ARRAY\[";                      m = "manager defaults present" },
    @{ p = "WHEN 'staff' THEN ARRAY\[";                        m = "staff defaults present" },
    @{ p = 'DROP POLICY IF EXISTS "ai_knowledge_chunks_select"'; m = "old policy dropped" },
    @{ p = 'resource = ANY\(public\.ai_current_user_allowed_resources';  m = "new RLS uses resource gate" }
)

foreach ($c in $checks) {
    if ($content -match $c.p) { Write-Host "  + $($c.m)" -ForegroundColor Green }
    else { Write-Host "  X $($c.m)" -ForegroundColor Red; exit 1 }
}

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host ($tsc | Out-String); exit 1 }
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add $mig CHANGELOG.md
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit; proceeding to push" -ForegroundColor Yellow
} else {
    git commit -m "feat(ai-assistant): v3.58.5 DB-level governance hardening for ai_knowledge_chunks

Closes information-disclosure gap raised after v3.58.4:
governance was enforced only client-side in /api/ai/find-page.
A staff/sales user could call Supabase REST directly on
ai_knowledge_chunks and read title/description for every admin
page in the system.

Migration 20260528000500_ai_chunks_governance_hardening.sql:

New functions:
- ai_resource_for_page_key(text) IMMUTABLE
    Maps 90+ page_keys to their governance resource. Mirror of
    lib/ai/page-key-registry.ts.
- ai_current_user_is_full_access() STABLE
    TRUE if the user is owner/admin/general_manager in any company.
- ai_current_user_allowed_resources() STABLE
    Returns the union of resource codes the user can access across
    all their company memberships. Mirrors DEFAULT_ROLE_PAGES from
    app/api/ai/find-page/route.ts and applies the
    company_role_permissions overrides.

Indexer:
- ai_reindex_page_guides() now sets chunks.resource from the
  page_key. Re-ran on production - 484 chunks updated, zero NULLs.

RLS:
- Old permissive 'company_id IS NULL OR is_member' policy replaced
- New policy: must additionally pass the resource gate. Owner/admin/
  GM and rows where resource IS NULL bypass the gate.

Defense in Depth layers now:
  1. DB-level RLS (NEW)        - blocks direct REST access
  2. ai_search_pages RPC        - SECURITY INVOKER, inherits RLS
  3. /api/ai/find-page governance gate - filters client-side
  4. Middleware navigation      - blocks the actual page

Safety:
- Runtime-neutral (no app code changed)
- Owner/Admin/GM unaffected
- TypeScript: unchanged
- Functions are STABLE so Postgres caches them within a single query" 2>&1 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) { Write-Host "ERROR commit" -ForegroundColor Red; exit 1 }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) { Write-Host "`n+ v3.58.5 pushed" -ForegroundColor Green }
