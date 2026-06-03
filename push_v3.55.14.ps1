# v3.55.14 - /estimates table: Branch column + Linked Sales Order column
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Verify markers ===" -ForegroundColor Cyan
$est = Get-Content "app\estimates\page.tsx" -Raw

if ($est -match "branches\?: \{ name: string \} \| null;") {
    Write-Host "  + Estimate type has joined branches field" -ForegroundColor Green
} else { Write-Host "  X branches joined field missing" -ForegroundColor Red; exit 1 }

if ($est -match "converted_so\?: \{ id: string; so_number: string \} \| null;") {
    Write-Host "  + Estimate type has joined converted_so field" -ForegroundColor Green
} else { Write-Host "  X converted_so joined field missing" -ForegroundColor Red; exit 1 }

if ($est -match "branches:branch_id\(name\)") {
    Write-Host "  + SELECT joins branches" -ForegroundColor Green
} else { Write-Host "  X SELECT branches join missing" -ForegroundColor Red; exit 1 }

if ($est -match "converted_so:converted_so_id\(id, so_number\)") {
    Write-Host "  + SELECT joins converted_so" -ForegroundColor Green
} else { Write-Host "  X SELECT converted_so join missing" -ForegroundColor Red; exit 1 }

if ($est -match "<th[^>]*>الفرع</th>") {
    Write-Host "  + Branch table header present" -ForegroundColor Green
} else { Write-Host "  X Branch header missing" -ForegroundColor Red; exit 1 }

if ($est -match "<th[^>]*>أمر البيع المرتبط</th>") {
    Write-Host "  + Linked SO table header present" -ForegroundColor Green
} else { Write-Host "  X Linked SO header missing" -ForegroundColor Red; exit 1 }

if ($est -match "e\.branches\?\.name") {
    Write-Host "  + Branch cell renders branches.name" -ForegroundColor Green
} else { Write-Host "  X Branch cell rendering missing" -ForegroundColor Red; exit 1 }

if ($est -match "e\.converted_so\.so_number") {
    Write-Host "  + Linked SO cell renders so_number" -ForegroundColor Green
} else { Write-Host "  X Linked SO cell rendering missing" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tscOutput = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "TypeScript errors:" -ForegroundColor Red
    Write-Host ($tscOutput | Out-String)
    exit 1
}
Write-Host "+ TypeScript: OK" -ForegroundColor Green

Write-Host "`n=== Stage + commit ===" -ForegroundColor Cyan
git add app/estimates/page.tsx CHANGELOG.md
git --no-pager diff --cached --stat
git commit -m "feat(estimates): table - add Branch column + Linked Sales Order column

Estimate type extended with joined data:
- branches?: { name: string } | null
- converted_so?: { id: string; so_number: string } | null

Both SELECT queries (initial load + reload-after-save) updated to use
Supabase FK joins:
  branches:branch_id(name),
  converted_so:converted_so_id(id, so_number)

Table additions (between Date/Total/Status and the Actions cell):
- Branch column (hidden on mobile) - blue badge with branch name,
  or grey 'main' fallback when branch is unset
- Linked Sales Order column (hidden on mobile) - green chip with
  the SO number that links to /sales-orders/<id>, or em-dash when
  the estimate has not been converted

Estimate number cell now styled in blue to match /sales-orders.

No governance changes - RLS still enforces visibility through joins." 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.55.14 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Test after Vercel rebuild:" -ForegroundColor Cyan
    Write-Host "  /estimates -> table now shows Branch (blue badge) + Linked SO (green chip)" -ForegroundColor White
    Write-Host "  Convert an estimate -> after save, that row shows the SO number as a link" -ForegroundColor White
    Write-Host "  Click the SO chip -> navigates to /sales-orders/<id>" -ForegroundColor White
}
