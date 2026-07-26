-- ============================================================================
-- v3.74.843 — تسجيل العامل المؤقت بدالة ذرية (الكتابة ممنوعة من المتصفح)
-- ============================================================================
-- جدول `casual_workers` مسحوبة منه صلاحيات الكتابة من المتصفح (٨٤١)، فالشاشة
-- تحتاج دالة لتسجيل العامل. وهى تفرض ما لا تفرضه الشاشة:
--   • الدور: مسؤول التصنيع أو المدير أو المالك — لا أى مستخدم.
--   • الاسم غير فارغ.
--   • ورسالة عربية عند التكرار بدل خطأ فهرس خام: «اختره من القائمة بدل تكراره».
--
-- والتعريف يُلحَق أدناه **من القاعدة الحيّة** فى سكربت النشر (درس ٨٣٤).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.plw_upsert_casual_worker(p_company_id uuid, p_name text, p_phone text DEFAULT NULL::text, p_national_id text DEFAULT NULL::text, p_branch_id uuid DEFAULT NULL::uuid, p_worker_id uuid DEFAULT NULL::uuid, p_is_active boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_role TEXT; v_id UUID; v_name TEXT := btrim(COALESCE(p_name,''));
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  v_role := public.plw_caller_role(p_company_id);
  IF v_role NOT IN ('owner','admin','manager','manufacturing_officer','service') THEN
    RAISE EXCEPTION 'لا تملك صلاحية إدارة سجل العمالة المؤقتة. | Not permitted to manage the casual worker register.'
      USING ERRCODE='check_violation';
  END IF;
  IF v_name = '' THEN
    RAISE EXCEPTION 'اكتب اسم العامل. | Enter the worker''s name.' USING ERRCODE='check_violation';
  END IF;

  IF p_worker_id IS NOT NULL THEN
    UPDATE public.casual_workers
       SET name = v_name, phone = NULLIF(btrim(COALESCE(p_phone,'')),''),
           national_id = NULLIF(btrim(COALESCE(p_national_id,'')),''),
           branch_id = p_branch_id, is_active = COALESCE(p_is_active, TRUE), updated_at = NOW()
     WHERE id = p_worker_id AND company_id = p_company_id
     RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'العامل غير موجود. | Worker not found.' USING ERRCODE='check_violation';
    END IF;
  ELSE
    INSERT INTO public.casual_workers (company_id, branch_id, name, phone, national_id, is_active, created_by)
    VALUES (p_company_id, p_branch_id, v_name,
            NULLIF(btrim(COALESCE(p_phone,'')),''), NULLIF(btrim(COALESCE(p_national_id,'')),''),
            COALESCE(p_is_active, TRUE), auth.uid())
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'يوجد عامل بنفس الاسم والهاتف بالفعل — اختره من القائمة بدل تكراره. | A worker with the same name and phone already exists.'
    USING ERRCODE='check_violation';
END;
$function$;
