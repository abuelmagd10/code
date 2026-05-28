-- v3.58.1 — Indexer: populate ai_knowledge_chunks from page_guides
-- Schema reality: steps_* are jsonb arrays, tips_* are text[] (Postgres arrays).
-- ===================================================================

CREATE OR REPLACE FUNCTION public.ai_reindex_page_guides()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count   INTEGER := 0;
  v_guide   RECORD;
  v_max     INTEGER;
  v_i       INTEGER;
  v_txt_ar  TEXT;
  v_txt_en  TEXT;
BEGIN
  -- Wipe previous global page_guide chunks (company_id IS NULL) and re-build.
  DELETE FROM public.ai_knowledge_chunks
  WHERE source_type LIKE 'page_guide%'
    AND company_id IS NULL;

  FOR v_guide IN
    SELECT page_key,
           COALESCE(title_ar, '')                 AS title_ar,
           COALESCE(title_en, '')                 AS title_en,
           COALESCE(description_ar, '')           AS description_ar,
           COALESCE(description_en, '')           AS description_en,
           COALESCE(steps_ar, '[]'::jsonb)        AS steps_ar,
           COALESCE(steps_en, '[]'::jsonb)        AS steps_en,
           COALESCE(tips_ar, ARRAY[]::text[])     AS tips_ar,
           COALESCE(tips_en, ARRAY[]::text[])     AS tips_en
    FROM public.page_guides
    WHERE is_active = TRUE
  LOOP
    -- Title chunk
    INSERT INTO public.ai_knowledge_chunks (
      source_type, source_key, source_field,
      content_ar, content_en, resource, company_id, metadata
    ) VALUES (
      'page_guide_title', v_guide.page_key, NULL,
      v_guide.title_ar, v_guide.title_en,
      NULL, NULL,
      jsonb_build_object('page_key', v_guide.page_key)
    );
    v_count := v_count + 1;

    -- Description chunk
    IF length(v_guide.description_ar) > 0 OR length(v_guide.description_en) > 0 THEN
      INSERT INTO public.ai_knowledge_chunks (
        source_type, source_key, source_field,
        content_ar, content_en, resource, company_id, metadata
      ) VALUES (
        'page_guide_description', v_guide.page_key, NULL,
        v_guide.description_ar, v_guide.description_en,
        NULL, NULL,
        jsonb_build_object('page_key', v_guide.page_key)
      );
      v_count := v_count + 1;
    END IF;

    -- Steps chunks (steps_* are jsonb arrays)
    v_max := GREATEST(
      jsonb_array_length(v_guide.steps_ar),
      jsonb_array_length(v_guide.steps_en)
    );

    FOR v_i IN 0..(v_max - 1) LOOP
      v_txt_ar := COALESCE(v_guide.steps_ar ->> v_i, '');
      v_txt_en := COALESCE(v_guide.steps_en ->> v_i, '');

      IF length(v_txt_ar) > 0 OR length(v_txt_en) > 0 THEN
        INSERT INTO public.ai_knowledge_chunks (
          source_type, source_key, source_field,
          content_ar, content_en, resource, company_id, metadata
        ) VALUES (
          'page_guide_step', v_guide.page_key,
          'step:' || v_i::TEXT,
          v_txt_ar, v_txt_en,
          NULL, NULL,
          jsonb_build_object('page_key', v_guide.page_key, 'index', v_i)
        );
        v_count := v_count + 1;
      END IF;
    END LOOP;

    -- Tips chunks (tips_* are text[] - 1-indexed in PostgreSQL)
    v_max := GREATEST(
      COALESCE(array_length(v_guide.tips_ar, 1), 0),
      COALESCE(array_length(v_guide.tips_en, 1), 0)
    );

    FOR v_i IN 1..v_max LOOP
      v_txt_ar := COALESCE(v_guide.tips_ar[v_i], '');
      v_txt_en := COALESCE(v_guide.tips_en[v_i], '');

      IF length(v_txt_ar) > 0 OR length(v_txt_en) > 0 THEN
        INSERT INTO public.ai_knowledge_chunks (
          source_type, source_key, source_field,
          content_ar, content_en, resource, company_id, metadata
        ) VALUES (
          'page_guide_tip', v_guide.page_key,
          'tip:' || (v_i - 1)::TEXT,
          v_txt_ar, v_txt_en,
          NULL, NULL,
          jsonb_build_object('page_key', v_guide.page_key, 'index', v_i - 1)
        );
        v_count := v_count + 1;
      END IF;
    END LOOP;

  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.ai_reindex_page_guides() IS
  'Re-builds the global (company_id IS NULL) page-guide chunks in ai_knowledge_chunks. Safe to run repeatedly; deletes then re-inserts.';

-- Run the seeder now.
SELECT public.ai_reindex_page_guides() AS rows_inserted;
