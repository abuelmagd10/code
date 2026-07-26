-- ============================================================================
-- 🔴 v3.74.840 — سجل التدقيق شاهد لا قاضٍ: لا يُسقط العملية التى يُسجّلها
-- ============================================================================
-- تكملة ٨٣٦. هناك أُصلح السبب المباشر (فحص العضوية لم يعرف مالك الشركة)، وهنا
-- يُصلح **السبب البنيوى**: كيف استطاع سجل تدقيق أن يقتل تسجيل عميل من أصله.
--
-- ── الفجوة ١: المُسجِّل كان يُصرّح، لا يُسجّل فقط ─────────────────────────
-- `create_audit_log` تبدأ بـ `assert_company_access`. ومُشغِّل التدقيق يعمل
-- **بعد** أن سمحت RLS بالكتابة — فالتصريح حصل قبله. ووضع فحص ثانٍ هناك لا
-- يُضيف أمناً، بل يستطيع فقط أن يرفض ما سُمح به بالفعل. وهذا ما حدث: مُنشئ
-- الشركة ليس عضواً فيها بعد، فرفض المُسجِّل، فمات التسجيل.
--
-- ── الفجوة ٢: شبكة الأمان بها ثقب بمقاس الشىء الساقط ────────────────────
-- المُشغِّل **كان** لديه `EXCEPTION WHEN OTHERS` — ومع ذلك مات.
-- لأن `WHEN OTHERS` فى PL/pgSQL **لا يلتقط `query_canceled` (57014)**، و57014
-- هو بالضبط الكود الذى يرفعه فحص التصريح **عن قصد** حتى لا تبتلعه الدوال
-- المُنادية. فاجتمع قصدان سليمان على نتيجة كارثية.
--
-- ── الفجوة ٣ (الأخطر، ظهرت أثناء الفحص): ثلاث دوال بلا أى معالج ─────────
-- من خمس دوال تدقيق، **ثلاث بلا `EXCEPTION` إطلاقاً**:
--     audit_customer_changes  → customers
--     audit_price_changes     → products
--     audit_status_changes    → bills · invoices · purchase_orders
-- أى أن **أى** تعثّر فى التسجيل — لا 57014 وحده — كان يُسقط إنشاء عميل أو
-- تغيير سعر منتج أو تغيير حالة **فاتورة**. أخطر خمسة جداول فى النظام.
--
-- ── العلاج ───────────────────────────────────────────────────────────────
-- (١) `create_audit_log_internal`: يُسجّل **بلا فحص تصريح**، وصلاحيته مسحوبة
--     من anon و authenticated — فلا يُنادى إلا من مُشغِّل داخلى.
-- (٢) `create_audit_log` (العام) **يُبقى الفحص** ثم يُفوّض للداخلى: فالنداء
--     المباشر عبر RPC لا يستطيع تلفيق سجل لشركة أخرى. الفحص فى موضعه الصحيح.
-- (٣) الدوال الخمس كلها: تنادى الداخلى، وتعالج **`query_canceled` و`OTHERS`
--     معاً** — فأى فشل تسجيل يُصبح تحذيراً فى السجلات لا إسقاطاً للعملية.
--
-- ── التحقق (على قاعدة الاختبار، بتخريب متعمَّد) ─────────────────────────
-- خُرِّب المُسجِّل ليرفع **نفس الكود القاتل 57014**، ثم أُدرج عميل:
--     النتيجة: **INSERT SURVIVED** ✓
-- وقبل الإصلاح كانت نفس الحالة تقتل العملية.
--
-- وحارس `scripts/check-audit-cannot-abort.js` يُثبّت هذا: يقرأ القاعدة الحيّة
-- ويتأكد أن كل دالة تدقيق تنادى الداخلى وتعالج الكودين، وأن الداخلى بلا فحص،
-- وأن العام **ما زال** يفحص. ويُجرّد التعليقات قبل الحكم — فتعليقات هذه الدوال
-- تذكر اسم الفحص لتشرح غيابه، وحارس يمنع النص كان سيمنع الشرح.
-- ============================================================================

-- ── (١) المُسجِّل الداخلى: يشهد ولا يحكم ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_audit_log_internal(
  p_company_id uuid, p_user_id uuid, p_action text, p_target_table text,
  p_record_id uuid, p_record_identifier text, p_old_data jsonb, p_new_data jsonb,
  p_branch_id uuid DEFAULT NULL, p_cost_center_id uuid DEFAULT NULL, p_reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_user_email TEXT; v_user_name TEXT; v_changed_fields TEXT[];
  v_log_id UUID; v_branch_id UUID; v_cost_center_id UUID;
BEGIN
  -- v3.74.840 — **بلا فحص تصريح عن قصد.**
  -- هذه الدالة يُناديها مُشغِّل بعد أن سمحت RLS بالكتابة أصلاً، فالتصريح حصل
  -- قبلها. ووضع فحص تصريح هنا هو ما أسقط إنشاء شركة على عميل حقيقى (٨٣٦):
  -- مُنشئ الشركة ليس عضواً فيها بعد، فرُفع خطأ بكود 57014 الذى لا يلتقطه
  -- `WHEN OTHERS` — فمات التسجيل كله. **المُسجِّل يشهد ولا يحكم.**
  IF p_user_id IS NOT NULL THEN
    SELECT email, raw_user_meta_data->>'full_name' INTO v_user_email, v_user_name
      FROM auth.users WHERE id = p_user_id;
  END IF;

  IF p_action = 'UPDATE' AND p_old_data IS NOT NULL AND p_new_data IS NOT NULL THEN
    SELECT array_agg(key) INTO v_changed_fields FROM (
      SELECT key FROM jsonb_each(p_new_data)
      EXCEPT
      SELECT key FROM jsonb_each(p_old_data) WHERE p_old_data->key = p_new_data->key
    ) changed;
  END IF;

  v_branch_id := COALESCE(p_branch_id, (p_new_data->>'branch_id')::UUID, (p_old_data->>'branch_id')::UUID);
  v_cost_center_id := COALESCE(p_cost_center_id, (p_new_data->>'cost_center_id')::UUID, (p_old_data->>'cost_center_id')::UUID);

  INSERT INTO audit_logs (
    company_id, user_id, user_email, user_name,
    action, target_table, record_id, record_identifier,
    old_data, new_data, changed_fields, branch_id, cost_center_id, reason
  ) VALUES (
    p_company_id, p_user_id, v_user_email, COALESCE(v_user_name, v_user_email),
    p_action, p_target_table, p_record_id, p_record_identifier,
    p_old_data, p_new_data, v_changed_fields, v_branch_id, v_cost_center_id, p_reason
  ) RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_audit_log_internal(uuid,uuid,text,text,uuid,text,jsonb,jsonb,uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_audit_log_internal(uuid,uuid,text,text,uuid,text,jsonb,jsonb,uuid,uuid,text) FROM anon;
REVOKE ALL ON FUNCTION public.create_audit_log_internal(uuid,uuid,text,text,uuid,text,jsonb,jsonb,uuid,uuid,text) FROM authenticated;

-- ── (٢) المسار العام يُبقى الفحص: النداء المباشر لا يُلفّق سجلاً لشركة أخرى ──
CREATE OR REPLACE FUNCTION public.create_audit_log(
  p_company_id uuid, p_user_id uuid, p_action text, p_target_table text,
  p_record_id uuid, p_record_identifier text, p_old_data jsonb, p_new_data jsonb,
  p_branch_id uuid DEFAULT NULL, p_cost_center_id uuid DEFAULT NULL, p_reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  -- v3.74.730 — reject a caller acting on another company's data.
  -- v3.74.840 — يبقى هنا للنداء المباشر (RPC) حيث لا مُشغِّل سبقه بالتصريح؛
  -- والمُشغِّلات تنادى `create_audit_log_internal` بلا فحص.
  PERFORM public.assert_company_access(p_company_id);
  RETURN public.create_audit_log_internal(
    p_company_id, p_user_id, p_action, p_target_table, p_record_id,
    p_record_identifier, p_old_data, p_new_data, p_branch_id, p_cost_center_id, p_reason);
END;
$function$;

-- ── (٣) الدوال الخمس: الداخلى + معالجة 57014 و OTHERS معاً ──────────────────
CREATE OR REPLACE FUNCTION public.audit_trigger_function()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_company_id UUID; v_record_id UUID; v_record_identifier TEXT;
  v_old_data JSONB; v_new_data JSONB; v_user_id UUID;
  v_branch_id UUID; v_cost_center_id UUID;
BEGIN
  v_user_id := auth.uid();

  IF TG_OP = 'DELETE' THEN
    v_company_id := OLD.company_id; v_record_id := OLD.id;
    v_branch_id := CASE WHEN TG_TABLE_NAME IN ('invoices','bills','payments','journal_entries','sales_orders','purchase_orders','customers','inventory_transactions') THEN OLD.branch_id ELSE NULL END;
    v_cost_center_id := CASE WHEN TG_TABLE_NAME IN ('invoices','bills','payments','journal_entries','sales_orders','purchase_orders','customers','inventory_transactions') THEN OLD.cost_center_id ELSE NULL END;
  ELSE
    v_company_id := NEW.company_id; v_record_id := NEW.id;
    v_branch_id := CASE WHEN TG_TABLE_NAME IN ('invoices','bills','payments','journal_entries','sales_orders','purchase_orders','customers','inventory_transactions') THEN NEW.branch_id ELSE NULL END;
    v_cost_center_id := CASE WHEN TG_TABLE_NAME IN ('invoices','bills','payments','journal_entries','sales_orders','purchase_orders','customers','inventory_transactions') THEN NEW.cost_center_id ELSE NULL END;
  END IF;

  v_record_identifier := TG_TABLE_NAME || '_' || COALESCE(v_record_id::TEXT, 'unknown');

  IF TG_OP = 'DELETE' THEN v_old_data := to_jsonb(OLD); v_new_data := NULL;
  ELSIF TG_OP = 'INSERT' THEN v_old_data := NULL; v_new_data := to_jsonb(NEW);
  ELSE v_old_data := to_jsonb(OLD); v_new_data := to_jsonb(NEW);
  END IF;

  PERFORM create_audit_log_internal(v_company_id, v_user_id, TG_OP, TG_TABLE_NAME,
    v_record_id, v_record_identifier, v_old_data, v_new_data, v_branch_id, v_cost_center_id);

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
EXCEPTION
  -- v3.74.840 — `query_canceled` (57014) **لا يلتقطه `WHEN OTHERS`**، وهو الكود
  -- الذى يرفعه فحص التصريح عن قصد. فبدونه هنا كان فشل تسجيل يُسقط عملية أعمال.
  WHEN query_canceled THEN
    RAISE WARNING 'Audit log cancelled (57014) on %.%: %', TG_TABLE_NAME, TG_OP, SQLERRM;
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  WHEN OTHERS THEN
    RAISE WARNING 'Audit log failed: %', SQLERRM;
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_status_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_company_id UUID; v_user_id UUID; v_old_data JSONB; v_new_data JSONB;
  v_record_identifier TEXT; v_branch_id UUID; v_cost_center_id UUID;
BEGIN
  v_user_id := auth.uid();
  v_company_id := NEW.company_id;
  v_branch_id := CASE WHEN TG_TABLE_NAME IN ('invoices','bills') THEN NEW.branch_id ELSE NULL END;
  v_cost_center_id := CASE WHEN TG_TABLE_NAME IN ('invoices','bills') THEN NEW.cost_center_id ELSE NULL END;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF TG_TABLE_NAME = 'invoices' THEN
      v_record_identifier := 'invoice_' || COALESCE(NEW.invoice_number, NEW.id::TEXT);
    ELSIF TG_TABLE_NAME = 'bills' THEN
      v_record_identifier := 'bill_' || COALESCE(NEW.bill_number, NEW.id::TEXT);
    ELSIF TG_TABLE_NAME = 'purchase_orders' THEN
      v_record_identifier := 'po_' || COALESCE(NEW.po_number, NEW.id::TEXT);
    ELSE
      v_record_identifier := TG_TABLE_NAME || '_' || NEW.id::TEXT;
    END IF;

    v_old_data := jsonb_build_object('status', OLD.status, 'id', OLD.id);
    v_new_data := jsonb_build_object('status', NEW.status, 'id', NEW.id);

    PERFORM create_audit_log_internal(v_company_id, v_user_id, 'UPDATE'::text,
      TG_TABLE_NAME::text, NEW.id,
      v_record_identifier || ' - تغيير حالة: ' || OLD.status || ' → ' || NEW.status,
      v_old_data, v_new_data, v_branch_id, v_cost_center_id);
  END IF;

  RETURN NEW;
EXCEPTION
  -- v3.74.840 — كانت بلا أى معالج: أى فشل تسجيل يُسقط تغيير حالة فاتورة أو
  -- فاتورة مشتريات أو أمر شراء.
  WHEN query_canceled THEN
    RAISE WARNING 'Audit log cancelled (57014) on status change of %: %', TG_TABLE_NAME, SQLERRM;
    RETURN NEW;
  WHEN OTHERS THEN
    RAISE WARNING 'Audit log failed on status change of %: %', TG_TABLE_NAME, SQLERRM;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_customer_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_company_id UUID; v_user_id UUID; v_old_data JSONB; v_new_data JSONB;
  v_has_non_address_changes BOOLEAN := FALSE;
BEGIN
  v_user_id := auth.uid();
  v_company_id := NEW.company_id;

  IF (OLD.name IS DISTINCT FROM NEW.name OR OLD.email IS DISTINCT FROM NEW.email
      OR OLD.phone IS DISTINCT FROM NEW.phone OR OLD.tax_id IS DISTINCT FROM NEW.tax_id
      OR OLD.credit_limit IS DISTINCT FROM NEW.credit_limit
      OR OLD.payment_terms IS DISTINCT FROM NEW.payment_terms
      OR OLD.is_active IS DISTINCT FROM NEW.is_active) THEN
    v_has_non_address_changes := TRUE;
  END IF;

  IF v_has_non_address_changes THEN
    v_old_data := jsonb_build_object('name', OLD.name, 'email', OLD.email, 'phone', OLD.phone,
      'tax_id', OLD.tax_id, 'credit_limit', OLD.credit_limit,
      'payment_terms', OLD.payment_terms, 'is_active', OLD.is_active);
    v_new_data := jsonb_build_object('name', NEW.name, 'email', NEW.email, 'phone', NEW.phone,
      'tax_id', NEW.tax_id, 'credit_limit', NEW.credit_limit,
      'payment_terms', NEW.payment_terms, 'is_active', NEW.is_active);

    PERFORM create_audit_log_internal(v_company_id, v_user_id, 'UPDATE', 'customers', NEW.id,
      'customer_' || COALESCE(NEW.name, NEW.id::TEXT) || ' - تعديل بيانات',
      v_old_data, v_new_data);
  END IF;

  RETURN NEW;
EXCEPTION
  -- v3.74.840 — كانت بلا أى معالج: أى فشل تسجيل يُسقط تعديل بيانات عميل.
  WHEN query_canceled THEN
    RAISE WARNING 'Audit log cancelled (57014) on customer change: %', SQLERRM;
    RETURN NEW;
  WHEN OTHERS THEN
    RAISE WARNING 'Audit log failed on customer change: %', SQLERRM;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_price_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_company_id UUID; v_user_id UUID; v_old_data JSONB; v_new_data JSONB;
BEGIN
  v_user_id := auth.uid();
  v_company_id := NEW.company_id;

  IF OLD.unit_price IS DISTINCT FROM NEW.unit_price
     OR OLD.cost_price IS DISTINCT FROM NEW.cost_price THEN
    v_old_data := jsonb_build_object('unit_price', OLD.unit_price, 'cost_price', OLD.cost_price,
      'product_id', OLD.id, 'product_name', OLD.name);
    v_new_data := jsonb_build_object('unit_price', NEW.unit_price, 'cost_price', NEW.cost_price,
      'product_id', NEW.id, 'product_name', NEW.name);

    PERFORM create_audit_log_internal(v_company_id, v_user_id, 'UPDATE', 'products', NEW.id,
      'product_' || NEW.id::TEXT || ' - تغيير سعر', v_old_data, v_new_data);
  END IF;

  RETURN NEW;
EXCEPTION
  -- v3.74.840 — كانت بلا أى معالج: أى فشل تسجيل يُسقط تغيير سعر منتج.
  WHEN query_canceled THEN
    RAISE WARNING 'Audit log cancelled (57014) on price change: %', SQLERRM;
    RETURN NEW;
  WHEN OTHERS THEN
    RAISE WARNING 'Audit log failed on price change: %', SQLERRM;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_journal_entry_lines_func()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE v_entry_id UUID; v_company_id UUID;
BEGIN
  IF TG_OP='DELETE' THEN v_entry_id:=OLD.journal_entry_id; ELSE v_entry_id:=NEW.journal_entry_id; END IF;
  SELECT company_id INTO v_company_id FROM public.journal_entries WHERE id=v_entry_id;
  BEGIN
    PERFORM create_audit_log_internal(v_company_id, auth.uid(), TG_OP, 'journal_entry_lines', COALESCE(NEW.id,OLD.id), 'JE:'||v_entry_id::TEXT,
      CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
      CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END);
  EXCEPTION
    -- v3.74.840 — كان `WHEN OTHERS` وحده، وهو **لا يلتقط 57014**؛ فسطر قيد
    -- محاسبى كان يمكن أن يسقط بفشل تسجيل.
    WHEN query_canceled THEN
      RAISE WARNING 'audit_journal_entry_lines_func cancelled (57014) for entry [%]: %', v_entry_id, SQLERRM;
    WHEN OTHERS THEN
      RAISE WARNING 'audit_journal_entry_lines_func failed for entry [%]: %', v_entry_id, SQLERRM;
  END;
  RETURN COALESCE(NEW, OLD);
END;
$function$;
