# 🚀 GitHub Repository Setup Script
# تهيئة مستودع GitHub لاختبار أوامر البيع

Write-Host "🚀 إعداد مستودع GitHub" -ForegroundColor Cyan
Write-Host "=====================" -ForegroundColor Cyan
Write-Host ""

# التحقق من وجود Git
try {
    $gitVersion = git --version
    Write-Host "✅ Git متوفر: $gitVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Git غير مثبت. يرجى تثبيت Git أولاً" -ForegroundColor Red
    Write-Host "تحميل من: https://git-scm.com/download/win" -ForegroundColor Yellow
    exit 1
}

# التحقق من وجود GitHub CLI (اختياري)
try {
    $ghVersion = gh --version
    Write-Host "✅ GitHub CLI متوفر: $($ghVersion[0])" -ForegroundColor Green
    $hasGhCli = $true
} catch {
    Write-Host "⚠️  GitHub CLI غير متوفر (اختياري)" -ForegroundColor Yellow
    $hasGhCli = $false
}

Write-Host ""

# تهيئة Git repository إذا لم يكن موجوداً
if (-not (Test-Path ".git")) {
    Write-Host "📦 تهيئة Git repository..." -ForegroundColor Yellow
    git init
    Write-Host "✅ تم تهيئة Git repository" -ForegroundColor Green
} else {
    Write-Host "✅ Git repository موجود بالفعل" -ForegroundColor Green
}

# إضافة الملفات
Write-Host ""
Write-Host "📁 إضافة الملفات إلى Git..." -ForegroundColor Yellow

# إضافة الملفات المهمة
$filesToAdd = @(
    "README.md",
    ".gitignore", 
    "apply-governance-fixes.ps1",
    "lib/data-visibility-control.ts",
    "app/sales-orders/page.tsx",
    "fix-sales-orders-visibility.sql",
    "emergency-fix-loadorders.js"
)

foreach ($file in $filesToAdd) {
    if (Test-Path $file) {
        git add $file
        Write-Host "✅ تمت إضافة: $file" -ForegroundColor Green
    } else {
        Write-Host "⚠️  ملف غير موجود: $file" -ForegroundColor Yellow
    }
}

# إضافة باقي الملفات (باستثناء المستبعدة في .gitignore)
git add .
Write-Host "✅ تمت إضافة جميع الملفات" -ForegroundColor Green

# إنشاء commit
Write-Host ""
Write-Host "💾 إنشاء commit..." -ForegroundColor Yellow

$commitMessage = "🔒 إصلاحات الحوكمة الطارئة - إظهار أوامر البيع

✅ الإصلاحات المطبقة:
- تبسيط فلاتر الحوكمة في data-visibility-control.ts
- إصلاح دالة loadOrders في sales-orders/page.tsx  
- إضافة سكريپت إصلاح قاعدة البيانات
- فحص الأمان وإزالة الأنماط الخطيرة

🎯 النتيجة: أوامر البيع (60 أمر) ستظهر الآن للمستخدمين

⚠️  تحذير: هذه إصلاحات طارئة - يجب تطبيق الحوكمة الكاملة لاحقاً"

git commit -m "$commitMessage"

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ تم إنشاء commit بنجاح" -ForegroundColor Green
} else {
    Write-Host "❌ فشل في إنشاء commit" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🌐 خيارات رفع المشروع إلى GitHub:" -ForegroundColor Cyan
Write-Host ""

if ($hasGhCli) {
    Write-Host "الخيار 1: استخدام GitHub CLI (موصى به)" -ForegroundColor Green
    Write-Host "gh repo create ERB_VitaSlims --public --source=. --remote=origin --push" -ForegroundColor Gray
    Write-Host ""
}

Write-Host "الخيار 2: إنشاء repository يدوياً" -ForegroundColor Yellow
Write-Host "1. اذهب إلى https://github.com/new" -ForegroundColor Gray
Write-Host "2. اسم المستودع: ERB_VitaSlims" -ForegroundColor Gray
Write-Host "3. اختر Public أو Private" -ForegroundColor Gray
Write-Host "4. لا تضع ✅ على Initialize with README" -ForegroundColor Gray
Write-Host "5. انقر Create repository" -ForegroundColor Gray
Write-Host "6. انسخ الأوامر من GitHub وشغلها هنا" -ForegroundColor Gray

Write-Host ""
$createRepo = Read-Host "هل تريد إنشاء GitHub repository الآن؟ (y/n)"

if ($createRepo -eq "y" -or $createRepo -eq "Y") {
    if ($hasGhCli) {
        Write-Host ""
        Write-Host "🚀 إنشاء GitHub repository..." -ForegroundColor Cyan
        
        $repoName = Read-Host "اسم المستودع (اتركه فارغاً لاستخدام ERB_VitaSlims)"
        if ([string]::IsNullOrEmpty($repoName)) {
            $repoName = "ERB_VitaSlims"
        }
        
        $visibility = Read-Host "نوع المستودع (public/private) - اتركه فارغاً لـ public"
        if ([string]::IsNullOrEmpty($visibility)) {
            $visibility = "public"
        }
        
        try {
            gh repo create $repoName --$visibility --source=. --remote=origin --push
            Write-Host ""
            Write-Host "🎉 تم إنشاء GitHub repository بنجاح!" -ForegroundColor Green
            Write-Host "🔗 رابط المستودع: https://github.com/$(gh api user --jq .login)/$repoName" -ForegroundColor Cyan
        } catch {
            Write-Host "❌ فشل في إنشاء المستودع. جرب الطريقة اليدوية" -ForegroundColor Red
        }
    } else {
        Write-Host "❌ GitHub CLI غير متوفر. استخدم الطريقة اليدوية أعلاه" -ForegroundColor Red
    }
} else {
    Write-Host ""
    Write-Host "📝 لرفع المشروع لاحقاً، استخدم:" -ForegroundColor Yellow
    Write-Host "git remote add origin https://github.com/YOUR_USERNAME/ERB_VitaSlims.git" -ForegroundColor Gray
    Write-Host "git branch -M main" -ForegroundColor Gray  
    Write-Host "git push -u origin main" -ForegroundColor Gray
}

Write-Host ""
Write-Host "✅ إعداد GitHub مكتمل!" -ForegroundColor Green
Write-Host "🎯 الآن يمكنك اختبار ظهور أوامر البيع" -ForegroundColor Cyan
Write-Host ""
Write-Host "الخطوات التالية:" -ForegroundColor White
Write-Host "1. npm run dev - لتشغيل التطبيق" -ForegroundColor Gray
Write-Host "2. اذهب إلى /sales-orders" -ForegroundColor Gray  
Write-Host "3. تأكد من ظهور الـ 60 أمر بيع" -ForegroundColor Gray
Write-Host "4. اختبر الوظائف الأساسية" -ForegroundColor Gray