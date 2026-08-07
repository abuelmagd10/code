-- v3.74.975 — الإشعارُ لا يبقى بعد مستنده.
--
-- ═══ ما رصدته لوحةُ التحكّم ═══
--
-- ثلاثةُ إشعاراتٍ عاليةِ الأهمّيّة لم يقرأها أحدٌ منذ شهر، تشير كلُّها إلى
-- مستندٍ **بُحث عنه فى كلِّ جداول القاعدة فلم يُوجد**. أى أنّ المستندَ حُذف،
-- وبقيت إشعاراتُه.
--
-- وأحدُها موجَّهٌ إلى المالك ونصُّه: «طلبُ استرداد عميل **مُعتَمَد — جاهز
-- للتنفيذ**، بمبلغ ٥٠٠». والطلبُ نفسُه غيرُ موجود. فهذه **ليست ضجيجاً بل
-- تعليمةٌ كاذبة**: من يقرؤها قد يدفع مبلغاً لطلبٍ لم يعد له وجود.
--
-- ═══ ولم يُتَّبع اقتراحُ اللوحة، لأنّه قِيس فوُجد لا ينطبق ═══
--
-- اللوحةُ تقترح: «أضِف الجدولَ إلى workflow_row_is_open». وقُرئت الدالّةُ
-- فإذا الجدولُ **مُضافٌ إليها منذ زمن**. فالاقتراحُ نصيحةٌ عامّةٌ لا تنطبق
-- هنا، ولو نُفِّذ لأُصلح سليمٌ وبقيت العلّة. لا يُنفَّذ اقتراحٌ لم يُقَس، ولو
-- جاء من داخل المشروع.
--
-- ═══ والعلاجُ قاعدةٌ لا مسحُ صفوف ═══
--
-- مسحُها مسكّن: أىُّ مستندٍ يُحذف غداً يترك أشباحَه مكانَه. فالقاعدةُ:
-- **حذفُ المستند يأخذ إشعاراتِه معه**، تُغلق **بسببٍ مكتوبٍ فى نصِّها** لا
-- بصمت — فيبقى الأثرُ ولا تبقى التعليمةُ الكاذبة.
--
-- ═══ ومن بيتٍ واحد ═══
--
-- قائمةُ جداولِ سير العمل موجودةٌ سلفاً داخل `workflow_row_is_open`. فلا
-- تُنسخ هنا — **تُقرأ من جسد الدالّة نفسِه** فى الكتالوج. فمن يضيف جدولاً
-- هناك غداً يناله المُشغِّلُ بمجرّد إعادة تشغيل المُركِّب، ولا تتباعد نسختان.
--
-- ═══ وما لا يُعرف لا يُدَّعى ═══
--
-- قِيست الإشعاراتُ كلُّها على الإنتاج: **سبعةٌ فقط** مستندُها غيرُ موجودٍ فى
-- أىِّ جدول (أربعةُ طلبِ استرداد · مدفوعتان · تغييرُ فرع). وأربعون غيرُها
-- تُرجع الدالّةُ عنها «لا أعرف» لأنّ جدولَها ليس فى قائمتها (اشتراكات ·
-- سلامةُ نظام · نقلُ صلاحيات · طلباتُ اعتماد) — **ومستندُها موجودٌ فعلاً**.
-- فلا تُمسّ: «لا أعرف» ليست «غيرُ موجود».
--
-- ═══ وتصحيحان وقعا بعد التطبيق، ويُسجَّلان لأنّهما درسان ═══
--
-- ‏(ب) **سحبُ PUBLIC وحدَه لا يكفى**. صاحت اللوحةُ بعد دقائقَ بانحرافٍ **عالى
--     الخطورة**: «دالّةٌ تكتب بصلاحيات كاملة بلا تحقّقٍ من هويّة المُنادى»،
--     وسمّت erp_notice_close_orphans — من عملى قبل قليل. فـ`authenticated`
--     فى Supabase له **منحةٌ افتراضيّةٌ مستقلّة** على كلِّ دالّةٍ جديدة، لا
--     يرثها من PUBLIC. فسحبُ PUBLIC وanon يترك البابَ مفتوحاً لكلِّ مسجَّل.
--
-- ‏(ج) و**«مُغلَقٌ» تعنى مقروءاً لا مؤرشفاً فحسب**. تخطّى الكنسُ كلَّ إشعارٍ
--     «مؤرشف»، وفحصُ اللوحة لا يقيس الحالةَ بل `read_at`. وكان إشعاران
--     مؤرشفَين وread_at فيهما فارغ، فبقيا فى العدّ بعد أن ظننتُهما أُغلقا.
--     أن أُغلق بمقياسى لا بمقياس مَن يسأل خطأ.
--
-- ═══ الإثباتُ بالزرع، والقياسُ قبل وبعد ═══
--
-- زُرع على الاختبار مستندٌ ومعه إشعارٌ عالى الأهمّيّة، ثمّ حُذف المستند: صار
-- الإشعارُ مؤرشفاً ومقروءاً، وحمل نصُّه سببَ إغلاقه.
-- الإنتاج: ٢١ مُشغِّلاً على جداول سير العمل، و**صفرَ إشعارٍ يتيمٍ باقٍ**،
-- ولوحةُ السلامة: **صفرُ انحراف**.

-- (١) أموجودٌ هذا الصفُّ فى أىِّ جدولٍ من جداول المشروع؟
CREATE OR REPLACE FUNCTION public.erp_reference_row_exists(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE r record; n int;
BEGIN
  IF p_id IS NULL THEN RETURN false; END IF;
  FOR r IN
    SELECT c.table_name FROM information_schema.columns c
     JOIN information_schema.tables t
       ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      AND t.table_type = 'BASE TABLE'
     WHERE c.table_schema = 'public' AND c.column_name = 'id' AND c.data_type = 'uuid'
     ORDER BY c.table_name
  LOOP
    EXECUTE format('SELECT 1 FROM public.%I WHERE id = $1 LIMIT 1', r.table_name)
      INTO n USING p_id;
    IF n IS NOT NULL THEN RETURN true; END IF;
  END LOOP;
  RETURN false;
END
$function$;

COMMENT ON FUNCTION public.erp_reference_row_exists(uuid) IS
  'v3.74.975 — أموجودٌ هذا المعرّفُ فى أىِّ جدولٍ؟ يُسأل قبل الحكم بأنّ مستنداً حُذف.';

-- (٢) إغلاقُ الإشعارات اليتيمة — بسببٍ مكتوب، و«مُغلَقٌ» تعنى مقروءاً
CREATE OR REPLACE FUNCTION public.erp_notice_close_orphans(p_company_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE v_reason text := ' — أُغلق آليّاً: المستندُ المرجعىُّ حُذف، فلم يعد لهذا الإشعار فعلٌ يُطلب.';
        v_n int := 0;
        r record;
BEGIN
  FOR r IN
    SELECT n.id FROM notifications n
     WHERE (p_company_id IS NULL OR n.company_id = p_company_id)
       AND (n.status <> 'archived' OR n.read_at IS NULL)
       AND public.workflow_row_is_open(n.reference_id) IS NULL
       AND NOT public.erp_reference_row_exists(n.reference_id)
  LOOP
    UPDATE notifications
       SET status  = 'archived',
           read_at = COALESCE(read_at, now()),
           message = CASE WHEN position(v_reason in message) > 0 THEN message
                          ELSE message || v_reason END
     WHERE id = r.id;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END
$function$;

COMMENT ON FUNCTION public.erp_notice_close_orphans(uuid) IS
  'v3.74.975 — يُغلق كلَّ إشعارٍ مستندُه غيرُ موجودٍ فى أىِّ جدول، ويكتب السببَ فى نصِّه.';

-- (٣) المُشغِّلُ: الحذفُ يأخذ إشعاراتِه معه
CREATE OR REPLACE FUNCTION public.erp_notice_follows_its_document()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE v_reason text := ' — أُغلق آليّاً: المستندُ المرجعىُّ حُذف، فلم يعد لهذا الإشعار فعلٌ يُطلب.';
BEGIN
  UPDATE notifications
     SET status  = 'archived',
         read_at = COALESCE(read_at, now()),
         message = CASE WHEN position(v_reason in message) > 0 THEN message
                        ELSE message || v_reason END
   WHERE reference_id = OLD.id
     AND (status <> 'archived' OR read_at IS NULL);
  RETURN OLD;
END
$function$;

COMMENT ON FUNCTION public.erp_notice_follows_its_document() IS
  'v3.74.975 — بعد حذفِ مستند: تُغلق إشعاراتُه بسببٍ مكتوب، فلا تبقى تعليمةٌ لمستندٍ لا وجودَ له.';

-- (٤) المُركِّبُ يقرأ قائمةَ الجداول من بيتها الواحد: جسدِ workflow_row_is_open
CREATE OR REPLACE FUNCTION public.erp_install_notice_follows_document()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE v_src text;
        v_tbl text;
        v_n int := 0;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'workflow_row_is_open'
   LIMIT 1;
  IF v_src IS NULL THEN
    RAISE EXCEPTION 'workflow_row_is_open غيرُ موجودة — لا قائمةَ أقرأ منها.';
  END IF;

  FOR v_tbl IN
    SELECT DISTINCT m[1]
      FROM regexp_matches(v_src, '\mFROM\s+([a-z_][a-z0-9_]*)\M', 'g') AS m
     WHERE m[1] NOT IN ('pg_proc','pg_namespace','information_schema')
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables t
                WHERE t.table_schema='public' AND t.table_name=v_tbl AND t.table_type='BASE TABLE') THEN
      EXECUTE format('DROP TRIGGER IF EXISTS zz_erp_notice_follows_document ON public.%I', v_tbl);
      EXECUTE format(
        'CREATE TRIGGER zz_erp_notice_follows_document AFTER DELETE ON public.%I '
        'FOR EACH ROW EXECUTE FUNCTION public.erp_notice_follows_its_document()', v_tbl);
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN v_n;
END
$function$;

COMMENT ON FUNCTION public.erp_install_notice_follows_document() IS
  'v3.74.975 — يقرأ جداولَ سير العمل من جسد workflow_row_is_open ويُركّب عليها المُشغِّل. بيتٌ واحدٌ للقائمة.';

-- (٥) ولا يُولد شىءٌ منها مفتوحاً — ولا للمصادَق عليه (درس ٩٧٢ + تصحيحُ ب)
REVOKE EXECUTE ON FUNCTION public.erp_reference_row_exists(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.erp_reference_row_exists(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.erp_notice_close_orphans(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.erp_notice_close_orphans(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.erp_install_notice_follows_document() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.erp_install_notice_follows_document() TO service_role;
REVOKE EXECUTE ON FUNCTION public.erp_notice_follows_its_document() FROM PUBLIC, anon, authenticated;

-- (٦) التركيبُ والكنسُ
DO $$
DECLARE v_t int; v_c int;
BEGIN
  v_t := public.erp_install_notice_follows_document();
  v_c := public.erp_notice_close_orphans(NULL);
  RAISE NOTICE 'v3.74.975 — مُشغِّلٌ على % جدولاً، وأُغلق % إشعاراً يتيماً.', v_t, v_c;
END $$;
