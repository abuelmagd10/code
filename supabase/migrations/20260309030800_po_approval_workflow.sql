/* 
  Migration for Purchase Order Approval Workflow 
*/

-- Add approval columns to purchase_orders table
ALTER TABLE "public"."purchase_orders" 
ADD COLUMN IF NOT EXISTS "rejection_reason" text,
ADD COLUMN IF NOT EXISTS "rejected_by" uuid REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS "rejected_at" timestamp with time zone,
ADD COLUMN IF NOT EXISTS "approved_by" uuid REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS "approved_at" timestamp with time zone;

-- Modify status constraint to include new statuses if it exists, or it might just be text
-- Ensure pending_approval and rejected are valid statuses for purchase orders
-- VitaSlims usually uses text without check constraints for status fields in some tables, but we'll add a comment
COMMENT ON COLUMN "public"."purchase_orders"."status" IS 'draft, sent, received, pending_approval, rejected, billed, partially_billed, cancelled, closed';

-- Add index on status for faster filtering
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON public.purchase_orders(status);
