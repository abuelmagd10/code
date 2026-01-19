# 🧪 Purchase Return Baseline Test - Instructions

## Prerequisites

1. Ensure you have Node.js installed
2. Install dependencies: `npm install`
3. Set up `.env.local` with Supabase credentials:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_url
   SUPABASE_SERVICE_ROLE_KEY=your_key
   ```

## Test Execution

### Option 1: Automated Test Script (Verification Only)

The script `test_purchase_return_baseline.js` will:
- Create test data (supplier, product, branch, warehouse, cost center)
- Create a bill (1000)
- Receive the bill
- Pay the bill
- Create a purchase return record (300, credit)
- **Verify all checkpoints (A-E)**

**Note:** The script creates the return record but doesn't process it through the actual return flow. You need to process the return manually through the UI, then run the verification.

### Option 2: Manual Test (Recommended)

1. **Create Bill:**
   - Supplier: Supplier A (Test)
   - Product: Product X (Test)
   - Quantity: 10
   - Unit Price: 100
   - Total: 1000
   - Branch: B1 (Test)
   - Warehouse: W1 (Test)
   - Cost Center: CC1 (Test)

2. **Receive Bill:**
   - Change status to "Received"

3. **Pay Bill:**
   - Pay full amount (1000)
   - Status should become "Paid"

4. **Create Purchase Return:**
   - Return 3 units (300)
   - Return Type: **Credit**
   - Process through the system

5. **Run Verification:**
   ```bash
   node scripts/test_purchase_return_baseline.js
   ```

## Verification Checkpoints

### A) Bill Status
- ✅ `total_amount = 1000` (unchanged)
- ✅ `paid_amount = 1000` (unchanged)
- ✅ `status = 'paid'` (unchanged)
- ✅ `returned_amount = 300` (updated)
- ❌ No other financial changes

### B) FIFO Lots
- ✅ 3 units reversed from oldest lots
- ✅ Same `unit_cost` (100)
- ✅ `remaining_quantity` increased in `fifo_cost_lots`

### C) COGS Transactions
- ✅ COGS reversal created
- ✅ `source_type = 'return'`
- ✅ `source_id = purchase_return.id`
- ✅ Quantity = -3
- ✅ `unit_cost = 100`
- ✅ `total_cost = -300`

### D) Vendor Credit
- ✅ Created automatically
- ✅ `total_amount = 300`
- ✅ `status = 'open'`
- ✅ Linked to `purchase_return_id`
- ✅ Contains: `company_id`, `supplier_id`, `branch_id`, `warehouse_id`, `cost_center_id`

### E) Journal Entries
- ✅ Credit Return entry:
  - Dr. Vendor Credit Liability = 300
  - Cr. Inventory = 300
- ❌ No cash/bank lines
- ❌ No AP modification

## Expected Results

If all checkpoints pass:
- ✅ System is ERP-grade
- ✅ Accounting-compliant (matches Zoho/Odoo/QuickBooks)
- ✅ Production-ready

## Troubleshooting

### If FIFO verification fails:
- Check if FIFO is enabled for the product
- Verify `fifo_cost_lots` table has data
- Check `fifo_lot_consumptions` for bill

### If COGS verification fails:
- Check if COGS transactions are created for bills
- Verify `cogs_transactions` table structure
- Check `source_type` values

### If Vendor Credit verification fails:
- Verify `vendor_credits` table structure
- Check if return was processed as "Credit" type
- Verify governance fields are set

### If Journal Entry verification fails:
- Check `journal_entries` and `journal_entry_lines`
- Verify account mappings in `chart_of_accounts`
- Check if Vendor Credit Liability account exists
