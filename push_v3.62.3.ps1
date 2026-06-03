# v3.62.3 - audit log dialog now shows metadata + bilingual labels for backup actions
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Checking files ===" -ForegroundColor Cyan

$files = @(
    "lib/version.ts",
    "app/settings/audit-log/AuditLogContent.tsx"
)
foreach ($f in $files) {
    if (-not (Test-Path -LiteralPath $f)) { Write-Host "X $f MISSING" -ForegroundColor Red; exit 1 }
    Write-Host "+ $f" -ForegroundColor Green
}

Write-Host "`n=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.62.3"') { Write-Host "  + APP_VERSION = 3.62.3" -ForegroundColor Green }
else { Write-Host "  X APP_VERSION not 3.62.3" -ForegroundColor Red; exit 1 }

$page = Get-Content -LiteralPath "app/settings/audit-log/AuditLogContent.tsx" -Raw

# Action translations
foreach ($a in @("backup_export", "backup_delete", "backup_restore")) {
    if ($page -match "case `"$a`"") {
        Write-Host "  + getActionText handles $a" -ForegroundColor Green
    } else { Write-Host "  X $a action label missing" -ForegroundColor Red; exit 1 }
}

# Table translations
if ($page -match 'backup_history: "سجل النسخ الاحتياطية"') {
    Write-Host "  + backup_history translated" -ForegroundColor Green
} else { Write-Host "  X backup_history translation missing" -ForegroundColor Red; exit 1 }

# Field translations
foreach ($f in @("total_records", "size_mb", "history_id", "storage_path")) {
    if ($page -match "$f`:") {
        Write-Host "  + field $f has translation entry" -ForegroundColor Green
    } else { Write-Host "  X $f translation missing" -ForegroundColor Red; exit 1 }
}

# Metadata dialog block
if ($page -match 'بيانات إضافية') {
    Write-Host "  + Metadata dialog block present" -ForegroundColor Green
} else { Write-Host "  X Metadata dialog block missing" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ($tsc | Out-String) -ForegroundColor Red
    exit 1
}
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add `
    lib/version.ts `
    app/settings/audit-log/AuditLogContent.tsx `
    CHANGELOG.md 2>&1 | Out-Null

git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "feat(audit-log): v3.62.3 - bilingual labels + metadata details for backup actions

Until now opening 'تفاصيل العملية' on a backup_export row showed only
the header info and nothing else. The dialog had three exclusive
blocks (UPDATE/INSERT/DELETE) and ignored 'metadata' entirely.

Added:
  - Action translations:
      backup_export -> 'تصدير نسخة احتياطية'
      backup_delete -> 'حذف نسخة احتياطية'
      backup_restore -> 'استعادة نسخة احتياطية'
      backup_restore_failed -> 'فشل الاستعادة'
  - Table translations:
      backup_history -> 'سجل النسخ الاحتياطية'
      system -> 'النظام'
  - Field translations for our metadata keys:
      total_records, size_mb, size_bytes, duration_seconds,
      history_id, storage_path, records_restored, success,
      errors, warnings, error
  - New 'بيانات إضافية' block in the details dialog that renders
    the metadata JSON as labelled cards for any action that is NOT
    INSERT/UPDATE/DELETE. Same visual treatment as the existing
    INSERT/DELETE data blocks.

Result on a backup_export row:
  المستخدم:    7esab.erb (from v3.62.2)
  التاريخ:    29 May 2026
  نوع العملية: تصدير نسخة احتياطية
  الجدول:    سجل النسخ الاحتياطية
  السجل:    تصدير نسخة احتياطية كاملة (852 سجل)
  بيانات إضافية (5 حقل): إجمالى السجلات / الحجم / المدة /
                          رقم النسخة / مسار التخزين

Files:
  Modified: app/settings/audit-log/AuditLogContent.tsx
  Modified: lib/version.ts (3.62.2 -> 3.62.3)

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.62.3 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Test after Vercel deploys:" -ForegroundColor Cyan
    Write-Host "  1. /settings/audit-log - locate a 'تصدير نسخة احتياطية' row" -ForegroundColor White
    Write-Host "  2. Click 'تفاصيل' - dialog opens" -ForegroundColor White
    Write-Host "  3. User cell shows '7esab.erb', not blank" -ForegroundColor White
    Write-Host "  4. Action badge says 'تصدير نسخة احتياطية' not raw 'backup_export'" -ForegroundColor White
    Write-Host "  5. Table cell shows 'سجل النسخ الاحتياطية'" -ForegroundColor White
    Write-Host "  6. 'بيانات إضافية' block at the bottom with 5 translated fields" -ForegroundColor White
}
