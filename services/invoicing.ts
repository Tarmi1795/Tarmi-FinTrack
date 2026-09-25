
import { supabase } from './supabase';
import { Invoice } from '../types';

export const invoicingService = {
  isMissingTableError(error: { code?: string; message?: string } | null): boolean {
    if (!error) return false;
    return error.code === '42P01'
      || (error.message?.includes('does not exist') ?? false)
      || (error.message?.includes('Could not find the table') ?? false); // PostgREST schema-cache miss (HTTP 404)
  },

  // --- Invoices ---
  async getInvoices(userId: string): Promise<Invoice[]> {
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async createInvoice(userId: string, invoice: Omit<Invoice, 'id' | 'user_id'>): Promise<Invoice> {
    const { data, error } = await supabase
      .from('invoices')
      .insert({ ...invoice, user_id: userId })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateInvoice(userId: string, id: string, patch: Partial<Invoice>): Promise<void> {
    const { id: _omitId, user_id: _omitUserId, ...rest } = patch as Invoice & Record<string, unknown>;
    const { error } = await supabase
      .from('invoices')
      .update({ ...rest, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;
  },

  async deleteInvoice(userId: string, id: string): Promise<void> {
    const { error } = await supabase
      .from('invoices')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;
  },

  // Next invoice number: INV-0001, INV-0002, ... based on the max trailing digits
  // across this user's existing invoice numbers.
  async nextInvoiceNo(userId: string): Promise<string> {
    const { data, error } = await supabase
      .from('invoices')
      .select('invoice_no')
      .eq('user_id', userId);
    if (error) throw error;
    let max = 0;
    (data ?? []).forEach((row: { invoice_no?: string | null }) => {
      const match = /(\d+)$/.exec(row.invoice_no ?? '');
      if (match) max = Math.max(max, parseInt(match[1], 10));
    });
    return `INV-${String(max + 1).padStart(4, '0')}`;
  },
};
