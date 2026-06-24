$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.338.ps1") { Remove-Item -LiteralPath "push_v3.74.338.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.339"') {
    Write-Host "+ 3.74.339" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$st = Get-Content -LiteralPath "components/services/ServicesTable.tsx" -Raw
foreach ($n in @(
    'import { Eye, Pencil, Trash2',
    '<Trash2 className=',
    'حذف الخدمة'
)) {
    if ($st -notmatch [regex]::Escape($n)) {
        Write-Host "X ServicesTable missing: $n" -ForegroundColor Red; exit 1
    }
}
# old archive icon must be gone
if ($st -match 'import \{[^}]*Archive[^}]*\}') {
    Write-Host "X ServicesTable still imports Archive icon" -ForegroundColor Red; exit 1
}
Write-Host "+ ServicesTable: trash icon + tooltip" -ForegroundColor Green

$dlg = Get-Content -LiteralPath "components/services/ServiceArchiveDialog.tsx" -Raw
foreach ($n in @(
    'import { Trash2 }',
    'حذف الخدمة',
    'لو فيها حجوزات نشطة، الحذف هيتوقف',
    'bg-red-600 hover:bg-red-700'
)) {
    if ($dlg -notmatch [regex]::Escape($n)) {
        Write-Host "X dialog missing: $n" -ForegroundColor Red; exit 1
    }
}
# old "Archive" copy must be gone
if ($dlg -match 'أرشفة الخدمة') {
    Write-Host "X dialog still says 'أرشفة الخدمة'" -ForegroundColor Red; exit 1
}
Write-Host "+ Confirm dialog: speaks the language of delete" -ForegroundColor Green

$page = Get-Content -LiteralPath "app/services/page.tsx" -Raw
if ($page -notmatch [regex]::Escape('v3.74.339 — renamed from "أرشفة" to "حذف"')) {
    Write-Host "X services page: missing v3.74.339 marker" -ForegroundColor Red; exit 1
}
Write-Host "+ services page: toast copy aligned with delete" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_339.txt"
    $msgLines = @(
        'ux(services): v3.74.339 - delete button speaks the language the user expected',
        '',
        'Owner asked for a Delete button in the services list to recover',
        'from accidental duplicates. There was already a soft-delete',
        'wired up (archive_service_atomic + ServiceArchiveDialog), but',
        'it was hiding behind an Archive icon and "أرشفة" copy, so it',
        'wasn''t reading as a delete action.',
        '',
        'No behaviour change — the same archive RPC still runs and the',
        'same "block if there are active bookings" guard still applies.',
        'Only the surface changed:',
        '   * ServicesTable: Archive icon -> Trash2 icon, with a Delete',
        '     tooltip in Arabic / English.',
        '   * ServiceArchiveDialog: red Trash2 header, title "حذف',
        '     الخدمة", clarified copy ("If it has active bookings,',
        '     deletion will be blocked with a clear reason"), the',
        '     confirm button turns red and reads "حذف" / "Delete".',
        '   * Services page: success / error toasts re-worded as',
        '     "تم حذف الخدمة" / "تعذّر الحذف".',
        '',
        'Files',
        '  components/services/ServicesTable.tsx',
        '  components/services/ServiceArchiveDialog.tsx',
        '  app/services/page.tsx',
        '  lib/version.ts -> 3.74.339'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.339 pushed" -ForegroundColor Green
}
