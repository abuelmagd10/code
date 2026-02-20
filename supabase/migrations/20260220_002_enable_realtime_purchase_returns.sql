-- =============================================
-- 🔄 Enable Realtime for purchase_returns tables
-- =============================================
-- يُفعّل التحديثات الفورية لصفحة مرتجعات المشتريات
-- بحيث تنعكس التغييرات تلقائياً دون الحاجة لرفيش الصفحة

-- =============================================
-- 1. purchase_returns: REPLICA IDENTITY FULL
-- =============================================
ALTER TABLE public.purchase_returns REPLICA IDENTITY FULL;

-- =============================================
-- 2. purchase_return_warehouse_allocations
-- =============================================
ALTER TABLE public.purchase_return_warehouse_allocations REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'purchase_return_warehouse_allocations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.purchase_return_warehouse_allocations;
  END IF;
END;
$$;
