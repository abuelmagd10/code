# Services & Booking Management Module
**Version:** 3.0.0 | **Date:** 2026-05-11 | **Status:** Phase 3 Complete (API + Reports + Notifications)

---

## 📐 Architecture Overview

وحدة متكاملة داخل نظام ERP تتبع نفس الأنماط المعمارية تماماً:
- **Multi-tenant isolation:** company_id + branch_id في كل جدول
- **RLS:** `get_user_company_ids()` + `can_access_record_branch()`
- **Atomic RPCs:** `SECURITY DEFINER` functions مع `FOR UPDATE` locking
- **Audit:** `booking_status_history` لتتبع كل تغيير في حالة الحجز
- **Cash Basis:** الفاتورة تُنشأ عند `complete_booking_atomic` فقط

---

## 🗃️ Database Tables

### `services` — كتالوج الخدمات
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | معرف فريد |
| `company_id` | UUID NOT NULL | عزل الشركة |
| `branch_id` | UUID NOT NULL | عزل الفرع |
| `cost_center_id` | UUID | مركز التكلفة (nullable) |
| `service_code` | TEXT UNIQUE | كود تلقائي SVC-NNNN (غير قابل للتعديل) |
| `service_name` | TEXT | اسم الخدمة |
| `service_type` | TEXT | individual \| group \| hourly \| session \| daily |
| `unit_price` | NUMERIC | السعر |
| `cost_price` | NUMERIC | التكلفة (للربحية) |
| `tax_rate` | NUMERIC | نسبة الضريبة % |
| `commission_rate` | NUMERIC | نسبة عمولة الموظف % (تُدفع من الرواتب) |
| `duration_minutes` | INTEGER | مدة الخدمة بالدقائق |
| `capacity` | INTEGER | الطاقة الاستيعابية (حجوزات متزامنة) |
| `buffer_minutes` | INTEGER | وقت فراغ بين الحجوزات |
| `advance_booking_days` | INTEGER | أقصى أيام مسبقاً للحجز |
| `min_advance_hours` | INTEGER | أدنى ساعات قبل موعد الحجز |
| `cancel_before_hours` | INTEGER | أدنى ساعات قبل الإلغاء |
| `revenue_account_id` | UUID | حساب الإيرادات في شجرة الحسابات |
| `expense_account_id` | UUID | حساب التكاليف |
| `image_url` | TEXT | صورة الخدمة |
| `color_code` | TEXT | لون التمييز في Calendar View |
| `is_bookable` | BOOLEAN | مفتوح للحجز؟ |
| `is_active` | BOOLEAN | نشط؟ |

### `service_schedules` — مواعيد العمل الأسبوعية
| Column | Type | Description |
|--------|------|-------------|
| `service_id` | UUID | الخدمة |
| `day_of_week` | INTEGER | 0=الأحد … 6=السبت |
| `start_time` | TIME | بداية العمل |
| `end_time` | TIME | نهاية العمل |

> **قاعدة:** الحجز يُرفض إذا وقع خارج أوقات العمل (عبر trigger).

### `service_staff` — الموظفون المؤهلون
| Column | Type | Description |
|--------|------|-------------|
| `service_id` | UUID | الخدمة |
| `employee_user_id` | UUID | user_id من company_members |
| `is_primary` | BOOLEAN | الموظف الرئيسي؟ |

### `bookings` — الحجوزات الرئيسية
| Column | Type | Description |
|--------|------|-------------|
| `booking_no` | TEXT UNIQUE | BKG-YYYY-NNNNN |
| `service_id` | UUID | الخدمة |
| `customer_id` | UUID | العميل |
| `staff_user_id` | UUID | الموظف المنفذ |
| `booking_date` | DATE | تاريخ الحجز |
| `start_time` | TIME | وقت البداية |
| `end_time` | TIME | وقت النهاية (محسوب تلقائياً) |
| `status` | TEXT | دورة الحياة (أدناه) |
| `total_amount` | NUMERIC | إجمالي الفاتورة |
| `paid_amount` | NUMERIC | المدفوع (محسوب تلقائياً) |
| `payment_status` | TEXT | unpaid \| partial \| paid |
| `invoice_id` | UUID | الفاتورة (تُنشأ عند الإتمام) |
| `rating` | INTEGER | تقييم العميل 1–5 |
| `commission_amount` | NUMERIC | عمولة الموظف (للرواتب) |

### `booking_status_history` — سجل الحالات (Audit Trail)
سجل غير قابل للتعديل — يُكتب تلقائياً بالـ trigger.

### `booking_payments` — الدفعات المقدمة (Deposits)
| Column | Type | Description |
|--------|------|-------------|
| `booking_id` | UUID | الحجز |
| `amount` | NUMERIC | المبلغ |
| `payment_method` | TEXT | cash \| card \| transfer \| other |
| `invoice_id` | UUID | تُربط بالفاتورة عند الإتمام |

---

## 🔄 دورة حياة الحجز (Status Lifecycle)

```
         create_booking_atomic
               ↓
           [draft]
               ↓ confirm_booking_atomic
          [confirmed] ──────────────── no_show_booking_atomic → [no_show]
               ↓                └──── cancel_booking_atomic  → [cancelled]
          [in_progress]
               ↓ complete_booking_atomic
          [completed] ← invoice created here (Cash Basis)
```

### الأثر المحاسبي
| الحالة | الأثر |
|--------|-------|
| `draft` | ❌ لا قيد |
| `confirmed` | ❌ لا قيد |
| `in_progress` | ❌ لا قيد |
| `completed` | ✅ إنشاء فاتورة في `invoices` |
| `cancelled` | ❌ لا قيد — تحرير الموعد |
| `no_show` | ❌ لا قيد — تحرير الموعد |

---

## 🛡️ قواعد منع التعارض (Triggers)

| القاعدة | الآلية |
|---------|--------|
| **No Double Booking** | `bkg_check_staff_conflict` — نفس الموظف لا يحجز وقتاً متداخلاً |
| **Capacity Check** | `bkg_check_service_capacity` — لا يتجاوز `services.capacity` |
| **Working Hours** | `bkg_validate_working_hours` — الحجز ضمن `service_schedules` |
| **Advance Booking** | `bkg_validate_advance_booking` — `min_advance_hours` + `advance_booking_days` |
| **Status Guard** | `bkg_is_status_transition_allowed` — transitions غير مسموح بها مرفوضة |
| **Terminal Lock** | الحجوزات المكتملة/الملغاة غير قابلة للتعديل |

---

## 🔌 API RPCs (Supabase)

### Services
```sql
-- إنشاء خدمة
SELECT create_service_atomic(p_company_id, p_branch_id, p_created_by, p_service_name, p_service_type, p_unit_price, p_duration_minutes, ...);

-- تعديل خدمة
SELECT update_service_atomic(p_company_id, p_service_id, p_updated_by, p_service_name, ...);

-- أرشفة خدمة
SELECT archive_service_atomic(p_company_id, p_service_id, p_updated_by);
```

### Bookings
```sql
-- إنشاء حجز (draft)
SELECT create_booking_atomic(p_company_id, p_branch_id, p_service_id, p_customer_id, p_created_by, p_booking_date, p_start_time, ...);

-- تأكيد الحجز
SELECT confirm_booking_atomic(p_company_id, p_booking_id, p_confirmed_by);

-- بدء الخدمة
SELECT start_booking_atomic(p_company_id, p_booking_id, p_started_by);

-- إتمام الخدمة + إنشاء فاتورة
SELECT complete_booking_atomic(p_company_id, p_booking_id, p_completed_by);

-- إلغاء
SELECT cancel_booking_atomic(p_company_id, p_booking_id, p_cancelled_by, p_cancellation_reason);

-- عدم حضور
SELECT no_show_booking_atomic(p_company_id, p_booking_id, p_updated_by);

-- تسجيل دفعة مقدمة
SELECT add_booking_payment_atomic(p_company_id, p_booking_id, p_created_by, p_amount, p_payment_method);

-- تقييم العميل
SELECT rate_booking_atomic(p_company_id, p_booking_id, p_updated_by, p_rating, p_feedback);
```

---

## 📊 Views للتقارير

| View | الوصف |
|------|-------|
| `v_bookings_full` | حجوزات مع كل البيانات المرتبطة (جاهز للـ API) |
| `v_service_revenue_summary` | إيرادات شهرية حسب الخدمة |
| `v_staff_performance` | أداء الموظفين (حجوزات + إيراد + عمولة + تقييم) |
| `v_branch_occupancy_rate` | نسبة إشغال الفروع يومياً |

---

## 🔐 الصلاحيات

| الدور | المستوى |
|-------|---------|
| `owner` / `admin` / `general_manager` | كل الشركة + كل الفروع |
| `manager` | فرعه فقط |
| `sales_representative` / `cashier` | حسب `can_access_record_branch()` |
| موظف الخدمة | API layer يُفلتر `staff_user_id = auth.uid()` |

> **ملاحظة:** RLS يحمي على مستوى الشركة + الفرع. تقييد الموظف لحجوزاته يتم في API Route عبر query filter.

---

## 📁 ملفات Migration

```
supabase/migrations/
  20260512000100_services_schema.sql          B1 - جداول الخدمات
  20260512000200_services_constraints.sql     B2 - قيود + فهارس
  20260512000300_services_helpers.sql         B3 - دوال svc_
  20260512000400_services_triggers.sql        B4 - triggers الخدمات
  20260512000500_services_rls.sql             B5 - RLS الخدمات
  20260512000600_services_api_rpcs.sql        B6 - RPCs الخدمات
  20260512000700_bookings_schema.sql          B7 - جداول الحجوزات
  20260512000800_bookings_constraints.sql     B8 - قيود + فهارس conflict
  20260512000900_bookings_helpers.sql         B9 - دوال bkg_
  20260512001000_bookings_triggers.sql        B10 - triggers الحجوزات
  20260512001100_bookings_rls_views.sql       B11 - RLS + Views
  20260512001200_bookings_api_rpcs.sql        B12 - RPCs الحجوزات
```

---

## ✅ Phase 2 — API Routes (Complete)

جميع الـ API Routes منجزة:

```
app/api/services/             ✅ GET list / POST create / GET id / PUT update / archive / schedules / staff
app/api/bookings/             ✅ GET list / POST create
app/api/bookings/[id]/        ✅ GET detail
  confirm/ start/ complete/   ✅ lifecycle transitions (atomic RPCs)
  cancel/ no-show/ payment/   ✅ lifecycle transitions + deposit
  rate/                       ✅ customer rating
  availability/               ✅ check slot availability
  calendar/                   ✅ calendar view
```

---

## ✅ Phase 3A — Reports (Complete)

6 تقارير حجوزات منجزة:

| التقرير | الرابط | الـ View |
|---------|--------|---------|
| الإيرادات حسب الخدمة | `/reports/bookings/revenue-by-service` | `v_service_revenue_summary` |
| الحجوزات حسب الموظف | `/reports/bookings/bookings-by-staff` | `v_staff_performance` |
| الحجوزات الملغاة | `/reports/bookings/cancelled-bookings` | `v_bookings_full` |
| نسبة الإشغال | `/reports/bookings/occupancy-rate` | `v_branch_occupancy_rate` |
| الخدمات الأكثر طلباً | `/reports/bookings/top-services` | `v_service_revenue_summary` |
| الحجوزات حسب الفرع | `/reports/bookings/bookings-by-branch` | `v_service_revenue_summary` |

كل تقرير يدعم:
- تصدير CSV بـ BOM (`"﻿"`) للتوافق مع Excel العربي
- مخططات Recharts (BarChart + PieChart / AreaChart)
- ثنائية اللغة AR/EN
- بطاقات ملخص (4 مؤشرات)
- فلاتر تفاعلية

---

## ✅ Phase 3B — Notifications (Complete)

نظام إشعارات داخلية غير متزامن لجميع أحداث الحجز.

**الملف الرئيسي:** `lib/services/booking-notification.service.ts`  
**التوثيق الكامل:** [`docs/BOOKING_NOTIFICATIONS.md`](./BOOKING_NOTIFICATIONS.md)

### الأحداث المدعومة (9 أحداث)

| الحدث | الـ Method | المستقبلون |
|-------|-----------|-----------|
| حجز جديد | `notifyBookingCreated` | مدير الفرع |
| تأكيد الحجز | `notifyBookingConfirmed` | الموظف المسؤول |
| بدء الخدمة | `notifyBookingStarted` | مدير الفرع |
| اكتمال الخدمة | `notifyBookingCompleted` | المحاسب (عاجل) + الموظف |
| إلغاء الحجز | `notifyBookingCancelled` | مدير الفرع + الموظف |
| عدم الحضور | `notifyBookingNoShow` | مدير الفرع |
| دفعة جديدة | `notifyBookingPaymentAdded` | محاسب الفرع |
| تقييم منخفض (<3★) | `notifyLowRating` | القيادة + مدير الفرع |
| تذكير بالخدمة | `notifyBookingReminder` | الموظف المسؤول |

### Cron Job للتذكيرات
```
GET /api/cron/booking-reminders
Schedule: */15 * * * *   (كل 15 دقيقة — Vercel Cron)
Auth: Authorization: Bearer <CRON_SECRET>
```

---

## ✅ Phase 3C — UX Polish (Complete)

### Loading Skeletons
```
app/bookings/loading.tsx              — skeleton لقائمة الحجوزات
app/reports/bookings/loading.tsx      — skeleton لصفحات التقارير
```

### Error Boundaries
```
app/bookings/error.tsx                — error boundary للحجوزات
app/reports/bookings/error.tsx        — error boundary للتقارير
```

### Mobile Responsiveness
جميع الصفحات تستخدم:
- `md:mr-64` — مسافة للـ sidebar في الشاشات الكبيرة
- `p-4 md:p-8 pt-20 md:pt-8` — padding متجاوب
- `grid-cols-2 md:grid-cols-4` — شبكة متجاوبة للبطاقات
- `overflow-x-auto` — جداول قابلة للتمرير في الجوال

---

## 🔐 الصلاحيات

| الدور | المستوى |
|-------|---------|
| `owner` / `admin` / `general_manager` | كل الشركة + كل الفروع |
| `manager` | فرعه فقط |
| `sales_representative` / `cashier` | حسب `can_access_record_branch()` |
| موظف الخدمة | API layer يُفلتر `staff_user_id = auth.uid()` |

> **ملاحظة:** RLS يحمي على مستوى الشركة + الفرع. تقييد الموظف لحجوزاته يتم في API Route عبر query filter.

---

## 📁 ملفات Migration

```
supabase/migrations/
  20260512000100_services_schema.sql          B1 - جداول الخدمات
  20260512000200_services_constraints.sql     B2 - قيود + فهارس
  20260512000300_services_helpers.sql         B3 - دوال svc_
  20260512000400_services_triggers.sql        B4 - triggers الخدمات
  20260512000500_services_rls.sql             B5 - RLS الخدمات
  20260512000600_services_api_rpcs.sql        B6 - RPCs الخدمات
  20260512000700_bookings_schema.sql          B7 - جداول الحجوزات
  20260512000800_bookings_constraints.sql     B8 - قيود + فهارس conflict
  20260512000900_bookings_helpers.sql         B9 - دوال bkg_
  20260512001000_bookings_triggers.sql        B10 - triggers الحجوزات
  20260512001100_bookings_rls_views.sql       B11 - RLS + Views
  20260512001200_bookings_api_rpcs.sql        B12 - RPCs الحجوزات
```
