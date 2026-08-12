-- ═══════════════════════════════════════════════════════════════════════════
-- v3.75.15 — **والشاشةُ تقولُ الصدقَ عن صاحبِ البيت**
-- ═══════════════════════════════════════════════════════════════════════════
-- المالكُ والمديرُ العامُّ يتجاوزانِ جدولَ الصلاحيّاتِ كلَّه: دالّةُ الحكمِ
-- ترجعُ TRUE قبل أن تنظرَ إلى صفٍّ واحد. وقد قِيس حيّاً: مالكٌ بلا صفٍّ
-- للمصروفاتِ أُجيبَ بـ«نعم» للحذفِ والإنشاء، **بل ولموردٍ لا وجودَ له**.
-- فلا صفَّ يزيدُ قدرتَهما ولا ينقصُها — **والتغييرُ هنا محايدُ القدرةِ بالبرهان**.
--
-- لكنّ شاشةَ «صلاحيّات الأدوار» تقرأُ الصفوف. وأربعةَ عشرَ قسماً بلا صفٍّ
-- للمالكِ والمديرِ العام، فتعرضُهما الشاشةُ «وصولٌ وعرضٌ فقط» — **وهى تقولُ
-- عنهما ما ليس صحيحاً**. والأسوأُ أنّ ضغطةَ «حفظ» هناك تكتبُ تلك الجملةَ
-- الكاذبةَ فى البيانات.
--
-- ولا يُستدعى الناسخُ على الشركاتِ القائمة: قِيس أنّه كان سيضيفُ **١٠٣ صفوفٍ
-- لوظائفَ عاديّة** فى شركتَين — أى تغييرَ قدراتِ مستخدمين. **فالعلاجُ يقتصرُ
-- على الوظيفتَين اللتَين ثبتَ أنّ الصفوفَ لا تحكمُهما.**
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ (١) القالبُ يعرفُ صاحبَ البيت ═══
INSERT INTO public.role_default_permissions (role_name, permission_action)
SELECT r.role, p.action
FROM (VALUES ('owner'), ('admin')) AS r(role)
CROSS JOIN public.permissions p
WHERE p.resource IN (
  'approvals', 'bookings', 'customer_credits', 'customer_refund_requests',
  'dispatch_approvals', 'expenses', 'inventory_goods_receipt', 'inventory_transfers',
  'manufacturing_boms', 'production_labour_wages', 'sales_return_requests',
  'services', 'third_party_inventory', 'vendor_payment_correction_requests')
ON CONFLICT (role_name, permission_action) DO NOTHING;

-- ═══ (٢) والشركاتُ القائمةُ تُملأُ فراغُها — للوظيفتَين وحدَهما ═══
INSERT INTO public.company_role_permissions
  (company_id, role, resource, can_read, can_write, can_update, can_delete,
   all_access, can_access, allowed_actions)
SELECT c.id, d.role_name, split_part(d.permission_action, ':', 1),
       bool_or(d.permission_action LIKE '%:read'),
       bool_or(d.permission_action LIKE '%:create'),
       bool_or(d.permission_action LIKE '%:update'),
       bool_or(d.permission_action LIKE '%:delete'),
       true,
       bool_or(d.permission_action LIKE '%:access'),
       array_agg(d.permission_action ORDER BY d.permission_action)
FROM public.companies c
CROSS JOIN public.role_default_permissions d
WHERE d.role_name IN ('owner', 'admin')
GROUP BY c.id, d.role_name, split_part(d.permission_action, ':', 1)
ON CONFLICT (company_id, role, resource) DO NOTHING;

-- ═══ (٣) ولا يقولُ الصفُّ أقلَّ ممّا يستطيعُه صاحبُه ═══
-- **والتوسيعُ فقط لا التضييق** (`OR`): لا يُنزَعُ علَمٌ قائم. وما لا فعلَ له
-- فى الكتالوجِ لا يُمنَح: **فلا حذفَ لأجورِ عمالةِ الإنتاجِ لأنّه غيرُ معرَّفٍ
-- أصلاً — وسجلُّ أجرٍ مصروفٍ يُعكَسُ ولا يُمحى.**
UPDATE public.company_role_permissions p
SET can_access = p.can_access OR EXISTS (SELECT 1 FROM public.permissions x WHERE x.action = p.resource || ':access'),
    can_read   = p.can_read   OR EXISTS (SELECT 1 FROM public.permissions x WHERE x.action = p.resource || ':read'),
    can_write  = p.can_write  OR EXISTS (SELECT 1 FROM public.permissions x WHERE x.action = p.resource || ':create'),
    can_update = p.can_update OR EXISTS (SELECT 1 FROM public.permissions x WHERE x.action = p.resource || ':update'),
    can_delete = p.can_delete OR EXISTS (SELECT 1 FROM public.permissions x WHERE x.action = p.resource || ':delete')
WHERE p.role IN ('owner', 'admin');

INSERT INTO public.role_default_permissions (role_name, permission_action)
SELECT r.role, p.action
FROM (VALUES ('owner'), ('admin')) AS r(role)
CROSS JOIN public.permissions p
WHERE split_part(p.action, ':', 2) IN ('access', 'read', 'create', 'update', 'delete')
ON CONFLICT (role_name, permission_action) DO NOTHING;

-- ═══ (٤) الفحصُ المرجعىّ ═══
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_15_check()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_bad  int;
  v_ex   text;
  v_seen int;
  v_trap boolean := false;
BEGIN
  -- **ولا يُقرأُ فراغٌ ويُسمّى سلاماً**
  SELECT count(*) INTO v_seen FROM public.companies;
  IF v_seen = 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: لا شركةَ واحدة — بحثٌ لا يجد ليس دليلَ غياب (v3.75.15)';
  END IF;
  SELECT count(*) INTO v_seen FROM public.permissions;
  IF v_seen = 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: كتالوجُ الصلاحيّاتِ فارغ (v3.75.15)';
  END IF;

  -- ═══ لا يقولُ صفُّ المالكِ أو المديرِ العامِّ أقلَّ ممّا يستطيعُه ═══
  -- حكمُهما تجاوزٌ كامل، فأىُّ خانةٍ فارغةٍ على الشاشةِ **جملةٌ غيرُ صحيحة**.
  WITH need AS (
    SELECT c.id AS company_id, r.role, p.resource, split_part(p.action, ':', 2) AS verb
    FROM public.companies c
    CROSS JOIN (VALUES ('owner'), ('admin')) AS r(role)
    CROSS JOIN public.permissions p
    WHERE split_part(p.action, ':', 2) IN ('access','read','create','update','delete')
  )
  SELECT count(*), left(coalesce(string_agg(DISTINCT n.role || '.' || n.resource || ':' || n.verb, ' · '), ''), 200)
    INTO v_bad, v_ex
  FROM need n
  LEFT JOIN public.company_role_permissions p
         ON p.company_id = n.company_id AND p.role = n.role AND p.resource = n.resource
  WHERE p.company_id IS NULL
     OR NOT CASE n.verb
          WHEN 'access' THEN p.can_access WHEN 'read'   THEN p.can_read
          WHEN 'create' THEN p.can_write  WHEN 'update' THEN p.can_update
          WHEN 'delete' THEN p.can_delete END;

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: صفٌّ يقولُ أقلَّ ممّا يستطيعُه صاحبُه فى % موضعاً: % (v3.75.15)', v_bad, v_ex;
  END IF;

  -- ═══ **وفخٌّ لا يُشغَّل ليس فخّاً**: يُضيَّقُ صفٌّ حقّاً فيجب أن يُرى ═══
  BEGIN
    UPDATE public.company_role_permissions
       SET can_read = false
     WHERE role = 'owner' AND ctid = (SELECT ctid FROM public.company_role_permissions
                                       WHERE role = 'owner' LIMIT 1);
    WITH need AS (
      SELECT c.id AS company_id, r.role, p.resource, split_part(p.action, ':', 2) AS verb
      FROM public.companies c
      CROSS JOIN (VALUES ('owner'), ('admin')) AS r(role)
      CROSS JOIN public.permissions p
      WHERE split_part(p.action, ':', 2) IN ('access','read','create','update','delete')
    )
    SELECT count(*) INTO v_bad
    FROM need n
    LEFT JOIN public.company_role_permissions p
           ON p.company_id = n.company_id AND p.role = n.role AND p.resource = n.resource
    WHERE p.company_id IS NULL
       OR NOT CASE n.verb
            WHEN 'access' THEN p.can_access WHEN 'read'   THEN p.can_read
            WHEN 'create' THEN p.can_write  WHEN 'update' THEN p.can_update
            WHEN 'delete' THEN p.can_delete END;
    v_trap := (v_bad > 0);
    RAISE EXCEPTION 'ZZ_UNDO_V37515';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM <> 'ZZ_UNDO_V37515' THEN RAISE; END IF;
  END;

  IF NOT v_trap THEN
    RAISE EXCEPTION 'BASELINE FAIL: المقياسُ لا يرى تضييقاً حتّى حين يُصطنَع (v3.75.15)';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_15_check() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_15_check() FROM anon;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_15_check() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.assert_baseline_v3_75_15_check() TO service_role;
