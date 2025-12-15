# Tests Documentation

## 📋 Overview

This directory contains comprehensive tests for the ERP VitaSlims project, organized into:

- **`critical/`**: Critical business logic tests (accounting, inventory, security)
- **`integration/`**: API integration tests for endpoints
- **`e2e/`**: End-to-end workflow tests
- **`helpers/`**: Test utilities and setup functions

## 🚀 Running Tests

### Prerequisites

1. Set environment variables:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

### Run All Tests

```bash
pnpm test
```

### Run Specific Test Suites

```bash
# Critical tests only
pnpm test tests/critical

# API integration tests only
pnpm test tests/integration

# E2E tests only
pnpm test tests/e2e
```

### Run in Watch Mode

```bash
pnpm test --watch
```

## 📁 Test Structure

### Critical Tests (`tests/critical/`)

Tests that protect core business logic:
- `invoices.test.ts`: Invoice state transitions (Draft → Sent → Paid)
- `inventory.test.ts`: Inventory constraints and rules
- `journal.test.ts`: Journal entry balance checks
- `security.test.ts`: Security and authentication

### Integration Tests (`tests/integration/`)

API endpoint tests:
- `api-security.test.ts`: Security layer (secureApiRequest)
- `api-accounting.test.ts`: Accounting endpoints (fix-sent-invoice-journals, repair-invoice)
- `api-inventory.test.ts`: Inventory endpoints (fix-inventory)

### E2E Tests (`tests/e2e/`)

Complete workflow tests:
- `sales-workflow.test.ts`: Sales → Payments → Journals → Reports
- `purchases-workflow.test.ts`: Purchases → Payments → Inventory
- `returns-workflow.test.ts`: Returns (Partial / Full)

### Test Helpers (`tests/helpers/`)

- `test-setup.ts`: Utilities for creating test data, companies, customers, products, invoices

## 🔒 Test Data Isolation

Tests use isolated test data:
- Each test suite creates its own test company and user
- Test data is cleaned up after each suite
- Uses `SUPABASE_SERVICE_ROLE_KEY` for admin operations

## ⚠️ Important Notes

1. **Service Role Key Required**: Tests need `SUPABASE_SERVICE_ROLE_KEY` to create/delete test data
2. **Test Environment**: Tests should run against a test database, not production
3. **Cleanup**: Tests automatically clean up test data, but manual cleanup may be needed if tests fail

## 🎯 CI/CD Integration

Tests run automatically on:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`

CI pipeline (`.github/workflows/ci.yml`):
- Runs linter
- Runs critical tests
- Runs integration tests
- Runs E2E tests
- Blocks merge on failure

## 📝 Writing New Tests

### Example: API Integration Test

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestClient, createTestCompany, cleanupTestData } from '../helpers/test-setup'

describe('My API Test', () => {
  let supabase: ReturnType<typeof createTestClient>
  let companyId: string
  let userId: string

  beforeAll(async () => {
    supabase = createTestClient()
    const setup = await createTestCompany(supabase)
    companyId = setup.companyId
    userId = setup.userId
  })

  afterAll(async () => {
    await cleanupTestData(supabase, companyId, userId)
  })

  it('should test something', async () => {
    // Your test here
  })
})
```

## 🔍 Debugging Tests

1. **Run single test file**:
   ```bash
   pnpm test tests/integration/api-security.test.ts
   ```

2. **Run with verbose output**:
   ```bash
   pnpm test --reporter=verbose
   ```

3. **Run with coverage**:
   ```bash
   pnpm test --coverage
   ```

