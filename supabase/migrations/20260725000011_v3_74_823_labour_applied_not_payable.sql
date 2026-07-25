-- ============================================================================
-- v3.74.823 — أجور الإنتاج «محمَّلة» لا «مستحقة» + قالب الحسابات الجديدة
-- ============================================================================
-- **الفجوة**: قيد استلام المنتج التام كان يُدائن تكلفة العمالة على
-- «الرواتب والأجور المستحقة 2130» — أى **التزام جديد**. بينما مسار المرتبات
-- يُحمّل الأجر كاملاً على «الرواتب والأجور 5210» ويدفعه نقداً. عطبان معاً:
--
--   (١) **ازدواج تكلفة العمالة**: مرة مصروفاً فى قائمة الدخل، ومرة داخل
--       قيمة المخزون ⇒ التكلفة تظهر مرتين والربح مشوَّه.
--   (٢) **التزام وهمى دائم**: 2130 يتضخم مع كل أمر إنتاج **ولا مسار يسدده**
--       — فتبدو الشركة مدينة لموظفيها بمبالغ سبق أن دفعتها فعلاً.
--
-- **المعالجة القياسية (Applied Labour)**: حساب **مقابل للمصروف**
-- «أجور محمَّلة على الإنتاج 5415» — نظير «أعباء صناعية محملة 5410» الموجود
-- أصلاً ويعمل بنفس المنطق. القيد يصير:
--
--     مدين  مخزون المنتج التام        (مواد + تحويل)
--         دائن إنتاج تحت التشغيل        (المواد)
--         دائن **5415 أجور محمَّلة**     (العمالة — تخفيض صافى مصروف الأجور)
--         دائن 5410 أعباء صناعية محملة   (الأعباء)
--
-- فيُخفَّض صافى مصروف الأجور بما استُوعب منه فى قيمة المخزون: **لا ازدواج،
-- ولا التزام وهمى**، والفرق بين المدفوع والمستوعب يبقى ظاهراً فى 5210 كما
-- ينبغى (انحراف العمالة).
--
-- **البيانات**: لا سطر واحد رُحّل على 2130 من التصنيع فى أى شركة (أسعار
-- مراكز العمل كانت صفرية) ⇒ لا تصحيح مطلوب. الإصلاح وقائى بالكامل.
--
-- ─── وقالب الحسابات ────────────────────────────────────────────────────────
-- الحسابات التى أضافتها نشرات اليوم كانت تُنشأ للشركات القائمة فقط؛ بلا
-- إضافتها للقالب تولد كل **شركة جديدة** بلا: تأمينات مستحقة (817)،
-- عمولات مستحقة ومصروف عمولات (822)، وأجور محمَّلة (823) — فتصطدم بأول
-- دورة رواتب أو عمولة أو أمر إنتاج. أُضيفت الأربعة للقالب ولملف البذر.
-- ============================================================================

-- ─── (١) حساب الأجور المحمَّلة لكل شركة قائمة ──────────────────────────────
INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type,
                               normal_balance, sub_type, parent_id, level, is_active, is_system)
SELECT p.company_id, '5415', 'أجور محمَّلة على الإنتاج', 'expense', 'debit', 'direct_labour_applied',
       p.parent_id, p.level, TRUE, TRUE
FROM chart_of_accounts p
WHERE p.account_code = '5410'
  AND NOT EXISTS (SELECT 1 FROM chart_of_accounts x
                  WHERE x.company_id = p.company_id AND x.account_code = '5415');

-- ─── (٢) القالب: كل شركة جديدة تولد بالحسابات الأربعة ──────────────────────
INSERT INTO chart_of_accounts_template
  (account_code, account_name, account_name_en, account_type, normal_balance, sub_type, parent_code, level, is_active)
VALUES
  ('2135','تأمينات اجتماعية مستحقة','Accrued Social Insurance','liability','credit','accrued_insurance','2100',3,true),
  ('2136','عمولات ومكافآت مستحقة','Accrued Commissions & Bonuses','liability','credit','accrued_commissions','2100',3,true),
  ('5215','عمولات ومكافآت البيع','Sales Commissions & Bonuses','expense','debit','sales_commission','5200',3,true),
  ('5415','أجور محمَّلة على الإنتاج','Direct Labour Applied','expense','debit','direct_labour_applied','5000',2,true)
ON CONFLICT (account_code) DO UPDATE
  SET account_name    = EXCLUDED.account_name,
      account_name_en = EXCLUDED.account_name_en,
      account_type    = EXCLUDED.account_type,
      normal_balance  = EXCLUDED.normal_balance,
      sub_type        = EXCLUDED.sub_type,
      parent_code     = EXCLUDED.parent_code,
      level           = EXCLUDED.level;

-- ملاحظة: اختيار الحساب فى الكود (lib/manufacturing/manufacturing-accounting.ts)
-- صار يفضّل sub_type='direct_labour_applied' ثم الكود 5415، ويُبقى السلسلة
-- القديمة كخيار أخير للشركات التى ضبطت `companies.wages_payable_account_id`
-- يدوياً — فلا ينكسر إعداد قائم، ولا يُبنى إعداد جديد على الخطأ.
