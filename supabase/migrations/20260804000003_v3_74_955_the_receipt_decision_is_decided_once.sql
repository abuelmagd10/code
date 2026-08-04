-- v3.74.955 — قرارُ الاستلام يُحسم مرّةً واحدة
-- ============================================================================
-- المقيسُ على الإنتاج (٤ أغسطس ٢٠٢٦):
--   • BILL-0008: receipt_status = 'rejected'، و rejected_by فارغ، و rejected_at
--     فارغ. رفضان وقعا من شخصين، والسجلُّ لا يعرف صاحبَ أىٍّ منهما. الثانى
--     دهس الأوّلَ بصمت، وكلاهما رأى «تم الحفظ» لأنّ كليهما حُفظ فعلاً.
--   • bills_receipt_status_check يقيّد **القيمة** ولا يقيّد **الانتقال**:
--     لا شىءَ يمنع rejected ⇐ received ولا العكس.
--   • post_bill_receipt_atomic — وهى التى تُنشئ القيدَ وتُحرّك المخزون —
--     تسأل: «هل الفاتورةُ موجودة؟» ولا تسأل: «وما حالتُها؟». ولا تقفل الصفَّ
--     (FOR UPDATE غائب)، ولا تحمل مفتاحَ تنفيذٍ يمنع التكرار.
--
--   فلو رفض المالكُ ثمّ قَبِل مسئولُ المخزن من صفحةٍ قديمة: يُنشأ قيدٌ
--   محاسبىٌّ وتدخل البضاعةُ على مستندٍ مرفوض. والعكسُ يترك قيداً مُقيَّداً
--   وبضاعةً داخلةً تحت كلمة «مرفوض».
--
--   والضررُ حتى الآن صفر: صفرُ فاتورةٍ مرفوضةٍ لها قيد، و BILL-0008 بلا قيد
--   ولا حركةِ مخزون. البابُ مفتوحٌ ولم يدخل منه أحد.
--
-- العلاج: القرارُ **انتقالٌ محروس** لا كتابةٌ حرّة، والحراسةُ فى القاعدة لا
-- فى الشاشة — فكلُّ طريقٍ يمرّ من نفس الحاجز.
-- ============================================================================

-- ── (١) الانتقالُ المشروع، ومَن حسمه ومتى ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.bill_receipt_transition_guard_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_old     TEXT := COALESCE(OLD.receipt_status, 'pending');
  v_new     TEXT := COALESCE(NEW.receipt_status, 'pending');
  v_who     UUID;
  v_when    TIMESTAMPTZ;
  v_name    TEXT;
  v_word    TEXT;
  v_touched BOOLEAN;
BEGIN
  -- ختمُ آخرِ تعديلٍ لم يكن يتحرّك، فلم يكن للشاشة سبيلٌ لتعرف أنّها قديمة.
  NEW.updated_at := NOW();

  -- هل مُسَّ قرارُ الاستلام بأىِّ وجه؟ الحالةُ نفسُها، أو سببُ الرفض، أو ختمُ
  -- مَن حسم ومتى. وإعادةُ الرفض بكلمةٍ أخرى ليست تغييراً فى الحالة، لكنّها
  -- **قرارٌ ثانٍ يدهس الأوّل** — وهو ما وقع فعلاً فى BILL-0008.
  v_touched :=
        (v_new IS DISTINCT FROM v_old)
     OR (NEW.receipt_rejection_reason IS DISTINCT FROM OLD.receipt_rejection_reason)
     OR (NEW.rejected_by  IS DISTINCT FROM OLD.rejected_by)
     OR (NEW.rejected_at  IS DISTINCT FROM OLD.rejected_at)
     OR (NEW.received_by  IS DISTINCT FROM OLD.received_by)
     OR (NEW.received_at  IS DISTINCT FROM OLD.received_at);

  IF NOT v_touched THEN
    RETURN NEW;
  END IF;

  -- المشروعُ وحدَه:
  --   معلّق  ⇐ مستلَم | مرفوض      (القرارُ الأوّل)
  --   مرفوض ⇐ معلّق                (إعادةُ الإرسال بعد التصحيح)
  -- وما عداه ممنوع: مرفوضٌ لا يصير مستلَماً مباشرةً، ومستلَمٌ لا يُنقض.
  IF (v_old = 'pending'  AND v_new IN ('received', 'rejected'))
     OR (v_old = 'rejected' AND v_new = 'pending') THEN

    IF v_new = 'rejected' THEN
      IF NEW.rejected_by IS NULL THEN NEW.rejected_by := auth.uid(); END IF;
      IF NEW.rejected_at IS NULL THEN NEW.rejected_at := NOW(); END IF;
    ELSIF v_new = 'received' THEN
      IF NEW.received_by IS NULL THEN NEW.received_by := auth.uid(); END IF;
      IF NEW.received_at IS NULL THEN NEW.received_at := NOW(); END IF;
    ELSE
      -- عادت معلّقةً: يُمحى ختمُ الرفض وسببُه حتى لا يُنسب رفضٌ قديمٌ لقرارٍ جديد.
      NEW.rejected_by := NULL;
      NEW.rejected_at := NULL;
      NEW.receipt_rejection_reason := NULL;
    END IF;

    RETURN NEW;
  END IF;

  -- ممنوع. ونقول لصاحبه مَن سبقه ومتى — والرسالةُ تصل إلى الشاشة منذ ٩٥٤.
  IF v_old = 'rejected' THEN
    v_word := 'رُفض'; v_who := OLD.rejected_by; v_when := OLD.rejected_at;
  ELSIF v_old = 'received' THEN
    v_word := 'استُلم'; v_who := OLD.received_by; v_when := OLD.received_at;
  ELSE
    v_word := 'حُسم'; v_who := NULL; v_when := NULL;
  END IF;

  SELECT u.email INTO v_name FROM auth.users u WHERE u.id = v_who;

  RAISE EXCEPTION 'v3.74.955: هذا المستندُ حُسم بالفعل — % %. حدّث الصفحة ثمّ انظر حالتَه.',
    v_word,
    COALESCE('بواسطة ' || COALESCE(v_name, v_who::TEXT), 'من قبل')
      || COALESCE(' فى ' || to_char(v_when AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') || ' بتوقيت جرينتش', '');
END;
$function$;

-- الاسمُ يبدأ بـ aa عن قصد: مُشغِّلاتُ الحدث الواحد تعمل بترتيبٍ أبجدى،
-- وهذا يجب أن يحكم قبل أن يبنى غيرُه على قرارٍ غير مشروع.
DROP TRIGGER IF EXISTS aa_bill_receipt_transition_guard ON public.bills;
CREATE TRIGGER aa_bill_receipt_transition_guard
  BEFORE UPDATE ON public.bills
  FOR EACH ROW
  EXECUTE FUNCTION public.bill_receipt_transition_guard_trg();

-- ── (٢) القبولُ يقفل الصفَّ ويسأل عن الحالة قبل أن يُقيِّد ────────────────
CREATE OR REPLACE FUNCTION public.post_bill_receipt_atomic(
  p_company_id uuid,
  p_bill_id uuid,
  p_bill_update jsonb DEFAULT NULL::jsonb,
  p_journal_entry jsonb DEFAULT NULL::jsonb,
  p_inventory_transactions jsonb DEFAULT NULL::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result JSONB := '{}'::JSONB;
  v_journal_entry_id UUID;
  v_receipt_status TEXT;
BEGIN
  -- v3.74.730 — reject a caller acting on another company's data.
  PERFORM public.assert_company_access(p_company_id);
  PERFORM set_config('app.allow_direct_post', 'true', true);

  -- v3.74.955 — يُقفل الصفُّ أوّلاً، فلا يتسابق اثنان على نفس اللحظة.
  SELECT COALESCE(b.receipt_status, 'pending')
    INTO v_receipt_status
    FROM public.bills b
   WHERE b.id = p_bill_id
     AND b.company_id = p_company_id
   FOR UPDATE;

  IF v_receipt_status IS NULL THEN
    RAISE EXCEPTION 'Bill not found or does not belong to company';
  END IF;

  -- مستندٌ مرفوضٌ لا يُقيَّد ولا يدخل المخزن.
  IF v_receipt_status = 'rejected' THEN
    RAISE EXCEPTION 'v3.74.955: هذا المستندُ مرفوضٌ من الاستلام — لا يُقيَّد ولا تدخل بضاعتُه. حدّث الصفحة.';
  END IF;

  -- ولا يُقيَّد مرتين: القيدُ القائمُ نفسُه هو مفتاحُ منع التكرار.
  IF p_journal_entry IS NOT NULL
     AND public.get_journal_entry_id_for_bill_receipt(p_company_id, p_bill_id) IS NOT NULL THEN
    RAISE EXCEPTION 'v3.74.955: هذا المستندُ له قيدٌ مُقيَّدٌ سلفاً — لا يُقيَّد مرتين. حدّث الصفحة.';
  END IF;

  IF p_journal_entry IS NOT NULL THEN
    INSERT INTO public.journal_entries (
      company_id, branch_id, cost_center_id, entry_date, description,
      reference_type, reference_id, status
    ) VALUES (
      p_company_id,
      NULLIF(p_journal_entry->>'branch_id', '')::UUID,
      NULLIF(p_journal_entry->>'cost_center_id', '')::UUID,
      COALESCE(NULLIF(p_journal_entry->>'entry_date', '')::DATE, CURRENT_DATE),
      p_journal_entry->>'description',
      COALESCE(NULLIF(p_journal_entry->>'reference_type', ''), 'bill'),
      COALESCE(NULLIF(p_journal_entry->>'reference_id', '')::UUID, p_bill_id),
      COALESCE(NULLIF(p_journal_entry->>'status', ''), 'posted')
    )
    RETURNING id INTO v_journal_entry_id;

    IF p_journal_entry->'lines' IS NOT NULL THEN
      INSERT INTO public.journal_entry_lines (
        journal_entry_id, account_id, description, debit_amount, credit_amount,
        branch_id, cost_center_id
      )
      SELECT
        v_journal_entry_id,
        (line->>'account_id')::UUID,
        line->>'description',
        COALESCE((line->>'debit_amount')::NUMERIC, 0),
        COALESCE((line->>'credit_amount')::NUMERIC, 0),
        NULLIF(line->>'branch_id', '')::UUID,
        NULLIF(line->>'cost_center_id', '')::UUID
      FROM jsonb_array_elements(p_journal_entry->'lines') AS line;
    END IF;

    v_result := jsonb_set(v_result, '{journal_entry_id}', to_jsonb(v_journal_entry_id), true);
  END IF;

  IF p_inventory_transactions IS NOT NULL AND jsonb_array_length(p_inventory_transactions) > 0 THEN
    INSERT INTO public.inventory_transactions (
      company_id, product_id, transaction_type, quantity_change, unit_cost, total_cost,
      reference_id, reference_type, journal_entry_id, notes, branch_id, cost_center_id,
      warehouse_id, original_currency, original_unit_cost, original_total_cost, exchange_rate_used
    )
    SELECT
      p_company_id,
      NULLIF(tx->>'product_id', '')::UUID,
      tx->>'transaction_type',
      COALESCE((tx->>'quantity_change')::INTEGER, 0),
      NULLIF(tx->>'unit_cost', '')::NUMERIC,
      NULLIF(tx->>'total_cost', '')::NUMERIC,
      COALESCE(NULLIF(tx->>'reference_id', '')::UUID, p_bill_id),
      COALESCE(NULLIF(tx->>'reference_type', ''), 'bill'),
      COALESCE(NULLIF(tx->>'journal_entry_id', '')::UUID, v_journal_entry_id),
      tx->>'notes',
      NULLIF(tx->>'branch_id', '')::UUID,
      NULLIF(tx->>'cost_center_id', '')::UUID,
      NULLIF(tx->>'warehouse_id', '')::UUID,
      NULLIF(tx->>'original_currency', ''),
      NULLIF(tx->>'original_unit_cost', '')::NUMERIC,
      NULLIF(tx->>'original_total_cost', '')::NUMERIC,
      COALESCE(NULLIF(tx->>'exchange_rate_used', '')::NUMERIC, 1)
    FROM jsonb_array_elements(p_inventory_transactions) AS tx;

    v_result := jsonb_set(
      v_result, '{inventory_transaction_count}',
      to_jsonb(COALESCE(jsonb_array_length(p_inventory_transactions), 0)), true);
  END IF;

  IF p_bill_update IS NOT NULL THEN
    UPDATE public.bills
    SET
      status = COALESCE(NULLIF(p_bill_update->>'status', ''), status),
      receipt_status = COALESCE(NULLIF(p_bill_update->>'receipt_status', ''), receipt_status),
      received_by = COALESCE(NULLIF(p_bill_update->>'received_by', '')::UUID, received_by),
      received_at = COALESCE(NULLIF(p_bill_update->>'received_at', '')::TIMESTAMPTZ, received_at),
      updated_at = NOW()
    WHERE id = p_bill_id
      AND company_id = p_company_id;
  END IF;

  PERFORM set_config('app.allow_direct_post', 'false', true);
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.allow_direct_post', 'false', true);
  -- رسائلُنا تصل كما هى: ٩٥٤ يعرضها للمستخدم، فلا تُلَفّ بغلافٍ إنجليزى.
  IF SQLERRM LIKE '%v3.74.955%' THEN
    RAISE;
  END IF;
  RAISE EXCEPTION 'Bill receipt posting failed: %', SQLERRM;
END;
$function$;
