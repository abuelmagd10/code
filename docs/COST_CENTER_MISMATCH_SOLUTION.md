# 🔧 حل مشكلة cost_center_id Mismatch

## 🔍 المشكلة

المنتج موجود في مخزن مصر الجديدة (1200 وحدة)، لكن النظام يقول الرصيد = 0.

**السبب المحتمل**: `cost_center_id` في transactions مختلف عن `default_cost_center_id` في branch.

## ✅ الحل المطبق

تم تحديث دالة `get_available_inventory_quantity` لتكون أكثر مرونة:

1. **المحاولة 1**: البحث بالمعايير الصارمة (warehouse + branch + cost_center)
2. **المحاولة 2**: إذا لم توجد transactions، البحث بدون cost_center_id (فقط warehouse + branch)
3. **المحاولة 3**: إذا لم توجد transactions، البحث بدون branch_id (فقط warehouse)

## 📋 خطوات التشخيص

شغّل الملف `scripts/DEEP_DIAGNOSTICS.sql` للتحقق من:

1. ما هو `cost_center_id` المستخدم في transactions؟
2. ما هو `default_cost_center_id` في branch؟
3. هل هناك mismatch؟

## 🔧 حلول إضافية

إذا استمرت المشكلة بعد التحديث:

### الحل 1: تحديث transactions لتستخدم default_cost_center_id الصحيح

شغّل الاستعلام في `scripts/FIX_COST_CENTER_MISMATCH.sql` (الخطوة 2).

### الحل 2: تحديث default_cost_center_id في branch

شغّل الاستعلام في `scripts/FIX_COST_CENTER_MISMATCH.sql` (الخطوة 3).
