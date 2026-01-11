@echo off
echo 🔄 إعادة تشغيل الخادم لحل مشاكل React...

echo 🧹 تنظيف الكاش...
if exist ".next" rmdir /s /q ".next"
if exist "node_modules\.cache" rmdir /s /q "node_modules\.cache"

echo 🔧 إعادة بناء المشروع...
call npm run build

echo 🚀 تشغيل الخادم...
call npm run dev