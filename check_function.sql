-- فحص دالة post_depreciation
SELECT proname, proargnames, prosrc
FROM pg_proc
WHERE proname = 'post_depreciation';

-- فحص أعمدة الجداول المستخدمة
SELECT 'depreciation_schedules' as table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'depreciation_schedules'
ORDER BY ordinal_position;

SELECT 'fixed_assets' as table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'fixed_assets'
ORDER BY ordinal_position;

SELECT 'journal_entries' as table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'journal_entries'
ORDER BY ordinal_position;

SELECT 'journal_entry_lines' as table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'journal_entry_lines'
ORDER BY ordinal_position;
