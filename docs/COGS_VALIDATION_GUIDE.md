# دليل Validation & Safety Layer لنظام COGS Professional

## 📋 نظرة عامة

Validation & Safety Layer يوفر دوال تحقق دورية لتأكيد سلامة نظام COGS Professional والتأكد من:
- ✅ COGS Transactions مرتبطة بـ FIFO Consumptions
- ✅ Write-Offs لديها Governance كامل (branch/cost_center/warehouse)
- ✅ Integrity بين FIFO, COGS, Journal Entries

---

## 🔍 الدوال المتاحة

### 1. `validate_cogs_with_fifo()`

**الوظيفة**: كشف COGS transactions بدون FIFO Consumption.

**الاستخدام**:
```sql
-- عرض جميع COGS transactions بدون FIFO
SELECT * FROM validate_cogs_with_fifo();

-- عدد المشاكل
SELECT COUNT(*) as issues_count 
FROM validate_cogs_with_fifo();
```

**النتيجة المتوقعة**:
- ✅ `issues_count = 0`: جميع COGS transactions مرتبطة بـ FIFO
- ⚠️ `issues_count > 0`: توجد COGS transactions بدون FIFO (يجب المراجعة)

---

### 2. `validate_write_off_governance()`

**الوظيفة**: كشف Write-Offs بدون Governance كامل.

**الاستخدام**:
```sql
-- عرض جميع Write-Offs بدون Governance
SELECT * FROM validate_write_off_governance();

-- عدد المشاكل
SELECT COUNT(*) as issues_count 
FROM validate_write_off_governance();
```

**النتيجة المتوقعة**:
- ✅ `issues_count = 0`: جميع Write-Offs لديها Governance كامل
- ⚠️ `issues_count > 0`: توجد Write-Offs بدون Governance (يجب المراجعة)

---

### 3. `validate_cogs_integrity(company_id, date_from, date_to)`

**الوظيفة**: التحقق من Integrity بين FIFO, COGS, Journal Entries.

**الاستخدام**:
```sql
-- Integrity Check للشهر الأخير (افتراضي)
SELECT * FROM validate_cogs_integrity();

-- Integrity Check لشركة محددة
SELECT * FROM validate_cogs_integrity(
  p_company_id := 'YOUR_COMPANY_ID',
  p_date_from := CURRENT_DATE - INTERVAL '30 days',
  p_date_to := CURRENT_DATE
);

-- عدد المشاكل
SELECT COUNT(*) as issues_count 
FROM validate_cogs_integrity()
WHERE integrity_status != '✅ سليم';
```

**النتيجة المتوقعة**:
- ✅ `integrity_status = '✅ سليم'`: FIFO = COGS = Journal (فارق < 0.01)
- ⚠️ `integrity_status = '⚠️ عدم تطابق'`: توجد فروقات (يجب المراجعة)

---

### 4. `validate_cogs_system(company_id, date_from, date_to)` (All-in-One)

**الوظيفة**: التحقق الشامل من نظام COGS (جميع الاختبارات).

**الاستخدام**:
```sql
-- التحقق الشامل (الشهر الأخير)
SELECT * FROM validate_cogs_system();

-- التحقق الشامل لشركة محددة
SELECT * FROM validate_cogs_system(
  p_company_id := 'YOUR_COMPANY_ID',
  p_date_from := CURRENT_DATE - INTERVAL '30 days',
  p_date_to := CURRENT_DATE
);

-- استخراج النتيجة كـ JSON
SELECT validate_cogs_system()::jsonb;
```

**النتيجة (JSON)**:
```json
{
  "validation_date": "2026-01-12T10:30:00Z",
  "company_id": "YOUR_COMPANY_ID",
  "date_from": "2026-01-01",
  "date_to": "2026-01-12",
  "checks": {
    "cogs_without_fifo": {
      "count": 0,
      "status": "✅ سليم"
    },
    "write_off_governance": {
      "count": 0,
      "status": "✅ سليم"
    },
    "integrity": {
      "count": 0,
      "status": "✅ سليم"
    }
  },
  "overall_status": "✅ جميع الاختبارات نجحت",
  "total_issues": 0
}
```

---

## 📊 استخدامات دورية

### 1. تحقق يومي (Scheduled Task)

```sql
-- تحقق يومي (آخر 7 أيام)
SELECT * FROM validate_cogs_system(
  p_date_from := CURRENT_DATE - INTERVAL '7 days',
  p_date_to := CURRENT_DATE
);
```

### 2. تحقق أسبوعي (Scheduled Task)

```sql
-- تحقق أسبوعي (آخر 30 يوم)
SELECT * FROM validate_cogs_system(
  p_date_from := CURRENT_DATE - INTERVAL '30 days',
  p_date_to := CURRENT_DATE
);
```

### 3. تحقق قبل التقارير المالية

```sql
-- تحقق قبل التقارير الشهرية
SELECT * FROM validate_cogs_system(
  p_date_from := DATE_TRUNC('month', CURRENT_DATE),
  p_date_to := CURRENT_DATE
);
```

---

## ⚠️ معالجة المشاكل

### المشكلة 1: COGS بدون FIFO

**الأعراض**:
```sql
SELECT * FROM validate_cogs_with_fifo();
-- Returns: COGS transactions بدون fifo_consumption_id
```

**السبب المحتمل**:
- COGS transaction تم إنشاؤها يدوياً (قبل التحديث)
- خطأ في عملية Invoice Sent / Write-Off Approval

**الحل**:
1. التحقق من التاريخ (`transaction_date`)
2. إذا كانت قديمة (قبل التحديث): طبيعي - لا إجراء
3. إذا كانت حديثة (بعد التحديث): خطأ - يجب المراجعة

---

### المشكلة 2: Write-Off بدون Governance

**الأعراض**:
```sql
SELECT * FROM validate_write_off_governance();
-- Returns: Write-Offs بدون branch_id / cost_center_id / warehouse_id
```

**السبب المحتمل**:
- Write-Off قديم (قبل إضافة Governance)
- خطأ في عملية إنشاء Write-Off

**الحل**:
1. التحقق من التاريخ (`write_off_date`)
2. إذا كانت قديمة: يمكن تحديثها يدوياً (اختياري)
3. إذا كانت حديثة: خطأ - يجب المراجعة

---

### المشكلة 3: عدم تطابق Integrity

**الأعراض**:
```sql
SELECT * FROM validate_cogs_integrity()
WHERE integrity_status != '✅ سليم';
-- Returns: فروقات بين FIFO, COGS, Journal
```

**السبب المحتمل**:
- خطأ في حساب COGS
- خطأ في Journal Entry
- خطأ في FIFO Consumption

**الحل**:
1. مراجعة التفاصيل (`issue_description`)
2. التحقق من `difference`
3. إذا كان الفارق صغير (< 0.1): قد يكون خطأ تقريب
4. إذا كان الفارق كبير (> 0.1): خطأ - يجب المراجعة

---

## 📝 أفضل الممارسات

### 1. تشغيل التحقق دورياً
```sql
-- تحقق يومي (يُنصح بتشغيله كـ Scheduled Task)
SELECT * FROM validate_cogs_system();
```

### 2. التحقق قبل التقارير المالية
```sql
-- تحقق قبل إصدار التقارير
SELECT * FROM validate_cogs_system(
  p_date_from := DATE_TRUNC('month', CURRENT_DATE),
  p_date_to := CURRENT_DATE
);
```

### 3. تسجيل النتائج
```sql
-- حفظ نتائج التحقق (للأرشفة)
CREATE TABLE IF NOT EXISTS cogs_validation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  validation_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id UUID,
  date_from DATE,
  date_to DATE,
  validation_result JSONB NOT NULL,
  total_issues INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- إدراج نتيجة التحقق
INSERT INTO cogs_validation_log (validation_result, total_issues)
SELECT 
  validate_cogs_system()::jsonb,
  (validate_cogs_system()->>'total_issues')::INTEGER;
```

---

## ✅ Checklist

- [ ] ✅ `validate_cogs_with_fifo()` - لا توجد مشاكل
- [ ] ✅ `validate_write_off_governance()` - لا توجد مشاكل
- [ ] ✅ `validate_cogs_integrity()` - جميع السجلات سليمة
- [ ] ✅ `validate_cogs_system()` - `overall_status = '✅ جميع الاختبارات نجحت'`

---

## 📚 المراجع

- `scripts/031_cogs_validation_functions.sql` - Validation Functions
- `scripts/test_write_off_end_to_end.sql` - اختبارات Write-Off
- `docs/COGS_MIGRATION_GUIDE.md` - دليل الترحيل

---

**تاريخ الإنشاء**: 2026-01-12  
**آخر تحديث**: 2026-01-12
