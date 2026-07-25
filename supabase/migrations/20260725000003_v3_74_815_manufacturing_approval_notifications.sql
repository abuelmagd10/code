-- ============================================================================
-- v3.74.815 — إشعارات اعتمادات التصنيع: سد الفجوتين الباقيتين
-- ============================================================================
-- المراجعة الشاملة لجرس الإشعارات أظهرت أن مديول التصنيع له أربع بوابات
-- اعتماد، لكن القاعدة لا تُخطر إلا عن ثلاث منها:
--
--   ✓ مسار التصنيع        routing_version_notify_approval        (موجود)
--   ✓ أمر الإنتاج          production_order_notify_approval       (موجود)
--   ✓ استلام المنتج التام   product_receive_notify_approval        (موجود)
--   ✗ **نسخة قائمة المواد (BOM)** — لا حارس إشعار إطلاقاً على الجدول
--     manufacturing_bom_versions ⇒ من يرسل نسخة BOM للاعتماد لا يصل
--     المالك/المدير العام أى إشعار، والطلب ينام فى صندوق الموافقات حتى
--     يفتحه أحد بالمصادفة.
--
--   ✗ **قرار الاعتماد لا يعود لصاحب الطلب** فى أى من الأربعة: المعتمِد
--     يوافق أو يرفض فلا يعلم المُنشئ. (نظيره فى المشتريات موجود منذ 792:
--     notify_discount_decision_trg) ⇒ حارس موحّد يُخطر المُنشئ بالقرار
--     وبسبب الرفض إن وُجد.
--
-- كلاهما إصلاح **نظام** يسرى على كل شركة (قاعدة المالك 25/7)، لا تصحيح
-- بيانات: لا صف واحد من صفوف أى شركة يُمس هنا.
-- ملاحظة بنيوية: نسخ BOM تستعمل العمود `status` بينما المسار وأمر الإنتاج
-- يستعملان `approval_status` — لذا حارس BOM مبنى على status.
-- ============================================================================

-- ─── (1) طلب اعتماد نسخة BOM ← المالك والمدير العام ─────────────────────────
CREATE OR REPLACE FUNCTION public.bom_version_notify_approval_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_bom_name text;
  v_requester uuid;
  v_approver_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NEW.status <> 'pending_approval' THEN RETURN NEW; END IF;

  v_requester := COALESCE(NEW.submitted_by, NEW.created_by);

  BEGIN
    SELECT bom_name INTO v_bom_name FROM public.manufacturing_boms WHERE id = NEW.bom_id;
  EXCEPTION WHEN OTHERS THEN v_bom_name := NULL; END;

  FOR v_approver_id IN
    SELECT DISTINCT u FROM (
      SELECT user_id AS u FROM public.companies WHERE id = NEW.company_id
      UNION
      SELECT user_id FROM public.company_members
       WHERE company_id = NEW.company_id
         AND role IN ('owner', 'general_manager')
    ) approvers
    WHERE u IS NOT NULL AND (v_requester IS NULL OR u <> v_requester)
  LOOP
    INSERT INTO public.notifications (
      company_id, branch_id, reference_type, reference_id, created_by,
      assigned_to_user, title, message,
      priority, severity, category, channel, created_at
    ) VALUES (
      NEW.company_id, NEW.branch_id, 'approval_request', NEW.id, v_requester,
      v_approver_id,
      'طلب اعتماد قائمة مواد',
      'نسخة (إصدار ' || NEW.version_no::text || ') من قائمة مواد '
      || COALESCE(v_bom_name, 'بدون اسم')
      || ' — يحتاج اعتمادك من صندوق الموافقات.',
      'high', 'warning', 'approvals', 'in_app', NOW()
    );
  END LOOP;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS bom_version_notify_approval ON manufacturing_bom_versions;
CREATE TRIGGER bom_version_notify_approval
AFTER INSERT OR UPDATE OF status ON public.manufacturing_bom_versions
FOR EACH ROW EXECUTE FUNCTION public.bom_version_notify_approval_trg();

-- ─── (2) نشاط الفرع لنسخ BOM ← مدير الفرع (نظير المسار) ─────────────────────
CREATE OR REPLACE FUNCTION public.bom_version_branch_manager_notify_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_bom_name text;
BEGIN
  BEGIN
    SELECT bom_name INTO v_bom_name FROM public.manufacturing_boms WHERE id = NEW.bom_id;
  EXCEPTION WHEN OTHERS THEN v_bom_name := NULL; END;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_branch_manager(
      NEW.company_id, NEW.branch_id,
      'manufacturing_bom_version', NEW.id, NEW.created_by,
      'نشاط فرعك: تم إنشاء نسخة قائمة مواد',
      'إصدار ' || NEW.version_no::text || ' من قائمة مواد '
      || COALESCE(v_bom_name, '—') || ' فى فرعك.'
    );
    RETURN NEW;
  END IF;

  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status IN ('approved', 'rejected') THEN
    PERFORM public.notify_branch_manager(
      NEW.company_id, NEW.branch_id,
      'manufacturing_bom_version', NEW.id,
      CASE WHEN NEW.status = 'rejected' THEN NEW.rejected_by ELSE NEW.approved_by END,
      'نشاط فرعك: تغيّرت حالة اعتماد قائمة مواد',
      'إصدار ' || NEW.version_no::text || ' من ' || COALESCE(v_bom_name, '—')
      || CASE NEW.status WHEN 'approved' THEN ' تم اعتماده.' WHEN 'rejected' THEN ' تم رفضه.' ELSE '' END
    );
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS bom_version_branch_manager_notify ON manufacturing_bom_versions;
CREATE TRIGGER bom_version_branch_manager_notify
AFTER INSERT OR UPDATE OF status ON public.manufacturing_bom_versions
FOR EACH ROW EXECUTE FUNCTION public.bom_version_branch_manager_notify_trg();

-- ─── (3) القرار يعود لصاحب الطلب — حارس موحّد للثلاثة ───────────────────────
-- يُخطر مُنشئ الطلب (submitted_by ثم created_by) بالاعتماد أو الرفض مع سبب
-- الرفض، بنفس نمط قرار الخصم (792). مكتوب مرة واحدة ويُركّب على الجداول
-- الثلاثة بقراءة اسم العمود المناسب من TG_ARGV.
CREATE OR REPLACE FUNCTION public.manufacturing_notify_decision_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  -- to_jsonb بدل الوصول المباشر بالاسم: الجداول الثلاثة تختلف أعمدتها
  -- (status مقابل approval_status، وبعضها بلا rejection_reason) فقراءة
  -- الحقول من صورة JSON تجعل الحارس الواحد يصلح للثلاثة بلا استثناءات.
  j_old jsonb := to_jsonb(OLD);
  j_new jsonb := to_jsonb(NEW);
  v_old text; v_new text;
  v_requester uuid; v_actor uuid;
  v_label text := TG_ARGV[1];
  v_doc text;
  v_reason text;
BEGIN
  v_old := j_old ->> TG_ARGV[0];
  v_new := j_new ->> TG_ARGV[0];

  IF v_old IS NOT DISTINCT FROM v_new THEN RETURN NEW; END IF;
  IF v_new NOT IN ('approved', 'rejected') THEN RETURN NEW; END IF;

  v_requester := COALESCE((j_new ->> 'submitted_by')::uuid, (j_new ->> 'created_by')::uuid);
  IF v_requester IS NULL THEN RETURN NEW; END IF;

  v_actor := CASE WHEN v_new = 'rejected'
                  THEN (j_new ->> 'rejected_by')::uuid
                  ELSE (j_new ->> 'approved_by')::uuid END;
  -- لا نُخطر المعتمِد بقراره هو
  IF v_actor IS NOT NULL AND v_actor = v_requester THEN RETURN NEW; END IF;

  v_doc    := j_new ->> TG_ARGV[2];
  v_reason := j_new ->> 'rejection_reason';

  INSERT INTO public.notifications (
    company_id, branch_id, reference_type, reference_id, created_by,
    assigned_to_user, title, message,
    priority, severity, category, channel, created_at
  ) VALUES (
    NEW.company_id, NEW.branch_id, 'approval_decision', NEW.id, v_actor,
    v_requester,
    CASE WHEN v_new = 'approved'
         THEN 'تم اعتماد ' || v_label
         ELSE 'تم رفض ' || v_label END,
    v_label || COALESCE(' (' || v_doc || ')', '')
    || CASE WHEN v_new = 'approved' THEN ' تم اعتماده ويمكنك المتابعة.'
            ELSE ' تم رفضه.' END
    || CASE WHEN v_new = 'rejected' AND COALESCE(btrim(v_reason), '') <> ''
            THEN ' السبب: ' || v_reason ELSE '' END,
    CASE WHEN v_new = 'rejected' THEN 'high' ELSE 'normal' END,
    CASE WHEN v_new = 'rejected' THEN 'warning' ELSE 'info' END,
    'approvals', 'in_app', NOW()
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS bom_version_notify_decision ON manufacturing_bom_versions;
CREATE TRIGGER bom_version_notify_decision
AFTER UPDATE OF status ON public.manufacturing_bom_versions
FOR EACH ROW EXECUTE FUNCTION public.manufacturing_notify_decision_trg('status', 'قائمة المواد', 'version_no');

DROP TRIGGER IF EXISTS routing_version_notify_decision ON manufacturing_routing_versions;
CREATE TRIGGER routing_version_notify_decision
AFTER UPDATE OF approval_status ON public.manufacturing_routing_versions
FOR EACH ROW EXECUTE FUNCTION public.manufacturing_notify_decision_trg('approval_status', 'مسار التصنيع', 'version_no');

DROP TRIGGER IF EXISTS production_order_notify_decision ON manufacturing_production_orders;
CREATE TRIGGER production_order_notify_decision
AFTER UPDATE OF approval_status ON public.manufacturing_production_orders
FOR EACH ROW EXECUTE FUNCTION public.manufacturing_notify_decision_trg('approval_status', 'أمر الإنتاج', 'order_no');
