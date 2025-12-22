export type ChartAccount = {
  id: string
  account_code?: string
  account_name?: string
  account_type?: string
  parent_id?: string | null
  sub_type?: string | null
  opening_balance?: number | null
}

/**
 * Build a Set of leaf account ids (accounts that are never a parent of any other account).
 */
export function getLeafAccountIds<T extends { id: any; parent_id?: any }>(accounts: T[]): Set<any> {
  const parentIds = new Set(accounts.map((a) => a.parent_id).filter((pid) => !!pid))
  const leafIds = new Set(accounts.map((a) => a.id).filter((id) => !parentIds.has(id)))
  return leafIds
}

/**
 * Filter the provided accounts to leaf (posting) accounts only.
 */
export function filterLeafAccounts<T extends { id: any; parent_id?: any }>(accounts: T[]): T[] {
  const leafIds = getLeafAccountIds(accounts)
  return accounts.filter((a) => leafIds.has(a.id))
}

/**
 * Filter accounts to bank subtype, and optionally leaf-only.
 */
export function filterBankAccounts<T extends { id: any; parent_id?: any; sub_type?: any }>(
  accounts: T[],
  leafOnly = true,
): T[] {
  const bySubtype = accounts.filter((a) => String(a.sub_type || '').toLowerCase() === 'bank')
  if (!leafOnly) return bySubtype
  const leafIds = getLeafAccountIds(accounts)
  return bySubtype.filter((a) => leafIds.has(a.id))
}

/**
 * Filter accounts to cash or bank subtypes (or name-suggested cash/bank), and optionally leaf-only.
 */
export function filterCashBankAccounts<T extends { id: any; parent_id?: any; sub_type?: any; account_name?: any; account_type?: any }>(
  accounts: T[],
  leafOnly = true,
): T[] {
  const isCashOrBank = (a: any) => {
    // Must be an asset account
    const accountType = String(a.account_type || '').toLowerCase()
    if (accountType !== 'asset') return false

    const st = String(a.sub_type || '').toLowerCase()
    if (st === 'cash' || st === 'bank') return true
    const nm = String(a.account_name || '')
    const nmLower = nm.toLowerCase()
    if (nmLower.includes('cash') || nmLower.includes('bank')) return true
    if (/بنك|بنكي|مصرف|خزينة|نقد|صندوق/.test(nm)) return true
    return false
  }
  const byType = accounts.filter(isCashOrBank)
  if (!leafOnly) return byType
  const leafIds = getLeafAccountIds(accounts)
  return byType.filter((a) => leafIds.has(a.id))
}

// =============================================
// COA helpers: column detection and safe payload builders
// =============================================

export type CoaColumnFlags = {
  parentIdExists: boolean
  levelExists: boolean
  subTypeExists: boolean
  normalExists: boolean
}

/**
 * Detect optional columns in chart_of_accounts by probing a single row with select("*").
 * Works across environments without relying on cached schema.
 */
export async function detectCoaColumns(supabase: any): Promise<CoaColumnFlags> {
  try {
    const { data: probeData } = await supabase
      .from('chart_of_accounts')
      .select('*')
      .limit(1)
    const row = Array.isArray(probeData) ? probeData[0] : undefined
    return {
      parentIdExists: !!(row && Object.prototype.hasOwnProperty.call(row, 'parent_id')),
      levelExists: !!(row && Object.prototype.hasOwnProperty.call(row, 'level')),
      subTypeExists: !!(row && Object.prototype.hasOwnProperty.call(row, 'sub_type')),
      normalExists: !!(row && Object.prototype.hasOwnProperty.call(row, 'normal_balance')),
    }
  } catch (_) {
    return { parentIdExists: false, levelExists: false, subTypeExists: false, normalExists: false }
  }
}

/** Build insert payload from a Zoho-like node safely based on available columns. */
export function buildCoaInsertPayloadFromNode(
  node: { code: string; name: string; type: string; level: number; normal?: string; sub_type?: string },
  companyId: string,
  parentId: string | null,
  flags: CoaColumnFlags,
) {
  const payload: any = {
    company_id: companyId,
    account_code: node.code,
    account_name: node.name,
    account_type: node.type,
    is_active: true,
    opening_balance: 0,
    description: '',
  }
  if (flags.subTypeExists) payload.sub_type = node.sub_type ?? null
  if (flags.parentIdExists) payload.parent_id = parentId
  if (flags.levelExists) payload.level = node.level
  if (flags.normalExists) payload.normal_balance = node.normal
  return payload
}

/** Build update payload for an existing node safely based on available columns. */
export function buildCoaUpdatePayloadFromNode(
  node: { name: string; type: string; level: number; normal?: string; sub_type?: string },
  parentId: string | null,
  flags: CoaColumnFlags,
) {
  const payload: any = {
    account_name: node.name,
    account_type: node.type,
    is_active: true,
  }
  if (flags.subTypeExists) payload.sub_type = node.sub_type ?? null
  if (flags.parentIdExists) payload.parent_id = parentId
  if (flags.levelExists) payload.level = node.level
  if (flags.normalExists) payload.normal_balance = node.normal
  return payload
}

/** Build payload from form submission safely based on available columns. */
export function buildCoaFormPayload(
  formData: { account_code: string; account_name: string; account_type: string; sub_type?: string; parent_id?: string; normal_balance?: string },
  computedLevel: number,
  flags: CoaColumnFlags,
) {
  const payload: any = {
    account_code: formData.account_code,
    account_name: formData.account_name,
    account_type: formData.account_type,
    description: '',
  }
  if (flags.subTypeExists) payload.sub_type = formData.sub_type || null
  if (flags.parentIdExists) payload.parent_id = formData.parent_id ? formData.parent_id : null
  if (flags.levelExists) payload.level = computedLevel
  // إضافة normal_balance: إذا كان موجوداً في formData استخدمه، وإلا احسبه تلقائياً بناءً على account_type
  if (flags.normalExists) {
    if (formData.normal_balance) {
      payload.normal_balance = formData.normal_balance
    } else {
      // حساب تلقائي بناءً على نوع الحساب (مثل Zoho Books, Odoo)
      const accountType = formData.account_type.toLowerCase()
      payload.normal_balance = (accountType === 'asset' || accountType === 'expense') ? 'debit' : 'credit'
    }
  }
  return payload
}
