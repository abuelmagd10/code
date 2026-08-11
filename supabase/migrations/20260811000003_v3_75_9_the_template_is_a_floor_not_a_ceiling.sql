-- ═══════════════════════════════════════════════════════════════════════════
-- v3.75.9 — القالبُ أرضيّةٌ لا سقف
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ═══ ما الذى كان ═══
--
-- عند ميلادِ كلِّ شركةٍ يعملُ بذّاران: يدوىٌّ مكتوبٌ فى دوالَّ، وقالبٌ يُقرأ من
-- كتالوجِ الصلاحيّات. وقِيس تصادمُهما بتجربةٍ حقيقيّةٍ أُلغيت (عُطِّل مُشغِّلُ
-- القالبِ، وأُنشئت شركةٌ، وقُورنت):
--
--   • يتداخلانِ فى **٣٤ زوجاً** (وظيفة × مورد).
--   • ويختلفانِ فى **٢٥** منها.
--   • ومُشغِّلُ القالبِ يعملُ **بعدَ** اليدوىِّ (ترتيبُ الأسماء: trg_a… ثمّ
--     trg_c…) ويستعملُ ON CONFLICT DO UPDATE — **فيكتبُ فوقَه دائماً**.
--
-- والأثرُ حىٌّ على القاعدةِ بتاريخٍ فاصلٍ واضح (٢٠٢٦-٠٦-٢٠):
--
--   • **مسؤولُ المخزنِ على المخزون**: كان يكتبُ ويُعدِّلُ ويحذف، فصار **عرضاً
--     فقط** فى الشركاتِ الأربعِ الأحدث — وهذه وظيفتُه الأساسيّة.
--   • **مديرُ الفرعِ على إحدى عشرةَ شاشة**: كان عرضاً فقط، فصار يُنشئ ويُعدِّلُ
--     **ويحذف** — بينما بيتُ الكودِ الواحد lib/role-default-pages.ts يقولُ نصّاً
--     «المدير — READ-ONLY at can_write level».
--
-- **وبيتانِ لوظيفةٍ واحدةٍ لا يختلفانِ فقط — أحدُهما يكتبُ فوقَ الآخرِ صامتاً.**
--
-- ═══ القرار ═══
--
-- صاحبُ المشروعِ قرَّر — بعدَ عرضِ الأثرِ عليه — أنّ **البذّارَ اليدوىَّ هو الحقّ**:
-- فهو الموافقُ لبيتِ الكودِ الواحد، وللشركتينِ الوحيدتينِ اللتينِ فيهما موظّفونَ
-- يعملون. والأربعُ التى تُصحَّح **ليس فيها عضوٌ واحدٌ غيرُ المالك**.
--
-- ═══ ما تفعلُه هذه الهجرة ═══
--
-- (١) **القالبُ يصيرُ أرضيّةً لا سقفاً**: ON CONFLICT DO NOTHING بدل DO UPDATE.
--     فلا يكتبُ فوقَ بذّارٍ سبقَه، **ولا يكتبُ فوقَ اختيارِ صاحبِ البيتِ** لو
--     نُودىَ يوماً على شركةٍ قائمة. وهذا وحدَه يمنعُ تكرارَ العطبِ إلى الأبد.
-- (٢) تُصحَّحُ الصفوفُ المنحرفةُ — **وبشرطٍ يرفضُ التخمين**: لا يُلمَسُ صفٌّ إلّا
--     إن كانت قيمتُه الحاليّةُ **مطابقةً لقيمةِ القالبِ حرفاً بحرف**. فما خرجَ عن
--     البيتين معاً (تعديلُ مالكٍ أو أثرٌ أقدم) **يُترَك ولا يُمَسّ**.
--     المقيس: ١٠٠ صفٍّ يُصحَّح · ٤٨ صحيحٌ سلفاً · وصفّان يُتركان
--     (manager/products فى تست والعصرية).
-- (٣) فحصٌ مرجعىٌّ يحرسُ الاثنين: القالبُ لا يملكُ الكتابةَ فوقَ أحد، والترتيبُ
--     يبقى كما هو.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ (١) القالبُ لا يكتبُ فوقَ أحد ═══
-- الجسمُ منقولٌ حرفاً بحرفٍ عمّا كان، ولم يتغيّر فيه إلّا سطرُ التعارض.
CREATE OR REPLACE FUNCTION public.copy_default_permissions_for_company(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_role TEXT;
  v_resource TEXT;
  v_actions TEXT[];
  v_can_read BOOLEAN;
  v_can_write BOOLEAN;
  v_can_update BOOLEAN;
  v_can_delete BOOLEAN;
  v_all_access BOOLEAN;
  v_can_access BOOLEAN;
BEGIN
  -- لكل دور
  FOR v_role IN SELECT name FROM roles LOOP
    -- لكل مورد فريد
    FOR v_resource IN
      SELECT DISTINCT p.resource
      FROM permissions p
      JOIN role_default_permissions rdp ON rdp.permission_action = p.action
      WHERE rdp.role_name = v_role
    LOOP
      -- جمع الـ actions لهذا المورد
      SELECT ARRAY_AGG(p.action)
      INTO v_actions
      FROM permissions p
      JOIN role_default_permissions rdp ON rdp.permission_action = p.action
      WHERE rdp.role_name = v_role AND p.resource = v_resource;

      -- تحديد الصلاحيات الأساسية
      v_can_access := EXISTS (
        SELECT 1 FROM role_default_permissions rdp
        JOIN permissions p ON p.action = rdp.permission_action
        WHERE rdp.role_name = v_role AND p.resource = v_resource AND p.action LIKE '%:access'
      );

      v_can_read := EXISTS (
        SELECT 1 FROM role_default_permissions rdp
        JOIN permissions p ON p.action = rdp.permission_action
        WHERE rdp.role_name = v_role AND p.resource = v_resource AND p.action LIKE '%:read'
      );

      v_can_write := EXISTS (
        SELECT 1 FROM role_default_permissions rdp
        JOIN permissions p ON p.action = rdp.permission_action
        WHERE rdp.role_name = v_role AND p.resource = v_resource AND p.action LIKE '%:create'
      );

      v_can_update := EXISTS (
        SELECT 1 FROM role_default_permissions rdp
        JOIN permissions p ON p.action = rdp.permission_action
        WHERE rdp.role_name = v_role AND p.resource = v_resource AND p.action LIKE '%:update'
      );

      v_can_delete := EXISTS (
        SELECT 1 FROM role_default_permissions rdp
        JOIN permissions p ON p.action = rdp.permission_action
        WHERE rdp.role_name = v_role AND p.resource = v_resource AND p.action LIKE '%:delete'
      );

      -- owner و admin لديهم كل الصلاحيات
      v_all_access := v_role IN ('owner', 'admin');

      -- v3.75.9 — **القالب أرضية لا سقف.** كان DO UPDATE، ومشغله يعمل بعد
      -- البذار اليدوى، فكان يكتب فوقه فى 25 زوجا عند ميلاد كل شركة. ويكتب
      -- كذلك فوق اختيار صاحب البيت لو نودى على شركة قائمة. فصار DO NOTHING:
      -- يملأ الفراغ ولا يمحو قرارا.
      INSERT INTO company_role_permissions (
        company_id, role, resource,
        can_read, can_write, can_update, can_delete, all_access, can_access,
        allowed_actions
      ) VALUES (
        p_company_id, v_role, v_resource,
        v_can_read, v_can_write, v_can_update, v_can_delete, v_all_access, v_can_access,
        v_actions
      )
      ON CONFLICT (company_id, role, resource) DO NOTHING;
    END LOOP;
  END LOOP;
END;
$function$;

-- ═══ (٢) تُصحَّحُ الصفوفُ المنحرفة — ولا يُلمَسُ ما خرجَ عن البيتين ═══
DO $$
DECLARE v_fixed int; v_left int;
BEGIN
  WITH hand(role, resource, a, r, w, u, d) AS (VALUES
    ('accountant','banking',true,true,true,true,true),
    ('accountant','customers',true,true,false,false,false),
    ('accountant','inventory',true,true,true,true,true),
    ('accountant','payments',true,true,true,true,true),
    ('accountant','purchase_returns',true,true,true,true,true),
    ('accountant','sales_returns',true,true,true,true,true),
    ('accountant','write_offs',true,true,true,true,true),
    ('manager','banking',true,true,false,false,false),
    ('manager','bills',true,true,false,false,false),
    ('manager','customers',true,true,false,false,false),
    ('manager','estimates',true,true,false,false,false),
    ('manager','invoices',true,true,false,false,false),
    ('manager','payments',true,true,false,false,false),
    ('manager','products',true,true,false,false,false),
    ('manager','purchase_orders',true,true,false,false,false),
    ('manager','purchase_returns',true,true,false,false,false),
    ('manager','sales_orders',true,true,false,false,false),
    ('manager','sales_returns',true,true,false,false,false),
    ('manager','suppliers',true,true,false,false,false),
    ('manager','write_offs',true,true,false,false,false),
    ('staff','customers',true,true,true,true,true),
    ('staff','estimates',true,true,true,true,true),
    ('staff','sales_orders',true,true,true,true,true),
    ('store_manager','inventory',true,true,true,true,true),
    ('store_manager','write_offs',true,true,true,true,false)
  ), tpl AS (
    SELECT r.name AS role, p.resource,
      bool_or(p.action LIKE '%:access') AS a, bool_or(p.action LIKE '%:read') AS r2,
      bool_or(p.action LIKE '%:create') AS w, bool_or(p.action LIKE '%:update') AS u,
      bool_or(p.action LIKE '%:delete') AS d
    FROM public.roles r
    JOIN public.role_default_permissions rdp ON rdp.role_name = r.name
    JOIN public.permissions p ON p.action = rdp.permission_action
    GROUP BY 1, 2
  ), target AS (
    SELECT p.id, h.a, h.r, h.w, h.u, h.d
    FROM public.company_role_permissions p
    JOIN hand h ON h.role = p.role AND h.resource = p.resource
    JOIN tpl t ON t.role = p.role AND t.resource = p.resource
    WHERE (p.can_access, p.can_read, p.can_write, p.can_update, p.can_delete)
            = (t.a, t.r2, t.w, t.u, t.d)
      AND (p.can_access, p.can_read, p.can_write, p.can_update, p.can_delete)
            IS DISTINCT FROM (h.a, h.r, h.w, h.u, h.d)
  )
  UPDATE public.company_role_permissions p
  SET can_access = t.a, can_read = t.r, can_write = t.w, can_update = t.u, can_delete = t.d
  FROM target t WHERE p.id = t.id;
  GET DIAGNOSTICS v_fixed = ROW_COUNT;

  RAISE NOTICE 'v3.75.9: صُحِّح % صفّاً', v_fixed;
END $$;

-- ═══ (٣) الفحصُ المرجعىّ ═══
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_9_check()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_src   text;
  v_hand  text;
  v_tpl   text;
  v_seen  int;
BEGIN
  -- ═══ القالبُ لا يملكُ الكتابةَ فوقَ أحد ═══
  SELECT prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'copy_default_permissions_for_company';
  IF v_src IS NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: بذّارُ القالبِ غائب (v3.75.9)';
  END IF;
  -- **التعليقُ ليس تعليمة**: تُطرح أسطرُ التعليقِ قبلَ الحكم، وإلّا حكمَ الفحصُ
  -- على شرحٍ يذكرُ ما كان.
  v_src := regexp_replace(v_src, '--[^\n]*', ' ', 'g');
  IF v_src ~* 'ON\s+CONFLICT[^;]*DO\s+UPDATE' THEN
    RAISE EXCEPTION 'BASELINE FAIL: القالبُ يكتبُ فوقَ صفٍّ قائم — وهو أرضيّةٌ لا سقف (v3.75.9)';
  END IF;
  IF v_src !~* 'ON\s+CONFLICT[^;]*DO\s+NOTHING' THEN
    RAISE EXCEPTION 'BASELINE FAIL: القالبُ بلا شرطِ تعارضٍ معروف (v3.75.9)';
  END IF;

  -- ═══ والترتيبُ يبقى: اليدوىُّ أوّلاً ثمّ القالب ═══
  SELECT t.tgname INTO v_hand FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_proc p ON p.oid = t.tgfoid
  WHERE c.relname = 'companies' AND NOT t.tgisinternal
    AND p.proname = 'trg_auto_seed_role_permissions';
  SELECT t.tgname INTO v_tpl FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_proc p ON p.oid = t.tgfoid
  WHERE c.relname = 'companies' AND NOT t.tgisinternal
    AND p.proname = 'trigger_copy_permissions_on_company_create';
  IF v_hand IS NULL OR v_tpl IS NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: أحدُ مُشغِّلَى البذرِ غائب (v3.75.9)';
  END IF;
  IF v_hand >= v_tpl THEN
    RAISE EXCEPTION 'BASELINE FAIL: تغيّر ترتيبُ البذر — القالبُ صار يسبقُ اليدوىَّ: % ثمّ % (v3.75.9)', v_tpl, v_hand;
  END IF;

  -- ═══ ولا يُحاكَمُ مقدارُ الصلاحيّة ═══
  -- قِيمُ الأعلامِ اختيارُ صاحبِ البيت، فلا يحرسُها فحصٌ وإلّا خاصمَ المالكَ فى
  -- شاشتِه. المحروسُ هنا **البنية**: من يبذر، وبأىِّ ترتيب، وهل يملكُ المحوَ.
  -- **ولا يُحاكَم قرارٌ يملكُه صاحبُه.**

  -- ═══ والفخُّ يُشغَّل بلا لمسِ صفٍّ واحد ═══
  -- **فخٌّ لا يُشغَّل ليس فخّاً**: يُصطنَعُ نصٌّ فيه DO UPDATE فيجب أن تراه
  -- القاعدةُ نفسُها التى حكمت على القالب.
  IF NOT (('insert into t values (1) on conflict (a) do update set b = 1')
          ~* 'ON\s+CONFLICT[^;]*DO\s+UPDATE') THEN
    RAISE EXCEPTION 'BASELINE FAIL: القاعدةُ لا ترى الكتابةَ فوقَ صفٍّ حتى حين تُصطنَع (v3.75.9)';
  END IF;
  IF ('insert into t values (1) on conflict (a) do nothing')
     ~* 'ON\s+CONFLICT[^;]*DO\s+UPDATE' THEN
    RAISE EXCEPTION 'BASELINE FAIL: القاعدةُ تصرخُ على البرىء — DO NOTHING ليس محواً (v3.75.9)';
  END IF;

  -- ═══ ولا يُقرأُ فراغٌ ويُسمّى سلاماً ═══
  SELECT count(*) INTO v_seen FROM public.company_role_permissions;
  IF v_seen = 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: لا صفَّ صلاحيّةٍ واحداً — بحثٌ لا يجد ليس دليلَ غياب (v3.75.9)';
  END IF;
END;
$function$;
