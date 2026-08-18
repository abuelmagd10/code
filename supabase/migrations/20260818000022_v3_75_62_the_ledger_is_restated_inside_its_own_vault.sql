-- ═══════════════════════════════════════════════════════════════════════════
-- v3.75.62 — «والدفترُ يُعادُ حسابُه فى خزانتِه لا فى يدِ زائرِه»
-- ═══════════════════════════════════════════════════════════════════════════
-- حارسُ تغييرِ العملةِ الأساسيّةِ (من دفعةٍ سابقة) يرفضُ التغييرَ لشركةٍ لها
-- حركةٌ ماليّة، ويتركُ باباً مُسمّىً (app.allow_base_currency_change) لمسارِ
-- تحويلٍ لم يكن قد بُنى. وكانت شاشةُ الإعداداتِ تحملُ مساراً قديماً يُعيدُ
-- كتابةَ الدفاترِ من المتصفّحِ أمراً أمراً بلا معاملةٍ واحدة، ثمّ يُرَدُّ عندَ
-- الخطوةِ الأخيرةِ فتبقى الشركةُ ممزّقة. **ونصفُ جراحةٍ أسوأُ من لا جراحة.**
--
-- هذه الدفعةُ تبنى المسارَ فى القاعدةِ نفسِها:
--   (١) عشرةُ حُرّاسٍ تُزرَعُ فى صدرِ كلٍّ منها فتحةُ البابِ المُسمّى —
--       لا يُمَسُّ من أجسادِها حرفٌ غيرُ ذلك. **وحارسٌ يُفتَحُ بابُه ليس
--       حارساً** إن فُتِحَ بلا اسمٍ — فالبابُ هنا لا يُفتَحُ إلّا من داخلِ
--       معاملةِ دالّةِ الخزانةِ وحدِها، ولا يبلغُه REST ولا زائرٌ ولا مستخدِم.
--   (٢) دالّةُ الخزانةِ change_base_currency: معاملةٌ واحدةٌ تتحقّقُ من
--       الصلاحيّةِ والسعرِ قبلَ أن تلمسَ شيئاً، تُعيدُ حسابَ المحفوظِ على
--       الأساسِ الجديد، تُعيدُ توجيهَ الأسعار، تُسجِّلُ ما فعلت، وتفتحُ
--       بابَ الحارسِ لنفسِها بالاسم. إن فشلَ حرفٌ رجعَ كلُّ شىء.
--   (٣) فحصٌ مرجعىٌّ مولودٌ يُثبِّتُ أهلَ البابِ بالاسم.
--   (٤) بابانِ يتيمانِ من المسارِ المُسرَّحِ تُنزَعُ منحتُهما: الملفُّ المحذوفُ
--       كان طارقَهما الوحيدَ، ولا مُنادىَ لهما فى قاعدةٍ ولا كود — وبابٌ بلا
--       طارقٍ بصلاحيّاتٍ كاملةٍ لا يُترَكُ مفتوحاً. (يبقيانِ لمفتاحِ الخدمة.)
--
-- القراراتُ الثلاثةُ لصاحبِ المشروع (v3.75.62):
--   · السعرُ من جدولِ أسعارِ الشركةِ وحدَه — لا مصدرَ خارجىَّ ولا «واحد».
--   · الكودُ القديمُ فى المتصفّحِ يُزالُ فى الدفعةِ نفسِها.
--   · الحقُّ للمالكِ والمديرِ العامِّ فقط، ويُفحَصُ داخلَ القاعدةِ لا الشاشة.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- (١) فتحةُ البابِ المُسمّى فى الحُرّاسِ العشرة — الجسدُ محفوظٌ حرفاً حرفاً
--     (سبعةٌ صرخوا فى المحاكمةِ الأولى على بيتِ الاختبار، والثامنُ
--      prevent_paid_invoice_modification كان مختبئاً خلفَ أوّلِهم ولم يصرخْ
--      إلّا بعدَ أن فُتِح، والتاسعُ والعاشرُ حارسا تجاوزِ السدادِ صرخا على
--      الإنتاجِ على بياناتٍ تاريخيّةٍ لم تمسَّها الجراحةُ أصلاً — وفخٌّ لا
--      يُشغَّلُ ليس فخّاً، وكلُّ بابٍ فُتِحَ بمحاكمةٍ حيّةٍ لا استنتاجاً.
--      ونظيرُ الشراءِ trg_prevent_bill_modification يحمى total_amount وحدَه
--      ونحن لا نمسُّه، فلا يُفتَحُ له بابٌ بلا حاجة.)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.block_invoice_immutable_edits()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_locked boolean := false;
BEGIN
  -- v3.75.62 «والدفترُ يُعادُ حسابُه فى خزانتِه»: مسارُ تحويلِ العملةِ
  -- الأساسيّةِ يفتحُ لنفسِه بالاسم، تعديلاً لا حذفاً، داخلَ معاملتِه وحدَها.
  IF TG_OP = 'UPDATE'
     AND coalesce(current_setting('app.allow_base_currency_change', true), 'false') = 'true' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.paid_amount, 0) > 0
     OR COALESCE(NEW.returned_amount, 0) > 0
     OR EXISTS (SELECT 1 FROM public.payments p
                 WHERE (p.invoice_id = NEW.id)
                   AND p.status IN ('approved','pending_approval')
                   AND p.voided_at IS NULL AND p.voids_payment_id IS NULL)
     OR EXISTS (SELECT 1 FROM public.payment_allocations pa
                 WHERE pa.invoice_id = NEW.id) THEN
    v_locked := true;
  END IF;

  BEGIN
    IF NOT v_locked AND EXISTS (
      SELECT 1 FROM public.sales_return_requests
       WHERE invoice_id = NEW.id
         AND LOWER(COALESCE(status,'')) IN (
           'pending','approved','partial_approval','pending_warehouse','completed'
         )
    ) THEN
      v_locked := true;
    END IF;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  IF NOT v_locked THEN RETURN NEW; END IF;

  IF NEW.total_amount   IS DISTINCT FROM OLD.total_amount   OR
     NEW.currency_code  IS DISTINCT FROM OLD.currency_code  OR
     NEW.exchange_rate  IS DISTINCT FROM OLD.exchange_rate  OR
     NEW.customer_id    IS DISTINCT FROM OLD.customer_id    OR
     NEW.invoice_date   IS DISTINCT FROM OLD.invoice_date THEN
    RAISE EXCEPTION
      'لا يُمكِن تَعديل هذا الحَقل بَعد وُجود دَفعات أَو مَرتَجَعات على الفاتورة. استَخدِم مَسار التَّصحيح المُعتَمَد.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.block_bill_immutable_edits()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_locked boolean := false;
BEGIN
  -- v3.75.62 «والدفترُ يُعادُ حسابُه فى خزانتِه»: مسارُ تحويلِ العملةِ
  -- الأساسيّةِ يفتحُ لنفسِه بالاسم، تعديلاً لا حذفاً، داخلَ معاملتِه وحدَها.
  IF TG_OP = 'UPDATE'
     AND coalesce(current_setting('app.allow_base_currency_change', true), 'false') = 'true' THEN
    RETURN NEW;
  END IF;

  -- Locked once ANY payment, allocation, or return references it
  IF COALESCE(NEW.paid_amount, 0) > 0
     OR COALESCE(NEW.returned_amount, 0) > 0
     OR EXISTS (SELECT 1 FROM public.payments p
                 WHERE (p.bill_id = NEW.id)
                   AND p.status IN ('approved','pending_approval')
                   AND p.voided_at IS NULL AND p.voids_payment_id IS NULL)
     OR EXISTS (SELECT 1 FROM public.payment_allocations pa
                 WHERE pa.bill_id = NEW.id)
     OR EXISTS (SELECT 1 FROM public.purchase_returns pr
                 WHERE pr.bill_id = NEW.id
                   AND pr.workflow_status IN (
                     'pending_admin_approval','pending_approval',
                     'pending_warehouse','partial_approval','completed'
                   )) THEN
    v_locked := true;
  END IF;

  IF NOT v_locked THEN RETURN NEW; END IF;

  IF NEW.total_amount   IS DISTINCT FROM OLD.total_amount   OR
     NEW.currency_code  IS DISTINCT FROM OLD.currency_code  OR
     NEW.exchange_rate  IS DISTINCT FROM OLD.exchange_rate  OR
     NEW.supplier_id    IS DISTINCT FROM OLD.supplier_id    OR
     NEW.bill_date      IS DISTINCT FROM OLD.bill_date THEN
    RAISE EXCEPTION
      'لا يُمكِن تَعديل هذا الحَقل بَعد وُجود دَفعات أَو مَرتَجَعات على الفاتورة. استَخدِم مَسار التَّصحيح المُعتَمَد.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_paid_invoice_modification()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  allowed_fields TEXT[] := ARRAY[
    'paid_amount',
    'original_paid',
    'display_paid',
    'status', 'returned_amount', 'return_status',
    'notes', 'internal_notes', 'attachments', 'updated_at',
    'is_deleted', 'deleted_at', 'deleted_by',
    'warehouse_status', 'approval_status',
    'approved_by', 'approval_date', 'approval_reason',
    'rejected_by', 'rejection_date', 'rejection_reason',
    'shipping_provider_id', 'tracking_number', 'shipped_at', 'delivered_at',
    'current_approval_role', 'workflow_state',
    'bonus_calculated', 'bonus_calculated_at', 'commission_amount',
    -- v3.74.257 — pre-shipment refund audit columns. The executor sets
    -- these in the same UPDATE as paid_amount=0 / status='cancelled'.
    'pre_shipment_refund_at', 'pre_shipment_refund_by',
    'pre_shipment_refund_amount', 'pre_shipment_refund_mode',
    'pre_shipment_refund_reason', 'pre_shipment_refund_je_id'
  ];
  old_val JSONB;
  new_val JSONB;
  key TEXT;
BEGIN
  -- v3.75.62 «والدفترُ يُعادُ حسابُه فى خزانتِه»: مسارُ تحويلِ العملةِ
  -- الأساسيّةِ يفتحُ لنفسِه بالاسم، تعديلاً لا حذفاً، داخلَ معاملتِه وحدَها.
  IF TG_OP = 'UPDATE'
     AND coalesce(current_setting('app.allow_base_currency_change', true), 'false') = 'true' THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('paid', 'partially_paid') THEN
    old_val := to_jsonb(OLD);
    new_val := to_jsonb(NEW);

    FOR key IN SELECT jsonb_object_keys(new_val)
    LOOP
      IF key = ANY(allowed_fields) THEN
        CONTINUE;
      END IF;

      IF (old_val->key)::text IS DISTINCT FROM (new_val->key)::text THEN
        RAISE EXCEPTION 'لا يمكن تعديل الفاتورة المدفوعة. الحقل المعدل: %. يرجى إنشاء مرتجع أو إشعار دائن بدلاً من ذلك.', key;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.invoice_protect_posted_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- v3.75.62 «والدفترُ يُعادُ حسابُه فى خزانتِه»: مسارُ تحويلِ العملةِ
  -- الأساسيّةِ يفتحُ لنفسِه بالاسم، تعديلاً لا حذفاً، داخلَ معاملتِه وحدَها.
  IF TG_OP = 'UPDATE'
     AND coalesce(current_setting('app.allow_base_currency_change', true), 'false') = 'true' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(OLD.status, '') IN ('draft', 'voided', 'cancelled', 'pending_approval', 'rejected') THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.discount_value    IS DISTINCT FROM OLD.discount_value
     OR NEW.discount_type     IS DISTINCT FROM OLD.discount_type
     OR NEW.discount_position IS DISTINCT FROM OLD.discount_position
     OR NEW.tax_inclusive     IS DISTINCT FROM OLD.tax_inclusive
     OR NEW.exchange_rate     IS DISTINCT FROM OLD.exchange_rate
     OR NEW.subtotal          IS DISTINCT FROM OLD.subtotal
     OR NEW.total_amount      IS DISTINCT FROM OLD.total_amount
     OR NEW.tax_amount        IS DISTINCT FROM OLD.tax_amount
     OR NEW.shipping          IS DISTINCT FROM OLD.shipping THEN
    RAISE EXCEPTION 'لا يمكن تعديل الخصم أو الإجماليات على فاتورة منشورة. اعمل void للفاتورة أولاً.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bill_protect_posted_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- v3.75.62 «والدفترُ يُعادُ حسابُه فى خزانتِه»: مسارُ تحويلِ العملةِ
  -- الأساسيّةِ يفتحُ لنفسِه بالاسم، تعديلاً لا حذفاً، داخلَ معاملتِه وحدَها.
  IF TG_OP = 'UPDATE'
     AND coalesce(current_setting('app.allow_base_currency_change', true), 'false') = 'true' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(OLD.status, '') IN ('draft', 'voided', 'pending_approval', 'rejected') THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.discount_value    IS DISTINCT FROM OLD.discount_value
     OR NEW.discount_type     IS DISTINCT FROM OLD.discount_type
     OR NEW.discount_position IS DISTINCT FROM OLD.discount_position
     OR NEW.tax_inclusive     IS DISTINCT FROM OLD.tax_inclusive
     OR NEW.exchange_rate     IS DISTINCT FROM OLD.exchange_rate
     OR NEW.subtotal          IS DISTINCT FROM OLD.subtotal
     OR NEW.total_amount      IS DISTINCT FROM OLD.total_amount
     OR NEW.tax_amount        IS DISTINCT FROM OLD.tax_amount
     OR NEW.shipping          IS DISTINCT FROM OLD.shipping THEN
    RAISE EXCEPTION 'لا يمكن تعديل الخصم أو الإجماليات على فاتورة منشورة. اعمل void للفاتورة أولاً.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.po_protect_approved_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- v3.75.62 «والدفترُ يُعادُ حسابُه فى خزانتِه»: مسارُ تحويلِ العملةِ
  -- الأساسيّةِ يفتحُ لنفسِه بالاسم، تعديلاً لا حذفاً، داخلَ معاملتِه وحدَها.
  IF TG_OP = 'UPDATE'
     AND coalesce(current_setting('app.allow_base_currency_change', true), 'false') = 'true' THEN
    RETURN NEW;
  END IF;

  -- Only guard the post-approval lifecycle.
  IF OLD.status NOT IN ('approved', 'sent_to_vendor', 'received') THEN
    RETURN NEW;
  END IF;
  -- If status itself is changing, this is a legitimate workflow
  -- transition (e.g. void_bill_atomic moves us back to pending_approval).
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.discount_value     IS DISTINCT FROM OLD.discount_value
     OR NEW.discount_type    IS DISTINCT FROM OLD.discount_type
     OR NEW.discount_position IS DISTINCT FROM OLD.discount_position
     OR NEW.tax_inclusive    IS DISTINCT FROM OLD.tax_inclusive
     OR NEW.exchange_rate    IS DISTINCT FROM OLD.exchange_rate
     OR NEW.subtotal         IS DISTINCT FROM OLD.subtotal
     OR NEW.total_amount     IS DISTINCT FROM OLD.total_amount
     OR NEW.tax_amount       IS DISTINCT FROM OLD.tax_amount
     OR NEW.shipping         IS DISTINCT FROM OLD.shipping THEN
    RAISE EXCEPTION
      'لا يمكن تعديل الخصم أو الإجماليات على أمر شراء معتمد. اعمل void للفاتورة المرتبطة لإعادة فتح الدورة.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.block_expense_immutable_edits()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  -- v3.75.62 «والدفترُ يُعادُ حسابُه فى خزانتِه»: مسارُ تحويلِ العملةِ
  -- الأساسيّةِ يفتحُ لنفسِه بالاسم، تعديلاً لا حذفاً، داخلَ معاملتِه وحدَها.
  IF TG_OP = 'UPDATE'
     AND coalesce(current_setting('app.allow_base_currency_change', true), 'false') = 'true' THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('draft','pending_approval','rejected') THEN
    RETURN NEW;
  END IF;

  IF NEW.amount               IS DISTINCT FROM OLD.amount               OR
     NEW.base_currency_amount IS DISTINCT FROM OLD.base_currency_amount OR
     NEW.currency_code        IS DISTINCT FROM OLD.currency_code        OR
     NEW.exchange_rate        IS DISTINCT FROM OLD.exchange_rate        OR
     NEW.expense_account_id   IS DISTINCT FROM OLD.expense_account_id   OR
     NEW.payment_account_id   IS DISTINCT FROM OLD.payment_account_id   OR
     NEW.expense_date         IS DISTINCT FROM OLD.expense_date THEN
    RAISE EXCEPTION
      'لا يُمكِن تَعديل هذا الحَقل بَعد اعتِماد المَصروف.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_linked_inventory_modification()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    journal_status TEXT;
BEGIN
    -- v3.75.62 «والدفترُ يُعادُ حسابُه فى خزانتِه»: مسارُ تحويلِ العملةِ
    -- الأساسيّةِ يفتحُ لنفسِه بالاسم، تعديلاً لا حذفاً، داخلَ معاملتِه وحدَها.
    IF TG_OP = 'UPDATE'
       AND coalesce(current_setting('app.allow_base_currency_change', true), 'false') = 'true' THEN
      RETURN NEW;
    END IF;

    -- Linked to a journal? Check if it's posted.
    IF OLD.journal_entry_id IS NOT NULL THEN
        SELECT status INTO journal_status
          FROM public.journal_entries
         WHERE id = OLD.journal_entry_id;

        IF journal_status = 'posted' THEN
            RAISE EXCEPTION 'Cannot modify/delete inventory transaction linked to a posted journal (ID: %).',
                OLD.journal_entry_id;
        END IF;
    END IF;

    -- Canonical pattern: return OLD on DELETE, NEW on UPDATE.
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_bill_overpayment()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_bill_total NUMERIC;
  v_bill_returned NUMERIC;
  v_pending_returns NUMERIC;
  v_current_paid NUMERIC;
  v_net_available NUMERIC;
  v_alloc RECORD;
  v_bill_currency TEXT;
  v_bill_rate NUMERIC;
  v_alloc_in_bill_currency NUMERIC;
BEGIN
  -- v3.75.62 «والدفترُ يُعادُ حسابُه فى خزانتِه»: مسارُ تحويلِ العملةِ لا
  -- يُغيِّرُ مبلغَ الدفعةِ بعملةِ مستندِها، وهذا الحارسُ يُعيدُ محاكمةَ
  -- التاريخِ عندَ أىِّ تعديل — فيُفتَحُ له البابُ بالاسم، تعديلاً لا إدراجاً.
  IF TG_OP = 'UPDATE'
     AND coalesce(current_setting('app.allow_base_currency_change', true), 'false') = 'true' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.status, 'approved') = 'pending_approval' THEN RETURN NEW; END IF;
  IF NEW.status IN ('rejected', 'cancelled') THEN RETURN NEW; END IF;

  IF NEW.bill_id IS NOT NULL THEN
    SELECT COALESCE(b.total_amount, 0), COALESCE(b.returned_amount, 0)
    INTO v_bill_total, v_bill_returned
    FROM bills b WHERE id = NEW.bill_id;

    SELECT COALESCE(SUM(pr.total_amount), 0)
    INTO v_pending_returns
    FROM purchase_returns pr
    WHERE pr.bill_id = NEW.bill_id
      AND pr.status IN ('pending_approval', 'pending_warehouse');

    SELECT COALESCE(SUM(pa.allocated_amount), 0)
    INTO v_current_paid
    FROM payment_allocations pa
    JOIN payments p ON p.id = pa.payment_id
    WHERE pa.bill_id = NEW.bill_id
      AND p.status = 'approved'
      AND COALESCE(p.is_deleted, false) = false
      AND p.voided_at IS NULL
      AND p.voids_payment_id IS NULL
      AND p.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

    v_net_available := GREATEST(v_bill_total - v_bill_returned - v_pending_returns, 0);

    IF (v_current_paid + NEW.amount) > v_net_available + 0.01 THEN
      RAISE EXCEPTION 'OVERPAYMENT_BLOCKED: دفعة % تتجاوز المتبقى الصافى % (إجمالى=%، مرتجع=%، مرتجعات معلقة=%، مدفوع سابق=%)',
        NEW.amount, v_net_available - v_current_paid,
        v_bill_total, v_bill_returned, v_pending_returns, v_current_paid
        USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
  END IF;

  FOR v_alloc IN
    SELECT pa.bill_id, pa.allocated_amount
    FROM payment_allocations pa
    WHERE pa.payment_id = NEW.id
      AND pa.bill_id IS NOT NULL
  LOOP
    SELECT COALESCE(b.total_amount, 0),
           COALESCE(b.returned_amount, 0),
           UPPER(COALESCE(b.currency_code, 'EGP')),
           COALESCE(NULLIF(b.exchange_rate, 0), 1)
    INTO v_bill_total, v_bill_returned, v_bill_currency, v_bill_rate
    FROM bills b WHERE id = v_alloc.bill_id;

    SELECT COALESCE(SUM(pr.total_amount), 0)
    INTO v_pending_returns
    FROM purchase_returns pr
    WHERE pr.bill_id = v_alloc.bill_id
      AND pr.status IN ('pending_approval', 'pending_warehouse');

    SELECT COALESCE(SUM(
      pa2.allocated_amount *
      CASE
        WHEN v_bill_currency = '' OR UPPER(COALESCE(p2.currency_code, '')) = '' THEN 1
        WHEN UPPER(COALESCE(p2.currency_code, '')) = v_bill_currency THEN 1
        ELSE COALESCE(NULLIF(p2.exchange_rate, 0), 1) / v_bill_rate
      END
    ), 0)
    INTO v_current_paid
    FROM payment_allocations pa2
    JOIN payments p2 ON p2.id = pa2.payment_id
    WHERE pa2.bill_id = v_alloc.bill_id
      AND p2.status = 'approved'
      AND COALESCE(p2.is_deleted, false) = false
      AND p2.voided_at IS NULL
      AND p2.voids_payment_id IS NULL
      AND p2.id != NEW.id;

    v_alloc_in_bill_currency := v_alloc.allocated_amount *
      CASE
        WHEN v_bill_currency = '' OR UPPER(COALESCE(NEW.currency_code, '')) = '' THEN 1
        WHEN UPPER(COALESCE(NEW.currency_code, '')) = v_bill_currency THEN 1
        ELSE COALESCE(NULLIF(NEW.exchange_rate, 0), 1) / v_bill_rate
      END;

    v_net_available := GREATEST(v_bill_total - v_bill_returned - v_pending_returns, 0);

    IF (v_current_paid + v_alloc_in_bill_currency) > v_net_available + 0.01 THEN
      RAISE EXCEPTION 'OVERPAYMENT_BLOCKED: تخصيص دفعة % (بعملة الفاتورة) يتجاوز المتبقى الصافى % على الفاتورة % (إجمالى=%، مرتجع=%، مرتجعات معلقة=%، مدفوع سابق=%)',
        v_alloc_in_bill_currency,
        v_net_available - v_current_paid,
        v_alloc.bill_id,
        v_bill_total, v_bill_returned, v_pending_returns, v_current_paid
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_invoice_overpayment()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_invoice_total  NUMERIC;
  v_current_paid   NUMERIC;
BEGIN
  -- v3.75.62 «والدفترُ يُعادُ حسابُه فى خزانتِه»: مسارُ تحويلِ العملةِ لا
  -- يُغيِّرُ مبلغَ الدفعةِ بعملةِ مستندِها، وهذا الحارسُ يُعيدُ محاكمةَ
  -- التاريخِ عندَ أىِّ تعديل — فيُفتَحُ له البابُ بالاسم، تعديلاً لا إدراجاً.
  IF TG_OP = 'UPDATE'
     AND coalesce(current_setting('app.allow_base_currency_change', true), 'false') = 'true' THEN
    RETURN NEW;
  END IF;

  IF NEW.invoice_id IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.status, 'approved') LIKE 'pending_%' THEN RETURN NEW; END IF;

  SELECT COALESCE(total_amount, 0) INTO v_invoice_total FROM invoices WHERE id = NEW.invoice_id;

  SELECT COALESCE(SUM(pa.allocated_amount), 0)
  INTO v_current_paid
  FROM payment_allocations pa
  JOIN payments p ON p.id = pa.payment_id
  WHERE pa.invoice_id = NEW.invoice_id
    AND p.status = 'approved'
    AND COALESCE(p.is_deleted, false) = false
    AND p.voided_at IS NULL
    AND p.voids_payment_id IS NULL
    AND p.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF (v_current_paid + NEW.amount) > v_invoice_total THEN
    RAISE EXCEPTION 'OVERPAYMENT_BLOCKED: Customer payment of % would exceed invoice total of % (already_paid=%)',
      NEW.amount, v_invoice_total - v_current_paid, v_current_paid
    USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- (٢) دالّةُ الخزانة — المسارُ كلُّه فى معاملةٍ واحدة
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.change_base_currency(
  p_company_id uuid,
  p_new_currency text
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
  v_old text;
  v_new text := upper(trim(p_new_currency));
  v_rate numeric;
  v_rate_src text;
  rc bigint;
  v_counts jsonb := '{}'::jsonb;
  v_scaled bigint := 0;
  v_je_before bigint; v_je_after bigint;
  v_unbal_ids uuid[];
  v_new_unbal bigint;
  v_bad bigint;
  v_ic bigint;
  r record;
  v_line uuid;
  v_plugs bigint := 0;
  v_plug_total numeric := 0;
BEGIN
  -- ولا يُقفَلُ البابُ على نصفِ عمل: صفُّ الشركةِ يُقفَلُ أوّلاً.
  SELECT base_currency INTO v_old FROM public.companies WHERE id = p_company_id FOR UPDATE;
  IF v_old IS NULL THEN
    RAISE EXCEPTION 'الشركةُ غيرُ موجودةٍ أو بلا عملةِ أساس.' USING ERRCODE = '22023';
  END IF;

  -- بوّابةُ السؤالِ الواحدة أوّلاً: أمِن أهلِ هذه الشركةِ مُنادِيها؟
  -- (البيتُ الواحدُ assert_company_access — لا نسخةٌ ثانيةٌ من السؤال.)
  PERFORM public.assert_company_access(p_company_id);

  -- ثم الرتبةُ: الحقُّ للمالكِ والمديرِ العامِّ فقط — ويُفحَصُ هنا لا فى الشاشة.
  IF NOT public.is_owner_or_admin(p_company_id) THEN
    RAISE EXCEPTION 'لا يملكُ هذا الحسابُ تغييرَ العملةِ الأساسيّةِ: المالكُ والمديرُ العامُّ فقط.'
      USING ERRCODE = '42501';
  END IF;

  IF v_new !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'رمزُ العملةِ يجبُ أن يكونَ ثلاثةَ أحرفٍ لاتينيّة، لا «%».', p_new_currency
      USING ERRCODE = '22023';
  END IF;
  IF v_new = v_old THEN
    RAISE EXCEPTION 'العملةُ الأساسيّةُ هى «%» سلفاً — لا شىءَ ليُحوَّل.', v_old
      USING ERRCODE = '22023';
  END IF;

  -- فترةٌ مُقفلةٌ لا يُعادُ حسابُها خلسةً: تُفتَحُ أوّلاً بقرارٍ ظاهرٍ ثمّ يُحوَّل.
  SELECT count(*) INTO v_bad FROM public.accounting_periods
   WHERE company_id = p_company_id AND (is_locked = true OR status = 'closed');
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'للشركةِ % فترةً محاسبيّةً مُقفلة. أعد فتحَها أوّلاً، ثمّ حوِّلِ العملةَ، ثمّ أقفِلْها.', v_bad
      USING ERRCODE = '23514';
  END IF;

  -- مستندٌ بعملةٍ أجنبيّةٍ بلا سعرٍ أو بلا مبلغِ أساسٍ لا يُخمَّنُ له تحويل.
  SELECT (SELECT count(*) FROM public.invoices  WHERE company_id = p_company_id AND currency_code IS DISTINCT FROM v_old AND (base_currency_total IS NULL OR exchange_rate IS NULL))
       + (SELECT count(*) FROM public.bills     WHERE company_id = p_company_id AND currency_code IS DISTINCT FROM v_old AND (base_currency_total IS NULL OR exchange_rate IS NULL))
       + (SELECT count(*) FROM public.payments  WHERE company_id = p_company_id AND currency_code IS DISTINCT FROM v_old AND (base_currency_amount IS NULL OR exchange_rate IS NULL))
       + (SELECT count(*) FROM public.expenses  WHERE company_id = p_company_id AND currency_code IS DISTINCT FROM v_old AND (base_currency_amount IS NULL OR exchange_rate IS NULL))
    INTO v_bad;
  IF v_bad > 0 THEN
    RAISE EXCEPTION '% مستنداً بعملةٍ غيرِ عملةِ الأساسِ بلا سعرِ صرفٍ أو بلا مبلغِ أساسٍ محفوظ — لا أُخمّن.', v_bad
      USING ERRCODE = '23514';
  END IF;

  -- السعرُ من جدولِ أسعارِ الشركةِ وحدَه — قرارُ صاحبِ المشروع، لا مصدرَ سواه.
  SELECT rate, 'direct' INTO v_rate, v_rate_src
    FROM public.exchange_rates
   WHERE company_id = p_company_id AND from_currency = v_old AND to_currency = v_new AND rate > 0
   ORDER BY rate_date DESC, created_at DESC LIMIT 1;
  IF v_rate IS NULL THEN
    SELECT 1 / rate, 'inverse' INTO v_rate, v_rate_src
      FROM public.exchange_rates
     WHERE company_id = p_company_id AND from_currency = v_new AND to_currency = v_old AND rate > 0
     ORDER BY rate_date DESC, created_at DESC LIMIT 1;
  END IF;
  IF v_rate IS NULL OR v_rate <= 0 THEN
    RAISE EXCEPTION 'لا سعرَ صرفٍ محفوظاً بين % و% لهذه الشركة. سجِّلِ السعرَ فى صفحةِ أسعارِ الصرفِ أوّلاً ثمّ أعدِ المحاولة.', v_old, v_new
      USING ERRCODE = '22023';
  END IF;

  -- بصماتُ ما قبلَ الجراحة: عددُ القيودِ، وقائمةُ المختلِّ توازنُها سلفاً
  -- بأعيانِها (اختلالٌ سابقٌ يُحصى ولا يُرقَّعُ خلسةً — التاريخُ لا يُجمَّل).
  SELECT count(*) INTO v_je_before FROM public.journal_entries WHERE company_id = p_company_id;
  SELECT coalesce(array_agg(u.journal_entry_id), '{}') INTO v_unbal_ids FROM (
    SELECT l.journal_entry_id FROM public.journal_entry_lines l
    JOIN public.journal_entries j ON j.id = l.journal_entry_id
    WHERE j.company_id = p_company_id
    GROUP BY l.journal_entry_id
    HAVING sum(coalesce(l.debit_amount,0)) <> sum(coalesce(l.credit_amount,0))
  ) u;

  -- البابانِ المُسمَّيان يُفتَحانِ لهذه المعاملةِ وحدَها ثمّ يُغلَقانِ بانتهائها.
  PERFORM set_config('app.allow_base_currency_change', 'true', true);
  PERFORM set_config('app.allow_direct_post', 'true', true);

  -- ── دفترُ اليوميّة: المبالغُ بعملةِ الأساسِ تُضرَبُ فى السعر ──
  UPDATE public.journal_entry_lines l
     SET debit_amount = l.debit_amount * v_rate,
         credit_amount = l.credit_amount * v_rate,
         exchange_rate_used = coalesce(l.exchange_rate_used, 1) * v_rate
   WHERE l.journal_entry_id IN (SELECT id FROM public.journal_entries WHERE company_id = p_company_id);
  GET DIAGNOSTICS rc = ROW_COUNT; v_counts := v_counts || jsonb_build_object('journal_entry_lines', rc); v_scaled := v_scaled + rc;

  UPDATE public.journal_entries
     SET exchange_rate = coalesce(exchange_rate, 1) * v_rate
   WHERE company_id = p_company_id;
  GET DIAGNOSTICS rc = ROW_COUNT; v_counts := v_counts || jsonb_build_object('journal_entries', rc); v_scaled := v_scaled + rc;

  -- ── وفرقُ التقريبِ يُسدَّدُ فى أكبرِ سطرٍ من قيدِه هو، ويُحصى ولا يُخفى ──
  -- الأعمدةُ بمنزلتَين، والضربُ فى السعرِ يُقرِّبُ كلَّ سطرٍ وحدَه، فقد يختلُّ
  -- قيدٌ كان متوازناً بقروشٍ معدودة. يُرقَّعُ المتوازنُ سلفاً وحدَه؛ أمّا
  -- المختلُّ قبلَ الجراحةِ فيُحصى ويُتركُ على اختلالِه — التاريخُ لا يُجمَّل.
  FOR r IN (
    SELECT l.journal_entry_id AS jid,
           sum(coalesce(l.debit_amount,0)) - sum(coalesce(l.credit_amount,0)) AS delta
      FROM public.journal_entry_lines l
      JOIN public.journal_entries j ON j.id = l.journal_entry_id
     WHERE j.company_id = p_company_id
     GROUP BY l.journal_entry_id
    HAVING sum(coalesce(l.debit_amount,0)) <> sum(coalesce(l.credit_amount,0))
  ) LOOP
    CONTINUE WHEN r.jid = ANY (v_unbal_ids);
    IF abs(r.delta) > 1 THEN
      RAISE EXCEPTION 'فرقُ تقريبٍ % فى قيدٍ واحدٍ أكبرُ من واحدٍ صحيح — هذا ليس تقريباً بل عطبٌ، فيرجعُ كلُّ شىء.', r.delta
        USING ERRCODE = '23514';
    END IF;
    SELECT id INTO v_line FROM public.journal_entry_lines
     WHERE journal_entry_id = r.jid
     ORDER BY greatest(coalesce(debit_amount,0), coalesce(credit_amount,0)) DESC, id
     LIMIT 1;
    UPDATE public.journal_entry_lines
       SET debit_amount  = CASE WHEN coalesce(debit_amount,0) >= coalesce(credit_amount,0)
                                THEN debit_amount - r.delta ELSE debit_amount END,
           credit_amount = CASE WHEN coalesce(debit_amount,0) >= coalesce(credit_amount,0)
                                THEN credit_amount ELSE credit_amount + r.delta END
     WHERE id = v_line;
    v_plugs := v_plugs + 1;
    v_plug_total := v_plug_total + abs(r.delta);
  END LOOP;
  v_counts := v_counts || jsonb_build_object('rounding_plugs', v_plugs, 'rounding_plug_total', v_plug_total);

  -- ── المستنداتُ تحملُ عملةَ أصلِها كما هى؛ أعمدةُ الأساسِ وحدَها تُعادُ ──
  UPDATE public.invoices
     SET base_currency_total = coalesce(base_currency_total, total_amount) * v_rate,
         exchange_rate = coalesce(exchange_rate, 1) * v_rate,
         exchange_rate_used = coalesce(exchange_rate_used, 1) * v_rate
   WHERE company_id = p_company_id;
  GET DIAGNOSTICS rc = ROW_COUNT; v_counts := v_counts || jsonb_build_object('invoices', rc); v_scaled := v_scaled + rc;

  UPDATE public.bills
     SET base_currency_total = coalesce(base_currency_total, total_amount) * v_rate,
         exchange_rate = coalesce(exchange_rate, 1) * v_rate,
         exchange_rate_used = coalesce(exchange_rate_used, 1) * v_rate
   WHERE company_id = p_company_id;
  GET DIAGNOSTICS rc = ROW_COUNT; v_counts := v_counts || jsonb_build_object('bills', rc); v_scaled := v_scaled + rc;

  UPDATE public.payments
     SET base_currency_amount = coalesce(base_currency_amount, amount) * v_rate,
         exchange_rate = coalesce(exchange_rate, 1) * v_rate,
         exchange_rate_used = coalesce(exchange_rate_used, 1) * v_rate
   WHERE company_id = p_company_id;
  GET DIAGNOSTICS rc = ROW_COUNT; v_counts := v_counts || jsonb_build_object('payments', rc); v_scaled := v_scaled + rc;

  UPDATE public.expenses
     SET base_currency_amount = coalesce(base_currency_amount, amount) * v_rate,
         exchange_rate = coalesce(exchange_rate, 1) * v_rate
   WHERE company_id = p_company_id;
  GET DIAGNOSTICS rc = ROW_COUNT; v_counts := v_counts || jsonb_build_object('expenses', rc); v_scaled := v_scaled + rc;

  -- ── أسعارُ المستنداتِ الأخرى نحوَ الأساس: تُضرَبُ فى السعرِ نفسِه ──
  UPDATE public.purchase_orders SET exchange_rate = coalesce(exchange_rate, 1) * v_rate WHERE company_id = p_company_id;
  GET DIAGNOSTICS rc = ROW_COUNT; v_counts := v_counts || jsonb_build_object('purchase_orders', rc); v_scaled := v_scaled + rc;
  UPDATE public.sales_orders SET exchange_rate = coalesce(exchange_rate, 1) * v_rate WHERE company_id = p_company_id;
  GET DIAGNOSTICS rc = ROW_COUNT; v_counts := v_counts || jsonb_build_object('sales_orders', rc); v_scaled := v_scaled + rc;
  UPDATE public.estimates SET exchange_rate = coalesce(exchange_rate, 1) * v_rate WHERE company_id = p_company_id;
  GET DIAGNOSTICS rc = ROW_COUNT; v_counts := v_counts || jsonb_build_object('estimates', rc); v_scaled := v_scaled + rc;
  UPDATE public.purchase_requests SET exchange_rate = coalesce(exchange_rate, 1) * v_rate WHERE company_id = p_company_id;
  GET DIAGNOSTICS rc = ROW_COUNT; v_counts := v_counts || jsonb_build_object('purchase_requests', rc); v_scaled := v_scaled + rc;
  UPDATE public.customer_debit_notes SET exchange_rate = coalesce(exchange_rate, 1) * v_rate WHERE company_id = p_company_id;
  GET DIAGNOSTICS rc = ROW_COUNT; v_counts := v_counts || jsonb_build_object('customer_debit_notes', rc); v_scaled := v_scaled + rc;
  UPDATE public.customer_refund_requests SET exchange_rate = coalesce(exchange_rate, 1) * v_rate WHERE company_id = p_company_id;
  GET DIAGNOSTICS rc = ROW_COUNT; v_counts := v_counts || jsonb_build_object('customer_refund_requests', rc); v_scaled := v_scaled + rc;
  UPDATE public.vendor_refund_requests SET exchange_rate = coalesce(exchange_rate, 1) * v_rate WHERE company_id = p_company_id;
  GET DIAGNOSTICS rc = ROW_COUNT; v_counts := v_counts || jsonb_build_object('vendor_refund_requests', rc); v_scaled := v_scaled + rc;
  UPDATE public.inventory_write_offs SET exchange_rate = coalesce(exchange_rate, 1) * v_rate WHERE company_id = p_company_id;
  GET DIAGNOSTICS rc = ROW_COUNT; v_counts := v_counts || jsonb_build_object('inventory_write_offs', rc); v_scaled := v_scaled + rc;
  UPDATE public.shareholder_drawings SET exchange_rate = coalesce(exchange_rate, 1) * v_rate WHERE company_id = p_company_id;
  GET DIAGNOSTICS rc = ROW_COUNT; v_counts := v_counts || jsonb_build_object('shareholder_drawings', rc); v_scaled := v_scaled + rc;
  UPDATE public.bank_voucher_requests SET exchange_rate = coalesce(exchange_rate, 1) * v_rate WHERE company_id = p_company_id;
  GET DIAGNOSTICS rc = ROW_COUNT; v_counts := v_counts || jsonb_build_object('bank_voucher_requests', rc); v_scaled := v_scaled + rc;
  UPDATE public.customer_credits SET exchange_rate_used = coalesce(exchange_rate_used, 1) * v_rate WHERE company_id = p_company_id;
  GET DIAGNOSTICS rc = ROW_COUNT; v_counts := v_counts || jsonb_build_object('customer_credits', rc); v_scaled := v_scaled + rc;
  UPDATE public.customer_credit_ledger SET exchange_rate_used = coalesce(exchange_rate_used, 1) * v_rate WHERE company_id = p_company_id;
  GET DIAGNOSTICS rc = ROW_COUNT; v_counts := v_counts || jsonb_build_object('customer_credit_ledger', rc); v_scaled := v_scaled + rc;
  UPDATE public.vendor_credits SET exchange_rate_used = coalesce(exchange_rate_used, 1) * v_rate WHERE company_id = p_company_id;
  GET DIAGNOSTICS rc = ROW_COUNT; v_counts := v_counts || jsonb_build_object('vendor_credits', rc); v_scaled := v_scaled + rc;
  UPDATE public.purchase_returns SET exchange_rate_at_return = coalesce(exchange_rate_at_return, 1) * v_rate, exchange_rate_used = coalesce(exchange_rate_used, 1) * v_rate WHERE company_id = p_company_id;
  GET DIAGNOSTICS rc = ROW_COUNT; v_counts := v_counts || jsonb_build_object('purchase_returns', rc); v_scaled := v_scaled + rc;
  UPDATE public.sales_returns SET exchange_rate_at_return = coalesce(exchange_rate_at_return, 1) * v_rate, exchange_rate_used = coalesce(exchange_rate_used, 1) * v_rate WHERE company_id = p_company_id;
  GET DIAGNOSTICS rc = ROW_COUNT; v_counts := v_counts || jsonb_build_object('sales_returns', rc); v_scaled := v_scaled + rc;

  -- ── ما هو مُقوَّمٌ بعملةِ الأساسِ ذاتِها: أرصدةٌ وأسعارُ بيعٍ وتكاليف ──
  UPDATE public.chart_of_accounts
     SET opening_balance = opening_balance * v_rate,
         exchange_rate_used = coalesce(exchange_rate_used, 1) * v_rate
   WHERE company_id = p_company_id;
  GET DIAGNOSTICS rc = ROW_COUNT; v_counts := v_counts || jsonb_build_object('chart_of_accounts', rc); v_scaled := v_scaled + rc;

  UPDATE public.products
     SET unit_price = unit_price * v_rate,
         cost_price = cost_price * v_rate,
         selling_price = selling_price * v_rate,
         exchange_rate_used = coalesce(exchange_rate_used, 1) * v_rate
   WHERE company_id = p_company_id;
  GET DIAGNOSTICS rc = ROW_COUNT; v_counts := v_counts || jsonb_build_object('products', rc); v_scaled := v_scaled + rc;

  UPDATE public.inventory_transactions
     SET unit_cost = unit_cost * v_rate,
         total_cost = total_cost * v_rate,
         exchange_rate_used = coalesce(exchange_rate_used, 1) * v_rate
   WHERE company_id = p_company_id;
  GET DIAGNOSTICS rc = ROW_COUNT; v_counts := v_counts || jsonb_build_object('inventory_transactions', rc); v_scaled := v_scaled + rc;

  UPDATE public.fifo_cost_lots SET unit_cost = unit_cost * v_rate WHERE company_id = p_company_id;
  GET DIAGNOSTICS rc = ROW_COUNT; v_counts := v_counts || jsonb_build_object('fifo_cost_lots', rc); v_scaled := v_scaled + rc;
  UPDATE public.fifo_lot_consumptions SET unit_cost = unit_cost * v_rate, total_cost = total_cost * v_rate WHERE company_id = p_company_id;
  GET DIAGNOSTICS rc = ROW_COUNT; v_counts := v_counts || jsonb_build_object('fifo_lot_consumptions', rc); v_scaled := v_scaled + rc;

  UPDATE public.customers
     SET credit_limit = credit_limit * v_rate,
         balance_currency = CASE WHEN balance_currency = v_old THEN v_new ELSE balance_currency END
   WHERE company_id = p_company_id;
  GET DIAGNOSTICS rc = ROW_COUNT; v_counts := v_counts || jsonb_build_object('customers', rc); v_scaled := v_scaled + rc;

  UPDATE public.suppliers
     SET balance_currency = v_new
   WHERE company_id = p_company_id AND balance_currency = v_old;
  GET DIAGNOSTICS rc = ROW_COUNT; v_counts := v_counts || jsonb_build_object('suppliers', rc); v_scaled := v_scaled + rc;

  UPDATE public.services
     SET unit_price = unit_price * v_rate,
         cost_price = cost_price * v_rate,
         currency_code = v_new
   WHERE company_id = p_company_id AND currency_code = v_old;
  GET DIAGNOSTICS rc = ROW_COUNT; v_counts := v_counts || jsonb_build_object('services', rc); v_scaled := v_scaled + rc;

  UPDATE public.approval_workflows
     SET amount = amount * v_rate,
         currency_code = v_new
   WHERE company_id = p_company_id AND currency_code = v_old;
  GET DIAGNOSTICS rc = ROW_COUNT; v_counts := v_counts || jsonb_build_object('approval_workflows', rc); v_scaled := v_scaled + rc;

  UPDATE public.branches SET currency = v_new WHERE company_id = p_company_id AND currency = v_old;
  GET DIAGNOSTICS rc = ROW_COUNT; v_counts := v_counts || jsonb_build_object('branches', rc); v_scaled := v_scaled + rc;
  UPDATE public.cost_centers SET currency = v_new WHERE company_id = p_company_id AND currency = v_old;
  GET DIAGNOSTICS rc = ROW_COUNT; v_counts := v_counts || jsonb_build_object('cost_centers', rc); v_scaled := v_scaled + rc;

  -- ── أسعارُ الصرفِ تُعادُ توجيهاً: لكلِّ عملةٍ سعرُها الأحدثُ نحوَ الأساسِ
  --    القديمِ يلدُ سعراً نحوَ الأساسِ الجديدِ، والتاريخُ يُحفَظُ لا يُمحى ──
  INSERT INTO public.exchange_rates (company_id, from_currency, to_currency, rate, rate_date, source, notes, is_active)
  SELECT p_company_id, d.from_currency, v_new, d.rate * v_rate, current_date,
         'base_currency_change',
         'مشتقٌّ عندَ تحويلِ الأساسِ من ' || v_old || ' إلى ' || v_new,
         true
    FROM (
      SELECT DISTINCT ON (from_currency) from_currency, rate
        FROM public.exchange_rates
       WHERE company_id = p_company_id AND to_currency = v_old AND rate > 0
         AND from_currency IS DISTINCT FROM v_new
       ORDER BY from_currency, rate_date DESC, created_at DESC
    ) d
   WHERE NOT EXISTS (
     SELECT 1 FROM public.exchange_rates e2
      WHERE e2.company_id = p_company_id AND e2.from_currency = d.from_currency
        AND e2.to_currency = v_new AND e2.rate_date = current_date
        AND e2.from_currency_id IS NULL AND e2.to_currency_id IS NULL
   );
  GET DIAGNOSTICS rc = ROW_COUNT; v_counts := v_counts || jsonb_build_object('exchange_rates_derived', rc);

  -- ── ويُسجَّلُ ما فُعِل ──
  INSERT INTO public.exchange_rate_log (company_id, transaction_type, from_currency, to_currency, rate_used, conversion_date, notes, created_by)
  VALUES (p_company_id, 'BASE_CURRENCY_CHANGE', v_old, v_new, v_rate, current_date,
          'مسارُ الخزانة v3.75.62: ' || v_counts::text || ' (مصدرُ السعر: ' || v_rate_src || ')',
          auth.uid());

  -- ── العملةُ الأساسيّةُ نفسُها — حارسُها يقرأُ البابَ المفتوحَ بالاسم ──
  UPDATE public.companies SET base_currency = v_new WHERE id = p_company_id;

  -- ── ولا قيدَ يولَدُ خلسةً ولا توازنَ ينكسر: يُقاسُ لا يُرتجى ──
  SELECT count(*) INTO v_je_after FROM public.journal_entries WHERE company_id = p_company_id;
  IF v_je_after <> v_je_before THEN
    RAISE EXCEPTION 'عددُ القيودِ تغيّرَ أثناءَ التحويلِ (% إلى %) — مشغِّلٌ خفىٌّ كتبَ خلسةً، فيرجعُ كلُّ شىء.', v_je_before, v_je_after
      USING ERRCODE = '23514';
  END IF;
  SELECT count(*) INTO v_new_unbal FROM (
    SELECT l.journal_entry_id FROM public.journal_entry_lines l
    JOIN public.journal_entries j ON j.id = l.journal_entry_id
    WHERE j.company_id = p_company_id
    GROUP BY l.journal_entry_id
    HAVING sum(coalesce(l.debit_amount,0)) <> sum(coalesce(l.credit_amount,0))
  ) u WHERE NOT (u.journal_entry_id = ANY (v_unbal_ids));
  IF v_new_unbal <> 0 THEN
    RAISE EXCEPTION '% قيداً كان متوازناً فاختلَّ بعدَ التحويلِ ولم يُسدَّدْ فرقُه — فيرجعُ كلُّ شىء.', v_new_unbal
      USING ERRCODE = '23514';
  END IF;
  v_counts := v_counts || jsonb_build_object('pre_unbalanced_entries', coalesce(array_length(v_unbal_ids, 1), 0));

  -- معدودٌ لا مسكوتٌ عنه: ما لم يُمَسَّ يُحصى فى التقريرِ بالاسم.
  SELECT count(*) INTO v_ic FROM public.intercompany_transactions t
   WHERE t.seller_company_id = p_company_id OR t.buyer_company_id = p_company_id;

  RETURN jsonb_build_object(
    'old_currency', v_old,
    'new_currency', v_new,
    'rate', v_rate,
    'rate_source', v_rate_src,
    'rows_scaled', v_scaled,
    'counts', v_counts,
    'untouched_declared', jsonb_build_object(
      'intercompany_transactions', v_ic,
      'note', 'display_/original_ أعمدةُ العرضِ القديمةُ وأرشيفُ السطورِ اليتيمةِ وقيودُ ما بينَ الشركاتِ لم تُمَسَّ وهى دَينٌ مُعلَن'
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.change_base_currency(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_base_currency(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.change_base_currency(uuid, text) IS
'v3.75.62 «والدفترُ يُعادُ حسابُه فى خزانتِه»: المسارُ المُعلَنُ الوحيدُ لتغييرِ العملةِ الأساسيّة. معاملةٌ واحدة: تحقُّقُ صلاحيّةٍ (مالكٌ أو مديرٌ عامٌّ)، سعرٌ من جدولِ أسعارِ الشركةِ وحدَه، إعادةُ حسابِ المحفوظِ على الأساسِ الجديد، اشتقاقُ الأسعارِ الجديدة، تسجيلُ الأثر، ثمّ تبديلُ العملةِ عبرَ البابِ المُسمّى. إن فشلَ حرفٌ رجعَ كلُّ شىء.';

-- ─────────────────────────────────────────────────────────────────────────────
-- (٣) الفحصُ المرجعىُّ المولود — يُثبِّتُ أهلَ البابِ بالاسم
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_62_check()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path = public, pg_catalog, pg_temp
AS $function$
DECLARE
  -- أهلُ البابِ المُسمّى بأعيانِهم: حارسُ الشركاتِ، والحُرّاسُ العشرةُ
  -- المفتوحةُ أبوابُهم تعديلاً، ودالّةُ الخزانةِ التى تفتحُه لنفسِها.
  c_door_holders constant text[] := array[
    'erp_base_currency_change_guard',
    'prevent_paid_invoice_modification',
    'block_invoice_immutable_edits',
    'block_bill_immutable_edits',
    'invoice_protect_posted_trg',
    'bill_protect_posted_trg',
    'po_protect_approved_trg',
    'block_expense_immutable_edits',
    'prevent_linked_inventory_modification',
    'prevent_bill_overpayment',
    'prevent_invoice_overpayment',
    'change_base_currency'
  ];
  v_holder text;
  v_outside bigint;
  v_missing text := '';
  v_n bigint;
  v_pub bigint;
  v_gutted text := '';
BEGIN
  -- (أ) دالّةُ الخزانةِ موجودةٌ بتوقيعٍ واحدٍ لا يبلغُها زائرٌ ولا عمومُ أدوار.
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'change_base_currency';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'BASELINE FAIL: change_base_currency موجودةٌ % مرّةً لا مرّةً واحدة (v3.75.62)', v_n;
  END IF;
  IF has_function_privilege('anon', 'public.change_base_currency(uuid, text)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'BASELINE FAIL: الزائرُ يبلغُ دالّةَ الخزانةِ change_base_currency (v3.75.62)';
  END IF;
  SELECT count(*) INTO v_pub
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
         aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   WHERE n.nspname = 'public' AND p.proname = 'change_base_currency' AND a.grantee = 0;
  IF v_pub <> 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: عمومُ الأدوارِ يبلغُ دالّةَ الخزانةِ change_base_currency (v3.75.62)';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.change_base_currency(uuid, text)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'BASELINE FAIL: المستخدِمُ المسجَّلُ لا يبلغُ دالّةَ الخزانةِ فتعطّلَ تغييرُ العملة (v3.75.62)';
  END IF;

  -- (ب) حارسُ الشركاتِ قائمٌ على جدولِه.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     WHERE c.relname = 'companies' AND t.tgname = 'trg_companies_base_currency_change_guard' AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'BASELINE FAIL: حارسُ تغييرِ العملةِ الأساسيّةِ غابَ عن جدولِ الشركات (v3.75.62)';
  END IF;

  -- (ج) أهلُ البابِ بأعيانِهم: كلُّ اسمٍ مُعلَنٍ يحملُ البابَ، ولا حاملَ خارجَ المُعلَن.
  FOREACH v_holder IN ARRAY c_door_holders LOOP
    SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_holder
       AND position('app.allow_base_currency_change' in p.prosrc) > 0;
    IF v_n = 0 THEN v_missing := v_missing || v_holder || ' '; END IF;
  END LOOP;
  IF v_missing <> '' THEN
    RAISE EXCEPTION 'BASELINE FAIL: من أهلِ البابِ مَن فقدَه: % (v3.75.62)', v_missing;
  END IF;
  SELECT count(*) INTO v_outside
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND position('app.allow_base_currency_change' in p.prosrc) > 0
     AND p.proname NOT LIKE 'assert_baseline%'
     AND NOT (p.proname = ANY (c_door_holders));
  IF v_outside <> 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: % دالّةً تحملُ بابَ تحويلِ الأساسِ خارجَ المُعلَنينَ بالاسم (v3.75.62)', v_outside;
  END IF;

  -- (د) وحارسٌ فُتِحَ بابُه لم يُنزَعْ نابُه: صرخةُ الرفضِ باقيةٌ فى جسدِ كلِّ حارس.
  FOR v_holder IN
    SELECT unnest(array[
      'block_invoice_immutable_edits','block_bill_immutable_edits',
      'invoice_protect_posted_trg','bill_protect_posted_trg',
      'po_protect_approved_trg','block_expense_immutable_edits',
      'prevent_linked_inventory_modification','prevent_paid_invoice_modification',
      'prevent_bill_overpayment','prevent_invoice_overpayment',
      'erp_base_currency_change_guard'])
  LOOP
    SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_holder
       AND position('RAISE EXCEPTION' in p.prosrc) > 0;
    IF v_n = 0 THEN v_gutted := v_gutted || v_holder || ' '; END IF;
  END LOOP;
  IF v_gutted <> '' THEN
    RAISE EXCEPTION 'BASELINE FAIL: حارسٌ فقدَ صرخةَ رفضِه: % (v3.75.62)', v_gutted;
  END IF;

  RETURN 'v3.75.62 ok — دالّةُ الخزانةِ واحدةٌ لا يبلغُها زائرٌ ولا عموم · وأهلُ البابِ 12 بالاسم · خارجَ المُعلَن 0 · ولا حارسَ فقدَ صرخته';
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_62_check() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.assert_baseline_v3_75_62_check() IS
'v3.75.62: يُثبِّتُ أنّ دالّةَ الخزانةِ change_base_currency موجودةٌ بتوقيعٍ واحدٍ لا يبلغُها الزائرُ ولا عمومُ الأدوارِ ويبلغُها المستخدِمُ المسجَّل، وأنّ حارسَ تغييرِ العملةِ قائمٌ على جدولِ الشركات، وأنّ حاملى بابِ app.allow_base_currency_change اثنا عشرَ بأعيانِهم لا زائدَ عليهم، وأنّ كلَّ حارسٍ فُتِحَ بابُه ما زالَ يحملُ صرخةَ رفضِه.';

-- ─────────────────────────────────────────────────────────────────────────────
-- (٤) بابانِ يتيمانِ من المسارِ المُسرَّحِ تُنزَعُ منحتُهما
-- ─────────────────────────────────────────────────────────────────────────────
-- الملفُّ المحذوفُ lib/currency-conversion-system.ts كان **الطارقَ الوحيدَ**
-- على هاتَينِ الدالّتَين، ولا مُنادىَ لهما فى القاعدةِ (صفرُ دوالَّ تذكرُهما)
-- ولا فى الكود. وهما بصلاحيّاتٍ كاملةٍ (SECURITY DEFINER) — وبابٌ بلا طارقٍ
-- بصلاحيّاتٍ كاملةٍ لا يُترَكُ مفتوحاً للمستخدِمِ المسجَّل. **وجُرِّبَ النزعُ
-- حيّاً على الإنتاجِ داخلَ معاملةٍ أُلغيت قبلَ أن يُكتَبَ هنا**: نداءٌ مباشرٌ
-- بدورِ authenticated بعدَ النزعِ رُفِضَ 42501. ويبقيانِ لمفتاحِ الخدمةِ
-- بمنحتِه الصريحةِ — فإن احتاجَهما مسارٌ خادمىٌّ يوماً فبابُه قائم.

REVOKE ALL ON FUNCTION public.convert_product_display_prices(uuid, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.snapshot_product_original_prices(uuid, text) FROM PUBLIC, anon, authenticated;
