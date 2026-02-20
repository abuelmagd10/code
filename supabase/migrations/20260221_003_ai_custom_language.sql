-- Add ai_custom_language column to company_ai_settings
-- Used when ai_language_mode = 'custom' to store the user's fixed language preference

ALTER TABLE public.company_ai_settings
  ADD COLUMN IF NOT EXISTS ai_custom_language TEXT NOT NULL DEFAULT 'ar'
    CHECK (ai_custom_language IN ('ar', 'en'));
