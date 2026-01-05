# =============================================
# تطبيق إصلاح التحكم بالوصول للموردين والعملاء
# =============================================
# هذا السكريبت يطبق التعديلات اللازمة على قاعدة البيانات
# لإضافة حقول التحكم بالوصول
# =============================================

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  تطبيق إصلاح التحكم بالوصول" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# التحقق من وجود ملفات SQL
$files = @(
    "scripts/130_add_suppliers_access_control.sql",
    "scripts/131_add_customers_access_control.sql"
)

foreach ($file in $files) {
    if (-not (Test-Path $file)) {
        Write-Host "❌ الملف غير موجود: $file" -ForegroundColor Red
        exit 1
    }
}

Write-Host "✅ جميع الملفات موجودة" -ForegroundColor Green
Write-Host ""

# قراءة متغيرات البيئة
if (-not (Test-Path ".env.local")) {
    Write-Host "❌ ملف .env.local غير موجود" -ForegroundColor Red
    exit 1
}

$envContent = Get-Content ".env.local" -Raw
$supabaseUrl = if ($envContent -match 'NEXT_PUBLIC_SUPABASE_URL=(.+)') { $matches[1].Trim() } else { $null }
$supabaseKey = if ($envContent -match 'SUPABASE_SERVICE_ROLE_KEY=(.+)') { $matches[1].Trim() } else { $null }

if (-not $supabaseUrl -or -not $supabaseKey) {
    Write-Host "❌ لم يتم العثور على SUPABASE_URL أو SERVICE_ROLE_KEY في .env.local" -ForegroundColor Red
    exit 1
}

Write-Host "✅ تم قراءة متغيرات البيئة" -ForegroundColor Green
Write-Host ""

# تطبيق كل ملف SQL
foreach ($file in $files) {
    Write-Host "📝 تطبيق: $file" -ForegroundColor Yellow
    
    $sqlContent = Get-Content $file -Raw
    
    $body = @{
        query = $sqlContent
    } | ConvertTo-Json
    
    try {
        $response = Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/rpc/exec_sql" `
            -Method Post `
            -Headers @{
                "apikey" = $supabaseKey
                "Authorization" = "Bearer $supabaseKey"
                "Content-Type" = "application/json"
            } `
            -Body $body
        
        Write-Host "   ✅ تم التطبيق بنجاح" -ForegroundColor Green
    }
    catch {
        Write-Host "   ⚠️  تحذير: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "   ℹ️  قد يكون التعديل مطبقاً مسبقاً" -ForegroundColor Cyan
    }
    
    Write-Host ""
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  ✅ اكتمل التطبيق" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "ℹ️  ملاحظة: إذا كنت تريد تعيين المنشئ للموردين/العملاء الحاليين،" -ForegroundColor Cyan
Write-Host "   قم بإلغاء التعليق عن الأسطر في ملفات SQL وأعد التشغيل" -ForegroundColor Cyan

