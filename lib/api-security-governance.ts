/**
 * 🔒 API SECURITY UPDATES - Remove NULL Governance Escapes
 * 
 * This script updates all API endpoints to remove dangerous patterns like:
 * - OR branch_id IS NULL
 * - OR cost_center_id IS NULL  
 * - OR warehouse_id IS NULL
 * 
 * These patterns destroy ERP security and auditability.
 */

import { createClient } from '@supabase/supabase-js';
import ERPGovernanceLayer, { GovernanceContext } from './erp-governance-layer';

// =====================================
// 1️⃣ SECURE QUERY BUILDER
// =====================================

export class SecureQueryBuilder {
  private supabase: any;
  private governance: GovernanceContext;

  constructor(supabase: any, governance: GovernanceContext) {
    this.supabase = supabase;
    this.governance = governance;
  }

  /**
   * Secure suppliers query - NO NULL escapes
   */
  getSuppliers() {
    return this.supabase
      .from('suppliers')
      .select('*')
      .eq('company_id', this.governance.companyId)
      .eq('branch_id', this.governance.branchId)
      .eq('cost_center_id', this.governance.costCenterId)
      .eq('is_active', true);
  }

  /**
   * Secure customers query - NO NULL escapes
   */
  getCustomers() {
    return this.supabase
      .from('customers')
      .select('*')
      .eq('company_id', this.governance.companyId)
      .eq('branch_id', this.governance.branchId)
      .eq('cost_center_id', this.governance.costCenterId)
      .eq('is_active', true);
  }

  /**
   * Secure invoices query - NO NULL escapes
   */
  getInvoices() {
    return this.supabase
      .from('invoices')
      .select('*')
      .eq('company_id', this.governance.companyId)
      .eq('branch_id', this.governance.branchId)
      .eq('cost_center_id', this.governance.costCenterId)
      .eq('warehouse_id', this.governance.warehouseId);
  }

  /**
   * Secure bills query - NO NULL escapes
   */
  getBills() {
    return this.supabase
      .from('bills')
      .select('*')
      .eq('company_id', this.governance.companyId)
      .eq('branch_id', this.governance.branchId)
      .eq('cost_center_id', this.governance.costCenterId)
      .eq('warehouse_id', this.governance.warehouseId);
  }

  /**
   * Secure inventory transactions query - NO NULL escapes
   */
  getInventoryTransactions() {
    return this.supabase
      .from('inventory_transactions')
      .select('*')
      .eq('company_id', this.governance.companyId)
      .eq('branch_id', this.governance.branchId)
      .eq('cost_center_id', this.governance.costCenterId)
      .eq('warehouse_id', this.governance.warehouseId);
  }

  /**
   * Secure sales orders query - NO NULL escapes
   */
  getSalesOrders() {
    return this.supabase
      .from('sales_orders')
      .select('*')
      .eq('company_id', this.governance.companyId)
      .eq('branch_id', this.governance.branchId)
      .eq('cost_center_id', this.governance.costCenterId)
      .eq('warehouse_id', this.governance.warehouseId);
  }

  /**
   * Secure purchase orders query - NO NULL escapes
   */
  getPurchaseOrders() {
    return this.supabase
      .from('purchase_orders')
      .select('*')
      .eq('company_id', this.governance.companyId)
      .eq('branch_id', this.governance.branchId)
      .eq('cost_center_id', this.governance.costCenterId)
      .eq('warehouse_id', this.governance.warehouseId);
  }
}

// =====================================
// 2️⃣ SECURE API ENDPOINTS
// =====================================

/**
 * Secure suppliers API - removes all NULL escapes
 */
export async function getSecureSuppliers(req: any, res: any) {
  try {
    const governance = req.governance as GovernanceContext;
    ERPGovernanceLayer.validateGovernance(governance);

    const queryBuilder = new SecureQueryBuilder(req.supabase, governance);
    const { data, error } = await queryBuilder.getSuppliers();

    if (error) throw error;

    return res.json({ data, success: true });
  } catch (error: any) {
    return res.status(400).json({ error: error.message, success: false });
  }
}

/**
 * Secure customers API - removes all NULL escapes
 */
export async function getSecureCustomers(req: any, res: any) {
  try {
    const governance = req.governance as GovernanceContext;
    ERPGovernanceLayer.validateGovernance(governance);

    const queryBuilder = new SecureQueryBuilder(req.supabase, governance);
    const { data, error } = await queryBuilder.getCustomers();

    if (error) throw error;

    return res.json({ data, success: true });
  } catch (error: any) {
    return res.status(400).json({ error: error.message, success: false });
  }
}

/**
 * Secure invoices API - removes all NULL escapes
 */
export async function getSecureInvoices(req: any, res: any) {
  try {
    const governance = req.governance as GovernanceContext;
    ERPGovernanceLayer.validateGovernance(governance, true); // Require warehouse

    const queryBuilder = new SecureQueryBuilder(req.supabase, governance);
    const { data, error } = await queryBuilder.getInvoices();

    if (error) throw error;

    return res.json({ data, success: true });
  } catch (error: any) {
    return res.status(400).json({ error: error.message, success: false });
  }
}

/**
 * Secure bills API - removes all NULL escapes
 */
export async function getSecureBills(req: any, res: any) {
  try {
    const governance = req.governance as GovernanceContext;
    ERPGovernanceLayer.validateGovernance(governance, true); // Require warehouse

    const queryBuilder = new SecureQueryBuilder(req.supabase, governance);
    const { data, error } = await queryBuilder.getBills();

    if (error) throw error;

    return res.json({ data, success: true });
  } catch (error: any) {
    return res.status(400).json({ error: error.message, success: false });
  }
}

/**
 * Secure inventory API - removes all NULL escapes
 */
export async function getSecureInventoryTransactions(req: any, res: any) {
  try {
    const governance = req.governance as GovernanceContext;
    ERPGovernanceLayer.validateInventoryOperation(governance, 'query');

    const queryBuilder = new SecureQueryBuilder(req.supabase, governance);
    const { data, error } = await queryBuilder.getInventoryTransactions();

    if (error) throw error;

    return res.json({ data, success: true });
  } catch (error: any) {
    return res.status(400).json({ error: error.message, success: false });
  }
}

// =====================================
// 3️⃣ SECURE CREATE OPERATIONS
// =====================================

/**
 * Secure supplier creation - enforces governance
 */
export async function createSecureSupplier(req: any, res: any) {
  try {
    const governance = req.governance as GovernanceContext;
    ERPGovernanceLayer.validateGovernance(governance);

    const supplierData = ERPGovernanceLayer.enforceGovernanceOnInsert(
      req.body,
      governance,
      false // No warehouse for suppliers
    );

    const { data, error } = await req.supabase
      .from('suppliers')
      .insert(supplierData)
      .select()
      .single();

    if (error) throw error;

    return res.json({ data, success: true });
  } catch (error: any) {
    return res.status(400).json({ error: error.message, success: false });
  }
}

/**
 * Secure customer creation - enforces governance
 */
export async function createSecureCustomer(req: any, res: any) {
  try {
    const governance = req.governance as GovernanceContext;
    ERPGovernanceLayer.validateGovernance(governance);

    const customerData = ERPGovernanceLayer.enforceGovernanceOnInsert(
      req.body,
      governance,
      false // No warehouse for customers
    );

    const { data, error } = await req.supabase
      .from('customers')
      .insert(customerData)
      .select()
      .single();

    if (error) throw error;

    return res.json({ data, success: true });
  } catch (error: any) {
    return res.status(400).json({ error: error.message, success: false });
  }
}

/**
 * Secure invoice creation - enforces governance
 */
export async function createSecureInvoice(req: any, res: any) {
  try {
    const governance = req.governance as GovernanceContext;
    ERPGovernanceLayer.validateFinancialOperation(governance, 'invoice');

    const invoiceData = ERPGovernanceLayer.enforceGovernanceOnInsert(
      req.body,
      governance,
      true // Require warehouse for invoices
    );

    const { data, error } = await req.supabase
      .from('invoices')
      .insert(invoiceData)
      .select()
      .single();

    if (error) throw error;

    return res.json({ data, success: true });
  } catch (error: any) {
    return res.status(400).json({ error: error.message, success: false });
  }
}

/**
 * Secure bill creation - enforces governance
 */
export async function createSecureBill(req: any, res: any) {
  try {
    const governance = req.governance as GovernanceContext;
    ERPGovernanceLayer.validateFinancialOperation(governance, 'bill');

    const billData = ERPGovernanceLayer.enforceGovernanceOnInsert(
      req.body,
      governance,
      true // Require warehouse for bills
    );

    const { data, error } = await req.supabase
      .from('bills')
      .insert(billData)
      .select()
      .single();

    if (error) throw error;

    return res.json({ data, success: true });
  } catch (error: any) {
    return res.status(400).json({ error: error.message, success: false });
  }
}

/**
 * Secure inventory transaction creation - enforces governance
 */
export async function createSecureInventoryTransaction(req: any, res: any) {
  try {
    const governance = req.governance as GovernanceContext;
    ERPGovernanceLayer.validateInventoryOperation(governance, 'transaction');

    const transactionData = ERPGovernanceLayer.enforceGovernanceOnInsert(
      req.body,
      governance,
      true // Require warehouse for inventory
    );

    const { data, error } = await req.supabase
      .from('inventory_transactions')
      .insert(transactionData)
      .select()
      .single();

    if (error) throw error;

    return res.json({ data, success: true });
  } catch (error: any) {
    return res.status(400).json({ error: error.message, success: false });
  }
}

// =====================================
// 4️⃣ DANGEROUS PATTERN DETECTOR
// =====================================

/**
 * Detects and removes dangerous NULL escape patterns
 */
export class DangerousPatternDetector {
  private static dangerousPatterns = [
    /OR\s+branch_id\s+IS\s+NULL/gi,
    /OR\s+cost_center_id\s+IS\s+NULL/gi,
    /OR\s+warehouse_id\s+IS\s+NULL/gi,
    /OR\s+company_id\s+IS\s+NULL/gi,
    /branch_id\s+IS\s+NULL\s+OR/gi,
    /cost_center_id\s+IS\s+NULL\s+OR/gi,
    /warehouse_id\s+IS\s+NULL\s+OR/gi,
    /company_id\s+IS\s+NULL\s+OR/gi,
  ];

  static detectDangerousPatterns(query: string): string[] {
    const violations: string[] = [];
    
    this.dangerousPatterns.forEach((pattern, index) => {
      if (pattern.test(query)) {
        violations.push(`Dangerous NULL escape pattern detected: ${pattern.source}`);
      }
    });

    return violations;
  }

  static sanitizeQuery(query: string): string {
    let sanitized = query;
    
    this.dangerousPatterns.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '');
    });

    // Clean up any resulting empty conditions
    sanitized = sanitized.replace(/\s+AND\s+AND\s+/gi, ' AND ');
    sanitized = sanitized.replace(/\s+OR\s+OR\s+/gi, ' OR ');
    sanitized = sanitized.replace(/WHERE\s+AND/gi, 'WHERE');
    sanitized = sanitized.replace(/WHERE\s+OR/gi, 'WHERE');

    return sanitized.trim();
  }
}

// =====================================
// 5️⃣ MIDDLEWARE FOR PATTERN DETECTION
// =====================================

/**
 * Middleware to detect dangerous patterns in requests
 */
export function detectDangerousPatternsMiddleware(req: any, res: any, next: any) {
  const requestBody = JSON.stringify(req.body || {});
  const queryString = JSON.stringify(req.query || {});
  
  const bodyViolations = DangerousPatternDetector.detectDangerousPatterns(requestBody);
  const queryViolations = DangerousPatternDetector.detectDangerousPatterns(queryString);
  
  const allViolations = [...bodyViolations, ...queryViolations];
  
  if (allViolations.length > 0) {
    return res.status(400).json({
      error: 'Dangerous governance escape patterns detected',
      violations: allViolations,
      message: 'NULL governance escapes are not allowed in professional ERP systems'
    });
  }
  
  next();
}

export default {
  SecureQueryBuilder,
  getSecureSuppliers,
  getSecureCustomers,
  getSecureInvoices,
  getSecureBills,
  getSecureInventoryTransactions,
  createSecureSupplier,
  createSecureCustomer,
  createSecureInvoice,
  createSecureBill,
  createSecureInventoryTransaction,
  DangerousPatternDetector,
  detectDangerousPatternsMiddleware,
};