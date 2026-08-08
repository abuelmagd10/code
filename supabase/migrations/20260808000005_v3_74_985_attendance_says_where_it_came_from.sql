-- =============================================================================
-- v3.74.985 — سجلُّ الحضور يقول من أىِّ فرعٍ جاء ومن أىِّ طريق
-- =============================================================================
-- طلبُ المالك: **إضافةُ الفرع والمصدر لسجلّ الحضور.**
--
-- وما وُجد عند القياس أوضحُ من الطلب: **البصمةُ الخامُّ تعرفهما سلفاً.**
-- جدولُ البصمات `attendance_raw_logs` يحمل `branch_id` و`source` و`device_id`
-- لكلِّ بصمة، **ثمّ يُبنى منها يومُ الحضور فيُلقى الاثنان**. فالسجلُّ الذى
-- يُبنى عليه الراتبُ لا يعرف أين حضر الموظّفُ ولا من أىِّ بابٍ جاء خبرُه.
--
-- **ولا يُملأ حقلٌ بالتخمين**: الفرعُ يُملأ من فرع الموظّف حين لا يذكره
-- الكاتب، **والمصدرُ لا يُملأ أبداً** — من يكتب يومَ حضورٍ يقول من أين جاء،
-- وإلّا رُفض. **وحقلٌ يُملأ بالحدس أسوأُ من حقلٍ فارغ.**
--
-- ولا صفَّ واحدٌ فى الجدول اليوم (قِيس: صفرُ سجلّاتٍ وصفرُ بصماتٍ فى الشركات
-- الستّ)، فلا ماضىَ يُحاكَم ولا عملٌ يتوقّف.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ١) العمودان
-- -----------------------------------------------------------------------------
-- والمفرداتُ نفسُها التى تستعملها البصمةُ الخامّ، وزيادةُ «mixed» وحدَها:
-- فيومُ الحضور يُبنى من بصمتين قد تختلف طريقُهما (دخولٌ بالجهاز وانصرافٌ
-- بالجوّال)، **فيقول «مختلط» ولا يدّعى واحداً منهما**.

ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id);

ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS source text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    WHERE c.relname = 'attendance_records' AND con.conname = 'attendance_records_source_check'
  ) THEN
    ALTER TABLE public.attendance_records
      ADD CONSTRAINT attendance_records_source_check
      CHECK (source IS NULL OR source IN ('biometric', 'manual', 'api', 'mobile', 'gps', 'mixed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_attendance_records_branch_day
  ON public.attendance_records (company_id, branch_id, day_date);

-- -----------------------------------------------------------------------------
-- ٢) الفرعُ يُملأ من بيتٍ واحد، والمصدرُ يُطلب ولا يُخمَّن
-- -----------------------------------------------------------------------------
-- فلا يحتاج كاتبٌ جديدٌ غداً أن يتذكّر أن يملأ الفرع، **ولا يستطيع أحدٌ أن
-- يكتب يومَ حضورٍ بلا مصدر**.

CREATE OR REPLACE FUNCTION public.attendance_record_says_its_origin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  -- الفرعُ: يُملأ من فرع الموظّف إن لم يذكره الكاتب — وهذه معرفةٌ لا تخمين.
  IF NEW.branch_id IS NULL THEN
    SELECT e.branch_id INTO NEW.branch_id
    FROM public.employees e
    WHERE e.id = NEW.employee_id;
  END IF;

  -- والمصدرُ: لا يُملأ عنه أحد.
  IF NEW.source IS NULL THEN
    RAISE EXCEPTION 'سجلُّ الحضور لا يُكتب بلا مصدر — قل من أىِّ طريقٍ جاء (جهاز · يدوى · تطبيق · جوّال · موقع)'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_attendance_record_origin ON public.attendance_records;
CREATE TRIGGER trg_attendance_record_origin
  BEFORE INSERT OR UPDATE OF branch_id, source, employee_id ON public.attendance_records
  FOR EACH ROW
  EXECUTE FUNCTION public.attendance_record_says_its_origin();

-- -----------------------------------------------------------------------------
-- ٣) وفحصٌ مرجعىٌّ يمنع عودةَ هذا — ويمنع افتراقَ المفردات
-- -----------------------------------------------------------------------------
-- **والمفرداتُ تُقرأ من الجدولين وقتَ التشغيل لا من نسخةٍ مكتوبةٍ هنا**: فمن
-- يضيف طريقاً جديدةً للبصمة غداً يجدها الفحصُ ناقصةً فى سجلّ الحضور،
-- **فلا يفترق البيتان بصمت**.

CREATE OR REPLACE FUNCTION public.assert_baseline_v3_74_985_check()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_raw text[];
  v_rec text[];
  v_missing text[];
BEGIN
  -- العمودان موجودان
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'attendance_records' AND column_name = 'branch_id'
  ) THEN
    RAISE EXCEPTION 'BASELINE FAIL: سجلُّ الحضور بلا فرع (v3.74.985)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'attendance_records' AND column_name = 'source'
  ) THEN
    RAISE EXCEPTION 'BASELINE FAIL: سجلُّ الحضور بلا مصدر (v3.74.985)';
  END IF;

  -- القيدُ مركَّبٌ ومُفعَّل
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE NOT t.tgisinternal AND c.relname = 'attendance_records'
      AND t.tgname = 'trg_attendance_record_origin' AND t.tgenabled = 'O'
  ) THEN
    RAISE EXCEPTION 'BASELINE FAIL: قيدُ «الحضورُ يقول من أين جاء» غيرُ مركَّبٍ أو مُعطَّل (v3.74.985)';
  END IF;

  -- والمفرداتُ لا تفترق: كلُّ طريقٍ تقبلها البصمةُ الخامُّ يقبلها يومُ الحضور
  SELECT array_agg(DISTINCT m[1] ORDER BY m[1]) INTO v_raw
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public',
  LATERAL regexp_matches(pg_get_constraintdef(con.oid), '''([a-z_]+)''::text', 'g') AS m
  WHERE c.relname = 'attendance_raw_logs' AND con.conname = 'attendance_raw_logs_source_check';

  SELECT array_agg(DISTINCT m[1] ORDER BY m[1]) INTO v_rec
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public',
  LATERAL regexp_matches(pg_get_constraintdef(con.oid), '''([a-z_]+)''::text', 'g') AS m
  WHERE c.relname = 'attendance_records' AND con.conname = 'attendance_records_source_check';

  IF v_raw IS NULL OR array_length(v_raw, 1) IS NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: لم أجد مفرداتِ مصدر البصمة — ولا أحكم بلا مقياس (v3.74.985)';
  END IF;
  IF v_rec IS NULL OR array_length(v_rec, 1) IS NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: لم أجد مفرداتِ مصدر سجلّ الحضور (v3.74.985)';
  END IF;

  SELECT array_agg(x ORDER BY x) INTO v_missing
  FROM unnest(v_raw) AS x
  WHERE NOT (x = ANY (v_rec));

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: طريقٌ تقبلها البصمةُ ولا يقبلها سجلُّ الحضور: % (v3.74.985)', array_to_string(v_missing, ' · ');
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_74_985_check() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_74_985_check() FROM anon;
GRANT EXECUTE ON FUNCTION public.assert_baseline_v3_74_985_check() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- ٤) ولا تمرّ الدفعةُ إلّا بعد أن تُثبت نفسَها بالتشغيل
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_rows bigint;
BEGIN
  SELECT count(*) INTO v_rows FROM public.attendance_records;
  RAISE NOTICE 'v3.74.985 · سجلّاتُ حضورٍ قائمة: % (لا ماضىَ يُحاكَم)', v_rows;

  PERFORM public.assert_baseline_v3_74_985_check();
  RAISE NOTICE 'v3.74.985 · تمّت وأثبتت نفسَها.';
END $$;
