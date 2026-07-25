-- ============================================================================
-- v3.74.819 — اقتناء الأصول الثابتة يُثبَّت دفترياً + إبطال مسارين قديمين
-- ============================================================================
-- **الفجوة الكبرى**: شاشة الأصول الثابتة كانت **لا تُرحّل أى قيد اقتناء
-- إطلاقاً**. تُدخل الأصل فيُنشأ صف وجدول إهلاك — بينما الدفاتر لا تعرف عنه
-- شيئاً. ثم يبدأ الإهلاك بالترحيل **على أصل لم يُثبت قط**:
--   • النقدية لا تنقص رغم دفع ثمن الأصل.
--   • الأصل لا يظهر فى الميزانية.
--   • مصروف الإهلاك يُحمَّل مقابل مجمَّع إهلاك لأصل غير موجود دفترياً
--     ⇒ الميزانية تحمل مجمَّع إهلاك بلا أصل يقابله.
--
-- **قرار المالك (25/7)**: يدعم النظام **المسارين** باختيار المستخدم:
--   (أ) `acquisition_source='bill'` — الأصل مُقتنى عبر فاتورة مشتريات
--       (قيده مُرحَّل من دورة المشتريات بموردها وضريبتها وسدادها المحكوم)،
--       فلا يُرحَّل له قيد ثانٍ.
--   (ب) `acquisition_source='direct'` — تسجيل مباشر: النظام يُرحّل
--       **مدين الأصل / دائن حساب السداد المختار**.
--
-- ============================================================================

-- ─── (١) أعمدة مصدر الاقتناء وربطه ─────────────────────────────────────────
ALTER TABLE public.fixed_assets
  ADD COLUMN IF NOT EXISTS acquisition_source text,
  ADD COLUMN IF NOT EXISTS source_bill_id uuid,
  ADD COLUMN IF NOT EXISTS acquisition_payment_account_id uuid,
  ADD COLUMN IF NOT EXISTS acquisition_journal_entry_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fixed_assets_acquisition_source_check') THEN
    ALTER TABLE public.fixed_assets
      ADD CONSTRAINT fixed_assets_acquisition_source_check
      CHECK (acquisition_source IS NULL OR acquisition_source IN ('bill', 'direct'));
  END IF;
END $$;

-- ─── (٢) مُرحِّل قيد الاقتناء — محكوم وidempotent ───────────────────────────
-- يرفض: أصلاً مُقتنى عبر فاتورة (منع الازدواج)، حساب أصل من نوع خاطئ،
-- تكلفة غير موجبة، حساب سداد مفقود، فترة مقفلة. ويعيد نفس القيد عند تكرار
-- النداء بدل إنشاء ثانٍ.
CREATE OR REPLACE FUNCTION public.post_fixed_asset_acquisition_atomic(
  p_asset_id uuid, p_payment_account_id uuid DEFAULT NULL, p_user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE v_asset RECORD; v_pay uuid; v_entry uuid; v_type text;
BEGIN
  SELECT * INTO v_asset FROM public.fixed_assets WHERE id = p_asset_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ASSET_NOT_FOUND'; END IF;
  PERFORM public.assert_company_access(v_asset.company_id);

  IF v_asset.acquisition_journal_entry_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', TRUE, 'entry_id', v_asset.acquisition_journal_entry_id, 'idempotent', TRUE);
  END IF;

  IF COALESCE(v_asset.acquisition_source, 'direct') = 'bill' THEN
    RAISE EXCEPTION 'ASSET_ALREADY_CAPITALISED: هذا الأصل مُقتنى عبر فاتورة مشتريات وقيده مُرحَّل بالفعل — ترحيل قيد اقتناء ثانٍ يضاعف قيمة الأصل. | This asset was acquired through a purchase bill and is already capitalised; a second acquisition entry would double its value.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_pay := COALESCE(p_payment_account_id, v_asset.acquisition_payment_account_id);
  IF v_pay IS NULL OR v_asset.asset_account_id IS NULL THEN
    RAISE EXCEPTION 'ASSET_ACCOUNTS_MISSING: حساب الأصل أو حساب السداد غير محدد. | The asset account or the payment account is missing.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF COALESCE(v_asset.purchase_cost, 0) <= 0 THEN
    RAISE EXCEPTION 'ASSET_COST_INVALID: تكلفة الأصل يجب أن تكون موجبة. | The asset cost must be positive.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT account_type INTO v_type FROM chart_of_accounts WHERE id = v_asset.asset_account_id;
  IF v_type IS DISTINCT FROM 'asset' THEN
    RAISE EXCEPTION 'ASSET_ACCOUNT_TYPE: حساب الأصل يجب أن يكون من نوع أصول. | The asset account must be of type asset.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF to_regprocedure('public.validate_transaction_period(uuid,date)') IS NOT NULL THEN
    PERFORM public.validate_transaction_period(v_asset.company_id, v_asset.purchase_date);
  END IF;

  PERFORM set_config('app.allow_direct_post', 'true', true);

  INSERT INTO public.journal_entries
    (company_id, branch_id, cost_center_id, entry_date, description,
     reference_type, reference_id, status, posted_by, posted_at)
  VALUES (v_asset.company_id, v_asset.branch_id, v_asset.cost_center_id,
          v_asset.purchase_date, 'اقتناء أصل ثابت - ' || v_asset.name,
          'asset_acquisition', p_asset_id, 'posted', p_user_id, NOW())
  RETURNING id INTO v_entry;

  INSERT INTO public.journal_entry_lines
    (journal_entry_id, account_id, debit_amount, credit_amount, description, branch_id, cost_center_id)
  VALUES
    (v_entry, v_asset.asset_account_id, v_asset.purchase_cost, 0,
     'إثبات أصل ثابت - ' || v_asset.name, v_asset.branch_id, v_asset.cost_center_id),
    (v_entry, v_pay, 0, v_asset.purchase_cost,
     'سداد ثمن الأصل - ' || v_asset.name, v_asset.branch_id, v_asset.cost_center_id);

  PERFORM set_config('app.allow_direct_post', 'false', true);

  UPDATE public.fixed_assets
     SET acquisition_journal_entry_id = v_entry,
         acquisition_source = COALESCE(acquisition_source, 'direct'),
         acquisition_payment_account_id = COALESCE(acquisition_payment_account_id, v_pay),
         updated_at = NOW()
   WHERE id = p_asset_id;

  RETURN jsonb_build_object('ok', TRUE, 'entry_id', v_entry, 'amount', v_asset.purchase_cost);
END;
$function$;

-- ─── (٣) الحارس الحاسم: لا إهلاك لأصل لم يُثبت دفترياً ─────────────────────
CREATE OR REPLACE FUNCTION public.fn_guard_asset_activation_requires_capitalisation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'active' AND COALESCE(OLD.status, '') <> 'active' THEN
    IF NEW.acquisition_journal_entry_id IS NULL
       AND NOT (COALESCE(NEW.acquisition_source, '') = 'bill' AND NEW.source_bill_id IS NOT NULL) THEN
      RAISE EXCEPTION 'ASSET_NOT_CAPITALISED: لا يمكن تفعيل الأصل قبل إثباته دفترياً — إمّا اربطه بفاتورة الشراء التى اقتُنى بها، أو رحّل قيد الاقتناء من شاشة الأصل. بدون ذلك يُرحَّل الإهلاك على أصل غير موجود فى الدفاتر. | An asset cannot be activated before it is capitalised: link it to the purchase bill it came from, or post its acquisition entry. Otherwise depreciation would post against an asset the books never recorded.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_asset_activation_requires_capitalisation ON fixed_assets;
CREATE TRIGGER trg_asset_activation_requires_capitalisation
BEFORE UPDATE OF status ON public.fixed_assets
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_asset_activation_requires_capitalisation();

-- بروفة على قاعدة الاختبار (ثم rollback) — خمس نتائج:
--   تفعيل قبل الإثبات: رُفض ✓ · الاقتناء: مدين 100,000 / دائن 100,000 ✓
--   نداء مكرر: أعاد نفس القيد ✓ · تفعيل بعد الإثبات: مرّ ✓
--   أصل من فاتورة: رُفض ✓ (لا ازدواج)

-- ─── (٤) إضافات الأصل: الحساب المقابل لم يعد مثبّتاً ───────────────────────
-- كان نصّها: "CREDIT: Bank/Cash (Hardcoded for prototype)" على «1110» —
-- فأى إضافة مموّلة من البنك أو على حساب مورد كانت تُخصم من الخزنة. وبلا
-- فرع ولا بوابة ترحيل ولا تحقق فترة ولا حارس صلاحية شركة.
CREATE OR REPLACE FUNCTION public.register_asset_addition(
  p_asset_id uuid, p_amount numeric, p_date date, p_description text, p_user_id uuid,
  p_payment_account_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE v_asset RECORD; v_journal_id uuid; v_transaction_id uuid; v_pay uuid;
BEGIN
  SELECT * INTO v_asset FROM fixed_assets WHERE id = p_asset_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ASSET_NOT_FOUND'; END IF;
  PERFORM public.assert_company_access(v_asset.company_id);

  IF COALESCE(p_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'ADDITION_AMOUNT_INVALID: قيمة الإضافة يجب أن تكون موجبة. | The addition amount must be positive.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_pay := COALESCE(p_payment_account_id, v_asset.acquisition_payment_account_id);
  IF v_pay IS NULL THEN
    RAISE EXCEPTION 'ADDITION_PAYMENT_ACCOUNT_MISSING: حدّد حساب سداد الإضافة (خزنة/بنك/مورد). | Specify the account funding this addition (cash, bank or supplier).'
      USING ERRCODE = 'check_violation';
  END IF;

  IF to_regprocedure('public.validate_transaction_period(uuid,date)') IS NOT NULL THEN
    PERFORM public.validate_transaction_period(v_asset.company_id, p_date);
  END IF;

  PERFORM set_config('app.allow_direct_post', 'true', true);

  INSERT INTO journal_entries (company_id, branch_id, cost_center_id, entry_date, description,
                               reference_type, reference_id, status, posted_by, posted_at)
  VALUES (v_asset.company_id, v_asset.branch_id, v_asset.cost_center_id, p_date,
          'إضافة رأسمالية على أصل - ' || v_asset.name || COALESCE(' - ' || p_description, ''),
          'asset_addition', p_asset_id, 'posted', p_user_id, NOW())
  RETURNING id INTO v_journal_id;

  INSERT INTO journal_entry_lines (journal_entry_id, account_id, description,
                                   debit_amount, credit_amount, branch_id, cost_center_id)
  VALUES
    (v_journal_id, v_asset.asset_account_id, 'إضافة على أصل - ' || v_asset.name,
     p_amount, 0, v_asset.branch_id, v_asset.cost_center_id),
    (v_journal_id, v_pay, 'سداد قيمة الإضافة', 0, p_amount,
     v_asset.branch_id, v_asset.cost_center_id);

  PERFORM set_config('app.allow_direct_post', 'false', true);

  INSERT INTO asset_transactions (company_id, asset_id, transaction_type, transaction_date,
                                  amount, reference_id, reference_type, details, created_by)
  VALUES (v_asset.company_id, p_asset_id, 'addition', p_date, p_amount, v_journal_id,
          'journal_entry', jsonb_build_object('description', p_description), p_user_id)
  RETURNING id INTO v_transaction_id;

  UPDATE fixed_assets
     SET purchase_cost = purchase_cost + p_amount,
         book_value = COALESCE(book_value, 0) + p_amount,
         updated_at = NOW()
   WHERE id = p_asset_id;

  PERFORM regenerate_asset_schedules(p_asset_id);
  RETURN v_transaction_id;
END;
$function$;

-- ─── (٥) إبطال مسار المسحوبات القديم ───────────────────────────────────────
-- `record_shareholder_drawing_atomic` كانت تُدخل السحب بحالة 'posted' فوراً:
-- بلا اعتماد، بلا حارس دور، بلا فحص سحب على المكشوف، بلا فصل مهام — أى
-- التفاف كامل على المسار الحى (مسودة ← اعتماد بدور ← فحص رصيد ← ترحيل).
-- لا تستدعيها أى شاشة اليوم، لكنها تبقى قابلة للنداء. تُستبدل برسالة صريحة.
CREATE OR REPLACE FUNCTION public.record_shareholder_drawing_atomic(
  p_company_id uuid, p_shareholder_id uuid, p_amount numeric, p_drawing_date date,
  p_payment_account_id uuid, p_drawings_account_id uuid, p_description text DEFAULT NULL,
  p_branch_id uuid DEFAULT NULL, p_cost_center_id uuid DEFAULT NULL, p_user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  RAISE EXCEPTION 'DEPRECATED_DRAWING_PATH: هذا المسار كان يُرحّل المسحوبات فوراً بلا اعتماد ولا فحص رصيد ولا فصل مهام — سجّل المسحوبة من شاشة المسحوبات لتمر بدورة الاعتماد. | This legacy path posted drawings immediately with no approval, no cash-balance check and no segregation of duties; record the drawing from the drawings screen so it goes through the approval cycle.'
    USING ERRCODE = 'check_violation';
END;
$function$;

-- **البيانات**: صفر أصول ثابتة وصفر مسحوبات فى الإنتاج ⇒ لا شىء تاريخى
-- يحتاج تصحيحاً. الإصلاح كله وقائى، يصل قبل أول أصل حقيقى وأول مسحوبة.
