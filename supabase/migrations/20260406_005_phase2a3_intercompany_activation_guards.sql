-- =============================================================================
-- Phase 2A.3: Intercompany Activation Guards
-- =============================================================================
-- Additive only
-- Strengthens pair integrity, FX lock completeness, and dry-run elimination rules
-- =============================================================================

BEGIN;

ALTER TABLE IF EXISTS public.intercompany_transactions
  ADD COLUMN IF NOT EXISTS intercompany_relationship_id UUID REFERENCES public.intercompany_relationships(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS seller_rate_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS buyer_rate_timestamp TIMESTAMPTZ;

ALTER TABLE IF EXISTS public.intercompany_documents
  ADD COLUMN IF NOT EXISTS locked_rate_timestamp TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_intercompany_transactions_relationship
  ON public.intercompany_transactions(intercompany_relationship_id);

CREATE OR REPLACE FUNCTION public.ic_validate_intercompany_transaction_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  rel RECORD;
BEGIN
  IF NEW.seller_company_id = NEW.buyer_company_id THEN
    RAISE EXCEPTION 'INTERCOMPANY_PAIR_INVALID: seller_company_id and buyer_company_id must differ';
  END IF;

  IF NEW.intercompany_relationship_id IS NOT NULL THEN
    SELECT *
      INTO rel
    FROM public.intercompany_relationships
    WHERE id = NEW.intercompany_relationship_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'INTERCOMPANY_RELATIONSHIP_MISSING: intercompany relationship not found';
    END IF;

    IF rel.seller_company_id <> NEW.seller_company_id
       OR rel.buyer_company_id <> NEW.buyer_company_id THEN
      RAISE EXCEPTION 'INTERCOMPANY_RELATIONSHIP_PAIR_MISMATCH: relationship pair does not match transaction pair';
    END IF;

    IF rel.seller_legal_entity_id <> NEW.seller_legal_entity_id
       OR rel.buyer_legal_entity_id <> NEW.buyer_legal_entity_id THEN
      RAISE EXCEPTION 'INTERCOMPANY_RELATIONSHIP_ENTITY_MISMATCH: legal entity pair does not match relationship';
    END IF;

    IF rel.relationship_status NOT IN ('draft', 'active') THEN
      RAISE EXCEPTION 'INTERCOMPANY_RELATIONSHIP_INACTIVE: relationship is not active';
    END IF;

    IF NEW.transaction_date < rel.effective_from
       OR (rel.effective_to IS NOT NULL AND NEW.transaction_date > rel.effective_to) THEN
      RAISE EXCEPTION 'INTERCOMPANY_RELATIONSHIP_OUTSIDE_EFFECTIVE_RANGE: transaction_date is outside relationship validity';
    END IF;
  END IF;

  IF (
    NEW.seller_exchange_rate IS NOT NULL
    OR NULLIF(BTRIM(COALESCE(NEW.seller_rate_source, '')), '') IS NOT NULL
    OR NEW.seller_rate_timestamp IS NOT NULL
  ) THEN
    IF NEW.seller_exchange_rate IS NULL
       OR NULLIF(BTRIM(COALESCE(NEW.seller_rate_source, '')), '') IS NULL
       OR NEW.seller_rate_timestamp IS NULL THEN
      RAISE EXCEPTION 'INTERCOMPANY_SELLER_RATE_LOCK_INCOMPLETE: exchange_rate, rate_source, and rate_timestamp are required together';
    END IF;
  END IF;

  IF (
    NEW.buyer_exchange_rate IS NOT NULL
    OR NULLIF(BTRIM(COALESCE(NEW.buyer_rate_source, '')), '') IS NOT NULL
    OR NEW.buyer_rate_timestamp IS NOT NULL
  ) THEN
    IF NEW.buyer_exchange_rate IS NULL
       OR NULLIF(BTRIM(COALESCE(NEW.buyer_rate_source, '')), '') IS NULL
       OR NEW.buyer_rate_timestamp IS NULL THEN
      RAISE EXCEPTION 'INTERCOMPANY_BUYER_RATE_LOCK_INCOMPLETE: exchange_rate, rate_source, and rate_timestamp are required together';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_intercompany_transaction_integrity
  ON public.intercompany_transactions;

CREATE TRIGGER trg_intercompany_transaction_integrity
BEFORE INSERT OR UPDATE ON public.intercompany_transactions
FOR EACH ROW
EXECUTE FUNCTION public.ic_validate_intercompany_transaction_integrity();

CREATE OR REPLACE FUNCTION public.ic_validate_intercompany_document_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  tx RECORD;
BEGIN
  SELECT id, seller_company_id, buyer_company_id, transaction_currency
    INTO tx
  FROM public.intercompany_transactions
  WHERE id = NEW.intercompany_transaction_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INTERCOMPANY_TRANSACTION_MISSING: parent transaction not found';
  END IF;

  IF NEW.side = 'seller' AND NEW.company_id <> tx.seller_company_id THEN
    RAISE EXCEPTION 'INTERCOMPANY_DOCUMENT_PAIR_MISMATCH: seller-side document must reference seller company';
  END IF;

  IF NEW.side = 'buyer' AND NEW.company_id <> tx.buyer_company_id THEN
    RAISE EXCEPTION 'INTERCOMPANY_DOCUMENT_PAIR_MISMATCH: buyer-side document must reference buyer company';
  END IF;

  IF NEW.transaction_currency IS NOT NULL
     AND tx.transaction_currency IS NOT NULL
     AND NEW.transaction_currency <> tx.transaction_currency THEN
    RAISE EXCEPTION 'INTERCOMPANY_DOCUMENT_CURRENCY_MISMATCH: document currency must match transaction currency';
  END IF;

  IF (
    NEW.locked_exchange_rate IS NOT NULL
    OR NULLIF(BTRIM(COALESCE(NEW.rate_source, '')), '') IS NOT NULL
    OR NEW.locked_rate_timestamp IS NOT NULL
  ) THEN
    IF NEW.locked_exchange_rate IS NULL
       OR NULLIF(BTRIM(COALESCE(NEW.rate_source, '')), '') IS NULL
       OR NEW.locked_rate_timestamp IS NULL THEN
      RAISE EXCEPTION 'INTERCOMPANY_DOCUMENT_RATE_LOCK_INCOMPLETE: locked_exchange_rate, rate_source, and locked_rate_timestamp are required together';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_intercompany_document_integrity
  ON public.intercompany_documents;

CREATE TRIGGER trg_intercompany_document_integrity
BEFORE INSERT OR UPDATE ON public.intercompany_documents
FOR EACH ROW
EXECUTE FUNCTION public.ic_validate_intercompany_document_integrity();

CREATE OR REPLACE FUNCTION public.ic_validate_elimination_dry_run_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_run_type TEXT;
BEGIN
  SELECT run_type
    INTO v_run_type
  FROM public.consolidation_runs
  WHERE id = NEW.consolidation_run_id;

  IF v_run_type IS NULL THEN
    RAISE EXCEPTION 'CONSOLIDATION_RUN_MISSING: consolidation run not found';
  END IF;

  IF v_run_type <> 'dry_run' THEN
    RAISE EXCEPTION 'ELIMINATION_DRY_RUN_REQUIRED: elimination entries are locked to dry_run runs during Phase 2A.3';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_elimination_entries_dry_run_only
  ON public.elimination_entries;

CREATE TRIGGER trg_elimination_entries_dry_run_only
BEFORE INSERT OR UPDATE ON public.elimination_entries
FOR EACH ROW
EXECUTE FUNCTION public.ic_validate_elimination_dry_run_only();

COMMIT;
