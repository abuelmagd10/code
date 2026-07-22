-- ============================================================================
-- v3.74.790 — «مدير الفرع يجب أن يعلم ما يتم فى فرعه» (قاعدة المالك 2026-07-22)
--
-- Context: reviewing the SO-0003 discount-rejection notification map, the
-- owner ruled that the branch manager must be informed of what happens in
-- his branch. Discount DECISIONS (approved/rejected) now also send an FYI
-- to the document branch's manager through his established channel
-- (notify_branch_manager — the same one that tells him about creations).
--
-- discount_approvals carries no branch_id; it is derived from the decided
-- document per type (SO / invoice / PO / bill / booking). The FYI is
-- exception-wrapped: it can never fail the decision itself.
--
-- APPLIED to test (bhvylzzscrnzusnnkaal) and prod (hfvsbsizokxontflgdyn)
-- on 2026-07-22 via MCP apply_migration; this file is the repo record.
-- Rehearsed on test: requester got the rejection with the reason;
-- branch manager got «نشاط فرعك: تم رفض الخصم» with the same reason.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_discount_decision_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_title text;
  v_severity text;
  v_priority text;
  v_msg text;
  v_doc_label text;
  v_kind_ar text;
  v_is_amendment boolean;
  v_branch_id uuid;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('approved','rejected') THEN RETURN NEW; END IF;
  IF NEW.requested_by IS NULL THEN RETURN NEW; END IF;

  v_doc_label := CASE NEW.document_type
    WHEN 'purchase_order'   THEN 'أمر الشراء '
    WHEN 'sales_order'      THEN 'طلب المبيعات '
    WHEN 'purchase_invoice' THEN 'فاتورة المشتريات '
    WHEN 'sales_invoice'    THEN 'فاتورة المبيعات '
    WHEN 'booking'          THEN 'الحجز '
    ELSE 'المستند '
  END || COALESCE(NEW.document_no, '');

  -- v3.74.494 — pick the right noun. supersedes_approval_id is set
  -- only when the row was opened by an amendment trigger, which is the
  -- catch-all path for edits to shipping / quantities / tax / etc.
  -- Fresh discount requests (no supersedes) still say "الخصم".
  v_is_amendment := NEW.supersedes_approval_id IS NOT NULL;
  v_kind_ar := CASE WHEN v_is_amendment THEN 'التعديل' ELSE 'الخصم' END;

  IF NEW.status = 'approved' THEN
    v_title := 'تم اعتماد ' || v_kind_ar;
    v_severity := 'info';
    v_priority := 'normal';
    v_msg := 'تم اعتماد ' || v_kind_ar || ' على ' || v_doc_label || '. يمكنك المتابعة.';
  ELSE
    v_title := 'تم رفض ' || v_kind_ar;
    v_severity := 'error';
    v_priority := 'high';
    v_msg := 'تم رفض ' || v_kind_ar || ' على ' || v_doc_label || '.' ||
      CASE WHEN NEW.decision_note IS NOT NULL AND TRIM(NEW.decision_note) <> ''
           THEN ' السبب: ' || NEW.decision_note
           ELSE ''
      END ||
      -- v3.74.494 — hint text differs. Amendments need a re-edit;
      -- fresh discount requests may keep or remove the discount.
      CASE WHEN v_is_amendment
           THEN ' عدّل الفاتورة لفتح دورة اعتماد جديدة.'
           ELSE ' عدّل المستند (احذف الخصم أو غيّره) لفتح دورة موافقة جديدة.'
      END;
  END IF;

  INSERT INTO public.notifications (
    company_id, reference_type, reference_id, created_by,
    assigned_to_user, title, message,
    priority, severity, category, channel, created_at
  ) VALUES (
    NEW.company_id,
    CASE NEW.document_type::text
      WHEN 'purchase_order'   THEN 'purchase_order'
      WHEN 'sales_order'      THEN 'sales_order'
      WHEN 'purchase_invoice' THEN 'bill'
      WHEN 'sales_invoice'    THEN 'invoice'
      WHEN 'booking'          THEN 'booking'
      ELSE NEW.document_type::text
    END,
    NEW.document_id,
    COALESCE(NEW.decided_by, NEW.requested_by),
    NEW.requested_by,
    v_title, v_msg,
    v_priority, v_severity, 'approvals', 'in_app', NOW()
  );

  -- v3.74.790 — the owner: «مدير الفرع يجب أن يعلم ما يتم فى فرعه».
  -- Same decision, as an FYI to the document branch's manager through his
  -- established channel. Derived per document type; never fails the decision.
  BEGIN
    v_branch_id := CASE NEW.document_type::text
      WHEN 'sales_order'      THEN (SELECT so.branch_id FROM public.sales_orders so WHERE so.id = NEW.document_id)
      WHEN 'sales_invoice'    THEN (SELECT i.branch_id  FROM public.invoices i      WHERE i.id  = NEW.document_id)
      WHEN 'purchase_order'   THEN (SELECT po.branch_id FROM public.purchase_orders po WHERE po.id = NEW.document_id)
      WHEN 'purchase_invoice' THEN (SELECT b.branch_id  FROM public.bills b         WHERE b.id  = NEW.document_id)
      WHEN 'booking'          THEN (SELECT bk.branch_id FROM public.bookings bk     WHERE bk.id = NEW.document_id)
      ELSE NULL
    END;

    IF v_branch_id IS NOT NULL THEN
      PERFORM public.notify_branch_manager(
        NEW.company_id, v_branch_id,
        CASE NEW.document_type::text
          WHEN 'purchase_invoice' THEN 'bill'
          WHEN 'sales_invoice'    THEN 'invoice'
          ELSE NEW.document_type::text
        END,
        NEW.document_id,
        NEW.decided_by,
        'نشاط فرعك: ' || v_title,
        v_title || ' على ' || v_doc_label ||
          CASE WHEN NEW.status = 'rejected'
                    AND NEW.decision_note IS NOT NULL AND TRIM(NEW.decision_note) <> ''
               THEN '. السبب: ' || NEW.decision_note
               ELSE '.'
          END,
        v_severity, 'normal'
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;  -- the FYI must never fail the decision itself
  END;

  RETURN NEW;
END;
$function$;
