import React, { useState } from 'react';
import { Denomination } from '../types';
import { X, Plus, Trash2, Edit2, Save } from 'lucide-react';
import { supabase } from '../services/supabase';

interface DenominationManagerProps {
  denominations: Denomination[];
  onClose: () => void;
  onUpdate: () => void;
}

export const DenominationManager: React.FC<DenominationManagerProps> = ({ denominations, onClose, onUpdate }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<Partial<Denomination>>({
    currency_code: 'QAR',
    value: 0,
    label: '',
    type: 'bill',
    is_active: true
  });

  const handleSave = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (editingId) {
        const { error } = await supabase
          .from('denominations')
          .update({
            value: formData.value,
            label: formData.label,
            type: formData.type,
            is_active: formData.is_active
          })
          .eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('denominations')
          .insert([{
            ...formData,
            user_id: user.id
          }]);
        if (error) throw error;
      }
      
      setIsAdding(false);
      setEditingId(null);
      onUpdate();
    } catch (error) {
      console.error("Error saving denomination:", error);
      alert("Failed to save denomination");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this denomination?")) return;
    try {
      const { error } = await supabase
        .from('denominations')
        .delete()
        .eq('id', id);
      if (error) throw error;
      onUpdate();
    } catch (error) {
      console.error("Error deleting denomination:", error);
      alert("Failed to delete denomination");
    }
  };

  const toggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('denominations')
        .update({ is_active: !currentStatus })
        .eq('id', id);
      if (error) throw error;
      onUpdate();
    } catch (error) {
      console.error("Error toggling status:", error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-white/10 rounded-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-white/10 flex justify-between items-center bg-gray-800/50">
          <h2 className="text-lg font-bold text-white">Manage Denominations</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {isAdding || editingId ? (
            <div className="space-y-4 bg-gray-800/50 p-4 rounded-xl border border-white/5">
              <h3 className="text-sm font-semibold text-gold-400">{editingId ? 'Edit Denomination' : 'Add New Denomination'}</h3>
              
              <div>
                <label className="block text-xs text-gray-400 mb-1">Label</label>
                <input 
                  type="text" 
                  value={formData.label}
                  onChange={(e) => setFormData({...formData, label: e.target.value})}
                  className="w-full bg-gray-950 border border-white/10 rounded-lg p-2 text-sm text-white focus:border-gold-500 focus:ring-1 focus:ring-gold-500 outline-none"
                  placeholder="e.g., 500 Riyal Bill"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Value</label>
                  <input 
                    type="number" 
                    value={formData.value || ''}
                    onChange={(e) => setFormData({...formData, value: parseFloat(e.target.value)})}
                    className="w-full bg-gray-950 border border-white/10 rounded-lg p-2 text-sm text-white focus:border-gold-500 focus:ring-1 focus:ring-gold-500 outline-none"
                    placeholder="e.g., 500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Type</label>
                  <select 
                    value={formData.type}
                    onChange={(e) => setFormData({...formData, type: e.target.value as 'bill'|'coin'})}
                    className="w-full bg-gray-950 border border-white/10 rounded-lg p-2 text-sm text-white focus:border-gold-500 focus:ring-1 focus:ring-gold-500 outline-none"
                  >
                    <option value="bill">Bill</option>
                    <option value="coin">Coin</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-2">
                <input 
                  type="checkbox" 
                  id="isActive"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
                  className="rounded border-gray-700 bg-gray-900 text-gold-500 focus:ring-gold-500"
                />
                <label htmlFor="isActive" className="text-sm text-gray-300">Active</label>
              </div>

              <div className="flex gap-2 pt-2">
                <button 
                  onClick={() => { setIsAdding(false); setEditingId(null); }}
                  className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSave}
                  disabled={!formData.label || !formData.value}
                  className="flex-1 py-2 bg-gold-600 hover:bg-gold-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Save size={16} /> Save
                </button>
              </div>
            </div>
          ) : (
            <button 
              onClick={() => {
                setFormData({ currency_code: 'QAR', value: 0, label: '', type: 'bill', is_active: true });
                setIsAdding(true);
              }}
              className="w-full py-3 border border-dashed border-white/20 rounded-xl text-gray-400 hover:text-gold-400 hover:border-gold-500/50 hover:bg-gold-500/5 transition-all flex items-center justify-center gap-2 mb-4"
            >
              <Plus size={18} /> Add Denomination
            </button>
          )}

          <div className="space-y-2 mt-4">
            {denominations.sort((a, b) => b.value - a.value).map(d => (
              <div key={d.id} className={`flex items-center justify-between p-3 rounded-xl border ${d.is_active ? 'bg-gray-800/50 border-white/10' : 'bg-gray-900/50 border-white/5 opacity-60'}`}>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">{d.label}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-700 text-gray-300 uppercase">{d.type}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-1">{d.value} {d.currency_code}</div>
                </div>
                
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => toggleActive(d.id, d.is_active)}
                    className={`text-xs px-2 py-1 rounded ${d.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-700 text-gray-400'}`}
                  >
                    {d.is_active ? 'Active' : 'Inactive'}
                  </button>
                  <button 
                    onClick={() => {
                      setFormData(d);
                      setEditingId(d.id);
                      setIsAdding(false);
                    }}
                    className="p-1.5 text-gray-400 hover:text-blue-400 rounded bg-gray-800 hover:bg-gray-700 transition-colors"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button 
                    onClick={() => handleDelete(d.id)}
                    className="p-1.5 text-gray-400 hover:text-red-400 rounded bg-gray-800 hover:bg-gray-700 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
            {denominations.length === 0 && !isAdding && (
              <div className="text-center py-8 text-gray-500 text-sm">
                No denominations found. Add some to get started.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
