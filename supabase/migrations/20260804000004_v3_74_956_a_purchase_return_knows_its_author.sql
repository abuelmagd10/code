-- v3.74.956 — مرتجعُ المشتريات يعرف صاحبَه
-- ============================================================================
-- عطبٌ واحدٌ كان يُنتج ثلاثةَ أعراض: created_by لا يُختم عند الإنشاء.
--   • مُشغِّلُ الإشعار يبنى المُرسِلَ من NEW.created_by، فيصل NULL إلى عمودٍ
--     NOT NULL فى notifications ⇒ 23502، ويسقط المرتجعُ كلُّه.
--   • ومُشغِّلُ الاعتماد يقرأ دورَ المُنشئ من created_by؛ وإذ يجده فارغاً
--     يعامل **المالكَ نفسَه** معاملةَ الغريب فيمنعه من الإنشاء المعتمَد.
--   • ولا يبقى فى السجلّ أثرٌ لمن أنشأ المرتجع.
-- فالختمُ التلقائىُّ يُصلح الثلاثةَ من جذرٍ واحد.
--
-- وقاعدةُ مَن يُنشئ، بنصِّ صاحب العمل:
--   المالك            — بلا اعتماد
--   المدير العام      — باعتماد المالك
--   المحاسب           — فرعُه وحدَه، باعتماد المالك أو المدير العام
--   مسئول المشتريات   — فرعُه وحدَه، باعتماد المالك أو المدير العام
-- وما عداهم لا يُنشئ. وقاعدةُ الاعتماد نفسُها مطبَّقةٌ سلفاً فى
-- purchase_return_approval_insert_trg، ولم تكن تعمل إلا لأنّ الختمَ غائب.
--
-- وقد خرج «مديرُ الفرع» (manager) من قائمة المسموح لهم، وكان فيها قبل اليوم،
-- لأنّه ليس فى نصِّ القاعدة الذى أملاه صاحبُ العمل. وإعادتُه سطرٌ واحد.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.purchase_return_set_created_by_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$function$;

-- الاسمُ بـ aa عن قصد: مُشغِّلاتُ الحدث الواحد تعمل بترتيبٍ أبجدى، والختمُ
-- يجب أن يسبق مُشغِّلَ الاعتماد الذى يقرأ منه دورَ المُنشئ.
DROP TRIGGER IF EXISTS aa_purchase_return_set_created_by ON public.purchase_returns;
CREATE TRIGGER aa_purchase_return_set_created_by
  BEFORE INSERT ON public.purchase_returns
  FOR EACH ROW
  EXECUTE FUNCTION public.purchase_return_set_created_by_trg();

CREATE OR REPLACE FUNCTION public.purchase_return_notify_approval_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_supplier_name text; v_requester uuid; v_approver_id uuid; v_currency text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NEW.status <> 'pending_approval' THEN RETURN NEW; END IF;

  -- v3.74.956 — عمودُ created_by فى notifications لا يقبل الفراغ. فالمُرسِلُ
  -- هو المُنشئ، فإن غاب فصاحبُ الشركة — ولا يسقط المستندُ من أجل إشعار.
  v_requester := COALESCE(
    NEW.created_by,
    auth.uid(),
    (SELECT c.user_id FROM public.companies c WHERE c.id = NEW.company_id)
  );

  v_currency  := COALESCE(NEW.original_currency, 'EGP');
  BEGIN
    SELECT name INTO v_supplier_name FROM public.suppliers WHERE id = NEW.supplier_id;
  EXCEPTION WHEN OTHERS THEN v_supplier_name := NULL; END;

  IF v_requester IS NULL THEN
    RAISE WARNING 'v3.74.956: مرتجعٌ % بلا مُنشئٍ ولا مالكٍ للشركة — لم يُرسَل طلبُ الاعتماد.', NEW.return_number;
    RETURN NEW;
  END IF;

  FOR v_approver_id IN
    SELECT DISTINCT u FROM (
      SELECT user_id AS u FROM public.companies WHERE id = NEW.company_id
      UNION
      SELECT user_id FROM public.company_members
       WHERE company_id = NEW.company_id
         AND role IN ('owner', 'general_manager')
    ) approvers
    WHERE u IS NOT NULL AND u <> v_requester
  LOOP
    INSERT INTO public.notifications (
      company_id, reference_type, reference_id, created_by,
      assigned_to_user, title, message,
      priority, severity, category, channel, created_at
    ) VALUES (
      NEW.company_id, 'approval_request', NEW.id, v_requester,
      v_approver_id,
      'طلب اعتماد مرتجع مشتريات',
      'مرتجع ' || NEW.return_number ||
      CASE WHEN v_supplier_name IS NOT NULL THEN ' للمورد ' || v_supplier_name ELSE '' END ||
      ' بقيمة ' || NEW.total_amount::text || ' ' || v_currency ||
      ' — يحتاج اعتمادك من صندوق الموافقات.',
      'high', 'warning', 'approvals', 'in_app', NOW()
    );
  END LOOP;
  RETURN NEW;
END;
$function$;

DROP POLICY IF EXISTS purchase_returns_insert ON public.purchase_returns;
CREATE POLICY purchase_returns_insert
  ON public.purchase_returns
  FOR INSERT
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND (
      -- المالكُ المسجَّل للشركة، ولو لم يكن عضواً
      EXISTS (
        SELECT 1 FROM public.companies c
         WHERE c.id = purchase_returns.company_id AND c.user_id = auth.uid()
      )
      -- المالكُ والمدير العام: بلا قيدِ فرع
      OR EXISTS (
        SELECT 1 FROM public.company_members cm
         WHERE cm.company_id = purchase_returns.company_id
           AND cm.user_id = auth.uid()
           AND lower(btrim(cm.role)) IN ('owner', 'admin', 'general_manager', 'gm', 'generalmanager')
      )
      -- المحاسبُ ومسئولُ المشتريات: فرعُهم وحدَه
      OR (
        EXISTS (
          SELECT 1 FROM public.company_members cm
           WHERE cm.company_id = purchase_returns.company_id
             AND cm.user_id = auth.uid()
             AND lower(btrim(cm.role)) IN ('accountant', 'purchasing_officer')
        )
        AND public.can_access_record_branch(purchase_returns.company_id, purchase_returns.branch_id)
      )
    )
  );
