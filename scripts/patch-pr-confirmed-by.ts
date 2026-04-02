import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log("Starting backfill patch for purchase_returns confirmed_by...");
  
  // Find completed purchase returns where confirmed_by is null
  const { data: prs, error } = await supabase
    .from('purchase_returns')
    .select('id, workflow_status, notes')
    .in('workflow_status', ['completed', 'confirmed'])
    .is('confirmed_by', null);

  if (error) {
    console.error("Error fetching purchase returns:", error);
    process.exit(1);
  }

  if (!prs || prs.length === 0) {
    console.log("No purchase returns need patching.");
    return;
  }
  
  console.log(`Found ${prs.length} purchase returns missing confirmed_by field. Patching using audit_logs or created_by as fallback...`);

  let count = 0;
  for (const pr of prs) {
    // try to find the transition log in audit_logs
    const { data: logs } = await supabase
      .from('audit_logs')
      .select('user_id')
      .eq('entity_type', 'purchase_return')
      .eq('entity_id', pr.id)
      .eq('action', 'purchase_return_state_transition')
      .contains('new_values', { to_state: 'completed' })
      .order('created_at', { ascending: false })
      .limit(1);
      
    let confirmedBy = null;
    if (logs && logs.length > 0 && logs[0].user_id) {
       confirmedBy = logs[0].user_id;
    } else {
       // Check for inventory transaction creators
       const { data: invTx } = await supabase
         .from('inventory_transactions')
         .select('created_by')
         .eq('reference_id', pr.id)
         .eq('transaction_type', 'purchase_return')
         .limit(1);
         
       if (invTx && invTx.length > 0 && invTx[0].created_by) {
          confirmedBy = invTx[0].created_by;
       }
    }

    if (confirmedBy) {
      const { error: updErr } = await supabase
        .from('purchase_returns')
        .update({ confirmed_by: confirmedBy })
        .eq('id', pr.id);
      if (updErr) {
        console.error(`Failed to patch PR ${pr.id}:`, updErr);
      } else {
        console.log(`Successfully patched PR ${pr.id} with user_id: ${confirmedBy}`);
        count++;
      }
    } else {
      console.log(`Warning: Could not identify confirmer for PR ${pr.id}`);
    }
  }

  console.log(`Finished patching ${count}/${prs.length} purchase returns.`);
}

main().catch(console.error);
