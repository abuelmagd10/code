-- ============================================================================
-- v3.74.950 — الجدارُ يبدأ: سحبُ الكتابة عن ستة أعمدةٍ لا تكتبها دالةٌ واحدة
-- ============================================================================
--
-- القياسُ الذى استدعى هذه الهجرة، وأوقف واحدةً أخطرَ منها:
--
-- الأعمدةُ المالية الاثنان والعشرون فى الجداول الستة كانت ممنوحةً لـ
-- `authenticated` **قراءةً وإدراجاً وتعديلاً**. أى أن المنافذَ المقنَّعة التى
-- بُنيت فى تسعة إصدارات **بابٌ مهذَّب لا جدار**: من يملك جلسةً يستطيع أن
-- يُعدّل `unit_price` فى بندِ فاتورةِ شراءٍ مباشرةً من المتصفح.
--
-- ⚠️ وأوقف القياسُ علاجاً كنتُ اقترحتُه: أربعُ دوالَّ تكتب فى هذه الجداول
-- بصلاحيات المستدعِى (اثنتان منها محفِّزان)، فاقترحتُ ترقيتَها إلى
-- `SECURITY DEFINER`. **وكان سيفتح باباً أوسعَ مما يسدّ**: محفِّزٌ بصلاحيات
-- المالك يعمل عند كل كتابة، وجسدُه يتجاوز سياساتِ الصفوف — فيصير مسارَ
-- كتابةٍ بلا حَكَم.
--
-- فقِيس بدلاً من ذلك **ما تكتبه الأربعُ فعلاً**:
--
--   تكتبه:      paid_amount · returned_amount · subtotal · tax_amount · total_amount
--   لا تلمسه:   unit_price · line_total · discount_value · shipping ·
--               adjustment · received_amount
--
-- **فالسعرُ نفسُه لا تكتبه دالةٌ واحدةٌ منها** — وهو أخطرُ الأعمدة، ومنه
-- تُشتقّ التكلفةُ التى بُني عليها كلُّ الحجب. فتُسحب الكتابةُ عن الستة التى
-- لا تكتبها دالةٌ واحدة: **صفرُ ترقياتِ صلاحية، وصفرُ محفِّزاتٍ تُمَسّ.**
--
-- والخمسةُ الباقية تنتظر 951، وعلاجُها **نقلُ ما تفعله الأربعُ إلى الدوالِّ
-- العشرين التى تعمل أصلاً بصلاحيات المالك** — إزالةُ الحاجة، لا توسيعُ الإذن.
--
-- والقراءةُ لا تُمَسّ هنا: ٨٦ قراءةً مباشرةً باقيةٌ فى التقارير، وسحبُ
-- `SELECT` اليوم يكسرها. الجدارُ يُبنى صفّاً صفّاً، ولا يُقفز عليه.
-- ============================================================================

-- ── بنودُ الشراء: السعرُ وإجمالىُّ البند ────────────────────────────────────
REVOKE INSERT (unit_price, line_total), UPDATE (unit_price, line_total)
  ON public.bill_items            FROM authenticated, anon;
REVOKE INSERT (unit_price, line_total), UPDATE (unit_price, line_total)
  ON public.purchase_order_items  FROM authenticated, anon;
REVOKE INSERT (unit_price, line_total), UPDATE (unit_price, line_total)
  ON public.purchase_return_items FROM authenticated, anon;

-- ── رؤوسُ الفواتير: الخصمُ والشحنُ والتسوية ─────────────────────────────────
REVOKE INSERT (discount_value, shipping, adjustment),
       UPDATE (discount_value, shipping, adjustment)
  ON public.bills FROM authenticated, anon;

-- ── أمرُ الشراء: المستلَم ───────────────────────────────────────────────────
REVOKE INSERT (received_amount), UPDATE (received_amount)
  ON public.purchase_orders FROM authenticated, anon;

-- ── و`service_role` لا يُمَسّ: كلُّ كتابةٍ حقيقيةٍ تمرّ منه أو من دالةِ مالك ─
GRANT INSERT, UPDATE ON public.bill_items            TO service_role;
GRANT INSERT, UPDATE ON public.purchase_order_items  TO service_role;
GRANT INSERT, UPDATE ON public.purchase_return_items TO service_role;
GRANT INSERT, UPDATE ON public.bills                 TO service_role;
GRANT INSERT, UPDATE ON public.purchase_orders       TO service_role;
