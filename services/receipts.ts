
import { supabase } from './supabase';
import { ReceiptAttachment } from '../types';

const RECEIPTS_BUCKET = 'receipts';

function getExtension(file: File): string {
  // Prefer the mime subtype (e.g. 'jpeg' from 'image/jpeg'); fall back to the
  // filename extension, then 'jpg' as a last resort.
  const fromMime = file.type?.split('/')[1];
  if (fromMime) return fromMime.split(';')[0].toLowerCase();
  const fromName = file.name?.includes('.') ? file.name.split('.').pop() : '';
  return (fromName || 'jpg').toLowerCase();
}

export const receiptsService = {
  isMissingTableError(error: { code?: string; message?: string } | null): boolean {
    if (!error) return false;
    return error.code === '42P01'
      || (error.message?.includes('does not exist') ?? false)
      || (error.message?.includes('Could not find the table') ?? false); // PostgREST schema-cache miss (HTTP 404)
  },

  // --- Upload (storage object + metadata row) ---
  async uploadReceipt(userId: string, transactionId: string, file: File): Promise<{ path: string; attachment: ReceiptAttachment }> {
    const path = `${userId}/${transactionId}-${Date.now()}.${getExtension(file)}`;
    const { error: uploadError } = await supabase.storage
      .from(RECEIPTS_BUCKET)
      .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false });
    if (uploadError) throw uploadError;

    const { data, error } = await supabase
      .from('receipts')
      .insert({ user_id: userId, transaction_id: transactionId, storage_path: path })
      .select()
      .single();
    if (error) throw error;
    return { path, attachment: data };
  },

  // --- Attachments for a set of transactions (in-list filter) ---
  async getReceiptsForTransactions(userId: string, txIds: string[]): Promise<ReceiptAttachment[]> {
    if (!txIds.length) return [];
    const { data, error } = await supabase
      .from('receipts')
      .select('*')
      .eq('user_id', userId)
      .in('transaction_id', txIds)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  // --- Short-lived signed URL for previews (10 minutes) ---
  async getSignedUrl(path: string): Promise<string> {
    const { data, error } = await supabase.storage
      .from(RECEIPTS_BUCKET)
      .createSignedUrl(path, 600);
    if (error) throw error;
    return data?.signedUrl ?? '';
  },

  // --- Delete (metadata row first, then the storage object) ---
  async deleteReceipt(userId: string, attachment: ReceiptAttachment): Promise<void> {
    const { error } = await supabase
      .from('receipts')
      .delete()
      .eq('id', attachment.id)
      .eq('user_id', userId);
    if (error) throw error;
    const { error: storageError } = await supabase.storage
      .from(RECEIPTS_BUCKET)
      .remove([attachment.storage_path]);
    if (storageError) throw storageError;
  },
};
