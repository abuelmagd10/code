import { SupabaseClient } from '@supabase/supabase-js';

export type PaymentAllocationInput = {
  bill_id?: string;
  invoice_id?: string;
  amount: number;
};

export type SupplierPaymentPayload = {
  company_id: string;
  supplier_id: string;
  payment_amount: number;
  payment_date: string;
  payment_method: string;
  account_id: string;
  branch_id: string;
  currency_code: string;
  exchange_rate: number;
  base_currency_amount: number;
  allocations: PaymentAllocationInput[];
};

export type CustomerPaymentPayload = {
  company_id: string;
  customer_id: string;
  payment_amount: number;
  payment_date: string;
  payment_method: string;
  account_id: string;
  branch_id: string;
  currency_code: string;
  exchange_rate: number;
  base_currency_amount: number;
  reference_number?: string;
  notes?: string;
  allocations: PaymentAllocationInput[]; // Each item has invoice_id + amount
};

export class PaymentService {
  constructor(private supabase: SupabaseClient<any, "public", any>) {}

  /**
   * Enterprise Allocation Engine — Supplier Side
   * Creates a payment and distributes the amount across N linked bills transactionally.
   */
  async createSupplierPaymentWithAllocations(payload: SupplierPaymentPayload): Promise<string> {
    const { data, error } = await this.supabase.rpc('process_supplier_payment_allocation', {
      p_company_id: payload.company_id,
      p_supplier_id: payload.supplier_id,
      p_payment_amount: payload.payment_amount,
      p_payment_date: payload.payment_date,
      p_payment_method: payload.payment_method,
      p_account_id: payload.account_id,
      p_branch_id: payload.branch_id,
      p_currency_code: payload.currency_code,
      p_exchange_rate: payload.exchange_rate,
      p_base_currency_amount: payload.base_currency_amount,
      p_allocations: payload.allocations.length > 0 ? payload.allocations : null,
    });

    if (error) {
      console.error('PaymentService.createSupplierPaymentWithAllocations Error:', error);
      throw error;
    }

    return data as string;
  }

  /**
   * Enterprise Allocation Engine — Customer Side
   * Creates a receipt and distributes across N linked invoices transactionally.
   */
  async createCustomerPaymentWithAllocations(payload: CustomerPaymentPayload): Promise<string> {
    const allocArray = payload.allocations.map(a => ({
      invoice_id: a.invoice_id,
      amount: a.amount,
    }));

    const { data, error } = await this.supabase.rpc('process_customer_payment_allocation', {
      p_company_id: payload.company_id,
      p_customer_id: payload.customer_id,
      p_payment_amount: payload.payment_amount,
      p_payment_date: payload.payment_date,
      p_payment_method: payload.payment_method,
      p_account_id: payload.account_id,
      p_branch_id: payload.branch_id,
      p_currency_code: payload.currency_code,
      p_exchange_rate: payload.exchange_rate,
      p_base_currency_amount: payload.base_currency_amount,
      p_reference_number: payload.reference_number || null,
      p_notes: payload.notes || null,
      p_allocations: allocArray.length > 0 ? allocArray : null,
    });

    if (error) {
      console.error('PaymentService.createCustomerPaymentWithAllocations Error:', error);
      throw error;
    }

    return data as string;
  }

  /**
   * Multi-Level Approval Workflow
   * Progresses a payment through approval stages based on the caller's role.
   */
  async processApprovalStage(paymentId: string, action: 'APPROVE' | 'REJECT', rejectionReason?: string): Promise<void> {
    const { error } = await this.supabase.rpc('process_payment_approval_stage', {
      p_payment_id: paymentId,
      p_action: action,
      p_rejection_reason: rejectionReason || null,
    });

    if (error) {
      console.error('PaymentService.processApprovalStage Error:', error);
      throw error;
    }
  }

  /**
   * Fetch bills for a specific supplier that have remaining balance
   */
  async getOutstandingSupplierBills(companyId: string, supplierId: string) {
    const { data, error } = await this.supabase
      .from('bills')
      .select('id, bill_number, total_amount, paid_amount, returned_amount, bill_date')
      .eq('company_id', companyId)
      .eq('supplier_id', supplierId)
      .not('status', 'in', '("paid","cancelled")')
      .order('bill_date', { ascending: true });

    if (error) throw error;
    
    return (data || []).map(bill => {
      const netTotal = Math.max(Number(bill.total_amount || 0) - Number(bill.returned_amount || 0), 0);
      const outstanding = Math.max(netTotal - Number(bill.paid_amount || 0), 0);
      return { ...bill, netTotal, outstanding };
    }).filter(bill => bill.outstanding > 0);
  }

  /**
   * Fetch invoices for a specific customer that have remaining balance (outstanding receivables)
   */
  async getOutstandingCustomerInvoices(companyId: string, customerId: string, branchFilter?: string | null) {
    let query = this.supabase
      .from('invoices')
      .select('id, invoice_number, total_amount, paid_amount, invoice_date, branch_id')
      .eq('company_id', companyId)
      .eq('customer_id', customerId)
      .not('status', 'in', '("paid","cancelled","draft")')
      .order('invoice_date', { ascending: true });

    if (branchFilter) {
      query = query.eq('branch_id', branchFilter as string);
    }

    const { data, error } = await query;
    if (error) throw error;
    
    return (data || []).map(inv => {
      const outstanding = Math.max(Number(inv.total_amount || 0) - Number(inv.paid_amount || 0), 0);
      return { ...inv, outstanding };
    }).filter(inv => inv.outstanding > 0);
  }
}
