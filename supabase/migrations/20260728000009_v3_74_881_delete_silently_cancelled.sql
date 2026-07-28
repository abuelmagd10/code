-- ═══════════════════════════════════════════════════════════════════════════
-- v3.74.881 — حذفٌ لا يُرفض ولا يقع
--
-- **الحادثة:** حذف قيد يومية **مسودَّة** لا يفشل ولا ينجح: لا يُرفع خطأ،
-- ولا يُحذف الصف. والمستدعى يمضى واثقاً أنه نظّف ما أفسد.
--
-- أُثبت على الإنتاج داخل معاملةٍ مُلغاة:
--
--     chart_of_accounts : rows left after DELETE = 0   (حُذف كما يجب)
--     journal_entries   : rows left after DELETE = 1   *** ابتُلع بصمت ***
--
-- ── السبب ───────────────────────────────────────────────────────────────
-- `prevent_posted_journal_modification()` مُشغِّل `BEFORE DELETE`، وينتهى
-- بـ`RETURN NEW`. وفى عملية حذف **لا وجود لـ`NEW`** فتكون `NULL`، و
-- PostgreSQL يفهم `NULL` من مُشغِّل BEFORE على أنها **«ألغِ هذه العملية»**.
--
--     IF OLD.status = 'posted' THEN … RAISE … END IF;
--     RETURN NEW;      ← مسودَّة ⇒ NULL ⇒ الحذف يُلغى بصمت
--
-- فالدالة تعرف كيف **ترفض** حذفاً، ولا تعرف كيف **تُتمّه**.
--
-- ⇒ **الرفض يُرى، والإلغاء الصامت لا يُرى.** وخطأٌ صريح أرحم من نجاحٍ كاذب،
--   لأن الأول يوقفك والثانى يمضى بك.
--
-- ── ولمَ لم يُكتشف؟ ──────────────────────────────────────────────────────
-- لأن المسار الوحيد الذى يمرّ به هو **مسار تراجُع**: لا يعمل إلا حين يفشل
-- شىءٌ قبله، ولا أحد يقرأ نتيجته. ⇒ **ما لا يُقرأ أثره لا يُلاحَظ عطبه.**
--
-- ── حدود العطب — مقيسةٌ لا مظنونة ───────────────────────────────────────
-- ١٧ مُشغِّل `BEFORE DELETE` فى القاعدة تنتهى دوالُّها بـ`RETURN NEW`:
--
--   • ٢ أُثبتتا **تجريبياً** أنهما تحذفان كما يجب
--     (`chart_of_accounts`, `invoice_items` — ولهما وحدهما صفوفٌ فى حالةٍ
--      مسموحة، فمرّتا فعلاً)
--   • ١١ أُثبتت **تجريبياً** أنها ترفض بصوتٍ عالٍ فى حالتها المحظورة
--   • ١١ يُثبت **بنيةً** أن فرع الحذف فيها يبدأ بـ`RETURN OLD`، فالسطر
--     المشبوه لا يُبلَغ أصلاً فى الحذف
--   • **١ فقط** لا تُعيد `OLD` فى أى مسار: هذه.
--
-- والعلامة الدقيقة التى ميّزتها: **عدد مرات `RETURN OLD` = صفر.**
--
-- ── الأثر على البيانات: لا شىء ──────────────────────────────────────────
-- صفر قيدٍ مسودَّة بلا سطور · ١٢٤ قيداً مُرحَّلاً · الميزان 0.0000.
-- الثغرة كانت مفتوحةً ولم تُنتج ضرراً بعد.
-- ═══════════════════════════════════════════════════════════════════════════

-- ولا يتغيّر ما تقبله الدالة ولا ما ترفضه. الفرق الوحيد أن **الحذف المسموح
-- يقع فعلاً** بدل أن يُبتلع. والشكل مأخوذٌ من المُشغِّلَين المجاورَين على
-- **نفس الجدول** (`enforce_posted_entry_no_edit`, `enforce_period_lock_header`)
-- — فالصواب كان مكتوباً بجوارها.
CREATE OR REPLACE FUNCTION public.prevent_posted_journal_modification()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Administrative bypass
  IF current_setting('app.allow_direct_post', true) = 'true' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF OLD.status = 'posted' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Cannot delete a posted journal entry (ID: %). Create a reversal entry instead.', OLD.id;
    ELSIF TG_OP = 'UPDATE' THEN
      IF OLD.entry_date IS DISTINCT FROM NEW.entry_date
         OR OLD.description IS DISTINCT FROM NEW.description
         OR OLD.reference_type IS DISTINCT FROM NEW.reference_type
         OR OLD.reference_id IS DISTINCT FROM NEW.reference_id
         OR OLD.warehouse_id IS DISTINCT FROM NEW.warehouse_id
         OR OLD.status IS DISTINCT FROM NEW.status
      THEN
        RAISE EXCEPTION 'Cannot modify a posted journal entry (ID: %). Create a reversal entry instead.', OLD.id;
      END IF;
      IF OLD.branch_id IS DISTINCT FROM NEW.branch_id THEN
        IF OLD.branch_id IS NOT NULL OR NEW.branch_id IS NULL THEN
          RAISE EXCEPTION 'Cannot modify a posted journal entry (metadata branch_id) (ID: %). Create a reversal entry instead.', OLD.id;
        END IF;
      END IF;
      IF OLD.cost_center_id IS DISTINCT FROM NEW.cost_center_id THEN
        IF OLD.cost_center_id IS NOT NULL OR NEW.cost_center_id IS NULL THEN
          RAISE EXCEPTION 'Cannot modify a posted journal entry (metadata cost_center_id) (ID: %). Create a reversal entry instead.', OLD.id;
        END IF;
      END IF;
      RETURN NEW;
    END IF;
  END IF;

  -- v3.74.881 — كان `RETURN NEW`. وعلى الحذف تكون `NEW` فارغةً فيُلغى
  -- الحذف بصمت. `COALESCE(NEW, OLD)` تُعيد الصف الصحيح فى الحالتين.
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- ── تحقُّقٌ يُنفِّذ لا يقرأ ────────────────────────────────────────────────
-- الفحص الوحيد المقبول هنا هو **حذفٌ فعلى**: قراءة النصّ هى التى فاتت أول
-- مرة. يُنشأ قيدٌ مسودَّة، يُحذف، ويُعدّ ما بقى. ثم يُتراجَع عن كل شىء.
DO $$
DECLARE
  v_co UUID; v_branch UUID; v_cc UUID; v_je UUID; v_left INT;
BEGIN
  SELECT c.id INTO v_co FROM public.companies c
   WHERE EXISTS (SELECT 1 FROM public.branches b WHERE b.company_id = c.id)
     AND EXISTS (SELECT 1 FROM public.cost_centers x WHERE x.company_id = c.id)
   ORDER BY c.created_at LIMIT 1;

  IF v_co IS NULL THEN
    RAISE NOTICE 'v3.74.881: no company with a branch and a cost centre - behaviour NOT verified here';
    RETURN;
  END IF;

  SELECT id INTO v_branch FROM public.branches     WHERE company_id = v_co ORDER BY created_at LIMIT 1;
  SELECT id INTO v_cc     FROM public.cost_centers WHERE company_id = v_co ORDER BY created_at LIMIT 1;

  INSERT INTO public.journal_entries
    (company_id, entry_number, entry_date, description, status,
     branch_id, cost_center_id, reference_type, reference_id)
  VALUES (v_co, 'ZZ-VERIFY-881-' || substr(gen_random_uuid()::text, 1, 8),
          CURRENT_DATE, 'v3.74.881 verification', 'draft',
          v_branch, v_cc, 'manual', gen_random_uuid())
  RETURNING id INTO v_je;

  DELETE FROM public.journal_entries WHERE id = v_je;

  SELECT count(*) INTO v_left FROM public.journal_entries WHERE id = v_je;
  IF v_left <> 0 THEN
    RAISE EXCEPTION
      'v3.74.881: a DRAFT journal entry survived its own DELETE - the silent cancel is still there';
  END IF;

  RAISE NOTICE 'v3.74.881: a draft journal entry can now actually be deleted (verified by doing it)';
END $$;

-- ── وأن يبقى الرفض رفضاً: قيدٌ مُرحَّل لا يُحذف ─────────────────────────
-- إصلاحُ الابتلاع الصامت لا يصحّ أن يفتح باباً. فيُثبَت الشقّ الآخر أيضاً.
--
-- ⚠️ هذا الفحص يحذف قيداً **حقيقياً مُرحَّلاً**. فلا يُترك أمرُ بقائه
-- للمصادفة: يُرفع خطأٌ مقصود فوراً بعد الحذف، فتتراجع المعاملة الفرعية
-- وتُعيد الصف حتماً — **سواء نجح الحذف أو رُفض**.
-- ⇒ **الفحص الذى يمسّ بياناتٍ حقيقية يُبنى بحيث لا يستطيع إبقاء أثره،
--   لا بحيث يُرجَّح ألّا يُبقيه.**
DO $$
DECLARE
  v_je UUID; v_allowed BOOLEAN := false; v_msg TEXT; v_left INT;
BEGIN
  SELECT id INTO v_je FROM public.journal_entries
   WHERE status = 'posted' AND coalesce(is_deleted, false) = false
   ORDER BY created_at LIMIT 1;

  IF v_je IS NULL THEN
    RAISE NOTICE 'v3.74.881: no posted entry to test the refusal against';
    RETURN;
  END IF;

  BEGIN
    DELETE FROM public.journal_entries WHERE id = v_je;
    -- وصلنا هنا ⇒ الحذف لم يُرفض. يُتراجَع عنه فوراً بخطأٍ مقصود.
    RAISE EXCEPTION 'PROBE-881-DELETE-WAS-ALLOWED';
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
    v_allowed := (v_msg = 'PROBE-881-DELETE-WAS-ALLOWED');
  END;

  -- والصف يجب أن يكون قائماً فى الحالتين.
  SELECT count(*) INTO v_left FROM public.journal_entries WHERE id = v_je;
  IF v_left <> 1 THEN
    RAISE EXCEPTION 'v3.74.881: the probe removed a real posted entry (%) - STOP', v_je;
  END IF;

  IF v_allowed THEN
    RAISE EXCEPTION
      'v3.74.881: a POSTED journal entry was deletable - the fix opened a door it must not open';
  END IF;

  RAISE NOTICE 'v3.74.881: a posted entry is still refused, loudly (%)', left(v_msg, 60);
END $$;
