-- v3.74.953 — ثلاثةُ جداولَ أخرى تُرى ساعةَ الميلاد
-- ============================================================================
-- امتدادُ ٩٥٢ إلى ما قِيس أنّه مكسورٌ بنفس العلّة. القياسُ (٤ أغسطس ٢٠٢٦،
-- قاعدةُ الإنتاج، بهوية المالك، وكلُّ محاولةٍ داخل معاملةٍ أُرجعت):
--
--   purchase_returns        بلا RETURNING: نجح   ·  مع RETURNING: 42501
--   purchase_return_items   بلا RETURNING: نجح   ·  مع RETURNING: 42501
--   bookings                بلا RETURNING: 42501 على booking_status_history
--                           مع RETURNING: 42501 على bookings
--
-- فالحجوزاتُ فيها عطبان لا عطبٌ واحد، وكلاهما يُعالَج هنا.
--
-- والكياناتُ القانونيةُ ومجموعاتُ التوحيد مكسورةٌ أيضاً (قِيس)، ولا تُعالَج
-- هنا عن عمد: جدولاهما لا يحملان رقمَ شركةٍ ولا اسمَ منشئ — لا عمودَ يُقرأ
-- ليُقال «هذا لك». علاجُهما أن يصير الإنشاءُ والربطُ خطوةً واحدة، وذلك
-- تغييرُ طريقةٍ لا تصحيحُ قاعدة. مسجَّلٌ ديناً.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- (١) مرتجعاتُ المشتريات
-- ════════════════════════════════════════════════════════════════════════════
-- نفسُ الحكم حرفاً بحرف، إلا أنّ الشركةَ والفرعَ والمنشئ تصل **وسائطَ من
-- الصفّ** بدل أن تُستخرج بالبحث عنه. وما بقى من الحكم يسأل جداولَ الأبناء
-- بمعرِّف الرأس — وذلك سؤالٌ مشروع، فالأبناءُ ليسوا هم الصفَّ الوليد.
CREATE OR REPLACE FUNCTION public.can_access_purchase_return_row(
  p_return_id   uuid,
  p_company_id  uuid,
  p_branch_id   uuid,
  p_created_by  uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_mine UUID;
BEGIN
  IF p_company_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF public.current_user_is_branch_unbounded(p_company_id) THEN
    RETURN TRUE;
  END IF;

  v_mine := public.current_user_branch_id(p_company_id);
  IF v_mine IS NULL THEN
    RETURN FALSE;
  END IF;

  -- مرتجعُ فرعٍ واحد: فرعُه أو لا شىء.
  IF p_branch_id IS NOT NULL THEN
    RETURN p_branch_id = v_mine;
  END IF;

  -- مرتجعٌ بلا فرعٍ وبلا بندٍ ولا تخصيص: وليدٌ لم يُوزَّع بعد، يراه منشئُه
  -- وحدَه. وهذه الحالةُ تزول فى اللحظة التالية حين يُضاف أوّلُ بند، ولا
  -- ينطبق منها شىءٌ على أىِّ صفٍّ قائم (قِيس: صفرٌ من الصفوف بلا فرع).
  IF p_created_by IS NOT NULL AND p_created_by = auth.uid()
     AND NOT EXISTS (
       SELECT 1 FROM public.purchase_return_items i
        WHERE i.purchase_return_id = p_return_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.purchase_return_warehouse_allocations a
        WHERE a.purchase_return_id = p_return_id) THEN
    RETURN TRUE;
  END IF;

  -- مرتجعٌ متعدد المخازن: يُرى إن كان لفرعى نصيبٌ فيه.
  RETURN EXISTS (
    SELECT 1 FROM public.purchase_return_warehouse_allocations a
     WHERE a.purchase_return_id = p_return_id AND a.branch_id = v_mine
  ) OR EXISTS (
    SELECT 1 FROM public.purchase_return_items i
      JOIN public.warehouses w ON w.id = i.warehouse_id
     WHERE i.purchase_return_id = p_return_id AND w.branch_id = v_mine
  );
END;
$function$;

-- والدالةُ القديمة تبقى — يستعملها غيرُها بمعناها الصحيح (إشارةً إلى رأسٍ
-- قائم) — لكنّها صارت غلافاً، فبيتُ الحكم واحد.
CREATE OR REPLACE FUNCTION public.can_access_purchase_return(p_return_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_company UUID;
  v_branch  UUID;
  v_creator UUID;
BEGIN
  SELECT pr.company_id, pr.branch_id, pr.created_by
    INTO v_company, v_branch, v_creator
    FROM public.purchase_returns pr
   WHERE pr.id = p_return_id;

  IF v_company IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN public.can_access_purchase_return_row(p_return_id, v_company, v_branch, v_creator);
END;
$function$;

DROP POLICY IF EXISTS purchase_returns_select_branch_isolation ON public.purchase_returns;
CREATE POLICY purchase_returns_select_branch_isolation
  ON public.purchase_returns
  FOR SELECT
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_purchase_return_row(id, company_id, branch_id, created_by)
  );

-- ════════════════════════════════════════════════════════════════════════════
-- (٢) بنودُ مرتجعات المشتريات
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.can_access_purchase_return_item_row(
  p_return_id      uuid,
  p_warehouse_id   uuid,
  p_allocation_id  uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_company     UUID;
  v_head_branch UUID;
  v_mine        UUID;
BEGIN
  IF p_return_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT pr.company_id, pr.branch_id
    INTO v_company, v_head_branch
    FROM public.purchase_returns pr
   WHERE pr.id = p_return_id;

  IF v_company IS NULL THEN
    RETURN FALSE;
  END IF;

  -- البند لا يُقرأ إن كان رأسُه محجوباً. والرأسُ قائمٌ دائماً حين يُولد بندُه.
  IF NOT public.can_access_purchase_return(p_return_id) THEN
    RETURN FALSE;
  END IF;

  IF public.current_user_is_branch_unbounded(v_company) THEN
    RETURN TRUE;
  END IF;

  -- رأسٌ بفرعٍ واحد وقد مرّ: بنودُه كلُّها لذلك الفرع.
  IF v_head_branch IS NOT NULL THEN
    RETURN TRUE;
  END IF;

  v_mine := public.current_user_branch_id(v_company);
  IF v_mine IS NULL THEN
    RETURN FALSE;
  END IF;

  IF p_allocation_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.purchase_return_warehouse_allocations a
       WHERE a.id = p_allocation_id AND a.branch_id = v_mine
    );
  END IF;

  IF p_warehouse_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.warehouses w
       WHERE w.id = p_warehouse_id AND w.branch_id = v_mine
    );
  END IF;

  RETURN FALSE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.can_access_purchase_return_item(p_item_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_return     UUID;
  v_warehouse  UUID;
  v_allocation UUID;
BEGIN
  SELECT i.purchase_return_id, i.warehouse_id, i.warehouse_allocation_id
    INTO v_return, v_warehouse, v_allocation
    FROM public.purchase_return_items i
   WHERE i.id = p_item_id;

  IF v_return IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN public.can_access_purchase_return_item_row(v_return, v_warehouse, v_allocation);
END;
$function$;

DROP POLICY IF EXISTS purchase_return_items_select_branch_isolation ON public.purchase_return_items;
CREATE POLICY purchase_return_items_select_branch_isolation
  ON public.purchase_return_items
  FOR SELECT
  USING (
    public.can_access_purchase_return_item_row(
      purchase_return_id, warehouse_id, warehouse_allocation_id)
  );

-- ════════════════════════════════════════════════════════════════════════════
-- (٣) الحجوزات — عطبان
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.can_access_booking_row(
  p_booking_id  uuid,
  p_company_id  uuid,
  p_branch_id   uuid,
  p_creator     uuid,
  p_staff       uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_vis TEXT;
BEGIN
  IF p_company_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF NOT public.is_company_member(p_company_id) THEN
    RETURN FALSE;
  END IF;

  v_vis := public.current_user_resource_visibility(p_company_id, 'bookings');

  IF v_vis = 'company' THEN
    RETURN TRUE;
  END IF;

  IF v_vis = 'branch' THEN
    RETURN p_branch_id IS NULL OR p_branch_id = public.current_user_branch_id(p_company_id);
  END IF;

  IF v_vis = 'own' THEN
    -- التكليفُ القائم يعبر الجدار: هذا عملٌ أُسند إليه.
    IF p_staff IS NOT NULL AND p_staff = auth.uid() THEN
      RETURN TRUE;
    END IF;

    IF public.is_booking_assignee(p_booking_id) THEN
      RETURN TRUE;
    END IF;

    -- والإنشاءُ وحده لا يعبره (قاعدة 922)، وكذلك حجزٌ بلا موظفٍ مسنَد.
    IF (p_creator = auth.uid() OR p_staff IS NULL)
       AND public.can_access_record_branch(p_company_id, p_branch_id) THEN
      RETURN TRUE;
    END IF;
  END IF;

  -- والمشاركةُ لا تعبر الجدار (قاعدة 922).
  RETURN public.has_shared_access(p_company_id, 'bookings', p_creator)
     AND public.can_access_record_branch(p_company_id, p_branch_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.can_access_booking(p_booking_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_company UUID;
  v_branch  UUID;
  v_creator UUID;
  v_staff   UUID;
BEGIN
  SELECT b.company_id, b.branch_id, b.created_by_user_id, b.staff_user_id
    INTO v_company, v_branch, v_creator, v_staff
    FROM public.bookings b
   WHERE b.id = p_booking_id;

  IF v_company IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN public.can_access_booking_row(p_booking_id, v_company, v_branch, v_creator, v_staff);
END;
$function$;

DROP POLICY IF EXISTS bookings_select_branch_isolation ON public.bookings;
CREATE POLICY bookings_select_branch_isolation
  ON public.bookings
  FOR SELECT
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_booking_row(
          id, company_id, branch_id, created_by_user_id, staff_user_id)
  );

-- العطبُ الثانى فى الحجوزات: سجلُّ الحالات ‏booking_status_history سياستُه
-- ‏WITH CHECK (false) — أى «لا يكتب هنا أحد». وهذا صحيحٌ ومقصود: السجلُّ
-- يكتبه النظامُ لا المستخدم. لكنّ المُشغِّلَ الذى يكتبه كان يعمل بصلاحية
-- المستخدم، فارتطم بالجدار وأسقط الحجزَ معه. فيُرفع المُشغِّلُ وحدَه إلى
-- صلاحيةٍ مرتفعة، وتبقى السياسةُ false كما هى: البابُ مغلقٌ على الناس،
-- ومفتوحٌ للنظام وحدَه.
CREATE OR REPLACE FUNCTION public.bkg_trg_record_status_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.booking_status_history (company_id, booking_id, old_status, new_status, changed_by, reason)
    VALUES (NEW.company_id, NEW.id, NULL, NEW.status, NEW.created_by, 'Booking created');
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.booking_status_history (company_id, booking_id, old_status, new_status, changed_by, reason)
    VALUES (NEW.company_id, NEW.id, OLD.status, NEW.status, NEW.updated_by,
      CASE NEW.status WHEN 'confirmed' THEN 'Booking confirmed' WHEN 'in_progress' THEN 'Service started'
        WHEN 'completed' THEN 'Service completed' WHEN 'cancelled' THEN COALESCE(NEW.cancellation_reason,'Booking cancelled')
        WHEN 'no_show' THEN 'Customer no-show' ELSE 'Status updated' END);
  END IF;
  RETURN NEW;
END;
$function$;

-- ── الأذون: نفسُ ما تُمنحه أخواتُها ─────────────────────────────────────────
REVOKE ALL ON FUNCTION public.can_access_purchase_return_row(uuid, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_purchase_return_item_row(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_booking_row(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_purchase_return_row(uuid, uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_purchase_return_item_row(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_booking_row(uuid, uuid, uuid, uuid, uuid) TO authenticated, service_role;
