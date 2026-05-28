-- v3.58.0 — RAG Foundation: pgvector + ai_knowledge_chunks + FTS columns + RLS
-- =================================================================
-- Phase 3 of the AI Assistant upgrade.
-- This migration is RUNTIME-NEUTRAL: no existing code touches this table yet.
-- Subsequent migrations (v3.58.1+) will populate it.
-- =================================================================

-- 1. Enable the pgvector extension for future embedding-based search.
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Main knowledge chunks table.
CREATE TABLE public.ai_knowledge_chunks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source attribution: where did this chunk come from?
  -- source_type examples: 'page_guide_title', 'page_guide_description',
  --                       'page_guide_step', 'page_guide_tip',
  --                       'page_guide_accounting_event',
  --                       'company_customer', 'company_product',
  --                       'company_invoice_summary', 'company_bill_summary'
  source_type     TEXT NOT NULL,

  -- The unique identifier within the source type (page_key, entity id, etc.)
  source_key      TEXT NOT NULL,

  -- Optional sub-field discriminator (e.g. step index, tip index)
  source_field    TEXT,

  -- Bilingual content. Either may be empty when the source is single-language.
  content_ar      TEXT NOT NULL DEFAULT '',
  content_en      TEXT NOT NULL DEFAULT '',

  -- Auto-generated FTS columns. We use the 'simple' config because it works
  -- consistently for Arabic + English without requiring language-specific
  -- dictionaries to be installed on every Postgres instance.
  tsv_ar          tsvector GENERATED ALWAYS AS (to_tsvector('simple', content_ar)) STORED,
  tsv_en          tsvector GENERATED ALWAYS AS (to_tsvector('simple', content_en)) STORED,

  -- Optional embeddings — populated only when an embedding provider is
  -- configured (Phase v3.58.4+). Dimension 1536 matches OpenAI
  -- text-embedding-3-small and nomic-embed-text on Ollama.
  embedding_ar    vector(1536),
  embedding_en    vector(1536),

  -- Governance:
  -- `resource` is matched against company_role_permissions.resource and
  -- the per-role allowed_pages set. NULL means the chunk is not gated by
  -- a specific page resource (e.g. global help text).
  resource        TEXT,

  -- `company_id` NULL  → global content (e.g. shared page guides)
  -- `company_id` value → tenant-specific data (e.g. customer names, products)
  company_id      UUID REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Flexible metadata: link back to entity row id, navigation route, etc.
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Each (source_type, source_key, source_field, company_id) maps to ONE chunk.
  CONSTRAINT ai_knowledge_chunks_source_uniq
    UNIQUE (source_type, source_key, source_field, company_id)
);

COMMENT ON TABLE public.ai_knowledge_chunks IS
  'RAG knowledge base for the AI Assistant. Each row is a small searchable chunk linked to a source page or company entity. Used by /api/ai/find-page and (eventually) /api/ai/chat.';

COMMENT ON COLUMN public.ai_knowledge_chunks.resource IS
  'Maps to company_role_permissions.resource. Used for governance filtering.';

COMMENT ON COLUMN public.ai_knowledge_chunks.company_id IS
  'NULL = global content readable by all authenticated users. Value = tenant-specific content scoped to that company.';

-- 3. FTS indexes (GIN) — fast keyword + phrase ranking.
CREATE INDEX ai_knowledge_chunks_tsv_ar_idx
  ON public.ai_knowledge_chunks USING GIN (tsv_ar);

CREATE INDEX ai_knowledge_chunks_tsv_en_idx
  ON public.ai_knowledge_chunks USING GIN (tsv_en);

-- 4. Lookup indexes — used by re-index jobs and governance filtering.
CREATE INDEX ai_knowledge_chunks_source_idx
  ON public.ai_knowledge_chunks (source_type, source_key);

CREATE INDEX ai_knowledge_chunks_resource_idx
  ON public.ai_knowledge_chunks (resource)
  WHERE resource IS NOT NULL;

CREATE INDEX ai_knowledge_chunks_company_idx
  ON public.ai_knowledge_chunks (company_id)
  WHERE company_id IS NOT NULL;

-- NOTE: vector indexes (ivfflat / hnsw) are intentionally NOT created here.
--   They will be added in a follow-up migration (v3.58.4) only if an
--   embedding provider is actually configured.

-- 5. Auto-update updated_at on row change.
CREATE OR REPLACE FUNCTION public.ai_knowledge_chunks_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER ai_knowledge_chunks_touch_updated_at
  BEFORE UPDATE ON public.ai_knowledge_chunks
  FOR EACH ROW EXECUTE FUNCTION public.ai_knowledge_chunks_touch_updated_at();

-- 6. Row Level Security
ALTER TABLE public.ai_knowledge_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_knowledge_chunks_select" ON public.ai_knowledge_chunks
  FOR SELECT
  USING (
    company_id IS NULL
    OR
    company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "ai_knowledge_chunks_write_service_role" ON public.ai_knowledge_chunks
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
