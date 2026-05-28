-- v3.58.4b — Arabic-aware FTS normalization
-- =====================================================================
-- The 'simple' Postgres FTS config treats these as three different tokens:
--   "الشَحن" (with fatha), "الشحن" (no diacritics), "شحن" (no ال)
-- For Arabic content this kills recall. We rebuild tsv_ar / tsv_en to:
--   1. strip Arabic diacritics (U+064B-U+0652, U+0670, U+0640 tatweel)
--   2. drop word-initial Arabic articles: ال, وال, بال, لل, كال, فال
--   3. then tokenize via to_tsvector('simple', ...)
--
-- The same normalizer is exposed as an IMMUTABLE function so the search
-- RPC can apply it to user queries before matching.
-- =====================================================================

-- 1. Reusable normalizer (immutable, deterministic).
CREATE OR REPLACE FUNCTION public.ai_normalize_for_fts(input TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT regexp_replace(
    regexp_replace(
      regexp_replace(
        COALESCE(input, ''),
        '[ؐ-ًؚ-ْٰـۖ-ۭ]',
        '',
        'g'
      ),
      '\m(وال|بال|كال|فال|لل|ال)',
      '',
      'g'
    ),
    '\s+',
    ' ',
    'g'
  );
$$;

COMMENT ON FUNCTION public.ai_normalize_for_fts(TEXT) IS
  'Arabic-aware text normalizer: strips harakat, tatweel, and common ال/وال/بال/لل/كال/فال prefixes before FTS tokenization.';

-- 2. Rebuild the generated FTS columns to use the normalizer.
ALTER TABLE public.ai_knowledge_chunks DROP COLUMN tsv_ar;
ALTER TABLE public.ai_knowledge_chunks DROP COLUMN tsv_en;

ALTER TABLE public.ai_knowledge_chunks
  ADD COLUMN tsv_ar tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple', public.ai_normalize_for_fts(content_ar))
  ) STORED;

ALTER TABLE public.ai_knowledge_chunks
  ADD COLUMN tsv_en tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple', public.ai_normalize_for_fts(content_en))
  ) STORED;

-- 3. Re-create the GIN indexes (the old ones were dropped with the columns).
CREATE INDEX ai_knowledge_chunks_tsv_ar_idx
  ON public.ai_knowledge_chunks USING GIN (tsv_ar);
CREATE INDEX ai_knowledge_chunks_tsv_en_idx
  ON public.ai_knowledge_chunks USING GIN (tsv_en);

-- 4. Update the search RPC to normalize the query the same way.
CREATE OR REPLACE FUNCTION public.ai_search_pages(
  p_query             TEXT,
  p_lang              TEXT    DEFAULT 'ar',
  p_exclude_page_key  TEXT    DEFAULT NULL,
  p_limit             INTEGER DEFAULT 20
)
RETURNS TABLE (
  page_key      TEXT,
  title         TEXT,
  description   TEXT,
  best_snippet  TEXT,
  score         REAL,
  match_count   INTEGER
)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean    TEXT;
  v_or_text  TEXT;
  v_tsquery  tsquery;
BEGIN
  v_clean := COALESCE(p_query, '');
  v_clean := regexp_replace(v_clean, '[&|!():*<>=]', ' ', 'g');
  v_clean := public.ai_normalize_for_fts(v_clean);
  v_clean := regexp_replace(v_clean, '\s+', ' ', 'g');
  v_clean := TRIM(v_clean);

  IF v_clean = '' THEN
    RETURN;
  END IF;

  v_or_text := regexp_replace(v_clean, '\s+', ' | ', 'g');

  BEGIN
    v_tsquery := to_tsquery('simple', v_or_text);
  EXCEPTION WHEN OTHERS THEN
    RETURN;
  END;

  IF p_lang = 'en' THEN
    RETURN QUERY
    WITH matched AS (
      SELECT
        (c.metadata->>'page_key')::TEXT AS pk,
        c.source_type, c.source_field, c.content_en AS content,
        ts_rank(c.tsv_en, v_tsquery) AS chunk_rank
      FROM public.ai_knowledge_chunks c
      WHERE c.company_id IS NULL
        AND c.tsv_en @@ v_tsquery
        AND (p_exclude_page_key IS NULL OR (c.metadata->>'page_key') <> p_exclude_page_key)
    ),
    aggregated AS (
      SELECT
        pk AS page_key,
        SUM(chunk_rank * CASE source_type
              WHEN 'page_guide_title' THEN 5.0
              WHEN 'page_guide_description' THEN 2.5
              WHEN 'page_guide_step' THEN 1.5
              WHEN 'page_guide_tip' THEN 1.0
              ELSE 1.0 END)::REAL AS score,
        COUNT(*)::INTEGER AS match_count,
        (ARRAY_AGG(content ORDER BY chunk_rank DESC, source_type))[1] AS best_snippet
      FROM matched
      GROUP BY pk
    )
    SELECT a.page_key,
      COALESCE((SELECT t.content_en FROM public.ai_knowledge_chunks t
        WHERE t.source_type='page_guide_title' AND t.source_key=a.page_key
          AND t.company_id IS NULL LIMIT 1), '') AS title,
      COALESCE((SELECT d.content_en FROM public.ai_knowledge_chunks d
        WHERE d.source_type='page_guide_description' AND d.source_key=a.page_key
          AND d.company_id IS NULL LIMIT 1), '') AS description,
      a.best_snippet, a.score, a.match_count
    FROM aggregated a
    WHERE EXISTS (SELECT 1 FROM public.ai_knowledge_chunks t2
      WHERE t2.source_type='page_guide_title' AND t2.source_key=a.page_key
        AND t2.company_id IS NULL AND LENGTH(t2.content_en) > 0)
    ORDER BY a.score DESC LIMIT p_limit;
  ELSE
    RETURN QUERY
    WITH matched AS (
      SELECT
        (c.metadata->>'page_key')::TEXT AS pk,
        c.source_type, c.source_field, c.content_ar AS content,
        ts_rank(c.tsv_ar, v_tsquery) AS chunk_rank
      FROM public.ai_knowledge_chunks c
      WHERE c.company_id IS NULL
        AND c.tsv_ar @@ v_tsquery
        AND (p_exclude_page_key IS NULL OR (c.metadata->>'page_key') <> p_exclude_page_key)
    ),
    aggregated AS (
      SELECT
        pk AS page_key,
        SUM(chunk_rank * CASE source_type
              WHEN 'page_guide_title' THEN 5.0
              WHEN 'page_guide_description' THEN 2.5
              WHEN 'page_guide_step' THEN 1.5
              WHEN 'page_guide_tip' THEN 1.0
              ELSE 1.0 END)::REAL AS score,
        COUNT(*)::INTEGER AS match_count,
        (ARRAY_AGG(content ORDER BY chunk_rank DESC, source_type))[1] AS best_snippet
      FROM matched
      GROUP BY pk
    )
    SELECT a.page_key,
      COALESCE((SELECT t.content_ar FROM public.ai_knowledge_chunks t
        WHERE t.source_type='page_guide_title' AND t.source_key=a.page_key
          AND t.company_id IS NULL LIMIT 1), '') AS title,
      COALESCE((SELECT d.content_ar FROM public.ai_knowledge_chunks d
        WHERE d.source_type='page_guide_description' AND d.source_key=a.page_key
          AND d.company_id IS NULL LIMIT 1), '') AS description,
      a.best_snippet, a.score, a.match_count
    FROM aggregated a
    WHERE EXISTS (SELECT 1 FROM public.ai_knowledge_chunks t2
      WHERE t2.source_type='page_guide_title' AND t2.source_key=a.page_key
        AND t2.company_id IS NULL AND LENGTH(t2.content_ar) > 0)
    ORDER BY a.score DESC LIMIT p_limit;
  END IF;
END;
$$;
