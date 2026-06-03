# v3.73.0 - Phase C-2: Two-eye approval workflow on transfers
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.73.0"') { Write-Host "+ APP_VERSION = 3.73.0" -ForegroundColor Green }
else { Write-Host "X APP_VERSION not 3.73.0" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match '\[3.73.0\]') { Write-Host "+ CHANGELOG entry for 3.73.0 present" -ForegroundColor Green }
else { Write-Host "X CHANGELOG missing 3.73.0 entry" -ForegroundColor Red; exit 1 }

# Approve and Reject routes must exist
# Note: -LiteralPath because PowerShell treats [id] as a wildcard otherwise
if (Test-Path -LiteralPath "app/api/permissions/transfer/[id]/approve/route.ts") {
    Write-Host "+ /api/permissions/transfer/[id]/approve route exists" -ForegroundColor Green
} else { Write-Host "X approve route missing" -ForegroundColor Red; exit 1 }

if (Test-Path -LiteralPath "app/api/permissions/transfer/[id]/reject/route.ts") {
    Write-Host "+ /api/permissions/transfer/[id]/reject route exists" -ForegroundColor Green
} else { Write-Host "X reject route missing" -ForegroundColor Red; exit 1 }

# Transfer route must NOT execute updates anymore (no .from('customers').update calls inside POST)
$tr = Get-Content -LiteralPath "app/api/permissions/transfer/route.ts" -Raw
if ($tr -notmatch 'status: "completed"') {
    Write-Host "+ transfer POST no longer marks completed inline" -ForegroundColor Green
} else { Write-Host "X transfer POST still executes inline" -ForegroundColor Red; exit 1 }

# UI must have approval buttons
$usr = Get-Content -LiteralPath "app/settings/users/page.tsx" -Raw
if ($usr -match "بانتظار اعتماد" -and $usr -match "اعتماد النَّقل") {
    Write-Host "+ /settings/users: approval UI present" -ForegroundColor Green
} else { Write-Host "X approval UI markers missing" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host ($tsc | Out-String) -ForegroundColor Red; exit 1 }
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add lib/version.ts `
        app/api/permissions/transfer/route.ts `
        "app/api/permissions/transfer/[id]/approve/route.ts" `
        "app/api/permissions/transfer/[id]/reject/route.ts" `
        app/settings/users/page.tsx `
        CHANGELOG.md 2>&1 | Out-Null
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "feat(permissions): v3.73.0 - Phase C-2 two-eye approval on transfers

Permission transfers (re-owning customers + sales_orders) no
longer execute immediately. They create a pending request that
must be approved by a SECOND owner/admin before any data is
touched - the Vier-Augen-Prinzip every enterprise ERP from SAP
to Oracle enforces on irreversible governance changes.

Why this matters:
  A single compromised or malicious owner account could quietly
  transfer every customer to themselves and lock out everyone
  else. With two-eye approval, that attack now requires two
  compromised accounts simultaneously.

Done in DB:
  1. status CHECK extended: + approved, + rejected
  2. approved_by / approved_at / rejected_by / rejected_at /
     rejected_reason / completed_at columns
  3. partial index on pending rows for the approver-inbox query
  4. execute_permission_transfer(id) SECURITY DEFINER function:
     - locks the row FOR UPDATE
     - refuses anything but status=approved
     - atomic rewrite of customers + sales_orders ownership
       (optionally narrowed to a branch_id from transfer_data)
     - stamps records_transferred + completed_at + record IDs
       into transfer_data for audit

Done in API:
  - POST /api/permissions/transfer no longer executes. Just
    inserts at status=pending + audit log.
  - New POST /api/permissions/transfer/[id]/approve with two
    guards: only owner/admin/general_manager, and not the
    initiator. Calls execute_permission_transfer RPC. On RPC
    failure, rolls status back to 'failed' so the row isnt
    stuck approved with no execution.
  - New POST /api/permissions/transfer/[id]/reject - same
    guards, mandatory reason in body.

Done in UI:
  - النَّقل tab is now an inbox
  - Each row shows colored status chip:
      pending=amber, approved=blue, completed=green,
      rejected=red, failed=red
  - Inline Approve / Reject buttons on pending rows, only for
    users who didn't initiate, only if they can manage
  - Initiator sees an italic hint explaining their own buttons
    are missing
  - Reject prompts for a mandatory reason
  - Rejected rows show the reason in red

Verify:
  - Owner A submits transfer -> row pending, no customers touched
  - A sees no buttons; B sees Approve + Reject
  - B approves -> records flip ownership, chip turns مُنفَّذ
  - Try self-approve -> 403 with clear Arabic message
  - Reject without reason -> 400

Phase C remaining:
  v3.74.0 - position hierarchy
  v3.75.0 - who can access X reporting

Files:
  DB migration: v3_73_0_phase_c_approval_workflow_on_transfers
  Modified: app/api/permissions/transfer/route.ts
  Modified: app/settings/users/page.tsx
  Modified: lib/version.ts (3.72.0 -> 3.73.0)
  Modified: CHANGELOG.md
  New: app/api/permissions/transfer/[id]/approve/route.ts
  New: app/api/permissions/transfer/[id]/reject/route.ts

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.73.0 pushed" -ForegroundColor Green
}
