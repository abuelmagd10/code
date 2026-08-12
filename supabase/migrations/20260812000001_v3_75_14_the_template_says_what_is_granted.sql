-- ═══════════════════════════════════════════════════════════════════════════
-- v3.75.14 — **والقالبُ يقولُ ما يُمنَحُ فعلاً**
-- ═══════════════════════════════════════════════════════════════════════════
-- وصفةُ الشركةِ الجديدةِ مكتوبةٌ فى مكانَين: **قالبٌ مُعلَنٌ** فى جدولَى
-- `permissions` و`role_default_permissions`، و**تِسعُ دوالِّ بذرٍ مكتوبةٍ بيد**.
-- والبذّارُ اليدوىُّ يسبق، والقالبُ يملأُ الفراغَ بعده (`DO NOTHING` منذ v3.75.9).
--
-- فوُلِدت شركةٌ حقيقيّةٌ فى معاملةٍ أُلغيت، ثمّ مُحِيَت صفوفُها وشُغِّل **القالبُ
-- وحدَه**، وقُورن الاثنان صفّاً بصفٍّ وعلَماً بعلَم. والنتيجة:
--
--   • المولودُ ينالُ **٢٥٧** صفّاً · **١١** وظيفةً · **٥٤** مورداً.
--   • والقالبُ وحدَه ينتجُ **٢٠٢** — يجهلُ **٥٥ زوجاً**، وفيها **أربعُ وظائفَ
--     كاملة**: booking_officer · hr_officer · manufacturing_officer · purchasing_officer.
--   • وفى **٢٥ زوجاً يعرفُهما الاثنان اختلفَ الحكم**.
--
-- ═══ والأخطرُ أنّ الاختلافَ فى اتّجاهَين ═══
--
-- فى **١٣ زوجاً القالبُ أسخى من الواقع**، ومنها اثنا عشرَ لـ`manager` — **مديرِ
-- الفرع**. فالقالبُ يقولُ إنّه يُنشئ ويعدّل **ويحذف** الفواتيرَ وفواتيرَ الشراءِ
-- والمدفوعاتِ وأوامرَ الشراءِ والموردينَ والمنتجات؛ والواقعُ يعطيه **العرضَ فقط**.
-- وتعليقُ المشروعِ نفسِه فى شاشةِ الاعتمادات يقول: «مدير الفرع: اطّلاعٌ واسعٌ
-- وقراءةٌ فى أغلبِ المواضع». **فالقالبُ يخالفُ ما يقولُه المشروعُ عن نفسِه.**
--
-- ولم يظهرْ أثرُه حتّى اليوم لأنّ البذّارَ اليدوىَّ يسبقُه و`DO NOTHING` تحميه.
-- لكنّه **ليس نائماً بل مؤجَّلاً**: أىُّ زوجٍ ناقصٍ يُملأُ من القالب — فيُمنحُ
-- مديرُ الفرعِ إنشاءَ الفواتيرِ وحذفَها بلا أن يقرّرَ ذلك أحد.
-- **وقالبٌ يمنحُ أكثرَ ممّا يمنحُه الواقعُ قنبلةٌ موقوتة.**
--
-- ═══ والعلاجُ أن يُنقَلَ الواقعُ إلى القالبِ لا أن يُخترَعَ قالبٌ جديد ═══
--
-- كلُّ صفٍّ هنا **مشتقٌّ من الولادةِ المقيسة**، لا من رأى. فما تفعلُه الدوالُّ
-- التسعُ يُكتَبُ بياناً، ويُنزَعُ من القالبِ ما لا تفعلُه.
--
-- ولا يُمَسُّ `allowed_actions` الدقيق: **فحصُ الصلاحيّةِ يقرؤه حيّاً**
-- (`check_permission` و`can_approve`)، والأفعالُ التفصيليّةُ تبقى للبذّار.
-- المضبوطُ هنا هى الأعلامُ الخمسةُ التى يُبنى عليها الحكم.
--
-- **ولا صفَّ بياناتٍ لشركةٍ قائمةٍ يُلمَس.**
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ (١) بيتُ الصلاحيّاتِ يتّسعُ لِما يُمنَحُ فعلاً ═══
-- ثلاثةٌ وسبعون فعلاً كانت تُمنَحُ للشركاتِ ولا يعرفُها الكتالوج، فى عشرين مورداً.
-- **والقيدُ الذى وُلد فى v3.75.13 أمسكَ سبعةً منها وأنا أكتبُ هذه الهجرة**: حاولتُ
-- أن أكتبَ فى القالبِ `banking:update` فرفضتْه القاعدةُ لأنّه لا بيتَ له. فالحارسُ
-- الذى بُنى بالأمسِ حرسَ كاتبَه اليوم.
-- **والعناوينُ تُشتقُّ بقاعدةٍ واحدةٍ** لا تُكتبُ ستّاً وستّين مرّة.
INSERT INTO public.permissions (action, resource, category, title_ar, title_en, is_dangerous)
SELECT r.res || ':' || v.verb, r.res, r.cat,
       CASE v.verb
         WHEN 'access' THEN 'الوصول ل' || CASE WHEN r.ar LIKE 'ال%' THEN substr(r.ar, 2) ELSE r.ar END
         WHEN 'read'   THEN 'عرض '   || r.ar
         WHEN 'create' THEN 'إنشاء ' || r.ar
         WHEN 'update' THEN 'تعديل ' || r.ar
         WHEN 'delete' THEN 'حذف '   || r.ar END,
       CASE v.verb
         WHEN 'access' THEN 'Access ' WHEN 'read' THEN 'View ' WHEN 'create' THEN 'Create '
         WHEN 'update' THEN 'Update ' WHEN 'delete' THEN 'Delete ' END || r.en,
       (v.verb = 'delete')
FROM (VALUES
  ('approvals', 'organization', 'الاعتمادات', 'Approvals', 'access,create,read,update'),
  ('attendance', 'hr', 'الحضور', 'Attendance', 'delete'),
  ('banking', 'accounting', 'البنوك', 'Banking', 'delete,update'),
  ('inventory', 'inventory', 'المخزون', 'Inventory', 'create,delete,update'),
  ('write_offs', 'inventory', 'الإهلاكات', 'Write-offs', 'delete,update'),
  ('bookings', 'sales', 'الحجوزات', 'Bookings', 'access,create,delete,read,update'),
  ('customer_credits', 'sales', 'أرصدة العملاء الدائنة', 'Customer Credits', 'access,create,delete,read,update'),
  ('customer_refund_requests', 'sales', 'طلبات استرداد العملاء', 'Customer Refund Requests', 'access,read'),
  ('dispatch_approvals', 'inventory', 'اعتمادات إخراج المخزون', 'Dispatch Approvals', 'access,create,delete,read,update'),
  ('expenses', 'accounting', 'المصروفات', 'Expenses', 'access,create,delete,read,update'),
  ('financial_reports', 'accounting', 'التقارير المالية', 'Financial Reports', 'access,read'),
  ('inventory_goods_receipt', 'inventory', 'استلام البضائع', 'Goods Receipt', 'access,create,delete,read,update'),
  ('inventory_transfers', 'inventory', 'تحويلات المخزون', 'Inventory Transfers', 'access,create,delete,read,update'),
  ('manufacturing_boms', 'inventory', 'قوائم مكوّنات التصنيع', 'Manufacturing BOMs', 'access,create,delete,read,update'),
  ('payroll', 'hr', 'الرواتب', 'Payroll', 'delete,update'),
  ('production_labour_wages', 'hr', 'أجور عمالة الإنتاج', 'Production Labour Wages', 'access,create,read,update'),
  ('sales_return_requests', 'sales', 'طلبات مرتجع المبيعات', 'Sales Return Requests', 'access,create,read,update'),
  ('services', 'sales', 'الخدمات', 'Services', 'access,create,read,update'),
  ('third_party_inventory', 'inventory', 'بضائع لدى الغير', 'Third-Party Inventory', 'access,create,delete,read,update'),
  ('vendor_payment_correction_requests', 'purchases', 'طلبات تصحيح مدفوعات الموردين', 'Vendor Payment Correction Requests', 'access,create,read')
) AS r(res, cat, ar, en, verbs_csv)
CROSS JOIN LATERAL unnest(string_to_array(r.verbs_csv, ',')) AS v(verb)
ON CONFLICT (action) DO NOTHING;

-- ═══ (٢) ويُنزَعُ من القالبِ ما لا يمنحُه الواقع ═══
-- **وقالبٌ يمنحُ أكثرَ ممّا يمنحُه الواقعُ قنبلةٌ موقوتة.** سبعةٌ وثلاثون منحاً،
-- خمسةٌ وثلاثون منها لمديرِ الفرع.
DELETE FROM public.role_default_permissions d
USING (
  SELECT x.role, x.res || ':' || v.verb AS action
  FROM (VALUES
  ('accountant', 'banking', 'update,delete', ''),
  ('accountant', 'customers', '', 'create,update'),
  ('accountant', 'inventory', 'create,update,delete', ''),
  ('accountant', 'payments', 'delete', ''),
  ('accountant', 'purchase_returns', 'delete', ''),
  ('accountant', 'sales_returns', 'delete', ''),
  ('accountant', 'write_offs', 'create,update,delete', ''),
  ('manager', 'banking', '', 'create'),
  ('manager', 'bills', '', 'create,update,delete'),
  ('manager', 'customers', '', 'create,update,delete'),
  ('manager', 'estimates', '', 'create,update,delete'),
  ('manager', 'invoices', '', 'create,update,delete'),
  ('manager', 'payments', '', 'create,update,delete'),
  ('manager', 'products', '', 'create,update,delete'),
  ('manager', 'purchase_orders', '', 'create,update,delete'),
  ('manager', 'purchase_returns', '', 'create,update,delete'),
  ('manager', 'sales_orders', '', 'create,update,delete'),
  ('manager', 'sales_returns', '', 'create,update,delete'),
  ('manager', 'suppliers', '', 'create,update,delete'),
  ('manager', 'write_offs', '', 'create'),
  ('staff', 'customers', 'delete', ''),
  ('staff', 'estimates', 'delete', ''),
  ('staff', 'sales_orders', 'delete', ''),
  ('store_manager', 'inventory', 'create,update,delete', ''),
  ('store_manager', 'write_offs', 'update', '')
  ) AS x(role, res, missing_csv, over_csv)
  CROSS JOIN LATERAL unnest(string_to_array(x.over_csv, ',')) AS v(verb)
  WHERE x.over_csv <> ''
) AS gone
WHERE d.role_name = gone.role AND d.permission_action = gone.action;

-- ═══ (٣) ويُكتَبُ فيه ما يمنحُه الواقعُ ولا يقولُه ═══
-- خمسةٌ وخمسون زوجاً غائباً كليّاً (منها أربعُ وظائفَ لا يعرفُها القالبُ أصلاً)،
-- ومعها ما نقصَ فى الأزواجِ الخمسةِ والعشرينَ المختلفة.
INSERT INTO public.role_default_permissions (role_name, permission_action)
SELECT s.role, s.res || ':' || v.verb
FROM (VALUES
  ('accountant', 'customer_credits', 'access,read,create,update,delete'),
  ('accountant', 'customer_refund_requests', 'access,read'),
  ('accountant', 'dispatch_approvals', 'access,read'),
  ('accountant', 'expenses', 'access,read,create,update,delete'),
  ('accountant', 'inventory_goods_receipt', 'access,read'),
  ('accountant', 'inventory_transfers', 'access,read,create,update,delete'),
  ('accountant', 'production_labour_wages', 'access,read'),
  ('accountant', 'sales_return_requests', 'access,read,create,update'),
  ('accountant', 'services', 'access,read'),
  ('accountant', 'third_party_inventory', 'access,read,create,update,delete'),
  ('accountant', 'vendor_payment_correction_requests', 'access,read,create'),
  ('admin', 'financial_reports', 'access,read'),
  ('booking_officer', 'bookings', 'access,read,create,update,delete'),
  ('booking_officer', 'customers', 'access,read,create,update,delete'),
  ('booking_officer', 'reports', 'access,read'),
  ('hr_officer', 'attendance', 'access,read,create,update,delete'),
  ('hr_officer', 'branches', 'access,read'),
  ('hr_officer', 'cost_centers', 'access,read'),
  ('hr_officer', 'dashboard', 'access,read'),
  ('hr_officer', 'employees', 'access,read,create,update,delete'),
  ('hr_officer', 'payroll', 'access,read,create,update,delete'),
  ('hr_officer', 'reports', 'access,read'),
  ('manager', 'approvals', 'access,read'),
  ('manager', 'bookings', 'access,read'),
  ('manager', 'customer_credits', 'access,read'),
  ('manager', 'dispatch_approvals', 'access,read'),
  ('manager', 'expenses', 'access,read'),
  ('manager', 'inventory_goods_receipt', 'access,read'),
  ('manager', 'inventory_transfers', 'access,read'),
  ('manager', 'manufacturing_boms', 'access,read'),
  ('manager', 'production_labour_wages', 'access,read'),
  ('manager', 'sales_return_requests', 'access,read'),
  ('manager', 'services', 'access,read'),
  ('manager', 'third_party_inventory', 'access,read'),
  ('manufacturing_officer', 'approvals', 'access,read,create,update'),
  ('manufacturing_officer', 'manufacturing_boms', 'access,read,create,update,delete'),
  ('manufacturing_officer', 'production_labour_wages', 'access,read,create,update'),
  ('manufacturing_officer', 'reports', 'access,read'),
  ('owner', 'financial_reports', 'access,read'),
  ('purchasing_officer', 'dispatch_approvals', 'access,read'),
  ('purchasing_officer', 'inventory_goods_receipt', 'access,read'),
  ('purchasing_officer', 'inventory', 'access,read'),
  ('purchasing_officer', 'products', 'access,read,create,update'),
  ('purchasing_officer', 'purchase_orders', 'access,read,create,update,delete'),
  ('purchasing_officer', 'purchase_returns', 'access,read,create,update'),
  ('purchasing_officer', 'reports', 'access,read'),
  ('purchasing_officer', 'services', 'access,read,create,update'),
  ('purchasing_officer', 'suppliers', 'access,read,create,update,delete'),
  ('store_manager', 'dispatch_approvals', 'access,read,create,update,delete'),
  ('store_manager', 'inventory_goods_receipt', 'access,read,create,update,delete'),
  ('store_manager', 'inventory_transfers', 'access,read,create,update,delete'),
  ('store_manager', 'purchase_returns', 'access,read,create,update'),
  ('store_manager', 'reports', 'access,read'),
  ('store_manager', 'sales_return_requests', 'access,read,create,update'),
  ('store_manager', 'third_party_inventory', 'access,read')
) AS s(role, res, verbs_csv)
CROSS JOIN LATERAL unnest(string_to_array(s.verbs_csv, ',')) AS v(verb)
ON CONFLICT (role_name, permission_action) DO NOTHING;

INSERT INTO public.role_default_permissions (role_name, permission_action)
SELECT x.role, x.res || ':' || v.verb
FROM (VALUES
  ('accountant', 'banking', 'update,delete', ''),
  ('accountant', 'customers', '', 'create,update'),
  ('accountant', 'inventory', 'create,update,delete', ''),
  ('accountant', 'payments', 'delete', ''),
  ('accountant', 'purchase_returns', 'delete', ''),
  ('accountant', 'sales_returns', 'delete', ''),
  ('accountant', 'write_offs', 'create,update,delete', ''),
  ('manager', 'banking', '', 'create'),
  ('manager', 'bills', '', 'create,update,delete'),
  ('manager', 'customers', '', 'create,update,delete'),
  ('manager', 'estimates', '', 'create,update,delete'),
  ('manager', 'invoices', '', 'create,update,delete'),
  ('manager', 'payments', '', 'create,update,delete'),
  ('manager', 'products', '', 'create,update,delete'),
  ('manager', 'purchase_orders', '', 'create,update,delete'),
  ('manager', 'purchase_returns', '', 'create,update,delete'),
  ('manager', 'sales_orders', '', 'create,update,delete'),
  ('manager', 'sales_returns', '', 'create,update,delete'),
  ('manager', 'suppliers', '', 'create,update,delete'),
  ('manager', 'write_offs', '', 'create'),
  ('staff', 'customers', 'delete', ''),
  ('staff', 'estimates', 'delete', ''),
  ('staff', 'sales_orders', 'delete', ''),
  ('store_manager', 'inventory', 'create,update,delete', ''),
  ('store_manager', 'write_offs', 'update', '')
) AS x(role, res, missing_csv, over_csv)
CROSS JOIN LATERAL unnest(string_to_array(x.missing_csv, ',')) AS v(verb)
WHERE x.missing_csv <> ''
ON CONFLICT (role_name, permission_action) DO NOTHING;

-- ═══ (٤) الفحصُ المرجعىّ — يُقاسُ بولادةٍ حقيقيّةٍ تُلغى، لا بعددٍ مكتوبٍ بيد ═══
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_14_check()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_co      public.companies%ROWTYPE;
  v_new     uuid;
  v_actual  text[];
  v_tpl     text[];
  v_over    text[];
  v_under   text[];
  v_ran     boolean := false;
BEGIN
  -- **ولا يُقرأُ فراغٌ ويُسمّى سلاماً**: بلا شركةٍ لا تُشتقُّ ولادة.
  IF NOT EXISTS (SELECT 1 FROM public.companies) THEN
    RAISE EXCEPTION 'BASELINE FAIL: لا شركةَ واحدةً فلا تُولَدُ ولادةُ القياس (v3.75.14)';
  END IF;

  BEGIN
    SELECT * INTO v_co FROM public.companies ORDER BY created_at LIMIT 1;
    v_new := gen_random_uuid();
    v_co.id := v_new;
    v_co.name := 'ZZ ولادة الفحص المرجعى v3.75.14';
    INSERT INTO public.companies VALUES (v_co.*);

    -- ما ينالُه المولودُ فعلاً (بذّارٌ يدوىٌّ ثمّ قالبٌ يملأُ الفراغ)
    SELECT array_agg(role || '|' || resource || '|' || concat_ws(',',
             CASE WHEN can_access THEN 'ac' END, CASE WHEN can_read   THEN 'r' END,
             CASE WHEN can_write  THEN 'c'  END, CASE WHEN can_update THEN 'u' END,
             CASE WHEN can_delete THEN 'd'  END)
           ORDER BY role, resource)
      INTO v_actual
      FROM public.company_role_permissions WHERE company_id = v_new;

    -- ثمّ يُمحى الأثرُ ويُشغَّلُ **القالبُ وحدَه**
    DELETE FROM public.company_role_permissions WHERE company_id = v_new;
    PERFORM public.copy_default_permissions_for_company(v_new);

    SELECT array_agg(role || '|' || resource || '|' || concat_ws(',',
             CASE WHEN can_access THEN 'ac' END, CASE WHEN can_read   THEN 'r' END,
             CASE WHEN can_write  THEN 'c'  END, CASE WHEN can_update THEN 'u' END,
             CASE WHEN can_delete THEN 'd'  END)
           ORDER BY role, resource)
      INTO v_tpl
      FROM public.company_role_permissions WHERE company_id = v_new;

    SELECT array_agg(x ORDER BY x) INTO v_over
      FROM (SELECT unnest(coalesce(v_tpl, '{}'::text[])) EXCEPT SELECT unnest(coalesce(v_actual, '{}'::text[]))) z(x);
    SELECT array_agg(x ORDER BY x) INTO v_under
      FROM (SELECT unnest(coalesce(v_actual, '{}'::text[])) EXCEPT SELECT unnest(coalesce(v_tpl, '{}'::text[]))) z(x);
    v_ran := true;
    RAISE EXCEPTION 'ZZ_UNDO_V37514';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM <> 'ZZ_UNDO_V37514' THEN RAISE; END IF;
  END;

  -- **وفخٌّ لا يُشغَّل ليس فخّاً**
  IF NOT v_ran THEN
    RAISE EXCEPTION 'BASELINE FAIL: لم تُشغَّلْ ولادةُ القياسِ أصلاً (v3.75.14)';
  END IF;
  IF v_actual IS NULL OR array_length(v_actual, 1) = 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: مولودٌ بلا صلاحيّاتٍ إطلاقاً — بحثٌ لا يجد ليس دليلَ غياب (v3.75.14)';
  END IF;

  -- **وقالبٌ يمنحُ أكثرَ ممّا يمنحُه الواقعُ قنبلةٌ موقوتة**
  IF v_over IS NOT NULL AND array_length(v_over, 1) > 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: القالبُ أسخى من الواقعِ فى % موضعاً: % (v3.75.14)',
      array_length(v_over, 1), array_to_string(v_over[1:8], ' · ');
  END IF;

  -- وما يمنحُه الواقعُ يجب أن يقولَه القالب
  IF v_under IS NOT NULL AND array_length(v_under, 1) > 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: القالبُ يجهلُ % ممّا يناله المولود: % (v3.75.14)',
      array_length(v_under, 1), array_to_string(v_under[1:8], ' · ');
  END IF;

  -- **ولا يُصدَّقُ المقياسُ حتّى يُكادَ له**: يُصطنَعُ اختلافٌ فيجب أن يُرى.
  IF NOT EXISTS (
    SELECT 1 FROM (SELECT unnest(ARRAY['manager|invoices|ac,r,c']) EXCEPT
                   SELECT unnest(ARRAY['manager|invoices|ac,r'])) z(x)
  ) THEN
    RAISE EXCEPTION 'BASELINE FAIL: المقياسُ لا يرى الاختلافَ حتّى حين يُصطنَع (v3.75.14)';
  END IF;
  -- **ولا يصرخُ على البرىء**: المتطابقانِ لا يُعدّانِ اختلافاً.
  IF EXISTS (
    SELECT 1 FROM (SELECT unnest(ARRAY['manager|invoices|ac,r']) EXCEPT
                   SELECT unnest(ARRAY['manager|invoices|ac,r'])) z(x)
  ) THEN
    RAISE EXCEPTION 'BASELINE FAIL: المقياسُ يصرخُ على متطابقَين (v3.75.14)';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_14_check() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_14_check() FROM anon;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_14_check() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.assert_baseline_v3_75_14_check() TO service_role;
