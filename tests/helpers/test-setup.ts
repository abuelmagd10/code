/**
 * Test Setup & Utilities
 * =============================================
 * Helper functions for API integration and E2E tests
 * =============================================
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Use 'any' for the database type since we don't have generated types in tests
export type TestSupabaseClient = SupabaseClient<any, 'public', any>

export interface TestContext {
  supabase: TestSupabaseClient
  companyId: string
  userId: string
  testCustomerId?: string
  testProductId?: string
  testInvoiceId?: string
}

/**
 * v3.74.740 — tests must name their own database. They may never fall back to
 * the application's credentials.
 *
 * What these helpers do: createTestCompany() calls auth.admin.createUser and
 * inserts a company; the e2e suites then create customers, products, invoices,
 * payments and journal entries, and delete them again in afterAll.
 *
 * What they used to read: NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY — the exact variables the running application uses,
 * and the exact three the CI workflow passes from GitHub secrets.
 *
 * So the moment anyone added those secrets to make the test tier "work", every
 * push to main would have started creating and deleting real users and
 * companies inside the live accounting database. Nothing anywhere said no.
 *
 * Checked before writing this: production has 0 users matching test-%@test.com
 * and 0 companies matching %test%, which is how I know the secrets were never
 * configured and this has not already happened. It was a landmine, not a fire.
 *
 * Now the destructive helpers read TEST_SUPABASE_URL and
 * TEST_SUPABASE_SERVICE_ROLE_KEY only. No fallback. If they are unset the
 * suites skip, which is what they already do today — the difference is that
 * enabling them can no longer silently point at production.
 */
export function hasTestSupabaseCredentials() {
  const url = process.env.TEST_SUPABASE_URL
  const key = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY
  return Boolean(String(url || '').trim() && String(key || '').trim())
}

/**
 * Second line of defence: even if someone sets TEST_SUPABASE_URL to the
 * production project, refuse. The project ref is not a secret — it ships in the
 * browser bundle — so naming it here costs nothing and makes the accident
 * impossible rather than merely unlikely.
 */
const PRODUCTION_PROJECT_REF = 'hfvsbsizokxontflgdyn'

function assertNotProduction(url: string) {
  if (url.includes(PRODUCTION_PROJECT_REF)) {
    throw new Error(
      'Refusing to run destructive tests against the production project ' +
      `(${PRODUCTION_PROJECT_REF}). These helpers create and delete users, ` +
      'companies, invoices and journal entries. Point TEST_SUPABASE_URL at a ' +
      'separate Supabase project.'
    )
  }
}

export function getApiIntegrationBaseUrl() {
  return (
    String(
      process.env.TEST_APP_URL ||
      process.env.INTEGRATION_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      ''
    ).trim() || null
  )
}

export function shouldRunApiIntegrationScenarios() {
  return (
    hasTestSupabaseCredentials() &&
    Boolean(getApiIntegrationBaseUrl()) &&
    String(process.env.RUN_API_INTEGRATION_TESTS || '').trim() === '1'
  )
}

/**
 * Initialize test Supabase client
 */
export function createTestClient(): TestSupabaseClient {
  const url = process.env.TEST_SUPABASE_URL
  const key = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'Missing TEST_SUPABASE_URL / TEST_SUPABASE_SERVICE_ROLE_KEY. These tests ' +
      'create and delete real rows, so they require a database of their own — ' +
      'they deliberately do not fall back to the application credentials.'
    )
  }

  assertNotProduction(url)

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

/**
 * Create test company and user
 */
export async function createTestCompany(supabase: TestSupabaseClient) {
  // Create test user
  const testEmail = `test-${Date.now()}@test.com`
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: testEmail,
    password: 'test-password-123',
    email_confirm: true
  })

  if (authError || !authData.user) {
    throw new Error(`Failed to create test user: ${authError?.message}`)
  }

  const userId = authData.user.id

  // Create test company
  const { data: company, error: companyError } = await supabase
    .from('companies')
    .insert({
      name: `Test Company ${Date.now()}`,
      user_id: userId,
      email: testEmail
    })
    .select()
    .single()

  if (companyError || !company) {
    throw new Error(`Failed to create test company: ${companyError?.message}`)
  }

  // Add user as owner
  await supabase.from('company_members').insert({
    company_id: company.id,
    user_id: userId,
    role: 'owner',
    email: testEmail
  })

  return {
    userId,
    companyId: company.id,
    email: testEmail
  }
}

/**
 * Cleanup test data
 */
export async function cleanupTestData(
  supabase: TestSupabaseClient,
  companyId: string,
  userId: string
) {
  // Delete in reverse order of dependencies
  await supabase.from('company_members').delete().eq('company_id', companyId)
  await supabase.from('companies').delete().eq('id', companyId)
  await supabase.auth.admin.deleteUser(userId)
}

/**
 * Create test customer
 */
export async function createTestCustomer(
  supabase: TestSupabaseClient,
  companyId: string
) {
  const { data, error } = await supabase
    .from('customers')
    .insert({
      company_id: companyId,
      name: `Test Customer ${Date.now()}`,
      email: `customer-${Date.now()}@test.com`,
      phone: '1234567890'
    })
    .select()
    .single()

  if (error || !data) {
    throw new Error(`Failed to create test customer: ${error?.message}`)
  }

  return data.id
}

/**
 * Create test product
 */
export async function createTestProduct(
  supabase: TestSupabaseClient,
  companyId: string,
  options?: { quantity?: number; costPrice?: number; unitPrice?: number }
) {
  const { data, error } = await supabase
    .from('products')
    .insert({
      company_id: companyId,
      sku: `TEST-${Date.now()}`,
      name: `Test Product ${Date.now()}`,
      unit_price: options?.unitPrice || 100,
      cost_price: options?.costPrice || 50,
      quantity_on_hand: options?.quantity || 100,
      item_type: 'product'
    })
    .select()
    .single()

  if (error || !data) {
    throw new Error(`Failed to create test product: ${error?.message}`)
  }

  return data.id
}

/**
 * Create test invoice (draft)
 */
export async function createTestInvoice(
  supabase: TestSupabaseClient,
  companyId: string,
  customerId: string,
  productId: string,
  options?: { quantity?: number; status?: 'draft' | 'sent' | 'paid' }
) {
  const invoiceNumber = `TEST-INV-${Date.now()}`
  const quantity = options?.quantity || 1

  // Create invoice
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .insert({
      company_id: companyId,
      customer_id: customerId,
      invoice_number: invoiceNumber,
      invoice_date: new Date().toISOString().split('T')[0],
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      subtotal: 100 * quantity,
      tax_amount: 15 * quantity,
      total_amount: 115 * quantity,
      status: options?.status || 'draft'
    })
    .select()
    .single()

  if (invoiceError || !invoice) {
    throw new Error(`Failed to create test invoice: ${invoiceError?.message}`)
  }

  // Create invoice item
  const { error: itemError } = await supabase.from('invoice_items').insert({
    invoice_id: invoice.id,
    product_id: productId,
    quantity: quantity,
    unit_price: 100,
    line_total: 100 * quantity
  })

  if (itemError) {
    throw new Error(`Failed to create test invoice item: ${itemError.message}`)
  }

  return invoice.id
}

/**
 * Make authenticated API request
 */
export async function makeAuthenticatedRequest(
  url: string,
  options: {
    method?: string
    body?: any
    userId: string
    companyId: string
  }
) {
  // In a real test environment, you would:
  // 1. Create a session token for the test user
  // 2. Include it in the Authorization header
  // For now, this is a placeholder structure

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      // Authorization: `Bearer ${sessionToken}` // Would be set in real tests
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  })

  return {
    status: response.status,
    data: await response.json().catch(() => null),
    ok: response.ok
  }
}

