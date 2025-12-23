#!/usr/bin/env pwsh
# تصحيح البيانات القديمة - COGS Accounting Fix

Write-Host "🚀 بدء تصحيح البيانات القديمة..." -ForegroundColor Green

# التحقق من متغيرات البيئة
if (-not $env:SUPABASE_URL -or -not $env:SUPABASE_SERVICE_ROLE_KEY) {
    Write-Host "❌ متغيرات البيئة مفقودة: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY" -ForegroundColor Red
    exit 1
}

# تشغيل السكريبت على قاعدة البيانات
Write-Host "📊 تطبيق السكريبت على قاعدة البيانات..." -ForegroundColor Yellow

try {
    # يمكن استخدام psql أو أي أداة أخرى لتشغيل SQL
    Write-Host "✅ لتشغيل السكريبت يدوياً:" -ForegroundColor Green
    Write-Host "1. افتح Supabase SQL Editor" -ForegroundColor Cyan
    Write-Host "2. انسخ محتوى ملف: scripts/fix_historical_data_complete.sql" -ForegroundColor Cyan
    Write-Host "3. شغل السكريبت" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "أو استخدم API:" -ForegroundColor Green
    Write-Host "POST /api/fix-historical-data" -ForegroundColor Cyan
}
catch {
    Write-Host "❌ خطأ: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host "🎉 تم الانتهاء من إعداد أدوات التصحيح!" -ForegroundColor Green