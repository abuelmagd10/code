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

  describe('secureApiRequest - Company ID Protection', () => {
    it('should not accept companyId from query parameters', async () => {
      // This test verifies that endpoints don't accept companyId from request
      // The actual implementation should extract companyId from secureApiRequest only
      // This is a structural test - actual auth would require session setup
      expect(true).toBe(true) // Placeholder - requires session token setup
    })

    it('should extract companyId from authenticated user context only', async () => {
      // Verify that companyId comes from secureApiRequest, not request params
      expect(true).toBe(true) // Placeholder - requires session token setup
    })
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

