# =====================================================
# تشغيل اختبارات Write-Off End-to-End
# =====================================================

Write-Host "🧪 اختبار Write-Off End-to-End" -ForegroundColor Cyan
Write-Host ""

# قراءة بيانات الاتصال من متغيرات البيئة أو ملف config
$env:PGPASSWORD = if ($env:PGPASSWORD) { $env:PGPASSWORD } else { Read-Host "Enter database password" -AsSecureString | ConvertFrom-SecureString -AsPlainText }
$dbHost = if ($env:PGHOST) { $env:PGHOST } else { Read-Host "Enter database host" }
$dbPort = if ($env:PGPORT) { $env:PGPORT } else { "5432" }
$dbName = if ($env:PGDATABASE) { $env:PGDATABASE } else { Read-Host "Enter database name" }
$dbUser = if ($env:PGUSER) { $env:PGUSER } else { Read-Host "Enter database user" }

Write-Host "📊 تشغيل اختبارات Write-Off..." -ForegroundColor Yellow

# تشغيل SQL script
$sqlFile = Join-Path $PSScriptRoot "test_write_off_end_to_end.sql"
$outputFile = Join-Path $PSScriptRoot "test_write_off_end_to_end_output.txt"

psql -h $dbHost -p $dbPort -U $dbUser -d $dbName -f $sqlFile | Tee-Object -FilePath $outputFile

Write-Host ""
Write-Host "✅ تم الانتهاء من الاختبارات" -ForegroundColor Green
Write-Host "📄 النتائج محفوظة في: $outputFile" -ForegroundColor Cyan
