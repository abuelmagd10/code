-- v3.74.724 — every integrity finding names the record it is about.
-- ------------------------------------------------------------------
-- The owner opened the dashboard and saw seven customer-isolation findings
-- rendered as seven identical rows: same sentence, no customer, no document
-- number, nothing to act on.
--
-- The widget shows detail->>'hint' — which is one fixed sentence per CHECK, not
-- per finding — plus a hardcoded list of three fields (difference,
-- invoice_number, product_name). Any checker emitting different keys shows
-- nothing identifying. That is the same two-sources-of-truth shape fixed
-- elsewhere today: adding a checker silently required editing the widget, and
-- nothing enforced it.
--
-- `subject` is now the convention: one short line naming the record, rendered
-- generically. Existing checkers keep working unchanged; new ones become
-- actionable without touching the dashboard.
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
      'subject', 'العميل «' || r.customer_name || '» — فرعه: ' || r.customer_branch
                 || ' · منشئه انتقل إلى: ' || COALESCE(r.creator_branch, 'بلا فرع'),
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
      'subject', CASE r.doc_type
                   WHEN 'invoice' THEN 'فاتورة '
                   WHEN 'sales_order' THEN 'أمر بيع '
                   ELSE 'حجز ' END
                 || r.doc_no || ' (فرع: ' || r.document_branch || ')'
                 || ' — العميل «' || r.cust_name || '» من فرع ' || r.customer_branch,
      'document_type', r.doc_type, 'document_no', r.doc_no, 'customer', r.cust_name,
      'document_branch', r.document_branch, 'customer_branch', r.customer_branch,
      'hint', 'Document uses a customer from another branch. Created before the isolation guard existed; new ones are now rejected.');
    RETURN NEXT;
  END LOOP;
EXCEPTION WHEN undefined_table OR undefined_column THEN RETURN;
END $function$;
