-- البحث عن جميع triggers على جدول invoices
SELECT 
  trigger_name,
  event_manipulation,
  action_timing
FROM information_schema.triggers
WHERE event_object_table = 'invoices';
