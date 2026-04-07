-- =============================================================================
-- Phase 1 V2: Enterprise Financial Isolation + Traceability + Idempotency
-- =============================================================================
-- Goals:
-- 1) Add DB-level financial trace chain (UI -> API -> RPC -> Journals)
-- 2) Enforce hard accounting period validation inside every V2 financial RPC
-- 3) Add idempotency support to invoice post / warehouse approval / payment / returns
-- 4) Keep all existing contracts working (additive only)
-- 5) Move enterprise workflows to Accrual-only + backend-only accounting execution
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Schema Hardening for Existing Contracts
-- -----------------------------------------------------------------------------
ALTER TABLE public.third_party_inventory
  ADD COLUMN IF NOT EXISTS total_cost NUMERIC(15,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sales_order_id UUID REFERENCES public.sales_orders(id) ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- 1. Financial Trace Chain
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.financial_operation_traces (
  transaction_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source_entity    TEXT NOT NULL,
  source_id        UUID NOT NULL,
  event_type       TEXT NOT NULL,
  idempotency_key  TEXT,
  actor_id         UUID REFERENCES auth.users(id),
  request_hash     TEXT,
  audit_flags      JSONB NOT NULL DEFAULT '[]'::JSONB,
  metadata         JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_operation_traces_company_created
  ON public.financial_operation_traces (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_financial_operation_traces_source
  ON public.financial_operation_traces (company_id, source_entity, source_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_financial_operation_traces_idempotency
  ON public.financial_operation_traces (company_id, event_type, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.financial_operation_trace_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  UUID NOT NULL REFERENCES public.financial_operation_traces(transaction_id) ON DELETE CASCADE,
  entity_type     TEXT NOT NULL,
  entity_id       UUID NOT NULL,
  link_role       TEXT,
  reference_type  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (transaction_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_financial_operation_trace_links_entity
  ON public.financial_operation_trace_links (entity_type, entity_id, created_at DESC);

COMMENT ON TABLE public.financial_operation_traces IS
  'Enterprise audit chain for financial operations. Each row represents one committed financial transaction with event metadata and idempotency context.';

COMMENT ON TABLE public.financial_operation_trace_links IS
  'Links a financial transaction trace to the concrete records created/affected by that committed operation (journals, payments, inventory, returns, etc.).';

-- -----------------------------------------------------------------------------
-- 2. Helper Functions for Traceability
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_financial_operation_trace(
  p_company_id      UUID,
  p_source_entity   TEXT,
  p_source_id       UUID,
  p_event_type      TEXT,
  p_actor_id        UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_request_hash    TEXT DEFAULT NULL,
  p_metadata        JSONB DEFAULT '{}'::JSONB,
  p_audit_flags     JSONB DEFAULT '[]'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_transaction_id UUID;
BEGIN
  INSERT INTO public.financial_operation_traces (
    company_id,
    source_entity,
    source_id,
    event_type,
    actor_id,
    idempotency_key,
    request_hash,
    metadata,
    audit_flags
  ) VALUES (
    p_company_id,
    p_source_entity,
    p_source_id,
    p_event_type,
    p_actor_id,
    p_idempotency_key,
    p_request_hash,
    COALESCE(p_metadata, '{}'::JSONB),
    COALESCE(p_audit_flags, '[]'::JSONB)
  )
  RETURNING transaction_id INTO v_transaction_id;

  RETURN v_transaction_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.link_financial_operation_trace(
  p_transaction_id UUID,
  p_entity_type    TEXT,
  p_entity_id      UUID,
  p_link_role      TEXT DEFAULT NULL,
  p_reference_type TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_transaction_id IS NULL OR p_entity_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.financial_operation_trace_links (
    transaction_id,
    entity_type,
    entity_id,
    link_role,
    reference_type
  ) VALUES (
    p_transaction_id,
    p_entity_type,
    p_entity_id,
    p_link_role,
    p_reference_type
  )
  ON CONFLICT (transaction_id, entity_type, entity_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.append_financial_audit_flag(
  p_transaction_id UUID,
  p_audit_flag     TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_exists BOOLEAN := FALSE;
BEGIN
  IF p_transaction_id IS NULL OR p_audit_flag IS NULL OR btrim(p_audit_flag) = '' THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.financial_operation_traces fot,
         LATERAL jsonb_array_elements_text(COALESCE(fot.audit_flags, '[]'::JSONB)) AS flag(value)
    WHERE fot.transaction_id = p_transaction_id
      AND flag.value = p_audit_flag
  )
  INTO v_exists;

  IF NOT v_exists THEN
    UPDATE public.financial_operation_traces
    SET audit_flags = COALESCE(audit_flags, '[]'::JSONB) || to_jsonb(p_audit_flag)
    WHERE transaction_id = p_transaction_id;
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Hard DB Financial Period Guard
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.require_open_financial_period_db(
  p_company_id     UUID,
  p_effective_date DATE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_period RECORD;
BEGIN
  SELECT
    id,
    period_name,
    status,
    is_locked
  INTO v_period
  FROM public.accounting_periods
  WHERE company_id = p_company_id
    AND p_effective_date BETWEEN period_start AND period_end
  ORDER BY period_start DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'NO_ACTIVE_FINANCIAL_PERIOD: No accounting period covers date % for company %',
      p_effective_date, p_company_id
      USING ERRCODE = 'P0001';
  END IF;

  IF COALESCE(v_period.is_locked, FALSE) OR COALESCE(v_period.status, 'open') IN ('closed', 'locked', 'audit_lock') THEN
    RAISE EXCEPTION
      'FINANCIAL_PERIOD_LOCKED: Period [%] is [%] for date %',
      COALESCE(v_period.period_name, v_period.id::TEXT),
      COALESCE(v_period.status, CASE WHEN v_period.is_locked THEN 'locked' ELSE 'open' END),
      p_effective_date
      USING ERRCODE = 'P0001';
  END IF;

  RETURN v_period.id;
END;
$$;

COMMENT ON FUNCTION public.require_open_financial_period_db IS
  'Hard DB-level accounting period guard. Blocks every V2 financial RPC if no active open period exists for the effective date.';

-- -----------------------------------------------------------------------------
-- 4. Balanced Journal Contract
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_journal_entries_balanced_v2(
  p_journal_entries JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_je            JSONB;
  v_line          JSONB;
  v_debit_total   NUMERIC;
  v_credit_total  NUMERIC;
  v_reference     TEXT;
BEGIN
  IF p_journal_entries IS NULL OR jsonb_typeof(p_journal_entries) <> 'array' OR jsonb_array_length(p_journal_entries) = 0 THEN
    RETURN;
  END IF;

  FOR v_je IN SELECT * FROM jsonb_array_elements(p_journal_entries)
  LOOP
    v_debit_total := 0;
    v_credit_total := 0;
    v_reference := COALESCE(v_je->>'reference_type', 'unknown') || ':' || COALESCE(v_je->>'reference_id', 'unknown');

    IF v_je->'lines' IS NULL OR jsonb_typeof(v_je->'lines') <> 'array' OR jsonb_array_length(v_je->'lines') = 0 THEN
      RAISE EXCEPTION 'UNBALANCED_JOURNAL_PAYLOAD: Journal payload [%] has no lines', v_reference
        USING ERRCODE = 'P0001';
    END IF;

    FOR v_line IN SELECT * FROM jsonb_array_elements(v_je->'lines')
    LOOP
      v_debit_total := v_debit_total + COALESCE((v_line->>'debit_amount')::NUMERIC, 0);
      v_credit_total := v_credit_total + COALESCE((v_line->>'credit_amount')::NUMERIC, 0);
    END LOOP;

    IF ABS(v_debit_total - v_credit_total) > 0.01 THEN
      RAISE EXCEPTION
        'UNBALANCED_JOURNAL_PAYLOAD: Journal [%] is not balanced. Debit=% Credit=%',
        v_reference, v_debit_total, v_credit_total
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. Core V2 Atomic Wrapper
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_accounting_event_v2(
  p_event_type                        TEXT,
  p_company_id                        UUID,
  p_items                             JSONB DEFAULT NULL,
  p_inventory_transactions            JSONB DEFAULT NULL,
  p_cogs_transactions                 JSONB DEFAULT NULL,
  p_fifo_consumptions                 JSONB DEFAULT NULL,
  p_journal_entries                   JSONB DEFAULT NULL,
  p_payments                          JSONB DEFAULT NULL,
  p_sales_returns                     JSONB DEFAULT NULL,
  p_sales_return_items                JSONB DEFAULT NULL,
  p_customer_credits                  JSONB DEFAULT NULL,
  p_update_source                     JSONB DEFAULT NULL,
  p_source_entity                     TEXT DEFAULT NULL,
  p_source_id                         UUID DEFAULT NULL,
  p_effective_date                    DATE DEFAULT NULL,
  p_actor_id                          UUID DEFAULT NULL,
  p_idempotency_key                   TEXT DEFAULT NULL,
  p_request_hash                      TEXT DEFAULT NULL,
  p_third_party_inventory_records     JSONB DEFAULT NULL,
  p_customer_credit_ledger_entries    JSONB DEFAULT NULL,
  p_trace_metadata                    JSONB DEFAULT '{}'::JSONB,
  p_audit_flags                       JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_idempotency_result JSONB;
  v_result             JSONB;
  v_effective_date     DATE;
  v_source_entity      TEXT;
  v_source_id          UUID;
  v_transaction_id     UUID;
  v_payment_id_text    TEXT;
  v_journal_id_text    TEXT;
  v_return_id_text     TEXT;
  v_credit_ledger      JSONB;
  v_tpi_record         JSONB;
  v_inserted_id        UUID;
  v_third_party_ids    UUID[] := ARRAY[]::UUID[];
  v_credit_ledger_ids  UUID[] := ARRAY[]::UUID[];
BEGIN
  v_effective_date := COALESCE(
    p_effective_date,
    CASE
      WHEN p_journal_entries IS NOT NULL AND jsonb_typeof(p_journal_entries) = 'array' AND jsonb_array_length(p_journal_entries) > 0
      THEN (p_journal_entries->0->>'entry_date')::DATE
      ELSE NULL
    END,
    CASE
      WHEN p_payments IS NOT NULL AND jsonb_typeof(p_payments) = 'array' AND jsonb_array_length(p_payments) > 0
      THEN (p_payments->0->>'payment_date')::DATE
      ELSE NULL
    END,
    CASE
      WHEN p_sales_returns IS NOT NULL AND jsonb_typeof(p_sales_returns) = 'array' AND jsonb_array_length(p_sales_returns) > 0
      THEN (p_sales_returns->0->>'return_date')::DATE
      ELSE NULL
    END,
    CURRENT_DATE
  );

  PERFORM public.require_open_financial_period_db(p_company_id, v_effective_date);
  PERFORM public.assert_journal_entries_balanced_v2(p_journal_entries);

  IF p_idempotency_key IS NOT NULL THEN
    v_idempotency_result := public.check_and_claim_idempotency_key(
      p_idempotency_key,
      p_company_id,
      'financial_' || p_event_type || '_v2',
      p_request_hash,
      p_actor_id
    );

    IF v_idempotency_result IS NOT NULL AND COALESCE(v_idempotency_result->>'cached', 'false') = 'true' THEN
      RETURN COALESCE(v_idempotency_result->'response', jsonb_build_object('success', true))
        || jsonb_build_object('cached', true, 'idempotent', true);
    END IF;
  END IF;

  v_result := public.post_accounting_event(
    p_event_type,
    p_company_id,
    p_items,
    p_inventory_transactions,
    p_cogs_transactions,
    p_fifo_consumptions,
    p_journal_entries,
    p_payments,
    p_sales_returns,
    p_sales_return_items,
    p_customer_credits,
    p_update_source
  );

  IF p_third_party_inventory_records IS NOT NULL
     AND jsonb_typeof(p_third_party_inventory_records) = 'array'
     AND jsonb_array_length(p_third_party_inventory_records) > 0 THEN
    FOR v_tpi_record IN SELECT * FROM jsonb_array_elements(p_third_party_inventory_records)
    LOOP
      INSERT INTO public.third_party_inventory (
        company_id,
        shipping_provider_id,
        product_id,
        invoice_id,
        quantity,
        unit_cost,
        total_cost,
        status,
        branch_id,
        cost_center_id,
        warehouse_id,
        customer_id,
        sales_order_id,
        notes
      ) VALUES (
        (v_tpi_record->>'company_id')::UUID,
        (v_tpi_record->>'shipping_provider_id')::UUID,
        (v_tpi_record->>'product_id')::UUID,
        (v_tpi_record->>'invoice_id')::UUID,
        (v_tpi_record->>'quantity')::NUMERIC,
        (v_tpi_record->>'unit_cost')::NUMERIC,
        (v_tpi_record->>'total_cost')::NUMERIC,
        COALESCE(v_tpi_record->>'status', 'open'),
        (v_tpi_record->>'branch_id')::UUID,
        (v_tpi_record->>'cost_center_id')::UUID,
        (v_tpi_record->>'warehouse_id')::UUID,
        (v_tpi_record->>'customer_id')::UUID,
        (v_tpi_record->>'sales_order_id')::UUID,
        v_tpi_record->>'notes'
      )
      RETURNING id INTO v_inserted_id;

      v_third_party_ids := array_append(v_third_party_ids, v_inserted_id);
    END LOOP;
  END IF;

  IF p_customer_credit_ledger_entries IS NOT NULL
     AND jsonb_typeof(p_customer_credit_ledger_entries) = 'array'
     AND jsonb_array_length(p_customer_credit_ledger_entries) > 0 THEN
    FOR v_credit_ledger IN SELECT * FROM jsonb_array_elements(p_customer_credit_ledger_entries)
    LOOP
      INSERT INTO public.customer_credit_ledger (
        company_id,
        customer_id,
        source_type,
        source_id,
        journal_entry_id,
        amount,
        description,
        created_by
      ) VALUES (
        (v_credit_ledger->>'company_id')::UUID,
        (v_credit_ledger->>'customer_id')::UUID,
        v_credit_ledger->>'source_type',
        (v_credit_ledger->>'source_id')::UUID,
        (v_credit_ledger->>'journal_entry_id')::UUID,
        (v_credit_ledger->>'amount')::NUMERIC,
        v_credit_ledger->>'description',
        (v_credit_ledger->>'created_by')::UUID
      )
      RETURNING id INTO v_inserted_id;

      v_credit_ledger_ids := array_append(v_credit_ledger_ids, v_inserted_id);
    END LOOP;
  END IF;

  IF p_update_source IS NOT NULL AND p_event_type = 'warehouse_approval' THEN
    UPDATE public.invoices
    SET
      warehouse_status = COALESCE(p_update_source->>'warehouse_status', warehouse_status),
      status = COALESCE(p_update_source->>'status', status),
      updated_at = NOW()
    WHERE id = (p_update_source->>'invoice_id')::UUID;
  END IF;

  v_source_entity := COALESCE(p_source_entity, 'financial_event');
  v_source_id := COALESCE(
    p_source_id,
    CASE WHEN p_update_source ? 'invoice_id' THEN (p_update_source->>'invoice_id')::UUID ELSE NULL END,
    CASE WHEN p_update_source ? 'id' THEN (p_update_source->>'id')::UUID ELSE NULL END,
    CASE
      WHEN p_sales_returns IS NOT NULL AND jsonb_typeof(p_sales_returns) = 'array' AND jsonb_array_length(p_sales_returns) > 0
      THEN (p_sales_returns->0->>'id')::UUID
      ELSE NULL
    END,
    CASE
      WHEN p_payments IS NOT NULL AND jsonb_typeof(p_payments) = 'array' AND jsonb_array_length(p_payments) > 0
      THEN (p_payments->0->>'invoice_id')::UUID
      ELSE NULL
    END
  );

  IF v_source_id IS NOT NULL THEN
    v_transaction_id := public.create_financial_operation_trace(
      p_company_id,
      v_source_entity,
      v_source_id,
      p_event_type,
      p_actor_id,
      p_idempotency_key,
      p_request_hash,
      COALESCE(p_trace_metadata, '{}'::JSONB),
      COALESCE(p_audit_flags, '[]'::JSONB)
    );

    PERFORM public.link_financial_operation_trace(
      v_transaction_id,
      v_source_entity,
      v_source_id,
      'source',
      p_event_type
    );

    IF COALESCE(jsonb_typeof(v_result->'payment_ids'), 'null') = 'array' THEN
      FOR v_payment_id_text IN SELECT * FROM jsonb_array_elements_text(v_result->'payment_ids')
      LOOP
        PERFORM public.link_financial_operation_trace(
          v_transaction_id,
          'payment',
          v_payment_id_text::UUID,
          'payment',
          p_event_type
        );
      END LOOP;
    END IF;

    IF COALESCE(jsonb_typeof(v_result->'journal_entry_ids'), 'null') = 'array' THEN
      FOR v_journal_id_text IN SELECT * FROM jsonb_array_elements_text(v_result->'journal_entry_ids')
      LOOP
        PERFORM public.link_financial_operation_trace(
          v_transaction_id,
          'journal_entry',
          v_journal_id_text::UUID,
          'journal_entry',
          p_event_type
        );
      END LOOP;
    END IF;

    IF COALESCE(jsonb_typeof(v_result->'return_ids'), 'null') = 'array' THEN
      FOR v_return_id_text IN SELECT * FROM jsonb_array_elements_text(v_result->'return_ids')
      LOOP
        PERFORM public.link_financial_operation_trace(
          v_transaction_id,
          'sales_return',
          v_return_id_text::UUID,
          'sales_return',
          p_event_type
        );
      END LOOP;
    END IF;

    IF COALESCE(array_length(v_third_party_ids, 1), 0) > 0 THEN
      FOREACH v_inserted_id IN ARRAY v_third_party_ids
      LOOP
        PERFORM public.link_financial_operation_trace(
          v_transaction_id,
          'third_party_inventory',
          v_inserted_id,
          'third_party_inventory',
          p_event_type
        );
      END LOOP;
    END IF;

    IF COALESCE(array_length(v_credit_ledger_ids, 1), 0) > 0 THEN
      FOREACH v_inserted_id IN ARRAY v_credit_ledger_ids
      LOOP
        PERFORM public.link_financial_operation_trace(
          v_transaction_id,
          'customer_credit_ledger',
          v_inserted_id,
          'customer_credit_ledger',
          p_event_type
        );
      END LOOP;
    END IF;
  END IF;

  v_result := v_result
    || jsonb_build_object(
      'transaction_id', v_transaction_id,
      'source_entity', v_source_entity,
      'source_id', v_source_id,
      'event_type', p_event_type,
      'third_party_inventory_ids', to_jsonb(COALESCE(v_third_party_ids, ARRAY[]::UUID[])),
      'customer_credit_ledger_ids', to_jsonb(COALESCE(v_credit_ledger_ids, ARRAY[]::UUID[]))
    );

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public.complete_idempotency_key(
      p_idempotency_key,
      p_company_id,
      'financial_' || p_event_type || '_v2',
      v_result,
      TRUE
    );
  END IF;

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    IF p_idempotency_key IS NOT NULL THEN
      BEGIN
        PERFORM public.complete_idempotency_key(
          p_idempotency_key,
          p_company_id,
          'financial_' || p_event_type || '_v2',
          jsonb_build_object(
            'success', false,
            'error', SQLERRM,
            'event_type', p_event_type
          ),
          FALSE
        );
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;
    RAISE;
END;
$$;

COMMENT ON FUNCTION public.post_accounting_event_v2 IS
  'Enterprise V2 atomic financial wrapper: hard period guard, idempotency, trace chain, additive third-party inventory support, additive customer credit ledger support.';

-- -----------------------------------------------------------------------------
-- 6. Dedicated V2 Wrapper: Invoice Post (Accrual-only)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_invoice_atomic_v2(
  p_company_id             UUID,
  p_invoice_id             UUID,
  p_inventory_transactions JSONB DEFAULT NULL,
  p_cogs_transactions      JSONB DEFAULT NULL,
  p_fifo_consumptions      JSONB DEFAULT NULL,
  p_journal_entries        JSONB DEFAULT NULL,
  p_update_source          JSONB DEFAULT NULL,
  p_effective_date         DATE DEFAULT NULL,
  p_actor_id               UUID DEFAULT NULL,
  p_idempotency_key        TEXT DEFAULT NULL,
  p_request_hash           TEXT DEFAULT NULL,
  p_trace_metadata         JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN public.post_accounting_event_v2(
    p_event_type             => 'invoice_posting',
    p_company_id             => p_company_id,
    p_inventory_transactions => p_inventory_transactions,
    p_cogs_transactions      => p_cogs_transactions,
    p_fifo_consumptions      => p_fifo_consumptions,
    p_journal_entries        => p_journal_entries,
    p_update_source          => p_update_source,
    p_source_entity          => 'invoice',
    p_source_id              => p_invoice_id,
    p_effective_date         => p_effective_date,
    p_actor_id               => p_actor_id,
    p_idempotency_key        => p_idempotency_key,
    p_request_hash           => p_request_hash,
    p_trace_metadata         => p_trace_metadata
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. Dedicated V2 Wrapper: Warehouse Approval (Inventory + FIFO + COGS)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_sales_delivery_v2(
  p_company_id                     UUID,
  p_invoice_id                     UUID,
  p_confirmed_by                   UUID,
  p_inventory_transactions         JSONB DEFAULT NULL,
  p_cogs_transactions              JSONB DEFAULT NULL,
  p_fifo_consumptions              JSONB DEFAULT NULL,
  p_journal_entries                JSONB DEFAULT NULL,
  p_third_party_inventory_records  JSONB DEFAULT NULL,
  p_effective_date                 DATE DEFAULT NULL,
  p_notes                          TEXT DEFAULT NULL,
  p_idempotency_key                TEXT DEFAULT NULL,
  p_request_hash                   TEXT DEFAULT NULL,
  p_trace_metadata                 JSONB DEFAULT '{}'::JSONB,
  p_audit_flags                    JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN public.post_accounting_event_v2(
    p_event_type                    => 'warehouse_approval',
    p_company_id                    => p_company_id,
    p_inventory_transactions        => p_inventory_transactions,
    p_cogs_transactions             => p_cogs_transactions,
    p_fifo_consumptions             => p_fifo_consumptions,
    p_journal_entries               => p_journal_entries,
    p_update_source                 => jsonb_build_object(
      'invoice_id', p_invoice_id,
      'warehouse_status', 'approved'
    ),
    p_source_entity                 => 'invoice',
    p_source_id                     => p_invoice_id,
    p_effective_date                => p_effective_date,
    p_actor_id                      => p_confirmed_by,
    p_idempotency_key               => p_idempotency_key,
    p_request_hash                  => p_request_hash,
    p_third_party_inventory_records => p_third_party_inventory_records,
    p_trace_metadata                => COALESCE(p_trace_metadata, '{}'::JSONB) || jsonb_build_object('notes', p_notes),
    p_audit_flags                   => p_audit_flags
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 8. Dedicated V2 Wrapper: Sales Return (Atomic End-to-End)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_sales_return_atomic_v2(
  p_company_id                      UUID,
  p_invoice_id                      UUID,
  p_sales_return_request_id         UUID DEFAULT NULL,
  p_sales_returns                   JSONB DEFAULT NULL,
  p_sales_return_items              JSONB DEFAULT NULL,
  p_inventory_transactions          JSONB DEFAULT NULL,
  p_cogs_transactions               JSONB DEFAULT NULL,
  p_fifo_consumptions               JSONB DEFAULT NULL,
  p_journal_entries                 JSONB DEFAULT NULL,
  p_customer_credits                JSONB DEFAULT NULL,
  p_customer_credit_ledger_entries  JSONB DEFAULT NULL,
  p_update_source                   JSONB DEFAULT NULL,
  p_effective_date                  DATE DEFAULT NULL,
  p_actor_id                        UUID DEFAULT NULL,
  p_idempotency_key                 TEXT DEFAULT NULL,
  p_request_hash                    TEXT DEFAULT NULL,
  p_trace_metadata                  JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  v_result := public.post_accounting_event_v2(
    p_event_type                     => 'return',
    p_company_id                     => p_company_id,
    p_inventory_transactions         => p_inventory_transactions,
    p_cogs_transactions              => p_cogs_transactions,
    p_fifo_consumptions              => p_fifo_consumptions,
    p_journal_entries                => p_journal_entries,
    p_sales_returns                  => p_sales_returns,
    p_sales_return_items             => p_sales_return_items,
    p_customer_credits               => p_customer_credits,
    p_customer_credit_ledger_entries => p_customer_credit_ledger_entries,
    p_update_source                  => p_update_source,
    p_source_entity                  => 'invoice',
    p_source_id                      => p_invoice_id,
    p_effective_date                 => p_effective_date,
    p_actor_id                       => p_actor_id,
    p_idempotency_key                => p_idempotency_key,
    p_request_hash                   => p_request_hash,
    p_trace_metadata                 => p_trace_metadata
  );

  IF p_sales_return_request_id IS NOT NULL THEN
    UPDATE public.sales_return_requests
    SET
      status = 'approved',
      reviewed_by = p_actor_id,
      reviewed_at = NOW()
    WHERE id = p_sales_return_request_id
      AND company_id = p_company_id;

    PERFORM public.link_financial_operation_trace(
      (v_result->>'transaction_id')::UUID,
      'sales_return_request',
      p_sales_return_request_id,
      'approval_request',
      'return'
    );
  END IF;

  RETURN v_result;
END;
$$;

-- -----------------------------------------------------------------------------
-- 9. Dedicated V2 Wrapper: Invoice Payment (Accrual-only, no revenue creation)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_invoice_payment_atomic_v2(
  p_invoice_id       UUID,
  p_company_id       UUID,
  p_customer_id      UUID,
  p_amount           NUMERIC,
  p_payment_date     DATE,
  p_payment_method   TEXT,
  p_reference_number TEXT DEFAULT NULL,
  p_notes            TEXT DEFAULT NULL,
  p_account_id       UUID DEFAULT NULL,
  p_branch_id        UUID DEFAULT NULL,
  p_cost_center_id   UUID DEFAULT NULL,
  p_warehouse_id     UUID DEFAULT NULL,
  p_user_id          UUID DEFAULT NULL,
  p_idempotency_key  TEXT DEFAULT NULL,
  p_request_hash     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invoice             RECORD;
  v_payment_id          UUID;
  v_branch_id           UUID;
  v_new_paid_amount     NUMERIC;
  v_new_status          TEXT;
  v_net_invoice_amount  NUMERIC;
  v_idempotency_result  JSONB;
  v_transaction_id      UUID;
  v_payment_journal_id  UUID;
  v_result              JSONB;
BEGIN
  PERFORM public.require_open_financial_period_db(p_company_id, p_payment_date);

  IF p_idempotency_key IS NOT NULL THEN
    v_idempotency_result := public.check_and_claim_idempotency_key(
      p_idempotency_key,
      p_company_id,
      'invoice_payment_v2',
      p_request_hash,
      p_user_id
    );

    IF v_idempotency_result IS NOT NULL AND COALESCE(v_idempotency_result->>'cached', 'false') = 'true' THEN
      RETURN COALESCE(v_idempotency_result->'response', jsonb_build_object('success', true))
        || jsonb_build_object('cached', true, 'idempotent', true);
    END IF;
  END IF;

  SELECT *
  INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
    AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND: Invoice % not found for company %',
      p_invoice_id, p_company_id
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.payments
    WHERE invoice_id = p_invoice_id
      AND amount = p_amount
      AND payment_date = p_payment_date
      AND COALESCE(reference_number, '') = COALESCE(p_reference_number, '')
      AND COALESCE(is_deleted, FALSE) = FALSE
  ) THEN
    RAISE EXCEPTION
      'DUPLICATE_PAYMENT: A payment of % on % with reference [%] already exists for invoice %',
      p_amount, p_payment_date, COALESCE(p_reference_number, ''), p_invoice_id
      USING ERRCODE = 'P0001';
  END IF;

  v_branch_id := COALESCE(p_branch_id, v_invoice.branch_id);

  IF v_branch_id IS NULL THEN
    SELECT id
    INTO v_branch_id
    FROM public.branches
    WHERE company_id = p_company_id
      AND is_active = TRUE
    ORDER BY is_main DESC NULLS LAST, name
    LIMIT 1;
  END IF;

  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'NO_BRANCH: No active branch found for company %. Create at least one branch.', p_company_id
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.payments (
    company_id,
    customer_id,
    invoice_id,
    payment_date,
    amount,
    payment_method,
    reference_number,
    notes,
    account_id,
    branch_id,
    cost_center_id,
    warehouse_id
  ) VALUES (
    p_company_id,
    p_customer_id,
    p_invoice_id,
    p_payment_date,
    p_amount,
    p_payment_method,
    p_reference_number,
    COALESCE(p_notes, 'دفعة على الفاتورة ' || v_invoice.invoice_number),
    p_account_id,
    v_branch_id,
    p_cost_center_id,
    p_warehouse_id
  )
  RETURNING id INTO v_payment_id;

  SELECT journal_entry_id
  INTO v_payment_journal_id
  FROM public.payments
  WHERE id = v_payment_id;

  v_new_paid_amount := COALESCE(v_invoice.paid_amount, 0) + p_amount;

  v_net_invoice_amount := CASE
    WHEN COALESCE(v_invoice.returned_amount, 0) > 0
         AND v_invoice.total_amount < COALESCE(v_invoice.returned_amount, 0)
      THEN v_invoice.total_amount
    ELSE GREATEST(0, v_invoice.total_amount - COALESCE(v_invoice.returned_amount, 0))
  END;

  v_new_status := CASE
    WHEN v_new_paid_amount >= v_net_invoice_amount THEN 'paid'
    ELSE 'partially_paid'
  END;

  UPDATE public.invoices
  SET
    paid_amount = v_new_paid_amount,
    status = v_new_status,
    updated_at = NOW()
  WHERE id = p_invoice_id;

  v_transaction_id := public.create_financial_operation_trace(
    p_company_id,
    'invoice',
    p_invoice_id,
    'invoice_payment',
    p_user_id,
    p_idempotency_key,
    p_request_hash,
    jsonb_build_object(
      'payment_id', v_payment_id,
      'payment_method', p_payment_method
    ),
    '[]'::JSONB
  );

  PERFORM public.link_financial_operation_trace(v_transaction_id, 'invoice', p_invoice_id, 'source', 'invoice_payment');
  PERFORM public.link_financial_operation_trace(v_transaction_id, 'payment', v_payment_id, 'payment', 'invoice_payment');

  IF v_payment_journal_id IS NOT NULL THEN
    PERFORM public.link_financial_operation_trace(v_transaction_id, 'journal_entry', v_payment_journal_id, 'journal_entry', 'invoice_payment');
  END IF;

  v_result := jsonb_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'journal_entry_id', v_payment_journal_id,
    'new_paid_amount', v_new_paid_amount,
    'new_status', v_new_status,
    'net_invoice_amount', v_net_invoice_amount,
    'remaining', GREATEST(0, v_net_invoice_amount - v_new_paid_amount),
    'invoice_journal_created', false,
    'transaction_id', v_transaction_id,
    'source_entity', 'invoice',
    'source_id', p_invoice_id,
    'event_type', 'invoice_payment'
  );

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public.complete_idempotency_key(
      p_idempotency_key,
      p_company_id,
      'invoice_payment_v2',
      v_result,
      TRUE
    );
  END IF;

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    IF p_idempotency_key IS NOT NULL THEN
      BEGIN
        PERFORM public.complete_idempotency_key(
          p_idempotency_key,
          p_company_id,
          'invoice_payment_v2',
          jsonb_build_object(
            'success', false,
            'error', SQLERRM,
            'source_entity', 'invoice',
            'source_id', p_invoice_id,
            'event_type', 'invoice_payment'
          ),
          FALSE
        );
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;
    RAISE;
END;
$$;

COMMENT ON FUNCTION public.process_invoice_payment_atomic_v2 IS
  'Accrual-only invoice payment RPC. Creates payment + cash/AR journal via trigger, updates invoice, adds DB traceability and idempotency, and NEVER creates revenue.';

-- -----------------------------------------------------------------------------
-- 10. Grants
-- -----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.require_open_financial_period_db TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_financial_operation_trace TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_financial_operation_trace TO authenticated;
GRANT EXECUTE ON FUNCTION public.append_financial_audit_flag TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_journal_entries_balanced_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_accounting_event_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_invoice_atomic_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_sales_delivery_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_sales_return_atomic_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_invoice_payment_atomic_v2 TO authenticated;
