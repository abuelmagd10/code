-- v3.74.961 — لا دمجَ بين الشركات
-- ============================================================================
-- قرارُ صاحب العمل، بنصّه: «لا يمكن الدمجُ بين الشركات فى المشروع».
--
-- والمقيسُ قبل القرار: legal_entities و consolidation_groups كانت سياستُهما
-- ALL … WITH CHECK (true) — أى **اقبل أىَّ إضافةٍ من أىِّ مستخدمٍ مسجَّل**.
-- وأُثبت على الإنتاج داخل معاملتين مُرجَعتين: موظفٌ عادىٌّ (staff) أنشأ
-- كياناً قانونياً، وأنشأ مجموعةَ توحيد.
--
-- ثمّ لا يراهما بعد الإنشاء، لأنّ سياسةَ الرؤية تسأل جدولَ الربط وهو فارغ.
-- فالعطبُ ليس أنّ البابَ مغلقٌ بل أنّه **مفتوحٌ ثمّ لا يُرى ما دخل منه**:
-- يظنّ المستخدمُ أنّ الإنشاءَ فشل فيُعيد، وكلُّ إعادةٍ تترك صفّاً جديداً.
--
-- والعلاجُ بقرار صاحب العمل: يُغلق البابُ على المستخدمين جميعاً — لا سياسةَ
-- كتابةٍ تبقى، ولا إذنَ كتابةٍ يبقى — ويظلّ للخادم الداخلىّ وحدَه، فبعضُ
-- التقارير الداخلية تقرأ هذه الجداول.
--
-- والصفوفُ القائمة (٢ كيان · ١ مجموعة · ١ ربط · ٢ عضوية) تُترك كما هى:
-- خاملةٌ لا تضرّ، وحذفُها لم يُطلَب ولم يُقَس أثرُه.
--
-- الإثباتُ بعد التنفيذ على الإنتاج، داخل معاملاتٍ مُرجَعة:
--   موظفٌ يُنشئ كياناً        → permission denied
--   موظفٌ يُنشئ مجموعة        → permission denied
--   المالكُ يُنشئ كياناً       → permission denied
--   المالكُ يُنشئ مجموعة       → permission denied
--   والقراءةُ باقيةٌ للاثنين كما كانت.
-- ============================================================================

DO $$
DECLARE
  r record;
  n integer := 0;
BEGIN
  FOR r IN
    SELECT p.polname, p.polrelid::regclass AS tbl
      FROM pg_policy p
     WHERE p.polrelid IN (
             'public.legal_entities'::regclass,
             'public.consolidation_groups'::regclass,
             'public.company_legal_entity_map'::regclass,
             'public.consolidation_group_members'::regclass)
       AND p.polcmd <> 'r'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %s', r.polname, r.tbl);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'v3.74.961: أُسقطت % سياسةَ كتابة.', n;
END $$;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON
  public.legal_entities,
  public.consolidation_groups,
  public.company_legal_entity_map,
  public.consolidation_group_members
FROM anon, authenticated;
