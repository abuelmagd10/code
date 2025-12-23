-- Check companies table schema
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'companies'
ORDER BY ordinal_position;

-- Check if currency column exists
SELECT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_name = 'companies'
  AND column_name = 'currency'
) AS currency_column_exists;

-- Check if base_currency column exists
SELECT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_name = 'companies'
  AND column_name = 'base_currency'
) AS base_currency_column_exists;

