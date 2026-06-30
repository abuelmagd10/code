-- v3.74.419 - close 4 gaps in the discount-approval workflow.
-- See CONTRACTS.md Section S. Bodies live in DB (applied via Supabase MCP).

-- (1) approve_purchase_order_atomic now refuses on rejected discount,
--     not just pending. Message tells the user to amend the PO.
-- (2) inv_request_discount_approval_trg consults the linked SO discount
--     approval: 'approved' → skip new approval (no double cycle);
--     'rejected' → raise so the invoice cannot be created.
-- (3) notify_discount_decision_trg fires on UPDATE OF status on
--     discount_approvals (approved/rejected) and inserts a notification
--     for the original requester with the decision reason.
-- (4) Same trigger as #2 handles the rejection block on invoice creation.

-- See assert_baseline body for the contracts pinned by Section S.
