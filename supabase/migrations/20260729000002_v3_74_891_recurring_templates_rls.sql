-- ═══════════════════════════════════════════════════════════════════════════
-- v3.74.891 — 🔒 جدولا القيود الدورية كانا مفتوحَين للزائر المجهول بالكامل
--
-- **الاكتشاف** (من فرز ملاحظات الحوكمة، مُثبَت على القاعدة الحية):
-- `recurring_journal_templates` و`recurring_journal_template_lines` أُنشئا
-- **بلا RLS إطلاقاً**، وبمنح PostgREST الافتراضية الكاملة لـ`anon`
-- و`authenticated`: قراءة، إدراج، تعديل، حذف — وحتى TRUNCATE.
-- أى زائرٍ بلا تسجيل دخول كان يستطيع قراءة قوالب قيود كل الشركات
-- والكتابة فيها ومسحها من REST مباشرة.
--
-- **النجاة الوحيدة**: صفر صفوف — الميزة لم تُستخدم بعد فى أى شركة
-- (درس 819: «صفر صفوف = فرصة» — الإصلاح وصل قبل أول استخدام حقيقى).
--
-- **ولماذا لم يمسكه حارس anon-open-tables؟** يُراجَع الحارس فى إصدارٍ
-- قادم — هذه الحادثة تُضاف لعائلة «الحارس يحتاج من يتحقق منه» (834).
--
-- **البرهنة** (القاعدتان، داخل معاملات مُلغاة، بثلاث هويات):
--   anon: SELECT/INSERT مرفوضان بانعدام الامتياز ✓
--   مستخدم مصادَق من شركة أخرى (دخيل صافٍ): يرى 0 ولا يستطيع الإدراج ✓
--   عضو الشركة: يرى قالبه ✓
--
-- **العلاج**: النمط القياسى للمشروع — RLS بعزل الشركة عبر
-- `get_user_company_ids()` للرأس، وبالوراثة عبر الأب للسطور، وسحب كل
-- منح anon، وسحب TRUNCATE من authenticated (لا يحتاجه أحد).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.recurring_journal_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_journal_template_lines ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.recurring_journal_templates FROM anon;
REVOKE ALL ON public.recurring_journal_template_lines FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.recurring_journal_templates FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.recurring_journal_template_lines FROM authenticated;

-- رأس القالب: عزل الشركة القياسى
DROP POLICY IF EXISTS rjt_select_company_isolation ON public.recurring_journal_templates;
CREATE POLICY rjt_select_company_isolation ON public.recurring_journal_templates
  FOR SELECT USING (company_id IN (SELECT get_user_company_ids()));

DROP POLICY IF EXISTS rjt_insert_company_isolation ON public.recurring_journal_templates;
CREATE POLICY rjt_insert_company_isolation ON public.recurring_journal_templates
  FOR INSERT WITH CHECK (company_id IN (SELECT get_user_company_ids()));

DROP POLICY IF EXISTS rjt_update_company_isolation ON public.recurring_journal_templates;
CREATE POLICY rjt_update_company_isolation ON public.recurring_journal_templates
  FOR UPDATE USING (company_id IN (SELECT get_user_company_ids()))
  WITH CHECK (company_id IN (SELECT get_user_company_ids()));

DROP POLICY IF EXISTS rjt_delete_company_isolation ON public.recurring_journal_templates;
CREATE POLICY rjt_delete_company_isolation ON public.recurring_journal_templates
  FOR DELETE USING (company_id IN (SELECT get_user_company_ids()));

-- السطور: بالوراثة عبر الأب
DROP POLICY IF EXISTS rjtl_select_via_parent ON public.recurring_journal_template_lines;
CREATE POLICY rjtl_select_via_parent ON public.recurring_journal_template_lines
  FOR SELECT USING (template_id IN (
    SELECT id FROM public.recurring_journal_templates
    WHERE company_id IN (SELECT get_user_company_ids())));

DROP POLICY IF EXISTS rjtl_insert_via_parent ON public.recurring_journal_template_lines;
CREATE POLICY rjtl_insert_via_parent ON public.recurring_journal_template_lines
  FOR INSERT WITH CHECK (template_id IN (
    SELECT id FROM public.recurring_journal_templates
    WHERE company_id IN (SELECT get_user_company_ids())));

DROP POLICY IF EXISTS rjtl_update_via_parent ON public.recurring_journal_template_lines;
CREATE POLICY rjtl_update_via_parent ON public.recurring_journal_template_lines
  FOR UPDATE USING (template_id IN (
    SELECT id FROM public.recurring_journal_templates
    WHERE company_id IN (SELECT get_user_company_ids())))
  WITH CHECK (template_id IN (
    SELECT id FROM public.recurring_journal_templates
    WHERE company_id IN (SELECT get_user_company_ids())));

DROP POLICY IF EXISTS rjtl_delete_via_parent ON public.recurring_journal_template_lines;
CREATE POLICY rjtl_delete_via_parent ON public.recurring_journal_template_lines
  FOR DELETE USING (template_id IN (
    SELECT id FROM public.recurring_journal_templates
    WHERE company_id IN (SELECT get_user_company_ids())));
