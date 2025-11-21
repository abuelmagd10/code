-- Add company logo_url column if missing
ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url text;