-- ============================================================================
-- v3.74.815 — حسابات مقابلة لحقوق الملكية + ربط حسابات المساهمين
-- ============================================================================
-- أثناء المراجعة الشاملة للمديولات المحاسبية:
--
-- (أ) حارس الطبيعة المحاسبية `fn_validate_normal_balance` يعرف الحسابات
--     المقابلة للأصول والإيرادات والمصروفات — ولا يعرف **المقابلة لحقوق
--     الملكية**. فمحاولة إنشاء «مسحوبات - <شريك>» (equity بطبيعة مدينة،
--     وهو التصنيف الصحيح بمعايير IFRS) تُرفض ⇒ يستحيل بناء دورة مسحوبات
--     أو توزيعات صحيحة. أُضيف 'drawings' و'treasury_stock' لقائمة المقابلة.
--
-- (ب) `shareholders.capital_account_id` و`drawings_account_id` كانا NULL
--     لكل المساهمين ⇒ الصلة بين سجل الشريك وحسابه فى الدليل مقطوعة.
--     تُربط حسابات رأس المال بالمطابقة على الاسم، وتُنشأ حسابات مسحوبات
--     تحت «حساب جارى الشركاء 3600» وتُربط.
--
-- (ج) قرار المالك (25/7): **نسب الملكية تتبع رأس المال المدفوع فعلاً**
--     (احمد 20,000 = 66.67% / مصطفى 10,000 = 33.33%) بدل 50/50 المسجلة —
--     فتوزيع الأرباح (distribute_dividends_atomic يعتمد percentage) صار
--     يطابق المساهمة الحقيقية.
--
-- بروفة على قاعدة الاختبار قبل الإنتاج: إنشاء حساب مسحوبات مدين نجح بعد
-- الترقيع وكان يُرفض قبله (rollback للبروفة).
-- ============================================================================

-- (أ) توسيع حارس الطبيعة المحاسبية
DO $$
DECLARE d text;
  a text := $anchor$    'purchase_discounts'          -- 5130: contra-expense
  ]) THEN$anchor$;
  marker text := 'v3.74.815 contra-equity';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='fn_validate_normal_balance';

  IF d LIKE '%' || marker || '%' THEN RAISE NOTICE 'already patched'; RETURN; END IF;
  IF (length(d) - length(replace(d, a, ''))) / length(a) <> 1 THEN
    RAISE EXCEPTION 'anchor not unique in fn_validate_normal_balance';
  END IF;

  d := replace(d, a,
    '    ''purchase_discounts'',         -- 5130: contra-expense' || chr(10) ||
    '    -- ' || marker || ': المسحوبات وأسهم الخزينة حسابات مقابلة لحقوق' || chr(10) ||
    '    -- الملكية بطبيعة مدينة (IFRS). كان الحارس يرفضها فيستحيل إنشاء' || chr(10) ||
    '    -- حساب مسحوبات لشريك — وهو مطلوب لدورة المسحوبات والتوزيعات.' || chr(10) ||
    '    ''drawings'',                   -- 36xx: contra-equity' || chr(10) ||
    '    ''treasury_stock''              -- contra-equity' || chr(10) ||
    '  ]) THEN'
  );
  EXECUTE d;
END $$;

-- (ب-0) **قاعدة المشروع (قرار المالك 25/7)**: نُصلح النظام لا بيانات شركة
-- بعينها. لذا النظام يوفّر حسابات الشريك ويربطها تلقائياً عند إنشائه —
-- والفقرات التالية (ب/ب-2/ج) تصحيح لمرة واحدة للسجلات القائمة فقط.
CREATE OR REPLACE FUNCTION public.provision_shareholder_accounts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_capital_parent uuid; v_drawings_parent uuid;
  v_capital_id uuid; v_drawings_id uuid;
  v_next_cap text; v_next_draw text;
BEGIN
  SELECT id INTO v_capital_parent FROM chart_of_accounts
  WHERE company_id=NEW.company_id AND account_code='3100';
  SELECT id INTO v_drawings_parent FROM chart_of_accounts
  WHERE company_id=NEW.company_id AND account_code='3600';

  IF NEW.capital_account_id IS NULL THEN
    SELECT id INTO v_capital_id FROM chart_of_accounts
    WHERE company_id=NEW.company_id AND account_name='رأس مال - ' || NEW.name;
    IF v_capital_id IS NULL AND v_capital_parent IS NOT NULL THEN
      SELECT '31' || LPAD((COALESCE(MAX(SUBSTRING(account_code FROM 3)::int), 0) + 1)::text, 2, '0')
        INTO v_next_cap
      FROM chart_of_accounts
      WHERE company_id=NEW.company_id AND account_code ~ '^31[0-9]{2}$' AND account_code <> '3100';
      INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type,
                                     normal_balance, sub_type, parent_id, level, is_active, is_system)
      VALUES (NEW.company_id, COALESCE(v_next_cap,'3101'), 'رأس مال - ' || NEW.name, 'equity',
              'credit', NULL, v_capital_parent, 3, TRUE, TRUE)
      RETURNING id INTO v_capital_id;
    END IF;
  END IF;

  IF NEW.drawings_account_id IS NULL THEN
    SELECT id INTO v_drawings_id FROM chart_of_accounts
    WHERE company_id=NEW.company_id AND account_name='مسحوبات - ' || NEW.name;
    IF v_drawings_id IS NULL AND v_drawings_parent IS NOT NULL THEN
      SELECT '36' || LPAD((COALESCE(MAX(SUBSTRING(account_code FROM 3)::int), 0) + 1)::text, 2, '0')
        INTO v_next_draw
      FROM chart_of_accounts
      WHERE company_id=NEW.company_id AND account_code ~ '^36[0-9]{2}$' AND account_code <> '3600';
      INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type,
                                     normal_balance, sub_type, parent_id, level, is_active, is_system)
      VALUES (NEW.company_id, COALESCE(v_next_draw,'3601'), 'مسحوبات - ' || NEW.name, 'equity',
              'debit', 'drawings', v_drawings_parent, 3, TRUE, TRUE)
      RETURNING id INTO v_drawings_id;
    END IF;
  END IF;

  IF v_capital_id IS NOT NULL OR v_drawings_id IS NOT NULL THEN
    UPDATE shareholders
    SET capital_account_id  = COALESCE(capital_account_id, v_capital_id),
        drawings_account_id = COALESCE(drawings_account_id, v_drawings_id)
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_provision_shareholder_accounts ON shareholders;
CREATE TRIGGER trg_provision_shareholder_accounts
AFTER INSERT ON shareholders
FOR EACH ROW EXECUTE FUNCTION public.provision_shareholder_accounts();

-- (ب) ربط حساب رأس المال للمساهمين القائمين (بالمطابقة على الاسم)
UPDATE shareholders s
SET capital_account_id = c.id
FROM chart_of_accounts c
WHERE c.company_id = s.company_id
  AND c.account_type = 'equity'
  AND c.account_name = 'رأس مال - ' || s.name
  AND s.capital_account_id IS NULL;

-- (ب-2) إنشاء حساب مسحوبات لكل مساهم تحت 3600 وربطه
INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type,
                               normal_balance, sub_type, parent_id, level, is_active, is_system)
SELECT s.company_id,
       '36' || LPAD((ROW_NUMBER() OVER (PARTITION BY s.company_id ORDER BY s.name))::text, 2, '0'),
       'مسحوبات - ' || s.name, 'equity', 'debit', 'drawings',
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = s.company_id AND p.account_code = '3600'),
       3, TRUE, TRUE
FROM shareholders s
WHERE s.drawings_account_id IS NULL
  AND EXISTS (SELECT 1 FROM chart_of_accounts p WHERE p.company_id = s.company_id AND p.account_code = '3600')
  AND NOT EXISTS (SELECT 1 FROM chart_of_accounts x
                  WHERE x.company_id = s.company_id AND x.account_name = 'مسحوبات - ' || s.name);

UPDATE shareholders s
SET drawings_account_id = c.id
FROM chart_of_accounts c
WHERE c.company_id = s.company_id
  AND c.account_name = 'مسحوبات - ' || s.name
  AND s.drawings_account_id IS NULL;

-- (د) التلقائية: النسبة تُعاد حسبتها مع كل حركة رأس مال
-- سؤال المالك: «هل تُعدّل النسبة تلقائياً حسب قيمة كل مساهم؟» — كانت
-- حقلاً يدوياً؛ صارت الآن محسوبة بحارس على capital_contributions يغطى
-- الإضافة والتعديل والعكس والحذف. بروفة على قاعدة الاختبار: مساهمة
-- 10,000 لمصطفى ⇒ 50/50 تلقائياً، وعكسها ⇒ 66.67/33.33 ✓
CREATE OR REPLACE FUNCTION public.sync_shareholder_percentages()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_company uuid;
BEGIN
  v_company := COALESCE(NEW.company_id, OLD.company_id);
  IF v_company IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  WITH paid AS (
    SELECT s.id,
           COALESCE(SUM(cc.amount) FILTER (WHERE COALESCE(cc.is_reversed,false)=false), 0) AS capital
    FROM shareholders s
    LEFT JOIN capital_contributions cc ON cc.shareholder_id = s.id
    WHERE s.company_id = v_company
    GROUP BY s.id
  ), tot AS (SELECT SUM(capital) t FROM paid)
  UPDATE shareholders s
  SET percentage = CASE WHEN (SELECT t FROM tot) > 0
                        THEN ROUND(p.capital * 100.0 / (SELECT t FROM tot), 2)
                        ELSE 0 END
  FROM paid p
  WHERE p.id = s.id AND s.company_id = v_company;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_shareholder_percentages ON capital_contributions;
CREATE TRIGGER trg_sync_shareholder_percentages
AFTER INSERT OR UPDATE OR DELETE ON capital_contributions
FOR EACH ROW EXECUTE FUNCTION public.sync_shareholder_percentages();

-- (ج) تصحيح لمرة واحدة للنسب القائمة (الحارس أعلاه يتكفل بما بعدها)
WITH paid AS (
  SELECT s.id, s.company_id,
         COALESCE(SUM(cc.amount) FILTER (WHERE COALESCE(cc.is_reversed, false) = false), 0) AS capital
  FROM shareholders s
  LEFT JOIN capital_contributions cc ON cc.shareholder_id = s.id
  GROUP BY s.id, s.company_id
),
tot AS (SELECT company_id, SUM(capital) t FROM paid GROUP BY company_id)
UPDATE shareholders s
SET percentage = ROUND(p.capital * 100.0 / NULLIF(tot.t, 0), 2)
FROM paid p JOIN tot ON tot.company_id = p.company_id
WHERE p.id = s.id AND tot.t > 0;
