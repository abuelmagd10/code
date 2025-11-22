import { NextRequest, NextResponse } from "next/server"
import { createClient as createSSR } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"

async function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  return url && serviceKey ? createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } }) : null
}

function dateRangeFromParams(searchParams: URLSearchParams) {
  const from = String(searchParams.get('from') || '')
  const to = String(searchParams.get('to') || '')
  if (from && to) return { from, to }
  const toDef = new Date()
  const fromDef = new Date()
  fromDef.setDate(toDef.getDate() - 30)
  return { from: fromDef.toISOString().slice(0,10), to: toDef.toISOString().slice(0,10) }
}

export async function GET(req: NextRequest) {
  try {
    const admin = await getAdmin()
    const ssr = await createSSR()
    const { data: { user } } = await ssr.auth.getUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const params = req.nextUrl.searchParams
    const companyId = String(params.get('companyId') || '')
    if (!companyId) return NextResponse.json({ error: 'invalid_company' }, { status: 400 })
    const { from, to } = dateRangeFromParams(params)

    const client = admin || ssr

    const { data: invoices } = await client
      .from('invoices')
      .select('id, invoice_number, invoice_date')
      .eq('company_id', companyId)
      .gte('invoice_date', from)
      .lte('invoice_date', to)
    const invIds = (invoices || []).map((i: any) => i.id)

    const { data: invItems } = await client
      .from('invoice_items')
      .select('invoice_id, product_id, quantity')
      .in('invoice_id', invIds.length ? invIds : ['00000000-0000-0000-0000-000000000000'])
    const salesExpected = new Map<string, Map<string, number>>()
    for (const it of invItems || []) {
      const im = salesExpected.get(it.invoice_id) || new Map<string, number>()
      im.set(it.product_id, (im.get(it.product_id) || 0) + Number(it.quantity || 0))
      salesExpected.set(it.invoice_id, im)
    }

    const { data: salesTx } = await client
      .from('inventory_transactions')
      .select('reference_id, product_id, quantity_change, created_at')
      .eq('company_id', companyId)
      .eq('transaction_type', 'sale')
      .in('reference_id', invIds.length ? invIds : ['00000000-0000-0000-0000-000000000000'])
    const salesActual = new Map<string, Map<string, number>>()
    for (const tx of salesTx || []) {
      const im = salesActual.get(tx.reference_id) || new Map<string, number>()
      im.set(tx.product_id, (im.get(tx.product_id) || 0) + Math.abs(Number(tx.quantity_change || 0)))
      salesActual.set(tx.reference_id, im)
    }

    const salesMismatches: any[] = []
    for (const inv of invoices || []) {
      const exp = salesExpected.get(inv.id) || new Map<string, number>()
      const act = salesActual.get(inv.id) || new Map<string, number>()
      const productIds = new Set<string>([...exp.keys(), ...act.keys()])
      for (const pid of productIds) {
        const e = exp.get(pid) || 0
        const a = act.get(pid) || 0
        if (e !== a) salesMismatches.push({ type: 'sale', invoice_number: inv.invoice_number, product_id: pid, expected_qty: e, actual_qty: a, delta: a - e })
      }
    }

    const { data: bills } = await client
      .from('bills')
      .select('id, bill_number, bill_date')
      .eq('company_id', companyId)
      .gte('bill_date', from)
      .lte('bill_date', to)
    const billIds = (bills || []).map((b: any) => b.id)

    const { data: billItems } = await client
      .from('bill_items')
      .select('bill_id, product_id, quantity')
      .in('bill_id', billIds.length ? billIds : ['00000000-0000-0000-0000-000000000000'])
    const purchaseExpected = new Map<string, Map<string, number>>()
    for (const it of billItems || []) {
      const im = purchaseExpected.get(it.bill_id) || new Map<string, number>()
      im.set(it.product_id, (im.get(it.product_id) || 0) + Number(it.quantity || 0))
      purchaseExpected.set(it.bill_id, im)
    }

    const { data: purchaseTx } = await client
      .from('inventory_transactions')
      .select('reference_id, product_id, quantity_change, created_at')
      .eq('company_id', companyId)
      .eq('transaction_type', 'purchase')
      .in('reference_id', billIds.length ? billIds : ['00000000-0000-0000-0000-000000000000'])
    const purchaseActual = new Map<string, Map<string, number>>()
    for (const tx of purchaseTx || []) {
      const im = purchaseActual.get(tx.reference_id) || new Map<string, number>()
      im.set(tx.product_id, (im.get(tx.product_id) || 0) + Math.abs(Number(tx.quantity_change || 0)))
      purchaseActual.set(tx.reference_id, im)
    }

    const purchaseMismatches: any[] = []
    for (const b of bills || []) {
      const exp = purchaseExpected.get(b.id) || new Map<string, number>()
      const act = purchaseActual.get(b.id) || new Map<string, number>()
      const productIds = new Set<string>([...exp.keys(), ...act.keys()])
      for (const pid of productIds) {
        const e = exp.get(pid) || 0
        const a = act.get(pid) || 0
        if (e !== a) purchaseMismatches.push({ type: 'purchase', bill_number: b.bill_number, product_id: pid, expected_qty: e, actual_qty: a, delta: a - e })
      }
    }

    const summary = {
      from,
      to,
      invoices_count: (invoices || []).length,
      bills_count: (bills || []).length,
      sales_mismatches: salesMismatches.length,
      purchase_mismatches: purchaseMismatches.length,
    }

    return NextResponse.json({ summary, salesMismatches, purchaseMismatches }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'unknown_error' }, { status: 500 })
  }
}