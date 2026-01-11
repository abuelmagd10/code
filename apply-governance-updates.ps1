# 🔒 تطبيق تحديثات الحوكمة على البيانات القديمة
# ERB VitaSlims - Governance Update Script

Write-Host "🔒 بدء تطبيق تحديثات الحوكمة..." -ForegroundColor Cyan

# 1️⃣ التحقق من وجود ملف SQL
if (-not (Test-Path ".\update-governance-data.sql")) {
    Write-Host "❌ ملف update-governance-data.sql غير موجود!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ ملف SQL موجود" -ForegroundColor Green

# 2️⃣ قراءة متغيرات البيئة
$envFile = ".env.local"
if (-not (Test-Path $envFile)) {
    Write-Host "❌ ملف .env.local غير موجود!" -ForegroundColor Red
    exit 1
}

Write-Host "📖 قراءة إعدادات قاعدة البيانات..." -ForegroundColor Yellow

# 3️⃣ عرض التعليمات
Write-Host ""
Write-Host "📋 لتطبيق التحديثات، استخدم أحد الخيارات التالية:" -ForegroundColor Cyan
Write-Host ""
Write-Host "الخيار 1: استخدام Supabase Dashboard" -ForegroundColor White
Write-Host "  1. افتح Supabase Dashboard" -ForegroundColor Gray
Write-Host "  2. اذهب إلى SQL Editor" -ForegroundColor Gray
Write-Host "  3. انسخ محتوى ملف update-governance-data.sql" -ForegroundColor Gray
Write-Host "  4. نفذ الاستعلام" -ForegroundColor Gray
Write-Host ""
Write-Host "الخيار 2: استخدام psql" -ForegroundColor White
Write-Host "  psql -h [HOST] -U [USER] -d [DATABASE] -f update-governance-data.sql" -ForegroundColor Gray
Write-Host ""

# 4️⃣ عرض محتوى الملف
Write-Host "📄 محتوى ملف SQL:" -ForegroundColor Cyan
Write-Host "----------------------------------------" -ForegroundColor Gray
Get-Content ".\update-governance-data.sql" | Write-Host -ForegroundColor White
Write-Host "----------------------------------------" -ForegroundColor Gray
Write-Host ""

# 5️⃣ سؤال المستخدم
$response = Read-Host "هل تريد فتح Supabase Dashboard الآن؟ (y/n)"
if ($response -eq 'y' -or $response -eq 'Y') {
    Write-Host "🌐 فتح Supabase Dashboard..." -ForegroundColor Green
    Start-Process "https://supabase.com/dashboard"
}

Write-Host ""
Write-Host "✅ تم الانتهاء من الإعداد" -ForegroundColor Green
Write-Host "⚠️  تذكر: نفذ SQL script في Supabase Dashboard" -ForegroundColor Yellow
