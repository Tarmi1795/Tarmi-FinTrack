
import { supabase } from './supabase';
import { InventoryItem, InventoryMovement, InventorySettings } from '../types';

export const inventoryService = {
  isMissingTableError(error: { code?: string; message?: string } | null): boolean {
    if (!error) return false;
    return error.code === '42P01'
      || (error.message?.includes('does not exist') ?? false)
      || (error.message?.includes('Could not find the table') ?? false);
  },

  // --- Items ---
  async getItems(userId: string): Promise<InventoryItem[]> {
    const { data, error } = await supabase
      .from('inventory_items')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  async createItem(userId: string, item: Omit<InventoryItem, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<InventoryItem> {
    const { data, error } = await supabase
      .from('inventory_items')
      .insert({ ...item, user_id: userId })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateItem(userId: string, id: string, patch: Partial<InventoryItem>): Promise<void> {
    const { error } = await supabase
      .from('inventory_items')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;
  },

  async deleteItem(userId: string, id: string): Promise<void> {
    const { error } = await supabase
      .from('inventory_items')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;
  },

  // --- Movements ---
  async getMovements(userId: string): Promise<InventoryMovement[]> {
    const { data, error } = await supabase
      .from('inventory_movements')
      .select('*')
      .eq('user_id', userId)
      .order('movement_date', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async createMovement(userId: string, movement: Omit<InventoryMovement, 'id' | 'user_id' | 'created_at'>): Promise<InventoryMovement> {
    const { data, error } = await supabase
      .from('inventory_movements')
      .insert({ ...movement, user_id: userId })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateMovement(userId: string, id: string, patch: Partial<InventoryMovement>): Promise<void> {
    const { error } = await supabase
      .from('inventory_movements')
      .update(patch)
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;
  },

  async deleteMovement(userId: string, id: string): Promise<void> {
    const { error } = await supabase
      .from('inventory_movements')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;
  },

  // --- Chart-of-Accounts mapping (Dr/Cr defaults) ---
  async getSettings(userId: string): Promise<InventorySettings | null> {
    const { data, error } = await supabase
      .from('inventory_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  },

  async saveSettings(userId: string, settings: Partial<InventorySettings>): Promise<void> {
    const { error } = await supabase
      .from('inventory_settings')
      .upsert(
        { user_id: userId, ...settings, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );
    if (error) throw error;
  },
};
