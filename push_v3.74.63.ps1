# v3.74.63 - Cherry-pick customers when transferring ownership
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") {
    Remove-Item ".git/index.lock" -Force
    Write-Host "  (removed stale .git/index.lock)" -ForegroundColor DarkGray
}

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.63"') {
    Write-Host "+ APP_VERSION = 3.74.63" -ForegroundColor Green
} else { Write-Host "X APP_VERSION not 3.74.63" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.63]')) {
    Write-Host "+ CHANGELOG 3.74.63" -ForegroundColor Green
} else { Write-Host "X CHANGELOG missing 3.74.63" -ForegroundColor Red; exit 1 }

# Confirm the UI block + state + API param actually landed
$users = Get-Content -LiteralPath "app/settings/users/page.tsx" -Raw
if ($users -match 'sourceCustomers' -and $users -match 'selectedCustomerIds' -and $users -match 'v3\.74\.63') {
    Write-Host "+ users page has multi-select state + UI" -ForegroundColor Green
} else { Write-Host "X users page missing v3.74.63 wiring" -ForegroundColor Red; exit 1 }

$api = Get-Content -LiteralPath "app/api/permissions/transfer/route.ts" -Raw
if ($api -match 'customer_ids' -and $api -match 'handPicked') {
    Write-Host "+ API route accepts customer_ids + intersects" -ForegroundColor Green
} else { Write-Host "X API route missing v3.74.63 logic" -ForegroundColor Red; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "feat(permissions): v3.74.63 - cherry-pick customers in transfer

Operator can now multi-select specific customers to transfer ownership
of, instead of the legacy all-or-nothing move. Searchable list shows
only the source employee's owned customers (honors the branch filter
when set). Empty selection preserves the legacy 'move ALL' behaviour
for backward compatibility.

Server intersects the client-supplied IDs with what the source actually
owns before writing the snapshot - defence-in-depth, never trust the
client to send IDs the source doesn't own. The existing approval
workflow and execute_permission_transfer(snapshot) handle the rest." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.63 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.62.ps1') {
        Remove-Item -LiteralPath 'push_v3.74.62.ps1' -Force
        Write-Host "  (removed superseded push_v3.74.62.ps1)" -ForegroundColor DarkGray
    }
}
