
import { supabase } from './supabase';
import { SavingsGoal, GoalMovement } from '../types';

// The optional modal-level note is stored on savings_goals even though the
// base interface does not surface it (kept optional so it stays assignable).
export type CreateGoalPayload = Omit<SavingsGoal, 'id' | 'user_id'> & { note?: string };

export const goalsService = {
  isMissingTableError(error: { code?: string; message?: string } | null): boolean {
    if (!error) return false;
    return error.code === '42P01'
      || (error.message?.includes('does not exist') ?? false)
      || (error.message?.includes('Could not find the table') ?? false); // PostgREST schema-cache miss (HTTP 404)
  },

  // --- Savings goals ---
  async getGoals(userId: string): Promise<SavingsGoal[]> {
    const { data, error } = await supabase
      .from('savings_goals')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  async createGoal(userId: string, goal: CreateGoalPayload): Promise<SavingsGoal> {
    const { data, error } = await supabase
      .from('savings_goals')
      .insert({ ...goal, user_id: userId })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateGoal(userId: string, id: string, patch: Partial<SavingsGoal> & { note?: string }): Promise<void> {
    const { error } = await supabase
      .from('savings_goals')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;
  },

  async deleteGoal(userId: string, id: string): Promise<void> {
    const { error } = await supabase
      .from('savings_goals')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;
  },

  // --- Movements (money in / out per goal) ---
  async getMovements(userId: string): Promise<GoalMovement[]> {
    const { data, error } = await supabase
      .from('goal_movements')
      .select('*')
      .eq('user_id', userId)
      .order('flow_date', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async createMovement(userId: string, movement: Omit<GoalMovement, 'id' | 'user_id'>): Promise<GoalMovement> {
    const { data, error } = await supabase
      .from('goal_movements')
      .insert({ ...movement, user_id: userId })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // Used to attach the generated journal entry id after posting to the ledger
  async updateMovement(userId: string, id: string, patch: Partial<GoalMovement>): Promise<void> {
    const { error } = await supabase
      .from('goal_movements')
      .update(patch)
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;
  },

  async deleteMovement(userId: string, id: string): Promise<void> {
    const { error } = await supabase
      .from('goal_movements')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;
  },
};
