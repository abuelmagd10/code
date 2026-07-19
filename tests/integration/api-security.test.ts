/**
 * API Security Integration Tests
 * =============================================
 * Tests for unified security layer (secureApiRequest)
 * =============================================
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  createTestClient,
  createTestCompany,
  cleanupTestData,
  getApiIntegrationBaseUrl,
  shouldRunApiIntegrationScenarios,
} from '../helpers/test-setup'

const describeApiSecurityIntegration = shouldRunApiIntegrationScenarios() ? describe : describe.skip
const apiBaseUrl = getApiIntegrationBaseUrl()

describeApiSecurityIntegration('API Security Integration Tests', () => {
  let supabase: ReturnType<typeof createTestClient>
  let companyId: string
  let userId: string
  let testEmail: string

  beforeAll(async () => {
    supabase = createTestClient()
    const setup = await createTestCompany(supabase)
    companyId = setup.companyId
    userId = setup.userId
    testEmail = setup.email
  })

  afterAll(async () => {
    if (companyId && userId) {
      await cleanupTestData(supabase, companyId, userId)
    }
  })

  describe('requireOwnerOrAdmin - Critical Maintenance Endpoints', () => {
    it('should reject unauthenticated requests to /api/fix-inventory', async () => {
      const response = await fetch(`${apiBaseUrl}/api/fix-inventory`, {
        method: 'GET'
      })
      expect(response.status).toBe(401)
    })

    it('should reject unauthenticated requests to /api/fix-sent-invoice-journals', async () => {
      const response = await fetch(`${apiBaseUrl}/api/fix-sent-invoice-journals`, {
        method: 'GET'
      })
      expect(response.status).toBe(401)
    })

    it('should reject unauthenticated requests to /api/repair-invoice', async () => {
      const response = await fetch(`${apiBaseUrl}/api/repair-invoice?invoice_number=TEST-001`, {
        method: 'GET'
      })
      expect(response.status).toBe(401)
    })

    it('should reject unauthenticated requests to /api/apply-write-off-fix', async () => {
      const response = await fetch(`${apiBaseUrl}/api/apply-write-off-fix`, {
        method: 'POST'
      })
      expect(response.status).toBe(401)
    })
  })

  /**
   * v3.74.741 — these two were `expect(true).toBe(true)` placeholders.
   *
   * They are not merely unwritten: the exact property they claim to check is
   * the one that failed in production. GET /api/bonuses accepted companyId from
   * the query string with no authentication and returned any company's
   * compensation records (fixed in v3.74.737). A green tick sat here the whole
   * time.
   *
   * The property IS enforced now, and checked on every build — statically,
   * across all 112 service-role routes, by scripts/check-service-role-scoping.js,
   * which carries fixtures pinning this precise shape. So the coverage exists;
   * it lives in CI rather than here.
   *
   * Left as todo rather than deleted: a runtime test against a real endpoint
   * would still be stronger than a static one, once there is a test database
   * to run it against (TEST_SUPABASE_URL, see v3.74.740).
   */
  describe('secureApiRequest - Company ID Protection', () => {
    it.todo('should not accept companyId from query parameters')
    it.todo('should extract companyId from authenticated user context only')
  })

  describe('Error Handling Unification', () => {
    it('should return standardized error format from apiError helpers', async () => {
      const response = await fetch(`${apiBaseUrl}/api/fix-inventory`, {
        method: 'GET'
      })
      const data = await response.json().catch(() => null)
      
      // Should use apiError format, not NextResponse.json
      if (data) {
        expect(data).toHaveProperty('error')
        // Should not have raw NextResponse structure
        expect(data).not.toHaveProperty('status')
      }
    })
  })
})

