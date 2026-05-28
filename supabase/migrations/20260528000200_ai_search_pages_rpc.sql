-- v3.58.2 — Postgres RPC: ai_search_pages(query, lang, exclude, limit)
-- ===================================================================
-- Replaces the ILIKE-based search inside lib/ai/cross-page-search.ts
-- with a Postgres full-text search over ai_knowledge_chunks.
--
-- Uses OR between query tokens (not the default AND) so multi-word
-- queries like "فاتورة بيع" return any chunk matching EITHER word.
-- ts_rank handles precision ranking, and source_type weighting boosts
-- title chunks (+5x) above description (+2.5x), step (+1.5x), tip (+1x).
--
-- Returns one row per matched page_key with:
--   - title (from the page_guide_title chunk)
--   - description (from the page_guide_description chunk if any)
--   - best_snippet (highest-ranked matching chunk's content)
--   - score (rank-weighted sum across all matched chunks on the page)
--   - match_count (how many distinct chunks matched on this page)
--
-- SECURITY INVOKER so caller RLS applies. Granted to authenticated.
-- ===================================================================

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
  -- 1. Clean input: strip tsquery operators + collapse whitespace.
  v_clean := COALESCE(p_query, '');
  v_clean := regexp_replace(v_clean, '[&|!():*<>=]', ' ', 'g');
  v_clean := regexp_replace(v_clean, '\s+', ' ', 'g');
  v_clean := TRIM(v_clean);

  IF v_clean = '' THEN
    RETURN;
  END IF;

  -- 2. Convert "word1 word2 word3" -> "word1 | word2 | word3" (OR semantics).
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
        c.source_type,
        c.source_field,
        c.content_en AS content,
        ts_rank(c.tsv_en, v_tsquery) AS chunk_rank
      FROM public.ai_knowledge_chunks c
      WHERE c.company_id IS NULL
        AND c.tsv_en @@ v_tsquery
        AND (p_exclude_page_key IS NULL OR (c.metadata->>'page_key') <> p_exclude_page_key)
    ),
    aggregated AS (
      SELECT
        pk AS page_key,
        SUM(
          chunk_rank * CASE source_type
            WHEN 'page_guide_title'       THEN 5.0
            WHEN 'page_guide_description' THEN 2.5
            WHEN 'page_guide_step'        THEN 1.5
            WHEN 'page_guide_tip'         THEN 1.0
            ELSE 1.0
          END
        )::REAL AS score,
        COUNT(*)::INTEGER AS match_count,
        (ARRAY_AGG(content ORDER BY chunk_rank DESC, source_type))[1] AS best_snippet
      FROM matched
      GROUP BY pk
    )
    SELECT
      a.page_key,
      COALESCE(
        (SELECT t.content_en FROM public.ai_knowledge_chunks t
          WHERE t.source_type = 'page_guide_title'
            AND t.source_key = a.page_key
            AND t.company_id IS NULL LIMIT 1), ''
      ) AS title,
      COALESCE(
        (SELECT d.content_en FROM public.ai_knowledge_chunks d
          WHERE d.source_type = 'page_guide_description'
            AND d.source_key = a.page_key
            AND d.company_id IS NULL LIMIT 1), ''
      ) AS description,
      a.best_snippet,
      a.score,
      a.match_count
    FROM aggregated a
    WHERE EXISTS (
      SELECT 1 FROM public.ai_knowledge_chunks t2
      WHERE t2.source_type = 'page_guide_title'
        AND t2.source_key = a.page_key
        AND t2.company_id IS NULL
        AND LENGTH(t2.content_en) > 0
    )
    ORDER BY a.score DESC
    LIMIT p_limit;

  ELSE
    RETURN QUERY
    WITH matched AS (
      SELECT
        (c.metadata->>'page_key')::TEXT AS pk,
        c.source_type,
        c.source_field,
        c.content_ar AS content,
        ts_rank(c.tsv_ar, v_tsquery) AS chunk_rank
      FROM public.ai_knowledge_chunks c
      WHERE c.company_id IS NULL
        AND c.tsv_ar @@ v_tsquery
        AND (p_exclude_page_key IS NULL OR (c.metadata->>'page_key') <> p_exclude_page_key)
    ),
    aggregated AS (
      SELECT
        pk AS page_key,
        SUM(
          chunk_rank * CASE source_type
            WHEN 'page_guide_title'       THEN 5.0
            WHEN 'page_guide_description' THEN 2.5
            WHEN 'page_guide_step'        THEN 1.5
            WHEN 'page_guide_tip'         THEN 1.0
            ELSE 1.0
          END
        )::REAL AS score,
        COUNT(*)::INTEGER AS match_count,
        (ARRAY_AGG(content ORDER BY chunk_rank DESC, source_type))[1] AS best_snippet
      FROM matched
      GROUP BY pk
    )
    SELECT
      a.page_key,
      COALESCE(
        (SELECT t.content_ar FROM public.ai_knowledge_chunks t
          WHERE t.source_type = 'page_guide_title'
            AND t.source_key = a.page_key
            AND t.company_id IS NULL LIMIT 1), ''
      ) AS title,
      COALESCE(
        (SELECT d.content_ar FROM public.ai_knowledge_chunks d
          WHERE d.source_type = 'page_guide_description'
            AND d.source_key = a.page_key
            AND d.company_id IS NULL LIMIT 1), ''
      ) AS description,
      a.best_snippet,
      a.score,
      a.match_count
    FROM aggregated a
    WHERE EXISTS (
      SELECT 1 FROM public.ai_knowledge_chunks t2
      WHERE t2.source_type = 'page_guide_title'
        AND t2.source_key = a.page_key
        AND t2.company_id IS NULL
        AND LENGTH(t2.content_ar) > 0
    )
    ORDER BY a.score DESC
    LIMIT p_limit;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.ai_search_pages(TEXT, TEXT, TEXT, INTEGER) IS
  'Full-text search over ai_knowledge_chunks. Returns ranked page suggestions with title, description, best snippet, score, and match count. SECURITY INVOKER so caller RLS applies.';

GRANT EXECUTE ON FUNCTION public.ai_search_pages(TEXT, TEXT, TEXT, INTEGER) TO authenticated;
