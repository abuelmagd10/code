-- v3.74.782 — one discount, one approval: the sales order is the source of truth.
--
-- THE OWNER'S SPECIFICATION (verbatim decision, 2026-07-21)
-- ----------------------------------------------------------------------------
--   "الخصم يُعتمد مرة واحدة — على أمر البيع. لو اعتمد يتم إنشاء الفاتورة
--    التابعة لأمر البيع. الموظف ليس له حق الاطلاع على الفاتورة؛ محاسب الفرع
--    يستكمل إجراءاتها وليس له حق التعديل. وفواتير البيع ليس لها اعتماد."
--
-- WHAT ACTUALLY HAPPENED (proven in production, SO-0002 → INV-00002)
-- ----------------------------------------------------------------------------
-- Creating a sales order with a discount did all of this in ONE request:
--   16:31:58.453  AFTER INSERT trigger files a 'sales_order' discount approval
--   16:31:58.835  the same request calls create_auto_invoice_from_sales_order,
--                 which inserts the invoice IMMEDIATELY — the approval is still
--                 pending 382ms after it was filed — and the invoice's own
--                 AFTER INSERT trigger files a SECOND approval ('sales_invoice')
--                 because its skip-guard only recognises an ALREADY-approved
--                 sales-order row.
--
-- Result: two pending approvals for one 20.00 discount, an invoice that exists
-- before the owner decided anything, and a 409 at posting keyed on the second
-- row — the one that should never have existed. Deciding the two rows
-- independently could even record contradictory decisions on the same money.
--
-- THE MECHANISM WAS DESIGNED BUT NEVER WIRED
-- ----------------------------------------------------------------------------
-- migrations/20260629000404 describes an app.skip_discount_approval token that
-- the conversion was supposed to set so the invoice never files its own
-- approval. A repo-wide search shows it is set nowhere in the app and not in
-- either conversion RPC. This migration implements the intent, but with the
-- stronger ordering the owner specified: the invoice is not merely exempted —
-- it is not CREATED until the decision is made.
--
-- FOUR PATCHES, ALL DATABASE-SIDE
-- ----------------------------------------------------------------------------
-- 1. create_auto_invoice_from_sales_order: a pending sales-order discount
--    approval SKIPS invoice creation (returns jsonb, does not raise — the
--    calling route already treats success:false as "no auto-invoice" and
--    continues gracefully; verified in app/api/sales-orders/route.ts:591-600).
-- 2. inv_evaluate_discount_approval: DB-level backstop — inserting an invoice
--    whose linked sales order has a PENDING discount approval raises. Covers
--    every path, including the manual /api/invoices conversion.
-- 3. decide_discount_approval: the decision becomes the pivot the owner
--    described. APPROVE a sales_order discount → the invoice is created right
--    there (and any legacy pending 'sales_invoice' twin is cancelled as
--    inheriting the decision). REJECT → no invoice; the employee edits the
--    sales order, and editing discount_value already re-files a fresh request
--    (existing trigger). Legacy twins are cancelled on reject too.
-- 4. so_evaluate_discount_approval: the inbox showed "إجمالى: ٠٫٠٠" because
--    document_total snapshotted sales_orders.total_amount, which this codebase
--    leaves at 0 and stores the real figure in `total`. COALESCE alone cannot
--    fix that: COALESCE(0, 319.2) is 0 — zero is not NULL. NULLIF first.
--
-- Patched by substitution on the LIVE definitions (the bodies live in the DB;
-- the schema files are snapshots). Every anchor must match exactly once or the
-- migration aborts; each patch is individually replay-safe via a marker only it
-- introduces.
-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Patch 1 — no invoice while the discount decision is pending
-- ---------------------------------------------------------------------------
DO $p1$
DECLARE d text; n int;
  a_anchor text := '-- 2. التحقق من أنه لا توجد فاتورة مرتبطة بالفعل';
BEGIN
  SELECT pg_get_functiondef(oid) INTO d FROM pg_proc
   WHERE oid::regprocedure::text = 'create_auto_invoice_from_sales_order(uuid)';
  IF d IS NULL THEN RAISE EXCEPTION 'create_auto_invoice_from_sales_order(uuid) not found'; END IF;
  IF d LIKE '%discount_pending_approval%' THEN
    RAISE NOTICE 'patch 1 already applied'; RETURN;
  END IF;

  n := (length(d) - length(replace(d, a_anchor, ''))) / length(a_anchor);
  IF n <> 1 THEN RAISE EXCEPTION 'patch 1 anchor matched % times, expected 1', n; END IF;

  d := replace(d, a_anchor,
E'-- v3.74.782: مواصفة المالك — الفاتورة تُنشأ بعد اعتماد الخصم، لا قبله.\n'
'  -- Returns rather than raises: the SO-creation route treats success:false as\n'
'  -- "no auto-invoice yet" and completes normally. decide_discount_approval\n'
'  -- calls back here at approval time, when this guard no longer fires.\n'
'  IF v_so.invoice_id IS NULL AND EXISTS (\n'
'    SELECT 1 FROM public.discount_approvals da\n'
'     WHERE da.document_type = ''sales_order''\n'
'       AND da.document_id = p_sales_order_id\n'
'       AND da.status = ''pending''\n'
'  ) THEN\n'
'    RETURN jsonb_build_object(\n'
'      ''success'', false,\n'
'      ''skipped'', ''discount_pending_approval'',\n'
'      ''message'', ''خصم أمر البيع بانتظار اعتماد المالك — تُنشأ الفاتورة تلقائياً فور الاعتماد''\n'
'    );\n'
'  END IF;\n'
'\n'
'  ' || a_anchor);

  EXECUTE d;
END;
$p1$;

-- ---------------------------------------------------------------------------
-- Patch 2 — DB backstop: no invoice INSERT can slip past a pending decision
-- ---------------------------------------------------------------------------
DO $p2$
DECLARE d text; n int;
  a_anchor text := 'IF v_so_status=''approved'' AND v_so_value = v_total_disc THEN RETURN; END IF;';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p
   JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname='public' AND p.proname='inv_evaluate_discount_approval';
  IF d IS NULL THEN RAISE EXCEPTION 'inv_evaluate_discount_approval not found'; END IF;
  IF d LIKE '%قبل البت فيه%' THEN
    RAISE NOTICE 'patch 2 already applied'; RETURN;
  END IF;

  n := (length(d) - length(replace(d, a_anchor, ''))) / length(a_anchor);
  IF n <> 1 THEN RAISE EXCEPTION 'patch 2 anchor matched % times, expected 1', n; END IF;

  d := replace(d, a_anchor, a_anchor ||
E'\n      -- v3.74.782: an invoice must not exist before the discount decision.\n'
'      -- The auto path already skips; this covers every other path too.\n'
'      IF v_so_status=''pending'' THEN\n'
'        RAISE EXCEPTION ''خصم أمر البيع بانتظار اعتماد المالك — لا يمكن إنشاء الفاتورة قبل البت فيه.'' USING ERRCODE=''P0001'';\n'
'      END IF;');

  EXECUTE d;
END;
$p2$;

-- ---------------------------------------------------------------------------
-- Patch 3 — the decision is the pivot: approve → create; reject → nothing
-- ---------------------------------------------------------------------------
DO $p3$
DECLARE d text; n int;
  a_anchor text := 'RETURN jsonb_build_object(''success'', true, ''approval_id'', p_approval_id, ''status'', p_decision, ''decided_at'', NOW());';
BEGIN
  SELECT pg_get_functiondef(oid) INTO d FROM pg_proc
   WHERE oid::regprocedure::text = 'decide_discount_approval(uuid,text,text)';
  IF d IS NULL THEN RAISE EXCEPTION 'decide_discount_approval(uuid,text,text) not found'; END IF;
  IF d LIKE '%invoice_result%' THEN
    RAISE NOTICE 'patch 3 already applied'; RETURN;
  END IF;

  n := (length(d) - length(replace(d, a_anchor, ''))) / length(a_anchor);
  IF n <> 1 THEN RAISE EXCEPTION 'patch 3 anchor matched % times, expected 1', n; END IF;

  d := replace(d, a_anchor,
E'-- v3.74.782: مواصفة المالك — القرار على أمر البيع هو مفتاح الفاتورة.\n'
'  IF v_approval.document_type = ''sales_order'' THEN\n'
'    -- Either way, a legacy pending twin on the linked invoice inherits this\n'
'    -- decision instead of waiting to be decided separately (or contradictorily).\n'
'    UPDATE public.discount_approvals da SET\n'
'      status = ''cancelled'',\n'
'      decided_by = auth.uid(),\n'
'      decided_at = NOW(),\n'
'      decision_note = ''يرث قرار خصم أمر البيع ('' || p_decision || '')''\n'
'    WHERE da.document_type = ''sales_invoice''\n'
'      AND da.status = ''pending''\n'
'      AND da.document_id IN (\n'
'        SELECT so.invoice_id FROM public.sales_orders so\n'
'         WHERE so.id = v_approval.document_id AND so.invoice_id IS NOT NULL\n'
'      );\n'
'\n'
'    IF p_decision = ''approved'' THEN\n'
'      -- The invoice the employee was waiting for is created HERE, by the\n'
'      -- approval itself. If one already exists (legacy), the RPC reports\n'
'      -- already_exists and changes nothing.\n'
'      RETURN jsonb_build_object(\n'
'        ''success'', true, ''approval_id'', p_approval_id, ''status'', p_decision,\n'
'        ''decided_at'', NOW(),\n'
'        ''invoice_result'', public.create_auto_invoice_from_sales_order(v_approval.document_id)\n'
'      );\n'
'    END IF;\n'
'    -- rejected: no invoice. The employee edits the sales order; changing\n'
'    -- discount_value re-files a fresh request via the existing trigger.\n'
'  END IF;\n'
'\n'
'  ' || a_anchor);

  EXECUTE d;
END;
$p3$;

-- ---------------------------------------------------------------------------
-- Patch 4 — the inbox shows the real document total
-- ---------------------------------------------------------------------------
DO $p4$
DECLARE d text; n int;
  a_anchor text := 'v_so.total_amount, v_party_name,';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p
   JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname='public' AND p.proname='so_evaluate_discount_approval';
  IF d IS NULL THEN RAISE EXCEPTION 'so_evaluate_discount_approval not found'; END IF;
  IF d LIKE '%NULLIF(v_so.total_amount%' THEN
    RAISE NOTICE 'patch 4 already applied'; RETURN;
  END IF;

  n := (length(d) - length(replace(d, a_anchor, ''))) / length(a_anchor);
  IF n <> 1 THEN RAISE EXCEPTION 'patch 4 anchor matched % times, expected 1', n; END IF;

  -- NULLIF first: this codebase stores 0 in sales_orders.total_amount and the
  -- real figure in `total`. COALESCE alone keeps the 0 — zero is not NULL.
  d := replace(d, a_anchor,
       'COALESCE(NULLIF(v_so.total_amount, 0), v_so.total, 0), v_party_name,');

  EXECUTE d;
END;
$p4$;

-- ---------------------------------------------------------------------------
-- Patch 5 — a zero-discount amendment must not file a discount approval.
--
-- discount_approvals has CHECK (discount_value > 0), and the amendment trigger
-- inserted COALESCE(NEW.discount_value, 0) with no zero guard: ANY material
-- edit of a draft invoice carrying no document discount crashed on the
-- constraint. Latent since the amendment flow shipped; surfaced by rehearsal.
-- ---------------------------------------------------------------------------
DO $p5$
DECLARE d text; n int;
  a_anchor text := 'IF v_requester IS NOT NULL THEN';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p
   JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname='public' AND p.proname='invoice_amendment_reset_approval_trg';
  IF d IS NULL THEN RAISE EXCEPTION 'invoice_amendment_reset_approval_trg not found'; END IF;
  IF d LIKE '%AND COALESCE(NEW.discount_value, 0) > 0 THEN%' THEN
    RAISE NOTICE 'patch 5 already applied'; RETURN;
  END IF;
  n := (length(d) - length(replace(d, a_anchor, ''))) / length(a_anchor);
  IF n <> 1 THEN RAISE EXCEPTION 'patch 5 anchor matched %% times', n; END IF;
  d := replace(d, a_anchor,
       'IF v_requester IS NOT NULL AND COALESCE(NEW.discount_value, 0) > 0 THEN');
  EXECUTE d;
END;
$p5$;

-- ---------------------------------------------------------------------------
-- Patch 6 — SO-sourced invoices never file their own approvals. Anywhere.
--
-- The production twin came from the amendment trigger: during invoice creation
-- the service-only AFTER INSERT trigger updates warehouse_status, totals shift
-- inside the same statement, and the amendment BEFORE UPDATE trigger read that
-- as a material amendment and filed a 'sales_invoice' request. Governance is
-- kept by the posting guard, which requires the invoice discount to MATCH the
-- approved sales-order value.
-- ---------------------------------------------------------------------------
DO $p6$
DECLARE d text; n int;
  a_anchor text := 'IF COALESCE(current_setting(''app.skip_discount_approval'', true), ) <>  THEN RETURN NEW; END IF;';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p
   JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname='public' AND p.proname='invoice_amendment_reset_approval_trg';
  IF d LIKE '%sales_order_id IS NOT NULL THEN RETURN NEW%' THEN
    RAISE NOTICE 'patch 6 already applied'; RETURN;
  END IF;
  n := (length(d) - length(replace(d, a_anchor, ''))) / length(a_anchor);
  IF n <> 1 THEN RAISE EXCEPTION 'patch 6 anchor matched %% times', n; END IF;
  d := replace(d, a_anchor, a_anchor ||
E'\n  -- v3.74.782: مواصفة المالك — فواتير البيع التابعة لأمر بيع ليس لها اعتماد.\n'
'  IF NEW.sales_order_id IS NOT NULL THEN RETURN NEW; END IF;');
  EXECUTE d;
END;
$p6$;

DO $p6b$
DECLARE d text; n int;
  a_anchor text := 'IF v_inv.sales_order_id IS NOT NULL THEN';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p
   JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname='public' AND p.proname='inv_evaluate_discount_approval';
  IF d LIKE '%لا تُنشئ طلباً خاصاً بها%' THEN
    RAISE NOTICE 'patch 6b already applied'; RETURN;
  END IF;
  n := (length(d) - length(replace(d, a_anchor, ''))) / length(a_anchor);
  IF n <> 1 THEN RAISE EXCEPTION 'patch 6b anchor matched %% times', n; END IF;
  d := replace(d, a_anchor,
E'IF v_inv.sales_order_id IS NOT NULL THEN\n'
'    -- v3.74.782: الفاتورة التابعة لأمر بيع ترث قراره ولا تُنشئ طلباً خاصاً بها.');
  EXECUTE d;
END;
$p6b$;

DO $p6c$
DECLARE d text; n int;
  a_anchor text := 'SELECT id, status, discount_value INTO v_last_id, v_last_status, v_last_value FROM public.discount_approvals';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p
   JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname='public' AND p.proname='inv_evaluate_discount_approval';
  IF d LIKE '%SO-sourced files nothing%' THEN
    RAISE NOTICE 'patch 6c already applied'; RETURN;
  END IF;
  n := (length(d) - length(replace(d, a_anchor, ''))) / length(a_anchor);
  IF n <> 1 THEN RAISE EXCEPTION 'patch 6c anchor matched %% times', n; END IF;
  d := replace(d, a_anchor,
E'-- v3.74.782 SO-sourced files nothing: rejected/pending already raised above.\n'
'  IF v_inv.sales_order_id IS NOT NULL THEN RETURN; END IF;\n'
'  ' || a_anchor);
  EXECUTE d;
END;
$p6c$;

-- ---------------------------------------------------------------------------
-- Patch 7 — the delete gate crashed on its own cleanup line.
--
-- transactional_document_delete_gate_trg compares the ENUM column
-- discount_approvals.document_type against a TEXT variable with no cast:
-- "operator does not exist: discount_document_type = text". That line runs on
-- every PERMITTED (draft) delete — so since the gate shipped, no draft
-- invoice, bill, sales order or purchase order could be hard-deleted at all.
-- Surfaced when the owner asked to clean the SO-0002/INV-00002 test pair.
-- ---------------------------------------------------------------------------
DO $p7$
DECLARE d text; n int;
  a1 text := 'WHERE document_type = v_disc_doc_type AND document_id = OLD.id;';
  a2 text := 'WHERE document_type = v_disc_doc_type AND document_id = OLD.id
          )';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p
   JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname='public' AND p.proname='transactional_document_delete_gate_trg';
  IF d IS NULL THEN RAISE EXCEPTION 'transactional_document_delete_gate_trg not found'; END IF;
  IF d LIKE '%v_disc_doc_type::public.discount_document_type%' THEN
    RAISE NOTICE 'patch 7 already applied'; RETURN;
  END IF;
  n := (length(d) - length(replace(d, a1, ''))) / length(a1);
  IF n <> 1 THEN RAISE EXCEPTION 'p7 anchor-1 matched %% times', n; END IF;
  n := (length(d) - length(replace(d, a2, ''))) / length(a2);
  IF n <> 1 THEN RAISE EXCEPTION 'p7 anchor-2 matched %% times', n; END IF;
  d := replace(d, a1,
    'WHERE document_type = v_disc_doc_type::public.discount_document_type AND document_id = OLD.id;');
  d := replace(d, a2,
    'WHERE document_type = v_disc_doc_type::public.discount_document_type AND document_id = OLD.id
          )');
  EXECUTE d;
END;
$p7$;

-- ---------------------------------------------------------------------------
-- Verify every patch actually landed. A migration that ran and changed nothing
-- is this project's most familiar failure mode.
-- ---------------------------------------------------------------------------
DO $verify$
DECLARE s text;
BEGIN
  SELECT prosrc INTO s FROM pg_proc WHERE oid::regprocedure::text='create_auto_invoice_from_sales_order(uuid)';
  IF s NOT LIKE '%discount_pending_approval%' THEN RAISE EXCEPTION 'patch 1 missing'; END IF;

  SELECT prosrc INTO s FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='inv_evaluate_discount_approval';
  IF s NOT LIKE '%قبل البت فيه%' THEN RAISE EXCEPTION 'patch 2 missing'; END IF;

  SELECT prosrc INTO s FROM pg_proc WHERE oid::regprocedure::text='decide_discount_approval(uuid,text,text)';
  IF s NOT LIKE '%invoice_result%' THEN RAISE EXCEPTION 'patch 3 missing'; END IF;

  SELECT prosrc INTO s FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='so_evaluate_discount_approval';
  IF s NOT LIKE '%NULLIF(v_so.total_amount%' THEN RAISE EXCEPTION 'patch 4 missing'; END IF;

  SELECT prosrc INTO s FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='invoice_amendment_reset_approval_trg';
  IF s NOT LIKE '%AND COALESCE(NEW.discount_value, 0) > 0 THEN%' THEN RAISE EXCEPTION 'patch 5 missing'; END IF;
  IF s NOT LIKE '%sales_order_id IS NOT NULL THEN RETURN NEW%' THEN RAISE EXCEPTION 'patch 6 missing'; END IF;

  SELECT prosrc INTO s FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='inv_evaluate_discount_approval';
  IF s NOT LIKE '%SO-sourced files nothing%' THEN RAISE EXCEPTION 'patch 6c missing'; END IF;

  SELECT prosrc INTO s FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='transactional_document_delete_gate_trg';
  IF s NOT LIKE '%v_disc_doc_type::public.discount_document_type%' THEN RAISE EXCEPTION 'patch 7 missing'; END IF;
END;
$verify$;

-- ---------------------------------------------------------------------------
-- NO data migration for the existing SO-0002 / INV-00002 pair, deliberately.
-- Cancelling the invoice twin now would clear the app-layer 409 while the
-- sales-order decision is still pending. Instead, the pair resolves itself the
-- moment the owner decides SO-0002's request: patch 3 cancels the twin as
-- inheriting that decision. Until then both stay blocked, which is correct.
-- ---------------------------------------------------------------------------
