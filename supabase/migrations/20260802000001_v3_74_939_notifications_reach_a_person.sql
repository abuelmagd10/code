-- v3.74.939 — إشعارٌ يصل إلى إنسان، وحارسٌ لا يصيح بلا ذئب
-- ===========================================================================
--
-- عطبان مقيسان على الإنتاج (٢ أغسطس ٢٠٢٦):
--
-- ‏(أ) **٣٥ إشعاراً غير مقروءٍ موجَّهةٌ إلى أدوارٍ لا يحملها أحد** فى الشركة
--     الرئيسية: `general_manager` (١٨) و`admin` (١٤) و`warehouse_manager` (٣)
--     — وصفرُ أعضاءٍ بهذه الأدوار **فى كل الشركات** (الأدوارُ المستعملة
--     فعلاً: owner · manager · accountant · store_manager ·
--     purchasing_officer · manufacturing_officer · staff).
--     **واعتمادٌ يُرسَل إلى دورٍ فارغ اعتمادٌ لا يصل**، ولا شىءَ يقول ذلك.
--
-- ‏(ب) **`ic_stale_critical_notifications` تصيح بلا ذئب**: كُتبت فى 215 لتشترط
--     أن يكون العملُ ما زال معلَّقاً، لكنها تعرف ستةَ `reference_type` فقط
--     وما عداها يسقط على `ELSE TRUE` فيُعدّ دائماً. والخمسةُ التى بلَّغت عنها
--     اليوم **كلُّها تشير إلى `PRET-5689` وحالتُه `completed`**. والمقيس: ٢٤
--     نوعاً من ٣٠ غيرُ مغطّى، تحمل ١٦٥ إشعاراً حرجاً/عالياً.
--
-- ═══ ولماذا مُحفِّزٌ لا دالة؟ ═══
--
-- `create_notification` موجودة، **لكن أربعاً وعشرين دالةً تُدرج فى
-- `notifications` مباشرةً وتتخطّاها** (وتسعٌ فقط تناديها) — مقيسٌ بقراءة
-- أجساد الدوال. فقاعدةٌ تُكتب فى الدالة **مسكِّن**: نفسُ درس 935 حين ثبت أن
-- تضييقَ السياسة placebo ما دام المسارُ الحقيقىُّ دالةً مخوَّلة.
--
-- **فمكانُ القاعدة الجدولُ نفسُه.** مُحفِّزُ `BEFORE INSERT` لا يتخطّاه كاتبٌ
-- واحد، ولا يحتاج لمسَ أربعٍ وعشرين دالة، ولا يُنسى مع الكاتب الخامس والعشرين.
--
-- ═══ وقرارُ المالك حرفياً: «يُحوَّل إلى المالك، ويُقال» ═══
--
-- لا يُسقَط الإشعار، ولا يُترك معلَّقاً فى الهواء: يُحوَّل إلى مالك الشركة،
-- **ويُذكر الدورُ المقصود فى نصّه** — فيبقى النقصُ مرئياً بدل أن يبتلعه
-- التحويل. وتحويلٌ صامتٌ كان سيُخفى أن الشركة تنقصها وظيفة.
-- ===========================================================================

-- ───────────────────────────────────────────────────────────────────────────
-- ‏(١) هل هذه الحالةُ ما زالت مفتوحة؟ — حكمٌ واحدٌ لكل المستندات
-- ───────────────────────────────────────────────────────────────────────────
--
-- ⚠️ **تُعدّ الحالاتُ المنتهيةُ لا المعلَّقة، والباقى مفتوحٌ افتراضاً.**
-- والسببُ ليس ذوقاً: مفرداتُ «المعلَّق» تختلف من جدولٍ لآخر وتطول مع كل
-- ميزة (`pending_admin_approval` · `pending_warehouse` · `partial_approval` ·
-- `management_approved` …)، أما المنتهيةُ فقليلةٌ ومشتركة. فحالةٌ جديدةٌ
-- تُضاف غداً تُعدّ **مفتوحة** — أى تُرى ويُسأل عنها، لا تُبتلع بصمت.
--
-- والمفرداتُ أدناه مقروءةٌ من قيود `CHECK` الحيّة لا مُخمَّنة:
--   booking_stock_withdrawals · bookings · customer_refund_requests ·
--   manufacturing_* · purchase_returns · sales_return_requests ·
--   vendor_payment_correction_requests
CREATE OR REPLACE FUNCTION public.workflow_status_is_open(p_status text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN COALESCE(trim(p_status), '') = '' THEN TRUE          -- بلا حالة ⇒ مفتوح
    WHEN lower(p_status) LIKE '%reject%'  THEN FALSE
    WHEN lower(p_status) LIKE '%cancel%'  THEN FALSE
    WHEN lower(p_status) LIKE '%void%'    THEN FALSE
    WHEN lower(trim(p_status)) IN (
           'approved', 'approved_completed', 'executed', 'completed', 'closed',
           'applied', 'paid', 'billed', 'no_show', 'refund_recorded',
           'not_applicable', 'archived', 'expired')           THEN FALSE
    ELSE TRUE
  END;
$function$;

REVOKE ALL    ON FUNCTION public.workflow_status_is_open(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workflow_status_is_open(text) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- ‏(٢) هل الصفُّ الذى يشير إليه الإشعار ما زال يحتاج عملاً؟
-- ───────────────────────────────────────────────────────────────────────────
--
-- ثلاثُ إجاباتٍ لا اثنتان:
--   TRUE  — وُجد الصفُّ وما زال مفتوحاً  ⇒ قرارٌ فائت، يُبلَّغ عنه.
--   FALSE — وُجد الصفُّ وانتهى عملُه      ⇒ سطرُ سجلٍّ لا إنذار.
--   NULL  — **لم يُوجد الصفُّ فى أى جدول** ⇒ لا يُدَّعى عليه شىء، ويُقال
--           صراحةً أنه غيرُ متحقَّقٍ منه (دَينٌ مرئىٌّ لا إنذارٌ كاذب).
--
-- ⚠️ ولماذا بحثٌ بالمُعرِّف لا `CASE` على `reference_type`؟ لأن الأخيرة هى
-- بعينها التى ولّدت العطب: نوعٌ لا يُذكر يسقط على `ELSE TRUE`. والمُعرِّفُ
-- `uuid` لا يتصادم، **و`approval_request` يحمل مُعرِّفَ المستند نفسِه لا
-- مُعرِّفَ طلبِ اعتماد** (مقيسٌ على `PRET-5689`) — فالبحثُ بالمعرِّف يصيب
-- حيث تُخطئ المطابقةُ بالاسم.
--
-- والستةُ الأولى تحتفظ بمنطق 215 حرفياً (كان مقصوداً ومقيساً)، والباقى
-- يُحكم عليه بالحكم الواحد أعلاه.
CREATE OR REPLACE FUNCTION public.workflow_row_is_open(p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE v boolean;
BEGIN
  IF p_id IS NULL THEN RETURN NULL; END IF;

  -- ── الستةُ التى غطّتها 215، بمنطقها كما هو ──────────────────────────────
  SELECT (COALESCE(b.status,'') IN ('draft','pending_approval','received')
          AND COALESCE(b.paid_amount,0) < COALESCE(b.total_amount,0))
    INTO v FROM bills b WHERE b.id = p_id;
  IF FOUND THEN RETURN v; END IF;

  SELECT (COALESCE(i.status,'') IN ('draft','sent','partially_paid')
          AND COALESCE(i.approval_status,'') IN ('pending',''))
    INTO v FROM invoices i WHERE i.id = p_id;
  IF FOUND THEN RETURN v; END IF;

  SELECT (COALESCE(po.status,'') IN ('draft','pending_approval','pending_director','pending_manager','sent_to_supplier'))
    INTO v FROM purchase_orders po WHERE po.id = p_id;
  IF FOUND THEN RETURN v; END IF;

  SELECT (COALESCE(t.status,'') IN ('draft','pending_approval','in_transit'))
    INTO v FROM inventory_transfers t WHERE t.id = p_id;
  IF FOUND THEN RETURN v; END IF;

  SELECT (COALESCE(p.status,'') IN ('pending_approval','pending_manager','pending_director'))
    INTO v FROM payments p WHERE p.id = p_id;
  IF FOUND THEN RETURN v; END IF;

  SELECT (COALESCE(e.status,'') IN ('draft','pending_approval'))
    INTO v FROM expenses e WHERE e.id = p_id;
  IF FOUND THEN RETURN v; END IF;

  -- ── وما لم تكن 215 تعرفه ───────────────────────────────────────────────
  -- مرتجعُ الشراء له حالتان: `workflow_status` هى الحاكمة، و`status` احتياط.
  SELECT public.workflow_status_is_open(COALESCE(r.workflow_status, r.status))
    INTO v FROM purchase_returns r WHERE r.id = p_id;
  IF FOUND THEN RETURN v; END IF;

  SELECT public.workflow_status_is_open(a.status) INTO v FROM approval_requests a WHERE a.id = p_id;
  IF FOUND THEN RETURN v; END IF;
  SELECT public.workflow_status_is_open(a.status) INTO v FROM approval_requests a WHERE a.document_id = p_id;
  IF FOUND THEN RETURN v; END IF;

  SELECT public.workflow_status_is_open(x.status) INTO v FROM bookings x WHERE x.id = p_id;
  IF FOUND THEN RETURN v; END IF;
  SELECT public.workflow_status_is_open(x.status) INTO v FROM booking_stock_withdrawals x WHERE x.id = p_id;
  IF FOUND THEN RETURN v; END IF;
  SELECT public.workflow_status_is_open(x.status) INTO v FROM sales_return_requests x WHERE x.id = p_id;
  IF FOUND THEN RETURN v; END IF;
  SELECT public.workflow_status_is_open(x.status) INTO v FROM customer_refund_requests x WHERE x.id = p_id;
  IF FOUND THEN RETURN v; END IF;
  SELECT public.workflow_status_is_open(x.status) INTO v FROM vendor_credits x WHERE x.id = p_id;
  IF FOUND THEN RETURN v; END IF;
  SELECT public.workflow_status_is_open(x.status) INTO v FROM vendor_payment_correction_requests x WHERE x.id = p_id;
  IF FOUND THEN RETURN v; END IF;
  SELECT public.workflow_status_is_open(x.status) INTO v FROM subscriptions x WHERE x.id = p_id;
  IF FOUND THEN RETURN v; END IF;
  SELECT public.workflow_status_is_open(x.status) INTO v FROM sales_orders x WHERE x.id = p_id;
  IF FOUND THEN RETURN v; END IF;
  SELECT public.workflow_status_is_open(x.status) INTO v FROM manufacturing_production_orders x WHERE x.id = p_id;
  IF FOUND THEN RETURN v; END IF;
  SELECT public.workflow_status_is_open(x.status) INTO v FROM manufacturing_material_issue_approvals x WHERE x.id = p_id;
  IF FOUND THEN RETURN v; END IF;
  SELECT public.workflow_status_is_open(x.status) INTO v FROM manufacturing_product_receive_approvals x WHERE x.id = p_id;
  IF FOUND THEN RETURN v; END IF;
  SELECT public.workflow_status_is_open(x.status) INTO v FROM manufacturing_bom_versions x WHERE x.id = p_id;
  IF FOUND THEN RETURN v; END IF;
  SELECT public.workflow_status_is_open(x.status) INTO v FROM manufacturing_routing_versions x WHERE x.id = p_id;
  IF FOUND THEN RETURN v; END IF;

  RETURN NULL;   -- لا صفَّ له فى أى جدولٍ نعرفه: يُقال، ولا يُدَّعى
END
$function$;

REVOKE ALL    ON FUNCTION public.workflow_row_is_open(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workflow_row_is_open(uuid) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- ‏(٣) هل لهذا الدور عضوٌ فى هذه الشركة؟ — حكمٌ واحد، بيتٌ واحد
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.company_role_has_holder(p_company_id uuid, p_role text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members m
     WHERE m.company_id = p_company_id
       AND lower(trim(replace(m.role, ' ', '_'))) = lower(trim(replace(p_role, ' ', '_')))
  );
$function$;

REVOKE ALL    ON FUNCTION public.company_role_has_holder(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_role_has_holder(uuid, text) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- ‏(٤) المُحفِّز: لا إشعارَ يُرسَل إلى فراغ
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notifications_route_to_a_person()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE v_owner uuid; v_role text;
BEGIN
  -- مُوجَّهٌ إلى شخصٍ بعينه، أو بلا دور: لا شأنَ لنا به.
  IF NEW.assigned_to_user IS NOT NULL OR NEW.assigned_to_role IS NULL THEN
    RETURN NEW;
  END IF;

  -- للدور عضوٌ يحمله: يُترك كما هو. **وهذا نصفُ الحكم**: حارسٌ يحوّل كلَّ
  -- شىءٍ لا يحرس شيئاً، ولا بد أن يُرى وهو يُبقى البرىء.
  IF public.company_role_has_holder(NEW.company_id, NEW.assigned_to_role) THEN
    RETURN NEW;
  END IF;

  SELECT m.user_id INTO v_owner
    FROM public.company_members m
   WHERE m.company_id = NEW.company_id
     AND lower(trim(replace(m.role, ' ', '_'))) = 'owner'
   LIMIT 1;

  IF v_owner IS NULL THEN
    SELECT c.user_id INTO v_owner FROM public.companies c WHERE c.id = NEW.company_id;
  END IF;

  -- لا مالكَ أصلاً: **يبقى الإشعارُ كما هو ولا يُسقَط**. إسقاطُ إشعارٍ
  -- لتعذُّر توجيهه أسوأُ من إشعارٍ سيّئ التوجيه، وهذه الحالُ تُقاس فى
  -- الحارس (صفرُ شركاتٍ بلا مالك، مقيس).
  IF v_owner IS NULL THEN
    RETURN NEW;
  END IF;

  v_role := NEW.assigned_to_role;
  NEW.assigned_to_user := v_owner;
  NEW.assigned_to_role := NULL;
  NEW.message := COALESCE(NEW.message, '')
    || E'\n\n⚠️ [v3.74.939] كان هذا الإشعارُ موجَّهاً إلى دور «' || v_role
    || E'» ولا عضوَ يحمله فى شركتك، فحُوِّل إليك. عيِّن عضواً لهذا الدور كى يصل إلى صاحبه.';
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.notifications_route_to_a_person() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_notifications_route_to_a_person ON public.notifications;
CREATE TRIGGER trg_notifications_route_to_a_person
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.notifications_route_to_a_person();

-- ───────────────────────────────────────────────────────────────────────────
-- ‏(٥) الفحصُ يقول ما يعرف، ويُسمّى ما لا يعرف
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ic_stale_critical_notifications(p_company_id uuid)
 RETURNS TABLE(severity text, detail jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE v_pending integer; v_unknown integer;
BEGIN
  SELECT COUNT(*) FILTER (WHERE s.still_open IS TRUE),
         COUNT(*) FILTER (WHERE s.still_open IS NULL)
    INTO v_pending, v_unknown
    FROM notifications n
    CROSS JOIN LATERAL (SELECT public.workflow_row_is_open(n.reference_id) AS still_open) s
   WHERE n.company_id = p_company_id
     AND n.priority IN ('critical','high')
     AND n.read_at IS NULL
     AND n.created_at < NOW() - INTERVAL '30 days';

  -- إنذارٌ حقيقى: عملٌ ما زال معلَّقاً ولم يقرأه أحد منذ شهر.
  IF COALESCE(v_pending, 0) > 0 THEN
    severity := 'low';
    detail := jsonb_build_object(
      'unread_critical_count', v_pending,
      'hint','Critical or high-priority notifications unread > 30 days, and the underlying workflow is still pending action.');
    RETURN NEXT;
  END IF;

  -- ودَينٌ مرئى: إشعاراتٌ لا نعرف مستنداتِها، **فلا يُدَّعى أنها معلَّقة**.
  -- تُقال بعددها وأنواعها كى تُغطّى، لا كى تُبتلع.
  IF COALESCE(v_unknown, 0) > 0 THEN
    severity := 'low';
    detail := jsonb_build_object(
      'unverified_count', v_unknown,
      'reference_types', (
        SELECT COALESCE(jsonb_object_agg(t.reference_type, t.n), '{}'::jsonb) FROM (
          SELECT n2.reference_type, COUNT(*) AS n
            FROM notifications n2
           WHERE n2.company_id = p_company_id
             AND n2.priority IN ('critical','high')
             AND n2.read_at IS NULL
             AND n2.created_at < NOW() - INTERVAL '30 days'
             AND public.workflow_row_is_open(n2.reference_id) IS NULL
           GROUP BY n2.reference_type) t),
      'hint','Old unread notifications whose source document could not be found - their state is UNVERIFIED, not pending. Add the table to workflow_row_is_open to cover them.');
    RETURN NEXT;
  END IF;
END
$function$;

REVOKE ALL    ON FUNCTION public.ic_stale_critical_notifications(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ic_stale_critical_notifications(uuid) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- ‏(٦) والقائمُ يُعالَج: ما عملُه معلَّقٌ يُحوَّل، والمنتهى يُترك سطرَ سجل
-- ───────────────────────────────────────────────────────────────────────────
--
-- ⚠️ **لا يُحوَّل كلُّ شىء.** إشعارٌ عن عملٍ انتهى ليس قراراً فائتاً؛ تحويلُه
-- إلى المالك ضجيجٌ يُعلِّمه تجاهُلَ صندوقه. فيُحوَّل **ما ثبت أنه ما زال
-- مفتوحاً** وحده، ويبقى الباقى كما هو.
DO $$
DECLARE r RECORD; v_owner uuid; v_moved integer := 0; v_left integer := 0;
BEGIN
  FOR r IN
    SELECT n.id, n.company_id, n.assigned_to_role, n.message
      FROM public.notifications n
     WHERE n.assigned_to_user IS NULL
       AND n.assigned_to_role IS NOT NULL
       AND n.read_at IS NULL
       AND NOT public.company_role_has_holder(n.company_id, n.assigned_to_role)
  LOOP
    IF public.workflow_row_is_open((SELECT n2.reference_id FROM public.notifications n2 WHERE n2.id = r.id)) IS NOT TRUE THEN
      v_left := v_left + 1;
      CONTINUE;
    END IF;

    SELECT m.user_id INTO v_owner FROM public.company_members m
     WHERE m.company_id = r.company_id
       AND lower(trim(replace(m.role,' ','_'))) = 'owner' LIMIT 1;
    IF v_owner IS NULL THEN
      SELECT c.user_id INTO v_owner FROM public.companies c WHERE c.id = r.company_id;
    END IF;
    IF v_owner IS NULL THEN v_left := v_left + 1; CONTINUE; END IF;

    UPDATE public.notifications
       SET assigned_to_user = v_owner,
           assigned_to_role = NULL,
           message = COALESCE(message,'')
                  || E'\n\n⚠️ [v3.74.939] كان هذا الإشعارُ موجَّهاً إلى دور «' || r.assigned_to_role
                  || E'» ولا عضوَ يحمله فى شركتك، فحُوِّل إليك. عيِّن عضواً لهذا الدور كى يصل إلى صاحبه.'
     WHERE id = r.id;
    v_moved := v_moved + 1;
  END LOOP;

  RAISE NOTICE 'v3.74.939 backfill: % rerouted (workflow still open), % left as a log line', v_moved, v_left;
END $$;
