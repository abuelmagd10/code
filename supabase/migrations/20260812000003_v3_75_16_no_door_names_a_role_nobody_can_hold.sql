-- ═══════════════════════════════════════════════════════════════════════════
-- v3.75.16 — **ولا يسألُ بابٌ عن اسمٍ لا يشغلُه أحد**
-- ═══════════════════════════════════════════════════════════════════════════
-- ثلاثُ سياساتِ رؤيةٍ حيّةٍ كانت تسمّى أسماءَ وظائفَ **لا يستطيعُ أحدٌ أن
-- يشغلَها**: `expenses_update` تسمّى `general_manager` و`gm` و`generalmanager`،
-- و`third_party_inventory` إدخالاً وقراءةً تسمّى `sales` و`employee`.
--
-- **ولا تُغلقُ باباً على أحد**: فى كلِّ قائمةٍ منها اسمٌ حىٌّ بجانبَها
-- (`admin` · `staff` · `owner`…). لكنّها ضبابٌ فوق الصورة: من يقرأُ السياسةَ
-- بعد سنةٍ يظنُّ أنّ هناك وظيفةً بهذا الاسم.
--
-- ═══ البرهانُ منطقىٌّ لا عيّنة ═══
--
-- كلُّ اسمٍ يُزال كان **عنصراً فى `cm.role = ANY(ARRAY[...])`**، وعمودُ
-- `company_members.role` مقيَّدٌ بالأحدَ عشرَ اسماً الحيّة — وهو البيتُ المُعلَنُ
-- الذى يحرسُ فحصُ v3.75.13 تطابقَه مع جدولِ الأسماءِ ومع قيدِ الدعوات. فالعمودُ
-- **لا يساوى اسماً ميّتاً لأىِّ صفٍّ ممكن**، وحذفُ العنصرِ من قائمةِ «أو»
-- لا يغيّرُ قيمةَ الشرط. **ولا يُحتاجُ إلى عيّنةٍ لإثباتِ ما يمنعُه القيد.**
--
-- وقِيس تأكيداً: **صفرُ عضوٍ** يحملُ أىَّ اسمٍ من الأسماءِ المُزالة.
--
-- ═══ والتحويلُ آلىٌّ لا منسوخٌ بيد ═══
--
-- يُقرأُ تعريفُ السياسةِ من القاعدةِ نفسِها، ويُنزَعُ منه العنصرُ نصّاً، ثمّ
-- يُعادُ كما هو. **ولا تُكتَبُ سياسةُ أمانٍ بيدٍ من الذاكرة** — فخطأُ حرفٍ فى
-- سياسةِ رؤيةٍ يفتحُ باباً أو يغلقُه على الناسِ كلِّهم.
--
-- **ولا صفَّ بياناتٍ يُلمَس، ولا قدرةَ إنسانٍ تتغيّر.**
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  r record; v_q text; v_c text; v_sql text;
  DEAD text[] := ARRAY['general_manager','gm','generalmanager','sales','employee','supervisor',
                       'super_admin','superadmin','warehouse_manager','branch_manager','finance'];
  d text;
BEGIN
  FOR r IN
    SELECT tablename, policyname, qual, with_check
    FROM pg_policies WHERE schemaname='public'
      AND (coalesce(qual,'') || coalesce(with_check,''))
          ~ '''(general_manager|gm|generalmanager|sales|employee|supervisor)''::text'
  LOOP
    v_q := r.qual; v_c := r.with_check;
    FOREACH d IN ARRAY DEAD LOOP
      v_q := replace(replace(coalesce(v_q,''), ', ''' || d || '''::text', ''), '''' || d || '''::text, ', '');
      v_c := replace(replace(coalesce(v_c,''), ', ''' || d || '''::text', ''), '''' || d || '''::text, ', '');
    END LOOP;
    -- **ولا يُلمَسُ ما لم يتغيّر**
    IF coalesce(v_q,'') IS NOT DISTINCT FROM coalesce(r.qual,'')
       AND coalesce(v_c,'') IS NOT DISTINCT FROM coalesce(r.with_check,'') THEN CONTINUE; END IF;
    v_sql := format('ALTER POLICY %I ON public.%I', r.policyname, r.tablename);
    IF r.qual IS NOT NULL THEN v_sql := v_sql || ' USING (' || v_q || ')'; END IF;
    IF r.with_check IS NOT NULL THEN v_sql := v_sql || ' WITH CHECK (' || v_c || ')'; END IF;
    EXECUTE v_sql;
    RAISE NOTICE 'v3.75.16: نُظّفت %.%', r.tablename, r.policyname;
  END LOOP;
END $$;
