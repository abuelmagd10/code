#!/bin/bash

# =============================================
# تطبيق تصحيح COGS على قاعدة البيانات
# =============================================
# هذا السكريبت يطبق جميع التصحيحات المحاسبية على قاعدة البيانات
# =============================================

echo "========================================"
echo "  تطبيق تصحيح COGS المحاسبي"
echo "========================================"
echo ""

# التحقق من وجود psql
if ! command -v psql &> /dev/null; then
    echo "❌ psql غير مثبت. يرجى تثبيت PostgreSQL client"
    exit 1
fi

# التحقق من وجود ملفات SQL
files=(
    "scripts/011_auto_cogs_trigger.sql"
    "scripts/012_fix_historical_cogs.sql"
    "scripts/enhanced_reports_system.sql"
)

for file in "${files[@]}"; do
    if [ ! -f "$file" ]; then
        echo "❌ الملف غير موجود: $file"
        exit 1
    fi
done

echo "✅ جميع الملفات موجودة"
echo ""

# طلب معلومات الاتصال
echo "📝 أدخل معلومات الاتصال بقاعدة البيانات:"
echo ""

# خيار 1: استخدام Supabase
echo "الخيار 1: Supabase"
echo "  - افتح: https://app.supabase.com"
echo "  - اختر مشروعك → Settings → Database"
echo "  - انسخ Connection string (Direct connection)"
echo ""

read -p "هل تستخدم Supabase؟ (y/n): " use_supabase

if [ "$use_supabase" = "y" ] || [ "$use_supabase" = "Y" ]; then
    echo ""
    echo "📋 الصق Connection String من Supabase:"
    read -r connection_string
    
    if [ -z "$connection_string" ]; then
        echo "❌ Connection String فارغ!"
        exit 1
    fi
else
    # خيار 2: قاعدة بيانات محلية
    echo ""
    echo "الخيار 2: قاعدة بيانات محلية"
    read -p "Host (default: localhost): " host
    read -p "Port (default: 5432): " port
    read -p "Database name: " database
    read -p "Username (default: postgres): " username
    read -sp "Password: " password
    echo ""
    
    host=${host:-localhost}
    port=${port:-5432}
    username=${username:-postgres}
    
    connection_string="postgresql://${username}:${password}@${host}:${port}/${database}"
    export PGPASSWORD="$password"
fi

echo ""
echo "========================================"
echo "  تطبيق السكريبتات"
echo "========================================"
echo ""

# تطبيق السكريبتات بالترتيب
script_names=(
    "Trigger للـ COGS التلقائي"
    "دالة إصلاح البيانات القديمة"
    "تحديث Income Statement"
)

for i in "${!files[@]}"; do
    file="${files[$i]}"
    name="${script_names[$i]}"
    
    echo "[$((i+1))/${#files[@]}] تطبيق: $name"
    echo "  الملف: $file"
    
    if psql "$connection_string" -f "$file" > /dev/null 2>&1; then
        echo "  ✅ تم التطبيق بنجاح"
    else
        echo "  ❌ فشل التطبيق"
        read -p "  هل تريد المتابعة؟ (y/n): " continue
        if [ "$continue" != "y" ] && [ "$continue" != "Y" ]; then
            exit 1
        fi
    fi
    
    echo ""
done

echo "========================================"
echo "  تشغيل دالة الإصلاح"
echo "========================================"
echo ""

echo "📝 أدخل Company ID لتطبيق الإصلاح:"
echo "  (يمكنك الحصول عليه من جدول companies)"
read -p "Company ID: " company_id

if [ -z "$company_id" ]; then
    echo "⚠️  تم تخطي تشغيل دالة الإصلاح"
else
    echo ""
    echo "تشغيل: fix_historical_cogs('$company_id')"
    
    query="SELECT * FROM fix_historical_cogs('$company_id');"
    
    if result=$(psql "$connection_string" -c "$query" 2>&1); then
        echo "✅ تم تشغيل دالة الإصلاح بنجاح"
        echo ""
        echo "النتيجة:"
        echo "$result"
    else
        echo "❌ فشل تشغيل دالة الإصلاح"
        echo "الخطأ: $result"
    fi
fi

echo ""
echo "========================================"
echo "  التحقق من النجاح"
echo "========================================"
echo ""

# فحص عدد قيود COGS
echo "فحص قيود COGS..."
query="SELECT COUNT(*) as cogs_entries FROM journal_entries WHERE reference_type = 'invoice_cogs';"

if result=$(psql "$connection_string" -t -c "$query" 2>&1); then
    echo "✅ عدد قيود COGS: $result"
else
    echo "⚠️  تعذر فحص قيود COGS"
fi

echo ""
echo "========================================"
echo "  ✅ تم الانتهاء بنجاح!"
echo "========================================"
echo ""
echo "الخطوات التالية:"
echo "1. تحقق من التقارير المالية"
echo "2. راجع قيود COGS في journal_entries"
echo "3. اختبر إنشاء فاتورة بيع جديدة"
echo ""
echo "للمزيد من المعلومات، راجع:"
echo "  - COGS_FIX_README.md"
echo "  - docs/COGS_ACCOUNTING_FIX.md"
echo ""

