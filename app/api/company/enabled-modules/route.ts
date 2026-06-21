/**
 * v3.74.260 — Module Subscription Phase 1 (UI-layer only).
 *
 * GET  /api/company/enabled-modules  → reads enabled_modules for the
 *                                       caller's company.
 * PUT  /api/company/enabled-modules  → owner-only update.
 *
 * Phase 1 contract: this column only controls sidebar visibility.
 * APIs, RPCs and triggers are untouched, so deep links and existing
 * integrations keep working even for "disabled" modules.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { OPTIONAL_MODULES, CORE_MODULES } from '@/lib/module-manifest'

const OPTIONAL_SET = new Set<string>(OPTIONAL_MODULES as readonly string[])

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
    }

    const { data: member } = await supabase
      .from('company_members')
      .select('company_id, role')
      .eq('user_id', user.id)
      .maybeSingle()

    let companyId = member?.company_id as string | undefined
    let role = (member?.role as string | undefined) ?? ''
    if (!companyId) {
      // owner without a company_members row (legacy)
      const { data: ownedCompany } = await supabase
        .from('companies')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()
      companyId = ownedCompany?.id
      if (companyId) role = 'owner'
    }
    if (!companyId) {
      return NextResponse.json({ error: 'no_company' }, { status: 404 })
    }

    const { data: company } = await supabase
      .from('companies')
      .select('enabled_modules')
      .eq('id', companyId)
      .maybeSingle()

    return NextResponse.json({
      enabled_modules: (company?.enabled_modules ?? null) as string[] | null,
      role,
      core_modules: CORE_MODULES,
      optional_modules: OPTIONAL_MODULES,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
    }

    // Locate the caller's company and confirm they're the owner.
    let companyId: string | undefined
    let role: string | undefined
    const { data: member } = await supabase
      .from('company_members')
      .select('company_id, role')
      .eq('user_id', user.id)
      .maybeSingle()
    if (member?.company_id) {
      companyId = member.company_id
      role = member.role as string
    } else {
      const { data: ownedCompany } = await supabase
        .from('companies')
        .select('id, user_id')
        .eq('user_id', user.id)
        .maybeSingle()
      if (ownedCompany) {
        companyId = ownedCompany.id
        role = 'owner'
      }
    }
    if (!companyId) {
      return NextResponse.json({ error: 'no_company' }, { status: 404 })
    }
    if (role !== 'owner') {
      return NextResponse.json({ error: 'owner_only' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const raw = body?.enabled_modules
    // Accept either null (= "show every module") or an array of strings.
    let nextValue: string[] | null
    if (raw === null) {
      nextValue = null
    } else if (Array.isArray(raw)) {
      // Whitelist: only optional modules are persisted. Core modules are
      // always on regardless of what the client sends, and unknown keys
      // are silently dropped — no failure path needed.
      const cleaned = Array.from(
        new Set(
          raw
            .map((x) => String(x))
            .filter((x) => OPTIONAL_SET.has(x))
        )
      ).sort()
      nextValue = cleaned
    } else {
      return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })
    }

    const { error: updErr } = await supabase
      .from('companies')
      .update({ enabled_modules: nextValue })
      .eq('id', companyId)
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 })
    }

    return NextResponse.json({ enabled_modules: nextValue, ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}
