-- v3.74.719 — a document may not name a customer from another branch.
-- ------------------------------------------------------------------
-- Found by the owner: an employee moved from فرع مدينة نصر to الفرع الرئيسي and
-- kept seeing — and could still pick — the customers he had created in the branch
-- he left. His list showed four customers, three of them belonging to a branch he
-- no longer works in.
--
-- Root cause: staff see customers filtered by WHO CREATED THEM, never by branch.
-- "Customers I created" follows the PERSON, not the data, so it travels with the
-- employee across branches.
--
-- The product side has been guarded since v3.74.701
-- (validate_product_branch_isolation on every *_items table) — that guard is what
-- blocked adding another branch's product to a booking. Customers had NO
-- equivalent, and the gap was already real: four documents exist whose customer
-- belongs to a different branch than the document, including a booking created
-- during this week's testing.
--
-- Deliberately permissive in two cases, mirroring the product guard:
--   * document branch NULL  -> company-level document, nothing to violate
--   * customer branch NULL  -> company-wide customer, usable from any branch
-- Only a genuine mismatch between two known branches is rejected.
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_customer_branch_isolation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public','pg_catalog'
AS $function$
DECLARE
  v_cust_branch UUID;
  v_doc_branch  UUID;
BEGIN
  IF NEW.customer_id IS NULL THEN RETURN NEW; END IF;
  v_doc_branch := NEW.branch_id;
  IF v_doc_branch IS NULL THEN RETURN NEW; END IF;

  SELECT branch_id INTO v_cust_branch FROM customers WHERE id = NEW.customer_id;
  IF v_cust_branch IS NULL THEN RETURN NEW; END IF;

  IF v_cust_branch <> v_doc_branch THEN
    RAISE EXCEPTION 'CUSTOMER_BRANCH_ISOLATION: العميل يتبع فرعاً آخر — لا يمكن استخدامه فى مستند هذا الفرع. (customer_branch=%, document_branch=%)',
      v_cust_branch, v_doc_branch
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

-- Every customer-facing document type.
DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['invoices','sales_orders','estimates','bookings','sales_returns','customer_debit_notes'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_validate_customer_branch ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_validate_customer_branch
       BEFORE INSERT OR UPDATE OF customer_id, branch_id ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.validate_customer_branch_isolation()', t);
  END LOOP;
END $do$;

-- ------------------------------------------------------------------
-- Detection for the two failures that only surface when someone changes branch.
-- Existing violations are reported, NOT auto-corrected: they carry posted
-- journals and the right answer differs case by case (move the customer, or
-- leave the history as it stands). The owner decides each one.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ic_customer_branch_governance(p_company_id uuid)
 RETURNS TABLE(severity text, detail jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public','pg_catalog'
AS $function$
DECLARE r record;
BEGIN
  -- (1) orphaned customer: its creator now works in a different branch, so
  -- nobody in the customer's own branch has it in their list.
  FOR r IN
    SELECT c.name AS customer_name, cb.name AS customer_branch, ub.name AS creator_branch
    FROM customers c
    JOIN branches cb ON cb.id = c.branch_id
    JOIN company_members m ON m.user_id = c.created_by_user_id AND m.company_id = c.company_id
    LEFT JOIN branches ub ON ub.id = m.branch_id
    WHERE c.company_id = p_company_id
      AND m.branch_id IS NOT NULL
      AND m.branch_id <> c.branch_id
      AND m.role NOT IN ('owner','admin','general_manager','manager')
    LIMIT 20
  LOOP
    severity := 'medium';
    detail := jsonb_build_object(
      'customer', r.customer_name,
      'customer_branch', r.customer_branch,
      'creator_branch_now', r.creator_branch,
      'hint', 'Customer belongs to one branch while the staff member who created it now works in another. Nobody in the customer''s branch sees it, and the person who left still can. Reassign ownership via Settings > Users > Transfer Ownership, scoped to that branch.');
    RETURN NEXT;
  END LOOP;

  -- (2) document already naming a customer from another branch
  FOR r IN
    SELECT d.doc_type, d.doc_no, d.cust_name, db.name AS document_branch, cb.name AS customer_branch
    FROM (
      SELECT 'invoice' AS doc_type, i.invoice_number AS doc_no, i.branch_id, c.branch_id AS cust_branch,
             c.name AS cust_name, i.company_id
        FROM invoices i JOIN customers c ON c.id = i.customer_id
      UNION ALL
      SELECT 'sales_order', s.so_number, s.branch_id, c.branch_id, c.name, s.company_id
        FROM sales_orders s JOIN customers c ON c.id = s.customer_id
      UNION ALL
      SELECT 'booking', b.booking_no, b.branch_id, c.branch_id, c.name, b.company_id
        FROM bookings b JOIN customers c ON c.id = b.customer_id
    ) d
    JOIN branches db ON db.id = d.branch_id
    JOIN branches cb ON cb.id = d.cust_branch
    WHERE d.company_id = p_company_id
      AND d.branch_id IS NOT NULL AND d.cust_branch IS NOT NULL
      AND d.branch_id <> d.cust_branch
    LIMIT 20
  LOOP
    severity := 'high';
    detail := jsonb_build_object(
      'document_type', r.doc_type, 'document_no', r.doc_no, 'customer', r.cust_name,
      'document_branch', r.document_branch, 'customer_branch', r.customer_branch,
      'hint', 'Document uses a customer from another branch. Created before the isolation guard existed; new ones are now rejected.');
    RETURN NEXT;
  END LOOP;
EXCEPTION WHEN undefined_table OR undefined_column THEN RETURN;
END $function$;

INSERT INTO integrity_check_definitions (code, fn_name, category, name_ar, name_en, severity_default, active)
VALUES ('customer_branch_governance','ic_customer_branch_governance','accounting',
        'عَزل العُملاء بَين الفُروع','Orphaned customers / cross-branch documents','high', true)
ON CONFLICT (code) DO UPDATE
  SET fn_name=EXCLUDED.fn_name, category=EXCLUDED.category, name_ar=EXCLUDED.name_ar,
      name_en=EXCLUDED.name_en, severity_default=EXCLUDED.severity_default, active=true;
